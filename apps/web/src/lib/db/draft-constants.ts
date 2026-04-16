// Shared constants for goal / weekly plan draft chats.
//
// Lives in its own module because actions.ts is a "use server" file and
// Next only allows async exports from those. Client components that render
// the Continue draft UI import from here.

export const GOAL_DRAFT_AGENT_ID = "__goal-draft__";
export const WEEKLY_DRAFT_AGENT_ID = "__weekly-draft__";
