// Daily briefing — the assistant as a personal secretary. When the app opens it
// greets the author by name, reads out today, and proposes the next actions to
// move his book forward. Generated locally by Ollama from a structured glance at
// his tasks and writing progress, with a factual fallback when offline. Cached
// per app session (sessionStorage) so it fires on launch, not every visit.

import { streamChat, type ChatMessage } from "./ollama";
import { getSettings } from "./settings";
import { listTasks } from "./tasks";
import { getStats } from "./writingGoal";
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

function salutation(name: string): string {
  const t = greetingTime();
  const s = t === "night" ? "Working late" : `Good ${t}`;
  return name ? `${s}, ${name}.` : `${s}.`;
}

interface Briefing {
  name: string;
  todayTasks: { title: string; time: string | null; priority: string }[];
  overdue: { title: string; date: string }[];
  writing: { today: number; goal: number; streak: number };
  memories: string[];
}

async function gather(): Promise<Briefing> {
  const s = getSettings();
  const [tasks, memories] = await Promise.all([listTasks(), listMemories()]);
  const today = todayISO();

  const todayTasks = tasks
    .filter((t) => t.date === today && !t.done)
    .sort((a, b) => (a.time ?? "99").localeCompare(b.time ?? "99"))
    .map((t) => ({ title: t.title, time: t.time, priority: t.priority }));

  const overdue = tasks
    .filter((t) => !t.done && t.date && t.date < today)
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""))
    .map((t) => ({ title: t.title, date: t.date as string }));

  const st = getStats();

  return {
    name: s.ownerName.trim(),
    todayTasks,
    overdue,
    writing: { today: st.today, goal: st.goal, streak: st.streak },
    memories: memories.slice(0, 3).map((m) => m.text),
  };
}

/** A useful, deterministic briefing built purely from the data (offline path). */
function fallbackBriefing(b: Briefing): string {
  const lines: string[] = [salutation(b.name)];

  if (b.todayTasks.length) {
    const items = b.todayTasks
      .slice(0, 4)
      .map((t) => (t.time ? `${formatTimeLabel(t.time)} ${t.title}` : t.title));
    lines.push(`**Today:** ${b.todayTasks.length} on the schedule — ${items.join("; ")}.`);
  } else {
    lines.push("**Today:** nothing scheduled yet.");
  }

  if (b.overdue.length)
    lines.push(`**Overdue:** ${b.overdue.slice(0, 3).map((t) => t.title).join("; ")}.`);

  if (b.writing.today >= b.writing.goal && b.writing.goal > 0) {
    lines.push(
      `**Writing:** ${b.writing.today} words today — goal met${
        b.writing.streak > 1 ? `, ${b.writing.streak}-day streak 🔥` : ""
      }.`,
    );
  } else {
    lines.push(`**Writing:** ${b.writing.today}/${b.writing.goal} words today.`);
  }

  return lines.join("\n\n");
}

const SYSTEM =
  "You are a sharp, warm personal assistant briefing an author as he opens his desktop writing app. Speak to him directly. In a few short lines: greet him (by name only if a name is given below), give a quick read on today, then propose the 2-3 most useful next actions to move his book forward. " +
  "CRITICAL: use ONLY the facts provided below. Never invent tasks, names, numbers, or details, and never assume a name. If there are no tasks and no writing progress, do not fabricate any — just greet him warmly in a line or two and encourage him to write or ask for help. " +
  "When there is real work, be specific — reference his actual tasks and writing progress, and put anything overdue or time-sensitive first. Encourage his writing. Use compact markdown: a short greeting line, then a tight bulleted list of next steps. Write each bullet as one short, self-contained action phrased as an imperative the way it would read on a to-do list (e.g. \"Draft the next chapter opening\") — no bold label prefixes like \"Priority:\" and no trailing explanation. Warm, concrete, and brief — no filler, no 'here is your briefing' preamble.";

function facts(b: Briefing): string {
  const L: string[] = [`Time of day: ${greetingTime()}.`];
  L.push(b.name ? `His name: ${b.name}.` : "You don't know his name.");
  L.push(
    b.todayTasks.length
      ? `Today's tasks: ${b.todayTasks
          .map(
            (t) =>
              `${t.title}${t.time ? ` at ${formatTimeLabel(t.time)}` : ""}${
                t.priority === "high" ? " (high priority)" : ""
              }`,
          )
          .join("; ")}.`
      : "No tasks scheduled today.",
  );
  if (b.overdue.length)
    L.push(`Overdue tasks: ${b.overdue.map((t) => t.title).join("; ")}.`);
  L.push(
    `Writing today: ${b.writing.today} of his ${b.writing.goal}-word daily goal${
      b.writing.streak > 0 ? `, current streak ${b.writing.streak} day(s)` : ""
    }.`,
  );
  if (b.memories.length) L.push(`Things you know about him: ${b.memories.join("; ")}.`);
  return L.join("\n");
}

/**
 * Generate the briefing via local Ollama, streaming tokens through onToken.
 * On any model error, resolves to a factual fallback built from the data.
 */
export async function generateBriefing(opts: {
  signal?: AbortSignal;
  onToken?: (t: string) => void;
} = {}): Promise<string> {
  const b = await gather();
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM },
    { role: "user", content: `Brief him now.\n${facts(b)}` },
  ];
  try {
    let acc = "";
    await streamChat({
      model: getSettings().model,
      messages,
      signal: opts.signal,
      onToken: (t) => {
        acc += t;
        opts.onToken?.(acc.trimStart());
      },
    });
    return acc.trim() || fallbackBriefing(b);
  } catch (e) {
    if (opts.signal?.aborted) throw e;
    const fb = fallbackBriefing(b);
    opts.onToken?.(fb);
    return fb;
  }
}

// --- Session cache ---------------------------------------------------------

const SESSION_KEY = "authorhub.briefing.v1";

export function cachedBriefing(): string | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const { date, text } = JSON.parse(raw) as { date: string; text: string };
    return date === todayISO() ? text : null;
  } catch {
    return null;
  }
}

export function cacheBriefing(text: string): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ date: todayISO(), text }));
  } catch {
    // ignore
  }
}

/** Strip light markdown so the spoken version reads cleanly. */
export function toSpoken(md: string): string {
  return md
    .replace(/[*_`#>]/g, "")
    .replace(/^\s*[-•]\s*/gm, "")
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, " ")
    .trim();
}
