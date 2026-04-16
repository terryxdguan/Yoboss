# Workflow Step Resume Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** After a client refresh/close during a running workflow step, automatically reconnect to the Anthropic Managed Agent session on remount, replay outstanding events, handle any stuck custom_tool_use, and resume the workflow loop from where it left off.

**Architecture:**
- Server: add `resume: true` branch to `agent-run-step` — reuse session, don't snapshot existing events as seen, don't send new user.message. Poll loop naturally replays history + auto-executes orphan custom_tool_use + streams new events until `session.status_idle`.
- Client: on mount with `existingRun.status === "running"` and a `session_id` present, call the resume path for the running step, then continue the workflow loop for remaining steps.

**Tech Stack:** Next.js App Router, TypeScript, Anthropic SDK Managed Agent sessions API, Server-Sent Events.

**Design doc:** `docs/plans/2026-04-16-workflow-step-resume-design.md`

**Scope exclusions:**
- Workflow follow-up chat recovery (separate concern)
- Goal chat / Team chat recovery (single-turn, completes fast)
- Server-side auto-resume for users who never reopen the page (would need cron)

---

### Task 1: Server — accept `resume` flag and branch session handling

**Files:**
- Modify: `apps/web/src/app/api/ai/agent-run-step/route.ts`

**Step 1: Extend the request body type and read the new field**

Replace the existing body destructure near line 40:

```ts
const {
  sessionId: existingSessionId,
  message,
  rolePromptFile,
  knownFileIds,
  resume,
} = (await request.json()) as {
  sessionId?: string;
  message?: string;
  rolePromptFile?: string;
  knownFileIds?: string[];
  resume?: boolean;
};
```

Note: `message` becomes optional (not sent on resume).

**Step 2: Guard rails for resume mode**

Right after the destructure, add:

```ts
// Resume mode requires an existing session. Sending a fresh message
// without a session is not resumable.
if (resume && !existingSessionId) {
  return NextResponse.json(
    { error: "resume=true requires an existing sessionId" },
    { status: 400 }
  );
}
if (!resume && !message) {
  return NextResponse.json(
    { error: "message is required unless resume=true" },
    { status: 400 }
  );
}
```

**Step 3: Skip fullMessage construction when resuming**

Wrap the existing `FILE_INSTRUCTION` block so it's skipped on resume:

```ts
let fullMessage = "";
if (!resume) {
  const FILE_INSTRUCTION = `\n\nIMPORTANT: When generating ANY file ...`;
  fullMessage = message!;
  if (rolePromptFile) {
    const rolePrompt = await loadPromptFile(rolePromptFile);
    if (rolePrompt) {
      fullMessage = `## Role Instructions\n${rolePrompt}\n\n## Task\n${message}${FILE_INSTRUCTION}`;
    }
  } else {
    fullMessage = message! + FILE_INSTRUCTION;
  }
}
```

**Step 4: Skip event snapshotting and message send on resume**

Inside the `ReadableStream.start`, wrap the existing "snapshot seenIds + send user.message" block so it runs only in non-resume paths:

```ts
// Create or reuse session
let sessionId = existingSessionId;
if (!sessionId) {
  // ... existing create-session logic unchanged ...
}

// snapshot + send user.message only when NOT resuming.
// On resume, leave seenIds empty so the poll loop's first iteration
// treats every historic event as "new" and streams it (plus any
// pending agent.custom_tool_use gets executed automatically).
const seenIds = new Set<string>();
if (!resume) {
  const existing = await client.beta.sessions.events.list(sessionId, {
    limit: 500,
    order: "asc",
  });
  for (const e of existing.data) seenIds.add(e.id);

  console.log(`[ManagedAgent] Sending message to session ${sessionId} (${fullMessage.length} chars)`);
  await client.beta.sessions.events.send(sessionId, {
    events: [
      {
        type: "user.message",
        content: [{ type: "text", text: fullMessage }],
      },
    ],
  });
} else {
  console.log(`[ManagedAgent] Resuming session ${sessionId} — replaying history`);
}
```

**Step 5: Guard usage estimation on resume (fullMessage is empty)**

In the `session.status_idle` handler, the estimate assumes `fullMessage.length`. On resume we don't know the original message length, so just use a zero-input estimate (output tokens are still meaningful):

```ts
const estInputTokens = resume ? 0 : Math.ceil(fullMessage.length / 4);
const estOutputTokens = Math.ceil(fullText.length / 4);
logUsage(user.id, resume ? "agent-run-step-resume" : "agent-run-step", "managed-agent", estInputTokens, estOutputTokens).catch(() => {});
```

**Step 6: Fetch one page to sanity-check resume doesn't 500**

Run: `curl -X POST http://localhost:3000/api/ai/agent-run-step -H "Content-Type: application/json" -d '{"resume":true}' -i`
Expected: `400 Bad Request` with `{"error":"resume=true requires an existing sessionId"}`

