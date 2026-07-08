// Minimal Ollama client.
//
// In the browser (dev preview) it uses window.fetch against localhost:11434,
// which works because Ollama allows the localhost origin. In the packaged Tauri
// app the browser origin (tauri.localhost) is blocked by Ollama's CORS and the
// system proxy can interfere, so we call Rust commands instead — the request is
// made server-side from Rust, so there's nothing to configure.

import { invoke } from "@tauri-apps/api/core";

const BASE = "http://localhost:11434";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
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

export async function streamChat(opts: {
  model: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
  onToken: (token: string) => void;
}): Promise<void> {
  // Desktop app: one Rust round-trip that returns the full reply.
  if (inTauri()) {
    const content = await invoke<string>("ollama_chat", {
      model: opts.model,
      messages: opts.messages,
    });
    if (content) opts.onToken(content);
    return;
  }

  // Browser: stream tokens directly from Ollama.
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
