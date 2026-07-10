import { useCallback, useEffect, useRef, useState } from "react";
import {
  Wand2,
  Sparkles,
  Loader2,
  Copy,
  Check,
  Square,
  Plus,
  Pencil,
  Trash2,
  AlertCircle,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  type Skill,
  listSkills,
  createSkill,
  updateSkill,
  deleteSkill,
  buildSkillMessages,
  skillNeedsInput,
} from "@/lib/skills";
import { streamChat } from "@/lib/ollama";
import { getSettings } from "@/lib/settings";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Draft = Pick<Skill, "emoji" | "name" | "description" | "system" | "template">;

const EMPTY_DRAFT: Draft = {
  emoji: "✨",
  name: "",
  description: "",
  system: "",
  template: "{{input}}",
};

export default function Skills() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [selected, setSelected] = useState<Skill | null>(null);
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);

  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    setSkills(await listSkills());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function pick(skill: Skill) {
    stop();
    setSelected(skill);
    setOutput("");
    setError(null);
    setInput("");
  }

  async function run() {
    if (!selected || running) return;
    if (skillNeedsInput(selected) && !input.trim()) return;
    setError(null);
    setCopied(false);
    setOutput("");
    setRunning(true);
    const { system, user } = buildSkillMessages(selected, input);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      await streamChat({
        model: getSettings().model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        signal: ac.signal,
        onToken: (t) => setOutput((prev) => prev + t),
      });
    } catch (e) {
      const err = e as Error;
      if (err.name !== "AbortError") setError(err.message || String(e));
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  async function copyOut() {
    if (!output.trim()) return;
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function openNew() {
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setEditorOpen(true);
  }

  function openEdit(skill: Skill) {
    setEditingId(skill.id);
    setDraft({
      emoji: skill.emoji,
      name: skill.name,
      description: skill.description,
      system: skill.system,
      template: skill.template,
    });
    setEditorOpen(true);
  }

  async function saveDraft() {
    const clean: Draft = {
      emoji: draft.emoji.trim() || "✨",
      name: draft.name.trim(),
      description: draft.description.trim(),
      system: draft.system.trim(),
      template: draft.template.trim() || "{{input}}",
    };
    if (!clean.name || !clean.system) return;
    if (editingId) {
      await updateSkill(editingId, clean);
    } else {
      await createSkill(clean);
    }
    setEditorOpen(false);
    const fresh = await listSkills();
    setSkills(fresh);
    // Keep the runner in sync if the edited skill is the selected one.
    if (editingId && selected?.id === editingId) {
      setSelected(fresh.find((s) => s.id === editingId) ?? null);
    }
  }

  async function remove(skill: Skill) {
    if (!confirm(`Delete the "${skill.name}" skill?`)) return;
    await deleteSkill(skill.id);
    if (selected?.id === skill.id) setSelected(null);
    refresh();
  }

  const canSave = draft.name.trim() && draft.system.trim();

  return (
    <div className="mx-auto max-w-4xl p-8">
      <div className="mb-1 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Wand2 className="size-7 text-primary" />
          <h1 className="text-2xl font-semibold tracking-tight">Skills</h1>
        </div>
        <Button onClick={openNew}>
          <Plus className="size-4" />
          New skill
        </Button>
      </div>
      <p className="mb-6 text-muted-foreground">
        Reusable AI prompts you can build yourself — teach the app a new trick,
        then run it on any text. All local, all yours.
      </p>

      {selected && (
        <Card className="mb-6 border-primary/40">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2">
              <span className="text-lg">{selected.emoji}</span>
              {selected.name}
            </CardTitle>
            <button
              onClick={() => setSelected(null)}
              aria-label="Close runner"
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </CardHeader>
          <CardContent className="space-y-4">
            {skillNeedsInput(selected) && (
              <div>
                <label className="text-sm font-medium">Your text</label>
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  rows={4}
                  className="mt-1"
                  placeholder="Paste or type what this skill should work on…"
                />
              </div>
            )}

            <div className="flex items-center gap-2">
              {running ? (
                <Button variant="outline" onClick={stop}>
                  <Square className="size-4" />
                  Stop
                </Button>
              ) : (
                <Button
                  onClick={run}
                  disabled={skillNeedsInput(selected) && !input.trim()}
                >
                  <Sparkles className="size-4" />
                  Run
                </Button>
              )}
              {running && (
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Working…
                </span>
              )}
              {(output || running) && !running && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={copyOut}
                  disabled={!output.trim()}
                  className="ml-auto"
                >
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              )}
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                <AlertCircle className="size-4 shrink-0" />
                {error}
              </div>
            )}

            {(output || running) && (
              <div className="rounded-md border border-border bg-muted/30 p-4">
                <div className="md text-sm leading-relaxed">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {output || "…"}
                  </ReactMarkdown>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {skills.map((s) => (
          <Card
            key={s.id}
            className={cn(
              "group relative cursor-pointer transition-colors hover:border-primary/50",
              selected?.id === s.id && "border-primary",
            )}
            onClick={() => pick(s)}
          >
            <CardContent className="flex items-start gap-3 pt-5 pr-16">
              <span className="text-2xl leading-none">{s.emoji}</span>
              <div className="min-w-0 flex-1">
                <div className="font-medium">{s.name}</div>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {s.description || "No description"}
                </p>
              </div>
            </CardContent>
            <div className="absolute right-3 top-3 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  openEdit(s);
                }}
                aria-label="Edit skill"
                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Pencil className="size-4" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  remove(s);
                }}
                aria-label="Delete skill"
                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-red-600"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          </Card>
        ))}
      </div>

      {skills.length === 0 && (
        <div className="mt-10 text-center text-sm text-muted-foreground">
          No skills yet. Click <span className="font-medium">New skill</span> to
          create your first one.
        </div>
      )}

      <Dialog
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        className="max-w-xl"
      >
        <h2 className="mb-4 text-lg font-semibold">
          {editingId ? "Edit skill" : "New skill"}
        </h2>
        <div className="space-y-4">
          <div className="flex gap-3">
            <div className="w-20">
              <label className="text-sm font-medium">Icon</label>
              <Input
                value={draft.emoji}
                onChange={(e) => setDraft({ ...draft, emoji: e.target.value })}
                className="mt-1 text-center text-lg"
                maxLength={2}
              />
            </div>
            <div className="flex-1">
              <label className="text-sm font-medium">Name</label>
              <Input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                className="mt-1"
                placeholder="e.g. Rewrite warmer"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Description</label>
            <Input
              value={draft.description}
              onChange={(e) =>
                setDraft({ ...draft, description: e.target.value })
              }
              className="mt-1"
              placeholder="A short line describing what this does"
            />
          </div>

          <div>
            <label className="text-sm font-medium">
              Instructions{" "}
              <span className="font-normal text-muted-foreground">
                (the AI's role)
              </span>
            </label>
            <Textarea
              value={draft.system}
              onChange={(e) => setDraft({ ...draft, system: e.target.value })}
              rows={3}
              className="mt-1"
              placeholder="You are a warm editor. Rewrite the text to sound warmer… Return only the result."
            />
          </div>

          <div>
            <label className="text-sm font-medium">Template</label>
            <Textarea
              value={draft.template}
              onChange={(e) => setDraft({ ...draft, template: e.target.value })}
              rows={2}
              className="mt-1 font-mono text-xs"
              placeholder="Rewrite this:\n\n{{input}}"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Use{" "}
              <code className="rounded bg-muted px-1 py-0.5">{"{{input}}"}</code>{" "}
              where your text goes. Leave it out for a skill that needs no input.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setEditorOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveDraft} disabled={!canSave}>
              {editingId ? "Save changes" : "Create skill"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
