import { useEffect, useRef, useState } from "react";
import {
  MessageCircle,
  X,
  Send,
  Square,
  Check,
  Bot,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  chat,
  streamChat,
  ping,
  type AssistantMessage,
  type ChatMessage,
} from "@/lib/ollama";
import { getSettings } from "@/lib/settings";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Msg {
  role: "user" | "assistant";
  content: string;
  actions?: string[];
}

const PREFIX = "authorhub.tabchat.";
const MAX_STORED = 40;

function load(key: string): Msg[] {
  try {
    const raw = localStorage.getItem(PREFIX + key + ".v1");
    const parsed = raw ? (JSON.parse(raw) as Msg[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(key: string, msgs: Msg[]): void {
  try {
    localStorage.setItem(PREFIX + key + ".v1", JSON.stringify(msgs.slice(-MAX_STORED)));
  } catch {
    // ignore
  }
}

function safeParse(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export interface FloatingAssistantProps {
  title: string;
  /** One line under the title in the header. */
  subtitle: string;
  /** Hint shown on an empty thread (falls back to subtitle). */
  emptyHint?: string;
  /** Persistence key suffix; changing it swaps the stored thread. */
  storageKey: string;
  /** Builds the system prompt fresh on each send. */
  buildSystem: () => string | Promise<string>;
  placeholder?: string;
  /** Tooltip on the bubble button (falls back to title). */
  bubbleTitle?: string;
  /**
   * Tool mode: when tools + executeTool are supplied, the assistant can act —
   * it runs a one-shot tool loop and shows green action chips. Otherwise it's
   * talk-only and streams its reply.
   */
  tools?: unknown[];
  executeTool?: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ summary: string; content?: string }>;
  /** Called after a tool changes data (tool mode only). */
  onAction?: () => void;
}

/**
 * A floating, instant-messenger-style chat that docks as a bubble in the
 * bottom-right corner. Shared across tabs: talk-only by default, or
 * tool-capable when tools/executeTool are provided.
 */
export default function FloatingAssistant({
  title,
  subtitle,
  emptyHint,
  storageKey,
  buildSystem,
  placeholder = "Message…",
  bubbleTitle,
  tools,
  executeTool,
  onAction,
}: FloatingAssistantProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>(() => load(storageKey));
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const toolMode = !!(tools && executeTool);

  // Swap the stored thread when the target changes (e.g. a different document).
  useEffect(() => {
    setMessages(load(storageKey));
    setError(null);
  }, [storageKey]);

  useEffect(() => {
    if (open && online === null) ping().then(setOnline);
  }, [open, online]);

  useEffect(() => {
    if (open) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, open]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setError(null);
    setInput("");

    const prior = messages;
    const priorTurns: ChatMessage[] = prior.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    setMessages([...prior, { role: "user", content: text }, { role: "assistant", content: "" }]);
    setBusy(true);

    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const system = await buildSystem();
      const convo: ChatMessage[] = [
        { role: "system", content: system },
        ...priorTurns,
        { role: "user", content: text },
      ];

      if (toolMode) {
        const actions: string[] = [];
        const generated: string[] = [];
        const msg: AssistantMessage = await chat({
          model: getSettings().model,
          messages: convo,
          tools,
        });
        if (msg.tool_calls && msg.tool_calls.length) {
          for (const tc of msg.tool_calls) {
            const raw = tc.function.arguments;
            const parsed = typeof raw === "string" ? safeParse(raw) : (raw ?? {});
            const result = await executeTool!(tc.function.name, parsed);
            if (result.summary) actions.push(result.summary);
            if (result.content) generated.push(result.content);
          }
        }
        let finalContent = msg.content ?? "";
        if (generated.length)
          finalContent = [finalContent, ...generated].filter(Boolean).join("\n\n");
        if (!finalContent && actions.length) finalContent = "Done.";
        setMessages((m) => {
          const copy = m.slice();
          copy[copy.length - 1] = {
            role: "assistant",
            content: finalContent,
            actions: actions.length ? actions : undefined,
          };
          save(storageKey, copy);
          return copy;
        });
        if (actions.length) onAction?.();
      } else {
        let acc = "";
        await streamChat({
          model: getSettings().model,
          messages: convo,
          signal: ac.signal,
          onToken: (t) => {
            acc += t;
            setMessages((m) => {
              const copy = m.slice();
              copy[copy.length - 1] = { role: "assistant", content: acc.trimStart() };
              return copy;
            });
          },
        });
        setMessages((m) => {
          const copy = m.slice();
          copy[copy.length - 1] = { role: "assistant", content: acc.trim() };
          save(storageKey, copy);
          return copy;
        });
      }
    } catch (e) {
      if (ac.signal.aborted) {
        setMessages((m) => {
          save(storageKey, m);
          return m;
        });
      } else {
        setError((e as Error).message || "Something went wrong.");
        setMessages((m) => m.slice(0, -1));
      }
    } finally {
      setBusy(false);
    }
  }

  function stop() {
    abortRef.current?.abort();
    setBusy(false);
  }

  function clear() {
    stop();
    setMessages([]);
    setError(null);
    save(storageKey, []);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title={bubbleTitle ?? title}
        className="fixed bottom-6 right-6 z-40 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105"
      >
        <MessageCircle className="size-6" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-40 flex h-[520px] max-h-[80vh] w-[380px] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
      <div className="flex items-center justify-between border-b border-border bg-primary px-4 py-3 text-primary-foreground">
        <div className="flex items-center gap-2">
          <Bot className="size-5" />
          <div className="text-sm font-semibold leading-tight">
            {title}
            <div className="text-[11px] font-normal opacity-80">{subtitle}</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button
              onClick={clear}
              title="Clear chat"
              className="rounded p-1 opacity-80 hover:bg-primary-foreground/15 hover:opacity-100"
            >
              <RefreshCw className="size-4" />
            </button>
          )}
          <button
            onClick={() => setOpen(false)}
            title="Close"
            className="rounded p-1 opacity-80 hover:bg-primary-foreground/15 hover:opacity-100"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-muted/20 px-3 py-4">
        {messages.length === 0 && (
          <div className="mt-6 text-center text-xs text-muted-foreground">
            <MessageCircle className="mx-auto mb-2 size-6 text-muted-foreground/50" />
            <p className="mx-auto max-w-[15rem]">{emptyHint ?? subtitle}</p>
          </div>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            className={cn("flex flex-col", m.role === "user" ? "items-end" : "items-start")}
          >
            {m.actions && m.actions.length > 0 && (
              <div className="mb-1 flex max-w-[85%] flex-col gap-1">
                {m.actions.map((a, j) => (
                  <div
                    key={j}
                    className="flex items-center gap-1.5 rounded-md border border-green-200 bg-green-50 px-2 py-1 text-[11px] text-green-700"
                  >
                    <Check className="size-3 shrink-0" />
                    {a}
                  </div>
                ))}
              </div>
            )}
            {(m.content || m.role === "user") && (
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed",
                  m.role === "user"
                    ? "whitespace-pre-wrap bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground",
                )}
              >
                {m.role === "assistant" ? (
                  <div className="md">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                  </div>
                ) : (
                  m.content
                )}
              </div>
            )}
            {m.role === "assistant" &&
              !m.content &&
              !m.actions &&
              busy &&
              i === messages.length - 1 && (
                <div className="rounded-2xl bg-secondary px-3 py-2 text-sm text-muted-foreground">
                  …
                </div>
              )}
          </div>
        ))}

        {error && (
          <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <AlertCircle className="size-4 shrink-0" />
            {error}
          </div>
        )}
      </div>

      <div className="border-t border-border p-2.5">
        {online === false && (
          <p className="mb-1.5 text-center text-[11px] text-muted-foreground">
            Start Ollama and pull your model, then try again.
          </p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="flex items-end gap-2"
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
            placeholder={placeholder}
            className="max-h-28 min-h-[38px] flex-1 resize-none rounded-full border border-border bg-background px-4 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {busy && !toolMode ? (
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="size-9 shrink-0 rounded-full"
              onClick={stop}
              title="Stop"
            >
              <Square className="size-4" />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon"
              className="size-9 shrink-0 rounded-full"
              disabled={!input.trim() || busy}
            >
              {busy ? <Square className="size-4 animate-pulse" /> : <Send className="size-4" />}
            </Button>
          )}
        </form>
      </div>
    </div>
  );
}
