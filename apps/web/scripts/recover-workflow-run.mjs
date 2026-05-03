#!/usr/bin/env node
// One-off recovery for workflow_runs whose step_results got wiped to []
// by the executeWorkflow setState-updater race (fix landed alongside this
// script; see workflow-run-view.tsx executeWorkflow final write). Replays
// the Anthropic Managed Agent session and reconstructs step_results from
// scratch — only the run rows we explicitly target are touched.
//
// Usage:
//   DATABASE_URL=postgres://... ANTHROPIC_API_KEY=sk-ant-... \
//     node apps/web/scripts/recover-workflow-run.mjs --run-id <uuid>
//
// Add --dry-run to print the reconstructed step_results without writing.

import pg from "pg";
import Anthropic from "@anthropic-ai/sdk";

const { Client } = pg;

function parseArgs() {
  const args = process.argv.slice(2);
  let runId = null;
  let dryRun = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--run-id") runId = args[++i];
    else if (args[i] === "--dry-run") dryRun = true;
  }
  if (!runId) {
    console.error("usage: recover-workflow-run.mjs --run-id <uuid> [--dry-run]");
    process.exit(2);
  }
  return { runId, dryRun };
}

async function listSessionEvents(sessionId, anthropic) {
  // Walk the SDK's auto-paginator. /api/workflows/recover hard-caps at 500
  // events (limit:500, single page) which silently truncates longer runs;
  // 5+ min Deep Research sessions easily blow past that. Iterating page by
  // page captures the whole transcript.
  const events = [];
  for await (const event of anthropic.beta.sessions.events.list(sessionId, {
    limit: 500,
    order: "asc",
  })) {
    events.push(event);
  }
  return events;
}

async function listSessionFiles(sessionId, apiKey) {
  const res = await fetch(
    `https://api.anthropic.com/v1/files?session_id=${encodeURIComponent(sessionId)}`,
    {
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "files-api-2025-04-14,managed-agents-2026-04-01",
      },
    }
  );
  if (!res.ok) {
    throw new Error(`session files fetch failed: ${res.status} ${await res.text()}`);
  }
  const body = await res.json();
  return body.data || [];
}

function classifyTool(name) {
  const labels = {
    web_search: { type: "web_search", label: "Searching the web..." },
    web_fetch: { type: "web_fetch", label: "Fetching webpage..." },
    code_execution: { type: "code_execution", label: "Running code..." },
    bash: { type: "code_execution", label: "Running code..." },
    write: { type: "code_execution", label: "Writing file..." },
    read: { type: "code_execution", label: "Reading file..." },
    edit: { type: "code_execution", label: "Editing file..." },
  };
  return labels[name] || { type: name, label: `Using ${name}...` };
}

