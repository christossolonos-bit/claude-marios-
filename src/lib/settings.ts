// App settings — persisted in localStorage. Keeps the assistant's model and
// life-coach persona. Sync semantics can change later without touching callers.

export interface Settings {
  model: string;
  persona: string;
  useContext: boolean;
  currency: string;
  fishApiKey: string;
  fishVoiceId: string;
  ownerName: string; // how the assistant addresses him in the welcome
  greetAloud: boolean; // speak the welcome greeting on app open
}

export const DEFAULT_PERSONA = `You are the personal AI assistant and coaching thought-partner for a writer who is also a life coach. Help him organize his day, develop seminar and talk ideas, plan his book's promotion, and think through coaching content. Be warm, encouraging, and practical. Give concrete, actionable suggestions, and ask a clarifying question when it genuinely helps. Keep replies concise and well-structured.`;

const DEFAULTS: Settings = {
  model: "qwen3.5:4b",
  persona: DEFAULT_PERSONA,
  useContext: true,
  currency: "$",
  fishApiKey: "",
  fishVoiceId: "96c28df4a43b4c45970a72c210ecbf54",
  ownerName: "",
  greetAloud: false,
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
