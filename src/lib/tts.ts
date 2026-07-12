// Text-to-speech.
//
// Three voices, chosen by the ttsProvider setting: "edge" (free Microsoft
// neural voices, no key, needs internet), "fish" (Fish Audio cloud, needs an
// API key), or "local" (the OS browser voice — free, offline, private). The
// cloud voices go through Rust so there's no browser CORS, and any failure
// falls back to the local voice so speaking always works.

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

  // Play a base64 MP3 returned by a cloud voice command. Returns false so the
  // caller can fall back to the local voice on any failure.
  async function playMp3(b64: string): Promise<void> {
    stopSpeaking();
    const audio = new Audio(`data:audio/mpeg;base64,${b64}`);
    currentAudio = audio;
    await audio.play();
  }

  if (inTauri() && s.ttsProvider === "edge" && s.edgeVoice) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const b64 = await invoke<string>("edge_tts", {
        text: clean,
        voice: s.edgeVoice,
      });
      await playMp3(b64);
      return;
    } catch {
      // fall through to the local voice
    }
  }

  if (inTauri() && s.ttsProvider === "fish" && s.fishApiKey && s.fishVoiceId) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const b64 = await invoke<string>("fish_tts", {
        apiKey: s.fishApiKey,
        voiceId: s.fishVoiceId,
        text: clean,
      });
      await playMp3(b64);
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
