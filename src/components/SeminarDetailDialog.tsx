import { useState } from "react";
import { Trash2, Sparkles, Loader2, FolderPlus, AlertCircle } from "lucide-react";
import { type Seminar, STATUS_ORDER, statusMeta } from "@/lib/seminars";
import { streamChat } from "@/lib/ollama";
import { getSettings } from "@/lib/settings";
import { addProject, updateProject } from "@/lib/projects";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function SeminarDetailDialog({
  seminar,
  onClose,
  onPatch,
  onDelete,
}: {
  seminar: Seminar | null;
  onClose: () => void;
  onPatch: (id: string, patch: Partial<Seminar>) => void;
  onDelete: (id: string) => void;
}) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [projectMsg, setProjectMsg] = useState<string | null>(null);

  if (!seminar) return null;

  async function generateOutline() {
    if (!seminar) return;
    setError(null);
    setGenerating(true);
    const s = getSettings();
    const system =
      "You are a seminar and workshop design expert helping a life coach structure a talk. Produce a clear, practical outline in markdown.";
    const user =
      `Create a structured outline for a seminar titled "${seminar.title}".` +
      (seminar.notes.trim() ? `\n\nThe coach's notes:\n${seminar.notes}` : "") +
      `\n\nInclude: a compelling opening hook, 3-5 main sections each with a few key points, one interactive exercise for the audience, and a closing takeaway. Use markdown headings and bullet points. Keep it concise and actionable.`;
    let acc = "";
    try {
      await streamChat({
        model: s.model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        onToken: (t) => {
          acc += t;
          onPatch(seminar!.id, { outline: acc });
        },
      });
    } catch (e) {
      setError((e as Error).message || String(e));
    } finally {
      setGenerating(false);
    }
  }

  async function createProject() {
    if (!seminar) return;
    const p = await addProject(seminar.title);
    if (seminar.notes.trim()) await updateProject(p.id, { description: seminar.notes });
    setProjectMsg("Added to Projects ✓");
  }

  return (
    <Dialog open={!!seminar} onClose={onClose} className="max-w-2xl">
      <h2 className="mb-4 pr-6 text-lg font-semibold">Seminar</h2>

      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium">Title</label>
          <Input
            value={seminar.title}
            onChange={(e) => onPatch(seminar.id, { title: e.target.value })}
            className="mt-1"
          />
        </div>

        <div>
          <label className="text-sm font-medium">Status</label>
          <div className="mt-1 grid grid-cols-4 gap-2">
            {STATUS_ORDER.map((st) => (
              <button
                key={st}
                onClick={() => onPatch(seminar.id, { status: st })}
                className={cn(
                  "rounded-md border px-2 py-1.5 text-sm font-medium transition-colors",
                  seminar.status === st
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border hover:bg-accent",
                )}
              >
                {statusMeta[st].label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-sm font-medium">Your notes</label>
          <Textarea
            value={seminar.notes}
            onChange={(e) => onPatch(seminar.id, { notes: e.target.value })}
            rows={3}
            className="mt-1"
            placeholder="Raw thoughts, angle, audience, key message..."
          />
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-sm font-medium">Outline</label>
            <Button
              variant="outline"
              size="sm"
              onClick={generateOutline}
              disabled={generating}
            >
              {generating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              {generating ? "Generating…" : "Generate with AI"}
            </Button>
          </div>
          <Textarea
            value={seminar.outline}
            onChange={(e) => onPatch(seminar.id, { outline: e.target.value })}
            rows={9}
            className="font-mono text-xs leading-relaxed"
            placeholder="Click 'Generate with AI' to have your local coach draft a structured outline — or write your own."
          />
          {error && (
            <div className="mt-2 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertCircle className="size-4 shrink-0" />
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between pt-2">
          <Button
            variant="ghost"
            onClick={() => onDelete(seminar.id)}
            className="text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            <Trash2 className="size-4" />
            Delete
          </Button>
          <div className="flex items-center gap-2">
            {projectMsg && (
              <span className="text-xs text-green-600">{projectMsg}</span>
            )}
            <Button variant="outline" onClick={createProject}>
              <FolderPlus className="size-4" />
              Create project
            </Button>
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
