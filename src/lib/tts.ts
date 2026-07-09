// Text-to-speech.
//
// If a Fish Audio API key is set (and we're in the desktop app), use that cloud
// voice — the request goes through Rust so there's no browser CORS. Otherwise
// (or on any failure) fall back to the local browser voice, which is free,
// offline, and private.

import { getSettings } from "@/lib/settings";

export function ttsSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

function inTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    (window as unknown as { __TAURI_INTERNALS__?: unknown })
      .__TAURI_INTERNALS__ !== undefined
  );
}

function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " code block ")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/[#*_`~>]/g, "")
    .trim();
}

let currentAudio: HTMLAudioElement | null = null;

function speakLocal(text: string): void {
  if (!ttsSupported()) return;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}

export async function speak(text: string): Promise<void> {
  const clean = stripMarkdown(text);
  if (!clean) return;

  const s = getSettings();
  if (inTauri() && s.fishApiKey && s.fishVoiceId) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const b64 = await invoke<string>("fish_tts", {
        apiKey: s.fishApiKey,
        voiceId: s.fishVoiceId,
        text: clean,
      });
      stopSpeaking();
      const audio = new Audio(`data:audio/mpeg;base64,${b64}`);
      currentAudio = audio;
      await audio.play();
      return;
    } catch {
      // fall through to the local voice
    }
  }

  speakLocal(clean);
}

export function stopSpeaking(): void {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = "";
    currentAudio = null;
  }
  if (ttsSupported()) window.speechSynthesis.cancel();
}
