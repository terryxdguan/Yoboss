"use client";

import { useRef, useState } from "react";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronRight,
  FileText,
  Flag,
  Layers3,
  ListChecks,
  MessageSquare,
  Sparkles,
  Target,
} from "lucide-react";

type NextStepId = "roadmap" | "weekly-plan" | "todo-item";
type NextStepTab = "pending" | "done";

const todayTasks = [
  {
    id: "roadmap" as const,
    time: "Step 1",
    title: "Create your first goal roadmap",
    detail: "Start from a goal and let AI turn it into a roadmap.",
    source: "Create Roadmap",
    tag: "Goal",
  },
  {
    id: "weekly-plan" as const,
    time: "Step 2",
    title: "Create your first weekly plan",
    detail: "Generate a weekly schedule from your roadmap.",
    source: "Requires roadmap",
    tag: "Plan",
  },
  {
    id: "todo-item" as const,
    time: "Step 3",
    title: "Create your first to-do item",
    detail: "Add one daily task to your To-Dos list.",
    source: "To-Dos",
    tag: "To-Do",
  },
];

const aiPartnerModes = [
  {
    icon: MessageSquare,
    label: "Thinking partner",
    description: "Clarifies fuzzy goals and turns them into a concrete plan.",
    items: [
      "Ask the right questions and surface constraints.",
      "Break goals into phases, tasks, and next actions.",
    ],
  },
  {
    icon: FileText,
    label: "Execution partner",
    description: "Acts like a teammate once the task is clear.",
    items: [
      "Create drafts, research briefs, files, and handoffs.",
      "Run code and orchestrate multi-step workflows.",
    ],
  },
];

const examples = [
  "Prepare a market research report",
  "Plan a 6-day trip with bookings checklist",
];

