import {
  ArrowRight,
  Bot,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  Flag,
  FolderKanban,
  Layers3,
  ListChecks,
  MessageSquare,
  Play,
  Sparkles,
  Target,
  Timer,
} from "lucide-react";

const focusItems = [
  {
    title: "Review portfolio homepage draft",
    goal: "Launch personal portfolio",
    time: "25 min",
    type: "Agent handoff",
    tone: "blue",
  },
  {
    title: "Choose 3 projects for case studies",
    goal: "Launch personal portfolio",
    time: "Today",
    type: "Goal task",
    tone: "green",
  },
  {
    title: "Confirm market report outline",
    goal: "Research AI productivity tools",
    time: "Waiting",
    type: "Needs input",
    tone: "coral",
  },
];

const goals = [
  {
    name: "Launch personal portfolio",
    phase: "Phase 2: Build content",
    progress: 62,
    next: "Publish first homepage draft by Friday",
    weekly: "5 tasks this week",
  },
  {
    name: "Research AI productivity tools",
    phase: "Phase 1: Market scan",
    progress: 38,
    next: "Compare 6 competing products",
    weekly: "3 tasks this week",
  },
  {
    name: "Plan 6-day Japan trip",
    phase: "Phase 3: Booking checklist",
    progress: 74,
    next: "Finalize hotels and transport",
    weekly: "4 tasks this week",
  },
];

const agentWork = [
  {
    title: "Homepage copy draft",
    agent: "Writing Agent",
    status: "Ready for review",
    detail: "Drafted hero, about, and project sections.",
    icon: FileText,
  },
  {
    title: "Competitor research brief",
    agent: "Research Agent",
    status: "Running",
    detail: "Collecting sources and pricing notes.",
    icon: Bot,
  },
  {
    title: "Weekly checklist update",
    agent: "Planning Agent",
    status: "Needs your input",
    detail: "Waiting for priority between portfolio and research.",
    icon: ListChecks,
  },
];

const schedule = [
  { day: "Mon", label: "Plan", count: "3 tasks", active: false },
  { day: "Tue", label: "Draft", count: "4 tasks", active: true },
  { day: "Wed", label: "Review", count: "2 tasks", active: false },
  { day: "Thu", label: "Build", count: "3 tasks", active: false },
  { day: "Fri", label: "Ship", count: "2 tasks", active: false },
];

const decisions = [
  "Approve portfolio homepage direction",
  "Pick research report audience",
  "Move Japan booking tasks to next week",
];

const toneStyles = {
  blue: "border-[#B8D4F4] bg-[#F3F8FE] text-[#4E7FB9]",
  green: "border-[#CDE6D1] bg-[#F4FBF5] text-[#4F8D5C]",
  coral: "border-[#F0C9C5] bg-[#FFF5F3] text-[#9A615B]",
};

