# Default Workflows with Cached Demo Runs — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Seed every new signup with 3 default workflows that already have cached successful run output (including deliverable files), and serve those cached results instantly when the user runs with the default topic. Users can edit/delete the defaults freely. Custom topics run fresh.

**Architecture:** Two new tables (`workflow_templates`, `workflow_template_cached_runs`) hold canonical definitions and cached output. `handle_new_user()` trigger copies templates into per-user `workflows` rows. Deliverable files move from Anthropic's Files API (30-day retention) to a public Supabase Storage bucket we control. At run time, a new `/api/workflows/check-cache` endpoint decides cache-hit vs fresh-run; on cache-hit the client skips execution entirely and hydrates the run view with a synthetic "cached run" shape. A yellow banner communicates cached state.

**Tech Stack:** Next.js 16 (Server Components + Route Handlers), Supabase Postgres + RLS + Storage, Anthropic SDK (for the one-time bootstrap only).

**Reference documents:**
- Design: `docs/plans/2026-04-14-default-workflows-design.md` (committed as `ed5464c`)

**Test framework note:** This codebase has no unit-test infrastructure (no jest/vitest/package.json test script). TDD cycles in this plan are replaced by **manual verification steps** — curl calls, SQL `SELECT` checks, and browser walkthroughs. If the codebase adopts tests later, convert these into real tests. Do NOT introduce a test framework as part of this plan (YAGNI).

**Branch strategy:** Work directly on `main` in the current worktree (matches existing repo workflow — all recent commits go straight to main). Frequent commits between tasks.

---

## Phase 1: Schema — workflow_templates tables

Creates the two new tables and the `template_id` FK on the existing `workflows` table. No application code yet; this is pure schema.

### Task 1.1: Write migration 019 SQL file

**Files:**
- Create: `supabase/migrations/019_workflow_templates.sql`

**Step 1: Write the migration**

```sql
-- Migration 019: canonical workflow templates + cached demo runs
--
-- Gives every new signup a set of starter workflows with pre-recorded
-- successful output (including deliverable files stored in Supabase
-- Storage). See docs/plans/2026-04-14-default-workflows-design.md for
-- context.

-- Canonical template definitions. Only service_role writes; any
-- authenticated user can read.
CREATE TABLE public.workflow_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL UNIQUE,   -- UNIQUE so bootstrap script can UPSERT by name
  description     text,
  topic           text,                   -- default topic; used for cache-match comparison
  steps           jsonb NOT NULL DEFAULT '[]',
  sort_order      int NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.workflow_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read templates"
  ON public.workflow_templates FOR SELECT
  USING (auth.role() = 'authenticated');

-- Cached run data, one row per template. step_results references Supabase
-- Storage paths, not Anthropic file IDs.
CREATE TABLE public.workflow_template_cached_runs (
  template_id        uuid PRIMARY KEY REFERENCES public.workflow_templates(id) ON DELETE CASCADE,
  step_results       jsonb NOT NULL,
  follow_up_messages jsonb,
  total_steps        int NOT NULL,
  duration_ms        int,
  recorded_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.workflow_template_cached_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read cached runs"
  ON public.workflow_template_cached_runs FOR SELECT
  USING (auth.role() = 'authenticated');

-- Link each user's workflow copy back to its source template. SET NULL so
-- retiring a template never destroys user data across the fleet.
ALTER TABLE public.workflows
  ADD COLUMN IF NOT EXISTS template_id uuid
  REFERENCES public.workflow_templates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_workflows_template_id
  ON public.workflows(template_id);
```

**Step 2: Commit the migration file only (not yet applied)**

```bash
git add supabase/migrations/019_workflow_templates.sql
git commit -m "feat(workflows): migration 019 — workflow_templates + cached_runs tables"
```

---

### Task 1.2: Apply migration 019 to Supabase

**Step 1: Open Supabase SQL Editor**

URL: `https://supabase.com/dashboard/project/obvzxczowugvjehoomlp/sql/new`

**Step 2: Paste the full migration content and Run**

Expected output: `Success. No rows returned`

**Step 3: Verify tables exist**

Run in SQL Editor:

```sql
SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'workflow_template%';
```

Expected output: 2 rows — `workflow_templates` and `workflow_template_cached_runs`.

**Step 4: Verify FK and index on workflows**

```sql
SELECT column_name, is_nullable, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'workflows' AND column_name = 'template_id';
```

Expected: 1 row, `template_id`, `YES`, `uuid`.

```sql
SELECT indexname FROM pg_indexes WHERE tablename = 'workflows' AND indexname = 'idx_workflows_template_id';
```

Expected: 1 row.

No commit needed — DB-only change.

---

## Phase 2: Storage bucket setup

Manual infra setup via Supabase Dashboard. One-time.

### Task 2.1: Create public Storage bucket

**Step 1: Open Storage section**

URL: `https://supabase.com/dashboard/project/obvzxczowugvjehoomlp/storage/buckets`

**Step 2: Click "New bucket"**

- Name: `workflow-cached-files`
- Public bucket: **checked**
- File size limit: 50 MB (default is fine)
- Allowed MIME types: leave empty (allow all)

Click "Create bucket".

**Step 3: Verify bucket policy**

After creation, the bucket should automatically get a public-read policy. Verify by running in SQL Editor:

```sql
SELECT policy_name, action
FROM storage.buckets b
LEFT JOIN LATERAL (
  SELECT name as policy_name, 'SELECT' as action
  FROM pg_policies
  WHERE tablename = 'objects' AND schemaname = 'storage'
  AND polname ILIKE '%workflow-cached%'
) p ON true
WHERE b.name = 'workflow-cached-files';
```