Run: `curl -X POST http://localhost:3000/api/ai/agent-run-step -H "Content-Type: application/json" -d '{}' -i`
Expected: `401 Unauthorized` (no auth cookie) — we never reach the validation branch, but the endpoint compiles and runs.

**Step 7: Commit**

```bash
git add apps/web/src/app/api/ai/agent-run-step/route.ts
git commit -m "feat(workflow): accept resume=true on agent-run-step to replay existing sessions"
```

---

### Task 2: Client — extract the SSE consumption from runStep into a shared helper

**Files:**
- Modify: `apps/web/src/components/workflow/workflow-run-view.tsx`

**Context:** `runStep` (around line 301) contains ~180 lines of SSE event handling (parsing events, throttled flush, text accumulation, file detection). We need the same logic for resume. Rather than duplicating, extract the stream-consumption inner logic into a helper used by both.

**Step 1: Identify the fetch + reader block in `runStep`**

The block starts around `const res = await fetch("/api/ai/agent-run-step", ...)` (line ~340) and ends with `return { text, files };` (line ~480). The event-handling `while (true) { reader.read() ... }` loop is what we want to reuse.

**Step 2: Refactor: extract a private helper `consumeAgentStepStream(res, stepIndex, assistantMsgId, signal)`**

Move the existing reader/decoder loop + throttled flush + event dispatch into a helper. It returns `{ text, files }` and takes the accumulators (`tools`, `files`, `knownFileIdsRef`) as closed-over refs or explicit params. Keep it inside the component so it retains access to `setChatMessages`, `setToolStatus`, `cachedMode`, `runIdRef`, `stepResultsRef`.

Suggested shape:

```ts
const consumeAgentStepStream = useCallback(async (
  res: Response,
  stepIndex: number,
  assistantMsgId: string,
  signal: AbortSignal
): Promise<{ text: string; files: GeneratedFile[]; tools: ToolActivity[] }> => {
  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let text = "";
  const tools: ToolActivity[] = [];
  const files: GeneratedFile[] = [];

  // ... copy the entire throttled flush setup + event parsing loop
  // ... from the current runStep body here, UNCHANGED ...

  return { text, files, tools };
}, [cachedMode]);
```

Then in `runStep`, the remaining body becomes: build message → fetch → `await consumeAgentStepStream(res, stepIndex, msgId, signal)` → finalize UI.

**Step 3: Verify the refactor didn't break anything**

Run: `npx tsc -p apps/web/tsconfig.json --noEmit`
Expected: clean (no new errors).

Open the preview or dev environment, kick off a fresh workflow run, confirm Step 1 still streams correctly, tool badges show, final `success` status is written.

**Step 4: Commit**

```bash
git add apps/web/src/components/workflow/workflow-run-view.tsx
git commit -m "refactor(workflow): extract consumeAgentStepStream helper for reuse in resume path"
```

---

### Task 3: Client — add `resumeStep` wrapper

**Files:**
- Modify: `apps/web/src/components/workflow/workflow-run-view.tsx`

**Step 1: Add `resumeStep` next to `runStep`**

