import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/server";
import { getAnthropicClient, MANAGED_AGENT, listSessionFiles } from "@/lib/ai/client";
import { executeCustomTool } from "@/lib/ai/custom-tools";
import { withRateLimit, logUsage } from "@/lib/ai/rate-limit";
import { readFile } from "fs/promises";
import { join } from "path";

export const maxDuration = 300;

async function loadPromptFile(promptFile: string): Promise<string> {
  const filePath = join(
    process.cwd(),
    "src",
    "lib",
    "ai",
    "agent-prompts",
    promptFile
  );
  try {
    return await readFile(filePath, "utf-8");
  } catch {
    return "";
  }
}

/**
 * Walk the session event list (ordered ascending) from the tail and return
 * the text of the most recent user.message, if any. Used to dedup identical
 * user messages when a client refresh causes a duplicate POST to this route.
 */
function extractLastUserMessageText(events: unknown[]): string | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i] as { type?: string; content?: unknown };
    if (e.type !== "user.message") continue;
    const content = e.content as Array<{ type?: string; text?: string }> | undefined;
    if (!Array.isArray(content)) return null;
    const textBlock = content.find((b) => b?.type === "text");
    return typeof textBlock?.text === "string" ? textBlock.text : null;
  }
  return null;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateCheck = await withRateLimit(user.id, "agent-chat");
  if (!rateCheck.allowed) return rateCheck.response;

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

  const client = getAnthropicClient();
  const encoder = new TextEncoder();

  // Build the full message with optional role instructions.
  // Skipped on resume: we're replaying an already-started session, not sending a new turn.
  let fullMessage = "";
  if (!resume) {
    const FILE_INSTRUCTION = `\n\nIMPORTANT: When generating ANY file (HTML, PDF, PPT, Excel, code files, etc.), you MUST save the file to /mnt/session/outputs/ so the user can download it. For example: write the file to /mnt/session/outputs/filename.html. Always save output files there.`;
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

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
        );
      };

      try {
        // Create or reuse session
        let sessionId = existingSessionId;
        if (!sessionId) {
          console.log(`[ManagedAgent] Creating new session — agent: ${MANAGED_AGENT.agentId}, env: ${MANAGED_AGENT.environmentId}`);
          const session = await client.beta.sessions.create({
            agent: MANAGED_AGENT.agentId,
            environment_id: MANAGED_AGENT.environmentId,
          });
          sessionId = session.id;
          console.log(`[ManagedAgent] Session created: ${sessionId}`);
          send({ type: "session_created", sessionId });
        } else {
          console.log(`[ManagedAgent] Reusing session: ${sessionId}`);
        }

        // Snapshot + send user.message only when NOT resuming. On resume,
        // leave seenIds empty so the poll loop's first iteration treats every
        // historic event as "new" and streams it (plus any pending
        // agent.custom_tool_use gets executed automatically).
        const seenIds = new Set<string>();
        if (!resume) {
          const existing = await client.beta.sessions.events.list(sessionId, {
            limit: 500,
            order: "asc",
          });
          for (const e of existing.data) seenIds.add(e.id);

          // Dedup guard: if the client refreshed mid-fetch, a previous
          // invocation of this route may have already written the exact
          // same user.message into the session before the client aborted.
          // Sending it again would cause Anthropic to queue two identical
          // user turns — the model processes them as separate requests
          // and the step effectively runs twice. Walk the tail of the
          // event list and skip the send if the last user.message matches.
          const lastUserMessageText = extractLastUserMessageText(existing.data);
          if (lastUserMessageText !== null && lastUserMessageText === fullMessage) {
            console.log(`[ManagedAgent] Skipping duplicate user.message to session ${sessionId} — identical to last user.message already in session`);
          } else {
            console.log(`[ManagedAgent] Sending message to session ${sessionId} (${fullMessage.length} chars)`);
            await client.beta.sessions.events.send(sessionId, {
              events: [
                {
                  type: "user.message",
                  content: [{ type: "text", text: fullMessage }],
                },
              ],
            });
          }
        } else {
          console.log(`[ManagedAgent] Resuming session ${sessionId} — replaying history`);
        }

        // Poll for new events
        let fullText = "";
        const POLL_INTERVAL = 2000;
        const MAX_POLLS = 600; // 20 min max

        for (let poll = 0; poll < MAX_POLLS; poll++) {
          await new Promise((r) => setTimeout(r, POLL_INTERVAL));

          const events = await client.beta.sessions.events.list(sessionId, {
            limit: 100,
            order: "desc",
          });

          // Process new events in chronological order
          const newEvents = events.data
            .filter((e) => !seenIds.has(e.id))
            .reverse();

          for (const event of newEvents) {
            seenIds.add(event.id);

            if (event.type === "agent.tool_use") {
              send({ type: "tool_use", name: event.name });
            } else if (event.type === "agent.custom_tool_use") {
              // Custom tool — execute server-side and send result back
              const toolName = (event as { name: string }).name;
              const toolInput = (event as { input: Record<string, unknown> }).input;
              const toolEventId = event.id;
              console.log(`[ManagedAgent] Custom tool call: ${toolName}`, JSON.stringify(toolInput).slice(0, 200));
              send({ type: "tool_use", name: toolName });

              const result = await executeCustomTool(toolName, toolInput);
              console.log(`[ManagedAgent] Custom tool result: is_error=${result.is_error || false}`);

              // Send result back to the session
              await client.beta.sessions.events.send(sessionId, {
                events: [
                  {
                    type: "user.custom_tool_result",
                    custom_tool_use_id: toolEventId,
                    content: result.content as Array<{ type: "text"; text: string }>,
                    is_error: result.is_error || false,
                  },
                ],
              });
            } else if (event.type === "agent.message") {
              for (const block of event.content) {
                if (block.type === "text" && block.text) {
                  fullText += block.text;
                }
              }
              send({ type: "content", text: fullText });
            } else if (event.type === "session.status_idle") {
              // Check if the Agent is waiting for custom tool results
              const stopReason = (event as { stop_reason?: { type: string } }).stop_reason;
              if (stopReason?.type === "requires_action") {
                // Agent is waiting for tool results — continue polling
                console.log("[ManagedAgent] Session requires action — continuing poll");
                continue;
              }

              console.log(`[ManagedAgent] Session idle — response complete (${fullText.length} chars)`);

              // Estimate token usage from text lengths (Managed Agent doesn't return usage)
              const estInputTokens = resume ? 0 : Math.ceil(fullMessage.length / 4);
              const estOutputTokens = Math.ceil(fullText.length / 4);
              logUsage(user.id, resume ? "agent-run-step-resume" : "agent-run-step", "managed-agent", estInputTokens, estOutputTokens).catch(() => {});

              // Check for new files in the session
              const knownSet = new Set(knownFileIds || []);
              try {
                const sessionFiles = await listSessionFiles(sessionId);
                const newFiles = sessionFiles.filter((f) => !knownSet.has(f.id));
                for (const f of newFiles) {
                  console.log(`[ManagedAgent] New file: ${f.filename} (${f.id})`);
                  send({ type: "file", fileId: f.id, filename: f.filename });
                }
              } catch (fileErr) {
                console.error("[ManagedAgent] Failed to list session files:", fileErr);
              }

              send({ type: "done", text: fullText });
              controller.close();
              return;
            }
          }
        }

        // Timeout
        send({ type: "error", message: "Step timed out after 20 minutes" });
        controller.close();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        send({ type: "error", message: msg });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
