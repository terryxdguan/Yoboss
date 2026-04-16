# B 类聊天增量落库：设计方案

**状态**：设计稿，下个 session 讨论落地细节
**前置**：A 类三处（`team/chat`、`goal-chat-panel`、workflow follow-up chat）已完成增量落库重构，见 commits `f9fca22`（agent chat）+ 本次
**背景**：Jing 的 "Where is my report?" 事件暴露了 `next build` 默认 60s + 无流式持久化的双重坑。A 类通过 `upsertAssistantMessage` + 节流 flush 已修。B 类因为目标表缺失，需要新的持久化设计。

---

## 1. Scope

| # | 位置 | UI 功能 | 为什么是 B 类 |
|---|---|---|---|
| #1 | `src/lib/hooks/use-goal-chat.ts:68` | Goal 创建多轮对话（landing / dashboard 入口） | 对话期间尚未建 goal row，持久化目标不存在 |
| #2 | `src/lib/hooks/use-weekly-plan-chat.ts:82` | Weekly Schedule 生成多轮对话 | 同上，weekly_plan 要等用户点 Confirm 才生成 |
| #5 | `src/components/workflow/workflow-run-view.tsx:330` → `/api/ai/agent-run-step` | Workflow step 执行期间的流式输出 | 已拆 per-step HTTP，有外层 300s，但单 step 内部流被截断时中间进度丢失 |

## 2. 三处的本质问题

### #1 / #2 — 没有"持久化容器"

两者的用户流程：

```
用户输入 goal/weekly 目标
→ Claude 多轮对话澄清 / 拆解
→ Claude 产出结构化结果（goals / phases / weekly_plan / daily_tasks）
→ 用户点 "Confirm"
→ 代码解析结构化结果 → 写 goals/phases/weekly_plans/daily_tasks
```

**对话本身**从来没落过库。`confirmPlan()` 只写最终的结构化结果，不写中间对话。
所以：
- Jing 式的"跑到一半函数挂掉"场景发生时，对话完全丢失，用户看到的是 landing 页面重置
- 即使不挂，用户刷新浏览器 tab 也会失去已有的 5 轮对话进度
- David 的 bug 根因之一是：AI 产出完整拆解后他没点 Confirm，整个 5 轮对话白做

### #5 — 有持久化容器，但粒度太粗

`workflow_runs.step_results` 是 per-step 粒度。在一个 step 流式跑的时候：
- Client 的 `runStep()` 里用 React state 累积 `text` / `tools` / `files`  
- Step 完成时才调 `updateWorkflowRun({ step_results })` 写 DB
- Vercel 挂在 step 中途 → partial 进度丢失
- 之后 recovery handler `/api/workflows/recover` 会尝试从 Anthropic session events 恢复，但那是 heuristic 恢复，文本归属步骤偶尔会错

## 3. 推荐方案

### 3.1 #1 / #2 —— 方案 X 的精炼版（复用 `chat_sessions`）

**核心思想**：不新建表。给 `chat_sessions` 加一种"draft intent"类型，goal 创建和 weekly plan 创建对话都作为特殊 session 存起来。Confirm 时把最终 assistant 消息里的结构化结果解析成真实的 goal/phase/weekly_plan 行。

#### schema 改动

`chat_sessions` 表加一个 `kind` 字段（或者复用现有 `agent_id` 字段，约定 `agent_id='__goal-draft__'` / `__weekly-draft__'`，零 migration）。推荐复用 `agent_id`，避免 migration + RLS 改动。

`chat_sessions.metadata` JSONB 字段存：
- `intent`: `"goal-creation" | "weekly-plan-creation"`
- `confirmed_at`: 用户 Confirm 时填，confirmed 后该 session 进入"已归档"状态不再显示
- `result_goal_id` / `result_weekly_plan_id`: 落盘后的真实 row id，用于 audit trail

> 如果 `chat_sessions` 表还没有 metadata 字段，需要一个小 migration 加上。

#### 路由改动

**`/api/ai/plan` 现有的 `goal-chat` 和 `weekly-chat` action 不变**，这两个只负责流式 Claude API 调用。

**客户端钩子要改动**：
- `use-goal-chat.ts` / `use-weekly-plan-chat.ts` 进入"已有 session 复用"模式：挂载时若 `localStorage` 或 URL 有 draft session id，恢复；否则按需创建
- 每次流式应答 → 复用 `upsertAssistantMessage({ sessionId, messageId, content, metadata: { partial: true } })`（这个 action 已经在 A 类写好）
- Catch 路径标 `interrupted: true` 完成 finalize
- Confirm 按钮路径：除了现在已有的 `createGoal` + `createPhases` 等，额外把 `chat_sessions.metadata.confirmed_at` 填上

#### UI 改动

- Landing 页 / dashboard goal 输入框下面加一栏 "Continue draft" 列表，展示 `chat_sessions` 里 `agent_id='__goal-draft__'` 且 `confirmed_at` 为空的 session
- 每个 draft 显示最后一条 user 消息的前 60 字符 + 创建时间
- 点击进入 = load 该 session 的 messages 到 React state，继续对话
- Confirm 成功后该 draft 自动从列表消失
- 如果 Jing 式挂了，draft 会带 `interrupted` badge，指引用户再发一条消息继续

#### Confirm 的结构化结果解析

