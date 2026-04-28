import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { dailyEmailEnabled?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body.dailyEmailEnabled !== "boolean") {
    return NextResponse.json({ error: "dailyEmailEnabled must be boolean" }, { status: 400 });
  }

  const { error } = await supabase
    .from("users")
    .update({ daily_email_enabled: body.dailyEmailEnabled })
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, dailyEmailEnabled: body.dailyEmailEnabled });
}
