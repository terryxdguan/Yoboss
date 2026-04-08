# YoBoss Goal Creation Flow — Implementation Plan

## Overview

Transform the `/goals` page from a static input+examples layout into a conversational goal creation flow. The user types a goal, the AI asks 2-4 clarifying questions rendered as interactive cards, then generates a structured roadmap the user confirms before saving to Supabase.

The design preserves the existing architecture: Claude API with `tool_use`, fetch+ReadableStream streaming via `/api/ai/plan`, and Supabase Server Actions for persistence.

---

## Architecture Decisions

1. **askQuestion via tool_use, not text parsing.** Instead of parsing markdown code fences from text output (fragile, requires regex), define a new `ask_question` tool alongside the existing `create_goal_plan` tool. Claude calls `ask_question` when it wants structured input, and `create_goal_plan` when it has enough context. This gives typed, reliable JSON from the SDK with no parsing ambiguity.

2. **Client-side conversation state.** The chat messages array lives in React state on the goals page. Nothing is persisted until the user confirms the roadmap. This keeps the flow lightweight and avoids a "draft" table.

3. **Single page, two views.** The goals page toggles between "input view" (current hero+input+examples) and "chat view" (conversation thread + interactive cards). No new routes needed.

4. **Streaming for text, non-streaming for tool results.** When Claude streams text (conversational reply), render incrementally. When a tool_use block arrives, parse it client-side and render the appropriate component (AskQuestion card or RoadmapPreview overlay).

5. **System prompt replaces the goal-clarifier skill.** All clarification logic is encoded in the system prompt passed to Claude, with two tools defining the structured output contract.

---

## File Plan

### Files to CREATE (7 files)

```
apps/web/src/components/goals/goal-chat.tsx          — Main chat flow orchestrator
apps/web/src/components/goals/chat-message.tsx        — Individual message bubble (user/assistant)
apps/web/src/components/goals/ask-question-card.tsx   — Interactive question card component
apps/web/src/components/goals/roadmap-preview.tsx     — Phase/todo tree with confirm/edit buttons
apps/web/src/lib/ai/goal-chat-prompt.ts               — System prompt + tool definitions for goal chat
apps/web/src/lib/hooks/use-goal-chat.ts               — Custom hook: manages messages, streaming, tool handling
apps/web/src/lib/types/goal-chat.ts                   — TypeScript types for the chat flow
```

### Files to MODIFY (3 files)

```
apps/web/src/app/(app)/goals/page.tsx                 — Wire up GoalChat component, toggle views
apps/web/src/app/api/ai/plan/route.ts                 — Handle tool_use responses in streaming
apps/web/src/lib/ai/decompose.ts                      — Update system prompt, add ask_question tool
```

---

## Step-by-Step Implementation

### Step 1: Define Types (`apps/web/src/lib/types/goal-chat.ts`)

Create shared types for the entire flow:

```typescript
// Message in the conversation thread
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;               // text content (may be empty if tool_use only)
  toolUse?: AskQuestionData | null;  // if assistant used ask_question tool
  plan?: GoalPlanData | null;        // if assistant used create_goal_plan tool
}

// ask_question tool output shape
export interface AskQuestionData {
  question: string;
  options: {
    label: string;
    value: string;
  }[];
  allow_multiple: boolean;       // true = checkbox, false = radio
  allow_other: boolean;          // show "Other" with text input
}

// create_goal_plan tool output shape (extends existing DecomposedGoal)
export interface GoalPlanData {
  goal_title: string;
  goal_description: string;
  phases: {
    title: string;
    description: string;
    estimated_weeks: number;
    todos?: {                    // optional sub-tasks per phase
      title: string;
      priority: "high" | "medium" | "low";
    }[];
  }[];
}

// What the user sends back after answering a question
export interface UserAnswer {
  question: string;
  selected: string[];            // selected option values
  other_text?: string;           // if "Other" was chosen
}

// Chat flow state machine
export type GoalChatStage = "input" | "chatting" | "preview" | "saving" | "done";
```

### Step 2: System Prompt & Tools (`apps/web/src/lib/ai/goal-chat-prompt.ts`)

Create a dedicated module for the goal chat system prompt and both tool definitions. This separates the chat-specific prompt from the existing `decompose.ts` (which can remain for direct decomposition without chat).

**System prompt strategy:**
- Instruct Claude to call `ask_question` for 2-3 rounds of clarifying questions
- Each call should produce 3-5 options relevant to the question
- After sufficient context, call `create_goal_plan` with the full roadmap
- If user says "just do it" or similar, skip remaining questions

**Two tool definitions:**

