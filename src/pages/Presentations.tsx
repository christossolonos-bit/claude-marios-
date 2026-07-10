import { useEffect, useRef, useState } from "react";
import {
  Presentation as PresentationIcon,
  Plus,
  Trash2,
  Play,
  Wand2,
  ChevronUp,
  ChevronDown,
  X,
  Square,
  Loader2,
  Check,
} from "lucide-react";
import {
  type Deck,
  type DeckSummary,
  type Slide,
  type SlideLayout,
  LAYOUT_LABEL,
  newSlide,
  listDecks,
  getDeck,
  createDeck,
  updateDeck,
  deleteDeck,
  parseOutline,
} from "@/lib/decks";
import { generateDeck } from "@/lib/deckAssist";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const selectClass =
  "flex h-9 rounded-md border border-border bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

// A slide rendered as a "paper" 16:9 surface — light regardless of app theme,
// like a real slide. Fills its container; text scales with the `full` flag.
function SlideView({ slide, full }: { slide: Slide; full: boolean }) {
  const bullets = slide.bullets.filter((b) => b.trim());
  return (
    <div
      className={cn(
        "flex h-full w-full flex-col overflow-hidden bg-white text-neutral-900",
        full ? "p-10" : "p-2.5",
      )}
    >
      {slide.layout === "title" && (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <h1 className={cn("font-bold", full ? "text-4xl" : "truncate text-[11px]")}>
            {slide.title || "Presentation title"}
          </h1>
          {slide.subtitle && (
            <p
              className={cn(
                "text-neutral-500",
                full ? "mt-4 text-xl" : "mt-0.5 truncate text-[8px]",
              )}
            >
              {slide.subtitle}
            </p>
          )}
        </div>
      )}

      {slide.layout === "section" && (
        <div className="flex flex-1 flex-col justify-center">
          <div className={cn("border-l-primary", full ? "border-l-4 pl-5" : "border-l-2 pl-1.5")}>
            <h2
              className={cn(
                "font-semibold",
                full ? "text-3xl" : "truncate text-[10px]",
              )}
            >
              {slide.title || "Section"}
            </h2>
          </div>
        </div>
      )}

      {slide.layout === "bullets" && (
        <div className="flex h-full flex-col">
          <h2 className={cn("font-bold", full ? "text-3xl" : "truncate text-[10px]")}>
            {slide.title || "Slide title"}
          </h2>
          <ul
            className={cn(
              "flex-1",
              full ? "mt-5 space-y-3 text-xl" : "mt-1 space-y-0.5 text-[8px]",
            )}
          >
            {bullets.map((b, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-primary">•</span>
                <span className={full ? "" : "truncate"}>{b}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function Presentations() {
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [deck, setDeck] = useState<Deck | null>(null);
  const [sel, setSel] = useState(0);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Present mode
  const [present, setPresent] = useState(false);
  const [pIdx, setPIdx] = useState(0);

  // AI generation
  const [genOpen, setGenOpen] = useState(false);
  const [topic, setTopic] = useState("");
  const [count, setCount] = useState(8);
  const [genText, setGenText] = useState("");
  const [generating, setGenerating] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    listDecks().then((list) => {
      setDecks(list);
      if (list.length) open(list[0].id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function open(id: string) {
    const d = await getDeck(id);
    if (d) {
      setDeck(d);
      setSel(0);
    }
  }

  // Persist a changed deck: update state immediately, debounce the write.
  function persist(next: Deck) {
    setDeck(next);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      await updateDeck(next.id, { title: next.title, slides: next.slides });
      setSavedAt(Date.now());
      setDecks(await listDecks());
    }, 500);
  }

  async function newDeck() {
    const d = await createDeck("Untitled deck");
    setDecks(await listDecks());
    setDeck(d);
    setSel(0);
  }

  async function removeDeck(id: string) {
    await deleteDeck(id);
    const list = await listDecks();
    setDecks(list);
    if (deck?.id === id) {
      if (list.length) open(list[0].id);
      else setDeck(null);
    }
  }

  // --- slide edits ----------------------------------------------------------
  function patchSlide(i: number, patch: Partial<Slide>) {
    if (!deck) return;
    const slides = deck.slides.map((s, idx) =>
      idx === i ? { ...s, ...patch } : s,
    );
    persist({ ...deck, slides });
  }

  function addSlide() {
    if (!deck) return;
    const slides = [...deck.slides, newSlide("bullets")];
    persist({ ...deck, slides });
    setSel(slides.length - 1);
  }

  function removeSlide(i: number) {
    if (!deck) return;
    const slides = deck.slides.filter((_, idx) => idx !== i);
    persist({ ...deck, slides });
    setSel((s) => Math.max(0, Math.min(s, slides.length - 1)));
  }

  function moveSlide(i: number, dir: -1 | 1) {
    if (!deck) return;
    const j = i + dir;
    if (j < 0 || j >= deck.slides.length) return;
    const slides = [...deck.slides];
    [slides[i], slides[j]] = [slides[j], slides[i]];
    persist({ ...deck, slides });
    setSel(j);
  }

  // --- AI generation --------------------------------------------------------
  async function runGen() {
    if (!topic.trim()) return;
    setGenText("");
    setGenerating(true);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      await generateDeck({
        topic: topic.trim(),
        count,
        signal: ac.signal,
        onToken: (t) => setGenText((prev) => prev + t),
      });
    } catch {
      // aborted or model error — whatever streamed stays for review
    } finally {
      setGenerating(false);
      abortRef.current = null;
    }
  }

  function stopGen() {
    abortRef.current?.abort();
  }

  async function useGenerated() {
    const parsed = parseOutline(genText);
    if (!parsed.length) return;
    // Fresh/empty deck → replace; otherwise append.
    const isEmpty =
      !deck ||
      deck.slides.length === 0 ||
      (deck.slides.length === 1 &&
        !deck.slides[0].title &&
        !deck.slides[0].bullets.length);

    if (!deck) {
      const d = await createDeck(topic.trim(), parsed);
      setDecks(await listDecks());
      setDeck(d);
      setSel(0);
    } else {
      const slides = isEmpty ? parsed : [...deck.slides, ...parsed];
      const title = deck.title.trim() || topic.trim();
      persist({ ...deck, title, slides });
      setSel(isEmpty ? 0 : deck.slides.length);
    }
    setGenOpen(false);
    setGenText("");
    setTopic("");
  }

  // --- present mode keyboard ------------------------------------------------
  useEffect(() => {
    if (!present || !deck) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") {
        e.preventDefault();
        setPIdx((i) => Math.min(i + 1, deck.slides.length - 1));
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        setPIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Escape") {
        setPresent(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [present, deck]);

  function startPresent() {
    if (!deck || !deck.slides.length) return;
    setPIdx(sel);
    setPresent(true);
  }

  const slide = deck && deck.slides[sel] ? deck.slides[sel] : null;
  const genParsedCount = genText ? parseOutline(genText).length : 0;

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
        <PresentationIcon className="size-5 text-primary" />
        <h1 className="mr-1 font-semibold tracking-tight">Presentations</h1>

        {decks.length > 0 && (
          <select
            value={deck?.id ?? ""}
            onChange={(e) => open(e.target.value)}
            className={selectClass}
          >
            {decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title} · {d.slideCount} slide{d.slideCount === 1 ? "" : "s"}
              </option>
            ))}
          </select>
        )}

        <Button variant="outline" size="sm" onClick={newDeck}>
          <Plus className="size-4" />
          New deck
        </Button>
        {deck && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => removeDeck(deck.id)}
            aria-label="Delete deck"
            title="Delete this deck"
          >
            <Trash2 className="size-4 text-red-500" />
          </Button>
        )}

        <div className="ml-auto flex items-center gap-2">
          {savedAt && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Check className="size-3.5 text-green-600" /> Saved
            </span>
          )}
          <Button variant="outline" size="sm" onClick={() => setGenOpen(true)}>
            <Wand2 className="size-4" />
            Generate with AI
          </Button>
          <Button
            size="sm"
            onClick={startPresent}
            disabled={!deck || !deck.slides.length}
          >
            <Play className="size-4" />
            Present
          </Button>
        </div>
      </div>

      {!deck ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <PresentationIcon className="size-10 text-muted-foreground" />
          <div>
            <p className="font-medium">No presentations yet</p>
            <p className="text-sm text-muted-foreground">
              Start a deck, or let the assistant draft one from a topic.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={newDeck}>
              <Plus className="size-4" />
              New deck
            </Button>
            <Button onClick={() => setGenOpen(true)}>
              <Wand2 className="size-4" />
              Generate with AI
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          {/* Thumbnail rail */}
          <div className="w-44 shrink-0 space-y-2 overflow-y-auto border-r border-border p-2.5">
            {deck.slides.map((s, i) => (
              <button
                key={s.id}
                onClick={() => setSel(i)}
                className={cn(
                  "group relative block w-full overflow-hidden rounded-md border text-left transition",
                  i === sel
                    ? "border-primary ring-2 ring-primary"
                    : "border-border hover:border-primary/50",
                )}
              >
                <span className="absolute left-1 top-1 z-10 rounded bg-black/50 px-1 text-[9px] font-medium text-white">
                  {i + 1}
                </span>
                <div className="aspect-video">
                  <SlideView slide={s} full={false} />
                </div>
              </button>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={addSlide}
            >
              <Plus className="size-4" />
              Add slide
            </Button>
          </div>

          {/* Editor */}
          <div className="min-w-0 flex-1 overflow-y-auto p-6">
            <Input
              value={deck.title}
              onChange={(e) => persist({ ...deck, title: e.target.value })}
              placeholder="Deck title"
              className="mb-4 max-w-md text-base font-semibold"
            />

            {slide ? (
              <div className="mx-auto max-w-3xl space-y-4">
                {/* Canvas */}
                <div className="overflow-hidden rounded-lg border border-border shadow-sm">
                  <div className="aspect-video">
                    <SlideView slide={slide} full />
                  </div>
                </div>

                {/* Slide controls */}
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={slide.layout}
                    onChange={(e) =>
                      patchSlide(sel, {
                        layout: e.target.value as SlideLayout,
                      })
                    }
                    className={selectClass}
                  >
                    {(Object.keys(LAYOUT_LABEL) as SlideLayout[]).map((l) => (
                      <option key={l} value={l}>
                        {LAYOUT_LABEL[l]}
                      </option>
                    ))}
                  </select>
                  <div className="ml-auto flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => moveSlide(sel, -1)}
                      disabled={sel === 0}
                      aria-label="Move slide up"
                    >
                      <ChevronUp className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => moveSlide(sel, 1)}
                      disabled={sel === deck.slides.length - 1}
                      aria-label="Move slide down"
                    >
                      <ChevronDown className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeSlide(sel)}
                      aria-label="Delete slide"
                    >
                      <Trash2 className="size-4 text-red-500" />
                    </Button>
                  </div>
                </div>

                {/* Fields per layout */}
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium">Title</label>
                    <Input
                      value={slide.title}
                      onChange={(e) => patchSlide(sel, { title: e.target.value })}
                      className="mt-1"
                    />
                  </div>

                  {slide.layout === "title" && (
                    <div>
                      <label className="text-sm font-medium">Subtitle</label>
                      <Input
                        value={slide.subtitle}
                        onChange={(e) =>
                          patchSlide(sel, { subtitle: e.target.value })
                        }
                        className="mt-1"
                      />
                    </div>
                  )}

                  {slide.layout === "bullets" && (
                    <div>
                      <label className="text-sm font-medium">Bullet points</label>
                      <div className="mt-1 space-y-2">
                        {slide.bullets.map((b, bi) => (
                          <div key={bi} className="flex items-center gap-2">
                            <span className="text-muted-foreground">•</span>
                            <Input
                              value={b}
                              onChange={(e) => {
                                const bullets = slide.bullets.map((x, xi) =>
                                  xi === bi ? e.target.value : x,
                                );
                                patchSlide(sel, { bullets });
                              }}
                              placeholder="Point…"
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() =>
                                patchSlide(sel, {
                                  bullets: slide.bullets.filter(
                                    (_, xi) => xi !== bi,
                                  ),
                                })
                              }
                              aria-label="Remove bullet"
                            >
                              <X className="size-4" />
                            </Button>
                          </div>
                        ))}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            patchSlide(sel, { bullets: [...slide.bullets, ""] })
                          }
                        >
                          <Plus className="size-4" />
                          Add point
                        </Button>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="text-sm font-medium">
                      Speaker notes{" "}
                      <span className="font-normal text-muted-foreground">
                        (only you see these)
                      </span>
                    </label>
                    <Textarea
                      value={slide.notes}
                      onChange={(e) => patchSlide(sel, { notes: e.target.value })}
                      rows={3}
                      className="mt-1"
                      placeholder="What to say on this slide…"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="mx-auto max-w-3xl rounded-lg border border-dashed border-border p-10 text-center text-muted-foreground">
                This deck has no slides.{" "}
                <button className="text-primary underline" onClick={addSlide}>
                  Add one
                </button>
                .
              </div>
            )}
          </div>
        </div>
      )}

      {/* AI generation dialog */}
      <Dialog
        open={genOpen}
        onClose={() => {
          if (!generating) setGenOpen(false);
        }}
      >
        <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold">
          <Wand2 className="size-5 text-primary" />
          Generate a deck
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Describe the talk and the local assistant will draft the slides. Review
          them, then add to your deck.
        </p>

        <div className="space-y-3">
          <Textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            rows={3}
            placeholder="e.g. A 10-minute talk introducing my book on resilient habits, for a coaching seminar"
          />
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground">Slides</label>
            <Input
              type="number"
              min={3}
              max={20}
              value={count}
              onChange={(e) => setCount(Number(e.target.value) || 8)}
              className="w-20"
            />
            {generating ? (
              <Button variant="outline" size="sm" onClick={stopGen}>
                <Square className="size-4" />
                Stop
              </Button>
            ) : (
              <Button size="sm" onClick={runGen} disabled={!topic.trim()}>
                <Wand2 className="size-4" />
                {genText ? "Regenerate" : "Generate"}
              </Button>
            )}
            {generating && (
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            )}
          </div>

          {genText && (
            <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-3 text-xs">
              {genText}
            </pre>
          )}
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setGenOpen(false)}
            disabled={generating}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={useGenerated}
            disabled={generating || genParsedCount === 0}
          >
            <Check className="size-4" />
            Add {genParsedCount || ""} slide{genParsedCount === 1 ? "" : "s"}
          </Button>
        </div>
      </Dialog>

      {/* Present mode */}
      {present && deck && deck.slides[pIdx] && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black">
          <div className="flex flex-1 items-center justify-center p-6">
            <div className="aspect-video w-full max-w-6xl overflow-hidden rounded-lg shadow-2xl">
              <SlideView slide={deck.slides[pIdx]} full />
            </div>
          </div>

          {/* click zones for prev/next */}
          <button
            className="absolute inset-y-0 left-0 w-1/3 cursor-w-resize"
            onClick={() => setPIdx((i) => Math.max(i - 1, 0))}
            aria-label="Previous slide"
          />
          <button
            className="absolute inset-y-0 right-0 w-1/3 cursor-e-resize"
            onClick={() =>
              setPIdx((i) => Math.min(i + 1, deck.slides.length - 1))
            }
            aria-label="Next slide"
          />

          <div className="flex items-center justify-between px-6 py-3 text-sm text-white/70">
            <span>
              {pIdx + 1} / {deck.slides.length}
            </span>
            <span className="text-white/40">
              ← → to move · Esc to exit
            </span>
            <button
              onClick={() => setPresent(false)}
              className="flex items-center gap-1 rounded px-2 py-1 hover:bg-white/10"
            >
              <X className="size-4" />
              Exit
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
