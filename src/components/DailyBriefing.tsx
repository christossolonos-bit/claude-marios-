import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX, RefreshCw, Plus, Check } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Card, CardContent } from "@/components/ui/card";
import {
  generateBriefing,
  cachedBriefing,
  cacheBriefing,
  toSpoken,
} from "@/lib/briefing";
import { getSettings } from "@/lib/settings";
import { addTask, updateTask } from "@/lib/tasks";
import { todayISO } from "@/lib/date";
import { speak, stopSpeaking, ttsSupported } from "@/lib/tts";

// Flatten react-markdown children (strings + elements) into plain text.
function nodeText(node: unknown): string {
  if (node == null) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (typeof node === "object" && "props" in node)
    return nodeText((node as { props?: { children?: unknown } }).props?.children);
  return "";
}

export default function DailyBriefing({ onAction }: { onAction?: () => void }) {
  const [text, setText] = useState<string>(() => cachedBriefing() ?? "");
  const [busy, setBusy] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const abortRef = useRef<AbortController | null>(null);

  async function brief(speakIt: boolean) {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setBusy(true);
    setAdded(new Set());
    let result = "";
    try {
      result = await generateBriefing({
        signal: ac.signal,
        onToken: (t) => setText(t),
      });
    } catch {
      if (ac.signal.aborted) return;
    }
    if (ac.signal.aborted) return;
    setText(result);
    setBusy(false);
    if (result) {
      cacheBriefing(result);
      if (speakIt && ttsSupported()) {
        setSpeaking(true);
        speak(toSpoken(result));
      }
    }
  }

  useEffect(() => {
    if (cachedBriefing()) return;
    brief(getSettings().greetAloud);
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleSpeak() {
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
    } else if (text) {
      setSpeaking(true);
      speak(toSpoken(text));
    }
  }

  async function addSuggestion(raw: string) {
    const title = raw.replace(/\s+/g, " ").trim();
    if (!title || added.has(title)) return;
    const t = await addTask(title);
    await updateTask(t.id, { date: todayISO() });
    setAdded((prev) => new Set(prev).add(title));
    onAction?.();
  }

  // Render each briefing bullet with an "Add to today's schedule" action.
  const markdownComponents = {
    li: ({ children }: { children?: React.ReactNode }) => {
      const itemText = nodeText(children).trim();
      const isAdded = added.has(itemText);
      return (
        <li className="group/li">
          {children}{" "}
          {isAdded ? (
            <span className="ml-1 inline-flex items-center gap-0.5 rounded bg-green-50 px-1.5 py-0.5 align-middle text-xs text-green-700">
              <Check className="size-3" /> Added
            </span>
          ) : (
            <button
              onClick={() => addSuggestion(itemText)}
              title="Add to today's schedule"
              className="ml-1 inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 align-middle text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Plus className="size-3" /> Add
            </button>
          )}
        </li>
      );
    },
  };

  return (
    <Card className="mb-8">
      <CardContent className="flex items-start justify-between gap-4 pt-6">
        <div className="md min-w-0 flex-1 text-[15px] leading-7">
          {text ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {text}
            </ReactMarkdown>
          ) : (
            <span className="text-muted-foreground">
              {busy ? "Putting your briefing together…" : "Good to see you."}
            </span>
          )}
          {busy && text && (
            <span className="ml-0.5 inline-block animate-pulse text-primary">
              ▋
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {ttsSupported() && text && !busy && (
            <button
              onClick={toggleSpeak}
              title={speaking ? "Stop" : "Read it to me"}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              {speaking ? (
                <VolumeX className="size-4" />
              ) : (
                <Volume2 className="size-4" />
              )}
            </button>
          )}
          <button
            onClick={() => brief(false)}
            disabled={busy}
            title="Refresh briefing"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
          >
            <RefreshCw className={busy ? "size-4 animate-spin" : "size-4"} />
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
