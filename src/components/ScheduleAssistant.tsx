import { TOOLS, executeTool } from "@/lib/assistantTools";
import { getSettings } from "@/lib/settings";
import { listTasks } from "@/lib/tasks";
import { listMemories, memoryContext } from "@/lib/coachMemory";
import { todayISO, formatDateLabel, formatTimeLabel } from "@/lib/date";
import FloatingAssistant from "@/components/FloatingAssistant";

// Schedule-scoped system prompt: this assistant DOES act (task tools), and it
// knows which day is selected in the calendar so bare "add X at 3pm" lands there.
async function buildSystem(selectedDate: string): Promise<string> {
  const s = getSettings();
  const [tasks, memories] = await Promise.all([listTasks(), listMemories()]);
  const today = todayISO();
  const now = new Date();
  const dateLine = `Today is ${now.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })} (${today}).`;

  const pad = (n: number) => String(n).padStart(2, "0");
  const ref: string[] = [];
  for (let i = 0; i < 8; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    const iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const wd = d.toLocaleDateString(undefined, { weekday: "long" });
    const rel = i === 0 ? " (today)" : i === 1 ? " (tomorrow)" : "";
    ref.push(`${wd} = ${iso}${rel}`);
  }
  const dateRefLine = `Date reference for resolving days:\n${ref.join("\n")}`;

  const selLine = `In the calendar he currently has ${formatDateLabel(
    selectedDate,
  )} (${selectedDate}) selected. If he asks to add or schedule something WITHOUT naming a day, use ${selectedDate} as the date. If he names a day, resolve it to an absolute YYYY-MM-DD.`;

  const roleLine =
    "You are his schedule assistant. Use your tools to add, reschedule, rename, complete, or remove tasks and reminders, and to remember durable facts about him. Call a tool whenever he asks to add, schedule, change, complete, remove, or note something. After acting, confirm briefly and naturally — keep replies short and friendly, like a text message. When he is only asking a question, just answer; don't call a tool.";

  const open = tasks.filter((t) => !t.done);
  const lines: string[] = [];
  const fmt = (t: (typeof tasks)[number]) =>
    `- ${t.time ? formatTimeLabel(t.time) + " " : ""}${t.title}${
      t.date ? ` (${t.date})` : " (no date)"
    }`;
  for (const t of open.slice(0, 20)) lines.push(fmt(t));

  return [
    s.persona,
    dateLine,
    dateRefLine,
    selLine,
    roleLine,
    memoryContext(memories),
    lines.length
      ? `His current open tasks:\n${lines.join("\n")}`
      : "He has no open tasks right now.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export interface ScheduleAssistantProps {
  /** Day currently selected in the calendar (YYYY-MM-DD). */
  selectedDate: string;
  /** Called after a tool changes data so the calendar/list can refresh. */
  onChanged: () => void;
}

/**
 * The Schedule tab's floating assistant — a tool-capable variant of the shared
 * FloatingAssistant that can add, reschedule, and complete tasks on the
 * calendar and remember facts.
 */
export default function ScheduleAssistant({
  selectedDate,
  onChanged,
}: ScheduleAssistantProps) {
  return (
    <FloatingAssistant
      title="Schedule assistant"
      subtitle="Ask me to add or move tasks"
      emptyHint="Try “add a call with the publisher at 3pm”, “move the launch prep to Friday”, or “what's on for today?”"
      storageKey="schedule"
      buildSystem={() => buildSystem(selectedDate)}
      tools={TOOLS}
      executeTool={executeTool}
      onAction={onChanged}
    />
  );
}
