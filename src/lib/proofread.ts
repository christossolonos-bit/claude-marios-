// Proofreading for the book manuscript — one page (chunk) at a time, since a
// whole book far exceeds the local model's context. Streams a corrected version
// of the page that the author reviews and applies. Fully local via Ollama.

import { streamChat, type ChatMessage } from "./ollama";
import { getSettings } from "./settings";

const SYSTEM =
  "You are a professional proofreader and copy editor working on a book manuscript. Correct spelling, grammar, punctuation, and typos, and smooth clearly awkward phrasing — but preserve the author's voice, meaning, and paragraph breaks. Do not add or remove content or commentary. Return ONLY the corrected text of this page, with no notes, explanations, or quotation marks. Respond in the same language as the text.";

export function proofreadText(opts: {
  text: string;
  signal?: AbortSignal;
  onToken: (t: string) => void;
}): Promise<void> {
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM },
    { role: "user", content: `Proofread this page:\n\n${opts.text}` },
  ];
  return streamChat({
    model: getSettings().model,
    messages,
    signal: opts.signal,
    onToken: opts.onToken,
  });
}
