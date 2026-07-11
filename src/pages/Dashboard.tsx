import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import { CalendarDays, PenLine, Flame, Bot, type LucideIcon } from "lucide-react";
import { type Task, listTasks } from "@/lib/tasks";
import { getStats, type WritingStats } from "@/lib/writingGoal";
import { getSettings } from "@/lib/settings";
import { todayISO, formatTimeLabel } from "@/lib/date";
import DailyBriefing from "@/components/DailyBriefing";

// Compact display for a model id: drop the provider prefix and the ":free"
// suffix so long OpenRouter ids don't overflow the stat card.
function shortModel(id: string): string {
  const base = id.includes("/") ? id.split("/").pop()! : id;
  return base.replace(/:free$/, "") || id;
}

export default function Dashboard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [writing, setWriting] = useState<WritingStats>(() => getStats());

  useEffect(() => {
    listTasks().then(setTasks);
    setWriting(getStats());
  }, []);

  const today = todayISO();
  const todayTasks = tasks
    .filter((t) => t.date === today && !t.done)
    .sort((a, b) => (a.time ?? "99").localeCompare(b.time ?? "99"));

  // Reflect the model the app is actually configured to use, not a fixed name.
  const cfg = getSettings();
  const activeModel =
    cfg.provider === "openrouter" ? cfg.openrouterModel : cfg.model;
  const providerHint =
    cfg.provider === "openrouter" ? "OpenRouter cloud" : "Local Ollama";

  const stats: {
    label: string;
    value: string;
    icon: LucideIcon;
    hint: string;
    title?: string;
  }[] = [
    {
      label: "Tasks today",
      value: String(todayTasks.length),
      icon: CalendarDays,
      hint: "Open in Schedule",
    },
    {
      label: "Words today",
      value: String(writing.today),
      icon: PenLine,
      hint: `Goal ${writing.goal}`,
    },
    {
      label: "Writing streak",
      value: writing.streak ? `${writing.streak} day${writing.streak === 1 ? "" : "s"}` : "—",
      icon: Flame,
      hint: "Days hitting your goal",
    },
    {
      label: "Assistant",
      value: shortModel(activeModel),
      icon: Bot,
      hint: providerHint,
      title: activeModel,
    },
  ];

  return (
    <div className="p-8">
      <DailyBriefing onAction={() => listTasks().then(setTasks)} />

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{s.label}</span>
                <s.icon className="size-4 text-muted-foreground" />
              </div>
              <div
                className="mt-2 truncate text-2xl font-semibold"
                title={s.title ?? s.value}
              >
                {s.value}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{s.hint}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Today's schedule</CardTitle>
            <CardDescription>Your plan for the day</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            {todayTasks.length === 0 ? (
              <p className="text-muted-foreground">
                Nothing scheduled for today.{" "}
                <Link to="/schedule" className="text-primary hover:underline">
                  Add a task
                </Link>
                .
              </p>
            ) : (
              <ul className="space-y-2">
                {todayTasks.map((t) => (
                  <li key={t.id} className="flex items-center gap-3">
                    <span className="w-14 shrink-0 text-xs text-muted-foreground">
                      {t.time ? formatTimeLabel(t.time) : "—"}
                    </span>
                    <span>{t.title}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Ask your coach</CardTitle>
            <CardDescription>Local AI assistant</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Plan your day, draft ideas, or hand off a task.{" "}
            <Link to="/assistant" className="text-primary hover:underline">
              Open the assistant
            </Link>
            .
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
