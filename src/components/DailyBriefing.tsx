import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX, RefreshCw } from "lucide-react";
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
import { speak, stopSpeaking, ttsSupported } from "@/lib/tts";

export default function DailyBriefing() {
  const [text, setText] = useState<string>(() => cachedBriefing() ?? "");
  const [busy, setBusy] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  async function brief(speakIt: boolean) {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setBusy(true);
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

  // On app open (first Dashboard mount of the session), brief once.
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

  return (
    <Card className="mb-8">
      <CardContent className="flex items-start justify-between gap-4 pt-6">
        <div className="md min-w-0 flex-1 text-[15px] leading-7">
          {text ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
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
