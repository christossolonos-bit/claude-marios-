import { useEffect, useRef, useState } from "react";
import { Bot, Send, Square, X, RefreshCw, AlertCircle } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { streamChat, type ChatMessage } from "@/lib/ollama";
import { getSettings } from "@/lib/settings";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

export interface TabAssistantProps {
  /** Header title, e.g. "Writing assistant". */
  title: string;
  /** Small line under the title. */
  subtitle?: string;
  /** Persistence key suffix — the thread is stored per tab under this. */
  storageKey: string;
  /**
   * Builds the tab-specific system prompt. Called fresh on every send so it can
   * capture the tab's current state (open document, deck, etc.).
   */
  buildSystem: () => string | Promise<string>;
  /** One-tap starter prompts shown on an empty thread. */
  starters?: string[];
  placeholder?: string;
  /** Ollama/provider reachability, if the host page already knows it. */
  online?: boolean | null;
  onClose?: () => void;
}

const PREFIX = "authorhub.tabchat.";
const MAX_STORED = 40;

function load(key: string): Msg[] {
  try {
    const raw = localStorage.getItem(PREFIX + key + ".v1");
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Msg[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(key: string, msgs: Msg[]): void {
  try {
    localStorage.setItem(
      PREFIX + key + ".v1",
      JSON.stringify(msgs.slice(-MAX_STORED)),
    );
  } catch {
    // storage full / unavailable — thread just won't persist
  }
}

/**
 * A talk-only chat panel that docks on the right of a tab. Each tab mounts it
 * with its own system prompt + starters, so the assistant is scoped to that
 * tab's task. No tool-calling — it discusses and advises, it doesn't act.
 */
export default function TabAssistant({
  title,
  subtitle,
  storageKey,
  buildSystem,
  starters,
  placeholder = "Ask about this…",
  online,
  onClose,
}: TabAssistantProps) {
  const [messages, setMessages] = useState<Msg[]>(() => load(storageKey));
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Reload the stored thread when the panel is pointed at a different tab/target.
  useEffect(() => {
    setMessages(load(storageKey));
    setError(null);
  }, [storageKey]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function send(text: string) {
    const body = text.trim();
    if (!body || busy) return;
    setError(null);
    setInput("");

    const prior = messages;
    const priorTurns: ChatMessage[] = prior.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    setMessages([...prior, { role: "user", content: body }, { role: "assistant", content: "" }]);
    setBusy(true);

    const ac = new AbortController();
    abortRef.current = ac;
    let acc = "";
    try {
      const system = await buildSystem();
      const convo: ChatMessage[] = [
        { role: "system", content: system },
        ...priorTurns,
        { role: "user", content: body },
      ];
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
        // Persist the settled thread.
        save(storageKey, m);
        return m;
      });
    } catch (e) {
      if (ac.signal.aborted) {
        setMessages((m) => {
          save(storageKey, m);
          return m;
        });
      } else {
        setError((e as Error).message || "Something went wrong.");
        setMessages((m) => m.slice(0, -1)); // drop the empty assistant bubble
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

  return (
    <aside className="flex h-full w-[360px] shrink-0 flex-col border-l border-border bg-muted/20">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Bot className="size-5 shrink-0 text-primary" />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{title}</div>
            {subtitle && (
              <div className="truncate text-xs text-muted-foreground">{subtitle}</div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clear} title="Clear this thread">
              <RefreshCw className="size-4" />
            </Button>
          )}
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose} title="Close">
              <X className="size-4" />
            </Button>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-4">
        {messages.length === 0 && (
          <div className="mt-4 text-center text-xs text-muted-foreground">
            <Bot className="mx-auto mb-2 size-6 text-muted-foreground/50" />
            <p className="mx-auto max-w-[15rem]">{subtitle ?? "Ask for help with this tab."}</p>
            {starters && starters.length > 0 && (
              <div className="mt-4 flex flex-col gap-1.5">
                {starters.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    disabled={busy}
                    className="rounded-md border border-border bg-background px-3 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-accent disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
          >
            {m.content || m.role === "user" ? (
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
            ) : (
              busy &&
              i === messages.length - 1 && (
                <div className="rounded-2xl bg-secondary px-3 py-2 text-sm text-muted-foreground">
                  …
                </div>
              )
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

      <div className="border-t border-border p-3">
        {online === false && (
          <p className="mb-2 text-center text-xs text-muted-foreground">
            Start Ollama and pull your model, then try again.
          </p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-end gap-2"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={1}
            placeholder={placeholder}
            className="max-h-32 min-h-[38px] flex-1 resize-none rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {busy ? (
            <Button type="button" variant="outline" onClick={stop} title="Stop">
              <Square className="size-4" />
            </Button>
          ) : (
            <Button type="submit" disabled={!input.trim()}>
              <Send className="size-4" />
            </Button>
          )}
        </form>
      </div>
    </aside>
  );
}
