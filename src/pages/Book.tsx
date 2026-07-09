import { useRef, useState } from "react";
import { BookText, Upload, Trash2, FileText, AlertCircle } from "lucide-react";
import {
  type Manuscript,
  getManuscript,
  saveManuscript,
  clearManuscript,
  countWords,
  extractPdf,
} from "@/lib/manuscript";
import { Button } from "@/components/ui/button";

export default function Book() {
  const [manuscript, setManuscript] = useState<Manuscript | null>(() =>
    getManuscript(),
  );
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ page: number; total: number } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function ingest(file: File) {
    if (!/\.pdf$/i.test(file.name)) {
      setError("Please choose a PDF file.");
      return;
    }
    setError(null);
    setBusy(true);
    setProgress({ page: 0, total: 0 });
    try {
      const pages = await extractPdf(file, (page, total) =>
        setProgress({ page, total }),
      );
      const m: Manuscript = {
        title: file.name.replace(/\.pdf$/i, ""),
        pages,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      saveManuscript(m);
      setManuscript(m);
    } catch (e) {
      setError((e as Error).message || "Couldn't read that PDF.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  function onInput(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) ingest(f);
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) ingest(f);
  }

  function remove() {
    clearManuscript();
    setManuscript(null);
    setError(null);
  }

  function updateTitle(title: string) {
    if (!manuscript) return;
    const m = { ...manuscript, title, updatedAt: Date.now() };
    saveManuscript(m);
    setManuscript(m);
  }

  const totalWords = manuscript
    ? manuscript.pages.reduce((n, p) => n + countWords(p), 0)
    : 0;

  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col p-8">
      <div className="mb-1 flex items-center gap-3">
        <BookText className="size-7 text-primary" />
        <h1 className="text-2xl font-semibold tracking-tight">Book</h1>
      </div>
      <p className="mb-6 text-muted-foreground">
        Upload your full book as a PDF. It's read on this machine — nothing is
        uploaded. Next, the assistant can proofread it and prepare a
        Kindle-ready version.
      </p>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertCircle className="size-4 shrink-0" />
          {error}
        </div>
      )}

      {busy ? (
        <div className="flex flex-1 flex-col items-center justify-center text-center text-muted-foreground">
          <FileText className="mb-3 size-8 animate-pulse text-primary" />
          <p className="text-sm">
            Reading your book…
            {progress && progress.total > 0
              ? ` page ${progress.page} of ${progress.total}`
              : ""}
          </p>
        </div>
      ) : !manuscript ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`flex flex-1 flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
            dragOver ? "border-primary bg-accent" : "border-border"
          }`}
        >
          <Upload className="mb-3 size-8 text-muted-foreground" />
          <p className="mb-1 text-sm font-medium">
            Drop your book PDF here, or choose a file
          </p>
          <p className="mb-4 text-xs text-muted-foreground">
            The text is extracted locally so the assistant can work on it.
          </p>
          <Button onClick={() => fileRef.current?.click()}>
            <Upload className="size-4" />
            Choose PDF
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,application/pdf"
            onChange={onInput}
            className="hidden"
          />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="mb-4 flex flex-wrap items-center gap-3 border-b border-border pb-4">
            <input
              value={manuscript.title}
              onChange={(e) => updateTitle(e.target.value)}
              className="min-w-0 flex-1 bg-transparent text-lg font-semibold tracking-tight focus:outline-none"
            />
            <span className="text-sm text-muted-foreground">
              {manuscript.pages.length} pages · {totalWords.toLocaleString()}{" "}
              words
            </span>
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <Upload className="size-4" />
              Replace
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={remove}
              className="text-red-600 hover:bg-red-50"
            >
              <Trash2 className="size-4" />
              Remove
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,application/pdf"
              onChange={onInput}
              className="hidden"
            />
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            {manuscript.pages.map((p, i) => (
              <div key={i} className="rounded-lg border border-border p-4">
                <div className="mb-2 text-xs font-medium text-muted-foreground">
                  Page {i + 1}
                </div>
                <div className="whitespace-pre-wrap text-[15px] leading-7">
                  {p || (
                    <span className="italic text-muted-foreground">
                      (no text on this page)
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