If the public read policy isn't present, manually add it via Dashboard → Storage → Policies → New policy → "Allow public read" template, targeting this bucket.

No commit — manual infra.

---

## Phase 3: Bootstrap script — populate templates from owner's workflows

A one-time Node script that exports the owner's 3 workflows + their successful runs into the new template tables, downloading deliverable files from Anthropic and uploading them to Storage.

### Task 3.1: Create script scaffold with env wiring

**Files:**
- Create: `scripts/bootstrap-workflow-templates.ts`

**Step 1: Write the scaffold**

```typescript
// scripts/bootstrap-workflow-templates.ts
//
// One-time bootstrap: export the owner's workflows + successful runs into
// the workflow_templates / workflow_template_cached_runs tables, and
// migrate deliverable files from Anthropic Files API to Supabase Storage.
//
// Usage:
//   SUPABASE_URL=... \
//   SUPABASE_SERVICE_ROLE_KEY=... \
//   ANTHROPIC_API_KEY=... \
//   npx tsx scripts/bootstrap-workflow-templates.ts --user-id <owner-uuid>
//
// Idempotent: UPSERTs by template name, safe to re-run.

import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const BUCKET_NAME = "workflow-cached-files";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !ANTHROPIC_API_KEY) {
  console.error("Missing env vars. Need SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY");
  process.exit(1);
}

const args = process.argv.slice(2);
const userIdIdx = args.indexOf("--user-id");
if (userIdIdx === -1 || !args[userIdIdx + 1]) {
  console.error("Usage: --user-id <owner-uuid>");
  process.exit(1);
}
const OWNER_USER_ID = args[userIdIdx + 1];

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

async function main() {
  console.log(`Bootstrap starting for user ${OWNER_USER_ID}`);
  console.log(`Target bucket: ${BUCKET_NAME}`);

  // Steps 3.2–3.7 fill this in.

  console.log("Done.");
}

main().catch((err) => {
  console.error("Bootstrap failed:", err);
  process.exit(1);
});
```

**Step 2: Install tsx if not present**

```bash
cd apps/web && npm ls tsx 2>&1 | grep tsx || npm install --save-dev tsx
```

Expected: either already present, or installed cleanly.

**Step 3: Run the empty scaffold to verify env wiring**

```bash
cd /Users/xudongguan/AICode/GoalWeek
SUPABASE_URL=<url> \
SUPABASE_SERVICE_ROLE_KEY=<key> \
ANTHROPIC_API_KEY=<key> \
npx tsx scripts/bootstrap-workflow-templates.ts --user-id <owner-uuid>
```

Expected output:
```
Bootstrap starting for user <uuid>
Target bucket: workflow-cached-files
Done.
```

**Step 4: Commit**

```bash
git add scripts/bootstrap-workflow-templates.ts apps/web/package.json apps/web/package-lock.json
git commit -m "feat(workflows): bootstrap script scaffold for default templates"
```

---

### Task 3.2: Fetch source workflows from owner's account

**Files:**
- Modify: `scripts/bootstrap-workflow-templates.ts` — replace the `// Steps 3.2–3.7 fill this in.` comment with the query

**Step 1: Add the fetch**

Replace the placeholder comment in `main()` with:

```typescript
  // 1. Fetch source workflows
  const { data: workflows, error: wfErr } = await supabase
    .from("workflows")
    .select("id, name, description, steps, topic, user_id, created_at")
    .eq("user_id", OWNER_USER_ID)
    .order("created_at", { ascending: true });

  if (wfErr) throw wfErr;
  if (!workflows || workflows.length === 0) {
    console.error(`No workflows found for user ${OWNER_USER_ID}`);
    process.exit(1);
  }

  console.log(`Found ${workflows.length} source workflow(s):`);
  workflows.forEach((w) => console.log(`  - ${w.name} (topic: ${w.topic || "<none>"})`));
```

**Step 2: Run and verify**

```bash
npx tsx scripts/bootstrap-workflow-templates.ts --user-id <owner-uuid>
```

Expected output includes:
```
Found 3 source workflow(s):
  - <name1> (topic: <topic1>)
  - <name2> (topic: <topic2>)
  - <name3> (topic: <topic3>)
```

If any workflow has `topic: <none>`, log a warning — cache matching requires a topic. Do not fail; just skip that workflow later when creating its cached run.

**Step 3: Commit**

```bash
git add scripts/bootstrap-workflow-templates.ts
git commit -m "feat(workflows): bootstrap — fetch source workflows from owner"
```

---

### Task 3.3: For each source workflow, fetch its most recent successful run

**Files:**
- Modify: `scripts/bootstrap-workflow-templates.ts`

**Step 1: Add run fetch loop**

Append after the workflow fetch:

```typescript
  // 2. For each workflow, find its most recent successful run
  type SourceRun = {
    workflow_id: string;
    workflow_name: string;
    topic: string | null;
    description: string | null;
    steps: unknown;
    run: {
      step_results: unknown;
      follow_up_messages: unknown;
      total_steps: number;
      started_at: string;
      completed_at: string | null;
    };
  };
  const sourceRuns: SourceRun[] = [];

  for (const wf of workflows) {
    const { data: run, error: runErr } = await supabase
      .from("workflow_runs")
      .select("step_results, follow_up_messages, total_steps, started_at, completed_at")
      .eq("workflow_id", wf.id)
      .eq("status", "success")
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (runErr) {
      console.warn(`  ⚠ workflow "${wf.name}": error fetching run —`, runErr.message);
      continue;
    }
    if (!run) {
      console.warn(`  ⚠ workflow "${wf.name}": no successful run, skipping`);
      continue;
    }

    sourceRuns.push({
      workflow_id: wf.id,
      workflow_name: wf.name,
      topic: wf.topic,
      description: wf.description,
      steps: wf.steps,
      run,
    });
    console.log(`  ✓ workflow "${wf.name}": run found (${run.total_steps} steps)`);
  }

  if (sourceRuns.length === 0) {
    console.error("No workflows with successful runs. Nothing to bootstrap.");
    process.exit(1);
  }
```

