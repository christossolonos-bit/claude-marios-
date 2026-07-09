// Writing workspace documents — chapters, posts, drafts. Local-first, same
// localStorage + async pattern as the rest of the app, ready to move to the
// Tauri SQLite plugin later without touching callers. AI assist (corrections,
// generation, translation) is layered on top of this in later increments.

export interface Doc {
  id: string;
  title: string;
  body: string;
  projectId: string | null; // optional link to a Project
  createdAt: number;
  updatedAt: number;
}

export interface DocSummary {
  id: string;
  title: string;
  updatedAt: number;
  wordCount: number;
  preview: string;
}

const KEY = "authorhub.documents.v1";

export function countWords(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

function read(): Doc[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Doc[]) : [];
  } catch {
    return [];
  }
}

function write(docs: Doc[]): void {
  localStorage.setItem(KEY, JSON.stringify(docs));
}

export async function listDocuments(): Promise<DocSummary[]> {
  return read()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((d) => ({
      id: d.id,
      title: d.title.trim() || "Untitled",
      updatedAt: d.updatedAt,
      wordCount: countWords(d.body),
      preview: d.body.replace(/\s+/g, " ").trim().slice(0, 100),
    }));
}

export async function getDocument(id: string): Promise<Doc | null> {
  return read().find((d) => d.id === id) ?? null;
}

export async function createDocument(title = ""): Promise<Doc> {
  const now = Date.now();
  const doc: Doc = {
    id: crypto.randomUUID(),
    title: title.trim(),
    body: "",
    projectId: null,
    createdAt: now,
    updatedAt: now,
  };
  const docs = read();
  docs.push(doc);
  write(docs);
  return doc;
}

export async function updateDocument(
  id: string,
  patch: Partial<Pick<Doc, "title" | "body" | "projectId">>,
): Promise<void> {
  write(
    read().map((d) =>
      d.id === id ? { ...d, ...patch, updatedAt: Date.now() } : d,
    ),
  );
}

export async function deleteDocument(id: string): Promise<void> {
  write(read().filter((d) => d.id !== id));
}