export default function DashboardMainPreviewPage() {
  return (
    <main className="min-h-screen bg-[#F6F3EE] text-[#2B2B2B]">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[232px_1fr]">
        <aside className="hidden border-r border-[#E7DED2] bg-[#FFFDF9]/60 px-4 py-5 lg:block">
          <div className="mb-8 flex items-center gap-2 px-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#7FAEE6] text-white">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold">YoBoss</p>
              <p className="text-[11px] text-[#9B948B]">AI work partner</p>
            </div>
          </div>

          <nav className="space-y-1">
            {[
              { icon: FolderKanban, label: "Dashboard", active: true },
              { icon: Flag, label: "Goals" },
              { icon: ListChecks, label: "To-Dos" },
              { icon: Bot, label: "Team" },
            ].map(({ icon: Icon, label, active }) => (
              <div
                key={label}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${
                  active
                    ? "bg-[#EAF3FD] text-[#2B2B2B]"
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

          <div className="mt-8 rounded-lg border border-[#E7DED2] bg-[#FFFDF9] p-3">
            <p className="text-xs font-semibold text-[#2B2B2B]">
              AI capacity today
            </p>
            <div className="mt-3 h-2 rounded-full bg-[#F1ECE4]">
              <div className="h-2 w-[68%] rounded-full bg-[#7FAEE6]" />
            </div>
            <p className="mt-2 text-xs text-[#6F6A64]">
              4 active runs, 2 waiting for review
            </p>
          </div>
        </aside>

        <section className="min-w-0 px-4 py-5 md:px-8 lg:px-10">
          <header className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7FAEE6]">
                Dashboard
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-[32px]">
                Good morning. Here is what needs attention.
              </h1>
              <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[#6F6A64]">
                Track active goals, finish today&apos;s work, and review outputs
                your AI partners have prepared.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#CFC3B5] bg-[#FFFDF9] px-4 py-2.5 text-sm font-semibold text-[#6F6A64]">
                Ask AI
                <MessageSquare className="h-4 w-4" />
              </button>
              <button className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#7FAEE6] px-4 py-2.5 text-sm font-semibold text-white">
                Create task
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </header>

          <section className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-4">
            {[
              { label: "Active goals", value: "3", icon: Target },
              { label: "Due today", value: "7", icon: CalendarDays },
              { label: "AI outputs", value: "2", icon: Bot },
              { label: "Blocked", value: "1", icon: Timer },
            ].map(({ label, value, icon: Icon }) => (
              <div
                key={label}
                className="rounded-lg border border-[#E7DED2] bg-[#FFFDF9] p-4"
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9B948B]">
                    {label}
                  </p>
                  <Icon className="h-4 w-4 text-[#7FAEE6]" />
                </div>
                <p className="mt-3 text-2xl font-semibold">{value}</p>
              </div>
            ))}
          </section>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_390px]">
            <div className="space-y-5">
              <section className="rounded-lg border border-[#D7CABB] bg-[#FFFDF9] p-5">
                <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">
                      Today&apos;s focus
                    </h2>
                    <p className="mt-1 text-sm text-[#6F6A64]">
                      The highest-leverage actions across goals, to-dos, and
                      AI handoffs.
                    </p>
                  </div>
                  <button className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#CFC3B5] bg-[#FFFDF9] px-3 py-2 text-sm font-semibold text-[#6F6A64]">
                    Plan my day
                    <Sparkles className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-2">
                  {focusItems.map((item) => (
                    <button
                      key={item.title}
                      className="group flex w-full items-center gap-3 rounded-lg border border-[#E7DED2] bg-[#FFFDF9] px-3 py-3 text-left transition-colors hover:border-[#9FC3EF] hover:bg-[#F8FBFF]"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#F6F3EE] text-[#7FAEE6]">
                        <Play className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                              toneStyles[item.tone as keyof typeof toneStyles]
                            }`}
                          >
                            {item.type}
                          </span>
                          <span className="text-xs text-[#9B948B]">
                            {item.time}
                          </span>
                        </div>
                        <p className="truncate text-sm font-semibold">
                          {item.title}
                        </p>
                        <p className="truncate text-xs text-[#6F6A64]">
                          {item.goal}
                        </p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-[#CFC3B5] transition-transform group-hover:translate-x-0.5" />
                    </button>
                  ))}
                </div>
              </section>

              <section className="rounded-lg border border-[#E7DED2] bg-[#FFFDF9] p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">Active goals</h2>
                    <p className="mt-1 text-sm text-[#6F6A64]">
                      Progress, current phase, and the next milestone.
                    </p>
                  </div>
                  <button className="hidden items-center gap-1 text-sm font-semibold text-[#5E8FCE] md:inline-flex">
                    View all
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                  {goals.map((goal) => (
                    <button
                      key={goal.name}
                      className="rounded-lg border border-[#E7DED2] bg-[#F6F3EE] p-4 text-left transition-colors hover:border-[#9FC3EF] hover:bg-[#F8FBFF]"
                    >
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">{goal.name}</p>
                          <p className="mt-1 text-xs text-[#9B948B]">
                            {goal.phase}
                          </p>
                        </div>
                        <span className="rounded-full bg-[#FFFDF9] px-2 py-0.5 text-xs font-semibold text-[#6F6A64]">
                          {goal.progress}%
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-[#E7DED2]">
                        <div
                          className="h-2 rounded-full bg-[#7FB38A]"
                          style={{ width: `${goal.progress}%` }}
                        />
                      </div>
                      <p className="mt-3 text-xs leading-relaxed text-[#6F6A64]">
                        {goal.next}
                      </p>
                      <p className="mt-2 text-[11px] font-semibold text-[#7FAEE6]">
                        {goal.weekly}
                      </p>
                    </button>
                  ))}
                </div>
              </section>

              <section className="rounded-lg border border-[#E7DED2] bg-[#FFFDF9] p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">Weekly plan</h2>
                    <p className="mt-1 text-sm text-[#6F6A64]">
                      A compact view of where your effort is going this week.
                    </p>
                  </div>
                  <CalendarDays className="h-5 w-5 text-[#7FAEE6]" />
                </div>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
                  {schedule.map((day) => (
                    <div
                      key={day.day}
                      className={`rounded-lg border px-3 py-3 ${
                        day.active
                          ? "border-[#9FC3EF] bg-[#F3F8FE]"
                          : "border-[#E7DED2] bg-[#F6F3EE]"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-[#9B948B]">
                          {day.day}
                        </p>
                        {day.active && (
                          <span className="h-2 w-2 rounded-full bg-[#7FAEE6]" />
                        )}
                      </div>
                      <p className="mt-2 text-sm font-semibold">{day.label}</p>
                      <p className="mt-1 text-xs text-[#6F6A64]">{day.count}</p>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <aside className="space-y-5">
              <section className="rounded-lg border border-[#E7DED2] bg-[#FFFDF9] p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">AI work queue</h2>
                    <p className="mt-1 text-sm text-[#6F6A64]">
                      Outputs, runs, and handoffs from your AI partners.
                    </p>
                  </div>
                  <Bot className="h-5 w-5 text-[#8A5F5A]" />
                </div>

                <div className="space-y-3">
                  {agentWork.map(({ title, agent, status, detail, icon: Icon }) => (
                    <div
                      key={title}
                      className="rounded-lg border border-[#E7DED2] bg-[#F6F3EE] p-3"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#EAF3FD] text-[#7FAEE6]">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-semibold">{title}</p>
                            <span className="rounded-full bg-[#FFFDF9] px-2 py-0.5 text-[10px] font-semibold text-[#6F6A64]">
                              {status}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-[#9B948B]">{agent}</p>
                          <p className="mt-2 text-xs leading-relaxed text-[#6F6A64]">
                            {detail}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-lg border border-[#E7DED2] bg-[#FFFDF9] p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">Needs decision</h2>
                    <p className="mt-1 text-sm text-[#6F6A64]">
                      Small choices that unblock the next AI or task step.
                    </p>
                  </div>
                  <Clock3 className="h-5 w-5 text-[#F0A39B]" />
                </div>
                <div className="space-y-2">
                  {decisions.map((decision) => (
                    <button
                      key={decision}
                      className="flex w-full items-center gap-3 rounded-lg border border-[#E7DED2] bg-[#FFFDF9] px-3 py-3 text-left hover:border-[#F0C9C5] hover:bg-[#FFF5F3]"
                    >
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-[#CFC3B5]" />
                      <span className="min-w-0 flex-1 text-sm font-medium">
                        {decision}
                      </span>
                      <ChevronRight className="h-4 w-4 text-[#CFC3B5]" />
                    </button>
                  ))}
                </div>
              </section>
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}