**Step 2: Run and verify**

Expected: each source workflow shows `✓ workflow "X": run found (N steps)`. If any show `⚠ no successful run, skipping`, investigate before proceeding.

**Step 3: Commit**

```bash
git add scripts/bootstrap-workflow-templates.ts
git commit -m "feat(workflows): bootstrap — fetch most recent successful run per workflow"
```

---

### Task 3.4: Helper — walk step_results and extract unique file references

**Files:**
- Modify: `scripts/bootstrap-workflow-templates.ts`

**Step 1: Add helper function before `main()`**

```typescript
/**
 * Walks step_results (and optional follow_up_messages) to extract a flat
 * list of unique file references. Returns {fileId, filename} tuples.
 */
function extractFileRefs(
  stepResults: unknown,
  followUpMessages: unknown
): Array<{ fileId: string; filename: string }> {
  const out = new Map<string, { fileId: string; filename: string }>();

  const maybeAdd = (file: unknown) => {
    if (!file || typeof file !== "object") return;
    const f = file as { fileId?: string; filename?: string };
    if (f.fileId && !out.has(f.fileId)) {
      out.set(f.fileId, { fileId: f.fileId, filename: f.filename || "download" });
    }
  };

  const steps = Array.isArray(stepResults) ? stepResults : [];
  for (const step of steps) {
    const s = step as { files?: unknown[] };
    if (Array.isArray(s.files)) s.files.forEach(maybeAdd);
  }

  const msgs = Array.isArray(followUpMessages) ? followUpMessages : [];
  for (const msg of msgs) {
    const m = msg as { generatedFiles?: unknown[] };
    if (Array.isArray(m.generatedFiles)) m.generatedFiles.forEach(maybeAdd);
  }

  return Array.from(out.values());
}
```

**Step 2: Commit**

```bash
git add scripts/bootstrap-workflow-templates.ts
git commit -m "feat(workflows): bootstrap — helper to extract file refs from run results"
```

---

### Task 3.5: Download files from Anthropic and upload to Supabase Storage

**Files:**
- Modify: `scripts/bootstrap-workflow-templates.ts`

**Step 1: Add helper function before `main()`**

```typescript
/**
 * Download a file from Anthropic Files API, upload to Supabase Storage
 * at {templateId}/{fileId}-{filename}, return the storage path.
 * Throws on network/upload failure. Safe to re-run (upsert: true).
 */
async function migrateFileToStorage(
  templateId: string,
  fileId: string,
  filename: string
): Promise<{ storagePath: string; mimeType: string; sizeBytes: number } | null> {
  try {
    // Get metadata first so we know mime type before downloading
    const metadata = await anthropic.beta.files.retrieveMetadata(fileId);
    const mimeType = metadata.mime_type || "application/octet-stream";

    // Download bytes
    const response = await anthropic.beta.files.download(fileId);
    const buffer = Buffer.from(await response.arrayBuffer());

    // Sanitize filename for storage path (no slashes, spaces → _)
    const safeName = filename.replace(/[/\\]/g, "_").replace(/\s+/g, "_");
    const storagePath = `${templateId}/${fileId}-${safeName}`;

    const { error: uploadErr } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(storagePath, buffer, {
        contentType: mimeType,
        upsert: true,
      });
    if (uploadErr) throw uploadErr;

    return { storagePath, mimeType, sizeBytes: buffer.length };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`    ⚠ file ${fileId} (${filename}): ${msg}`);
    return null;
  }
}
```

**Step 2: Commit**

```bash
git add scripts/bootstrap-workflow-templates.ts
git commit -m "feat(workflows): bootstrap — migrate file helper (Anthropic → Storage)"
```

---

### Task 3.6: Rewrite step_results to replace Anthropic fileIds with storage paths

**Files:**
- Modify: `scripts/bootstrap-workflow-templates.ts`

**Step 1: Add helper function**

```typescript
/**
 * Deep-rewrites file references in step_results and follow_up_messages:
 * every {fileId, filename} becomes {storagePath, filename, mimeType}
 * using the fileIdMap. Files missing from the map (migration failed) get
 * a { missing: true } marker so the UI can show "file expired" placeholder.
 */
function rewriteFileRefs(
  stepResults: unknown,
  followUpMessages: unknown,
  fileIdMap: Map<string, { storagePath: string; mimeType: string }>
): { stepResults: unknown; followUpMessages: unknown } {
  const rewriteFile = (file: unknown): unknown => {
    if (!file || typeof file !== "object") return file;
    const f = file as { fileId?: string; filename?: string };
    if (!f.fileId) return file;
    const mapped = fileIdMap.get(f.fileId);
    if (!mapped) {
      return { filename: f.filename || "download", missing: true };
    }
    return {
      filename: f.filename || "download",
      storagePath: mapped.storagePath,
      mimeType: mapped.mimeType,
    };
  };

  const newSteps = Array.isArray(stepResults)
    ? stepResults.map((step) => {
        const s = step as { files?: unknown[] };
        if (!Array.isArray(s.files)) return step;
        return { ...s, files: s.files.map(rewriteFile) };
      })
    : stepResults;

  const newMsgs = Array.isArray(followUpMessages)
    ? followUpMessages.map((msg) => {
        const m = msg as { generatedFiles?: unknown[] };
        if (!Array.isArray(m.generatedFiles)) return msg;
        return { ...m, generatedFiles: m.generatedFiles.map(rewriteFile) };
      })
    : followUpMessages;

  return { stepResults: newSteps, followUpMessages: newMsgs };
}
```

