import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/db/server";
import { getOrCreateGoalSession, loadDraftSession } from "@/lib/db/actions";
import { rebuildDraftHistory } from "@/lib/ai/draft-history";
import { getWeekStart } from "@/lib/utils/date";
import { PlanWeekClient } from "@/components/goals/plan-week-client";

export default async function PlanWeekPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: goalId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  // Load goal + active phase server-side so we can build the weekly context.
  const { data: goal } = await supabase
    .from("goals")
    .select("*, phases(*)")
    .eq("id", goalId)
    .eq("user_id", user.id)
    .single();
  if (!goal) notFound();

  const activePhase =
    goal.phases?.find((p: { status: string }) => p.status === "in_progress") ??
    goal.phases?.[0];
  if (!activePhase) notFound();

  // Find or create the unified session for this goal, then rehydrate its
  // message history so the client mounts with the prior conversation
  // visible above the new turn.
  const session = await getOrCreateGoalSession(goalId);
  const loaded = await loadDraftSession(session.id);
  const rebuilt = loaded ? rebuildDraftHistory(loaded.messages) : null;

  return (
    <PlanWeekClient
      goalId={goalId}
      goal={{ title: goal.title, description: goal.description ?? "" }}
      phase={{
        id: activePhase.id,
        title: activePhase.title,
        description: activePhase.description ?? "",
        estimatedWeeks: activePhase.estimated_weeks ?? 4,
      }}
      weekStart={getWeekStart()}
      session={{ id: session.id, rebuilt }}
    />
  );
}
