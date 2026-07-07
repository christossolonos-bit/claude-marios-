import { Trash2 } from "lucide-react";
import type { Task, Priority } from "@/lib/tasks";
import type { Project } from "@/lib/projects";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const priorities: { value: Priority; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "med", label: "Medium" },
  { value: "high", label: "High" },
];

export default function TaskDetailDialog({
  task,
  projects,
  onClose,
  onPatch,
  onDelete,
}: {
  task: Task | null;
  projects: Project[];
  onClose: () => void;
  onPatch: (id: string, patch: Partial<Task>) => void;
  onDelete: (id: string) => void;
}) {
  if (!task) return null;

  return (
    <Dialog open={!!task} onClose={onClose}>
      <h2 className="mb-4 pr-6 text-lg font-semibold">Task details</h2>

      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium">Title</label>
          <Input
            value={task.title}
            onChange={(e) => onPatch(task.id, { title: e.target.value })}
            className="mt-1"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium">Date</label>
            <Input
              type="date"
              value={task.date ?? ""}
              onChange={(e) =>
                onPatch(task.id, { date: e.target.value || null })
              }
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Time</label>
            <Input
              type="time"
              value={task.time ?? ""}
              onChange={(e) =>
                onPatch(task.id, { time: e.target.value || null })
              }
              className="mt-1"
            />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium">Project</label>
          <select
            value={task.projectId ?? ""}
            onChange={(e) =>
              onPatch(task.id, { projectId: e.target.value || null })
            }
            className="mt-1 flex h-9 w-full rounded-md border border-border bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">No project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-sm font-medium">Priority</label>
          <div className="mt-1 flex gap-2">
            {priorities.map((p) => (
              <button
                key={p.value}
                onClick={() => onPatch(task.id, { priority: p.value })}
                className={cn(
                  "flex-1 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                  task.priority === p.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border hover:bg-accent",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-sm font-medium">Notes</label>
          <Textarea
            value={task.notes}
            onChange={(e) => onPatch(task.id, { notes: e.target.value })}
            className="mt-1"
            rows={4}
            placeholder="Agenda, links, details for this day..."
          />
        </div>

        <div className="flex items-center justify-between pt-2">
          <Button
            variant="ghost"
            onClick={() => onDelete(task.id)}
            className="text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            <Trash2 className="size-4" />
            Delete
          </Button>
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
    </Dialog>
  );
}
