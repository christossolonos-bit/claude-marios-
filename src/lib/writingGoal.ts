// Writing goal & streak tracking. Counts words *added* per day across documents
// (deletions don't subtract) and tracks a streak of consecutive days that hit
// the daily goal. Local-first, same storage pattern as the rest of the app.

import { todayISO } from "./date";

export interface WritingStats {
  goal: number;
  today: number; // words written today
  streak: number; // consecutive days (through today or yesterday) hitting goal
}

interface Store {
  goal: number;
  days: Record<string, number>; // ISO date -> words written that day
  docWords: Record<string, number>; // docId -> last counted word total (for deltas)
}

const KEY = "authorhub.writingstats.v1";
const DEFAULT_GOAL = 300;

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<Store>;
      return {
        goal: s.goal ?? DEFAULT_GOAL,
        days: s.days ?? {},
        docWords: s.docWords ?? {},
      };
    }
  } catch {
    // fall through
  }
  return { goal: DEFAULT_GOAL, days: {}, docWords: {} };
}

function write(s: Store): void {
  localStorage.setItem(KEY, JSON.stringify(s));
}

function isoToDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function dateToISO(dt: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

function computeStreak(s: Store): number {
  const today = todayISO();
  let streak = 0;
  if ((s.days[today] ?? 0) >= s.goal) streak++;
  const cur = isoToDate(today);
  cur.setDate(cur.getDate() - 1);
  while ((s.days[dateToISO(cur)] ?? 0) >= s.goal) {
    streak++;
    cur.setDate(cur.getDate() - 1);
  }
  return streak;
}

function summarize(s: Store): WritingStats {
  return {
    goal: s.goal,
    today: s.days[todayISO()] ?? 0,
    streak: computeStreak(s),
  };
}

export function getStats(): WritingStats {
  return summarize(read());
}

export function setGoal(goal: number): WritingStats {
  const s = read();
  s.goal = Math.max(1, Math.round(goal) || DEFAULT_GOAL);
  write(s);
  return summarize(s);
}

/**
 * Record a document's current word count. The first time a doc is seen it just
 * sets the baseline (no credit); afterward, any increase is added to today's
 * total. Returns the updated stats.
 */
export function recordWords(docId: string, currentWords: number): WritingStats {
  const s = read();
  const prev = s.docWords[docId];
  if (prev === undefined) {
    s.docWords[docId] = currentWords;
    write(s);
    return summarize(s);
  }
  const delta = currentWords - prev;
  if (delta > 0) {
    const t = todayISO();
    s.days[t] = (s.days[t] ?? 0) + delta;
  }
  s.docWords[docId] = currentWords;
  write(s);
  return summarize(s);
}
