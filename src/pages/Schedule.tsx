import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Check,
  Plus,
  StickyNote,
  ChevronLeft,
  ChevronRight,
  CalendarPlus,
} from "lucide-react";
import {
  type Task,
  type Priority,
  listTasks,
  addTask,
  updateTask,
  deleteTask,
} from "@/lib/tasks";
import { todayISO, formatTimeLabel } from "@/lib/date";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import TaskDetailDialog from "@/components/TaskDetailDialog";
import ScheduleAssistant from "@/components/ScheduleAssistant";
import { cn } from "@/lib/utils";

const priorityDot: Record<Priority, string> = {
  high: "bg-red-500",
  med: "bg-amber-500",
  low: "bg-zinc-400",
};

const priorityRank: Record<Priority, number> = { high: 0, med: 1, low: 2 };

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function iso(year: number, month: number, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

function sortTasks(items: Task[]): Task[] {
  return [...items].sort((a, b) => {
    if (a.time && b.time && a.time !== b.time)
      return a.time.localeCompare(b.time);
    if (a.time && !b.time) return -1;
    if (!a.time && b.time) return 1;
    if (a.priority !== b.priority)
      return priorityRank[a.priority] - priorityRank[b.priority];
    return a.createdAt - b.createdAt;
  });
}

/** Long label for the selected day, e.g. "Today · Fri, Jul 10". */
function dayHeading(dateISO: string): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  const label = new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const today = todayISO();
  if (dateISO === today) return `Today · ${label}`;
  return label;
}

