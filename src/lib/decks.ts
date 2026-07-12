// Presentation decks — PowerPoint-style slide decks. Local-first, same
// localStorage + async pattern as documents/tasks, ready to move to the Tauri
// SQLite plugin later without touching callers. AI generation (deckAssist) and
// .pptx export are layered on top of this in later increments.

export type SlideLayout = "title" | "bullets" | "section" | "free" | "image";

// PowerPoint-style free-canvas element. Positions and sizes are percentages of
// the slide (0–100) so they scale to any rendered size. Font size is in px on a
// 960px-wide reference slide and scaled with the slide via container units.
export type ElementType = "text" | "image";

export interface SlideElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  w: number;
  h: number;
  // text elements
  text?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  align?: "left" | "center" | "right";
  color?: string;
  // image elements
  src?: string;
}

export interface Slide {
  id: string;
  layout: SlideLayout;
  title: string;
  subtitle: string; // used by the "title" layout
  bullets: string[]; // used by the "bullets" layout
  body: string; // free-form text, used by the "free" layout
  image: string; // data-URL image, used by the "image" layout (title = caption)
  notes: string; // speaker notes (not shown on the slide)
  // Free-canvas elements. When empty (AI-generated or older slides), elements
  // are synthesized from the layout fields above via elementsForSlide().
  elements: SlideElement[];
}

// Reference slide width the element font sizes are authored against.
export const SLIDE_REF_W = 960;

export function newElement(
  type: ElementType,
  init: Partial<SlideElement> = {},
): SlideElement {
  return {
    id: crypto.randomUUID(),
    type,
    x: type === "image" ? 30 : 10,
    y: type === "image" ? 25 : 40,
    w: type === "image" ? 40 : 50,
    h: type === "image" ? 45 : 15,
    text: type === "text" ? "Text" : undefined,
    fontSize: type === "text" ? 28 : undefined,
    bold: false,
    italic: false,
    align: "left",
    color: "#171717",
    ...init,
  };
}

export interface Deck {
  id: string;
  title: string;
  slides: Slide[];
  createdAt: number;
  updatedAt: number;
}

export interface DeckSummary {
  id: string;
  title: string;
  updatedAt: number;
  slideCount: number;
}

const KEY = "authorhub.decks.v1";

export const LAYOUT_LABEL: Record<SlideLayout, string> = {
  title: "Title",
  bullets: "Title & bullets",
  section: "Section header",
  free: "Free text",
  image: "Image",
};

export function newSlide(
  layout: SlideLayout = "bullets",
  init: Partial<Slide> = {},
): Slide {
  return {
    id: crypto.randomUUID(),
    layout,
    title: "",
    subtitle: "",
    bullets: [],
    body: "",
    image: "",
    notes: "",
    elements: [],
    ...init,
  };
}

// Build canvas elements for a slide that has none yet — so AI-generated and
// pre-canvas slides render (and become editable) on the free canvas. Once the
// user edits on the canvas, the slide's own `elements` are saved and used.
export function elementsForSlide(slide: Slide): SlideElement[] {
  if (slide.elements && slide.elements.length) return slide.elements;

  const els: SlideElement[] = [];
  const text = (init: Partial<SlideElement>) =>
    els.push(newElement("text", init));

  switch (slide.layout) {
    case "title":
      text({
        x: 8,
        y: 32,
        w: 84,
        h: 22,
        text: slide.title || "Presentation title",
        fontSize: 48,
        bold: true,
        align: "center",
      });
      if (slide.subtitle)
        text({
          x: 8,
          y: 56,
          w: 84,
          h: 12,
          text: slide.subtitle,
          fontSize: 26,
          align: "center",
          color: "#525252",
        });
      break;
    case "section":
      text({
        x: 8,
        y: 40,
        w: 84,
        h: 20,
        text: slide.title || "Section",
        fontSize: 40,
        bold: true,
      });
      break;
    case "image":
      if (slide.image)
        els.push(
          newElement("image", { x: 12, y: 8, w: 76, h: 74, src: slide.image }),
        );
      if (slide.title)
        text({
          x: 8,
          y: 84,
          w: 84,
          h: 10,
          text: slide.title,
          fontSize: 22,
          align: "center",
          color: "#525252",
        });
      break;
    case "free":
      if (slide.title)
        text({
          x: 8,
          y: 8,
          w: 84,
          h: 14,
          text: slide.title,
          fontSize: 34,
          bold: true,
        });
      text({
        x: 8,
        y: slide.title ? 24 : 10,
        w: 84,
        h: slide.title ? 68 : 82,
        text: slide.body,
        fontSize: 22,
      });
      break;
    case "bullets":
    default:
      text({
        x: 8,
        y: 8,
        w: 84,
        h: 14,
        text: slide.title || "Slide title",
        fontSize: 34,
        bold: true,
      });
      text({
        x: 8,
        y: 26,
        w: 84,
        h: 66,
        text: slide.bullets
          .filter((b) => b.trim())
          .map((b) => `•  ${b}`)
          .join("\n"),
        fontSize: 22,
      });
      break;
  }
  // Deterministic ids so synthesized elements keep a stable identity across
  // renders (selection + drag depend on it) until the slide is actually edited.
  els.forEach((e, i) => (e.id = `${slide.id}~${i}`));
  return els;
}

