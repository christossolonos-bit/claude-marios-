import { useCallback, useEffect, useState } from "react";
import { Lightbulb, Plus, Sparkles } from "lucide-react";
import {
  type Seminar,
  STATUS_ORDER,
  statusMeta,
  listSeminars,
  addSeminar,
  updateSeminar,
  deleteSeminar,
} from "@/lib/seminars";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import SeminarDetailDialog from "@/components/SeminarDetailDialog";
import { cn } from "@/lib/utils";

export default function Seminars() {
  const [seminars, setSeminars] = useState<Seminar[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [selected, setSelected] = useState<Seminar | null>(null);

  const refresh = useCallback(async () => {
    setSeminars(await listSeminars());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    await addSeminar(title);
    setNewTitle("");
    refresh();
  }

  async function patch(id: string, p: Partial<Seminar>) {
    await updateSeminar(id, p);
    setSelected((s) => (s && s.id === id ? { ...s, ...p } : s));
    refresh();
  }

  async function remove(id: string) {
    await deleteSeminar(id);
    setSelected(null);
    refresh();
  }

  const groups = STATUS_ORDER.map((status) => ({
    status,
    items: seminars.filter((s) => s.status === status),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="mx-auto max-w-4xl p-8">
      <div className="mb-1 flex items-center gap-3">
        <Lightbulb className="size-7 text-primary" />
        <h1 className="text-2xl font-semibold tracking-tight">Seminars</h1>
      </div>
      <p className="mb-6 text-muted-foreground">
        Capture seminar ideas and let your local coach help you outline them.
      </p>

      <form onSubmit={handleAdd} className="mb-6 flex gap-2">
        <Input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="New seminar idea..."
        />
        <Button type="submit" disabled={!newTitle.trim()}>
          <Plus className="size-4" />
          Add
        </Button>
      </form>

      {seminars.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No seminar ideas yet. Jot one down, then click it to shape it with AI.
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
                {group.items.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSelected(s)}
                    className="rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-accent/50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium">{s.title}</span>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                          meta.pill,
                        )}
                      >
                        {meta.label}
                      </span>
                    </div>
                    {s.notes.trim() && (
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                        {s.notes}
                      </p>
                    )}
                    {s.outline.trim() && (
                      <span className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Sparkles className="size-3" />
                        Outline ready
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <SeminarDetailDialog
        seminar={selected}
        onClose={() => setSelected(null)}
        onPatch={patch}
        onDelete={remove}
      />
    </div>
  );
}
