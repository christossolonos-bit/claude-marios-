// AI writing assist — local Ollama edits and generation on a selection (or the
// whole draft). Streams text back; the editor shows it as a suggestion the
// author accepts or discards. Language-agnostic: it replies in the text's own
// language (the book may be drafted in another language before translation).

import { streamChat, type ChatMessage } from "./ollama";
import { getSettings } from "./settings";

export type EditAction = "grammar" | "tighten" | "rephrase";

export const ACTION_LABEL: Record<EditAction, string> = {
  grammar: "Fix grammar",
  tighten: "Tighten",
  rephrase: "Rephrase",
};

export const TONES = ["Warmer", "More formal", "Simpler", "More vivid"] as const;
export type Tone = (typeof TONES)[number];

const INSTRUCTIONS: Record<EditAction, string> = {
  grammar:
    "Correct spelling, grammar, and punctuation. Keep the author's wording and voice — change as little as you can.",
  tighten:
    "Make this more concise: remove redundancy and filler while preserving the meaning and the author's voice.",
  rephrase:
    "Rephrase this so it reads more smoothly and clearly, preserving the meaning and the author's voice.",
};

const EDIT_SYSTEM =
  "You are a precise copy editor helping a book author. Return ONLY the revised text — no explanations, notes, quotation marks, or preamble. Respond in the same language as the input text.";

const WRITE_SYSTEM =
  "You are a writing partner for a book author. Write in the author's own voice and style, matching the language of their text. Return ONLY the requested prose — no explanations, notes, quotation marks, or preamble.";

interface StreamOpts {
  signal?: AbortSignal;
  onToken: (t: string) => void;
}

async function stream(
  system: string,
  user: string,
  opts: StreamOpts,
): Promise<void> {
  const messages: ChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
  await streamChat({
    model: getSettings().model,
    messages,
    signal: opts.signal,
    onToken: opts.onToken,
  });
}

// --- Corrections (increment 2) ---------------------------------------------

export function suggestEdit(
  opts: { action: EditAction; text: string } & StreamOpts,
): Promise<void> {
  return stream(
    EDIT_SYSTEM,
    `${INSTRUCTIONS[opts.action]}\n\nText:\n${opts.text}`,
    opts,
  );
}

// --- Generation (increment 3) ----------------------------------------------

function about(context?: string): string {
  return context ? `This writing is about ${context}.\n\n` : "";
}

export function suggestContinue(
  opts: { body: string; context?: string } & StreamOpts,
): Promise<void> {
  return stream(
    WRITE_SYSTEM,
    `${about(opts.context)}Continue this draft naturally from where it stops — about 2-4 sentences. Do not repeat what is already written.\n\n${opts.body}`,
    opts,
  );
}

export function suggestExpand(
  opts: { text: string; context?: string } & StreamOpts,
): Promise<void> {
  return stream(
    WRITE_SYSTEM,
    `${about(opts.context)}Expand this passage with more detail, texture, or an example, keeping the meaning and voice:\n\n${opts.text}`,
    opts,
  );
}

export function suggestTone(
  opts: { text: string; tone: Tone } & StreamOpts,
): Promise<void> {
  return stream(
    EDIT_SYSTEM,
    `Rewrite this to be ${opts.tone.toLowerCase()}, preserving the meaning:\n\n${opts.text}`,
    opts,
  );
}

export function suggestTitle(
  opts: { body: string; context?: string } & StreamOpts,
): Promise<void> {
  return stream(
    "You suggest one clear, evocative title for the author's piece. Return ONLY the title on a single line — no quotation marks, no 'Title:' prefix. Match the language of the text.",
    `${about(opts.context)}Suggest a title for this:\n\n${opts.body}`,
    opts,
  );
}

// --- Translation (increment 4) ---------------------------------------------

export const TRANSLATE_TARGETS = [
  "English",
  "Greek",
  "Spanish",
  "French",
  "German",
  "Italian",
] as const;
export type TranslateTarget = (typeof TRANSLATE_TARGETS)[number];

export function translate(
  opts: { text: string; target: string } & StreamOpts,
): Promise<void> {
  return stream(
    "You are a skilled literary translator. Translate the text faithfully into the target language, preserving meaning, tone, voice, and paragraph breaks. Return ONLY the translation — no notes, explanations, or preamble.",
    `Translate the following into ${opts.target}:\n\n${opts.text}`,
    opts,
  );
}
