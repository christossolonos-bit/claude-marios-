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
  Check,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { type AssistantMessage, chat, ping } from "@/lib/ollama";
import { TOOLS, executeTool } from "@/lib/assistantTools";
import { getSettings } from "@/lib/settings";
import { listTasks } from "@/lib/tasks";
import { listProjects } from "@/lib/projects";
import { listMemories, memoryContext } from "@/lib/coachMemory";
import { todayISO, formatTimeLabel } from "@/lib/date";
import { speak, stopSpeaking, ttsSupported } from "@/lib/tts";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface UiMessage {
  role: "user" | "assistant";
  content: string;
  actions?: string[];
}

async function buildSystemPrompt(): Promise<string> {
  const s = getSettings();
  const [tasks, projects, memories] = await Promise.all([
    listTasks(),
    listProjects(),
    listMemories(),
  ]);
  const today = todayISO();
  const now = new Date();
  const dateLine = `Today is ${now.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })} (${today}).`;

  const pad = (n: number) => String(n).padStart(2, "0");
  const dateRef: string[] = [];
  for (let i = 0; i < 8; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    const iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const wd = d.toLocaleDateString(undefined, { weekday: "long" });
    const rel = i === 0 ? " (today)" : i === 1 ? " (tomorrow)" : "";
    dateRef.push(`${wd} = ${iso}${rel}`);
  }
  const dateRefLine = `Date reference for resolving days:\n${dateRef.join("\n")}`;

  const toolsLine =
    "You can manage the app for the user with tools: add tasks/reminders, add projects, add seminar ideas, complete or remove tasks, and remember durable facts about them. Call a tool whenever they ask to add, schedule, complete, remove, or note something. Resolve relative dates (like 'tomorrow') to absolute YYYY-MM-DD. After acting, confirm briefly and naturally.";

  const workLines: string[] = [];
  if (s.useContext) {
    const todays = tasks.filter((t) => t.date === today && !t.done);
    const active = projects.filter((p) => p.status === "active");
    if (todays.length) {
      workLines.push("Today's tasks:");
      for (const t of todays)
        workLines.push(
          `- ${t.time ? formatTimeLabel(t.time) + " " : ""}${t.title}`,
        );
    }
    if (active.length)
      workLines.push(`Active projects: ${active.map((p) => p.name).join(", ")}`);
  }

  return [
    s.persona,
    dateLine,
    dateRefLine,
    toolsLine,
    memoryContext(memories),
    workLines.length ? `The user's current work:\n${workLines.join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export default function Assistant() {
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [voiceOn, setVoiceOn] = useState(false);
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
    if (!text || busy) return;
    setError(null);

    const s = getSettings();
    const system = await buildSystemPrompt();
    const priorTurns = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    setMessages((m) => [
      ...m,
      { role: "user", content: text },
      { role: "assistant", content: "" },
    ]);
    setInput("");
    setBusy(true);

    const willSpeak = voiceOn;
    const convo: unknown[] = [
      { role: "system", content: system },
      ...priorTurns,
      { role: "user", content: text },
    ];
    const actions: string[] = [];
    let finalContent = "";

    try {
      // One request per message: the model replies once, we run any actions it
      // asked for, and confirm with chips. No follow-up round (avoids stacking
      // requests / hitting rate limits).
      const msg: AssistantMessage = await chat({
        model: s.model,
        messages: convo,
        tools: TOOLS,
      });

      if (msg.tool_calls && msg.tool_calls.length) {
        for (const tc of msg.tool_calls) {
          const rawArgs = tc.function.arguments;
          const parsed =
            typeof rawArgs === "string" ? safeParse(rawArgs) : (rawArgs ?? {});
          const result = await executeTool(tc.function.name, parsed);
          actions.push(result);
        }
      }

      finalContent = msg.content ?? "";
      if (!finalContent && actions.length) finalContent = "Done.";

      setMessages((m) => {
        const copy = m.slice();
        copy[copy.length - 1] = {
          role: "assistant",
          content: finalContent,
          actions: actions.length ? actions : undefined,
        };
        return copy;
      });
      if (willSpeak && finalContent) speak(finalContent);
    } catch (e) {
      const err = e as Error;
      setError(err.message || String(e));
      setMessages((m) => m.slice(0, -1)); // drop the empty assistant bubble
    } finally {
      setBusy(false);
    }
  }

  function newChat() {
    stopSpeaking();
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
            Your local life-coach assistant. Ask it to plan your day, brainstorm a
            seminar, or draft ideas — or just say{" "}
            <span className="italic">"remind me to call the publisher at 3pm"</span>{" "}
            and it'll add it for you.
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={cn(
              "flex flex-col",
              m.role === "user" ? "items-end" : "items-start",
            )}
          >
            {m.actions && m.actions.length > 0 && (
              <div className="mb-1.5 flex max-w-[80%] flex-col gap-1">
                {m.actions.map((a, j) => (
                  <div
                    key={j}
                    className="flex items-center gap-1.5 rounded-md border border-green-200 bg-green-50 px-2.5 py-1 text-xs text-green-700"
                  >
                    <Check className="size-3.5 shrink-0" />
                    {a}
                  </div>
                ))}
              </div>
            )}
            {(m.content || m.role === "user") && (
              <div
                className={cn(
                  "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                  m.role === "user"
                    ? "whitespace-pre-wrap bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground",
                )}
              >
                {m.role === "assistant" ? (
                  <div className="md">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {m.content}
                    </ReactMarkdown>
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
                <div className="rounded-2xl bg-secondary px-4 py-2.5 text-sm text-muted-foreground">
                  …
                </div>
              )}
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
          <Button type="submit" disabled={!input.trim() || busy}>
            {busy ? <Square className="size-4 animate-pulse" /> : <Send className="size-4" />}
          </Button>
        </form>
      </div>
    </div>
  );
}

function safeParse(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    return {};
  }
}
