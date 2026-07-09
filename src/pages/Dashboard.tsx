import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import { CalendarDays, LineChart, Lightbulb, Bot } from "lucide-react";
import { type Task, listTasks } from "@/lib/tasks";
import { todayISO, formatTimeLabel } from "@/lib/date";
import DailyBriefing from "@/components/DailyBriefing";

export default function Dashboard() {
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    listTasks().then(setTasks);
  }, []);

  const today = todayISO();
  const todayTasks = tasks
    .filter((t) => t.date === today && !t.done)
    .sort((a, b) => (a.time ?? "99").localeCompare(b.time ?? "99"));

  const stats = [
    {
      label: "Tasks today",
      value: String(todayTasks.length),
      icon: CalendarDays,
      hint: "Open in Schedule",
    },
    { label: "Books sold", value: "—", icon: LineChart, hint: "Sales module" },
    {
      label: "Seminar ideas",
      value: "—",
      icon: Lightbulb,
      hint: "Seminars module",
    },
    { label: "Assistant", value: "qwen3.5:4b", icon: Bot, hint: "Local Ollama" },
  ];

  return (
    <div className="p-8">
      <DailyBriefing />

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{s.label}</span>
                <s.icon className="size-4 text-muted-foreground" />
              </div>
              <div className="mt-2 text-2xl font-semibold">{s.value}</div>
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
