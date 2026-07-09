// "Session memory" — past assistant conversations, persisted locally so the
// dad has a browsable history AND so the assistant can retrieve relevant bits
// from earlier chats when he's working on a project or idea. Never leaves the
// machine. Same localStorage + async-API shape as tasks/projects, so it can be
// swapped to the Tauri SQLite plugin later without touching callers.

export interface StoredMessage {
  role: "user" | "assistant";
  content: string;
  actions?: string[];
  ts: number;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: StoredMessage[];
}

// Lightweight row for the history list (no message bodies).
export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  preview: string;
}

const KEY = "authorhub.conversations.v1";

function read(): Conversation[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Conversation[]) : [];
  } catch {
    return [];
  }
}

function write(items: Conversation[]): void {
  localStorage.setItem(KEY, JSON.stringify(items));
}

/** Derive a short title from the first user message. */
export function deriveTitle(messages: StoredMessage[]): string {
  const first = messages.find((m) => m.role === "user")?.content.trim();
  if (!first) return "New chat";
  const oneLine = first.replace(/\s+/g, " ");
  return oneLine.length > 48 ? oneLine.slice(0, 48).trimEnd() + "…" : oneLine;
}

export async function listConversations(): Promise<ConversationSummary[]> {
  return read()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((c) => ({
      id: c.id,
      title: c.title,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      messageCount: c.messages.length,
      preview: c.messages[c.messages.length - 1]?.content.slice(0, 100) ?? "",
    }));
}

export async function getConversation(id: string): Promise<Conversation | null> {
  return read().find((c) => c.id === id) ?? null;
}

/** Full conversations with message bodies — used by the recall engine. */
export async function allConversations(): Promise<Conversation[]> {
  return read();
}

/**
 * Upsert a conversation. Pass an existing id to update, or omit it to create.
 * Returns the saved conversation (with its id) so the caller can keep editing it.
 * Empty conversations (no messages) are not persisted.
 */
export async function saveConversation(convo: {
  id?: string;
  title?: string;
  messages: StoredMessage[];
}): Promise<Conversation | null> {
  if (!convo.messages.length) return null;
  const items = read();
  const now = Date.now();
  const existing = convo.id ? items.find((c) => c.id === convo.id) : undefined;

  const saved: Conversation = {
    id: convo.id ?? crypto.randomUUID(),
    title: convo.title ?? existing?.title ?? deriveTitle(convo.messages),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    messages: convo.messages,
  };

  const next = existing
    ? items.map((c) => (c.id === saved.id ? saved : c))
    : [...items, saved];
  write(next);
  return saved;
}

export async function renameConversation(id: string, title: string): Promise<void> {
  const trimmed = title.trim();
  if (!trimmed) return;
  write(read().map((c) => (c.id === id ? { ...c, title: trimmed } : c)));
}

export async function deleteConversation(id: string): Promise<void> {
  write(read().filter((c) => c.id !== id));
}
