import { useEffect, useRef, useState } from "react";
import {
  BookText,
  Upload,
  Trash2,
  FileText,
  AlertCircle,
  Sparkles,
  Check,
  X,
  Square,
  CheckCircle2,
  Download,
} from "lucide-react";
import {
  type Manuscript,
  getManuscript,
  saveManuscript,
  clearManuscript,
  countWords,
  extractPdf,
} from "@/lib/manuscript";
import { proofreadText } from "@/lib/proofread";
import {
  TRIM_SIZES,
  exportDocx,
  downloadBlob,
} from "@/lib/kindleExport";
import { ping } from "@/lib/ollama";
import { Button } from "@/components/ui/button";

interface Proof {
  status: "proofing" | "review" | "error";
  suggestion: string;
}

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
  const [online, setOnline] = useState<boolean | null>(null);
  const [proof, setProof] = useState<Record<number, Proof>>({});
  const [applied, setApplied] = useState<Set<number>>(new Set());
  const [allRunning, setAllRunning] = useState(false);
  const [allIdx, setAllIdx] = useState(0);
  const [trimId, setTrimId] = useState("6x9");
  const [exporting, setExporting] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const stopAllRef = useRef(false);

  useEffect(() => {
    ping().then(setOnline);
    return () => abortRef.current?.abort();
  }, []);

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
      setProof({});
      setApplied(new Set());
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
    abortRef.current?.abort();
    clearManuscript();
    setManuscript(null);
    setProof({});
    setApplied(new Set());
    setError(null);
  }

  function updateTitle(title: string) {
    if (!manuscript) return;
    const m = { ...manuscript, title, updatedAt: Date.now() };
    saveManuscript(m);
    setManuscript(m);
  }

  const proofing = Object.values(proof).some((p) => p.status === "proofing");
  const anyBusy = allRunning || proofing;
  const reviewIdxs = Object.keys(proof)
    .map(Number)
    .filter((i) => proof[i].status === "review");

  // Stream a proofread of one page; resolves with the corrected text.
  async function runProof(i: number, signal: AbortSignal): Promise<string> {
    setProof((p) => ({ ...p, [i]: { status: "proofing", suggestion: "" } }));
    let acc = "";
    try {
      await proofreadText({
        text: manuscript!.pages[i],
        signal,
        onToken: (t) => {
          acc += t;
          setProof((p) => ({
            ...p,
            [i]: { status: "proofing", suggestion: acc.trimStart() },
          }));
        },
      });
      const final = acc.trim();
      setProof((p) => ({ ...p, [i]: { status: "review", suggestion: final } }));
      return final;
    } catch (e) {
      if (signal.aborted) {
        setProof((p) => {
          const n = { ...p };
          delete n[i];
          return n;
        });
      } else {
        setProof((p) => ({ ...p, [i]: { status: "error", suggestion: "" } }));
      }
      throw e;
    }
  }

  function proofreadOne(i: number) {
    if (anyBusy) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    runProof(i, ac.signal).catch(() => {});
  }

  async function proofreadAll() {
    if (!manuscript || anyBusy) return;
    stopAllRef.current = false;
    const ac = new AbortController();
    abortRef.current = ac;
    setAllRunning(true);
    for (let i = 0; i < manuscript.pages.length; i++) {
      if (stopAllRef.current || ac.signal.aborted) break;
      if (applied.has(i) || proof[i]?.status === "review") continue;
      setAllIdx(i);
      try {
        await runProof(i, ac.signal);
      } catch {
        if (ac.signal.aborted) break;
      }
    }
    setAllRunning(false);
  }

  function stopAll() {
    stopAllRef.current = true;
    abortRef.current?.abort();
    setAllRunning(false);
  }

  function applyProof(i: number) {
    if (!manuscript) return;
    const s = proof[i]?.suggestion.trim();
    if (!s) return;
    const pages = manuscript.pages.slice();
    pages[i] = s;
    const m = { ...manuscript, pages, updatedAt: Date.now() };
    saveManuscript(m);
    setManuscript(m);
    setApplied((a) => new Set(a).add(i));
    setProof((p) => {
      const n = { ...p };
      delete n[i];
      return n;
    });
  }

  function dismissProof(i: number) {
    setProof((p) => {
      const n = { ...p };
      delete n[i];
      return n;
    });
  }

  function applyAllReviews() {
    if (!manuscript || !reviewIdxs.length) return;
    const pages = manuscript.pages.slice();
    const nowApplied = new Set(applied);
    for (const i of reviewIdxs) {
      const s = proof[i].suggestion.trim();
      if (s) {
        pages[i] = s;
        nowApplied.add(i);
      }
    }
    const m = { ...manuscript, pages, updatedAt: Date.now() };
    saveManuscript(m);
    setManuscript(m);
    setApplied(nowApplied);
    setProof({});
  }

  async function exportForKindle() {
    if (!manuscript) return;
    setExporting(true);
    setError(null);
    try {
      const trim = TRIM_SIZES.find((t) => t.id === trimId) ?? TRIM_SIZES[0];
      const blob = await exportDocx({
        title: manuscript.title,
        pages: manuscript.pages,
        trim,
      });
      const safe =
        (manuscript.title.trim() || "book").replace(/[^\p{L}\p{N} _-]/gu, "").trim() ||
        "book";
      downloadBlob(blob, `${safe}.docx`);
    } catch (e) {
      setError((e as Error).message || "Couldn't create the export.");
    } finally {
      setExporting(false);
    }
  }

  const totalWords = manuscript
    ? manuscript.pages.reduce((n, p) => n + countWords(p), 0)
    : 0;
  const proofDisabled = anyBusy || online === false;

  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col p-8">
      <div className="mb-1 flex items-center gap-3">
        <BookText className="size-7 text-primary" />
        <h1 className="text-2xl font-semibold tracking-tight">Book</h1>
      </div>
      <p className="mb-6 text-muted-foreground">
        Upload your full book as a PDF. It's read on this machine — nothing is
        uploaded. The assistant proofreads it page by page; next, a Kindle-ready
        version.
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
            {allRunning ? (
              <Button variant="outline" size="sm" onClick={stopAll}>
                <Square className="size-3.5" />
                Stop · page {allIdx + 1}/{manuscript.pages.length}
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={proofreadAll}
                disabled={proofDisabled}
                title={online === false ? "Ollama offline" : "Proofread every page"}
              >
                <Sparkles className="size-4" />
                Proofread all
              </Button>
            )}
            {reviewIdxs.length > 0 && (
              <Button size="sm" onClick={applyAllReviews}>
                <Check className="size-4" />
                Apply all ({reviewIdxs.length})
              </Button>
            )}
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

          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
            <Download className="size-4 shrink-0 text-primary" />
            <span className="text-sm font-medium">Export for Kindle</span>
            <span className="text-xs text-muted-foreground">
              reflowable .docx for Amazon KDP · trim
            </span>
            <select
              value={trimId}
              onChange={(e) => setTrimId(e.target.value)}
              className="h-8 rounded-md border border-border bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {TRIM_SIZES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              onClick={exportForKindle}
              disabled={exporting}
              className="ml-auto"
            >
              <Download className="size-4" />
              {exporting ? "Exporting…" : "Export .docx"}
            </Button>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            {manuscript.pages.map((p, i) => {
              const pr = proof[i];
              const header = (
                <div className="mb-1 flex items-center justify-between px-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    Page {i + 1}
                  </span>
                  <div className="flex items-center gap-2">
                    {applied.has(i) && (
                      <span className="flex items-center gap-1 text-xs text-green-600">
                        <CheckCircle2 className="size-3.5" />
                        Proofread
                      </span>
                    )}
                    {!pr && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => proofreadOne(i)}
                        disabled={proofDisabled}
                      >
                        <Sparkles className="size-4" />
                        Proofread
                      </Button>
                    )}
                  </div>
                </div>
              );

              if (pr) {
                return (
                  <div key={i} className="rounded-lg border border-border p-4">
                    {header}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="mb-1 text-xs font-medium text-muted-foreground">
                          Original
                        </div>
                        <div className="whitespace-pre-wrap text-[15px] leading-7 text-muted-foreground">
                          {p}
                        </div>
                      </div>
                      <div>
                        <div className="mb-1 flex items-center gap-1 text-xs font-medium text-primary">
                          <Sparkles className="size-3.5" />
                          Suggested
                        </div>
                        <div className="whitespace-pre-wrap text-[15px] leading-7">
                          {pr.status === "error" ? (
                            <span className="text-red-600">
                              Couldn't proofread. Is Ollama running?
                            </span>
                          ) : pr.suggestion ? (
                            pr.suggestion
                          ) : (
                            <span className="text-muted-foreground">
                              Proofreading…
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => dismissProof(i)}>
                        <X className="size-4" />
                        Dismiss
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => applyProof(i)}
                        disabled={pr.status !== "review" || !pr.suggestion.trim()}
                      >
                        <Check className="size-4" />
                        Apply
                      </Button>
                    </div>
                  </div>
                );
              }

              // Reading view: an A4 sheet so pages read like real book pages.
              return (
                <div key={i} className="mx-auto w-full max-w-[794px]">
                  {header}
                  <div
                    className="rounded-sm bg-white px-16 py-14 text-zinc-900 shadow-sm ring-1 ring-black/5"
                    style={{ minHeight: 1123 }}
                  >
                    <div className="whitespace-pre-wrap font-serif text-[15px] leading-7">
                      {p || (
                        <span className="italic text-zinc-400">
                          (no text on this page)
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