这是这个方案最脆弱的点。现在 `confirmPlan()` 是从 React state 里的 `finalPlan` 对象直接取结构化字段。该对象是 Claude 在多轮对话中通过**约定的 JSON 格式**输出的（我记得代码里有 `extractPlanFromResponse` 之类的函数）。

如果 session 是恢复出来的，`finalPlan` 这个 React state 一开始是空的，需要从最后一条 assistant 消息里**重新解析** JSON。这要求：
1. 解析函数暴露成独立 helper（不是 hook 内部）
2. 解析失败时要有 fallback（显示原始文本让用户自己复制 / 让 Claude 再输出一次）

> 下个 session 讨论时要确认：最终 plan 结构是存在最后一条 assistant 消息的 markdown 里，还是通过 tool_use 之类的结构化 event 输出的？这决定了解析是文本抓取还是 event 识别。

---

### 3.2 #5 —— workflow step 流式落库

**问题本质**：`/api/ai/agent-run-step` 路由自己就是流式 SSE，但 client 只在 step 完成后统一写 `step_results`。

**两种改法**：

#### 方案 α（客户端节流）—— 和 A 类完全一致的模式

- `runStep()` 里已有 React state 的 `text`/`tools`/`files`/`knownFiles`
- 加 `scheduleFlush` 每 2s 写一次 `workflow_runs.step_results[stepIdx]` 的 partial
- 单 step 内部挂 → partial 已落库 → recovery handler 可以直接读 DB 而不是 heuristic 重建
- 代码量：~30 行，和 A 类高度重复

#### 方案 β（服务端节流）—— 路由侧直接写

- `/api/ai/agent-run-step` route 自己拿 `supabaseAdmin` + `runId` + `stepIdx`
- 流式读 Anthropic events 的同时做节流 supabase update
- Client 不用改，但这是 server-side 改动，单次 HTTP 内函数仍然被 Vercel 杀时 **Node 进程在 300s 瞬间切断**，finally 块不一定有机会运行
- 相比之下客户端节流永远在浏览器里跑，不受 serverless 函数生命周期影响

**推荐 α**。一致的模式降低认知负担，且对中断更健壮。

---

## 4. 需要回答的问题（下个 session 用）

1. **`use-goal-chat.ts` 现在到底怎么从流式输出里提取最终 goal 结构？** 是让 Claude 在最后一条消息里吐 JSON，还是 tool_use 事件，还是自由文本靠 heuristic？这决定了"从 draft session 恢复 → 再次 Confirm" 的可行性。
2. **需要不需要 landing 页 UI 上显示 "continue draft" 列表？** 如果只做 DB 落库但不改入口，体验仍然是"刷新就丢"，跟 Jing 的痛点解决得不完整。
3. **chat_sessions 是否已有 metadata 字段？** 没有的话需要 migration 022 加 JSONB `metadata`（migration 021 还没创建，下一个 slot）。
4. **Confirm 失败的回滚？** 如果 Confirm 解析失败或 Supabase 写入失败，draft 要不要保留？目前 confirmPlan 是 all-or-nothing 写入。
5. **Weekly plan 的 goalId 依赖**：weekly plan 属于某个 goal，创建时必须已有 goal。draft session 要不要在 metadata 里存 parent_goal_id？

## 5. 实施切分（下个 session 执行顺序建议）

1. 审计当前 `use-goal-chat.ts` / `use-weekly-plan-chat.ts` 的完整流程（~15 min）
2. 回答问题 1、5，决定解析方式
3. 如果需要，写 migration 022: `chat_sessions.metadata` jsonb + 可选索引
4. 新建 `src/lib/ai/goal-draft.ts`（或类似），封装：
   - `createGoalDraft()` → 返回 sessionId + 初始化 metadata
   - `loadGoalDraft(sessionId)` → 返回 messages + metadata
   - `listOpenGoalDrafts(userId)` → landing 页用
   - `markGoalDraftConfirmed(sessionId, goalId)` → Confirm 成功后
5. 重构 `use-goal-chat.ts` 用 `upsertAssistantMessage` + draft session
6. 重构 `use-weekly-plan-chat.ts` 同样模式
7. UI 加 "continue draft" 入口（landing + dashboard）
8. 独立 commit：方案 α 给 workflow step #5 做节流落库
9. 端到端在 prod 验证：强制跑一个长 goal 对话直到 300s，验证恢复

## 6. 不做的事

- 不新建 `goal_drafts` / `weekly_plan_drafts` 独立表（复用 chat_sessions 足够）
- 不改 `/api/ai/plan` 路由（流式行为保持）
- 不改 Confirm 后的 `goals`/`phases`/`weekly_plans` 表结构
- 不解决 David 的"不知道要点 Confirm"问题（独立 UX bug，单独 session）

---

## 参考：A 类已有的可复用基础设施

- `upsertAssistantMessage({ sessionId, messageId, content, metadata })` — `src/lib/db/actions.ts`
- `ChatMessage.metadata.{partial, interrupted}` 约定 — `src/lib/types/database.ts`
- 节流 `scheduleFlush` / `flushNow` / `finalized` 模式 — `src/app/(app)/team/chat/[agentId]/page.tsx` sendToApi 是最干净的参考
- UI 警告块样式 `text-[#C9843D]` + "⚠️ This response was interrupted..." 可以复用