```ts
const resumeStep = useCallback(async (
  stepIndex: number,
  sessionIdForResume: string,
  signal: AbortSignal
): Promise<{ text: string; files: GeneratedFile[] }> => {
  const step = workflow.steps[stepIndex];
  const agent = findAgent(step.agentId);
  if (!agent) throw new Error(`Agent ${step.agentId} not found`);

  setAgentStatus(step.agentId, "working");

  // Create the streaming message placeholder — same as runStep.
  const msgId = genId();
  streamingMsgId.current = msgId;
  const stepMsg: ChatMessage = {
    id: msgId,
    type: "step",
    stepIndex,
    agentId: step.agentId,
    agentLabel: agent.label,
    agentAvatar: agent.avatar,
    content: "",
    isStreaming: true,
    toolActivity: [],
    generatedFiles: [],
  };
  setChatMessages((prev) => [...prev, stepMsg]);

  // Call the resume variant of agent-run-step.
  const res = await fetch("/api/ai/agent-run-step", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: sessionIdForResume,
      resume: true,
      knownFileIds: knownFileIdsRef.current,
    }),
    signal,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || `API error: ${res.status}`);
  }

  const { text, files, tools } = await consumeAgentStepStream(res, stepIndex, msgId, signal);

  // Finalize the step message — same pattern as runStep.
  setChatMessages((prev) =>
    prev.map((m) =>
      m.id === msgId
        ? {
            ...m,
            content: text,
            isStreaming: false,
            toolActivity: tools.length > 0 ? tools : undefined,
            generatedFiles: files.length > 0 ? files : undefined,
          }
        : m
    )
  );
  streamingMsgId.current = null;
  setToolStatus(null);
  setAgentStatus(step.agentId, "idle");
  return { text, files };
}, [workflow.steps, consumeAgentStepStream]);
```

**Step 2: Typecheck**

Run: `npx tsc -p apps/web/tsconfig.json --noEmit`
Expected: clean.

**Step 3: Commit**

```bash
git add apps/web/src/components/workflow/workflow-run-view.tsx
git commit -m "feat(workflow): add resumeStep client wrapper for agent-run-step resume path"
```

---

### Task 4: Client — detect resumable run on mount and drive remaining steps

**Files:**
- Modify: `apps/web/src/components/workflow/workflow-run-view.tsx`

**Step 1: Add a `resumeAndContinue` function**

Insert near `executeWorkflow` (around line 512). This builds a minimal replica of `executeWorkflow`'s main loop but starts from the resuming step rather than step 0.