export default function Schedule() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [selected, setSelected] = useState<Task | null>(null);
  const today = todayISO();
  const [selectedDate, setSelectedDate] = useState<string>(today);
  // Month currently shown in the grid.
  const [view, setView] = useState(() => {
    const [y, m] = today.split("-").map(Number);
    return { year: y, month: m - 1 };
  });

  const refresh = useCallback(async () => {
    setTasks(await listTasks());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Add a task straight onto the selected day.
  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    const task = await addTask(title);
    await updateTask(task.id, { date: selectedDate });
    setNewTitle("");
    refresh();
  }

  async function toggle(task: Task) {
    await updateTask(task.id, { done: !task.done });
    refresh();
  }

  async function patch(id: string, p: Partial<Task>) {
    await updateTask(id, p);
    setSelected((s) => (s && s.id === id ? { ...s, ...p } : s));
    refresh();
  }

  async function remove(id: string) {
    await deleteTask(id);
    setSelected(null);
    refresh();
  }

  async function assignToSelected(id: string) {
    await updateTask(id, { date: selectedDate });
    refresh();
  }

  // Count of not-done tasks per date, for the dots on each calendar cell.
  const countByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of tasks) {
      if (t.done || !t.date) continue;
      map.set(t.date, (map.get(t.date) ?? 0) + 1);
    }
    return map;
  }, [tasks]);

  // Build the month grid (Monday-first), padded to whole weeks.
  const cells = useMemo(() => {
    const { year, month } = view;
    const first = new Date(year, month, 1);
    const startOffset = (first.getDay() + 6) % 7; // Mon = 0
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const out: (number | null)[] = [];
    for (let i = 0; i < startOffset; i++) out.push(null);
    for (let d = 1; d <= daysInMonth; d++) out.push(d);
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [view]);

  const dayTasks = sortTasks(tasks.filter((t) => t.date === selectedDate));
  const dayActive = dayTasks.filter((t) => !t.done);
  const dayDone = dayTasks.filter((t) => t.done);
  const unscheduled = sortTasks(tasks.filter((t) => !t.date && !t.done));

  const monthLabel = new Date(view.year, view.month, 1).toLocaleDateString(
    undefined,
    { month: "long", year: "numeric" },
  );

  function shiftMonth(delta: number) {
    setView((v) => {
      const d = new Date(v.year, v.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  function goToday() {
    const [y, m] = today.split("-").map(Number);
    setView({ year: y, month: m - 1 });
    setSelectedDate(today);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border px-8 py-4">
        <CalendarDays className="size-6 text-primary" />
        <div>
          <h1 className="font-semibold tracking-tight">Schedule</h1>
          <p className="text-xs text-muted-foreground">
            Pick a day on the calendar, then plan its tasks on the right.
          </p>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Calendar */}
        <div className="min-w-0 flex-1 overflow-y-auto p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">{monthLabel}</h2>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" onClick={goToday}>
                Today
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => shiftMonth(-1)}
                title="Previous month"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => shiftMonth(1)}
                title="Next month"
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1">
            {WEEKDAYS.map((w) => (
              <div
                key={w}
                className="pb-1 text-center text-xs font-medium text-muted-foreground"
              >
                {w}
              </div>
            ))}
            {cells.map((day, i) => {
              if (day === null)
                return <div key={i} className="aspect-square" />;
              const cellISO = iso(view.year, view.month, day);
              const count = countByDate.get(cellISO) ?? 0;
              const isToday = cellISO === today;
              const isSelected = cellISO === selectedDate;
              return (
                <button
                  key={i}
                  onClick={() => setSelectedDate(cellISO)}
                  className={cn(
                    "flex aspect-square flex-col items-center justify-start rounded-lg border p-1.5 text-sm transition-colors",
                    isSelected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border hover:bg-accent",
                    !isSelected && isToday && "border-primary/60",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-6 items-center justify-center rounded-full text-xs font-medium",
                      isToday && !isSelected && "bg-primary/15 text-primary",
                    )}
                  >
                    {day}
                  </span>
                  {count > 0 && (
                    <span
                      className={cn(
                        "mt-auto rounded-full px-1.5 text-[10px] font-medium leading-4",
                        isSelected
                          ? "bg-primary-foreground/20 text-primary-foreground"
                          : "bg-primary/10 text-primary",
                      )}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Task list for the selected day */}
        <aside className="flex w-[360px] shrink-0 flex-col border-l border-border bg-muted/20">
          <div className="border-b border-border px-4 py-3">
            <div className="text-sm font-semibold">{dayHeading(selectedDate)}</div>
            <div className="text-xs text-muted-foreground">
              {dayActive.length === 0
                ? "Nothing planned"
                : `${dayActive.length} ${dayActive.length === 1 ? "task" : "tasks"}`}
            </div>
          </div>

          <form onSubmit={handleAdd} className="flex gap-2 border-b border-border p-3">
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Add a task for this day…"
              className="h-9"
            />
            <Button type="submit" size="sm" disabled={!newTitle.trim()}>
              <Plus className="size-4" />
            </Button>
          </form>

          <div className="flex-1 space-y-4 overflow-y-auto p-3">
            {dayActive.length === 0 && dayDone.length === 0 ? (
              <p className="px-1 py-6 text-center text-xs text-muted-foreground">
                No tasks on this day yet. Add one above, or assign an unscheduled
                task below.
              </p>
            ) : (
              <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
                {dayActive.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    onToggle={() => toggle(t)}
                    onOpen={() => setSelected(t)}
                  />
                ))}
                {dayDone.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    onToggle={() => toggle(t)}
                    onOpen={() => setSelected(t)}
                  />
                ))}
              </div>
            )}

            {unscheduled.length > 0 && (
              <section>
                <h3 className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  No date yet
                  <span className="ml-1.5 font-normal">{unscheduled.length}</span>
                </h3>
                <div className="divide-y divide-border overflow-hidden rounded-lg border border-dashed border-border bg-card">
                  {unscheduled.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent/50"
                    >
                      <span
                        className={cn(
                          "size-1.5 shrink-0 rounded-full",
                          priorityDot[t.priority],
                        )}
                      />
                      <button
                        onClick={() => setSelected(t)}
                        className="min-w-0 flex-1 truncate text-left"
                      >
                        {t.title}
                      </button>
                      <button
                        onClick={() => assignToSelected(t.id)}
                        title="Move to the selected day"
                        className="shrink-0 rounded p-1 text-muted-foreground hover:text-primary"
                      >
                        <CalendarPlus className="size-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </aside>
      </div>

      <TaskDetailDialog
        task={selected}
        onClose={() => setSelected(null)}
        onPatch={patch}
        onDelete={remove}
      />

      <ScheduleAssistant selectedDate={selectedDate} onChanged={refresh} />
    </div>
  );
}

function TaskRow({
  task,
  onToggle,
  onOpen,
}: {
  task: Task;
  onToggle: () => void;
  onOpen: () => void;
}) {
  return (
    <div className="flex items-start gap-3 px-3 py-2.5 transition-colors hover:bg-accent/50">
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        aria-label={task.done ? "Mark not done" : "Mark done"}
        className={cn(
          "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors",
          task.done
            ? "border-primary bg-primary text-primary-foreground"
            : "border-muted-foreground/40 hover:border-primary",
        )}
      >
        {task.done && <Check className="size-3" />}
      </button>

      <button onClick={onOpen} className="min-w-0 flex-1 text-left">
        <div
          className={cn(
            "text-sm",
            task.done && "text-muted-foreground line-through",
          )}
        >
          {task.title}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span
              className={cn("size-1.5 rounded-full", priorityDot[task.priority])}
            />
            {task.priority === "med" ? "medium" : task.priority}
          </span>
          {task.time && <span>· {formatTimeLabel(task.time)}</span>}
          {task.notes.trim() && (
            <span className="flex items-center gap-1">
              · <StickyNote className="size-3" /> notes
            </span>
          )}
        </div>
      </button>
    </div>
  );
}
