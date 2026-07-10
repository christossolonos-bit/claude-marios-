// "Skills" — reusable AI prompt templates the user can build, edit, and run.
//
// This is AuthorHub's safe, bounded take on "the assistant learns new skills":
// each skill is just a saved prompt — a role plus a template with a {{input}}
// slot — stored locally in the app. Nothing executes code and nothing leaves
// the folder; the dad can grow the app's abilities by writing plain prompts.

import { getCapability } from "@/lib/skillCapabilities";

// A skill is either a "prompt" (text → model → text) or a "function" bound to a
// safe built-in capability (see skillCapabilities.ts) that actually does
// something like telling the time.
export type SkillKind = "prompt" | "function";

export interface Skill {
  id: string;
  emoji: string;
  name: string;
  description: string;
  kind: SkillKind;
  system: string; // prompt kind: the role / instructions given to the model
  template: string; // prompt kind: {{input}} is replaced with the input
  capability?: string; // function kind: the capability id it runs
  createdAt: number;
  updatedAt: number;
}

const KEY = "authorhub.skills.v1";
const SEEDED_KEY = "authorhub.skills.seeded.v1";

// Starter skills tailored to a writer / life coach. Seeded once on first use,
// then fully owned by the user — editable and deletable like any other.
const SEEDS: Array<Omit<Skill, "id" | "createdAt" | "updatedAt" | "kind">> = [
  {
    emoji: "✨",
    name: "Rewrite clearer",
    description: "Tighten a passage while keeping your voice and meaning.",
    system:
      "You are a sensitive book editor. Rewrite the user's text to be clearer, smoother, and more concise while fully preserving their meaning, voice, and language. Return only the rewritten text — no preamble or commentary.",
    template: "Rewrite this:\n\n{{input}}",
  },
  {
    emoji: "💡",
    name: "Brainstorm ideas",
    description: "Get a burst of fresh angles on any topic.",
    system:
      "You are an imaginative brainstorming partner for a writer and life coach. Return a numbered list of 8 fresh, specific, varied ideas. No preamble.",
    template: "Brainstorm ideas about:\n\n{{input}}",
  },
  {
    emoji: "🧭",
    name: "Coaching questions",
    description: "Powerful open-ended questions to explore a theme.",
    system:
      "You are an experienced life coach. Return 5 powerful, open-ended coaching questions that help someone reflect deeply on the theme. One per line, no numbering fluff, no preamble.",
    template: "Coaching questions to explore:\n\n{{input}}",
  },
  {
    emoji: "📖",
    name: "Chapter outline",
    description: "Turn a topic into a structured chapter outline.",
    system:
      "You are a book-structuring editor. Produce a clear chapter outline: a working chapter title, a one-line premise, and 4-6 beat bullets. Use markdown. No preamble.",
    template: "Outline a chapter about:\n\n{{input}}",
  },
  {
    emoji: "📝",
    name: "Summarize",
    description: "Distil long text into the key points.",
    system:
      "You summarize faithfully. Return the key points as a short markdown bullet list in the same language as the input. No preamble.",
    template: "Summarize the key points:\n\n{{input}}",
  },
];

function read(): Skill[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as Array<Partial<Skill>>;
    // Backfill `kind` for skills saved before capability skills existed.
    return arr.map((s) => ({
      system: "",
      template: "{{input}}",
      kind: "prompt" as SkillKind,
      ...s,
    })) as Skill[];
  } catch {
    return [];
  }
}

function write(items: Skill[]): void {
  localStorage.setItem(KEY, JSON.stringify(items));
}

// Write the starter skills once. If the user later deletes them, the flag keeps
// them gone — we never re-seed on top of the user's own library.
function ensureSeeded(): Skill[] {
  const items = read();
  if (localStorage.getItem(SEEDED_KEY)) return items;
  const now = Date.now();
  const seeded = SEEDS.map((s, i) => ({
    ...s,
    kind: "prompt" as SkillKind,
    id: crypto.randomUUID(),
    createdAt: now + i,
    updatedAt: now + i,
  }));
  const merged = [...seeded, ...items];
  write(merged);
  localStorage.setItem(SEEDED_KEY, "1");
  return merged;
}

export async function listSkills(): Promise<Skill[]> {
  return ensureSeeded().sort((a, b) => a.createdAt - b.createdAt);
}

export async function getSkill(id: string): Promise<Skill | undefined> {
  return read().find((s) => s.id === id);
}

export interface NewSkill {
  emoji: string;
  name: string;
  description: string;
  system?: string;
  template?: string;
  kind?: SkillKind;
  capability?: string;
}

export async function createSkill(data: NewSkill): Promise<Skill> {
  const now = Date.now();
  const kind: SkillKind = data.kind ?? (data.capability ? "function" : "prompt");
  const skill: Skill = {
    emoji: data.emoji,
    name: data.name,
    description: data.description,
    kind,
    system: data.system ?? "",
    template: data.template ?? "{{input}}",
    capability: kind === "function" ? data.capability : undefined,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  };
  const items = ensureSeeded();
  items.push(skill);
  write(items);
  return skill;
}

export async function updateSkill(
  id: string,
  patch: Partial<Pick<Skill, "emoji" | "name" | "description" | "system" | "template">>,
): Promise<void> {
  write(
    read().map((s) =>
      s.id === id ? { ...s, ...patch, updatedAt: Date.now() } : s,
    ),
  );
}

export async function deleteSkill(id: string): Promise<void> {
  write(read().filter((s) => s.id !== id));
}

// Fill the template's {{input}} slot. If a skill has no slot, the input is
// appended so free-form skills still receive the user's text.
export function fillTemplate(template: string, input: string): string {
  const text = input.trim();
  if (template.includes("{{input}}")) {
    return template.replace(/\{\{input\}\}/g, text);
  }
  return text ? `${template.trim()}\n\n${text}` : template.trim();
}

export function buildSkillMessages(
  skill: Skill,
  input: string,
): { system: string; user: string } {
  return { system: skill.system, user: fillTemplate(skill.template, input) };
}

// Whether the skill actually expects the user to type something.
export function skillNeedsInput(skill: Skill): boolean {
  if (skill.kind === "function") {
    return getCapability(skill.capability ?? "")?.needsInput ?? false;
  }
  return skill.template.includes("{{input}}");
}