1. `ask_question` — Called when Claude needs user input. Schema:
   - `question` (string): The question text
   - `options` (array of {label, value}): Selectable options
   - `allow_multiple` (boolean): Checkbox vs radio
   - `allow_other` (boolean): Include "Other" option

2. `create_goal_plan` — Called when Claude has enough context. Schema: Same as existing `DECOMPOSE_TOOL` in `decompose.ts`, extended with optional `todos` array per phase.

**Key prompt content:**
```
You are YoBoss, an AI goal coach. When a user describes a goal:

1. FIRST call ask_question to learn about their starting point (beginner/intermediate/advanced)
2. THEN call ask_question to learn about their timeline and commitment level
3. OPTIONALLY call ask_question about success metrics or specific constraints
4. FINALLY call create_goal_plan with a structured roadmap of 3-6 phases

Rules:
- Ask at most 3 questions total (2 minimum)
- Each question should have 3-5 concrete options
- Keep a warm, encouraging tone
- Include a brief text message before each ask_question call
- When the user indicates impatience, proceed with what you have
- Phases should build progressively from foundation to mastery
```

### Step 3: Custom Hook (`apps/web/src/lib/hooks/use-goal-chat.ts`)

This hook encapsulates all chat logic. It manages:

**State:**
- `messages: ChatMessage[]` — conversation history
- `stage: GoalChatStage` — current flow state
- `isStreaming: boolean` — whether AI is currently responding
- `plan: GoalPlanData | null` — the generated plan (when ready)

**Key functions:**

`sendMessage(text: string)` — Adds user message to state, POSTs to `/api/ai/plan` with `action: "chat"`, reads the streaming response. As chunks arrive:
  - Text content: append to last assistant message
  - `tool_use` block with `ask_question`: set `toolUse` on the assistant message, render card
  - `tool_use` block with `create_goal_plan`: set `plan`, transition stage to `"preview"`

`answerQuestion(answer: UserAnswer)` — Formats the answer as a user message (e.g., `[USER_ANSWER] {"question": "...", "selected": [...]}`) and calls `sendMessage` with it.

`confirmPlan()` — Transitions to `"saving"` stage. Calls Server Actions: `createGoal()` then `createPhases()`. On success, transitions to `"done"` and navigates to the new goal's dashboard.

`editPlan()` — Returns to `"chatting"` stage with a user message like "I'd like to adjust the plan" so Claude can re-engage.

**Stream parsing approach:**
The Anthropic SDK's `stream.toReadableStream()` emits Server-Sent Events. On the client, read the stream with a `ReadableStream` reader, accumulate text deltas, and detect `content_block_start` events of type `tool_use` to identify tool calls. When a tool_use block's JSON is complete (`content_block_stop`), parse the input and dispatch accordingly.

**Important detail:** The existing `/api/ai/plan` route returns `stream.toReadableStream()` which emits the raw Anthropic SSE format. The client hook needs to parse these SSE events. The format is:
- `event: content_block_start` with `content_block.type === "text"` or `"tool_use"`
- `event: content_block_delta` with text deltas or tool input JSON deltas
- `event: content_block_stop`
- `event: message_stop`

### Step 4: API Route Update (`apps/web/src/app/api/ai/plan/route.ts`)

Modify the `action === "chat"` handler:

1. Import the new system prompt and tools from `goal-chat-prompt.ts` instead of using `chatWithCoach` from `decompose.ts`.
2. Create the stream with both tools (`ask_question` + `create_goal_plan`).
3. The streaming response format stays the same — the client handles tool_use parsing.

Alternatively, create a new `chatWithGoalCoach` function in `goal-chat-prompt.ts` that mirrors `chatWithCoach` but uses the updated prompt/tools. The route just calls this new function. This avoids touching `decompose.ts` at all.

**Recommended approach:** Add a new action `"goal-chat"` to the route rather than modifying `"chat"`. This keeps backward compatibility and cleanly separates concerns.

```typescript
if (action === "goal-chat") {
  const { messages } = body as { messages: ConversationMessage[] };
  const stream = await chatWithGoalCoach(messages);
  return new Response(stream.toReadableStream(), {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
```

### Step 5: AskQuestion Card (`apps/web/src/components/goals/ask-question-card.tsx`)

A self-contained interactive card component.

**Props:**
```typescript
interface AskQuestionCardProps {
  data: AskQuestionData;
  onAnswer: (answer: UserAnswer) => void;
  disabled?: boolean;  // true after answered
}
```

