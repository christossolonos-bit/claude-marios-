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
import { chat, ping, type AssistantMessage } from "@/lib/ollama";
import { TOOLS, executeTool } from "@/lib/assistantTools";
import { getSettings } from "@/lib/settings";
import { listTasks } from "@/lib/tasks";
import { listMemories, memoryContext } from "@/lib/coachMemory";
import { todayISO, formatDateLabel, formatTimeLabel } from "@/lib/date";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Msg {
  role: "user" | "assistant";
  content: string;
  actions?: string[];
}

const KEY = "authorhub.tabchat.schedule.v1";
const MAX_STORED = 40;

function load(): Msg[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Msg[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(msgs: Msg[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(msgs.slice(-MAX_STORED)));
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

// Schedule-scoped system prompt: this assistant DOES act (task tools), and it
// knows which day is selected in the calendar so bare "add X at 3pm" lands there.
async function buildSystem(selectedDate: string): Promise<string> {
  const s = getSettings();
  const [tasks, memories] = await Promise.all([listTasks(), listMemories()]);
  const today = todayISO();
  const now = new Date();
  const dateLine = `Today is ${now.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })} (${today}).`;

  const pad = (n: number) => String(n).padStart(2, "0");
  const ref: string[] = [];
  for (let i = 0; i < 8; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    const iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const wd = d.toLocaleDateString(undefined, { weekday: "long" });
    const rel = i === 0 ? " (today)" : i === 1 ? " (tomorrow)" : "";
    ref.push(`${wd} = ${iso}${rel}`);
  }
  const dateRefLine = `Date reference for resolving days:\n${ref.join("\n")}`;

  const selLine = `In the calendar he currently has ${formatDateLabel(
    selectedDate,
  )} (${selectedDate}) selected. If he asks to add or schedule something WITHOUT naming a day, use ${selectedDate} as the date. If he names a day, resolve it to an absolute YYYY-MM-DD.`;

  const roleLine =
    "You are his schedule assistant. Use your tools to add, reschedule, rename, complete, or remove tasks and reminders, and to remember durable facts about him. Call a tool whenever he asks to add, schedule, change, complete, remove, or note something. After acting, confirm briefly and naturally — keep replies short and friendly, like a text message. When he is only asking a question, just answer; don't call a tool.";

  const open = tasks.filter((t) => !t.done);
  const lines: string[] = [];
  const fmt = (t: (typeof tasks)[number]) =>
    `- ${t.time ? formatTimeLabel(t.time) + " " : ""}${t.title}${
      t.date ? ` (${t.date})` : " (no date)"
    }`;
  for (const t of open.slice(0, 20)) lines.push(fmt(t));

  return [
    s.persona,
    dateLine,
    dateRefLine,
    selLine,
    roleLine,
    memoryContext(memories),
    lines.length ? `His current open tasks:\n${lines.join("\n")}` : "He has no open tasks right now.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export interface ScheduleAssistantProps {
  /** Day currently selected in the calendar (YYYY-MM-DD). */
  selectedDate: string;
  /** Called after a tool changes data so the calendar/list can refresh. */
  onChanged: () => void;
}

/**
 * Floating messenger-style chat for the Schedule tab. Unlike the talk-only
 * TabAssistant, this one keeps the task tools — it can add, reschedule, and
 * complete tasks on the calendar and remember facts.
 */
export default function ScheduleAssistant({
  selectedDate,
  onChanged,
}: ScheduleAssistantProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>(() => load());
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

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
    const priorTurns = prior.map((m) => ({ role: m.role, content: m.content }));
    setMessages([...prior, { role: "user", content: text }, { role: "assistant", content: "" }]);
    setBusy(true);

    const actions: string[] = [];
    const generated: string[] = [];
    try {
      const system = await buildSystem(selectedDate);
      const convo: unknown[] = [
        { role: "system", content: system },
        ...priorTurns,
        { role: "user", content: text },
      ];
      const msg: AssistantMessage = await chat({
        model: getSettings().model,
        messages: convo,
        tools: TOOLS,
      });

      if (msg.tool_calls && msg.tool_calls.length) {
        for (const tc of msg.tool_calls) {
          const raw = tc.function.arguments;
          const parsed = typeof raw === "string" ? safeParse(raw) : (raw ?? {});
          const result = await executeTool(tc.function.name, parsed);
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
        save(copy);
        return copy;
      });

      if (actions.length) onChanged();
    } catch (e) {
      setError((e as Error).message || "Something went wrong.");
      setMessages((m) => m.slice(0, -1));
    } finally {
      setBusy(false);
    }
  }

  function clear() {
    setMessages([]);
    setError(null);
    save([]);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Schedule assistant"
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
            Schedule assistant
            <div className="text-[11px] font-normal opacity-80">
              Ask me to add or move tasks
            </div>
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
            <p className="mx-auto max-w-[15rem]">
              Try “add a call with the publisher at 3pm”, “move the launch prep to
              Friday”, or “what's on for today?”
            </p>
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
            placeholder="Message…"
            className="max-h-28 min-h-[38px] flex-1 resize-none rounded-full border border-border bg-background px-4 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button
            type="submit"
            size="icon"
            className="size-9 shrink-0 rounded-full"
            disabled={!input.trim() || busy}
          >
            {busy ? <Square className="size-4 animate-pulse" /> : <Send className="size-4" />}
          </Button>
        </form>
      </div>
    </div>
  );
}
