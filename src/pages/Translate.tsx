import { useEffect, useRef, useState } from "react";
import {
  Languages,
  FileText,
  Square,
  Copy,
  CheckCheck,
  FilePlus2,
  Plus,
} from "lucide-react";
import {
  type DocSummary,
  listDocuments,
  getDocument,
  createDocument,
  updateDocument,
} from "@/lib/documents";
import {
  TRANSLATE_TARGETS,
  type TranslateTarget,
  translate,
} from "@/lib/writingAssist";
import { ping } from "@/lib/ollama";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function Translate() {
  const [docs, setDocs] = useState<DocSummary[]>([]);
  const [docId, setDocId] = useState<string | null>(null);
  const [docTitle, setDocTitle] = useState("");
  const [original, setOriginal] = useState("");
  const [target, setTarget] = useState<TranslateTarget>("English");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [online, setOnline] = useState<boolean | null>(null);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  async function refreshList() {
    setDocs(await listDocuments());
  }

  useEffect(() => {
    refreshList();
    ping().then(setOnline);
    return () => abortRef.current?.abort();
  }, []);

  async function run(lang: string, source: string) {
    if (!source.trim()) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setBusy(true);
    setError(false);
    setSaved(false);
    setText("");
    let acc = "";
    try {
      await translate({
        text: source,
        target: lang,
        signal: ac.signal,
        onToken: (t) => {
          acc += t;
          setText(acc.trimStart());
        },
      });
    } catch {
      if (ac.signal.aborted) return;
      setError(true);
    }
    if (!ac.signal.aborted) setBusy(false);
  }

  async function openDoc(id: string) {
    const doc = await getDocument(id);
    if (!doc) return;
    setDocId(doc.id);
    setDocTitle(doc.title);
    setOriginal(doc.body);
    run(target, doc.body);
  }

  // Start a fresh, typed translation not tied to any saved document.
  function newText() {
    abortRef.current?.abort();
    setBusy(false);
    setDocId(null);
    setDocTitle("");
    setOriginal("");
    setText("");
    setError(false);
    setSaved(false);
  }

  function changeTarget(lang: TranslateTarget) {
    setTarget(lang);
    if (original.trim()) run(lang, original);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  async function saveCopy() {
    const name = `${docTitle.trim() || "Translation"} (${target})`;
    const doc = await createDocument(name);
    await updateDocument(doc.id, { body: text.trim() });
    await refreshList();
    setSaved(true);
  }

  const canTranslate = !!original.trim() && online !== false;

  return (
    <div className="flex h-full">
      <aside className="flex w-72 shrink-0 flex-col border-r border-border bg-muted/30">
        <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
          <div className="flex items-center gap-2">
            <Languages className="size-4 text-primary" />
            <span className="text-sm font-semibold">Translate</span>
          </div>
          <Button variant="ghost" size="sm" onClick={newText} title="Type new text">
            <Plus className="size-4" />
            New text
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          <p className="px-2 pb-2 pt-1 text-xs text-muted-foreground">
            Pick a document, or hit “New text” to type or paste your own.
          </p>
          {docs.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">
              No saved documents yet.
            </p>
          ) : (
            <ul className="space-y-1">
              {docs.map((d) => (
                <li key={d.id}>
                  <button
                    onClick={() => openDoc(d.id)}
                    className={cn(
                      "flex w-full min-w-0 items-start gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent",
                      d.id === docId && "bg-accent",
                    )}
                  >
                    <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{d.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {d.wordCount} words
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      <div className="flex h-full min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-8 py-4">
          <input
            value={docTitle}
            onChange={(e) => setDocTitle(e.target.value)}
            placeholder="Untitled"
            className="mr-auto min-w-0 flex-1 bg-transparent text-xl font-semibold tracking-tight placeholder:text-muted-foreground/50 focus:outline-none"
          />
          <span className="text-sm text-muted-foreground">Into</span>
          <select
            value={target}
            onChange={(e) => changeTarget(e.target.value as TranslateTarget)}
            disabled={busy || online === false}
            className="h-9 rounded-md border border-border bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            {TRANSLATE_TARGETS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          {busy ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => abortRef.current?.abort()}
            >
              <Square className="size-3.5" />
              Stop
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => run(target, original)}
              disabled={!canTranslate}
              title={
                online === false
                  ? "Ollama offline"
                  : !original.trim()
                    ? "Type or pick some text first"
                    : "Translate"
              }
            >
              <Languages className="size-4" />
              Translate
            </Button>
          )}
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-2 gap-4 px-8 py-6">
          <div className="flex min-h-0 flex-col">
            <span className="mb-1 text-xs font-medium text-muted-foreground">
              Original
            </span>
            <textarea
              value={original}
              onChange={(e) => {
                setOriginal(e.target.value);
                setSaved(false);
              }}
              placeholder="Type or paste the text you want to translate…"
              className="flex-1 resize-none overflow-y-auto rounded-md border border-border bg-background px-4 py-3 text-[15px] leading-7 placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="flex min-h-0 flex-col">
            <span className="mb-1 text-xs font-medium text-muted-foreground">
              {target}
            </span>
            <div className="flex-1 overflow-y-auto whitespace-pre-wrap rounded-md border border-border px-4 py-3 text-[15px] leading-7">
              {error ? (
                <span className="text-red-600">
                  Couldn't reach the model. Is Ollama running?
                </span>
              ) : text ? (
                text
              ) : (
                <span className="text-muted-foreground">
                  {busy ? "Translating…" : "The translation will appear here."}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-8 py-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={copy}
            disabled={busy || !text.trim()}
          >
            {copied ? (
              <CheckCheck className="size-4 text-green-600" />
            ) : (
              <Copy className="size-4" />
            )}
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button size="sm" onClick={saveCopy} disabled={busy || !text.trim()}>
            <FilePlus2 className="size-4" />
            {saved ? "Saved ✓" : "Save as new document"}
          </Button>
        </div>
      </div>
    </div>
  );
}
