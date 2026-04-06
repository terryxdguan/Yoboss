import { CheckCircle2, Circle } from "lucide-react";

interface TeamMember {
  name: string;
  role: string;
  avatar?: string;
  initials?: string;
  initialsColor?: string;
  progress: number;
  tasks: { title: string; done: boolean }[];
}

const TEAM: TeamMember[] = [
  {
    name: "Adam J.",
    role: "UI Design",
    initials: "AJ",
    initialsColor: "#4C7CF0",
    progress: 75,
    tasks: [
      { title: "Styleguide update", done: true },
      { title: "Final review assets", done: false },
    ],
  },
  {
    name: "Eve K.",
    role: "Engineering",
    initials: "EK",
    initialsColor: "#4D8B6A",
    progress: 42,
    tasks: [
      { title: "API Migration", done: true },
      { title: "Bug fix #404", done: false },
    ],
  },
  {
    name: "Ben T.",
    role: "Marketing",
    initials: "BT",
    initialsColor: "#C6923D",
    progress: 90,
    tasks: [
      { title: "Draft newsletter", done: true },
      { title: "Approve social ads", done: false },
    ],
  },
  {
    name: "Angel L.",
    role: "Product Lead",
    initials: "AL",
    initialsColor: "#7C6DB0",
    progress: 60,
    tasks: [
      { title: "Quarterly review", done: true },
      { title: "Strategy roadmap", done: false },
    ],
  },
];

export function DashboardTeam() {
  return (
    <div>
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-[#1E2227]">Team</h2>
        <p className="mt-1 text-sm text-[#626A73]">
          Track each person&apos;s focus area and progress for today.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        {TEAM.map((member) => (
          <div
            key={member.name}
            className="rounded-[18px] border border-[#E6E1D8] bg-white p-5 shadow-[0_8px_24px_rgba(30,34,39,0.05)]"
          >
            <div className="mb-4 flex items-center gap-3">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-full text-xs font-semibold text-white"
                style={{ backgroundColor: member.initialsColor }}
              >
                {member.initials}
              </div>
              <div>
                <p className="text-sm font-semibold text-[#1E2227]">
                  {member.name}
                </p>
                <p className="text-[11px] uppercase tracking-[0.14em] text-[#8C939B]">
                  {member.role}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <div className="mb-1 flex justify-between text-[11px]">
                  <span className="text-[#626A73] font-medium">Progress</span>
                  <span className="text-[#4C7CF0] font-semibold">
                    {member.progress}%
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-[#F1EEE8] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#4C7CF0]"
                    style={{ width: `${member.progress}%` }}
                  />
                </div>
              </div>

              <ul className="space-y-2">
                {member.tasks.map((task) => (
                  <li
                    key={task.title}
                    className="flex items-start gap-2 text-sm"
                  >
                    {task.done ? (
                      <CheckCircle2 className="h-[18px] w-[18px] text-[#4D8B6A] shrink-0 fill-[#4D8B6A] stroke-white" />
                    ) : (
                      <Circle className="h-[18px] w-[18px] text-[#8C939B] shrink-0" />
                    )}
                    <span
                      className={
                        task.done
                          ? "text-[#626A73] line-through"
                          : "text-[#1E2227]"
                      }
                    >
                      {task.title}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
