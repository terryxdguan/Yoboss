import { NextResponse } from "next/server";
import { createClient } from "@/lib/db/server";

// Exports everything the user has put into the product, as a single JSON
// file — GDPR Art. 20 portability. Operational/billing tables (ai_usage,
// credit_transactions, workflow_runs, notifications, push_subscriptions,
// user_quotas) are intentionally excluded: those are not user-authored
// content, and Stripe is the source of truth for financial records.
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const uid = user.id;

  // Run all reads in parallel — they don't depend on each other and the
  // user is sitting on a spinner.
  const [
    profile,
    memory,
    goals,
    phases,
    weeklyPlans,
    dailyTasks,
    notes,
    deliverables,
    chatSessions,
    todos,
    todoTags,
    workflows,
    streaks,
  ] = await Promise.all([
    supabase.from("users").select("*").eq("id", uid).maybeSingle(),
    supabase.from("user_memory").select("*").eq("user_id", uid),
    supabase.from("goals").select("*").eq("user_id", uid),
    supabase.from("phases").select("*").eq("user_id", uid),
    supabase.from("weekly_plans").select("*").eq("user_id", uid),
    supabase.from("daily_tasks").select("*").eq("user_id", uid),
    supabase.from("goal_notes").select("*").eq("user_id", uid),
    supabase.from("goal_deliverables").select("*").eq("user_id", uid),
    supabase.from("chat_sessions").select("*").eq("user_id", uid),
    supabase.from("todos").select("*").eq("user_id", uid),
    supabase.from("todo_tags").select("*").eq("user_id", uid),
    supabase.from("workflows").select("*").eq("user_id", uid),
    supabase.from("streaks").select("*").eq("user_id", uid),
  ]);

  // Phase tasks live under phases (no user_id of their own); fetch by
  // phase_id list so we don't pull other users' rows.
  const phaseIds = (phases.data ?? []).map((p) => p.id);
  const phaseTasks = phaseIds.length > 0
    ? await supabase.from("phase_tasks").select("*").in("phase_id", phaseIds)
    : { data: [] };

  // Same pattern for chat_messages — keyed by session_id.
  const sessionIds = (chatSessions.data ?? []).map((s) => s.id);
  const chatMessages = sessionIds.length > 0
    ? await supabase.from("chat_messages").select("*").in("session_id", sessionIds)
    : { data: [] };

  const payload = {
    exported_at: new Date().toISOString(),
    user: {
      id: user.id,
      email: user.email,
      created_at: user.created_at,
    },
    profile: profile.data,
    user_memory: memory.data ?? [],
    goals: goals.data ?? [],
    phases: phases.data ?? [],
    phase_tasks: phaseTasks.data ?? [],
    weekly_plans: weeklyPlans.data ?? [],
    daily_tasks: dailyTasks.data ?? [],
    goal_notes: notes.data ?? [],
    goal_deliverables: deliverables.data ?? [],
    chat_sessions: chatSessions.data ?? [],
    chat_messages: chatMessages.data ?? [],
    todos: todos.data ?? [],
    todo_tags: todoTags.data ?? [],
    workflows: workflows.data ?? [],
    streaks: streaks.data ?? [],
  };

  const filename = `yoboss-export-${new Date().toISOString().slice(0, 10)}.json`;
  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
