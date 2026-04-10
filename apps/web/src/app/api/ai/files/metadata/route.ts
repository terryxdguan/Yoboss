import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/server";
import { getAnthropicClient } from "@/lib/ai/client";

// POST /api/ai/files/metadata — resolve file IDs to filenames
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { fileIds } = (await request.json()) as { fileIds: string[] };

  if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
    return NextResponse.json({ files: {} });
  }

  const client = getAnthropicClient();
  const files: Record<string, string> = {};

  await Promise.all(
    fileIds.map(async (fileId) => {
      try {
        const metadata = await client.beta.files.retrieveMetadata(fileId);
        files[fileId] = metadata.filename || "download";
      } catch {
        files[fileId] = "download";
      }
    })
  );

  return NextResponse.json({ files });
}
