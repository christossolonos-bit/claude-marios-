// AI presentation assist — local Ollama drafts a slide deck outline from a
// topic. Streams text back in the simple "--- separated slides" format that
// decks.parseOutline understands, so the page can preview it live and then
// turn it into real slides. Language-agnostic: replies in the topic's language.

import { streamChat, type ChatMessage } from "./ollama";
import { getSettings } from "./settings";

const DECK_SYSTEM = `You are a presentation designer creating a slide deck.
Output ONLY slides, each separated by a line containing exactly ---
For each slide:
- the FIRST line is a short slide title (a few words, no numbering, no markdown)
- then 3 to 5 concise bullet points, each on its own line starting with "- "
- keep bullets short: a few words each, not full sentences
Begin with a title slide (the presentation title, then one short bullet as a subtitle) and end with a brief closing slide. No preamble or commentary. Respond in the same language as the topic.`;

interface StreamOpts {
  signal?: AbortSignal;
  onToken: (t: string) => void;
}

export function generateDeck(
  opts: { topic: string; count?: number; context?: string } & StreamOpts,
): Promise<void> {
  const n = opts.count ?? 8;
  const ctx = opts.context ? `Background: ${opts.context}\n\n` : "";
  const messages: ChatMessage[] = [
    { role: "system", content: DECK_SYSTEM },
    {
      role: "user",
      content: `${ctx}Create about ${n} slides for a presentation on:\n${opts.topic}`,
    },
  ];
  return streamChat({
    model: getSettings().model,
    messages,
    signal: opts.signal,
    onToken: opts.onToken,
  });
}
