import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX, RefreshCw } from "lucide-react";
import {
  generateGreeting,
  fallbackGreeting,
  cachedGreeting,
  cacheGreeting,
} from "@/lib/greeting";
import { getSettings } from "@/lib/settings";
import { speak, stopSpeaking, ttsSupported } from "@/lib/tts";

export default function WelcomeBanner() {
  const [text, setText] = useState<string>(() => cachedGreeting() ?? "");
  const [busy, setBusy] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  async function greet(speakIt: boolean) {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setBusy(true);
    const name = getSettings().ownerName.trim();
    let result = "";
    try {
      result = await generateGreeting({
        signal: ac.signal,
        onToken: (t) => setText(t),
      });
    } catch {
      if (ac.signal.aborted) return;
      result = fallbackGreeting(name);
    }
    if (ac.signal.aborted) return;
    const final = result.trim() || fallbackGreeting(name);
    setText(final);
    setBusy(false);
    cacheGreeting(final);
    if (speakIt && ttsSupported()) {
      setSpeaking(true);
      speak(final);
    }
  }

  // On app open (first Dashboard mount of the session), greet once.
  useEffect(() => {
    if (cachedGreeting()) return; // already greeted this session
    greet(getSettings().greetAloud);
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleSpeak() {
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
    } else if (text) {
      setSpeaking(true);
      speak(text);
    }
  }

  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <h1 className="min-h-8 text-2xl font-semibold tracking-tight">
        {text || "Good to see you"}
        {busy && (
          <span className="ml-0.5 inline-block w-2 animate-pulse text-primary">
            ▋
          </span>
        )}
      </h1>
      <div className="flex shrink-0 items-center gap-1 pt-1">
        {ttsSupported() && text && !busy && (
          <button
            onClick={toggleSpeak}
            title={speaking ? "Stop" : "Hear it"}
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
          onClick={() => greet(false)}
          disabled={busy}
          title="New greeting"
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
        >
          <RefreshCw className={busy ? "size-4 animate-spin" : "size-4"} />
        </button>
      </div>
    </div>
  );
}
