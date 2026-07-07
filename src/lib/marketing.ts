// Marketing content generator config + saved-content store.

export interface ContentType {
  id: string;
  label: string;
  guidance: string;
}

export const CONTENT_TYPES: ContentType[] = [
  {
    id: "tweet",
    label: "X / Twitter post",
    guidance:
      "A single punchy post under 280 characters with a strong hook and 1-2 relevant hashtags.",
  },
  {
    id: "thread",
    label: "X / Twitter thread",
    guidance:
      "A 4-6 tweet thread. Number each tweet, keep each under 280 characters, and open with a scroll-stopping hook.",
  },
  {
    id: "instagram",
    label: "Instagram caption",
    guidance:
      "An engaging caption with a hook, short line breaks, a clear call to action, and 5-8 hashtags at the end.",
  },
  {
    id: "linkedin",
    label: "LinkedIn post",
    guidance:
      "A professional but personable post with a hook, short paragraphs, a lesson or insight, and a reflective call to action.",
  },
  {
    id: "facebook",
    label: "Facebook post",
    guidance:
      "A warm, conversational post with a clear call to action and 1-2 hashtags.",
  },
  {
    id: "blurb",
    label: "Book blurb",
    guidance:
      "A compelling back-cover book description of 120-180 words that hooks the reader and ends on intrigue.",
  },
  {
    id: "email",
    label: "Launch email",
    guidance:
      "A book-launch email: start with a subject line, then a greeting, a body that builds excitement, and a clear call-to-action line. Use markdown.",
  },
  {
    id: "newsletter",
    label: "Newsletter",
    guidance:
      "A friendly newsletter section with a heading, 2-3 short paragraphs, and a call to action.",
  },
  {
    id: "ad",
    label: "Ad copy",
    guidance:
      "3 short ad variations, each with a headline and a 1-2 line body. Punchy and benefit-driven.",
  },
];

export const TONES = [
  "Friendly",
  "Professional",
  "Inspiring",
  "Casual",
  "Bold",
];

export function contentTypeLabel(id: string): string {
  return CONTENT_TYPES.find((c) => c.id === id)?.label ?? id;
}

export function buildMessages(
  typeId: string,
  subject: string,
  tone: string,
): { system: string; user: string } {
  const t = CONTENT_TYPES.find((c) => c.id === typeId) ?? CONTENT_TYPES[0];
  const system =
    "You are an expert book-marketing and social-media copywriter helping a life coach promote his book and coaching practice. Write polished, ready-to-post copy. Output only the copy itself — no preamble, no explanations, and no meta commentary.";
  const user = `Write ${t.label.toLowerCase()} about:\n${subject}\n\nTone: ${tone}.\n${t.guidance}`;
  return { system, user };
}

// --- saved content ---

export interface SavedContent {
  id: string;
  type: string;
  subject: string;
  content: string;
  createdAt: number;
}

const KEY = "authorhub.marketing.v1";

function read(): SavedContent[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SavedContent[]) : [];
  } catch {
    return [];
  }
}

function write(items: SavedContent[]): void {
  localStorage.setItem(KEY, JSON.stringify(items));
}

export async function listSaved(): Promise<SavedContent[]> {
  return read().sort((a, b) => b.createdAt - a.createdAt);
}

export async function addSaved(
  data: Omit<SavedContent, "id" | "createdAt">,
): Promise<SavedContent> {
  const item: SavedContent = {
    ...data,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  };
  const items = read();
  items.push(item);
  write(items);
  return item;
}

export async function deleteSaved(id: string): Promise<void> {
  write(read().filter((i) => i.id !== id));
}
