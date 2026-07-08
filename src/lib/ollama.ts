// Minimal Ollama client.
//
// In the browser (dev preview) it uses the normal window.fetch. In the packaged
// Tauri app it routes requests through the Tauri HTTP plugin, which performs the
// request from the Rust backend — this has no browser origin, so Ollama accepts
// it regardless of CORS/OLLAMA_ORIGINS and there's nothing to configure.

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

// Use the Tauri HTTP plugin (Rust-side request) when packaged, else window.fetch.
async function httpFetch(url: string, init?: RequestInit): Promise<Response> {
  if (inTauri()) {
    const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
    return tauriFetch(url, init);
  }
  return fetch(url, init);
}

export async function ping(): Promise<boolean> {
  try {
    const r = await httpFetch(`${BASE}/api/tags`);
    return r.ok;
  } catch {
    return false;
  }
}

export async function getModels(): Promise<string[]> {
  const r = await httpFetch(`${BASE}/api/tags`);
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
  const r = await httpFetch(`${BASE}/api/chat`, {
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

  if (!r.ok) {
    const detail = await r.text().catch(() => "");
    throw new Error(`Ollama responded ${r.status}${detail ? `: ${detail}` : ""}`);
  }

  // Stream token-by-token when the response body is a readable stream.
  // If it isn't (some environments buffer the whole body), fall back to
  // parsing the full NDJSON text at once — still correct, just not live.
  if (r.body) {
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
  } else {
    const text = await r.text();
    for (const line of text.split("\n")) handleLine(line, opts.onToken);
  }
}
