import {
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Circle,
  Flag,
  GripVertical,
  Grid2X2,
  ListChecks,
  Network,
  Plus,
  Search,
  Settings,
  Users,
} from "lucide-react";

const columns = [
  {
    name: "Work",
    accent: "border-[#BFDCC5] bg-[#F4FBF5]",
    tasks: [
      {
        title: "Review homepage copy draft",
        meta: "High priority - Today 4:00 PM",
        badge: "Agent handoff",
      },
      {
        title: "Send follow-up notes to design partner",
        meta: "Medium priority - Tomorrow",
        badge: "Email",
      },
    ],
  },
  {
    name: "Life",
    accent: "border-[#E8D5A4] bg-[#FFF9EA]",
    tasks: [
      {
        title: "Book dentist appointment",
        meta: "Low priority - Friday",
        badge: "Personal",
      },
    ],
  },
  {
    name: "Learning",
    accent: "border-[#B9D4E8] bg-[#F2F8FC]",
    tasks: [
      {
        title: "Finish AI workflow notes",
        meta: "Medium priority - Wednesday",
        badge: "Study",
      },
      {
        title: "Watch prompt design lesson",
        meta: "Low priority - Sunday",
        badge: "Course",
      },
    ],
  },
  {
    name: "Health",
    accent: "border-[#BFD9CF] bg-[#F2FAF6]",
    tasks: [
      {
        title: "Schedule morning run",
        meta: "Medium priority - Tomorrow 7:30 AM",
        badge: "Routine",
      },
    ],
  },
  {
    name: "Finance",
    accent: "border-[#D9CFA9] bg-[#FFF9E8]",
    tasks: [
      {
        title: "Review April subscriptions",
        meta: "High priority - Friday",
        badge: "Review",
      },
    ],
  },
  {
    name: "Errands",
    accent: "border-[#D5C8BD] bg-[#F9F5F1]",
    tasks: [],
  },
  {
    name: "Other",
    accent: "border-[#D8D0C6] bg-[#F8F5EF]",
    tasks: [
      {
        title: "Clean up saved article links",
        meta: "Low priority - This weekend",
        badge: "Admin",
      },
    ],
  },
];

const priorityOptions = [
  { label: "High", color: "bg-[#D5847A]" },
  { label: "Medium", color: "bg-[#D4B06A]" },
  { label: "Low", color: "bg-[#7FB38A]" },
];

