/**
 * bootstrap-workflow-templates.ts
 * ────────────────────────────────────────────────────────────────────────────
 * One-shot Node script that exports the owner's source workflows (and their
 * most-recent successful runs) into the `workflow_templates` +
 * `workflow_template_cached_runs` tables, migrating deliverable files from
 * Anthropic's Files API to a public Supabase Storage bucket
 * ("workflow-cached-files").
 *
 * The script is idempotent: re-runs UPSERT by template name and by
 * template_id, and file uploads use `upsert: true`. Source workflows and
 * their `topic` column are NEVER modified.
 *
 * Non-critical failures (Anthropic 404, Storage upload errors, missing
 * template placeholder) are logged as warnings (⚠) and the script continues.
 * In cached step_results, a file that could not be migrated is rewritten to
 * `{ filename, missing: true }` so the UI can render a placeholder instead.
 *
 * See docs/plans/2026-04-14-default-workflows-plan.md Tasks 3.1–3.7 and
 * docs/plans/2026-04-14-default-workflows-design.md for full context.
 *
 * ⚠ RE-RUN FOOTGUN: Anthropic's Files API has ~30-day retention. If you
 * re-run this script more than 30 days after the source workflow runs
 * completed, the original Anthropic files will have been garbage-collected
 * and every file will be marked `{ missing: true }` in the rewritten
 * step_results, overwriting a previously-good cache. Do not re-run late —
 * if you need to refresh, re-execute the source workflows first so the
 * Files API references are fresh.
 *
 * Invocation (run from apps/web so npm dep resolution finds the SDKs):
 *   cd apps/web
 *   SUPABASE_URL=... \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   ANTHROPIC_API_KEY=... \
 *   npx tsx ../../scripts/bootstrap-workflow-templates.ts --user-id <owner-uuid>
 */

import Anthropic from "@anthropic-ai/sdk";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ─── Constants ──────────────────────────────────────────────────────────────

const STORAGE_BUCKET = "workflow-cached-files";

/**
 * Default placeholder topics per workflow name. Must match the hardcoded
 * TOPIC_PLACEHOLDERS in apps/web/src/app/(app)/workflows/page.tsx — these are
 * the strings the owner actually used when producing the cached runs, so
 * they become the cache-match key at run-time.
 */
const TOPIC_PLACEHOLDERS: Record<string, string> = {
  "Viral Social Post":
    "AI breakthroughs this week — which new model, tool, or research paper has the biggest real-world impact and why people should care",
  "Deep Research Report": "The impact of AI on the Gaming Industry in 2026",
  "Competitor Analysis":
    "OpenAI vs Anthropic: The race to build the most capable and safest AI — comparing models, pricing, enterprise adoption, developer experience, and long-term strategy",
};

/**
 * Stable sort_order lookup: derived from TOPIC_PLACEHOLDERS insertion order.
 * Re-runs that skip workflows (e.g., because a successful run is missing) will
 * NOT shift sort_order values for the other templates. Any workflow name not
 * in TOPIC_PLACEHOLDERS falls back to 999 and sorts to the bottom.
 */
const TEMPLATE_ORDER: Record<string, number> = Object.fromEntries(
  Object.keys(TOPIC_PLACEHOLDERS).map((name, i) => [name, i]),
);

// ─── Types ──────────────────────────────────────────────────────────────────

type FileRef = {
  fileId?: string;
  filename?: string;
  storagePath?: string;
  mimeType?: string;
  missing?: boolean;
  [key: string]: unknown;
};

type StepResult = {
  stepId?: string;
  status?: string;
  output?: unknown;
  durationMs?: number;
  files?: FileRef[];
  toolActivity?: unknown;
  [key: string]: unknown;
};

type FollowUpMessage = {
  type?: string;
  content?: unknown;
  generatedFiles?: FileRef[];
  toolActivity?: unknown;
  [key: string]: unknown;
};

type SourceWorkflow = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  steps: unknown;
  topic: string | null;
  created_at: string;
};

type SourceRun = {
  id: string;
  workflow_id: string;
  user_id: string;
  status: string;
  step_results: StepResult[] | null;
  follow_up_messages: FollowUpMessage[] | null;
  total_steps: number;
  started_at: string | null;
  completed_at: string | null;
};

type MigratedFile = {
  storagePath: string;
  mimeType: string;
  bytes: number;
};