```ts
const resumeAndContinue = useCallback(async (run: WorkflowRun) => {
  if (!run.session_id) return false;

  const runningIdx = run.step_results.findIndex((s) => s.status === "running");
  if (runningIdx < 0) return false;

  // Bind refs for the continuation loop — same as executeWorkflow.
  runIdRef.current = run.id;
  sessionIdRef.current = run.session_id;
  stepResultsRef.current = [...run.step_results];

  const abort = new AbortController();
  abortRef.current = abort;
  const outputs = run.step_results
    .slice(0, runningIdx)
    .filter((r) => r.output)
    .map((r) => r.output!);

  setCurrentStep(runningIdx);
  setIsRunning(true);
  setOverallStatus("running");

  // Step 1: resume the in-flight step.
  try {
    const startTime = Date.now();
    const result = await resumeStep(runningIdx, run.session_id, abort.signal);
    const duration = Date.now() - startTime;
    outputs.push(result.text);

    const updated = [...stepResultsRef.current];
    updated[runningIdx] = {
      ...updated[runningIdx],
      status: "success",
      output: result.text,
      durationMs: duration,
      files: result.files.length > 0 ? result.files : undefined,
    };
    setStepResults([...updated]);
    stepResultsRef.current = [...updated];
    setChatMessages((prev) =>
      prev.map((m) =>
        m.type === "step" && m.stepIndex === runningIdx
          ? { ...m, durationMs: duration }
          : m
      )
    );
    await updateWorkflowRun(run.id, {
      current_step: runningIdx + 1,
      step_results: updated,
    });
  } catch (err) {
    if (abort.signal.aborted) return false;
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    const updated = [...stepResultsRef.current];
    updated[runningIdx] = {
      ...updated[runningIdx],
      status: "failed",
      error: errorMsg,
    };
    setStepResults([...updated]);
    stepResultsRef.current = [...updated];
    setOverallStatus("failed");
    setIsRunning(false);
    try {
      await updateWorkflowRun(run.id, {
        status: "failed",
        step_results: updated,
        completed_at: new Date().toISOString(),
      });
    } catch { /* non-blocking */ }
    return true;
  }

  // Step 2+: run remaining steps via the existing runStep loop.
  // Reuse executeWorkflow logic by iterating here instead of refactoring
  // executeWorkflow (less risk). Sessions are already created, so each
  // subsequent runStep reuses sessionIdRef.current.
  for (let i = runningIdx + 1; i < workflow.steps.length; i++) {
    if (abort.signal.aborted) break;

    setCurrentStep(i);
    setToolStatus(null);
    const updatedResults = [...stepResultsRef.current];
    updatedResults[i] = { ...updatedResults[i], status: "running" };
    setStepResults(updatedResults);
    stepResultsRef.current = updatedResults;
    try {
      await updateWorkflowRun(run.id, {
        current_step: i,
        step_results: updatedResults,
      });
    } catch { /* non-blocking */ }

    const startTime = Date.now();
    try {
      const result = await runStep(i, abort.signal);
      const duration = Date.now() - startTime;
      outputs.push(result.text);
      setChatMessages((prev) =>
        prev.map((m) =>
          m.type === "step" && m.stepIndex === i
            ? { ...m, durationMs: duration }
            : m
        )
      );
      updatedResults[i] = {
        ...updatedResults[i],
        status: "success",
        output: result.text,
        durationMs: duration,
        files: result.files.length > 0 ? result.files : undefined,
      };
      setStepResults([...updatedResults]);
      stepResultsRef.current = [...updatedResults];
      try {
        await updateWorkflowRun(run.id, {
          current_step: i + 1,
          step_results: updatedResults,
        });
      } catch { /* non-blocking */ }
    } catch (err) {
      if (abort.signal.aborted) break;
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      updatedResults[i] = {
        ...updatedResults[i],
        status: "failed",
        error: errorMsg,
      };
      setStepResults([...updatedResults]);
      stepResultsRef.current = [...updatedResults];
      setOverallStatus("failed");
      setIsRunning(false);
      try {
        await updateWorkflowRun(run.id, {
          status: "failed",
          step_results: updatedResults,
          completed_at: new Date().toISOString(),
        });
      } catch { /* non-blocking */ }
      return true;
    }
  }

  // All done.
  const finalResults = [...stepResultsRef.current];
  setOverallStatus("success");
  setIsRunning(false);
  try {
    await updateWorkflowRun(run.id, {
      status: "success",
      current_step: workflow.steps.length,
      step_results: finalResults,
      completed_at: new Date().toISOString(),
    });
    await updateWorkflow(workflow.id, {
      last_run_at: new Date().toISOString(),
      last_run_status: "success",
      status: "ready",
    });
  } catch { /* non-blocking */ }

  if (outputs.length > 0) generateWorkflowSummary(outputs);
  onComplete();
  return true;
}, [workflow, resumeStep, runStep, generateWorkflowSummary, onComplete]);
```

**Step 2: Wire it into the mount effect**

Locate the existing mount effect (around line 855). Change the `isPollingMode` branch to try `resumeAndContinue` first:

Before:
```ts
if (isHistoryMode) { ... return; }
if (!isPollingMode) { executeWorkflow(); }
```

After:
```ts
if (isHistoryMode) { ... return; }

if (isPollingMode && existingRun) {
  // Try to resume the in-flight Anthropic session directly. If there's
  // no session_id, or no running step, or resume throws unexpectedly,
  // we fall through to the existing DB-polling useEffect.
  resumeAndContinue(existingRun).then((handled) => {
    if (!handled) {
      console.log("[WorkflowRunView] Resume not applicable — falling back to DB polling");
    }
  }).catch((err) => {
    console.error("[WorkflowRunView] Resume failed, falling back to DB polling:", err);
  });
  return;
}

if (!isPollingMode) {
  executeWorkflow();
}
```

**Step 3: Make the DB-polling effect skip when resume is active**

