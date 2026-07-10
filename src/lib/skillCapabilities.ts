// Safe, built-in "capabilities" a Skill can be bound to so it actually DOES
// something (not just prompt the model). This is a fixed, audited whitelist of
// pure local functions — the assistant can only wire a skill to one of these,
// never run arbitrary code. That keeps L4 ("app gains new skills") inside the
// safety boundary: nothing executes that isn't shipped here, nothing leaves the
// machine.

export interface Capability {
  id: string;
  label: string;
  // Shown to the assistant so it can pick the right one when building a skill.
  description: string;
  needsInput: boolean;
  run: (input: string) => string;
}

export const CAPABILITIES: Capability[] = [
  {
    id: "datetime",
    label: "Current date & time",
    description: "Tells the current date and time. No input needed.",
    needsInput: false,
    run: () => {
      const d = new Date();
      const date = d.toLocaleDateString(undefined, {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      const time = d.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      });
      return `It's ${date}, ${time}.`;
    },
  },
  {
    id: "today",
    label: "Today's date",
    description: "Tells today's date. No input needed.",
    needsInput: false,
    run: () => {
      const d = new Date();
      return `Today is ${d.toLocaleDateString(undefined, {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      })}.`;
    },
  },
  {
    id: "wordcount",
    label: "Word & character count",
    description: "Counts the words and characters in the given text.",
    needsInput: true,
    run: (input: string) => {
      const text = input.trim();
      const words = text ? text.split(/\s+/).length : 0;
      return `${words} word${words === 1 ? "" : "s"}, ${text.length} characters.`;
    },
  },
];

export function getCapability(id: string): Capability | undefined {
  return CAPABILITIES.find((c) => c.id === id);
}

export function runCapability(id: string, input: string): string {
  const cap = getCapability(id);
  if (!cap) return `Unknown capability: ${id}`;
  return cap.run(input);
}

export const CAPABILITY_IDS = CAPABILITIES.map((c) => c.id);

// A compact catalog for the assistant's system prompt.
export function capabilityCatalog(): string {
  return CAPABILITIES.map((c) => `${c.id} — ${c.description}`).join("\n");
}
