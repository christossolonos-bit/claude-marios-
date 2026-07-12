import { useEffect, useRef, useState } from "react";
import {
  Presentation as PresentationIcon,
  Plus,
  Trash2,
  Play,
  Wand2,
  X,
  Square,
  Loader2,
  Check,
  Image as ImageIcon,
  Type,
  Bold,
  Italic,
  AlignLeft,
  AlignCenter,
  AlignRight,
} from "lucide-react";
import {
  type Deck,
  type DeckSummary,
  type Slide,
  type SlideElement,
  newSlide,
  newElement,
  elementsForSlide,
  listDecks,
  getDeck,
  createDeck,
  updateDeck,
  deleteDeck,
  parseOutline,
} from "@/lib/decks";
import { generateDeck } from "@/lib/deckAssist";
import { fileToDataUrl } from "@/lib/image";
import SlideView from "@/components/SlideView";
import SlideCanvas from "@/components/SlideCanvas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const selectClass =
  "flex h-9 rounded-md border border-border bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

// Remembers the open deck so Presentations reopens it on next launch.
const LAST_DECK = "authorhub.presentations.lastdeck";

export default function Presentations() {
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [deck, setDeck] = useState<Deck | null>(null);
  const [sel, setSel] = useState(0);
  const [selElId, setSelElId] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [imgError, setImgError] = useState<string | null>(null);
  const imgInputRef = useRef<HTMLInputElement | null>(null);
  const dragIdx = useRef<number | null>(null);

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
      const last = localStorage.getItem(LAST_DECK);
      const target = last && list.some((d) => d.id === last) ? last : list[0]?.id;
      if (target) open(target);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clear the element selection when moving to another slide.
  useEffect(() => setSelElId(null), [sel]);

  async function open(id: string) {
    const d = await getDeck(id);
    if (d) {
      setDeck(d);
      setSel(0);
      setSelElId(null);
      localStorage.setItem(LAST_DECK, id);
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
    localStorage.setItem(LAST_DECK, d.id);
  }

  async function removeDeck(id: string) {
    await deleteDeck(id);
    const list = await listDecks();
    setDecks(list);
    if (deck?.id === id) {
      if (list.length) open(list[0].id);
      else {
        setDeck(null);
        localStorage.removeItem(LAST_DECK);
      }
    }
  }

  // --- slide + element edits --------------------------------------------------
  function patchSlide(i: number, patch: Partial<Slide>) {
    if (!deck) return;
    const slides = deck.slides.map((s, idx) =>
      idx === i ? { ...s, ...patch } : s,
    );
    persist({ ...deck, slides });
  }

  // The current slide's canvas elements (synthesized from the layout the first
  // time an older/AI slide is edited).
  const slide = deck && deck.slides[sel] ? deck.slides[sel] : null;
  const els = slide ? elementsForSlide(slide) : [];
  const selEl = els.find((e) => e.id === selElId) ?? null;

  function setElements(elements: SlideElement[]) {
    patchSlide(sel, { elements });
  }

  function patchEl(id: string, p: Partial<SlideElement>) {
    setElements(els.map((e) => (e.id === id ? { ...e, ...p } : e)));
  }

  function addText() {
    const el = newElement("text", { text: "New text" });
    setElements([...els, el]);
    setSelElId(el.id);
  }

  async function addImageFromFile(file: File) {
    setImgError(null);
    try {
      const src = await fileToDataUrl(file);
      const el = newElement("image", { src });
      const next = [...els, el];
      // Save immediately so a too-large image surfaces a quota error now.
      const slides = deck!.slides.map((s, idx) =>
        idx === sel ? { ...s, elements: next } : s,
      );
      await updateDeck(deck!.id, { title: deck!.title, slides });
      setDeck({ ...deck!, slides });
      setSavedAt(Date.now());
      setDecks(await listDecks());
      setSelElId(el.id);
    } catch (e) {
      const quota = e instanceof Error && /quota|exceeded/i.test(e.message);
      setImgError(
        quota
          ? "That image is too large to store. Try a smaller one."
          : (e as Error).message || "Couldn't add that image.",
      );
    }
  }

  function deleteEl(id: string) {
    setElements(els.filter((e) => e.id !== id));
    setSelElId(null);
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

  // Reorder slides by dragging thumbnails.
  function reorder(from: number, to: number) {
    if (!deck || from === to) return;
    const slides = [...deck.slides];
    const [moved] = slides.splice(from, 1);
    slides.splice(to, 0, moved);
    persist({ ...deck, slides });
    setSel(to);
  }

  // --- AI generation ----------------------------------------------------------
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
    const isEmpty =
      !deck ||
      deck.slides.length === 0 ||
      (deck.slides.length === 1 &&
        !deck.slides[0].title &&
        !deck.slides[0].bullets.length &&
        !deck.slides[0].elements.length);

    if (!deck) {
      const d = await createDeck(topic.trim(), parsed);
      setDecks(await listDecks());
      setDeck(d);
      setSel(0);
      localStorage.setItem(LAST_DECK, d.id);
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

  // --- present mode keyboard --------------------------------------------------
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

  const genParsedCount = genText ? parseOutline(genText).length : 0;
  const fontSize = selEl?.fontSize ?? 24;

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
          {/* Thumbnail rail — drag to reorder */}
          <div className="w-44 shrink-0 space-y-2 overflow-y-auto border-r border-border p-2.5">
            {deck.slides.map((s, i) => (
              <div
                key={s.id}
                draggable
                onDragStart={() => (dragIdx.current = i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragIdx.current !== null) reorder(dragIdx.current, i);
                  dragIdx.current = null;
                }}
                onClick={() => setSel(i)}
                className={cn(
                  "group relative block w-full cursor-pointer overflow-hidden rounded-md border transition",
                  i === sel
                    ? "border-primary ring-2 ring-primary"
                    : "border-border hover:border-primary/50",
                )}
              >
                <span className="absolute left-1 top-1 z-10 rounded bg-black/50 px-1 text-[9px] font-medium text-white">
                  {i + 1}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeSlide(i);
                  }}
                  title="Delete slide"
                  className="absolute right-1 top-1 z-10 rounded bg-black/40 p-0.5 text-white opacity-0 transition group-hover:opacity-100 hover:bg-red-600"
                >
                  <X className="size-3" />
                </button>
                <div className="aspect-video">
                  <SlideView slide={s} />
                </div>
              </div>
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
              <div className="mx-auto max-w-4xl space-y-3">
                {/* Insert + format toolbar */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button variant="outline" size="sm" onClick={addText}>
                    <Type className="size-4" />
                    Text box
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => imgInputRef.current?.click()}
                  >
                    <ImageIcon className="size-4" />
                    Image
                  </Button>
                  <input
                    ref={imgInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) addImageFromFile(f);
                      e.target.value = "";
                    }}
                  />

                  {selEl && selEl.type === "text" && (
                    <>
                      <span className="mx-1 h-5 w-px bg-border" />
                      <Button
                        variant={selEl.bold ? "default" : "outline"}
                        size="icon"
                        onClick={() => patchEl(selEl.id, { bold: !selEl.bold })}
                        title="Bold"
                      >
                        <Bold className="size-4" />
                      </Button>
                      <Button
                        variant={selEl.italic ? "default" : "outline"}
                        size="icon"
                        onClick={() =>
                          patchEl(selEl.id, { italic: !selEl.italic })
                        }
                        title="Italic"
                      >
                        <Italic className="size-4" />
                      </Button>
                      {(["left", "center", "right"] as const).map((a) => {
                        const Icon =
                          a === "left"
                            ? AlignLeft
                            : a === "center"
                              ? AlignCenter
                              : AlignRight;
                        return (
                          <Button
                            key={a}
                            variant={selEl.align === a ? "default" : "outline"}
                            size="icon"
                            onClick={() => patchEl(selEl.id, { align: a })}
                            title={`Align ${a}`}
                          >
                            <Icon className="size-4" />
                          </Button>
                        );
                      })}
                      <div className="flex items-center rounded-md border border-border">
                        <button
                          onClick={() =>
                            patchEl(selEl.id, {
                              fontSize: Math.max(8, fontSize - 2),
                            })
                          }
                          className="px-2 py-1 text-sm hover:bg-accent"
                          title="Smaller text"
                        >
                          A−
                        </button>
                        <span className="w-8 text-center text-xs text-muted-foreground">
                          {fontSize}
                        </span>
                        <button
                          onClick={() =>
                            patchEl(selEl.id, {
                              fontSize: Math.min(200, fontSize + 2),
                            })
                          }
                          className="px-2 py-1 text-base hover:bg-accent"
                          title="Larger text"
                        >
                          A+
                        </button>
                      </div>
                      <input
                        type="color"
                        value={selEl.color ?? "#171717"}
                        onChange={(e) =>
                          patchEl(selEl.id, { color: e.target.value })
                        }
                        title="Text color"
                        className="size-8 cursor-pointer rounded border border-border bg-background p-0.5"
                      />
                    </>
                  )}

                  {selEl && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteEl(selEl.id)}
                      title="Delete element"
                      className="ml-auto"
                    >
                      <Trash2 className="size-4 text-red-500" />
                    </Button>
                  )}
                </div>

                {imgError && (
                  <p className="text-xs text-red-600">{imgError}</p>
                )}

                {/* Canvas */}
                <div className="overflow-hidden rounded-lg border border-border shadow-sm">
                  <div className="aspect-video">
                    <SlideCanvas
                      elements={els}
                      selectedId={selElId}
                      onSelect={setSelElId}
                      onChange={setElements}
                    />
                  </div>
                </div>
                <p className="text-center text-xs text-muted-foreground">
                  Double-click text to edit · drag to move · drag a corner to
                  resize · click empty space to deselect
                </p>

                {/* Speaker notes */}
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
              <SlideView slide={deck.slides[pIdx]} />
            </div>
          </div>

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
            <span className="text-white/40">← → to move · Esc to exit</span>
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
