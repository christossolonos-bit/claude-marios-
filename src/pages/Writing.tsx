import { useEffect, useRef, useState } from "react";
import {
  PenLine,
  Plus,
  Trash2,
  FileText,
  SpellCheck,
  Scissors,
  RefreshCw,
  Sparkles,
  Check,
  X,
  Square,
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
  ACTION_LABEL,
  suggestEdit,
} from "@/lib/writingAssist";
import { ping } from "@/lib/ollama";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Assist {
  action: EditAction;
  start: number;
  end: number;
  original: string;
  scope: "selection" | "document";
  suggestion: string;
  busy: boolean;
  error: boolean;
}

const ACTION_ICON: Record<EditAction, typeof SpellCheck> = {
  grammar: SpellCheck,
  tighten: Scissors,
  rephrase: RefreshCw,
};

export default function Writing() {
  const [docs, setDocs] = useState<DocSummary[]>([]);
  const [docId, setDocId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);
  const [assist, setAssist] = useState<Assist | null>(null);

  const loadedId = useRef<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const selRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 });
  const abortRef = useRef<AbortController | null>(null);

  async function refreshList() {
    setDocs(await listDocuments());
  }

  useEffect(() => {
    refreshList();
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
  }

  async function removeDoc(id: string) {
    await deleteDocument(id);
    if (id === docId) {
      loadedId.current = null;
      setDocId(null);
      setTitle("");
      setBody("");
      setAssist(null);
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
      refreshList();
    }, 600);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [title, body, docId]);

  function trackSelection() {
    const el = bodyRef.current;
    if (el) selRef.current = { start: el.selectionStart, end: el.selectionEnd };
  }

  async function runAssist(action: EditAction) {
    if (!docId) return;
    let { start, end } = selRef.current;
    if (start === end) {
      // Nothing selected → act on the whole document.
      start = 0;
      end = body.length;
    }
    const original = body.slice(start, end);
    if (!original.trim()) return;
    const scope = start === 0 && end === body.length ? "document" : "selection";

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setAssist({
      action,
      start,
      end,
      original,
      scope,
      suggestion: "",
      busy: true,
      error: false,
    });

    try {
      await suggestEdit({
        action,
        text: original,
        signal: ac.signal,
        onToken: (t) =>
          setAssist((a) => (a ? { ...a, suggestion: a.suggestion + t } : a)),
      });
      setAssist((a) => (a ? { ...a, busy: false } : a));
    } catch {
      if (ac.signal.aborted) return;
      setAssist((a) => (a ? { ...a, busy: false, error: true } : a));
    }
  }

  function stopAssist() {
    abortRef.current?.abort();
    setAssist((a) => (a ? { ...a, busy: false } : a));
  }

  function acceptAssist() {
    if (!assist) return;
    const suggestion = assist.suggestion.trim();
    setBody(body.slice(0, assist.start) + suggestion + body.slice(assist.end));
    setAssist(null);
  }

  function discardAssist() {
    abortRef.current?.abort();
    setAssist(null);
  }

  const words = countWords(body);
  const assistDisabled = !docId || online === false || !!assist?.busy;

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
              <div className="flex shrink-0 items-center gap-1">
                {(Object.keys(ACTION_LABEL) as EditAction[]).map((a) => {
                  const Icon = ACTION_ICON[a];
                  return (
                    <Button
                      key={a}
                      variant="outline"
                      size="sm"
                      onClick={() => runAssist(a)}
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
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              <textarea
                ref={bodyRef}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onSelect={trackSelection}
                onKeyUp={trackSelection}
                onMouseUp={trackSelection}
                placeholder="Start writing…"
                className="mx-auto block h-full w-full max-w-3xl resize-none bg-transparent px-8 py-6 text-[15px] leading-7 placeholder:text-muted-foreground/50 focus:outline-none"
              />
            </div>

            {assist && (
              <div className="mx-auto w-full max-w-3xl px-8 pb-3">
                <div className="rounded-lg border border-border bg-card shadow-sm">
                  <div className="flex items-center justify-between border-b border-border px-3 py-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Sparkles className="size-4 text-primary" />
                      {ACTION_LABEL[assist.action]}
                      <span className="text-xs font-normal text-muted-foreground">
                        ·{" "}
                        {assist.scope === "document"
                          ? "whole document"
                          : "selected text"}
                      </span>
                    </div>
                    {assist.busy && (
                      <Button variant="ghost" size="sm" onClick={stopAssist}>
                        <Square className="size-3.5" />
                        Stop
                      </Button>
                    )}
                  </div>
                  <div className="max-h-52 overflow-y-auto px-3 py-2 text-sm leading-7 whitespace-pre-wrap">
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
                      disabled={assist.busy || assist.error || !assist.suggestion.trim()}
                    >
                      <Check className="size-4" />
                      Replace
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between border-t border-border px-8 py-2 text-xs text-muted-foreground">
              <span>{words === 1 ? "1 word" : `${words} words`}</span>
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
    </div>
  );
}