**Step 2: Commit**

```bash
git add scripts/bootstrap-workflow-templates.ts
git commit -m "feat(workflows): bootstrap — helper to rewrite file refs for cached runs"
```

---

### Task 3.7: Wire the main loop — UPSERT templates + cached runs

**Files:**
- Modify: `scripts/bootstrap-workflow-templates.ts`

**Step 1: Append the main loop after the sourceRuns population**

```typescript
  // 3. UPSERT templates and cached runs
  let sortOrder = 0;
  for (const src of sourceRuns) {
    console.log(`\nProcessing "${src.workflow_name}"...`);

    // 3a. UPSERT template by name (gets the UUID we need for file paths)
    const { data: tpl, error: tplErr } = await supabase
      .from("workflow_templates")
      .upsert(
        {
          name: src.workflow_name,
          description: src.description,
          topic: src.topic,
          steps: src.steps,
          sort_order: sortOrder++,
        },
        { onConflict: "name" }
      )
      .select("id")
      .single();

    if (tplErr || !tpl) {
      console.error(`  ✗ failed to upsert template:`, tplErr?.message);
      continue;
    }
    const templateId = tpl.id;
    console.log(`  ✓ template upserted: ${templateId}`);

    // 3b. Extract + migrate files
    const fileRefs = extractFileRefs(src.run.step_results, src.run.follow_up_messages);
    console.log(`  → ${fileRefs.length} file reference(s) to migrate`);

    const fileIdMap = new Map<string, { storagePath: string; mimeType: string }>();
    let bytesTotal = 0;
    for (const ref of fileRefs) {
      const result = await migrateFileToStorage(templateId, ref.fileId, ref.filename);
      if (result) {
        fileIdMap.set(ref.fileId, { storagePath: result.storagePath, mimeType: result.mimeType });
        bytesTotal += result.sizeBytes;
        console.log(`    ✓ ${ref.filename} (${(result.sizeBytes / 1024).toFixed(1)} KB)`);
      }
    }
    console.log(`  → migrated ${fileIdMap.size}/${fileRefs.length} files (${(bytesTotal / 1024 / 1024).toFixed(2)} MB)`);

    // 3c. Rewrite step_results with new refs
    const rewritten = rewriteFileRefs(src.run.step_results, src.run.follow_up_messages, fileIdMap);

    // 3d. Compute aggregate duration
    const durationMs =
      src.run.completed_at && src.run.started_at
        ? new Date(src.run.completed_at).getTime() - new Date(src.run.started_at).getTime()
        : null;

    // 3e. UPSERT cached run
    const { error: cachedErr } = await supabase
      .from("workflow_template_cached_runs")
      .upsert(
        {
          template_id: templateId,
          step_results: rewritten.stepResults,
          follow_up_messages: rewritten.followUpMessages,
          total_steps: src.run.total_steps,
          duration_ms: durationMs,
          recorded_at: src.run.completed_at || new Date().toISOString(),
        },
        { onConflict: "template_id" }
      );

    if (cachedErr) {
      console.error(`  ✗ failed to upsert cached run:`, cachedErr.message);
      continue;
    }
    console.log(`  ✓ cached run stored`);
  }

  console.log("\n✓ Bootstrap complete.");
```

**Step 2: Run the full bootstrap**

```bash
SUPABASE_URL=<url> \
SUPABASE_SERVICE_ROLE_KEY=<key> \
ANTHROPIC_API_KEY=<key> \
npx tsx scripts/bootstrap-workflow-templates.ts --user-id <owner-uuid>
```

Expected output:
```
Found 3 source workflow(s):
  - <name1> (topic: <topic1>)
  - <name2> ...
  - <name3> ...
  ✓ workflow "<name1>": run found (N steps)
  ✓ workflow "<name2>": run found (N steps)
  ✓ workflow "<name3>": run found (N steps)

Processing "<name1>"...
  ✓ template upserted: <uuid>
  → N file reference(s) to migrate
    ✓ <filename1> (X KB)
    ✓ <filename2> (X KB)
  → migrated N/N files (X.X MB)
  ✓ cached run stored
...
✓ Bootstrap complete.
```

**Step 3: Verify in Supabase SQL editor**

```sql
SELECT id, name, topic, sort_order, length(steps::text) as steps_bytes
FROM public.workflow_templates
ORDER BY sort_order;
```

Expected: 3 rows with non-null names and topics.

```sql
SELECT template_id, total_steps, duration_ms,
       jsonb_array_length(step_results) as step_count,
       recorded_at
FROM public.workflow_template_cached_runs;
```

Expected: 3 rows, step_count > 0, recorded_at matches completed_at from source runs.

**Step 4: Verify files in Storage**

Dashboard → Storage → `workflow-cached-files` bucket. Should see 3 folders (one per template_id) containing the downloaded files.

**Step 5: Spot-check a file download URL**

Pick one file from the bucket, copy its public URL, paste into browser. The file should download/display. If it 404s, check bucket public policy.

**Step 6: Commit**

