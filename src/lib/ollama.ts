// Minimal Ollama client.
//
// Browser (dev preview): window.fetch against localhost:11434.
// Packaged Tauri app: Rust commands (server-side request, bypasses CORS/proxy).

import { invoke } from "@tauri-apps/api/core";

const BASE = "http://localhost:11434";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ToolCall {
  id?: string;
  function: { name: string; arguments: Record<string, unknown> | string };
}

export interface AssistantMessage {
  role: string;
  content: string;
  tool_calls?: ToolCall[];
}

interface OllamaTag {
  name: string;
}

function inTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    (window as unknown as { __TAURI_INTERNALS__?: unknown })
      .__TAURI_INTERNALS__ !== undefined
  );
}

// POST a full /api/chat body; returns the parsed JSON response.
async function rawChat(body: Record<string, unknown>): Promise<{
  message?: AssistantMessage;
}> {
  if (inTauri()) {
    return invoke("ollama_chat", { body });
  }
  const r = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const detail = await r.text().catch(() => "");
    throw new Error(`Ollama responded ${r.status}${detail ? `: ${detail}` : ""}`);
  }
  return r.json();
}

export async function ping(): Promise<boolean> {
  if (inTauri()) {
    try {
      await invoke<string[]>("ollama_models");
      return true;
    } catch {
      return false;
    }
  }
  try {
    const r = await fetch(`${BASE}/api/tags`);
    return r.ok;
  } catch {
    return false;
  }
}

export async function getModels(): Promise<string[]> {
  if (inTauri()) {
    return invoke<string[]>("ollama_models");
  }
  const r = await fetch(`${BASE}/api/tags`);
  if (!r.ok) throw new Error(`Ollama responded ${r.status}`);
  const j = (await r.json()) as { models?: OllamaTag[] };
  return (j.models ?? []).map((m) => m.name);
}

// Tool-capable, non-streaming chat. Returns the assistant message, which may
// contain tool_calls for the caller to execute.
export async function chat(opts: {
  model: string;
  messages: unknown[];
  tools?: unknown[];
}): Promise<AssistantMessage> {
  const resp = await rawChat({
    model: opts.model,
    messages: opts.messages,
    tools: opts.tools,
    stream: false,
    think: false,
  });
  return resp.message ?? { role: "assistant", content: "" };
}

function handleLine(line: string, onToken: (t: string) => void): void {
  const trimmed = line.trim();
  if (!trimmed) return;
  try {
    const chunk = JSON.parse(trimmed) as { message?: { content?: string } };
    if (chunk.message?.content) onToken(chunk.message.content);
  } catch {
    // ignore partial/non-JSON lines
  }
}

// Plain streaming chat (no tools). Browser streams token-by-token; desktop
// returns the reply in one shot via the Rust command.
export async function streamChat(opts: {
  model: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
  onToken: (token: string) => void;
}): Promise<void> {
  if (inTauri()) {
    const resp = await rawChat({
      model: opts.model,
      messages: opts.messages,
      stream: false,
      think: false,
    });
    const content = resp.message?.content ?? "";
    if (content) opts.onToken(content);
    return;
  }

  const r = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      stream: true,
      think: false,
    }),
    signal: opts.signal,
  });

  if (!r.ok || !r.body) {
    const detail = await r.text().catch(() => "");
    throw new Error(`Ollama responded ${r.status}${detail ? `: ${detail}` : ""}`);
  }

  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      handleLine(buffer.slice(0, newline), opts.onToken);
      buffer = buffer.slice(newline + 1);
    }
  }
  if (buffer) handleLine(buffer, opts.onToken);
}
