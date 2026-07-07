import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Check, Plus, StickyNote } from "lucide-react";
import {
  type Task,
  type Priority,
  listTasks,
  addTask,
  updateTask,
  deleteTask,
} from "@/lib/tasks";
import { todayISO, formatDateLabel, formatTimeLabel } from "@/lib/date";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import TaskDetailDialog from "@/components/TaskDetailDialog";
import { cn } from "@/lib/utils";

const priorityDot: Record<Priority, string> = {
  high: "bg-red-500",
  med: "bg-amber-500",
  low: "bg-zinc-400",
};

const priorityRank: Record<Priority, number> = { high: 0, med: 1, low: 2 };

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

export default function Schedule() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [selected, setSelected] = useState<Task | null>(null);

  const refresh = useCallback(async () => {
    setTasks(await listTasks());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    await addTask(title);
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

  const today = todayISO();
  const active = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);

  const groups = [
    {
      key: "overdue",
      label: "Overdue",
      items: sortTasks(active.filter((t) => t.date && t.date < today)),
    },
    {
      key: "today",
      label: "Today",
      items: sortTasks(active.filter((t) => t.date === today)),
    },
    {
      key: "upcoming",
      label: "Upcoming",
      items: sortTasks(active.filter((t) => t.date && t.date > today)),
    },
    {
      key: "someday",
      label: "No date yet",
      items: sortTasks(active.filter((t) => !t.date)),
    },
  ].filter((g) => g.items.length > 0);

  return (
    <div className="mx-auto max-w-3xl p-8">
      <div className="mb-1 flex items-center gap-3">
        <CalendarDays className="size-7 text-primary" />
        <h1 className="text-2xl font-semibold tracking-tight">Schedule</h1>
      </div>
      <p className="mb-6 text-muted-foreground">
        Your to-do list. Click any task to set a day, time, and details.
      </p>

      <form onSubmit={handleAdd} className="mb-6 flex gap-2">
        <Input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Add a task and press Enter..."
        />
        <Button type="submit" disabled={!newTitle.trim()}>
          <Plus className="size-4" />
          Add
        </Button>
      </form>

      {tasks.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No tasks yet. Add your first one above to start planning the day.
        </div>
      )}

      <div className="space-y-6">
        {groups.map((group) => (
          <section key={group.key}>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {group.label}
              <span className="ml-2 font-normal">{group.items.length}</span>
            </h2>
            <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
              {group.items.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  onToggle={() => toggle(t)}
                  onOpen={() => setSelected(t)}
                />
              ))}
            </div>
          </section>
        ))}

        {done.length > 0 && (
          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Completed
              <span className="ml-2 font-normal">{done.length}</span>
            </h2>
            <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
              {done.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  onToggle={() => toggle(t)}
                  onOpen={() => setSelected(t)}
                />
              ))}
            </div>
          </section>
        )}
      </div>

      <TaskDetailDialog
        task={selected}
        onClose={() => setSelected(null)}
        onPatch={patch}
        onDelete={remove}
      />
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
    <div className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-accent/50">
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

      <button
        onClick={onOpen}
        className="flex-1 text-left"
      >
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
            <span className={cn("size-1.5 rounded-full", priorityDot[task.priority])} />
            {task.priority === "med" ? "medium" : task.priority}
          </span>
          {task.date && (
            <span>
              · {formatDateLabel(task.date)}
              {task.time && ` at ${formatTimeLabel(task.time)}`}
            </span>
          )}
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