**Rendering:**
- Question text as a heading in `text-[#1E2227]` (--text-primary)
- Options as a list of selectable items on `bg-[#F1EEE8]` (--bg-soft), with selected state using `bg-[#EAF0FF] border-[#4C7CF0]` (--accent-soft + --accent-blue border)
- Radio buttons (single select) or checkboxes (multi select) using simple styled divs (no heavy component library)
- "Other" option: when selected, shows a text input below
- Submit button: `bg-[#4C7CF0] text-white` rounded button, disabled until selection made
- After submission: card becomes read-only, selected options highlighted, submit button hidden

**Design notes following DESIGN.md:**
- Card: `bg-white rounded-lg` with no shadow (flat element)
- Border: `border border-[#E6E1D8]`
- No colored left-border (anti-pattern)
- No emoji
- Spacing: multiples of 4px (p-4, gap-3, etc.)

### Step 6: Chat Message Bubble (`apps/web/src/components/goals/chat-message.tsx`)

**Props:**
```typescript
interface ChatMessageProps {
  message: ChatMessage;
  onAnswer?: (answer: UserAnswer) => void;
  isStreaming?: boolean;
}
```

**Rendering:**
- User messages: right-aligned, `bg-[#4C7CF0] text-white` rounded bubble
- Assistant text: left-aligned, `bg-[#F1EEE8] text-[#1E2227]` rounded bubble
- If `message.toolUse` is set: render `<AskQuestionCard>` below the text
- If `message.plan` is set: render a small "Plan generated" indicator (the full preview is an overlay)
- Streaming indicator: pulsing dots or cursor at end of assistant text

### Step 7: RoadmapPreview (`apps/web/src/components/goals/roadmap-preview.tsx`)

An overlay/modal showing the generated plan as a tree.

**Props:**
```typescript
interface RoadmapPreviewProps {
  plan: GoalPlanData;
  onConfirm: () => void;
  onEdit: () => void;
  isSaving?: boolean;
}
```

**Rendering:**
- Full-screen overlay with `bg-black/20` backdrop
- Centered card: `bg-white rounded-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto`
- Header: Goal title + description
- Phase tree:
  - Each phase: numbered (1, 2, 3), with title, description, and estimated weeks badge
  - Connected by a vertical line (timeline aesthetic)
  - If todos exist: nested under each phase as 1.1, 1.2, etc.
  - Priority indicators: small colored dot (high=`#C65B52`, medium=`#C6923D`, low=`#4D8B6A`)
- Footer: Two buttons
  - "Continue Editing" — ghost style, calls `onEdit`
  - "Confirm & Create Plan" — primary `bg-[#4C7CF0]`, calls `onConfirm`
  - When `isSaving`: button shows spinner and "Creating..."

### Step 8: GoalChat Orchestrator (`apps/web/src/components/goals/goal-chat.tsx`)

The main component that replaces the input view when the user submits a goal.

**Props:**
```typescript
interface GoalChatProps {
  initialGoal: string;
  onComplete: (goalId: string) => void;
  onCancel: () => void;
}
```

**Behavior:**
1. On mount, auto-sends `initialGoal` as the first user message via the hook
2. Renders a scrollable message thread using `ChatMessage` components
3. At the bottom: a simple text input for freeform replies (for when user wants to type instead of clicking options)
4. Auto-scrolls to bottom on new messages
5. When `stage === "preview"`: renders `RoadmapPreview` overlay
6. When `stage === "done"`: calls `onComplete(goalId)` which navigates to dashboard

**Layout:** Full height within the main content area. Messages scroll, input stays at bottom. The hero illustration and example cards are hidden when chat is active.

### Step 9: Goals Page Update (`apps/web/src/app/(app)/goals/page.tsx`)

Modify the existing page to toggle between two views:

```typescript
export default function GoalsPage() {
  const [goalText, setGoalText] = useState("");
  const [chatActive, setChatActive] = useState(false);
  const [submittedGoal, setSubmittedGoal] = useState("");
  const router = useRouter();

  const handleSubmitGoal = (text: string) => {
    setSubmittedGoal(text);
    setChatActive(true);
  };

  const handleComplete = (goalId: string) => {
    router.push(`/dashboard`); // or `/goals/${goalId}`
  };

  const handleCancel = () => {
    setChatActive(false);
    setSubmittedGoal("");
  };

  if (chatActive) {
    return (
      <GoalChat
        initialGoal={submittedGoal}
        onComplete={handleComplete}
        onCancel={handleCancel}
      />
    );
  }

  return (
    // ... existing hero + GoalInput + ExampleGoals
  );
}
```

---

## Stream Parsing Detail

The Anthropic SDK `stream.toReadableStream()` outputs newline-delimited JSON events. Each event has a `type` field. The client-side parsing logic in `use-goal-chat.ts`:

