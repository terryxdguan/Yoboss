# Default Workflows with Cached Demo Runs — Design

**Date**: 2026-04-14
**Status**: Approved, ready for implementation plan
**Owner**: @xudongguan

## Problem

A brand-new user lands on `/workflows` and sees an empty page. They don't know what a workflow looks like, what structure a good prompt chain has, or what the output feels like. The current UX is a cold start: they have to imagine the whole thing, build it, run it, and only then see a result.

We have 3 well-crafted workflows in the owner's account with recent successful runs (full step outputs + deliverable files). We want every new user to:

1. See those 3 workflows pre-populated in `/workflows` on first login
2. Be able to edit or delete them freely — they're regular workflows, not system-protected
3. When running with the default topic, see the cached successful output instantly (with a clear "this is a demo" label) instead of paying for a real run they don't need
4. When running with their own custom topic, get a real fresh run

## Constraints & context

- **Deliverable files currently live on Anthropic's Files API** (`client.beta.files.download`), which has a ~30-day retention window. Caching file IDs directly would mean cached runs break silently after Anthropic expires the files. We must persist files under our own control.
- **RLS model**: `workflows` is strictly per-user (`auth.uid() = user_id`, cascade on user deletion). There's no concept of a "system" workflow visible across users.
- **Signup path**: `handle_new_user()` trigger already runs on `auth.users` insert — creates `public.users` row and `streaks` row. It's the natural place to seed defaults.
- **Run view**: `components/workflow/workflow-run-view.tsx` already consumes the execute endpoint's SSE stream. We should reuse that stream rather than introduce a parallel render path.
- **Bootstrap scope**: only 3 source workflows, each with exactly 1 successful run. Small enough that a one-time Node script is adequate; no need for a general admin tool yet.
- **Only new signups get the defaults**. Existing users (owner's own account, any test accounts) do NOT get backfilled. They can manually add via SQL if desired.

## High-level architecture

```
                     ┌──────────────────────────────┐
                     │  workflow_templates (NEW)    │  ← canonical source,
                     │  id, name, description,      │    1 row per default
                     │  steps jsonb, topic,         │
                     │  sort_order                  │
                     └──────────────┬───────────────┘
                                    │
                                    │ template_id FK
                                    │  (SET NULL on delete)
                                    │
         ┌──────────────────────────┴─────────────┐
         │                                        │
         ▼                                        ▼
 ┌─────────────────┐                  ┌────────────────────────────────┐
 │ workflows       │                  │ workflow_template_cached_runs  │
 │ (existing,      │                  │ (NEW)                          │
 │  per-user)      │                  │ template_id PK,                │
 │ + template_id   │                  │ step_results jsonb,            │
 └─────────────────┘                  │ follow_up_messages jsonb,      │
                                      │ total_steps, duration_ms,      │
                                      │ recorded_at                    │
                                      └──────────────┬─────────────────┘
                                                     │
                                                     │ files[].storagePath
                                                     ▼
                                        ┌────────────────────────────┐
                                        │ Supabase Storage bucket    │
                                        │ 'workflow-cached-files'    │
                                        │ (public read)              │
                                        └────────────────────────────┘
```

**Signup flow** (one addition to `handle_new_user()`):
1. Existing: insert profile, streak
2. **NEW**: `INSERT INTO workflows SELECT ... FROM workflow_templates` — user gets their own editable copies with `template_id` set

**Run flow** (modification to `/api/workflows/execute`):
1. Load workflow, check `template_id`
2. If `template_id IS NOT NULL` AND normalized user topic matches template topic → stream a single `cached_run` SSE event with data from `workflow_template_cached_runs`
3. Otherwise → existing live-execution path, unchanged

## Schema

### Migration 019 — template tables + workflows FK

```sql
-- Canonical template definitions. Only service_role writes. Authenticated
-- users can read (so the Run page can fetch topic for cache-match comparison
-- without joining through to the user's workflow row if needed).
CREATE TABLE public.workflow_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  description     text,
  topic           text,                    -- default topic; used for cache matching
  steps           jsonb NOT NULL DEFAULT '[]',
  sort_order      int NOT NULL DEFAULT 0,  -- stable ordering when seeded
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.workflow_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read templates"
  ON public.workflow_templates FOR SELECT
  USING (auth.role() = 'authenticated');

-- Cached run data associated 1:1 with a template. Files inside step_results
-- reference Supabase Storage paths, NOT Anthropic file IDs.
CREATE TABLE public.workflow_template_cached_runs (
  template_id        uuid PRIMARY KEY REFERENCES public.workflow_templates(id) ON DELETE CASCADE,
  step_results       jsonb NOT NULL,        -- same shape as workflow_runs.step_results
  follow_up_messages jsonb,                 -- parity with workflow_runs
  total_steps        int NOT NULL,
  duration_ms        int,                   -- aggregate
  recorded_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.workflow_template_cached_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read cached runs"
  ON public.workflow_template_cached_runs FOR SELECT
  USING (auth.role() = 'authenticated');

-- Link each user-owned workflow copy back to its source template.
-- SET NULL so retiring a template doesn't delete user data across the fleet.
ALTER TABLE public.workflows
  ADD COLUMN IF NOT EXISTS template_id uuid
  REFERENCES public.workflow_templates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_workflows_template_id
  ON public.workflows(template_id);
```

### Migration 020 — extend handle_new_user() to seed defaults

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  -- Existing: user profile + streak
  INSERT INTO public.users (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name',
             NEW.raw_user_meta_data->>'name',
             split_part(NEW.email, '@', 1))
  );
  INSERT INTO public.streaks (user_id) VALUES (NEW.id);

  -- NEW: seed default workflows from workflow_templates.
  -- Each new user gets their own editable copies linked back via template_id.
  INSERT INTO public.workflows (user_id, name, description, steps, topic, template_id, status)
  SELECT NEW.id, t.name, t.description, t.steps, t.topic, t.id, 'ready'
  FROM public.workflow_templates t
  ORDER BY t.sort_order;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Storage bucket (one-time, via Supabase Dashboard or CLI)