```bash
git add scripts/bootstrap-workflow-templates.ts
git commit -m "feat(workflows): bootstrap — UPSERT templates + cached runs with migrated files"
```

---

## Phase 4: handle_new_user() trigger extension

Now that templates exist in the DB, extend the signup trigger to seed them into each new user's `workflows` table.

### Task 4.1: Write migration 020 SQL file

**Files:**
- Create: `supabase/migrations/020_seed_default_workflows_on_signup.sql`

**Step 1: Write the migration**

```sql
-- Migration 020: extend handle_new_user() to seed default workflows
--
-- Every new signup gets their own editable copies of every row in
-- workflow_templates, linked back via template_id. If workflow_templates
-- is empty (migration applied before bootstrap ran), this is a no-op and
-- new users see an empty workflows list until templates are populated.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  -- Existing: user profile + streak
  INSERT INTO public.users (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      split_part(NEW.email, '@', 1)
    )
  );
  INSERT INTO public.streaks (user_id) VALUES (NEW.id);

  -- NEW: seed default workflows from templates
  INSERT INTO public.workflows (user_id, name, description, steps, topic, template_id, status)
  SELECT NEW.id, t.name, t.description, t.steps, t.topic, t.id, 'ready'
  FROM public.workflow_templates t
  ORDER BY t.sort_order;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Step 2: Commit migration file**

```bash
git add supabase/migrations/020_seed_default_workflows_on_signup.sql
git commit -m "feat(workflows): migration 020 — seed default workflows on signup"
```

---

### Task 4.2: Apply migration 020

**Step 1: Paste into Supabase SQL Editor and Run**

Expected: `Success. No rows returned`

**Step 2: Verify function was replaced**

```sql
SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'handle_new_user' AND pronamespace = 'public'::regnamespace;
```

Expected: the returned definition includes the `INSERT INTO public.workflows ... FROM public.workflow_templates` block.

No commit needed — already committed in 4.1.

---

### Task 4.3: End-to-end verify by creating a test user

**Step 1: Create a test user via Supabase Auth**

Dashboard → Authentication → Users → Add user → "Create new user" → provide a test email like `bootstrap-test@example.com` with a random password. Don't send invite email (check the skip box).

**Step 2: Verify user profile + streak + workflows were all seeded**

```sql
-- Fetch the test user's id
SELECT id FROM auth.users WHERE email = 'bootstrap-test@example.com';
-- Call this <TEST_UUID> below.

SELECT name, topic, template_id
FROM public.workflows
WHERE user_id = '<TEST_UUID>'
ORDER BY created_at;
```

Expected: 3 rows, each with non-null `template_id`, matching the 3 templates by name.

**Step 3: Verify RLS — test user can read their own workflows but not templates directly (templates require authenticated session, not service role)**

Skip this step; we trust the policy. Spot-check in the UI in Phase 8.

**Step 4: Clean up test user**

Dashboard → Auth → Users → delete `bootstrap-test@example.com` (cascades to `public.users`, `streaks`, `workflows` via FK cascades).

Verify cleanup:

```sql
SELECT count(*) FROM public.workflows WHERE user_id = '<TEST_UUID>';
-- Expected: 0
```

No commit — verification only.

---

## Phase 5: `/api/workflows/check-cache` endpoint

A new POST endpoint the client calls BEFORE `/api/workflows/execute`. Decides cache-hit vs fresh-run, and for cache-hit returns the full run data with public Storage URLs already attached.

### Task 5.1: Create route scaffold

**Files:**
- Create: `apps/web/src/app/api/workflows/check-cache/route.ts`

**Step 1: Write the scaffold**

```typescript
// POST /api/workflows/check-cache
// Body: { workflowId: string, topic?: string }
// Response:
//   { cached: false }
//   OR
//   { cached: true, runData: { stepResults, followUpMessages, totalSteps, durationMs, recordedAt } }
//
// Used by the client's startWorkflow flow to decide whether to fire a
// real execution or show the cached demo run inline.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/server";

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const workflowId = body.workflowId as string | undefined;
  const topic = body.topic as string | undefined;
  if (!workflowId) {
    return NextResponse.json({ error: "workflowId required" }, { status: 400 });
  }

  // Load workflow (RLS ensures it's the user's)
  const { data: workflow } = await supabase
    .from("workflows")
    .select("id, topic, template_id")
    .eq("id", workflowId)
    .single();
  if (!workflow) {
    return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  }

  // Not a template-linked workflow → never cached
  if (!workflow.template_id) {
    return NextResponse.json({ cached: false });
  }

  // Topic mismatch → not cached
  const effectiveTopic = topic ?? workflow.topic;
  if (norm(effectiveTopic) !== norm(workflow.topic)) {
    return NextResponse.json({ cached: false });
  }

  // TODO Task 5.2: fetch cached run + build response
  return NextResponse.json({ cached: false });
}
```

**Step 2: Commit**

```bash
git add apps/web/src/app/api/workflows/check-cache/route.ts
git commit -m "feat(workflows): /api/workflows/check-cache route scaffold"
```

---

### Task 5.2: Implement cache fetch and file URL attachment

**Files:**
- Modify: `apps/web/src/app/api/workflows/check-cache/route.ts`

**Step 1: Replace the TODO with the real cache fetch**

Replace `// TODO Task 5.2: ...` and the placeholder return with:

```typescript
  // Fetch cached run for this template
  const { data: cached } = await supabase
    .from("workflow_template_cached_runs")
    .select("step_results, follow_up_messages, total_steps, duration_ms, recorded_at")
    .eq("template_id", workflow.template_id)
    .maybeSingle();

  if (!cached) {
    return NextResponse.json({ cached: false });
  }

  // Attach public Storage URLs to file refs. Mutates copies, not the DB.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const bucketBase = `${supabaseUrl}/storage/v1/object/public/workflow-cached-files`;

  const attachUrl = (file: unknown): unknown => {
    if (!file || typeof file !== "object") return file;
    const f = file as { storagePath?: string; filename?: string; missing?: boolean; mimeType?: string };
    if (f.missing || !f.storagePath) return file;
    return { ...f, href: `${bucketBase}/${f.storagePath}` };
  };

  const stepResults = Array.isArray(cached.step_results)
    ? cached.step_results.map((step) => {
        const s = step as { files?: unknown[] };
        if (!Array.isArray(s.files)) return step;
        return { ...s, files: s.files.map(attachUrl) };
      })
    : cached.step_results;

  const followUpMessages = Array.isArray(cached.follow_up_messages)
    ? cached.follow_up_messages.map((msg) => {
        const m = msg as { generatedFiles?: unknown[] };
        if (!Array.isArray(m.generatedFiles)) return msg;
        return { ...m, generatedFiles: m.generatedFiles.map(attachUrl) };
      })
    : cached.follow_up_messages;

  return NextResponse.json({
    cached: true,
    runData: {
      stepResults,
      followUpMessages,
      totalSteps: cached.total_steps,
      durationMs: cached.duration_ms,
      recordedAt: cached.recorded_at,
    },
  });
```

**Step 2: Type-check**

```bash
cd /Users/xudongguan/AICode/GoalWeek
npx tsc --noEmit -p apps/web/tsconfig.json 2>&1 | grep check-cache || echo "✓ clean"
```

Expected: `✓ clean`

**Step 3: Manual curl test**

First find a template-linked workflow id (the test user was deleted, so use your own account's workflows if any have `template_id` set — they won't yet, because backfill is disabled. Instead, manually set one for testing):

```sql
-- Pick one of your own workflows and a template, link them temporarily
SELECT w.id as workflow_id, t.id as template_id, w.topic, t.topic
FROM public.workflows w
CROSS JOIN public.workflow_templates t
WHERE w.user_id = '<your-owner-uuid>' AND w.name = t.name
LIMIT 1;

-- Link them
UPDATE public.workflows SET template_id = '<template_id>' WHERE id = '<workflow_id>';
```

Then in the Chrome session that's logged into the app, open DevTools → Console and run:

```javascript
fetch("/api/workflows/check-cache", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ workflowId: "<workflow_id>", topic: "<template topic exactly>" }),
}).then(r => r.json()).then(console.log)
```

Expected: `{ cached: true, runData: { stepResults: [...], ... } }` with file refs containing `href` fields.

Also test the miss case:
```javascript
fetch("/api/workflows/check-cache", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ workflowId: "<workflow_id>", topic: "totally different topic" }),
}).then(r => r.json()).then(console.log)
```

Expected: `{ cached: false }`

**Step 4: Unlink the temporary template_id**

```sql
UPDATE public.workflows SET template_id = NULL WHERE id = '<workflow_id>';
```

**Step 5: Commit**

```bash
git add apps/web/src/app/api/workflows/check-cache/route.ts
git commit -m "feat(workflows): check-cache returns cached run with Storage URLs"
```

---

## Phase 6: Client — branch startWorkflow on cache-hit

Modify `startWorkflow` in `/workflows` page to call `check-cache` first. On cache-hit, skip the execute call and skip creating a `workflow_runs` row; open the run view with a synthetic cached-mode run.

### Task 6.1: Add helper to call check-cache

**Files:**
- Modify: `apps/web/src/app/(app)/workflows/page.tsx`

**Step 1: Find the existing startWorkflow function**

Location: approx L85–107 (search for `const startWorkflow = useCallback`).

**Step 2: Add cache check before the create-run block**

Replace the current `startWorkflow` body with:

```typescript
  const startWorkflow = useCallback(async (wf: Workflow, topic?: string) => {
    try {
      // 1. Check for a cached demo run first (template-linked workflows
      //    with matching topic serve cached output instead of executing).
      const cacheRes = await fetch("/api/workflows/check-cache", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflowId: wf.id, ...(topic ? { topic } : {}) }),
      });
      const cacheData = await cacheRes.json();

      if (cacheData.cached) {
        // Serve cached — skip execute + workflow_runs insert entirely.
        // Build a synthetic run object that workflow-run-view can render.
        const syntheticRun: WorkflowRun = {
          id: `cached-${wf.id}`,             // fake id; never written to DB
          workflow_id: wf.id,
          user_id: "",                        // unused for cached mode
          status: "success",
          current_step: cacheData.runData.totalSteps,
          total_steps: cacheData.runData.totalSteps,
          step_results: cacheData.runData.stepResults,
          follow_up_messages: cacheData.runData.followUpMessages ?? null,
          session_id: null,
          triggered_by: "manual",
          started_at: cacheData.runData.recordedAt,
          completed_at: cacheData.runData.recordedAt,
        };
        setRunningWorkflow({ workflow: wf, run: syntheticRun, cachedMode: true });
        return;
      }

      // 2. Not cached → existing live execution path
      const initialResults = wf.steps.map((s) => ({ stepId: s.id, status: "pending" as const }));
      const run = await createWorkflowRun({
        workflowId: wf.id,
        totalSteps: wf.steps.length,
        stepResults: initialResults,
      });
      await updateWorkflow(wf.id, { status: "running" });

      fetch("/api/workflows/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflowId: wf.id, runId: run.id, ...(topic ? { topic } : {}) }),
      }).catch(console.error);

      setRunningWorkflow({ workflow: wf, run });
    } catch (err) {
      console.error("Failed to start workflow:", err);
    }
  }, []);
```