```
1. Read chunks from ReadableStream via reader.read()
2. Split on newlines, parse each line as JSON
3. For type "content_block_start":
   - If content_block.type === "text": prepare to accumulate text
   - If content_block.type === "tool_use": note tool name, prepare JSON accumulator
4. For type "content_block_delta":
   - If delta.type === "text_delta": append delta.text to current message content, trigger re-render
   - If delta.type === "input_json_delta": append delta.partial_json to JSON accumulator
5. For type "content_block_stop":
   - If was text block: finalize
   - If was tool_use block: JSON.parse accumulated input, dispatch based on tool name
6. For type "message_stop": mark streaming complete
```

---

## Conversation History Format

The Claude API expects alternating user/assistant messages. The hook must maintain this contract:

1. User submits goal text -> `{role: "user", content: "I want to learn Spanish in 6 months"}`
2. Claude responds with text + ask_question tool -> `{role: "assistant", content: [{type: "text", text: "Great goal! ..."}, {type: "tool_use", name: "ask_question", ...}]}`
3. User answers question -> `{role: "user", content: [{type: "tool_result", tool_use_id: "...", content: "Selected: Beginner, ..."}]}`
4. Repeat until create_goal_plan is called

**Key:** When sending `tool_result` back to Claude, the message must include the `tool_use_id` from the previous assistant message. The hook must track this.

For the API, the messages sent in the POST body should be the full Anthropic-format messages array (not simplified). This means the API route passes them directly to Claude without transformation.

Update to `ConversationMessage` type: instead of `{role, content: string}`, use the full Anthropic message format: `{role, content: string | ContentBlock[]}`. The existing `ConversationMessage` type in `decompose.ts` is too simple. The new `goal-chat-prompt.ts` should define its own message type or use the Anthropic SDK's `MessageParam` type directly.

---

## Error Handling

- **Stream error:** If the fetch fails or stream breaks, show an error message in the chat ("Something went wrong. Try again.") with a retry button.
- **Tool parse error:** If tool_use JSON is malformed, log the error and ask Claude to try again by sending a tool_result with `is_error: true`.
- **Save error:** If `createGoal` or `createPhases` fails, show error in the RoadmapPreview and keep the confirm button active for retry.
- **Rate limiting:** If the API returns 429, show "Too many requests, please wait a moment" in the chat.

---

## Sequencing & Dependencies

```
Step 1 (types)           — no dependencies, do first
Step 2 (prompt+tools)    — depends on types
Step 3 (hook)            — depends on types, prompt
Step 4 (API route)       — depends on prompt
Step 5 (AskQuestion)     — depends on types
Step 6 (ChatMessage)     — depends on types, AskQuestion
Step 7 (RoadmapPreview)  — depends on types
Step 8 (GoalChat)        — depends on hook, ChatMessage, RoadmapPreview
Step 9 (goals page)      — depends on GoalChat
```

Parallelizable: Steps 5+7 can be built in parallel. Steps 2+4 can be built in parallel with 5+6+7.

**Recommended build order:**
1. Types (Step 1)
2. Prompt + API route (Steps 2, 4)
3. UI components in parallel (Steps 5, 6, 7)
4. Hook (Step 3)
5. Orchestrator + page wiring (Steps 8, 9)

---

## Testing Approach

- Manual testing with the dev server: submit various goals, verify question cards render, answers flow back, plan generates correctly
- Check that the plan data matches the `GoalPlanData` schema before saving
- Verify Supabase inserts: goal row created, phases created with correct sort_order and status
- Edge cases: user presses Enter with empty input, user clicks "just do it" on first question, stream disconnects mid-response
- Mobile: test the chat view at 375px width, ensure cards don't overflow

---

## Potential Challenges

1. **Anthropic stream format.** The `toReadableStream()` method outputs raw SSE bytes. Need to verify exact format (newline-delimited JSON vs SSE with `data:` prefixes) and adjust parsing accordingly. May need to use `@anthropic-ai/sdk`'s built-in stream helpers on the client side, or parse SSE manually.

2. **tool_use_id tracking.** Each tool call from Claude has a unique ID. The subsequent `tool_result` must reference it. The hook must extract and store this ID from the stream before the user can answer.

3. **Multiple tool calls in one response.** Claude might return text + tool_use in a single message. The stream parser must handle both content blocks in sequence.

4. **Opus latency.** Opus is slower than Sonnet. The streaming UX is critical — show text immediately as it arrives, and show a "thinking" indicator before the first token.

5. **Mobile keyboard.** When the chat input is focused on mobile, the virtual keyboard may push content up. Need to handle scroll position carefully.
