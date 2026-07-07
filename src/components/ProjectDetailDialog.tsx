import { Trash2 } from "lucide-react";
import { type Project, STATUS_ORDER, statusMeta } from "@/lib/projects";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function ProjectDetailDialog({
  project,
  onClose,
  onPatch,
  onDelete,
}: {
  project: Project | null;
  onClose: () => void;
  onPatch: (id: string, patch: Partial<Project>) => void;
  onDelete: (id: string) => void;
}) {
  if (!project) return null;

  return (
    <Dialog open={!!project} onClose={onClose}>
      <h2 className="mb-4 pr-6 text-lg font-semibold">Project details</h2>

      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium">Name</label>
          <Input
            value={project.name}
            onChange={(e) => onPatch(project.id, { name: e.target.value })}
            className="mt-1"
          />
        </div>

        <div>
          <label className="text-sm font-medium">Description</label>
          <Textarea
            value={project.description}
            onChange={(e) =>
              onPatch(project.id, { description: e.target.value })
            }
            rows={3}
            className="mt-1"
            placeholder="What is this project about?"
          />
        </div>

        <div>
          <label className="text-sm font-medium">Status</label>
          <div className="mt-1 grid grid-cols-2 gap-2">
            {STATUS_ORDER.map((s) => (
              <button
                key={s}
                onClick={() => onPatch(project.id, { status: s })}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                  project.status === s
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border hover:bg-accent",
                )}
              >
                {statusMeta[s].label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-sm font-medium">Due date</label>
          <Input
            type="date"
            value={project.dueDate ?? ""}
            onChange={(e) =>
              onPatch(project.id, { dueDate: e.target.value || null })
            }
            className="mt-1"
          />
        </div>

        <div className="flex items-center justify-between pt-2">
          <Button
            variant="ghost"
            onClick={() => onDelete(project.id)}
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
