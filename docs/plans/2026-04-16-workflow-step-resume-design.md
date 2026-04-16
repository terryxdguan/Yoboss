# Workflow Step Resume: Design

**Status**: Approved, ready for implementation plan
**Scope**: Workflow 单步执行在客户端断开后的恢复

## Context

客户端驱动架构下（commit `4400d42`），每个 workflow step 是一个独立的 `/api/ai/agent-run-step` HTTP 请求。客户端刷新/关闭页面时，Vercel function 被杀，服务端 poll loop 停止。Anthropic Managed Agent session 的状态仍然持久化在远端：

- 只用 native tools（web_search、code_execution、web_fetch）的步骤：Anthropic 会自己跑完，events 累积到 session 里
- 涉及 custom tools（generate_image）的步骤：session 卡在 `agent.custom_tool_use`，等我们的服务端执行工具并发回 `user.custom_tool_result`。没人执行 → 永久卡住

用户目前的体验：页面一刷新，workflow 就"丢了"，即使后台 Anthropic 已经完成。需要恢复机制。

## 决策

基于用户选择：
- **恢复语义**：只要 step 最终完成就好，不要求中间 events 完整重放
- **自动推进**：恢复检测到 step 已完成 → 自动跑下一步（类似原来的通关体验）
- **Custom tool 卡死**：恢复时自动执行卡住的 tool（透明处理）

## 架构

```
Mount WorkflowRunView → existingRun.status === "running"?
  ├─ Yes & has session_id
  │   → fetch /api/ai/agent-run-step { resume: true, sessionId, stepIndex }
  │   → 服务端 NOT 发新 user.message，NOT mark events as seen
  │   → Poll loop 第一轮把历史 events 全当作 new 来流给客户端
  │   → Poll loop 处理 pending custom_tool_use（自动执行）
  │   → 走到 session.status_idle → 发 "done" → close
  │   → 客户端标 step success → 自动跑下一步（复用 executeWorkflow 主循环）
  │
  └─ No session_id or resume 失败
      → 退回现有 DB polling 逻辑（保留兼容路径）
```

## 服务端变更：`agent-run-step/route.ts`

新 request 参数：
```ts
const { sessionId, resume, message, rolePromptFile, knownFileIds } = body;
```

控制流三分支：

| 场景 | 条件 | 行为 |
|------|------|------|
| 新建 | `!sessionId` | Create session → send user.message → poll |
| 接续发新消息 | `sessionId && !resume` | Reuse session → snapshot events as seen → send user.message → poll |
| **恢复（新）** | `sessionId && resume` | Reuse session → **不** snapshot events → **不** send user.message → poll 第一轮处理所有历史 events |

Custom tool 自愈由现有 poll loop 天然支持：第一轮遍历历史 events 时遇到 orphan `agent.custom_tool_use`（没有对应 `user.custom_tool_result`）就会调 `executeCustomTool` 并发回 result。

## 客户端变更：`workflow-run-view.tsx`

**新函数** `resumeStep(stepIndex, sessionId, abort)`：
- 复用 `runStep` 的 body，但加 `resume: true`，不传 `message`
- 其余 SSE 处理完全一致（tool badges、text 累积、file 检测、throttled flush）

**主挂载逻辑**（在现有 `isPollingMode` 检测处）：
1. 读 `existingRun.step_results`，找第一个 `status === "running"` 的 stepIdx
2. 如果找到 + `existingRun.session_id` 存在 → 调用 `resumeStep(stepIdx, sessionId, abort)`
3. resume 成功 → 把该 step 标为 success → 用**现有的 executeWorkflow 主 for 循环从 stepIdx+1 继续**跑剩余步骤
4. Resume 失败或无 session_id → 退回现有 DB polling（保留兼容）

## 数据流对比

**当前（无 resume）：**
```
Client 关页 → session 继续在 Anthropic 跑 → 无人轮询 → step_results 永远停在 "running" → 用户回来只能看 DB polling（stale 数据）
```

**新架构：**
```
Client 关页 → session 继续在 Anthropic 跑
Client 回来 → 检测 running step + session_id → resume → 服务端轮询 + 流式返回历史 events → done → 自动推进
```

## 边缘情况

- **Session 已完成**：events.list 包含 `session.status_idle` → poll 第一轮就遇到 → 立即 `done` → 客户端快速进入下一步
- **Session 还在跑**：poll 处理历史 events + 继续轮询新 events → 完成
- **Session 卡在 custom_tool_use**：poll 第一轮检测未响应的 custom_tool_use → 执行 → 发 result → 继续
- **多 tab 并发 resume**：Anthropic session 只有一份状态，两边都能读 events，幂等。Custom tool 可能被执行两次但结果一致（DALL-E 生成两张图也没关系，UI 只用最后一次的 `user.custom_tool_result`）
- **无 session_id**（旧数据或 session 创建失败）：退回 DB polling，不做 resume

## 不做的事

- Workflow follow-up chat 的恢复（另一类问题，单独 session）
- Goal chat / Team chat 的恢复（单轮流，完成后就没了，不需要重连）
- 完整重放客户端断开期间的中间 events（用户明确说不需要）
- 用户永远不再打开页面时的 server-side 推进（需要 cron 机制，独立话题）

## 实施切片

1. 服务端加 `resume` 参数（~30 行 route.ts 改动）
2. 客户端加 `resumeStep` 函数 + 挂载检测逻辑（~60 行 workflow-run-view.tsx）
3. 测试：native-only step / custom-tool step / 已完成 session 三个场景手动验证

## 验证

1. 跑只用 web_search 的步骤，mid-step 刷新 → 页面 tool badges + partial text 从 DB 恢复显示 → 数秒后收到 done → 自动进入下一步
2. 跑含 generate_image 的步骤，image 调用期间关页 → 重开 → 检测到卡住的 custom tool → 自动执行 → 继续
3. 完成后才打开 → session 已 idle → 瞬间完成所有剩余步骤
