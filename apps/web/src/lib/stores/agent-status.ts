// Lightweight global store for agent status (no dependencies)
// Works across components via useSyncExternalStore

type AgentStatus = "idle" | "working";

let statuses: Record<string, AgentStatus> = {};
let listeners: Set<() => void> = new Set();

function emitChange() {
  listeners.forEach((l) => l());
}

export function setAgentStatus(agentId: string, status: AgentStatus) {
  if (statuses[agentId] !== status) {
    statuses = { ...statuses, [agentId]: status };
    emitChange();
  }
}

export function getAgentStatus(agentId: string): AgentStatus {
  return statuses[agentId] || "idle";
}

export function getSnapshot(): Record<string, AgentStatus> {
  return statuses;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
