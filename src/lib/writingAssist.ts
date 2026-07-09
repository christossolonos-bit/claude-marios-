// AI writing assist — local Ollama edits on a selection (or the whole draft).
// Streams the revised text back; the editor shows it as a suggestion the author
// accepts or discards. Language-agnostic: it replies in the text's own language
// (the book may be drafted in another language before translation).

import { streamChat, type ChatMessage } from "./ollama";
import { getSettings } from "./settings";

export type EditAction = "grammar" | "tighten" | "rephrase";

export const ACTION_LABEL: Record<EditAction, string> = {
  grammar: "Fix grammar",
  tighten: "Tighten",
  rephrase: "Rephrase",
};

const INSTRUCTIONS: Record<EditAction, string> = {
  grammar:
    "Correct spelling, grammar, and punctuation. Keep the author's wording and voice — change as little as you can.",
  tighten:
    "Make this more concise: remove redundancy and filler while preserving the meaning and the author's voice.",
  rephrase:
    "Rephrase this so it reads more smoothly and clearly, preserving the meaning and the author's voice.",
};

const SYSTEM =
  "You are a precise copy editor helping a book author. Return ONLY the revised text — no explanations, notes, quotation marks, or preamble. Respond in the same language as the input text.";

export async function suggestEdit(opts: {
  action: EditAction;
  text: string;
  signal?: AbortSignal;
  onToken: (t: string) => void;
}): Promise<void> {
  const model = getSettings().model;
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM },
    { role: "user", content: `${INSTRUCTIONS[opts.action]}\n\nText:\n${opts.text}` },
  ];
  await streamChat({
    model,
    messages,
    signal: opts.signal,
    onToken: opts.onToken,
  });
}