The existing DB polling effect (line ~740) still runs when `isPollingMode` is true. If `resumeAndContinue` succeeded, the polling effect would interfere (setting stepResults based on DB state). Add a ref to track whether resume is driving the UI:

```ts
const resumeActiveRef = useRef(false);
```

Set `resumeActiveRef.current = true` at the top of `resumeAndContinue`, and add a guard at the top of the polling `setInterval` callback:

```ts
const pollInterval = setInterval(async () => {
  if (!active || resumeActiveRef.current) return;
  // ... existing logic
});
```

**Step 4: Typecheck and smoke-test**

Run: `npx tsc -p apps/web/tsconfig.json --noEmit`
Expected: clean.

Manual smoke:
1. Start a workflow run with 2+ steps.
2. Mid-step 1, refresh the browser.
3. Expect: page shows step 1 still running, tool badges reappear from DB, within a few seconds "done" arrives, step 2 kicks off automatically.

**Step 5: Commit**

```bash
git add apps/web/src/components/workflow/workflow-run-view.tsx
git commit -m "feat(workflow): resume in-flight runs on mount and continue remaining steps"
```

---

### Task 5: End-to-end manual verification

**Three scenarios to verify manually on the preview/test server:**

**Scenario A — Native-tool-only step**

1. Kick off a workflow whose step 1 only does `web_search` / `code_execution` (e.g., "research X").
2. After tool badges appear and some partial text, hard-refresh the browser.
3. Expect: DOM rehydrates with whatever `step_results` had → within ~2-4s you receive the remaining events as they flow in → step 1 marks `success` → step 2 begins.
4. Success criteria: no `"interrupted"` warning, step 1 final output matches what would have happened without refresh.

**Scenario B — Custom-tool step (generate_image)**

1. Run a workflow step that triggers `generate_image` (PPT Expert template, any agent with image gen).
2. Close the tab right after you see `"Generating image..."` badge.
3. Reopen the page.
4. Expect: server detects orphan `agent.custom_tool_use` → executes `executeCustomTool` → posts `user.custom_tool_result` → session continues → step completes.
5. Success criteria: final output includes the image reference, no stuck "working" state.

**Scenario C — Session finished during disconnect**

1. Start a step that takes ~30s.
2. Close the tab immediately after the fetch kicks off.
3. Wait 2 minutes.
4. Reopen.
5. Expect: session is already `idle` at Anthropic → poll loop's first iteration streams all events including `session.status_idle` → `done` arrives almost instantly → workflow auto-advances.
6. Success criteria: step 1 shows full text + `success` within seconds of reopening.

**If any scenario fails**: do not patch forward. Use @superpowers:systematic-debugging to find the root cause, then return to the failing task.

**Step 1: Run all three scenarios**

Check each off with screenshots or notes.

**Step 2: Commit a verification note**

```bash
git commit --allow-empty -m "test(workflow): verified step resume scenarios A/B/C on preview"
```

---

## Risk Notes

- **Multiple open tabs**: Two tabs on the same resumable run will both call `resume=true` and both poll the same session. The `events.list` call is read-only. Both will also attempt `executeCustomTool` for any orphan custom_tool_use — the tool runs twice but result content is deterministic enough (DALL-E returns a URL, both results get accepted by Anthropic's last-write-wins). Acceptable for now.
- **Session sharing across workflow steps**: The existing architecture creates one Anthropic session per run (first step creates it, subsequent steps reuse via `sessionIdRef.current`). Resume uses the same session_id stored on `workflow_runs.session_id`, so remaining steps on resume share history with the first step (same as non-resume flow).
- **Failed resumeStep**: If resume throws (network, 5xx), we log and fall back to DB polling. The step stays `running` in DB. Worst case: the user refreshes again to retry resume. Not perfect, but acceptable for MVP.

## Done Criteria

All of:
1. Server route emits correct events on `resume=true` with no `user.message` sent.
2. Client mount path detects resumable state, calls resume, and continues the loop.
3. Three scenarios (A/B/C) pass manually.
4. TypeScript clean (`npx tsc -p apps/web/tsconfig.json --noEmit`).
5. Five commits on the branch reflecting the five tasks above.
