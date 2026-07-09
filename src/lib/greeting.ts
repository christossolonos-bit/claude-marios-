// Welcome greeting — a warm, personalized line the assistant "says" when the
// app opens, in the spirit of a composed butler AI (think JARVIS). Generated
// locally by Ollama with time-of-day + a glance at today, with a crafted static
// fallback when the model is offline. Cached per app session (sessionStorage)
// so it fires on launch, not on every visit to the Dashboard.

import { streamChat, type ChatMessage } from "./ollama";
import { getSettings } from "./settings";
import { listTasks } from "./tasks";
import { listMemories } from "./coachMemory";
import { todayISO, formatTimeLabel } from "./date";

export function greetingTime(h = new Date().getHours()):
  | "morning"
  | "afternoon"
  | "evening"
  | "night" {
  if (h < 5) return "night";
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  if (h < 22) return "evening";
  return "night";
}

/** Crafted greeting used when Ollama can't be reached. */
export function fallbackGreeting(name: string): string {
  const t = greetingTime();
  const salut = t === "night" ? "Working late" : `Good ${t}`;
  return name ? `${salut}, ${name}. Welcome back.` : `${salut}. Welcome back.`;
}

const SESSION_KEY = "authorhub.greeting.v1";

export function cachedGreeting(): string | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const { date, text } = JSON.parse(raw) as { date: string; text: string };
    return date === todayISO() ? text : null;
  } catch {
    return null;
  }
}

export function cacheGreeting(text: string): void {
  try {
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ date: todayISO(), text }),
    );
  } catch {
    // ignore
  }
}

const SYSTEM =
  "You are the author's personal AI assistant greeting him as he opens his desktop app — a warm, composed, lightly witty butler-style AI in the spirit of JARVIS. Write ONE short greeting of 1-2 sentences, in the second person. Be warm and personal; a touch of dry wit is welcome, but never cheesy or over-eager. No emojis, no quotation marks, no preamble — return only the greeting itself.";

/**
 * Generate a personalized greeting via local Ollama. Streams tokens through
 * onToken if given. Throws if the model can't be reached (caller falls back).
 */
export async function generateGreeting(opts: {
  signal?: AbortSignal;
  onToken?: (t: string) => void;
} = {}): Promise<string> {
  const s = getSettings();
  const [tasks, memories] = await Promise.all([listTasks(), listMemories()]);
  const today = todayISO();
  const todays = tasks
    .filter((t) => t.date === today && !t.done)
    .sort((a, b) => (a.time ?? "99").localeCompare(b.time ?? "99"));
  const name = s.ownerName.trim();
  const next = todays[0];

  const ctx: string[] = [
    `Time of day: ${greetingTime()}.`,
    name
      ? `Address him as: ${name}.`
      : "You don't know his name — greet him warmly without one.",
    todays.length
      ? `He has ${todays.length} task${todays.length > 1 ? "s" : ""} on today's schedule${
          next
            ? `; the next is "${next.title}"${next.time ? ` at ${formatTimeLabel(next.time)}` : ""}`
            : ""
        }.`
      : "Nothing is scheduled today.",
  ];
  if (memories.length)
    ctx.push(
      `A couple of things you know about him: ${memories
        .slice(0, 2)
        .map((m) => m.text)
        .join("; ")}.`,
    );

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM },
    { role: "user", content: `Greet him now.\n${ctx.join("\n")}` },
  ];

  let acc = "";
  await streamChat({
    model: s.model,
    messages,
    signal: opts.signal,
    onToken: (t) => {
      acc += t;
      opts.onToken?.(acc.trimStart());
    },
  });
  return acc.trim();
}