export default function DashboardPreviewPage() {
  const roadmapSectionRef = useRef<HTMLElement>(null);
  const roadmapInputRef = useRef<HTMLTextAreaElement>(null);
  const roadmapWorkspaceRef = useRef<HTMLElement>(null);
  const todosWorkspaceRef = useRef<HTMLElement>(null);
  const [roadmapCreated, setRoadmapCreated] = useState(false);
  const [weeklyPlanCreated, setWeeklyPlanCreated] = useState(false);
  const [todoItemCreated, setTodoItemCreated] = useState(false);
  const [activeStepTab, setActiveStepTab] = useState<NextStepTab>("pending");
  const [doneStepIds, setDoneStepIds] = useState<NextStepId[]>([]);
  const [showTodoWorkspace, setShowTodoWorkspace] = useState(false);
  const [highlightRoadmap, setHighlightRoadmap] = useState(false);

  const isStepReady = (id: NextStepId) => {
    if (id === "roadmap") return roadmapCreated;
    if (id === "weekly-plan") return weeklyPlanCreated;
    return todoItemCreated;
  };

  const isStepDone = (id: NextStepId) => doneStepIds.includes(id);

  const scrollToRoadmapInput = () => {
    roadmapSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    roadmapInputRef.current?.focus();
    setHighlightRoadmap(true);
    window.setTimeout(() => setHighlightRoadmap(false), 1200);
  };

  const scrollToRoadmapWorkspace = () => {
    roadmapWorkspaceRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  };

  const scrollToTodosWorkspace = () => {
    setShowTodoWorkspace(true);
    window.setTimeout(() => {
      todosWorkspaceRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 0);
  };

  const completeRoadmap = () => {
    setRoadmapCreated(true);
    window.setTimeout(scrollToRoadmapWorkspace, 0);
  };

  const handleStepClick = (id: NextStepId) => {
    if (id === "roadmap") {
      scrollToRoadmapInput();
      return;
    }

    if (id === "weekly-plan") {
      if (!roadmapCreated) return;
      scrollToRoadmapWorkspace();
      return;
    }

    scrollToTodosWorkspace();
  };

  const toggleStepDone = (id: NextStepId) => {
    if (!isStepReady(id)) return;

    setDoneStepIds((current) => {
      if (current.includes(id)) {
        setActiveStepTab("pending");
        return current.filter((stepId) => stepId !== id);
      }

      setActiveStepTab("done");
      return [...current, id];
    });
  };

  const visibleTasks = todayTasks.filter((task) =>
    activeStepTab === "done" ? isStepDone(task.id) : !isStepDone(task.id),
  );
  const pendingCount = todayTasks.filter((task) => !isStepDone(task.id)).length;
  const doneCount = todayTasks.length - pendingCount;

  return (
    <main className="min-h-screen bg-[#F6F3EE] text-[#2B2B2B]">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[232px_1fr]">
        <aside className="hidden border-r border-[#E7DED2] bg-[#FFFDF9]/55 px-4 py-5 lg:block">
          <div className="mb-8 flex items-center gap-2 px-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#007AFF] text-white">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold">YoBoss</p>
              <p className="text-[11px] text-[#9B948B]">AI work partner</p>
            </div>
          </div>

          <nav className="space-y-1">
            {[
              { icon: Target, label: "Start Here", active: true },
              { icon: Flag, label: "Goals" },
              { icon: ListChecks, label: "To-Dos" },
              { icon: Bot, label: "Team" },
            ].map(({ icon: Icon, label, active }) => (
              <div
                key={label}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${
                  active
                    ? "bg-[#E6F2FF] text-[#2B2B2B]"
                    : "text-[#6F6A64]"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </div>
            ))}
          </nav>

          <div className="mt-8 border-t border-[#E7DED2] pt-4">
            <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9B948B]">
              Advanced
            </p>
            <div className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-[#9B948B]">
              <Layers3 className="h-4 w-4" />
              Workflows
            </div>
          </div>
        </aside>

        <section className="min-w-0 px-4 py-5 md:px-8 lg:px-10">
          <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#007AFF]">
                Dashboard
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-[32px]">
                Welcome. Start with one goal.
              </h1>
              <p className="mt-1 text-sm text-[#6F6A64]">
                YoBoss turns it into a plan, then helps clarify, break down,
                and execute the work with AI agents.
              </p>
            </div>
            <button className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#CFC3B5] bg-[#FFFDF9] px-4 py-2.5 text-sm font-semibold text-[#6F6A64]">
              Ask AI
              <MessageSquare className="h-4 w-4" />
            </button>
          </header>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_380px]">
            <div className="space-y-5">
              <section
                ref={roadmapSectionRef}
                className={`rounded-lg border bg-[#FFFDF9] p-5 shadow-[0_8px_28px_rgba(43,43,43,0.05)] transition-colors ${
                  highlightRoadmap
                    ? "border-[#007AFF] ring-4 ring-[#007AFF]/15"
                    : "border-[#D7CABB]"
                }`}
              >
                <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[#E6F2FF] px-3 py-1.5 text-xs font-semibold text-[#5E8FCE]">
                      <Sparkles className="h-3.5 w-3.5" />
                      Recommended first action
                    </div>
                    <h2 className="text-xl font-semibold">
                      What do you want to accomplish?
                    </h2>
                    <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[#6F6A64]">
                      Start with plain language. YoBoss will create a roadmap,
                      plan your first week, and suggest tasks an AI agent can
                      help execute.
                    </p>
                  </div>
                  <div className="hidden rounded-lg border border-[#E7DED2] bg-[#F6F3EE] px-3 py-2 text-xs text-[#6F6A64] md:block">
                    0 goals yet
                  </div>
                </div>

                <div className="rounded-lg border border-[#DDD3C7] bg-[#F6F3EE] p-3">
                  <textarea
                    ref={roadmapInputRef}
                    aria-label="Goal preview input"
                    defaultValue="Launch my personal portfolio in 4 weeks"
                    className="min-h-[92px] w-full resize-none bg-transparent px-2 py-2 text-base text-[#2B2B2B] outline-none placeholder:text-[#9B948B]"
                  />
                  <div className="flex flex-col gap-3 border-t border-[#E7DED2] pt-3 md:flex-row md:items-center md:justify-between">
                    <div className="flex flex-wrap gap-2">
                      {examples.map((item) => (
                        <span
                          key={item}
                          className="rounded-full border border-[#E7DED2] bg-[#FFFDF9] px-3 py-1 text-xs text-[#6F6A64]"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                    <button
                      onClick={completeRoadmap}
                      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold ${
                        roadmapCreated
                          ? "bg-[#EAF5EC] text-[#3F7C4A]"
                          : "bg-[#007AFF] text-white"
                      }`}
                    >
                      {roadmapCreated ? "Roadmap created" : "Create roadmap"}
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </section>

              {roadmapCreated && (
                <section
                  ref={roadmapWorkspaceRef}
                  className="rounded-lg border border-[#E7DED2] bg-[#FFFDF9] p-5"
                >
                  <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h2 className="text-base font-semibold">
                        First goal roadmap
                      </h2>
                      <p className="mt-1 text-sm text-[#6F6A64]">
                        Your goal is now broken into phases. Generate the first
                        weekly plan from here.
                      </p>
                    </div>
                    <button
                      onClick={() => setWeeklyPlanCreated(true)}
                      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold ${
                        weeklyPlanCreated
                          ? "bg-[#EAF5EC] text-[#3F7C4A]"
                          : "bg-[#007AFF] text-white"
                      }`}
                    >
                      {weeklyPlanCreated
                        ? "Weekly plan created"
                        : "Generate weekly plan"}
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    {["Foundation", "Build", "Launch"].map((phase) => (
                      <div
                        key={phase}
                        className="rounded-lg border border-[#E7DED2] bg-[#F6F3EE] px-3 py-3"
                      >
                        <p className="text-sm font-semibold">{phase}</p>
                        <p className="mt-1 text-xs leading-relaxed text-[#6F6A64]">
                          Plan tasks, create outputs, and review progress.
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <section className="rounded-lg border border-[#E7DED2] bg-[#FFFDF9] p-5">
                <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="mb-2 inline-flex rounded-full bg-[#E6F2FF] px-2.5 py-1 text-[11px] font-semibold text-[#5E8FCE]">
                      3-step setup
                    </div>
                    <h2 className="text-base font-semibold">
                      Today&apos;s next steps
                    </h2>
                    <p className="mt-1 text-sm text-[#6F6A64]">
                      Click a step to try each core workflow. Finished steps
                      are crossed out; use the circle when you&apos;re ready to
                      move them to Done.
                    </p>
                  </div>
                  <div className="flex rounded-lg border border-[#E7DED2] bg-[#F6F3EE] p-1">
                    {[
                      {
                        id: "pending" as const,
                        label: "Pending",
                        count: pendingCount,
                      },
                      { id: "done" as const, label: "Done", count: doneCount },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setActiveStepTab(tab.id)}
                        className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                          activeStepTab === tab.id
                            ? "bg-[#FFFDF9] text-[#2B2B2B] shadow-sm"
                            : "text-[#6F6A64]"
                        }`}
                      >
                        {tab.label} {tab.count}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  {visibleTasks.map((task) => {
                    const ready = isStepReady(task.id);
                    const done = isStepDone(task.id);
                    const blocked = task.id === "weekly-plan" && !roadmapCreated;
                    const actionLabel =
                      task.id === "roadmap"
                        ? roadmapCreated
                          ? "Review"
                          : "Start"
                        : task.id === "weekly-plan"
                          ? blocked
                            ? "Locked"
                            : weeklyPlanCreated
                              ? "Review"
                              : "Open"
                          : todoItemCreated
                            ? "Review"
                            : "Open";
                    const source =
                      task.id === "roadmap" && roadmapCreated
                        ? "Roadmap created"
                        : task.id === "weekly-plan" && weeklyPlanCreated
                          ? "Weekly plan created"
                          : task.id === "weekly-plan" && !roadmapCreated
                            ? "Requires first roadmap"
                            : task.id === "todo-item" && todoItemCreated
                              ? "To-do item created"
                              : task.source;

                    return (
                      <div
                        key={task.id}
                        className={`flex items-center gap-3 rounded-lg border px-3 py-3 transition-colors ${
                          blocked
                            ? "border-[#E7DED2] bg-[#F8F5EF] opacity-70"
                            : "border-[#E7DED2] bg-[#FFFDF9] hover:border-[#9FC3EF] hover:bg-[#F8FBFF]"
                        }`}
                      >
                        <button
                          onClick={() => toggleStepDone(task.id)}
                          disabled={!ready}
                          aria-label={`Move ${task.title} to Done`}
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                            done
                              ? "border-[#6EAF79] bg-[#6EAF79] text-white"
                              : ready
                                ? "border-[#6EAF79] bg-white"
                                : "border-[#DDD3C7] bg-white"
                          }`}
                        >
                          {done && <CheckCircle2 className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          onClick={() => handleStepClick(task.id)}
                          disabled={blocked}
                          className="group min-w-0 flex-1 text-left disabled:cursor-not-allowed"
                        >
                          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] font-semibold text-[#007AFF]">
                                  {task.time}
                                </span>
                                <span className="rounded bg-[#F1ECE4] px-1.5 py-0.5 text-[10px] text-[#6F6A64]">
                                  {blocked ? "Locked" : task.tag}
                                </span>
                              </div>
                              <p
                                className={`mt-0.5 truncate text-sm font-medium ${
                                  ready ? "text-[#8A8177] line-through" : ""
                                }`}
                              >
                                {task.title}
                              </p>
                              <p className="mt-0.5 text-xs leading-relaxed text-[#9B948B]">
                                {source} · {task.detail}
                              </p>
                            </div>
                            <span
                              className={`inline-flex shrink-0 items-center justify-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold ${
                                blocked
                                  ? "bg-[#EDE8E1] text-[#9B948B]"
                                  : "bg-[#E6F2FF] text-[#5E8FCE] group-hover:bg-[#DCEEFF]"
                              }`}
                            >
                              {actionLabel}
                              {!blocked && <ArrowRight className="h-3.5 w-3.5" />}
                            </span>
                          </div>
                        </button>
                        <ChevronRight
                          className={`hidden h-4 w-4 md:block ${
                            blocked ? "text-[#DDD3C7]" : "text-[#CFC3B5]"
                          }`}
                        />
                      </div>
                    );
                  })}
                  {visibleTasks.length === 0 && (
                    <div className="rounded-lg border border-dashed border-[#D7CABB] bg-[#F6F3EE] px-3 py-6 text-center text-sm text-[#6F6A64]">
                      {activeStepTab === "done"
                        ? "No completed items yet."
                        : "All first-session items are done."}
                    </div>
                  )}
                </div>
              </section>

              {showTodoWorkspace && (
                <section
                  ref={todosWorkspaceRef}
                  className="rounded-lg border border-[#E7DED2] bg-[#FFFDF9] p-5"
                >
                  <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h2 className="text-base font-semibold">To-Dos</h2>
                      <p className="mt-1 text-sm text-[#6F6A64]">
                        Create one simple task to start your daily list.
                      </p>
                    </div>
                    <button
                      onClick={() => setTodoItemCreated(true)}
                      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold ${
                        todoItemCreated
                          ? "bg-[#EAF5EC] text-[#3F7C4A]"
                          : "bg-[#007AFF] text-white"
                      }`}
                    >
                      {todoItemCreated
                        ? "To-do item created"
                        : "Create to-do item"}
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="rounded-lg border border-[#E7DED2] bg-[#F6F3EE] px-3 py-3 text-sm text-[#6F6A64]">
                    Draft portfolio hero section
                  </div>
                </section>
              )}
            </div>

            <aside className="space-y-5">
              <section className="rounded-lg border border-[#E7DED2] bg-[#FFFDF9] p-5">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#F4C7C3] text-[#8A5F5A]">
                    <Bot className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold">AI work partner</h2>
                    <p className="text-xs text-[#9B948B]">
                      A brain for planning. A teammate for execution.
                    </p>
                  </div>
                </div>

                <p className="mb-4 text-sm leading-relaxed text-[#6F6A64]">
                  Use it first to think through unclear goals, then hand over
                  concrete work that needs output, code, or automation.
                </p>

                <div className="space-y-3">
                  {aiPartnerModes.map((mode) => {
                    const Icon = mode.icon;

                    return (
                      <div
                        key={mode.label}
                        className="rounded-lg border border-[#E7DED2] bg-[#F6F3EE] p-3"
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#E6F2FF] text-[#007AFF]">
                            <Icon className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold">
                              {mode.label}
                            </p>
                            <p className="mt-1 text-xs leading-relaxed text-[#6F6A64]">
                              {mode.description}
                            </p>
                          </div>
                        </div>
                        <div className="mt-3 space-y-2">
                          {mode.items.map((item) => (
                            <div key={item} className="flex items-start gap-2">
                              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#6EAF79]" />
                              <p className="text-xs leading-relaxed text-[#6F6A64]">
                                {item}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}
