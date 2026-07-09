// Recall engine — local, keyword-based "retrieve-before-generate" search across
// the dad's past conversations AND his project/seminar notes. Runs on each user
// message BEFORE the model replies, so the relevant history is injected into the
// single model call's context (no extra request — respects one-request-per-message).
// Fully local; nothing leaves the machine.

import { allConversations } from "./conversations";
import { listProjects } from "./projects";
import { listSeminars } from "./seminars";

export type RecallSource = "chat" | "project" | "seminar";

export interface RecallItem {
  source: RecallSource;
  label: string; // conversation title / project name / seminar title
  when: number;
  text: string; // snippet around the match
  score: number;
}

const STOP = new Set([
  "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "for", "with",
  "at", "by", "from", "is", "are", "was", "were", "be", "do", "does", "did",
  "i", "you", "he", "she", "it", "we", "they", "me", "my", "your", "our",
  "what", "when", "where", "how", "who", "that", "this", "these", "those",
  "about", "can", "could", "would", "should", "please", "tell", "remind",
  "remember", "get", "got", "have", "has", "had", "want", "need", "know",
]);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

function overlap(text: string, terms: Set<string>): number {
  const words = new Set(tokenize(text));
  let hits = 0;
  for (const t of terms) if (words.has(t)) hits++;
  return hits;
}

/** ~200-char window around the first query-term hit. */
function snippetAround(text: string, terms: Set<string>): string {
  const clean = text.replace(/\s+/g, " ").trim();
  const lower = clean.toLowerCase();
  let hit = -1;
  for (const t of terms) {
    const i = lower.indexOf(t);
    if (i !== -1 && (hit === -1 || i < hit)) hit = i;
  }
  if (hit === -1) return clean.slice(0, 200);
  const start = Math.max(0, hit - 60);
  const end = Math.min(clean.length, hit + 140);
  return (
    (start > 0 ? "…" : "") +
    clean.slice(start, end).trim() +
    (end < clean.length ? "…" : "")
  );
}

/**
 * Search chats + project/seminar notes for the query. Returns the top matches
 * across all sources, most-relevant first (recency breaks ties).
 */
export async function recall(
  query: string,
  opts: { excludeConversationId?: string; limit?: number } = {},
): Promise<RecallItem[]> {
  const terms = new Set(tokenize(query));
  if (!terms.size) return [];
  const limit = opts.limit ?? 4;

  const [convos, projects, seminars] = await Promise.all([
    allConversations(),
    listProjects(),
    listSeminars(),
  ]);

  const items: RecallItem[] = [];

  // Past conversations — score whole convo, snippet from best-matching message.
  for (const c of convos) {
    if (c.id === opts.excludeConversationId) continue;
    let score = 0;
    let best: { text: string; hits: number } | null = null;
    for (const msg of c.messages) {
      const hits = overlap(msg.content, terms);
      score += hits;
      if (hits && (!best || hits > best.hits))
        best = { text: msg.content, hits };
    }
    if (score > 0 && best)
      items.push({
        source: "chat",
        label: c.title,
        when: c.updatedAt,
        text: snippetAround(best.text, terms),
        score,
      });
  }

  // Projects — name + description.
  for (const p of projects) {
    const body = `${p.name}\n${p.description}`;
    const score = overlap(body, terms);
    if (score > 0)
      items.push({
        source: "project",
        label: p.name,
        when: p.createdAt,
        text: snippetAround(p.description || p.name, terms),
        score,
      });
  }

  // Seminars — title + raw notes + outline.
  for (const s of seminars) {
    const body = `${s.title}\n${s.notes}\n${s.outline}`;
    const score = overlap(body, terms);
    if (score > 0)
      items.push({
        source: "seminar",
        label: s.title,
        when: s.createdAt,
        text: snippetAround(`${s.notes} ${s.outline}`.trim() || s.title, terms),
        score,
      });
  }

  return items
    .sort((a, b) => b.score - a.score || b.when - a.when)
    .slice(0, limit);
}

const SOURCE_LABEL: Record<RecallSource, string> = {
  chat: "past chat",
  project: "project",
  seminar: "seminar",
};

/** Format recalled items for injection into the assistant's system prompt. */
export function recallContext(items: RecallItem[]): string {
  if (!items.length) return "";
  const lines = items.map((it) => {
    const when = new Date(it.when).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    return `- [${SOURCE_LABEL[it.source]}: "${it.label}", ${when}] ${it.text}`;
  });
  return `Possibly relevant material from the user's earlier chats, projects, and seminar notes. Use it only if it genuinely helps answer, and say when you're drawing on something he noted earlier:\n${lines.join(
    "\n",
  )}`;
}