- Bucket name: `workflow-cached-files`
- Public: **yes**
- File path convention: `{template_id}/{fileId}-{filename}`
  - `fileId` is the original Anthropic file ID (used for uniqueness; never exposed to client)
  - `filename` preserves the human-readable name
- Policy: anyone can read, only service_role can write

## Bootstrap script: `scripts/bootstrap-workflow-templates.ts`

Runs once against production Supabase (service_role key) + Anthropic API key. Idempotent: re-running it with the same source workflows is a no-op.

### Inputs
- `SUPABASE_SERVICE_ROLE_KEY` (env)
- `SUPABASE_URL` (env)
- `ANTHROPIC_API_KEY` (env)
- `--user-id <uuid>` flag — the account whose workflows we're templatizing (the owner's user_id)

### Flow

1. **Fetch source workflows** from the owner's account:
   ```ts
   const { data: workflows } = await admin
     .from("workflows")
     .select("*")
     .eq("user_id", ownerId)
     .order("created_at");
   ```

2. **For each workflow, fetch its most recent successful run**:
   ```ts
   const { data: run } = await admin
     .from("workflow_runs")
     .select("*")
     .eq("workflow_id", workflow.id)
     .eq("status", "success")
     .order("completed_at", { ascending: false })
     .limit(1)
     .single();
   ```
   If no successful run exists, skip that workflow and log a warning.

