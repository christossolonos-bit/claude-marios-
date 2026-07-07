import { useCallback, useEffect, useState } from "react";
import { FolderKanban, Plus } from "lucide-react";
import {
  type Project,
  STATUS_ORDER,
  statusMeta,
  listProjects,
  addProject,
  updateProject,
  deleteProject,
} from "@/lib/projects";
import { type Task, listTasks } from "@/lib/tasks";
import { formatDateLabel } from "@/lib/date";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import ProjectDetailDialog from "@/components/ProjectDetailDialog";
import { cn } from "@/lib/utils";

export default function Projects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newName, setNewName] = useState("");
  const [selected, setSelected] = useState<Project | null>(null);

  const refresh = useCallback(async () => {
    const [p, t] = await Promise.all([listProjects(), listTasks()]);
    setProjects(p);
    setTasks(t);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    await addProject(name);
    setNewName("");
    refresh();
  }

  async function patch(id: string, p: Partial<Project>) {
    await updateProject(id, p);
    setSelected((s) => (s && s.id === id ? { ...s, ...p } : s));
    refresh();
  }

  async function remove(id: string) {
    await deleteProject(id);
    setSelected(null);
    refresh();
  }

  const counts = (id: string) => {
    const linked = tasks.filter((t) => t.projectId === id);
    return { total: linked.length, done: linked.filter((t) => t.done).length };
  };

  const groups = STATUS_ORDER.map((status) => ({
    status,
    items: projects.filter((p) => p.status === status),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="mx-auto max-w-4xl p-8">
      <div className="mb-1 flex items-center gap-3">
        <FolderKanban className="size-7 text-primary" />
        <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
      </div>
      <p className="mb-6 text-muted-foreground">
        Your books, courses, and coaching projects. Click one to edit its
        details and status.
      </p>

      <form onSubmit={handleAdd} className="mb-6 flex gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New project name..."
        />
        <Button type="submit" disabled={!newName.trim()}>
          <Plus className="size-4" />
          Add
        </Button>
      </form>

      {projects.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No projects yet. Add your book or a coaching program to start tracking
          it.
        </div>
      )}

      <div className="space-y-6">
        {groups.map((group) => {
          const meta = statusMeta[group.status];
          return (
            <section key={group.status}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {meta.label}
                <span className="ml-2 font-normal">{group.items.length}</span>
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {group.items.map((p) => {
                  const c = counts(p.id);
                  const pct = c.total ? Math.round((c.done / c.total) * 100) : 0;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setSelected(p)}
                      className="rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-accent/50"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium">{p.name}</span>
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                            meta.pill,
                          )}
                        >
                          {meta.label}
                        </span>
                      </div>
                      {p.description.trim() && (
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                          {p.description}
                        </p>
                      )}
                      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                          {c.total ? `${c.done}/${c.total} tasks` : "No tasks yet"}
                        </span>
                        {p.dueDate && <span>Due {formatDateLabel(p.dueDate)}</span>}
                      </div>
                      {c.total > 0 && (
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <ProjectDetailDialog
        project={selected}
        onClose={() => setSelected(null)}
        onPatch={patch}
        onDelete={remove}
      />
    </div>
  );
}
