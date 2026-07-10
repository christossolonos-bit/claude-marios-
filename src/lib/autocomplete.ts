// Inline autocomplete ("Smart Compose") — predicts the next few words as the
// author writes, shown as grey ghost text he can accept with Tab. Fully local.

import { streamChat } from "@/lib/ollama";
import { getSettings } from "@/lib/settings";

const SYSTEM = `You are an inline writing autocomplete, like Gmail Smart Compose. Given the text the author has written so far, predict a SHORT, natural continuation — the next few words (usually 3-10 words, at most one clause). Match his voice, style, and language exactly. Rules: output ONLY the continuation text that comes immediately AFTER the input; never repeat any of his existing words; no quotes, labels, or explanations; if the last sentence is finished, you may begin the next one; if no natural continuation is obvious, output nothing.`;

/**
 * Predict the continuation of `context` (the recent text up to the caret).
 * Returns just the suggested next words, trimmed to a single line.
 */
export async function predictContinuation(
  context: string,
  signal?: AbortSignal,
): Promise<string> {
  let acc = "";
  await streamChat({
    model: getSettings().model,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: context },
    ],
    signal,
    onToken: (t) => {
      acc += t;
    },
  });
  // Keep a single-line, quote-free continuation.
  return acc
    .replace(/^["'“”\s]+/, "")
    .split("\n")[0]
    .replace(/["'“”]+$/, "")
    .trimEnd();
}
