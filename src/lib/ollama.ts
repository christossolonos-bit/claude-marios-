// Minimal Ollama client.
//
// Browser (dev preview): window.fetch against localhost:11434.
// Packaged Tauri app: Rust commands (server-side request, bypasses CORS/proxy).

import { invoke } from "@tauri-apps/api/core";
import { getSettings } from "@/lib/settings";

const BASE = "http://localhost:11434";
const OR_BASE = "https://openrouter.ai/api/v1";

// True when the app should talk to OpenRouter (cloud) instead of local Ollama.
// Requires both the provider setting and a key — otherwise we fall back to
// Ollama so a half-configured cloud setup doesn't silently break local use.
function useOpenRouter(): boolean {
  const s = getSettings();
  return s.provider === "openrouter" && !!s.openrouterApiKey.trim();
}

function orHeaders(): Record<string, string> {
  const s = getSettings();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${s.openrouterApiKey.trim()}`,
  };
  // OpenRouter uses these for its dashboard/rankings; harmless if origin is absent.
  if (typeof window !== "undefined" && window.location?.origin) {
    headers["HTTP-Referer"] = window.location.origin;
  }
  headers["X-Title"] = "AuthorHub";
  return headers;
}

// OpenRouter is OpenAI-compatible. Normalize its response into the same
// AssistantMessage shape the rest of the app already consumes (tool_calls with
// function.name + function.arguments — arguments arrives as a JSON string).
async function openRouterChat(opts: {
  messages: unknown[];
  tools?: unknown[];
}): Promise<AssistantMessage> {
  const s = getSettings();
  const r = await fetch(`${OR_BASE}/chat/completions`, {
    method: "POST",
    headers: orHeaders(),
    body: JSON.stringify({
      model: s.openrouterModel,
      messages: opts.messages,
      tools: opts.tools,
      stream: false,
    }),
  });
  if (!r.ok) {
    const detail = await r.text().catch(() => "");
    throw new Error(`OpenRouter responded ${r.status}${detail ? `: ${detail}` : ""}`);
  }
  const j = (await r.json()) as {
    choices?: { message?: AssistantMessage }[];
  };
  const m = j.choices?.[0]?.message;
  return {
    role: m?.role ?? "assistant",
    content: m?.content ?? "",
    tool_calls: m?.tool_calls,
  };
}

async function openRouterStream(opts: {
  messages: ChatMessage[];
  signal?: AbortSignal;
  onToken: (token: string) => void;
}): Promise<void> {
  const s = getSettings();
  const r = await fetch(`${OR_BASE}/chat/completions`, {
    method: "POST",
    headers: orHeaders(),
    body: JSON.stringify({
      model: s.openrouterModel,
      messages: opts.messages,
      stream: true,
    }),
    signal: opts.signal,
  });
  if (!r.ok || !r.body) {
    const detail = await r.text().catch(() => "");
    throw new Error(`OpenRouter responded ${r.status}${detail ? `: ${detail}` : ""}`);
  }

  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const emit = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return;
    const data = trimmed.slice(5).trim();
    if (!data || data === "[DONE]") return;
    try {
      const chunk = JSON.parse(data) as {
        choices?: { delta?: { content?: string } }[];
      };
      const token = chunk.choices?.[0]?.delta?.content;
      if (token) opts.onToken(token);
    } catch {
      // ignore keep-alive comments / partial frames
    }
  };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      emit(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
    }
  }
  if (buffer) emit(buffer);
}

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
  if (useOpenRouter()) return true; // key present; validated on first real call
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
  if (useOpenRouter()) {
    const m = getSettings().openrouterModel.trim();
    return m ? [m] : [];
  }
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
  if (useOpenRouter()) {
    return openRouterChat({ messages: opts.messages, tools: opts.tools });
  }
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
  if (useOpenRouter()) {
    return openRouterStream(opts);
  }
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