**Step 3: Update `runningWorkflow` state type to accept `cachedMode`**

Find the state declaration (search for `useState<{ workflow: Workflow; run: WorkflowRun }`) and change to:

```typescript
const [runningWorkflow, setRunningWorkflow] = useState<{
  workflow: Workflow;
  run: WorkflowRun;
  cachedMode?: boolean;
} | null>(null);
```

**Step 4: Pass `cachedMode` to WorkflowRunView**

Find the `<WorkflowRunView` element that consumes `runningWorkflow` (somewhere in the render) and add `cachedMode={runningWorkflow?.cachedMode}` prop. If the JSX passes `runningWorkflow` pieces individually, pattern-match accordingly.

**Step 5: Type-check**

```bash
npx tsc --noEmit -p apps/web/tsconfig.json 2>&1 | grep "workflows/page\|workflow-run-view" || echo "✓ clean"
```

Expected: errors from workflow-run-view.tsx because it doesn't know about `cachedMode` yet — FINE, that's fixed in Phase 7. Confirm the errors are ONLY about the unknown prop.

**Step 6: Commit**

```bash
git add apps/web/src/app/\(app\)/workflows/page.tsx
git commit -m "feat(workflows): client branches to cached-run view when topic matches template"
```

---

## Phase 7: workflow-run-view — cached mode rendering + yellow banner

Make `WorkflowRunView` accept `cachedMode` and bail out of polling + execution when set.

### Task 7.1: Add `cachedMode` prop and bail out of polling effect

**Files:**
- Modify: `apps/web/src/components/workflow/workflow-run-view.tsx`

**Step 1: Find the props interface**

Search for `interface WorkflowRunViewProps` or equivalent. Add the new optional prop:

```typescript
interface WorkflowRunViewProps {
  // ... existing props
  cachedMode?: boolean;
}
```

Destructure it alongside existing props in the function signature.

**Step 2: Bail out of polling effect early**

Find the `useEffect` that starts with `if (!isPollingMode || !existingRun) return;` (approx L656). Change the guard to:

```typescript
useEffect(() => {
  if (cachedMode) return;            // NEW: never poll for cached runs
  if (!isPollingMode || !existingRun) return;
  // ... rest unchanged
}, [/* existing deps */, cachedMode]);
```

Apply the same guard to any other `useEffect` that fires execution or polling (search for `runIdRef.current`, `existingRun.id`, or `fetch("/api/`; if they might fire for a cached synthetic run, add `if (cachedMode) return;` at their top and include `cachedMode` in their deps array).

**Step 3: Hydrate chatMessages from existingRun.step_results on mount (when cachedMode)**

Find where `chatMessages` is populated from `existingRun` (search for `setChatMessages` near the initial effect). For cached mode, we need the full list populated synchronously on first render. If the existing "poll" branch already does this (it rebuilds `msgs` from `run.step_results`), factor out the message-building code into a helper `function buildMessagesFromRun(run: WorkflowRun): ChatMessage[]` and call it in a dedicated `useEffect(() => { if (cachedMode && existingRun) setChatMessages(buildMessagesFromRun(existingRun)); }, [cachedMode, existingRun])`.

**Step 4: Type-check**

```bash
npx tsc --noEmit -p apps/web/tsconfig.json 2>&1 | grep "workflow-run-view\|workflows/page" || echo "✓ clean"
```

