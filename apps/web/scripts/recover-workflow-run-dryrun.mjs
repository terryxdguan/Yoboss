#!/usr/bin/env node
// Dry-run helper for one-off recovery: fetches Anthropic Managed Agent
// session events + files, reconstructs step_results, prints both a
// human-readable summary AND the full JSON. Does NOT touch the DB —
// the caller writes back via MCP/SQL after eyeballing the output.
//
// Usage:
//   ANTHROPIC_API_KEY=sk-... node recover-workflow-run-dryrun.mjs \
//     --session-id sesn_xxx --steps-json '[{"id":"...","agentId":"..."}]'
//
//   or pass --steps-file <path> for steps JSON from a file.

import { readFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--session-id") out.sessionId = args[++i];
    else if (args[i] === "--steps-json") out.stepsJson = args[++i];
    else if (args[i] === "--steps-file") out.stepsFile = args[++i];
  }
  if (!out.sessionId) throw new Error("--session-id required");
  if (!out.stepsJson && !out.stepsFile) throw new Error("--steps-json or --steps-file required");
  if (out.stepsFile) out.stepsJson = readFileSync(out.stepsFile, "utf8");
  out.workflowSteps = JSON.parse(out.stepsJson);
  return out;
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

async function listAllEvents(anthropic, sessionId) {
  const events = [];
  for await (const e of anthropic.beta.sessions.events.list(sessionId, {
    limit: 500,
    order: "asc",
  })) {
    events.push(e);
  }
  return events;
}

async function listSessionFiles(apiKey, sessionId) {
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
  if (!res.ok) throw new Error(`files list failed: ${res.status} ${await res.text()}`);
  const body = await res.json();
  return body.data || [];
}

function reconstruct(events, files, workflowSteps) {
  // Anthropic events use `processed_at`; files use `created_at`.
  // Step boundaries: each step starts at its own `user.message` and ends
  // at the next `user.message` (the last step ends at the final
  // `session.status_idle` with non-requires_action stop_reason — that's
  // typically the only idle event in a multi-step session, since steps
  // chain back-to-back without idling between them).
  const stepCount = workflowSteps.length;
  const stepTexts = Array.from({ length: stepCount }, () => []);
  const stepTools = Array.from({ length: stepCount }, () => []);
  const stepStartAt = Array(stepCount).fill(null);
  const stepEndAt = Array(stepCount).fill(null);

  let cursor = -1;
  for (const event of events) {
    if (event.type === "user.message") {
      // Close the previous step's window at this user.message
      if (cursor >= 0 && cursor < stepCount && stepEndAt[cursor] === null) {
        stepEndAt[cursor] = event.processed_at || null;
      }
      cursor++;
      if (cursor < stepCount) stepStartAt[cursor] = event.processed_at || null;
    } else if (cursor < 0 || cursor >= stepCount) {
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
      // Use idle as the close timestamp for whichever step is current
      if (cursor >= 0 && cursor < stepCount && stepEndAt[cursor] === null) {
        stepEndAt[cursor] = event.processed_at || null;
      }
    }
  }

  // File → step assignment by [start, end] timestamp window. No fallback
  // bucket — if a file falls outside all windows we'd rather flag it
  // than silently mis-attribute it.
  const filesPerStep = Array.from({ length: stepCount }, () => []);
  const orphanFiles = [];
  for (const f of files) {
    const ts = f.created_at ? new Date(f.created_at).getTime() : null;
    let assigned = -1;
    if (ts) {
      for (let i = 0; i < stepCount; i++) {
        const s = stepStartAt[i] ? new Date(stepStartAt[i]).getTime() : null;
        const e = stepEndAt[i] ? new Date(stepEndAt[i]).getTime() : null;
        if (s && e && ts >= s && ts <= e) { assigned = i; break; }
      }
    }
    if (assigned < 0) {
      orphanFiles.push(f);
      // Fallback: assign to the last step that ran (has end timestamp)
      for (let i = stepCount - 1; i >= 0; i--) {
        if (stepEndAt[i]) { assigned = i; break; }
      }
    }
    if (assigned >= 0) {
      filesPerStep[assigned].push({ fileId: f.id, filename: f.filename });
    }
  }
  if (orphanFiles.length > 0) {
    console.error(`[dryrun] WARNING: ${orphanFiles.length} files outside any step window — assigned to last step:`);
    for (const f of orphanFiles) console.error(`    ${f.created_at} ${f.filename} (${f.id})`);
  }

  const out = [];
  for (let i = 0; i < stepCount; i++) {
    const text = stepTexts[i].join("");
    const start = stepStartAt[i] ? new Date(stepStartAt[i]).getTime() : null;
    const end = stepEndAt[i] ? new Date(stepEndAt[i]).getTime() : null;
    const durationMs = start && end ? end - start : undefined;
    const ran = stepStartAt[i] !== null;
    const status = ran && (text.length > 0 || filesPerStep[i].length > 0 || stepTools[i].length > 0)
      ? "success"
      : (ran ? "success" : "pending");
    out.push({
      stepId: workflowSteps[i].id,
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
  const { sessionId, workflowSteps } = parseArgs();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY required");

  const anthropic = new Anthropic({ apiKey });

  console.error(`[dryrun] fetching events for ${sessionId}...`);
  const events = await listAllEvents(anthropic, sessionId);
  console.error(`[dryrun] events: ${events.length}`);

  console.error("[dryrun] fetching files...");
  const files = await listSessionFiles(apiKey, sessionId);
  console.error(`[dryrun] files: ${files.length}`);

  const reconstructed = reconstruct(events, files, workflowSteps);

  console.error("[dryrun] reconstructed step_results:");
  for (let i = 0; i < reconstructed.length; i++) {
    const s = reconstructed[i];
    console.error(
      `  step ${i + 1} (${workflowSteps[i].agentId}): status=${s.status} ` +
      `output=${(s.output || "").length}ch files=${(s.files || []).length} ` +
      `tools=${(s.toolActivity || []).length} durationMs=${s.durationMs ?? "-"}`
    );
    if (s.files?.length) {
      for (const f of s.files) console.error(`    file: ${f.filename} (${f.fileId})`);
    }
  }

  // Full JSON to stdout (caller can pipe to file or copy)
  process.stdout.write(JSON.stringify(reconstructed));
}

main().catch((err) => { console.error("[dryrun] failed:", err); process.exit(1); });
