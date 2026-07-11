import { useRef, useState } from "react";
import { Mic, Square, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { transcribe } from "@/lib/whisper";
import { AudioRecorder, isRecordingSupported } from "@/lib/recorder";

interface Props {
  // Called with the transcribed text once recording stops.
  onText: (text: string) => void;
  onError?: (message: string) => void;
  disabled?: boolean;
  // When set, the button shows a text label (and uses the "sm" size); otherwise
  // it's an icon-only button, handy for tight per-item toolbars.
  label?: string;
  idleTitle?: string;
}

// A self-contained record → transcribe button. Records from the mic, runs the
// audio through local Whisper (the same offline pipeline the Assistant uses),
// and hands the text back via onText. Renders nothing if the device can't
// record. The first use downloads the ~75MB model once, then it's fully offline.
export default function MicButton({
  onText,
  onError,
  disabled,
  label,
  idleTitle,
}: Props) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const recRef = useRef<AudioRecorder | null>(null);

  if (!isRecordingSupported()) return null;

  async function start() {
    if (disabled || transcribing) return;
    const rec = new AudioRecorder();
    try {
      await rec.start();
      recRef.current = rec;
      setRecording(true);
    } catch {
      onError?.(
        "Couldn't access the microphone. Check that recording is allowed.",
      );
    }
  }

  async function stop() {
    const rec = recRef.current;
    if (!rec) return;
    setRecording(false);
    setTranscribing(true);
    try {
      const blob = await rec.stop();
      const text = await transcribe(blob);
      if (text) onText(text);
      else onError?.("Didn't catch any speech — try again.");
    } catch (e) {
      onError?.((e as Error).message || "Transcription failed.");
    } finally {
      recRef.current = null;
      setTranscribing(false);
    }
  }

  return (
    <Button
      type="button"
      variant={recording ? "default" : "outline"}
      size={label ? "sm" : "icon"}
      onClick={recording ? stop : start}
      disabled={disabled || transcribing}
      title={
        recording
          ? "Stop and transcribe"
          : transcribing
            ? "Transcribing…"
            : (idleTitle ?? "Dictate with your voice")
      }
      className={cn(recording && "bg-red-500 text-white hover:bg-red-600")}
    >
      {transcribing ? (
        <Loader2 className="size-4 animate-spin" />
      ) : recording ? (
        <Square className="size-4" />
      ) : (
        <Mic className="size-4" />
      )}
      {label && (
        <span>
          {transcribing ? "Transcribing…" : recording ? "Stop" : label}
        </span>
      )}
    </Button>
  );
}
