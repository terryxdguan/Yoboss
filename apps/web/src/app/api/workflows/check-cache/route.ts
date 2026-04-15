// POST /api/workflows/check-cache
// Body: { workflowId: string, topic?: string }
// Response:
//   { cached: false }
//     OR
//   { cached: true, runData: { stepResults, followUpMessages,
//                              totalSteps, durationMs, recordedAt } }
//
// Decides whether to serve a cached demo run instead of executing the
// workflow live. Used by the client's startWorkflow flow:
//   - If cached: client skips /api/workflows/execute and renders the
//     returned runData inline with a "demo" banner.
//   - If not cached: client falls through to the existing live-run path.
//
// Cache-match rule: workflow.template_id is non-null AND the user's
// submitted topic (case-insensitive, trimmed) matches the JOINED
// workflow_templates.topic — NOT the user's own workflows.topic, which
// is intentionally NULL for template-cloned rows so the UI shows the
// TopicInputModal where the user presses Tab to fill in the example.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/server";

// Mime types that browsers can render inline correctly. Everything else
// gets forced to download via Supabase Storage's `?download=` query
// param — without this, HTML files open as raw source (sometimes with
// charset mojibake), markdown shows as plain text, code files dump as
// text walls, etc. None of those are what the user wants from a "click
// to view this deliverable" link.
const INLINE_VIEWABLE_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "application/pdf",
]);

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

export async function POST(request: NextRequest) {
  // (1) auth
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // (2) parse body
  const body = await request.json().catch(() => ({}));
  const workflowId = typeof body.workflowId === "string" ? body.workflowId : null;
  const topic = typeof body.topic === "string" ? body.topic : null;
  if (!workflowId) {
    return NextResponse.json({ error: "workflowId required" }, { status: 400 });
  }

  // (3) load workflow (RLS scopes to current user automatically)
  const { data: workflow, error: wfErr } = await supabase
    .from("workflows")
    .select("id, template_id")
    .eq("id", workflowId)
    .maybeSingle();
  if (wfErr) {
    console.error("[check-cache] workflow lookup failed:", wfErr);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
  if (!workflow) {
    return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  }

  // (4) no template → never cached
  if (!workflow.template_id) {
    return NextResponse.json({ cached: false });
  }

  // (5) load template (for the topic field used as cache-match key)
  const { data: template } = await supabase
    .from("workflow_templates")
    .select("id, topic")
    .eq("id", workflow.template_id)
    .maybeSingle();
  if (!template || !template.topic) {
    // Template was deleted or never had a topic — graceful miss
    return NextResponse.json({ cached: false });
  }

  // (6) topic match check
  if (norm(topic) !== norm(template.topic)) {
    return NextResponse.json({ cached: false });
  }

  // (7) fetch cached run
  const { data: cached } = await supabase
    .from("workflow_template_cached_runs")
    .select("step_results, follow_up_messages, total_steps, duration_ms, recorded_at")
    .eq("template_id", template.id)
    .maybeSingle();
  if (!cached) {
    return NextResponse.json({ cached: false });
  }

  // (8) attach public Storage URLs to file refs in cached step_results
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    console.error("[check-cache] NEXT_PUBLIC_SUPABASE_URL is not set");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }
  const bucketBase = `${supabaseUrl}/storage/v1/object/public/workflow-cached-files`;

  const attachUrl = (file: unknown): unknown => {
    if (!file || typeof file !== "object") return file;
    const f = file as {
      storagePath?: string;
      missing?: boolean;
      filename?: string;
      mimeType?: string;
    };
    if (f.missing || !f.storagePath) return file;
    // Percent-encode each path segment so filenames containing URL-special
    // characters (?, #, &, +, %, unicode) don't break the resulting link.
    // Split-encode-join preserves the templateId/filename separator.
    const encodedPath = f.storagePath.split("/").map(encodeURIComponent).join("/");
    const baseHref = `${bucketBase}/${encodedPath}`;
    // Image and PDF files render fine inline; everything else gets forced
    // to download via Supabase's ?download=<filename> query param so the
    // browser saves the file locally instead of trying to render raw
    // bytes as text.
    const shouldForceDownload = !INLINE_VIEWABLE_MIMES.has((f.mimeType ?? "").toLowerCase());
    const href = shouldForceDownload
      ? `${baseHref}?download=${encodeURIComponent(f.filename ?? "download")}`
      : baseHref;
    return { ...f, href };
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
}
