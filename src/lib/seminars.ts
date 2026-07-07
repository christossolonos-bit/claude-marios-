// Seminar idea data layer — same localStorage-backed async pattern as the rest.

export type SeminarStatus = "idea" | "developing" | "ready" | "delivered";

export interface Seminar {
  id: string;
  title: string;
  notes: string; // raw thoughts
  outline: string; // markdown outline (AI-generated or manual)
  status: SeminarStatus;
  createdAt: number;
}

export const STATUS_ORDER: SeminarStatus[] = [
  "idea",
  "developing",
  "ready",
  "delivered",
];

export const statusMeta: Record<
  SeminarStatus,
  { label: string; pill: string }
> = {
  idea: { label: "Idea", pill: "bg-violet-100 text-violet-700" },
  developing: { label: "Developing", pill: "bg-amber-100 text-amber-700" },
  ready: { label: "Ready", pill: "bg-green-100 text-green-700" },
  delivered: { label: "Delivered", pill: "bg-zinc-100 text-zinc-600" },
};

const KEY = "authorhub.seminars.v1";

function read(): Seminar[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Seminar[]) : [];
  } catch {
    return [];
  }
}

function write(seminars: Seminar[]): void {
  localStorage.setItem(KEY, JSON.stringify(seminars));
}

export async function listSeminars(): Promise<Seminar[]> {
  return read();
}

export async function addSeminar(title: string): Promise<Seminar> {
  const seminar: Seminar = {
    id: crypto.randomUUID(),
    title: title.trim(),
    notes: "",
    outline: "",
    status: "idea",
    createdAt: Date.now(),
  };
  const seminars = read();
  seminars.push(seminar);
  write(seminars);
  return seminar;
}

export async function updateSeminar(
  id: string,
  patch: Partial<Seminar>,
): Promise<void> {
  write(read().map((s) => (s.id === id ? { ...s, ...patch } : s)));
}

export async function deleteSeminar(id: string): Promise<void> {
  write(read().filter((s) => s.id !== id));
}