function reconstructStepResults(events, files, originalStepResults, workflowSteps) {
  // Walk events in order. user.message starts a new step; agent.message
  // text accumulates into the current step's output; agent.tool_use into
  // toolActivity; session.status_idle (non-requires_action) closes a step.
  const stepCount = workflowSteps.length;
  const stepTexts = Array.from({ length: stepCount }, () => []);
  const stepTools = Array.from({ length: stepCount }, () => []);
  const stepIdleAt = Array(stepCount).fill(null);
  const stepStartAt = Array(stepCount).fill(null);

  let cursor = -1;

  for (const event of events) {
    if (event.type === "user.message") {
      cursor++;
      if (cursor < stepCount) stepStartAt[cursor] = event.created_at || null;
    } else if (cursor < 0 || cursor >= stepCount) {
      // events before any user.message, or after last step ended — ignore
      continue;
    } else if (event.type === "agent.message") {
      for (const block of event.content || []) {
        if (block.type === "text" && block.text) stepTexts[cursor].push(block.text);
        if (block.type === "tool_use" || block.type === "server_tool_use") {
          stepTools[cursor].push(classifyTool(block.name || "unknown"));
        }
      }
    } else if (event.type === "agent.tool_use") {
      stepTools[cursor].push(classifyTool(event.name || "unknown"));
    } else if (event.type === "session.status_idle") {
      const stop = event.stop_reason;
      if (stop?.type === "requires_action") continue;
      stepIdleAt[cursor] = event.created_at || null;
    }
  }

  // Heuristic file → step assignment by created_at:
  //   bucket each file into the step whose [start_at, idle_at] window
  //   contains its created_at. Files with no timestamp or no matching
  //   window go to the last completed step (most likely producer).
  const filesPerStep = Array.from({ length: stepCount }, () => []);
  for (const f of files) {
    const ts = f.created_at ? new Date(f.created_at).getTime() : null;
    let assigned = -1;
    if (ts) {
      for (let i = 0; i < stepCount; i++) {
        const s = stepStartAt[i] ? new Date(stepStartAt[i]).getTime() : null;
        const e = stepIdleAt[i] ? new Date(stepIdleAt[i]).getTime() : null;
        if (s && e && ts >= s && ts <= e) { assigned = i; break; }
      }
    }
    if (assigned < 0) {
      // last step that has an idle event
      for (let i = stepCount - 1; i >= 0; i--) {
        if (stepIdleAt[i]) { assigned = i; break; }
      }
    }
    if (assigned >= 0) {
      filesPerStep[assigned].push({ fileId: f.id, filename: f.filename });
    }
  }

  // Build new step_results, preserving stepId from the workflow definition
  // (or falling back to the original row if it ever recorded it).
  const out = [];
  for (let i = 0; i < stepCount; i++) {
    const text = stepTexts[i].join("");
    const idle = stepIdleAt[i] !== null;
    const start = stepStartAt[i] ? new Date(stepStartAt[i]).getTime() : null;
    const end = stepIdleAt[i] ? new Date(stepIdleAt[i]).getTime() : null;
    const durationMs = start && end ? end - start : undefined;
    const status = text.length > 0 || idle ? "success" : "pending";
    const stepId = workflowSteps[i]?.id ?? originalStepResults[i]?.stepId ?? null;
    out.push({
      stepId,
      status,
      ...(text ? { output: text } : {}),
      ...(durationMs ? { durationMs } : {}),
      ...(filesPerStep[i].length > 0 ? { files: filesPerStep[i] } : {}),
      ...(stepTools[i].length > 0 ? { toolActivity: stepTools[i] } : {}),
    });
  }
  return out;
}

async function main() {
  const { runId, dryRun } = parseArgs();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const dbUrl = process.env.DATABASE_URL;
  if (!apiKey) { console.error("ANTHROPIC_API_KEY required"); process.exit(2); }
  if (!dbUrl) { console.error("DATABASE_URL required"); process.exit(2); }

  const anthropic = new Anthropic({ apiKey });

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  const { rows } = await client.query(
    `SELECT wr.id, wr.workflow_id, wr.status, wr.session_id, wr.step_results,
            wr.total_steps, w.steps AS workflow_steps
       FROM workflow_runs wr
       JOIN workflows w ON w.id = wr.workflow_id
      WHERE wr.id = $1`,
    [runId]
  );
  const run = rows[0];
  if (!run) { console.error(`run ${runId} not found`); process.exit(1); }
  if (!run.session_id) { console.error("run has no session_id; nothing to recover from"); process.exit(1); }

  console.log(`[recover] run=${run.id} status=${run.status} session=${run.session_id}`);
  console.log(`[recover] current step_results length: ${(run.step_results || []).length}`);

  console.log("[recover] fetching session events...");
  const events = await listSessionEvents(run.session_id, anthropic);
  console.log(`[recover] got ${events.length} events`);

  console.log("[recover] fetching session files...");
  const files = await listSessionFiles(run.session_id, apiKey);
  console.log(`[recover] got ${files.length} files`);

  const reconstructed = reconstructStepResults(
    events,
    files,
    run.step_results || [],
    run.workflow_steps || []
  );

  console.log("[recover] reconstructed step_results:");
  for (let i = 0; i < reconstructed.length; i++) {
    const s = reconstructed[i];
    console.log(
      `  step ${i + 1}: status=${s.status} output=${(s.output || "").length}ch ` +
      `files=${(s.files || []).length} tools=${(s.toolActivity || []).length} ` +
      `durationMs=${s.durationMs ?? "-"}`
    );
  }

  if (dryRun) {
    console.log("[recover] --dry-run set, no DB write");
    await client.end();
    return;
  }

  await client.query(
    `UPDATE workflow_runs
        SET step_results = $1::jsonb,
            current_step = $2
      WHERE id = $3`,
    [JSON.stringify(reconstructed), reconstructed.length, run.id]
  );
  console.log("[recover] ✅ wrote step_results back to DB");

  await client.end();
}

main().catch((err) => {
  console.error("[recover] failed:", err);
  process.exit(1);
});