// ─── CLI parsing ────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): { userId: string } {
  const idx = argv.indexOf("--user-id");
  if (idx === -1 || !argv[idx + 1]) {
    console.error("✗ Missing required argument: --user-id <owner-uuid>");
    process.exit(1);
  }
  return { userId: argv[idx + 1] };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`✗ Missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/]/g, "_").replace(/\s+/g, "_");
}

/**
 * Download one file from Anthropic's Files API and upload it to Supabase
 * Storage. Returns the migrated file record, or null if the file couldn't
 * be migrated (logs a warning in that case).
 */
async function migrateFileToStorage(
  anthropic: Anthropic,
  supabase: SupabaseClient,
  fileId: string,
  templateId: string,
  fallbackFilename: string | undefined,
): Promise<MigratedFile | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- beta namespace lacks typed metadata helper
    const metadata: any = await (anthropic as any).beta.files.retrieveMetadata(
      fileId,
    );
    const filename: string =
      metadata?.filename ?? fallbackFilename ?? `${fileId}.bin`;
    const mimeType: string = metadata?.mime_type ?? "application/octet-stream";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- beta download returns a Response-like object
    const downloadResponse: any = await (anthropic as any).beta.files.download(
      fileId,
    );
    const arrayBuffer: ArrayBuffer = await downloadResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const safeName = sanitizeFilename(filename);
    const storagePath = `${templateId}/${fileId}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, buffer, { contentType: mimeType, upsert: true });

    if (uploadError) {
      console.warn(
        `⚠ Storage upload failed for file ${fileId} (${filename}): ${uploadError.message}`,
      );
      return null;
    }

    console.log(
      `    ✓ Migrated ${filename} → ${storagePath} (${buffer.byteLength} bytes)`,
    );
    return { storagePath, mimeType, bytes: buffer.byteLength };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `⚠ Failed to migrate Anthropic file ${fileId}: ${message}. Will mark as missing in cached run.`,
    );
    return null;
  }
}

/**
 * Given an array of FileRef objects, return a new array where every entry
 * is either the migrated form ({ storagePath, filename, mimeType }) or the
 * missing form ({ filename, missing: true }). The original `fileId` field
 * is dropped in both cases.
 */