Expected: clean now (Phase 6's error about unknown prop should be gone).

**Step 5: Commit**

```bash
git add apps/web/src/components/workflow/workflow-run-view.tsx
git commit -m "feat(workflows): workflow-run-view bails polling in cachedMode"
```

---

### Task 7.2: Add the yellow banner

**Files:**
- Modify: `apps/web/src/components/workflow/workflow-run-view.tsx`

**Step 1: Find the top of the rendered run view JSX**

Look for the outermost `<div className="flex flex-col h-..."` or similar — the main container that wraps the run's header + chat + input area. The banner goes immediately inside that container, above all existing content, so it's the first thing the user sees when a cached run is displayed.

**Step 2: Add the banner**

```tsx
{cachedMode && (
  <div className="mb-4 rounded-lg border border-[#D4B06A]/30 bg-[#D4B06A]/10 px-4 py-3 flex items-start gap-2.5">
    <Info className="h-4 w-4 text-[#C99442] mt-0.5 shrink-0" />
    <div className="text-sm text-[#2B2B2B] min-w-0">
      <p className="font-medium">This is a cached demo run</p>
      <p className="text-xs text-[#6F6A64] mt-0.5">
        Your topic matches the default — we&apos;re showing you a previous successful output so you can see what this workflow produces. Edit the topic and run again to see it execute on your own input.
      </p>
    </div>
  </div>
)}
```

Add `Info` to the lucide-react imports at the top of the file if not already present.

**Step 3: Update file href rendering for cached files**

Find where generated files are rendered (search for `/api/ai/files/`). The existing pattern is probably:

```tsx
<a href={`/api/ai/files/${file.fileId}`} download={file.filename}>
```

Since cached files have a pre-built `href` field (from check-cache attaching the Storage URL), change to:

```tsx
<a
  href={(file as { href?: string }).href ?? `/api/ai/files/${file.fileId}`}
  download={file.filename}
  target={(file as { href?: string }).href ? "_blank" : undefined}
  rel={(file as { href?: string }).href ? "noopener" : undefined}
>
```

`target="_blank"` on Storage URLs because they're cross-origin and the `download` attribute may not trigger a download dialog; the user-facing behavior is "click → open file in new tab, which is fine for docs/images/etc."

**Step 4: Handle "missing" files gracefully**

For files with `{ missing: true }` (Anthropic file was expired during bootstrap), render a disabled placeholder:

```tsx
{(file as { missing?: boolean }).missing ? (
  <span className="text-xs text-[#9B948B] italic">
    {file.filename} (expired)
  </span>
) : (
  <a href={...}>...</a>
)}
```

**Step 5: Type-check**

```bash
npx tsc --noEmit -p apps/web/tsconfig.json 2>&1 | grep "workflow-run-view" || echo "✓ clean"
```

**Step 6: Commit**

```bash
git add apps/web/src/components/workflow/workflow-run-view.tsx
git commit -m "feat(workflows): yellow banner + Storage file refs in cached run view"
```

---

## Phase 8: End-to-end verification

Run through the entire feature as a new user would.

### Task 8.1: Create a test user via signup UI

**Step 1: Open the app in an incognito / private window**

URL: `http://localhost:3000/` (or the preview URL)

**Step 2: Sign up with a test email**

Use an email like `demo-test+<timestamp>@example.com`. Go through the normal signup flow.

**Step 3: Land on dashboard, navigate to `/workflows`**

Expected: **3 workflows** are visible on the page, matching the 3 templates by name, with non-null `topic` text shown.

---

### Task 8.2: Run workflow #1 with default topic → yellow banner appears

**Step 1: Click Run on any of the 3 default workflows**

If the workflow has a preset topic (which it should, since the template has one), the run should start immediately without prompting for a topic.

**Step 2: Observe the run view**

Expected within 1 second:
- A **yellow banner** at the top: "This is a cached demo run"
- All step outputs rendered instantly (not streaming)
- Any deliverable files clickable → open from Supabase Storage

**Step 3: Click a file link**

Expected: file downloads or opens in a new tab, content matches original. (Files served from `<supabase>.supabase.co/storage/v1/object/public/workflow-cached-files/...`)

---

### Task 8.3: Run same workflow with custom topic → fresh run

**Step 1: Click Run again, override the topic**

Find the topic input (on the run trigger) and enter a custom string like "cooking recipes".

**Step 2: Observe**

Expected:
- **No yellow banner**
- Steps stream in one at a time (live execution)
- New `workflow_runs` row created in DB
- Completes normally

---

### Task 8.4: Delete a default workflow — verify deletable

**Step 1: Return to /workflows**

Expected: the 3 default workflows still listed + any fresh runs shown.

**Step 2: Delete one of the default workflows**

Use the workflow card's delete/trash button. Confirm the deletion.

**Step 3: Verify it's gone**

Expected: only 2 workflows remain. Refresh — still 2. Check DB:

```sql
SELECT count(*) FROM public.workflows WHERE user_id = '<test_user_uuid>';
-- Expected: 2
```

Templates should be untouched:

```sql
SELECT count(*) FROM public.workflow_templates;
-- Expected: 3
```

---

### Task 8.5: Clean up test user

Dashboard → Auth → Users → delete test user. Verify cascade:

```sql
SELECT count(*) FROM public.workflows WHERE user_id = '<test_user_uuid>';
-- Expected: 0
```

No commit — this is verification only.

---

### Task 8.6: Final commit — version bump / release note

If the project tracks release notes or version numbers, bump now. Otherwise:

```bash
git log --oneline | head -20
```

Confirm the full chain of commits from Phase 1 through Phase 7 is present and coherent.

---

## Rollback plan

If something goes wrong after deploying:

**Quick kill-switch:** revert migration 020 (set `handle_new_user()` back to pre-migration content). New signups stop getting defaults. Existing users keep their seeded workflows. Cache lookup still works until check-cache endpoint is also disabled.

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, display_name) VALUES (...);
  INSERT INTO public.streaks (user_id) VALUES (NEW.id);
  -- Revert: drop the workflow seeding block
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Full rollback:** DROP the new tables, drop the template_id column. Lose all template data. Safe because it's all additive — no existing columns were changed.

```sql
ALTER TABLE public.workflows DROP COLUMN IF EXISTS template_id;
DROP TABLE IF EXISTS public.workflow_template_cached_runs;
DROP TABLE IF EXISTS public.workflow_templates;
-- Manually delete the Supabase Storage bucket via Dashboard.
```

---

## Summary of commits this plan produces

1. `feat(workflows): migration 019 — workflow_templates + cached_runs tables`
2. `feat(workflows): bootstrap script scaffold for default templates`
3. `feat(workflows): bootstrap — fetch source workflows from owner`
4. `feat(workflows): bootstrap — fetch most recent successful run per workflow`
5. `feat(workflows): bootstrap — helper to extract file refs from run results`
6. `feat(workflows): bootstrap — migrate file helper (Anthropic → Storage)`
7. `feat(workflows): bootstrap — helper to rewrite file refs for cached runs`
8. `feat(workflows): bootstrap — UPSERT templates + cached runs with migrated files`
9. `feat(workflows): migration 020 — seed default workflows on signup`
10. `feat(workflows): /api/workflows/check-cache route scaffold`
11. `feat(workflows): check-cache returns cached run with Storage URLs`
12. `feat(workflows): client branches to cached-run view when topic matches template`
13. `feat(workflows): workflow-run-view bails polling in cachedMode`
14. `feat(workflows): yellow banner + Storage file refs in cached run view`

Roughly 14 commits across 8 phases. Each commit is an atomic, reviewable step.
