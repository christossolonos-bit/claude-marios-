import { useEffect, useRef, useState } from "react";
import {
  Bot,
  Send,
  Square,
  RefreshCw,
  AlertCircle,
  CircleDot,
  Volume2,
  VolumeX,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { type ChatMessage, streamChat, ping } from "@/lib/ollama";
import { getSettings } from "@/lib/settings";
import { listTasks } from "@/lib/tasks";
import { listProjects } from "@/lib/projects";
import { todayISO, formatTimeLabel } from "@/lib/date";
import { speak, stopSpeaking, ttsSupported } from "@/lib/tts";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

async function buildContext(): Promise<string> {
  const s = getSettings();
  if (!s.useContext) return "";
  const [tasks, projects] = await Promise.all([listTasks(), listProjects()]);
  const today = todayISO();
  const todays = tasks.filter((t) => t.date === today && !t.done);
  const active = projects.filter((p) => p.status === "active");

  const lines: string[] = [];
  if (todays.length) {
    lines.push("Today's tasks:");
    for (const t of todays) {
      lines.push(`- ${t.time ? formatTimeLabel(t.time) + " " : ""}${t.title}`);
    }
  }
  if (active.length) {
    lines.push(`Active projects: ${active.map((p) => p.name).join(", ")}`);
  }
  return lines.join("\n");
}

export default function Assistant() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [online, setOnline] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [voiceOn, setVoiceOn] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const model = getSettings().model;

  useEffect(() => {
    ping().then(setOnline);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;
    setError(null);

    const s = getSettings();
    const ctx = await buildContext();
    const system = ctx
      ? `${s.persona}\n\nContext about the user's current work:\n${ctx}`
      : s.persona;

    const history: ChatMessage[] = [
      ...messages,
      { role: "user", content: text },
    ];
    setMessages([...history, { role: "assistant", content: "" }]);
    setInput("");
    setStreaming(true);

    const willSpeak = voiceOn;
    let acc = "";
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      await streamChat({
        model: s.model,
        messages: [{ role: "system", content: system }, ...history],
        signal: ac.signal,
        onToken: (tok) => {
          acc += tok;
          setMessages((m) => {
            const copy = m.slice();
            const last = copy[copy.length - 1];
            copy[copy.length - 1] = { ...last, content: last.content + tok };
            return copy;
          });
        },
      });
      if (willSpeak && acc.trim()) speak(acc);
    } catch (e) {
      const err = e as Error;
      if (err.name !== "AbortError") setError(err.message || String(e));
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
    stopSpeaking();
  }

  function newChat() {
    stop();
    setMessages([]);
    setError(null);
  }

  function toggleVoice() {
    setVoiceOn((v) => {
      if (v) stopSpeaking();
      return !v;
    });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-8 py-4">
        <div className="flex items-center gap-3">
          <Bot className="size-6 text-primary" />
          <div>
            <h1 className="font-semibold tracking-tight">Assistant</h1>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CircleDot
                className={cn(
                  "size-3",
                  online
                    ? "text-green-500"
                    : online === false
                      ? "text-red-500"
                      : "text-muted-foreground",
                )}
              />
              {online === null
                ? "Checking Ollama…"
                : online
                  ? `Connected · ${model}`
                  : "Ollama offline"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {ttsSupported() && (
            <Button
              variant={voiceOn ? "default" : "outline"}
              size="sm"
              onClick={toggleVoice}
              title={voiceOn ? "Voice replies on" : "Voice replies off"}
            >
              {voiceOn ? (
                <Volume2 className="size-4" />
              ) : (
                <VolumeX className="size-4" />
              )}
              Voice
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={newChat}>
            <RefreshCw className="size-4" />
            New chat
          </Button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-8 py-6">
        {messages.length === 0 && (
          <div className="mx-auto mt-10 max-w-md text-center text-sm text-muted-foreground">
            <Bot className="mx-auto mb-3 size-8 text-muted-foreground/50" />
            Your local life-coach assistant. Ask it to brainstorm a seminar, plan
            your day, or draft ideas for the book — all running privately on your
            machine.
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={cn(
              "flex",
              m.role === "user" ? "justify-end" : "justify-start",
            )}
          >
            <div
              className={cn(
                "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                m.role === "user"
                  ? "whitespace-pre-wrap bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground",
              )}
            >
              {m.role === "assistant" ? (
                m.content ? (
                  <div className="md">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {m.content}
                    </ReactMarkdown>
                  </div>
                ) : streaming && i === messages.length - 1 ? (
                  "…"
                ) : (
                  ""
                )
              ) : (
                m.content
              )}
            </div>
          </div>
        ))}
        {error && (
          <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertCircle className="size-4 shrink-0" />
            {error}
          </div>
        )}
      </div>

      <div className="border-t border-border p-4">
        {online === false && (
          <p className="mb-2 text-center text-xs text-muted-foreground">
            Start Ollama and make sure your model is pulled, then try again.
          </p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="mx-auto flex max-w-3xl items-end gap-2"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder="Message your coach…"
            className="max-h-40 min-h-[40px] flex-1 resize-none rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {streaming ? (
            <Button type="button" variant="outline" onClick={stop}>
              <Square className="size-4" />
              Stop
            </Button>
          ) : (
            <Button type="submit" disabled={!input.trim()}>
              <Send className="size-4" />
            </Button>
          )}
        </form>
      </div>
    </div>
  );
}
