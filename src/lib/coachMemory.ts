// "Coach Memory" — durable, private facts the assistant learns about the user
// over time. Stored locally in the app, injected into the assistant's context
// each chat so it gets more personal and proactive. Never leaves the machine.

export interface Memory {
  id: string;
  text: string;
  createdAt: number;
}

const KEY = "authorhub.coachmemory.v1";

function read(): Memory[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Memory[]) : [];
  } catch {
    return [];
  }
}

function write(items: Memory[]): void {
  localStorage.setItem(KEY, JSON.stringify(items));
}

export async function listMemories(): Promise<Memory[]> {
  return read().sort((a, b) => a.createdAt - b.createdAt);
}

export async function addMemory(text: string): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;
  const items = read();
  // Avoid storing near-duplicates.
  if (items.some((m) => m.text.toLowerCase() === trimmed.toLowerCase())) return;
  items.push({ id: crypto.randomUUID(), text: trimmed, createdAt: Date.now() });
  write(items);
}

export async function editMemory(id: string, text: string): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;
  write(read().map((m) => (m.id === id ? { ...m, text: trimmed } : m)));
}

export async function deleteMemory(id: string): Promise<void> {
  write(read().filter((m) => m.id !== id));
}

export function memoryContext(memories: Memory[]): string {
  if (!memories.length) return "";
  return `What you've learned about the user so far:\n${memories
    .map((m) => `- ${m.text}`)
    .join("\n")}`;
}
