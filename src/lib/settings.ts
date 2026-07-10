// App settings — persisted in localStorage. Keeps the assistant's model and
// life-coach persona. Sync semantics can change later without touching callers.

export type Provider = "ollama" | "openrouter";

export interface Settings {
  provider: Provider; // where the assistant runs: local Ollama or cloud OpenRouter
  model: string; // Ollama model name (used when provider = "ollama")
  openrouterApiKey: string; // OpenRouter key (used when provider = "openrouter")
  openrouterModel: string; // OpenRouter model id — only free (:free) models are offered
  persona: string;
  useContext: boolean;
  currency: string;
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
  openrouterModel: "openrouter/free",
  persona: DEFAULT_PERSONA,
  useContext: true,
  currency: "$",
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
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(KEY, JSON.stringify(settings));
}