export default function TodosLayoutPreviewPage() {
  return (
    <main className="min-h-screen bg-[#F6F3EE] text-[#2B2B2B]">
      <div className="flex min-h-screen">
        <aside className="hidden w-[92px] shrink-0 border-r border-[#E7DED2] bg-[#FFFDF9]/55 py-5 md:block">
          <div className="mb-7 text-center text-lg font-semibold">YoBoss</div>
          <nav className="flex flex-col items-center gap-4">
            {[
              { icon: Grid2X2, active: false },
              { icon: Flag, active: false },
              { icon: ListChecks, active: true },
              { icon: Network, active: false },
              { icon: Users, active: false },
            ].map(({ icon: Icon, active }, index) => (
              <div
                key={index}
                className={`flex h-11 w-11 items-center justify-center rounded-lg border ${
                  active
                    ? "border-[#B8D4F4] bg-[#FFFDF9] text-[#2B2B2B] shadow-[0_0_0_3px_rgba(127,174,230,0.18)]"
                    : "border-transparent text-[#6F6A64]"
                }`}
              >
                <Icon className="h-5 w-5" />
              </div>
            ))}
          </nav>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="flex flex-col gap-3 border-b border-[#E7DED2] bg-[#FFFDF9]/70 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-8">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7FAEE6]">
                Personal To-Dos
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">
                Plan and capture daily work
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden items-center gap-2 rounded-full border border-[#E7DED2] bg-[#FFFDF9] px-4 py-2 text-sm text-[#9B948B] lg:flex">
                <Search className="h-4 w-4" />
                Search tasks...
              </div>
              <button className="flex h-10 w-10 items-center justify-center rounded-full border border-[#E7DED2] bg-[#FFFDF9] text-[#6F6A64]">
                <Bell className="h-4 w-4" />
              </button>
              <button className="flex h-10 w-10 items-center justify-center rounded-full border border-[#E7DED2] bg-[#FFFDF9] text-[#6F6A64]">
                <Settings className="h-4 w-4" />
              </button>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FF4F1F] font-semibold text-white">
                T
              </div>
            </div>
          </header>

          <div className="px-4 py-6 md:px-8">
            <section className="mb-5 rounded-lg border border-[#D7CABB] bg-[#FFFDF9] p-4 shadow-[0_8px_24px_rgba(43,43,43,0.04)]">
              <div className="mb-3">
                <h2 className="text-lg font-semibold">Add a new to-do item</h2>
              </div>

              <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(320px,1fr)_150px_210px_160px_auto]">
                <div className="rounded-lg border border-[#DDD3C7] bg-[#F6F3EE] px-3 py-2">
                  <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9B948B]">
                    Task
                  </label>
                  <div className="mt-1 text-sm text-[#2B2B2B]">
                    Prepare client proposal outline
                  </div>
                </div>

                <button className="flex items-center justify-between rounded-lg border border-[#DDD3C7] bg-[#FFFDF9] px-3 py-2 text-left">
                  <span>
                    <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9B948B]">
                      Category
                    </span>
                    <span className="mt-1 block text-sm font-medium">Work</span>
                  </span>
                  <ChevronDown className="h-4 w-4 text-[#9B948B]" />
                </button>

                <div className="rounded-lg border border-[#DDD3C7] bg-[#FFFDF9] px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9B948B]">
                    Priority
                  </p>
                  <div className="mt-2 grid grid-cols-3 gap-1">
                    {priorityOptions.map((option, index) => (
                      <button
                        key={option.label}
                        className={`flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs font-semibold ${
                          index === 0
                            ? "bg-[#FFF5F3] text-[#9A615B]"
                            : "bg-[#F6F3EE] text-[#6F6A64]"
                        }`}
                      >
                        <span className={`h-2 w-2 rounded-full ${option.color}`} />
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <button className="flex items-center gap-2 rounded-lg border border-[#DDD3C7] bg-[#FFFDF9] px-3 py-2 text-left">
                  <CalendarDays className="h-4 w-4 text-[#7FAEE6]" />
                  <span>
                    <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9B948B]">
                      Deadline
                    </span>
                    <span className="mt-1 block text-sm font-medium">Today 5 PM</span>
                  </span>
                </button>

                <button className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#7FAEE6] px-5 py-2.5 text-sm font-semibold text-white">
                  <Plus className="h-4 w-4" />
                  Add task
                </button>
              </div>
            </section>

            <section className="min-w-0">
              <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <h2 className="text-base font-semibold">ToDos Board</h2>
                <div className="flex flex-wrap items-center gap-2">
                  <button className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#7FAEE6] px-3 py-2 text-sm font-semibold text-white">
                    <Plus className="h-4 w-4" />
                    Add category
                  </button>
                  <div className="flex rounded-lg border border-[#E7DED2] bg-[#F6F3EE] p-1">
                    <button className="rounded-md bg-[#FFFDF9] px-3 py-1.5 text-sm font-semibold text-[#2B2B2B] shadow-sm">
                      Pending 8
                    </button>
                    <button className="rounded-md px-3 py-1.5 text-sm font-semibold text-[#6F6A64]">
                      Done 12
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {columns.map((column) => (
                  <div
                    key={column.name}
                    className="rounded-lg border border-[#E7DED2] bg-[#FFFDF9] p-3"
                  >
                    <div className={`rounded-lg border px-3 py-2 ${column.accent}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex min-w-0 items-center gap-2">
                          <button
                            aria-label={`Drag ${column.name} category`}
                            className="flex h-6 w-6 shrink-0 cursor-grab items-center justify-center rounded-md text-[#9B948B] hover:bg-[#FFFDF9]"
                          >
                            <GripVertical className="h-4 w-4" />
                          </button>
                          <p className="text-sm font-semibold">{column.name}</p>
                        </div>
                        <span className="text-xs text-[#6F6A64]">
                          {column.tasks.length}
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 space-y-2">
                      {column.tasks.map((task) => (
                        <div
                          key={task.title}
                          className="rounded-lg border border-[#E7DED2] bg-[#FFFDF9] p-3 shadow-[0_2px_8px_rgba(43,43,43,0.03)]"
                        >
                          <div className="flex items-start gap-2">
                            <Circle className="mt-0.5 h-4 w-4 shrink-0 text-[#CFC3B5]" />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold leading-snug">
                                {task.title}
                              </p>
                              <p className="mt-1 text-xs text-[#9B948B]">
                                {task.meta}
                              </p>
                            </div>
                          </div>
                          <div className="mt-3 flex items-center justify-between">
                            <span className="rounded-full bg-[#EAF3FD] px-2 py-0.5 text-[11px] font-semibold text-[#5E8FCE]">
                              {task.badge}
                            </span>
                            <CheckCircle2 className="h-4 w-4 text-[#CFC3B5]" />
                          </div>
                        </div>
                      ))}
                      {column.tasks.length === 0 && (
                        <div className="rounded-lg border border-dashed border-[#DDD3C7] bg-[#F6F3EE] px-3 py-8 text-center text-sm text-[#B1A79B]">
                          No items yet
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
