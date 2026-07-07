// Minimal Ollama client. Talks directly to the local Ollama HTTP API.
//
// Works from the browser preview and the Tauri webview because Ollama allows
// local origins. If the packaged app can't connect, set the OLLAMA_ORIGINS env
// var to include the app origin (or "*" for local use).

const BASE = "http://localhost:11434";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OllamaTag {
  name: string;
}

export async function ping(): Promise<boolean> {
  try {
    const r = await fetch(`${BASE}/api/tags`);
    return r.ok;
  } catch {
    return false;
  }
}

export async function getModels(): Promise<string[]> {
  const r = await fetch(`${BASE}/api/tags`);
  if (!r.ok) throw new Error(`Ollama responded ${r.status}`);
  const j = (await r.json()) as { models?: OllamaTag[] };
  return (j.models ?? []).map((m) => m.name);
}

export async function streamChat(opts: {
  model: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
  onToken: (token: string) => void;
}): Promise<void> {
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
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      try {
        const chunk = JSON.parse(line) as { message?: { content?: string } };
        if (chunk.message?.content) opts.onToken(chunk.message.content);
      } catch {
        // ignore partial/non-JSON lines
      }
    }
  }
}
