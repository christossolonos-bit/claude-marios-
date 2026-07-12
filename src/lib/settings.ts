// App settings — persisted in localStorage. Keeps the assistant's model and
// life-coach persona. Sync semantics can change later without touching callers.

export type Provider = "ollama" | "openrouter";
export type TtsProvider = "local" | "edge" | "fish";

// Free Microsoft Edge neural voices (same as Edge "Read Aloud"). English + Greek
// since the book may be in either.
export const EDGE_VOICES: { label: string; value: string }[] = [
  { label: "William — English (Australia), male", value: "en-AU-WilliamNeural" },
  { label: "Natasha — English (Australia), female", value: "en-AU-NatashaNeural" },
  { label: "Aria — English (US), female", value: "en-US-AriaNeural" },
  { label: "Guy — English (US), male", value: "en-US-GuyNeural" },
  { label: "Jenny — English (US), female", value: "en-US-JennyNeural" },
  { label: "Sonia — English (UK), female", value: "en-GB-SoniaNeural" },
  { label: "Ryan — English (UK), male", value: "en-GB-RyanNeural" },
  { label: "Athina — Greek, female", value: "el-GR-AthinaNeural" },
  { label: "Nestoras — Greek, male", value: "el-GR-NestorasNeural" },
];

export interface Settings {
  provider: Provider; // where the assistant runs: local Ollama or cloud OpenRouter
  model: string; // Ollama model name (used when provider = "ollama")
  openrouterApiKey: string; // OpenRouter key (used when provider = "openrouter")
  openrouterModel: string; // OpenRouter model id — only free (:free) models are offered
  persona: string;
  useContext: boolean;
  currency: string;
  ttsProvider: TtsProvider; // which voice to speak with
  edgeVoice: string; // Edge TTS voice name (used when ttsProvider = "edge")
  fishApiKey: string;
  fishVoiceId: string;
  ownerName: string; // how the assistant addresses him in the welcome
  greetAloud: boolean; // speak the welcome greeting on app open
  reminderSpeak: boolean; // speak reminders aloud (TTS) when they fire
  reminderSound: boolean; // play an alarm chime when a reminder fires
}

export const DEFAULT_PERSONA = `You are the personal AI assistant and coaching thought-partner for a writer who is also a life coach. Help him organize his day, develop seminar and talk ideas, plan his book's promotion, and think through coaching content. Be warm, encouraging, and practical. Give concrete, actionable suggestions, and ask a clarifying question when it genuinely helps. Keep replies concise and well-structured.`;

const DEFAULTS: Settings = {
  provider: "ollama",
  model: "qwen3.5:4b",
  openrouterApiKey: "",
  openrouterModel: "meta-llama/llama-3.3-70b-instruct:free",
  persona: DEFAULT_PERSONA,
  useContext: true,
  currency: "$",
  ttsProvider: "local",
  edgeVoice: "en-AU-WilliamNeural",
  fishApiKey: "",
  fishVoiceId: "96c28df4a43b4c45970a72c210ecbf54",
  ownerName: "",
  greetAloud: false,
  reminderSpeak: true,
  reminderSound: true,
};

const KEY = "authorhub.settings.v1";

export function getSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<Settings>) : {};
    const s = { ...DEFAULTS, ...parsed };
    // Someone who set up a Fish Audio key before the provider selector existed
    // should keep using Fish, not silently drop to the local voice.
    if (parsed.ttsProvider === undefined && parsed.fishApiKey) {
      s.ttsProvider = "fish";
    }
    // Heal legacy setting: "openrouter/free" routes to random free models,
    // including a content-safety classifier that replies with junk like
    // "User Safety: safe". Pin a reliable instruction-following model instead.
    if (s.openrouterModel === "openrouter/free") {
      s.openrouterModel = DEFAULTS.openrouterModel;
    }
    return s;
  } catch {
    return DEFAULTS;
  }
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(KEY, JSON.stringify(settings));
}