function read(): Deck[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const decks = JSON.parse(raw) as Deck[];
    // Backfill fields added in later versions so decks saved before the free /
    // image layouts existed still render cleanly.
    return decks.map((d) => ({
      ...d,
      slides: d.slides.map((s) => ({
        ...s,
        body: s.body ?? "",
        image: s.image ?? "",
        elements: s.elements ?? [],
      })),
    }));
  } catch {
    return [];
  }
}

function write(decks: Deck[]): void {
  localStorage.setItem(KEY, JSON.stringify(decks));
}

export async function listDecks(): Promise<DeckSummary[]> {
  return read()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((d) => ({
      id: d.id,
      title: d.title.trim() || "Untitled deck",
      updatedAt: d.updatedAt,
      slideCount: d.slides.length,
    }));
}

export async function getDeck(id: string): Promise<Deck | null> {
  return read().find((d) => d.id === id) ?? null;
}

export async function createDeck(title = "", slides?: Slide[]): Promise<Deck> {
  const now = Date.now();
  const deck: Deck = {
    id: crypto.randomUUID(),
    title: title.trim(),
    slides:
      slides && slides.length
        ? slides
        : [newSlide("title", { title: title.trim() })],
    createdAt: now,
    updatedAt: now,
  };
  const decks = read();
  decks.push(deck);
  write(decks);
  return deck;
}

export async function updateDeck(
  id: string,
  patch: Partial<Pick<Deck, "title" | "slides">>,
): Promise<void> {
  write(
    read().map((d) =>
      d.id === id ? { ...d, ...patch, updatedAt: Date.now() } : d,
    ),
  );
}

export async function deleteDeck(id: string): Promise<void> {
  write(read().filter((d) => d.id !== id));
}

// Parse an AI (or pasted) outline into slides. Slides are separated by a line
// containing only "---". Within a slide the first line is the title and lines
// starting with -, *, or • are bullets. Tolerant of stray markdown so small
// local models' output still lands cleanly.
export function parseOutline(text: string): Slide[] {
  const blocks = text
    .split(/^\s*---\s*$/m)
    .map((b) => b.trim())
    .filter(Boolean);

  const slides: Slide[] = [];
  for (const block of blocks) {
    const lines = block
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) continue;

    const title = lines[0]
      .replace(/^#+\s*/, "") // markdown heading
      .replace(/^title:\s*/i, "") // "Title:" prefix
      .replace(/^\d+[.)]\s*/, "") // "1." / "1)" numbering
      .replace(/^\*\*|\*\*$/g, "") // bold markers
      .trim();

    const bullets = lines
      .slice(1)
      .filter((l) => /^[-*•]/.test(l))
      .map((l) => l.replace(/^[-*•]\s*/, "").trim())
      .filter(Boolean);

    slides.push(
      newSlide(bullets.length ? "bullets" : "section", { title, bullets }),
    );
  }

  // Make the first slide a title slide; promote its first bullet to a subtitle.
  if (slides.length) {
    const first = slides[0];
    first.layout = "title";
    if (!first.subtitle && first.bullets.length) {
      first.subtitle = first.bullets[0];
      first.bullets = [];
    }
  }
  return slides;
}
