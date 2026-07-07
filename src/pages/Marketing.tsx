import { useCallback, useEffect, useRef, useState } from "react";
import {
  Megaphone,
  Sparkles,
  Loader2,
  Copy,
  Check,
  Save,
  Trash2,
  Square,
  AlertCircle,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  CONTENT_TYPES,
  TONES,
  buildMessages,
  contentTypeLabel,
  type SavedContent,
  listSaved,
  addSaved,
  deleteSaved,
} from "@/lib/marketing";
import { streamChat } from "@/lib/ollama";
import { getSettings } from "@/lib/settings";
import { listProjects } from "@/lib/projects";
import { listSeminars } from "@/lib/seminars";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const selectClass =
  "mt-1 flex h-9 w-full rounded-md border border-border bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export default function Marketing() {
  const [typeId, setTypeId] = useState("tweet");
  const [subject, setSubject] = useState("");
  const [tone, setTone] = useState("Inspiring");
  const [output, setOutput] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [savedNote, setSavedNote] = useState(false);
  const [saved, setSaved] = useState<SavedContent[]>([]);
  const [sources, setSources] = useState<{ projects: string[]; seminars: string[] }>(
    { projects: [], seminars: [] },
  );
  const abortRef = useRef<AbortController | null>(null);

  const refreshSaved = useCallback(async () => {
    setSaved(await listSaved());
  }, []);

  useEffect(() => {
    refreshSaved();
    Promise.all([listProjects(), listSeminars()]).then(([p, s]) =>
      setSources({
        projects: p.map((x) => x.name),
        seminars: s.map((x) => x.title),
      }),
    );
  }, [refreshSaved]);

  async function generate() {
    if (!subject.trim() || generating) return;
    setError(null);
    setCopied(false);
    setSavedNote(false);
    setOutput("");
    setGenerating(true);
    const { system, user } = buildMessages(typeId, subject.trim(), tone);
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
      setGenerating(false);
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  async function copyOut(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function saveOut() {
    if (!output.trim()) return;
    await addSaved({ type: typeId, subject: subject.trim(), content: output });
    setSavedNote(true);
    refreshSaved();
  }

  async function removeSaved(id: string) {
    await deleteSaved(id);
    refreshSaved();
  }

  return (
    <div className="mx-auto max-w-4xl p-8">
      <div className="mb-1 flex items-center gap-3">
        <Megaphone className="size-7 text-primary" />
        <h1 className="text-2xl font-semibold tracking-tight">Marketing</h1>
      </div>
      <p className="mb-6 text-muted-foreground">
        Draft ready-to-post promo copy with your local AI — private and free.
      </p>

      <Card className="mb-6">
        <CardContent className="space-y-5 pt-6">
          <div>
            <label className="text-sm font-medium">Content type</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {CONTENT_TYPES.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setTypeId(c.id)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                    typeId === c.id
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border hover:bg-accent",
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">What's it about?</label>
            <Textarea
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              rows={3}
              className="mt-1"
              placeholder="e.g. My new book 'Rise & Thrive' — a practical guide to daily resilience for busy professionals. Launching next month."
            />
            {(sources.projects.length > 0 || sources.seminars.length > 0) && (
              <select
                value=""
                onChange={(e) => e.target.value && setSubject(e.target.value)}
                className={selectClass}
              >
                <option value="">Prefill from a project or seminar…</option>
                {sources.projects.length > 0 && (
                  <optgroup label="Projects">
                    {sources.projects.map((n) => (
                      <option key={`p-${n}`} value={n}>
                        {n}
                      </option>
                    ))}
                  </optgroup>
                )}
                {sources.seminars.length > 0 && (
                  <optgroup label="Seminars">
                    {sources.seminars.map((n) => (
                      <option key={`s-${n}`} value={n}>
                        {n}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            )}
          </div>

          <div>
            <label className="text-sm font-medium">Tone</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {TONES.map((t) => (
                <button
                  key={t}
                  onClick={() => setTone(t)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                    tone === t
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border hover:bg-accent",
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {generating ? (
              <Button variant="outline" onClick={stop}>
                <Square className="size-4" />
                Stop
              </Button>
            ) : (
              <Button onClick={generate} disabled={!subject.trim()}>
                <Sparkles className="size-4" />
                Generate
              </Button>
            )}
            {generating && (
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Writing…
              </span>
            )}
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertCircle className="size-4 shrink-0" />
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      {(output || generating) && (
        <Card className="mb-6">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>{contentTypeLabel(typeId)}</CardTitle>
            <div className="flex items-center gap-2">
              {savedNote && (
                <span className="text-xs text-green-600">Saved ✓</span>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyOut(output)}
                disabled={!output.trim()}
              >
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? "Copied" : "Copy"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={saveOut}
                disabled={!output.trim() || generating}
              >
                <Save className="size-4" />
                Save
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="md text-sm leading-relaxed">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{output}</ReactMarkdown>
            </div>
          </CardContent>
        </Card>
      )}

      {saved.length > 0 && (
        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Saved content
            <span className="ml-2 font-normal">{saved.length}</span>
          </h2>
          <div className="space-y-3">
            {saved.map((s) => (
              <Card key={s.id}>
                <CardContent className="pt-4">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div>
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                        {contentTypeLabel(s.type)}
                      </span>
                      {s.subject && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {s.subject.slice(0, 60)}
                          {s.subject.length > 60 ? "…" : ""}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => copyOut(s.content)}
                        aria-label="Copy"
                        className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        <Copy className="size-4" />
                      </button>
                      <button
                        onClick={() => removeSaved(s.id)}
                        aria-label="Delete"
                        className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>
                  <div className="md whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {s.content}
                    </ReactMarkdown>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