3. **Walk `run.step_results[].files` and `run.follow_up_messages[].generatedFiles`**:
   For each file reference:
   - Check `workflow_templates` for an existing template with matching source workflow name — if found, reuse its `id` (idempotency). Otherwise we'll create one in step 5 and use its new UUID.
   - Download bytes from Anthropic: `await client.beta.files.download(fileId)`
   - Upload to Supabase Storage at `{template_id}/{fileId}-{filename}`:
     ```ts
     await admin.storage
       .from("workflow-cached-files")
       .upload(`${templateId}/${fileId}-${filename}`, bytes, {
         contentType: metadata.mime_type,
         upsert: true,
       });
     ```
   - Replace the file reference in the cached step_results payload with:
     ```ts
     { storagePath: `${templateId}/${fileId}-${filename}`,
       filename,
       mimeType: metadata.mime_type }
     ```
     (drop `fileId` — it's no longer valid for the cache consumers)

4. **Sanitize `step_results`**: strip `session_id`, `run_id`, any other user-specific identifiers. Keep `output`, `durationMs`, `toolActivity`, `files` (now with storagePath).

5. **UPSERT into `workflow_templates`** (idempotent by name):
   ```ts
   await admin.from("workflow_templates").upsert({
     name: workflow.name,
     description: workflow.description,
     topic: workflow.topic,
     steps: workflow.steps,
     sort_order: sortOrder++,
   }, { onConflict: "name" });
   ```
   (Requires a unique index on `name` — add to migration 019.)

6. **UPSERT into `workflow_template_cached_runs`** with the rewritten step_results, follow_up_messages, aggregated duration_ms, total_steps, recorded_at = run.completed_at.

7. **Print summary**: `3 templates created, 12 files uploaded (3.4 MB total)`.

### Failure modes

- **Anthropic file 404 during download** (file already expired on source): log the broken file, keep the template, but mark the file as missing in step_results. Banner will still render, files panel will show a "file expired" placeholder. Acceptable degradation.
- **Storage upload fails**: abort the script, report the failing file. Re-run after fixing (script is idempotent).
- **Workflow has no successful run**: skip that workflow, don't create a template. Report at end.

## Data flow at run time

Modify `app/api/workflows/execute/route.ts` (the existing streaming endpoint).

### Request: `POST /api/workflows/execute { workflowId, topic }`

```
┌─ 1. Load workflow by id (RLS → user's own)
│
├─ 2. If workflow.template_id IS NULL:
│       → EXISTING fresh-run path (unchanged)
│
├─ 3. If workflow.template_id IS NOT NULL:
│       │
│       ├─ Normalize + compare:
│       │    norm(topic) === norm(workflow.topic)
│       │    where norm(s) = s.trim().toLowerCase()
│       │
│       ├─ MISMATCH → fresh-run path (unchanged)
│       │
│       └─ MATCH → cached path:
│             │
│             ├─ SELECT * FROM workflow_template_cached_runs
│             │    WHERE template_id = workflow.template_id
│             │
│             ├─ For each file reference in step_results and
│             │  follow_up_messages, construct a public URL:
│             │    https://{SUPABASE_URL}/storage/v1/object/public/
│             │    workflow-cached-files/{storagePath}
│             │  and attach as `href` on the file object.
│             │
│             └─ Return SSE stream with a single event:
│                  event: cached_run
│                  data: { stepResults, followUpMessages,
│                          recordedAt, durationMs, isCached: true }
│                then event: done
```

### Why SSE for a cached response

The existing `workflow-run-view.tsx` already consumes an SSE stream from this endpoint. Adding a single `cached_run` event type reuses that code path end-to-end:
- Server sends one event, then closes
- Client receives it, hydrates state as if a run had just completed
- A `isCached: true` field in the payload flips the banner on

Alternative would be a new `/api/workflows/cached-demo` endpoint with a JSON response, but that forks the client into two render paths. Not worth it.

### No write to `workflow_runs`

Cached demos do NOT insert rows into `workflow_runs`. The cache is ephemeral at request time. Rationale: we don't want to pollute run history with fake rows, and we don't want quota counters to tick up for a cached view.

## UI — the yellow banner

Single component change: `components/workflow/workflow-run-view.tsx`.

**Banner element** (rendered at the top of the run view when `isCached === true`):

```tsx
{isCached && (
  <div className="mb-4 rounded-lg border border-[#D4B06A]/30 bg-[#D4B06A]/10 px-4 py-3 flex items-start gap-2.5">
    <Info className="h-4 w-4 text-[#C99442] mt-0.5 shrink-0" />
    <div className="text-sm text-[#2B2B2B] min-w-0">
      <p className="font-medium">This is a cached demo run</p>
      <p className="text-xs text-[#6F6A64] mt-0.5">
        Your topic matches the default — we're showing you a previous successful output so you can see what this workflow produces. Edit the topic and run again to see it execute on your own input.
      </p>
    </div>
  </div>
)}
```

**SSE consumer change**: the current event loop handles `content_block_delta`, `tool_use`, `message_stop`, etc. Add a new case:

```ts
if (event.type === "cached_run") {
  // One-shot hydrate: populate all chat messages + mark isCached
  setChatMessages(event.data.stepResults.map(toMessage));
  setFollowUpMessages(event.data.followUpMessages ?? []);
  setIsCached(true);
  setIsRunning(false);
  // No further events expected; the server closes after 'done'
}
```

**Deliverables panel**: `generatedFiles` in cached runs have `href` directly (server-constructed Storage URL), no transformation needed client-side. For live runs, `fileId` → `/api/ai/files/{fileId}` path stays as-is.

## Edge cases

| Case | Behavior | Acceptable? |
|---|---|---|
| User edits template workflow's topic | No longer matches cache → fresh run | ✓ intended |
| User edits template workflow's steps, keeps topic | Cache still serves (stale output vs edited steps) | ✓ banner explains it's a demo |
| User deletes their workflow copy | Normal delete, no special handling | ✓ |
| Admin deletes a template row | User copies survive with `template_id = NULL` → cache lookup misses → fresh run | ✓ graceful degradation |
| Admin updates cached run (new demo) | All users see the new cache instantly (1 row in `workflow_template_cached_runs`) | ✓ |
| New user signs up after bootstrap | Trigger seeds from templates → they get 3 defaults | ✓ |
| Existing user (pre-bootstrap) | No backfill; they keep their current state | ✓ per decision |
| Anthropic file 404 during bootstrap | File skipped, other files cached, template created with partial files | ✓ logged warning |
| Template name collision during bootstrap re-run | UPSERT on `name` unique index → idempotent update | ✓ |

## Explicitly not doing (YAGNI)

- Admin UI for editing templates (edit via bootstrap script or SQL)
- Per-user "dismiss this default workflow" tracking (user can just delete their copy)
- Template versioning / history (if you update, you update in place)
- Cache invalidation when template steps change (admin re-runs bootstrap script)
- Cached runs shown as pre-populated "last run" on the workflow list page (cache fetched only at Run time)
- Multiple cached runs per template (1:1 only)
- Backfill for existing users
- Signed URLs / private bucket (public bucket is fine for demo content)

## Migration steps (operational)

1. **Apply migration 019** (new tables + FK)
2. **Create Storage bucket** `workflow-cached-files` with public read policy (manual, via Supabase Dashboard)
3. **Run bootstrap script** with owner's user_id → populates templates, cached runs, uploads files
4. **Apply migration 020** (extend `handle_new_user()`) — done AFTER bootstrap so the trigger has templates to seed from
5. **Deploy app code** with updated execute route + run view banner
6. **Test**: create a new test account → verify 3 workflows appear on `/workflows` → click Run on one → verify banner + cached output → edit topic → verify fresh run works

Ordering matters: migration 020 references `workflow_templates` which only has content after the bootstrap script runs. If migration 020 runs before bootstrap, new signups get nothing seeded (harmless but wrong UX window).

## Open for later

- **Re-caching flow**: if a template's cached run gets stale (e.g. 6 months old and feels dated), how do we refresh it without manual Anthropic + Storage dance? Probably: add a `POST /api/admin/workflows/recache` endpoint, admin-only, that re-runs the template against its own topic live, captures the result, re-uploads files. Deferred until we actually need it.
- **Templatize cached todos / goals too?** Probably a separate design; out of scope here.
