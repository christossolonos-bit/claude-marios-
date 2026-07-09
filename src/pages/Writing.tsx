import { useEffect, useRef, useState } from "react";
import { PenLine, Plus, Trash2, FileText } from "lucide-react";
import {
  type DocSummary,
  countWords,
  listDocuments,
  getDocument,
  createDocument,
  updateDocument,
  deleteDocument,
} from "@/lib/documents";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function Writing() {
  const [docs, setDocs] = useState<DocSummary[]>([]);
  const [docId, setDocId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Guards so autosave doesn't fire on the initial load of a document.
  const loadedId = useRef<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function refreshList() {
    setDocs(await listDocuments());
  }

  useEffect(() => {
    refreshList();
  }, []);

  async function openDoc(id: string) {
    const doc = await getDocument(id);
    if (!doc) return;
    loadedId.current = doc.id;
    setDocId(doc.id);
    setTitle(doc.title);
    setBody(doc.body);
    setSavedAt(doc.updatedAt);
  }

  async function newDoc() {
    const doc = await createDocument();
    await refreshList();
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

  const words = countWords(body);

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

      <div className="flex h-full flex-1 flex-col">
        {docId ? (
          <>
            <div className="border-b border-border px-8 py-4">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Untitled"
                className="w-full bg-transparent text-2xl font-semibold tracking-tight placeholder:text-muted-foreground/50 focus:outline-none"
              />
            </div>
            <div className="flex-1 overflow-y-auto">
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Start writing…"
                className="mx-auto block h-full w-full max-w-3xl resize-none bg-transparent px-8 py-6 text-[15px] leading-7 placeholder:text-muted-foreground/50 focus:outline-none"
              />
            </div>
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
