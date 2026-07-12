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
  Plus,
  Wand2,
} from "lucide-react";
import {
  type Manuscript,
  getManuscript,
  saveManuscript,
  clearManuscript,
  countWords,
  extractPdf,
  extractDocx,
} from "@/lib/manuscript";
import { proofreadText } from "@/lib/proofread";
import { TRIM_SIZES, exportDocx, saveBlob } from "@/lib/kindleExport";
import { ping } from "@/lib/ollama";
import { Button } from "@/components/ui/button";
import MicButton from "@/components/MicButton";

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
  const [liveProof, setLiveProof] = useState(false);
  const [trimId, setTrimId] = useState("6x9");
  const [exporting, setExporting] = useState(false);
  const [savedPath, setSavedPath] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const stopAllRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const manuscriptRef = useRef<Manuscript | null>(manuscript);

  useEffect(() => {
    manuscriptRef.current = manuscript;
  }, [manuscript]);

  useEffect(() => {
    ping().then(setOnline);
    return () => {
      abortRef.current?.abort();
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (liveTimer.current) clearTimeout(liveTimer.current);
    };
  }, []);

  function persist(m: Manuscript, immediate = false) {
    setManuscript(m);
    manuscriptRef.current = m;
    if (immediate) {
      saveManuscript(m);
      return;
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveManuscript(m), 500);
  }

  // Read one or more book files (PDF or Word .docx) into a single manuscript.
  // Multiple files are concatenated in order — handy when each chapter is its
  // own Word file.
  async function ingest(files: File[]) {
    const valid = files.filter((f) => /\.(pdf|docx)$/i.test(f.name));
    if (!valid.length) {
      setError("Please choose a PDF or Word (.docx) file.");
      return;
    }
    setError(null);
    setBusy(true);
    setProgress({ page: 0, total: 0 });
    try {
      const allPages: string[] = [];
      for (const file of valid) {
        if (/\.pdf$/i.test(file.name)) {
          const pages = await extractPdf(file, (page, total) =>
            setProgress({ page, total }),
          );
          allPages.push(...pages);
        } else {
          const pages = await extractDocx(file);
          allPages.push(...pages);
        }
      }
      persist(
        {
          title: valid[0].name.replace(/\.(pdf|docx)$/i, ""),
          pages: allPages.length ? allPages : [""],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        true,
      );
      setProof({});
      setApplied(new Set());
    } catch (e) {
      setError((e as Error).message || "Couldn't read that file.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  function onInput(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length) ingest(files);
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [];
    if (files.length) ingest(files);
  }

  function startBlank() {
    persist(
      {
        title: "Untitled",
        pages: ["Chapter One\n\n"],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      true,
    );
    setProof({});
    setApplied(new Set());
  }

  function remove() {
    abortRef.current?.abort();
    clearManuscript();
    setManuscript(null);
    manuscriptRef.current = null;
    setProof({});
    setApplied(new Set());
    setError(null);
  }

  function updateTitle(title: string) {
    if (!manuscript) return;
    persist({ ...manuscript, title, updatedAt: Date.now() });
  }

  function updatePage(i: number, text: string) {
    if (!manuscript) return;
    const pages = manuscript.pages.slice();
    pages[i] = text;
    persist({ ...manuscript, pages, updatedAt: Date.now() });
    if (liveProof && !allRunning) {
      if (liveTimer.current) clearTimeout(liveTimer.current);
      if (text.trim())
        liveTimer.current = setTimeout(() => proofreadOne(i), 2200);
    }
  }

  // Append dictated speech into a chapter — for writing or extending a chapter
  // by voice on a day the user doesn't want to type. Uses the live ref so
  // back-to-back dictations don't clobber each other.
  function dictateIntoPage(i: number, text: string) {
    const m = manuscriptRef.current;
    if (!m) return;
    const cur = m.pages[i] ?? "";
    const sep = cur && !/\s$/.test(cur) ? " " : "";
    updatePage(i, cur + sep + text.trim());
  }

  function addPage() {
    if (!manuscript) return;
    persist(
      { ...manuscript, pages: [...manuscript.pages, ""], updatedAt: Date.now() },
      true,
    );
  }

  function deletePage(i: number) {
    if (!manuscript) return;
    const pages = manuscript.pages.slice();
    pages.splice(i, 1);
    persist({ ...manuscript, pages, updatedAt: Date.now() }, true);
    // Indices shift, so clear per-page state.
    setProof({});
    setApplied(new Set());
  }

  const proofing = Object.values(proof).some((p) => p.status === "proofing");
  const anyBusy = allRunning || proofing;
  const reviewIdxs = Object.keys(proof)
    .map(Number)
    .filter((i) => proof[i].status === "review");

  async function runProof(i: number, text: string, signal: AbortSignal) {
    setProof((p) => ({ ...p, [i]: { status: "proofing", suggestion: "" } }));
    let acc = "";
    try {
      await proofreadText({
        text,
        signal,
        onToken: (t) => {
          acc += t;
          setProof((p) => ({
            ...p,
            [i]: { status: "proofing", suggestion: acc.trimStart() },
          }));
        },
      });
      setProof((p) => ({
        ...p,
        [i]: { status: "review", suggestion: acc.trim() },
      }));
    } catch {
      if (signal.aborted) {
        setProof((p) => {
          const n = { ...p };
          delete n[i];
          return n;
        });
      } else {
        setProof((p) => ({ ...p, [i]: { status: "error", suggestion: "" } }));
      }
    }
  }

  function proofreadOne(i: number) {
    const text = manuscriptRef.current?.pages[i] ?? "";
    if (!text.trim() || online === false) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    runProof(i, text, ac.signal);
  }

  async function proofreadAll() {
    const m = manuscriptRef.current;
    if (!m || anyBusy) return;
    abortRef.current?.abort();
    stopAllRef.current = false;
    const ac = new AbortController();
    abortRef.current = ac;
    setAllRunning(true);
    for (let i = 0; i < m.pages.length; i++) {
      if (stopAllRef.current || ac.signal.aborted) break;
      if (applied.has(i) || proof[i]?.status === "review") continue;
      if (!m.pages[i].trim()) continue;
      setAllIdx(i);
      await runProof(i, m.pages[i], ac.signal);
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
    persist({ ...manuscript, pages, updatedAt: Date.now() }, true);
    setApplied((a) => new Set(a).add(i));
    dismissProof(i);
  }

  function dismissProof(i: number) {
    setProof((p) => {
      const n = { ...p };
      delete n[i];
      return n;
    });
  }

  function stopProof(i: number) {
    abortRef.current?.abort();
    dismissProof(i);
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
    persist({ ...manuscript, pages, updatedAt: Date.now() }, true);
    setApplied(nowApplied);
    setProof({});
  }

  async function exportForKindle() {
    if (!manuscript) return;
    setExporting(true);
    setError(null);
    setSavedPath(null);
    try {
      const trim = TRIM_SIZES.find((t) => t.id === trimId) ?? TRIM_SIZES[0];
      const blob = await exportDocx({
        title: manuscript.title,
        pages: manuscript.pages,
        trim,
      });
      const safe =
        (manuscript.title.trim() || "book")
          .replace(/[^\p{L}\p{N} _-]/gu, "")
          .trim() || "book";
      const path = await saveBlob(blob, `${safe}.docx`);
      // Desktop returns the saved path; the browser preview just downloads.
      setSavedPath(path ?? `${safe}.docx`);
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

  // On-screen page dimensions reflect the selected KDP trim (at 96px/inch) so
  // the pages visibly resize when you change the size.
  const trim = TRIM_SIZES.find((t) => t.id === trimId) ?? TRIM_SIZES[0];
  const pageW = Math.round(trim.width * 96);
  const pageMinH = Math.round(trim.height * 96);

  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col p-8">
      <div className="mb-1 flex items-center gap-3">
        <BookText className="size-7 text-primary" />
        <h1 className="text-2xl font-semibold tracking-tight">Book</h1>
      </div>
      <p className="mb-6 text-muted-foreground">
        Write or upload your book. Edit any chapter directly — turn on Live
        proofread and the assistant checks it as you type. Everything stays on
        this machine.
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
            Drop your book here — PDF or Word (.docx) — or start from scratch
          </p>
          <p className="mb-4 text-xs text-muted-foreground">
            Files are read locally. You can select several Word files at once
            (one per chapter); or begin a blank book and type your chapters.
          </p>
          <div className="flex items-center gap-2">
            <Button onClick={() => fileRef.current?.click()}>
              <Upload className="size-4" />
              Choose file
            </Button>
            <Button variant="outline" onClick={startBlank}>
              <Plus className="size-4" />
              Start a blank book
            </Button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            multiple
            onChange={onInput}
            className="hidden"
          />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-border pb-4">
            <input
              value={manuscript.title}
              onChange={(e) => updateTitle(e.target.value)}
              className="mr-auto min-w-0 flex-1 bg-transparent text-lg font-semibold tracking-tight focus:outline-none"
            />
            <span className="text-sm text-muted-foreground">
              {manuscript.pages.length} pages · {totalWords.toLocaleString()}{" "}
              words
            </span>
            <Button
              variant={liveProof ? "default" : "outline"}
              size="sm"
              onClick={() => setLiveProof((v) => !v)}
              title={
                online === false
                  ? "Ollama offline"
                  : "Proofread each chapter as you type"
              }
              disabled={online === false}
            >
              <Wand2 className="size-4" />
              Live proofread{liveProof ? " · on" : ""}
            </Button>
            {allRunning ? (
              <Button variant="outline" size="sm" onClick={stopAll}>
                <Square className="size-3.5" />
                Stop · {allIdx + 1}/{manuscript.pages.length}
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={proofreadAll}
                disabled={proofDisabled}
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
            {savedPath && (
              <div className="flex basis-full items-center gap-1.5 text-xs text-green-700">
                <CheckCircle2 className="size-3.5 shrink-0" />
                <span className="min-w-0 break-all">
                  Saved to <span className="font-medium">{savedPath}</span>
                </span>
              </div>
            )}
          </div>

          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto pr-1">
            {manuscript.pages.map((p, i) => {
              const pr = proof[i];
              return (
                <div
                  key={i}
                  className="mx-auto w-full"
                  style={{ maxWidth: pageW }}
                >
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
                      <MicButton
                        onText={(t) => dictateIntoPage(i, t)}
                        onError={setError}
                        label="Dictate"
                        idleTitle="Dictate this chapter — speak instead of typing"
                      />
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
                      <button
                        onClick={() => deletePage(i)}
                        title="Delete this page"
                        className="rounded p-1 text-muted-foreground hover:text-red-600"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>

                  <textarea
                    value={p}
                    onChange={(e) => updatePage(i, e.target.value)}
                    placeholder="Write this chapter…"
                    style={{ minHeight: pageMinH }}
                    className="block w-full resize-none rounded-sm bg-white px-16 py-16 font-serif text-[15px] leading-7 text-zinc-900 shadow-sm ring-1 ring-black/5 [field-sizing:content] placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />

                  {pr && (
                    <div className="mt-2 rounded-lg border border-border bg-card p-3">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="flex items-center gap-1 text-xs font-medium text-primary">
                          <Sparkles className="size-3.5" />
                          Suggested correction
                          {pr.status === "proofing" && " · proofreading…"}
                        </span>
                        {pr.status === "proofing" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => stopProof(i)}
                          >
                            <Square className="size-3.5" />
                            Stop
                          </Button>
                        )}
                      </div>
                      <div className="max-h-64 overflow-y-auto whitespace-pre-wrap text-[15px] leading-7">
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
                      <div className="mt-2 flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => dismissProof(i)}
                        >
                          <X className="size-4" />
                          Dismiss
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => applyProof(i)}
                          disabled={
                            pr.status !== "review" || !pr.suggestion.trim()
                          }
                        >
                          <Check className="size-4" />
                          Apply
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            <div className="mx-auto w-full pb-4" style={{ maxWidth: pageW }}>
              <Button variant="outline" onClick={addPage} className="w-full">
                <Plus className="size-4" />
                Add page
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
