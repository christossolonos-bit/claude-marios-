import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import { CalendarDays, LineChart, Lightbulb, Bot } from "lucide-react";

const stats = [
  { label: "Tasks today", value: "—", icon: CalendarDays, hint: "Schedule module" },
  { label: "Books sold", value: "—", icon: LineChart, hint: "Sales module" },
  { label: "Seminar ideas", value: "—", icon: Lightbulb, hint: "Seminars module" },
  { label: "Assistant", value: "qwen3.5:4b", icon: Bot, hint: "Local Ollama" },
];

export default function Dashboard() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Good to see you 👋</h1>
      <p className="mb-6 text-muted-foreground">
        Here's your day at a glance. Modules light up as we build them.
      </p>

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
          <CardContent className="text-sm text-muted-foreground">
            Nothing scheduled yet — the Schedule module arrives in Phase 1.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Ask your coach</CardTitle>
            <CardDescription>Local AI assistant</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Your personalized Ollama assistant comes online in Phase 2.
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
