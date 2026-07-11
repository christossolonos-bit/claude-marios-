import { useEffect, useRef, useState } from "react";
import {
  PenLine,
  Plus,
  Trash2,
  FileText,
  SpellCheck,
  Scissors,
  RefreshCw,
  ChevronsRight,
  Expand,
  Heading,
  Sparkles,
  Check,
  X,
  Square,
  Flame,
} from "lucide-react";
import {
  type DocSummary,
  countWords,
  listDocuments,
  getDocument,
  createDocument,
  updateDocument,
  deleteDocument,
} from "@/lib/documents";
import {
  type EditAction,
  type Tone,
  ACTION_LABEL,
  TONES,
  suggestEdit,
  suggestContinue,
  suggestExpand,
  suggestTone,
  suggestTitle,
} from "@/lib/writingAssist";
import { ping } from "@/lib/ollama";
import {
  type WritingStats,
  getStats,
  setGoal,
  recordWords,
} from "@/lib/writingGoal";
import { getSettings } from "@/lib/settings";
import { predictContinuation } from "@/lib/autocomplete";
import FloatingAssistant from "@/components/FloatingAssistant";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// System prompt for the docked Writing assistant — scoped to the open document
// so it can discuss the actual draft. Talk-only: it advises, it doesn't edit
// (the toolbar buttons handle edits).
function writingSystem(title: string, body: string): string {
  const s = getSettings();
  const doc = body.trim();
  const excerpt = doc.length > 6000 ? `${doc.slice(0, 6000)}\n…(truncated)` : doc;
  return [
    s.persona,
    "You are the writing companion for one document in the author's workspace. Help him write it: brainstorm ideas, talk through structure, characters and arguments, give focused feedback, and suggest phrasings when asked. Keep it a conversation — do NOT silently rewrite the whole draft, and always reply in the language the draft is written in.",
    title ? `The document is titled "${title}".` : "The document is untitled.",
    doc
      ? `Here is the current draft so he doesn't have to paste it:\n"""\n${excerpt}\n"""`
      : "The draft is empty so far — help him find a way in.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

type ApplyMode = "replace" | "insert" | "title";

interface Assist {
  label: string;
  apply: ApplyMode;
  start: number;
  end: number;
  scope: "selection" | "document" | "insertion";
  suggestion: string;
  busy: boolean;
  error: boolean;
}

const EDIT_ICON: Record<EditAction, typeof SpellCheck> = {
  grammar: SpellCheck,
  tighten: Scissors,
  rephrase: RefreshCw,
};

const APPLY_LABEL: Record<ApplyMode, string> = {
  replace: "Replace",
  insert: "Insert",
  title: "Use as title",
};

// Remembers which document was open so Writing reopens it on next launch.
const LAST_DOC = "authorhub.writing.lastdoc";

export default function Writing() {
  const [docs, setDocs] = useState<DocSummary[]>([]);
  const [docId, setDocId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);
  const [assist, setAssist] = useState<Assist | null>(null);
  const [stats, setStats] = useState<WritingStats>(() => getStats());
  const [ghostOn, setGhostOn] = useState(false);
  const [ghost, setGhost] = useState("");

  const ghostTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ghostAbort = useRef<AbortController | null>(null);

  const loadedId = useRef<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const selRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 });
  const abortRef = useRef<AbortController | null>(null);

  async function refreshList() {
    setDocs(await listDocuments());
  }

  useEffect(() => {
    (async () => {
      const list = await listDocuments();
      setDocs(list);
      // Resume the last document the user was editing, if it still exists.
      const last = localStorage.getItem(LAST_DOC);
      if (last && list.some((d) => d.id === last)) {
        openDoc(last);
      }
    })();
    ping().then(setOnline);
  }, []);

  async function openDoc(id: string) {
    const doc = await getDocument(id);
    if (!doc) return;
    setAssist(null);
    loadedId.current = doc.id;
    setDocId(doc.id);
    setTitle(doc.title);
    setBody(doc.body);
    setSavedAt(doc.updatedAt);
    localStorage.setItem(LAST_DOC, doc.id);
  }

  async function newDoc() {
    const doc = await createDocument();
    await refreshList();
    setAssist(null);
    loadedId.current = doc.id;
    setDocId(doc.id);
    setTitle("");
    setBody("");
    setSavedAt(null);
    localStorage.setItem(LAST_DOC, doc.id);
  }

  async function removeDoc(id: string) {
    await deleteDocument(id);
    if (id === docId) {
      loadedId.current = null;
      setDocId(null);
      setTitle("");
      setBody("");
      setAssist(null);
      localStorage.removeItem(LAST_DOC);
    }
    refreshList();
  }

  // Debounced autosave whenever the open document's title or body changes.
  useEffect(() => {
    if (!docId || loadedId.current !== docId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      await updateDocument(docId, { title, body });
      setSavedAt(Date.now());
      setStats(recordWords(docId, countWords(body)));
      refreshList();
    }, 600);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [title, body, docId]);

  function clearGhost() {
    if (ghostTimer.current) clearTimeout(ghostTimer.current);
    ghostAbort.current?.abort();
    setGhost("");
  }

  // Inline autocomplete: while enabled and the caret is at the very end of the
  // draft, debounce after a pause in typing and predict the next few words as
  // grey ghost text. Tab accepts it; typing or moving the caret dismisses it.
  useEffect(() => {
    if (!ghostOn || !docId || online === false) return;
    const el = bodyRef.current;
    const atEnd =
      !!el && el.selectionStart === el.selectionEnd && el.selectionEnd >= body.length;
    if (!atEnd || body.trim().length < 3) return;
    if (ghostTimer.current) clearTimeout(ghostTimer.current);
    ghostTimer.current = setTimeout(async () => {
      ghostAbort.current?.abort();
      const ac = new AbortController();
      ghostAbort.current = ac;
      const snapshot = body;
      try {
        const raw = await predictContinuation(snapshot.slice(-1500), ac.signal);
        if (ac.signal.aborted) return;
        // Only show if the draft hasn't changed while we were predicting.
        if (bodyRef.current && bodyRef.current.value !== snapshot) return;
        const g = raw.trim();
        if (!g) return;
        const needsSpace = !/\s$/.test(snapshot) && /^[\w("'‘“]/.test(g);
        setGhost((needsSpace ? " " : "") + g);
      } catch {
        // model unreachable / aborted — no ghost
      }
    }, 700);
    return () => {
      if (ghostTimer.current) clearTimeout(ghostTimer.current);
    };
  }, [body, ghostOn, docId, online]);

  // Clear the ghost when switching documents or turning autocomplete off.
  useEffect(() => {
    clearGhost();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId, ghostOn]);

  function acceptGhost() {
    if (!ghost) return;
    const next = body + ghost;
    setBody(next);
    setGhost("");
    requestAnimationFrame(() => {
      const el = bodyRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(next.length, next.length);
        selRef.current = { start: next.length, end: next.length };
      }
    });
  }

  function onEditorKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (ghost && e.key === "Tab") {
      e.preventDefault();
      acceptGhost();
    } else if (ghost && e.key === "Escape") {
      e.preventDefault();
      clearGhost();
    }
  }

  function trackSelection() {
    const el = bodyRef.current;
    if (!el) return;
    selRef.current = { start: el.selectionStart, end: el.selectionEnd };
    // Drop a stale ghost if the caret is no longer at the end of the draft.
    if (
      ghost &&
      (el.selectionStart !== el.selectionEnd || el.selectionEnd < body.length)
    ) {
      clearGhost();
    }
  }

  function resolveTarget(): {
    start: number;
    end: number;
    scope: "selection" | "document";
  } {
    let { start, end } = selRef.current;
    if (start === end) return { start: 0, end: body.length, scope: "document" };
    return { start, end, scope: "selection" };
  }

  async function startAssist(cfg: {
    label: string;
    apply: ApplyMode;
    start: number;
    end: number;
    scope: Assist["scope"];
    generate: (
      onToken: (t: string) => void,
      signal: AbortSignal,
    ) => Promise<void>;
  }) {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setAssist({
      label: cfg.label,
      apply: cfg.apply,
      start: cfg.start,
      end: cfg.end,
      scope: cfg.scope,
      suggestion: "",
      busy: true,
      error: false,
    });
    try {
      await cfg.generate(
        (t) => setAssist((a) => (a ? { ...a, suggestion: t } : a)),
        ac.signal,
      );
      setAssist((a) => (a ? { ...a, busy: false } : a));
    } catch {
      if (ac.signal.aborted) return;
      setAssist((a) => (a ? { ...a, busy: false, error: true } : a));
    }
  }

  // Streamers accumulate tokens; startAssist's onToken gets the full text so far.
  function streamer(
    fn: (o: {
      signal: AbortSignal;
      onToken: (t: string) => void;
    }) => Promise<void>,
  ) {
    return (setText: (t: string) => void, signal: AbortSignal) => {
      let acc = "";
      return fn({
        signal,
        onToken: (t) => {
          acc += t;
          setText(acc.trimStart());
        },
      });
    };
  }

  function runEdit(action: EditAction) {
    if (!docId) return;
    const { start, end, scope } = resolveTarget();
    const original = body.slice(start, end);
    if (!original.trim()) return;
    startAssist({
      label: ACTION_LABEL[action],
      apply: "replace",
      start,
      end,
      scope,
      generate: streamer((o) => suggestEdit({ action, text: original, ...o })),
    });
  }

  function runExpand() {
    if (!docId) return;
    const { start, end, scope } = resolveTarget();
    const original = body.slice(start, end);
    if (!original.trim()) return;
    startAssist({
      label: "Expand",
      apply: "replace",
      start,
      end,
      scope,
      generate: streamer((o) =>
        suggestExpand({ text: original, ...o }),
      ),
    });
  }

  function runTone(tone: Tone) {
    if (!docId) return;
    const { start, end, scope } = resolveTarget();
    const original = body.slice(start, end);
    if (!original.trim()) return;
    startAssist({
      label: `Tone: ${tone}`,
      apply: "replace",
      start,
      end,
      scope,
      generate: streamer((o) => suggestTone({ text: original, tone, ...o })),
    });
  }

  function runContinue() {
    if (!docId || !body.trim()) return;
    const at = selRef.current.end || body.length;
    startAssist({
      label: "Continue",
      apply: "insert",
      start: at,
      end: at,
      scope: "insertion",
      generate: streamer((o) =>
        suggestContinue({ body, ...o }),
      ),
    });
  }

  function runTitle() {
    if (!docId || !body.trim()) return;
    startAssist({
      label: "Suggest title",
      apply: "title",
      start: 0,
      end: 0,
      scope: "document",
      generate: streamer((o) =>
        suggestTitle({ body, ...o }),
      ),
    });
  }

  function stopAssist() {
    abortRef.current?.abort();
    setAssist((a) => (a ? { ...a, busy: false } : a));
  }

  function acceptAssist() {
    if (!assist) return;
    const s = assist.suggestion.trim();
    if (assist.apply === "title") {
      setTitle(s.replace(/^["']|["']$/g, ""));
    } else if (assist.apply === "insert") {
      const before = body.slice(0, assist.start);
      const after = body.slice(assist.start);
      const sep = before && !/\s$/.test(before) ? " " : "";
      setBody(before + sep + s + after);
    } else {
      setBody(body.slice(0, assist.start) + s + body.slice(assist.end));
    }
    setAssist(null);
  }

  function discardAssist() {
    abortRef.current?.abort();
    setAssist(null);
  }

  const words = countWords(body);
  const assistDisabled = !docId || online === false || !!assist?.busy;
  const scopeText =
    assist?.scope === "insertion"
      ? "continues your draft"
      : assist?.scope === "document"
        ? "whole document"
        : "selected text";

  return (
    <div className="flex h-full">
      <aside className="flex w-72 shrink-0 flex-col border-r border-border bg-muted/30">
        <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
          <div className="flex items-center gap-2">
            <PenLine className="size-4 text-primary" />
            <span className="text-sm font-semibold">Writing</span>
          </div>
          <Button variant="ghost" size="sm" onClick={newDoc} title="New document">
            <Plus className="size-4" />
            New
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {docs.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">
              No documents yet. Start a new one.
            </p>
          ) : (
            <ul className="space-y-1">
              {docs.map((d) => (
                <li key={d.id}>
                  <div
                    className={cn(
                      "group flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent",
                      d.id === docId && "bg-accent",
                    )}
                  >
                    <button
                      onClick={() => openDoc(d.id)}
                      className="flex min-w-0 flex-1 items-start gap-2 text-left"
                    >
                      <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">
                          {d.title}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {d.wordCount} words ·{" "}
                          {new Date(d.updatedAt).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      </span>
                    </button>
                    <button
                      onClick={() => removeDoc(d.id)}
                      title="Delete document"
                      className="shrink-0 rounded p-1 text-muted-foreground opacity-0 hover:text-red-600 group-hover:opacity-100"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="border-t border-border p-3">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-medium">Today's writing</span>
            {stats.streak > 0 && (
              <span
                className="flex items-center gap-0.5 text-xs font-medium text-amber-600"
                title="Days in a row you hit your goal"
              >
                <Flame className="size-3.5" />
                {stats.streak}
              </span>
            )}
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                stats.today >= stats.goal ? "bg-green-500" : "bg-primary",
              )}
              style={{
                width: `${stats.goal ? Math.min(100, (stats.today / stats.goal) * 100) : 0}%`,
              }}
            />
          </div>
          <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {stats.today} {stats.today === 1 ? "word" : "words"}
            </span>
            <span className="flex items-center gap-1">
              goal
              <input
                type="number"
                min={1}
                value={stats.goal}
                onChange={(e) => setStats(setGoal(Number(e.target.value)))}
                className="w-14 rounded border border-border bg-background px-1 py-0.5 text-right text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </span>
          </div>
        </div>
      </aside>

      <div className="flex h-full min-w-0 flex-1 flex-col">
        {docId ? (
          <>
            <div className="flex items-center gap-4 border-b border-border px-8 py-4">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Untitled"
                className="min-w-0 flex-1 bg-transparent text-2xl font-semibold tracking-tight placeholder:text-muted-foreground/50 focus:outline-none"
              />
              <Button
                variant={ghostOn ? "default" : "outline"}
                size="sm"
                onClick={() => setGhostOn((v) => !v)}
                title="Autocomplete — predicts your next words as grey text; press Tab to accept"
              >
                <Sparkles className="size-4" />
                Autocomplete
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-1 border-b border-border px-8 py-2">
              {(Object.keys(ACTION_LABEL) as EditAction[]).map((a) => {
                const Icon = EDIT_ICON[a];
                return (
                  <Button
                    key={a}
                    variant="outline"
                    size="sm"
                    onClick={() => runEdit(a)}
                    disabled={assistDisabled}
                    title={
                      online === false
                        ? "Ollama offline"
                        : `${ACTION_LABEL[a]} (selection, or whole document)`
                    }
                  >
                    <Icon className="size-4" />
                    {ACTION_LABEL[a]}
                  </Button>
                );
              })}

              <span className="mx-1 h-5 w-px bg-border" />

              <Button
                variant="outline"
                size="sm"
                onClick={runContinue}
                disabled={assistDisabled}
                title="Continue the draft from the cursor"
              >
                <ChevronsRight className="size-4" />
                Continue
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={runExpand}
                disabled={assistDisabled}
                title="Expand the selection (or whole document)"
              >
                <Expand className="size-4" />
                Expand
              </Button>
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) runTone(e.target.value as Tone);
                  e.target.value = "";
                }}
                disabled={assistDisabled}
                title="Rewrite the selection in a tone"
                className="h-8 rounded-md border border-border bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                <option value="">Tone…</option>
                {TONES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <Button
                variant="outline"
                size="sm"
                onClick={runTitle}
                disabled={assistDisabled}
                title="Suggest a title from the draft"
              >
                <Heading className="size-4" />
                Title
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto">
              <div className="relative mx-auto min-h-full w-full max-w-3xl">
                {/* Ghost-text mirror: same metrics as the textarea, renders the
                    body invisibly so the grey suggestion lands after the caret. */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 whitespace-pre-wrap break-words px-8 py-6 text-[15px] leading-7 text-transparent"
                >
                  {body}
                  {ghost && (
                    <span className="text-muted-foreground/50">{ghost}</span>
                  )}
                </div>
                <textarea
                  ref={bodyRef}
                  value={body}
                  onChange={(e) => {
                    setBody(e.target.value);
                    if (ghost) setGhost("");
                  }}
                  onSelect={trackSelection}
                  onKeyUp={trackSelection}
                  onMouseUp={trackSelection}
                  onKeyDown={onEditorKeyDown}
                  placeholder="Start writing…"
                  className="relative block min-h-full w-full resize-none bg-transparent px-8 py-6 text-[15px] leading-7 [field-sizing:content] placeholder:text-muted-foreground/50 focus:outline-none"
                />
              </div>
            </div>

            {assist && (
              <div className="mx-auto w-full max-w-3xl px-8 pb-3">
                <div className="rounded-lg border border-border bg-card shadow-sm">
                  <div className="flex items-center justify-between border-b border-border px-3 py-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Sparkles className="size-4 text-primary" />
                      {assist.label}
                      <span className="text-xs font-normal text-muted-foreground">
                        · {scopeText}
                      </span>
                    </div>
                    {assist.busy && (
                      <Button variant="ghost" size="sm" onClick={stopAssist}>
                        <Square className="size-3.5" />
                        Stop
                      </Button>
                    )}
                  </div>
                  <div className="max-h-52 overflow-y-auto whitespace-pre-wrap px-3 py-2 text-sm leading-7">
                    {assist.error ? (
                      <span className="text-red-600">
                        Couldn't reach the model. Is Ollama running?
                      </span>
                    ) : assist.suggestion ? (
                      assist.suggestion
                    ) : (
                      <span className="text-muted-foreground">Thinking…</span>
                    )}
                  </div>
                  <div className="flex items-center justify-end gap-2 border-t border-border px-3 py-2">
                    <Button variant="ghost" size="sm" onClick={discardAssist}>
                      <X className="size-4" />
                      Discard
                    </Button>
                    <Button
                      size="sm"
                      onClick={acceptAssist}
                      disabled={
                        assist.busy || assist.error || !assist.suggestion.trim()
                      }
                    >
                      <Check className="size-4" />
                      {APPLY_LABEL[assist.apply]}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between border-t border-border px-8 py-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-3">
                <span>{words === 1 ? "1 word" : `${words} words`}</span>
                {ghostOn && (
                  <span className="flex items-center gap-1 text-primary/80">
                    <Sparkles className="size-3" />
                    Autocomplete on · press Tab to accept
                  </span>
                )}
              </div>
              <span>
                {savedAt
                  ? `Saved ${new Date(savedAt).toLocaleTimeString(undefined, {
                      hour: "numeric",
                      minute: "2-digit",
                    })}`
                  : "Not saved yet"}
              </span>
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center px-8 text-center text-muted-foreground">
            <PenLine className="mb-3 size-8 text-muted-foreground/50" />
            <p className="max-w-sm text-sm">
              Your writing desk. Draft a chapter, a blog post, or a newsletter —
              it saves as you type and stays on this machine. Pick a document on
              the left, or start a new one.
            </p>
            <Button className="mt-4" onClick={newDoc}>
              <Plus className="size-4" />
              New document
            </Button>
          </div>
        )}
      </div>

      {docId && (
        <FloatingAssistant
          title="Writing assistant"
          subtitle="Talk through your draft"
          emptyHint="Ask about your draft — brainstorm, get feedback, or talk through where it goes next."
          storageKey={`writing.${docId}`}
          buildSystem={() => writingSystem(title, body)}
          placeholder="Ask about this draft…"
        />
      )}

    </div>
  );
}