function rewriteFileRefs(
  files: FileRef[] | undefined,
  fileIdMap: Map<string, MigratedFile>,
): FileRef[] | undefined {
  if (!files || !Array.isArray(files)) return files;
  return files.map((file) => {
    const filename = file.filename;
    if (file.fileId && fileIdMap.has(file.fileId)) {
      const migrated = fileIdMap.get(file.fileId)!;
      return {
        storagePath: migrated.storagePath,
        filename,
        mimeType: migrated.mimeType,
      };
    }
    return { filename, missing: true };
  });
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { userId } = parseArgs(process.argv.slice(2));
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const supabaseKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const anthropicKey = requireEnv("ANTHROPIC_API_KEY");

  const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const anthropic = new Anthropic({ apiKey: anthropicKey });

  console.log(`→ Fetching source workflows for user ${userId}`);
  const { data: workflowsRaw, error: workflowsError } = await supabase
    .from("workflows")
    .select("id, user_id, name, description, steps, topic, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (workflowsError) {
    console.error(`✗ Failed to fetch workflows: ${workflowsError.message}`);
    process.exit(1);
  }

  const workflows = (workflowsRaw ?? []) as SourceWorkflow[];
  if (workflows.length === 0) {
    console.error(`✗ No workflows found for user ${userId}. Nothing to do.`);
    process.exit(1);
  }

  console.log(`  Found ${workflows.length} source workflow(s):`);
  for (const wf of workflows) {
    console.log(`    - "${wf.name}" (topic: ${wf.topic ?? "<null>"})`);
  }

  // ─── Build sourceRuns ─────────────────────────────────────────────────────
  type SourceRunEntry = { workflow: SourceWorkflow; run: SourceRun };
  const sourceRuns: SourceRunEntry[] = [];

  for (const wf of workflows) {
    const { data: runRaw, error: runError } = await supabase
      .from("workflow_runs")
      .select(
        "id, workflow_id, user_id, status, step_results, follow_up_messages, total_steps, started_at, completed_at",
      )
      .eq("workflow_id", wf.id)
      .eq("status", "success")
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (runError) {
      console.warn(
        `⚠ Failed to fetch runs for workflow "${wf.name}": ${runError.message}. Skipping.`,
      );
      continue;
    }
    if (!runRaw) {
      console.warn(
        `⚠ No successful run found for workflow "${wf.name}". Skipping.`,
      );
      continue;
    }
    sourceRuns.push({ workflow: wf, run: runRaw as SourceRun });
  }

  if (sourceRuns.length === 0) {
    console.error(`✗ No workflows with successful runs. Nothing to bootstrap.`);
    process.exit(1);
  }

  // ─── Process each source run ─────────────────────────────────────────────
  let templateCount = 0;
  let skippedCount = 0;
  let fileCount = 0;
  let totalBytes = 0;

  for (const { workflow: wf, run } of sourceRuns) {
    console.log(`\n→ Processing "${wf.name}"`);

    // 5a. UPSERT template row
    const placeholder = TOPIC_PLACEHOLDERS[wf.name];
    if (!placeholder) {
      console.warn(
        `⚠ No TOPIC_PLACEHOLDERS entry for "${wf.name}". Writing topic=null; the cache-match key will be missing.`,
      );
    }

    const sortOrder = TEMPLATE_ORDER[wf.name];
    if (sortOrder === undefined) {
      console.warn(
        `⚠ No TEMPLATE_ORDER entry for "${wf.name}". Falling back to sort_order=999 (sorts to bottom).`,
      );
    }
    const resolvedSortOrder = sortOrder ?? 999;

    const { data: templateRow, error: templateError } = await supabase
      .from("workflow_templates")
      .upsert(
        {
          name: wf.name,
          description: wf.description,
          topic: placeholder ?? null,
          steps: wf.steps,
          sort_order: resolvedSortOrder,
        },
        { onConflict: "name" },
      )
      .select("id")
      .single();

    if (templateError || !templateRow) {
      console.warn(
        `  ⚠ failed to upsert template "${wf.name}": ${templateError?.message ?? "no row returned"}. Skipping.`,
      );
      skippedCount += 1;
      continue;
    }

    const templateId = (templateRow as { id: string }).id;
    console.log(
      `  ✓ Template upserted (id=${templateId}, sort_order=${resolvedSortOrder})`,
    );

    // ⚠ RE-RUN FOOTGUN: Anthropic's Files API has ~30-day retention. If this
    // script is re-run more than 30 days after the source workflow runs
    // completed, the fileIds below will 404 and every file will be rewritten
    // to { missing: true }, overwriting a previously-good cache. Do not
    // re-run late — refresh the source runs first.
    // 5b. Extract unique file refs
    const stepResults = (run.step_results ?? []) as StepResult[];
    const followUpMessages = (run.follow_up_messages ?? null) as
      | FollowUpMessage[]
      | null;

    const uniqueFiles = new Map<string, { filename?: string }>();
    for (const step of stepResults) {
      const files = Array.isArray(step.files) ? (step.files as FileRef[]) : [];
      for (const f of files) {
        if (f.fileId && !uniqueFiles.has(f.fileId)) {
          uniqueFiles.set(f.fileId, { filename: f.filename });
        }
      }
    }
    if (followUpMessages) {
      for (const msg of followUpMessages) {
        const files = Array.isArray(msg.generatedFiles)
          ? (msg.generatedFiles as FileRef[])
          : [];
        for (const f of files) {
          if (f.fileId && !uniqueFiles.has(f.fileId)) {
            uniqueFiles.set(f.fileId, { filename: f.filename });
          }
        }
      }
    }

    console.log(`  → Found ${uniqueFiles.size} unique file(s) to migrate`);

    // 5c. Migrate each file
    const fileIdMap = new Map<string, MigratedFile>();
    for (const [fileId, meta] of uniqueFiles) {
      const migrated = await migrateFileToStorage(
        anthropic,
        supabase,
        fileId,
        templateId,
        meta.filename,
      );
      if (migrated) {
        fileIdMap.set(fileId, migrated);
        fileCount += 1;
        totalBytes += migrated.bytes;
      }
    }

    // 5d. Rewrite step_results and follow_up_messages
    const rewrittenStepResults: StepResult[] = stepResults.map((step) => {
      const rewrittenFiles = rewriteFileRefs(step.files, fileIdMap);
      return {
        ...step,
        ...(rewrittenFiles !== undefined ? { files: rewrittenFiles } : {}),
      };
    });

    const rewrittenFollowUps: FollowUpMessage[] | null = followUpMessages
      ? followUpMessages.map((msg) => {
          const rewritten = rewriteFileRefs(msg.generatedFiles, fileIdMap);
          return {
            ...msg,
            ...(rewritten !== undefined
              ? { generatedFiles: rewritten }
              : {}),
          };
        })
      : null;

    // 5e. Compute aggregate duration
    let durationMs: number | null = null;
    if (run.started_at && run.completed_at) {
      const start = new Date(run.started_at).getTime();
      const end = new Date(run.completed_at).getTime();
      if (!Number.isNaN(start) && !Number.isNaN(end)) {
        durationMs = end - start;
      }
    }

    // 5f. UPSERT cached run
    const { error: cacheError } = await supabase
      .from("workflow_template_cached_runs")
      .upsert(
        {
          template_id: templateId,
          step_results: rewrittenStepResults,
          follow_up_messages: rewrittenFollowUps,
          total_steps: run.total_steps,
          duration_ms: durationMs,
          recorded_at: run.completed_at ?? new Date().toISOString(),
        },
        { onConflict: "template_id" },
      );

    if (cacheError) {
      console.warn(
        `  ⚠ failed to upsert cached run for "${wf.name}": ${cacheError.message}. Skipping.`,
      );
      skippedCount += 1;
      continue;
    }

    console.log(`  ✓ Cached run upserted (total_steps=${run.total_steps}, duration_ms=${durationMs ?? "null"})`);
    templateCount += 1;
  }

  // ─── Summary ─────────────────────────────────────────────────────────────
  const totalMb = (totalBytes / (1024 * 1024)).toFixed(2);
  console.log(
    `\n✓ Bootstrap complete. ${templateCount} templates succeeded, ${skippedCount} skipped, ${fileCount} files migrated (${totalMb} MB total).`,
  );
}

main().catch((err) => {
  const message = err instanceof Error ? err.stack ?? err.message : String(err);
  console.error(`✗ Unhandled error: ${message}`);
  process.exit(1);
});
