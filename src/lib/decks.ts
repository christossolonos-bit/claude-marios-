// Presentation decks — PowerPoint-style slide decks. Local-first, same
// localStorage + async pattern as documents/tasks, ready to move to the Tauri
// SQLite plugin later without touching callers. AI generation (deckAssist) and
// .pptx export are layered on top of this in later increments.

export type SlideLayout = "title" | "bullets" | "section" | "free" | "image";

export interface Slide {
  id: string;
  layout: SlideLayout;
  title: string;
  subtitle: string; // used by the "title" layout
  bullets: string[]; // used by the "bullets" layout
  body: string; // free-form text, used by the "free" layout
  image: string; // data-URL image, used by the "image" layout (title = caption)
  notes: string; // speaker notes (not shown on the slide)
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
    ...init,
  };
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
