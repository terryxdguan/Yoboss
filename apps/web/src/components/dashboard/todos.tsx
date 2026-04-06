"use client";

import { CheckCircle2, Circle } from "lucide-react";

interface TodoItem {
  title: string;
  description: string;
  done: boolean;
}

interface TimeBlock {
  label: string;
  tasks: TodoItem[];
}

const TIME_BLOCKS: TimeBlock[] = [
  {
    label: "Morning",
    tasks: [
      {
        title: "Review overnight inbox",
        description: "Prioritize reminders and follow-ups",
        done: true,
      },
      {
        title: "Finalize product sync notes",
        description: "Prepare the summary for the team",
        done: false,
      },
    ],
  },
  {
    label: "Afternoon",
    tasks: [
      {
        title: "Review workflow blockers",
        description: "Check dependencies across active workstreams",
        done: false,
      },
      {
        title: "Update goal progress",
        description: "Sync status across current initiatives",
        done: false,
      },
      {
        title: "Approve team priorities",
        description: "Lock this afternoon's execution plan",
        done: true,
      },
    ],
  },
  {
    label: "Night",
    tasks: [
      {
        title: "Send end-of-day summary",
        description: "Share progress and unresolved items",
        done: false,
      },
      {
        title: "Plan tomorrow's top 3 tasks",
        description: "Set up a clean start for the next day",
        done: false,
      },
    ],
  },
];

export function DashboardTodos() {
  const totalTasks = TIME_BLOCKS.reduce((sum, b) => sum + b.tasks.length, 0);

  return (
    <div className="rounded-[18px] border border-[#E6E1D8] bg-white p-6 shadow-[0_8px_24px_rgba(30,34,39,0.05)]">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-[#1E2227]">
            Today&apos;s To-Do List
          </h2>
          <p className="mt-1 text-sm text-[#626A73]">
            Organized by time of day so the team can stay focused.
          </p>
        </div>
        <span className="rounded-full bg-[#EAF0FF] px-3 py-1 text-xs font-semibold text-[#4C7CF0]">
          {totalTasks} items
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {TIME_BLOCKS.map((block) => (
          <div
            key={block.label}
            className="rounded-[18px] border border-[#E6E1D8] bg-[#F1EEE8] p-5"
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-[#1E2227]">
                {block.label}
              </h3>
              <span className="text-[11px] font-semibold text-[#8C939B]">
                {block.tasks.length} tasks
              </span>
            </div>
            <ul className="space-y-3">
              {block.tasks.map((task) => (
                <li key={task.title} className="flex items-start gap-3">
                  {task.done ? (
                    <CheckCircle2 className="h-5 w-5 text-[#4D8B6A] shrink-0 mt-0.5 fill-[#4D8B6A] stroke-white" />
                  ) : (
                    <Circle className="h-5 w-5 text-[#8C939B] shrink-0 mt-0.5" />
                  )}
                  <div>
                    <p className="text-sm font-medium text-[#1E2227]">
                      {task.title}
                    </p>
                    <p className="text-[12px] text-[#626A73] mt-0.5">
                      {task.description}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
