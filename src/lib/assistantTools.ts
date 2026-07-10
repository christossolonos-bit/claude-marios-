// Tools the assistant can call to act on the app. Every action stays inside the
// app's local data — nothing leaves the folder or the machine.

import {
  addTask,
  updateTask,
  listTasks,
  deleteTask,
  type Priority,
} from "@/lib/tasks";
import {
  addProject,
  updateProject,
  listProjects,
  type ProjectStatus,
} from "@/lib/projects";
import { addSeminar, updateSeminar } from "@/lib/seminars";
import { addMemory } from "@/lib/coachMemory";
import { listSkills, buildSkillMessages, type SkillKind } from "@/lib/skills";
import {
  runCapability,
  getCapability,
  CAPABILITY_IDS,
} from "@/lib/skillCapabilities";
import { chat } from "@/lib/ollama";
import { getSettings } from "@/lib/settings";
import { formatDateLabel, formatTimeLabel } from "@/lib/date";

// A skill the assistant wants to add, held for the user to approve before it's
// installed.
export interface ProposedSkill {
  emoji: string;
  name: string;
  description: string;
  kind: SkillKind;
  system: string;
  template: string;
  capability?: string;
}

// A tool run reports a short confirmation (shown as a chip), may produce longer
// generated content (e.g. a skill's output) to fold into the reply body, and
// may propose a new skill that needs the user's permission before installing.
export interface ToolResult {
  summary: string;
  content?: string;
  pendingSkill?: ProposedSkill;
}

export const TOOLS = [
  {
    type: "function",
    function: {
      name: "add_task",
      description:
        "Add a task or reminder to the user's schedule. Resolve relative dates like 'tomorrow' to an absolute date.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Short task description" },
          date: { type: "string", description: "Due date as YYYY-MM-DD" },
          time: { type: "string", description: "Time as HH:MM (24-hour)" },
          priority: { type: "string", enum: ["low", "med", "high"] },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_task",
      description:
        "Change an existing task, matched by its current title: reschedule it, rename it, or change its priority. Resolve relative dates to an absolute YYYY-MM-DD.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Part of the current title, used to find the task.",
          },
          new_title: { type: "string", description: "New title, if renaming." },
          date: { type: "string", description: "New due date as YYYY-MM-DD" },
          time: { type: "string", description: "New time as HH:MM (24-hour)" },
          priority: { type: "string", enum: ["low", "med", "high"] },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_project",
      description:
        "Create a project (a book, course, or coaching program). Always fill in the description by summarizing what the user said about it.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Short project name" },
          description: {
            type: "string",
            description:
              "A 1-3 sentence description of the project, drawn from the conversation (goal, audience, key details).",
          },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_project",
      description:
        "Update an existing project, matched by name: change its status or due date, or refine its description.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Part of the project name, used to find it.",
          },
          status: {
            type: "string",
            enum: ["idea", "active", "on-hold", "done"],
          },
          dueDate: { type: "string", description: "Due date as YYYY-MM-DD" },
          description: { type: "string", description: "Updated description" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_seminar",
      description:
        "Capture a new seminar or talk idea. Always fill in the notes by summarizing the idea and any details from the conversation.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Short seminar/talk title" },
          notes: {
            type: "string",
            description:
              "Notes capturing the idea, angle, audience, or key points mentioned in the conversation.",
          },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "complete_task",
      description: "Mark an existing task as done, matched by its title.",
      parameters: {
        type: "object",
        properties: { title: { type: "string" } },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_task",
      description: "Remove an existing task, matched by its title.",
      parameters: {
        type: "object",
        properties: { title: { type: "string" } },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_skill",
      description:
        "Run one of the user's saved Skills (reusable AI prompts) on some text, and return its result. Use when the user asks to apply a named skill, or when a saved skill clearly fits what they want done to a piece of text.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "The skill's name (or part of it).",
          },
          input: {
            type: "string",
            description: "The text the skill should work on.",
          },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_skill",
      description:
        "Propose a new reusable Skill the user can run again later (they must approve it before it's installed). Two kinds: (1) a built-in ACTION — set `capability` to one of the available capability ids when the user wants something like telling the time or counting words; (2) a TEXT skill — leave `capability` empty and instead write `instructions` (the AI's role, ending by telling it to return only the result in the input's language) plus a `template` containing the placeholder {{input}}. Use this whenever the user asks you to make/save a skill or describes a repeatable task.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Short skill name, e.g. 'Tell the time' or 'Formalize email'.",
          },
          description: {
            type: "string",
            description: "One short line describing what the skill does.",
          },
          capability: {
            type: "string",
            enum: CAPABILITY_IDS,
            description:
              "For a built-in action skill, the capability id it runs. Leave empty for a text skill.",
          },
          instructions: {
            type: "string",
            description:
              "Text skills only: the AI's role/system prompt. Be specific and end by telling it to return only the result, in the input's language.",
          },
          template: {
            type: "string",
            description:
              "Text skills only: the user-message template, which MUST contain {{input}}, e.g. 'Rewrite this formally:\\n\\n{{input}}'.",
          },
          emoji: {
            type: "string",
            description: "A single emoji icon that fits the skill.",
          },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remember",
      description:
        "Save a durable fact, preference, goal, or pattern about the user to personalize future help. Use for lasting info, not one-off requests.",
      parameters: {
        type: "object",
        properties: { fact: { type: "string" } },
        required: ["fact"],
      },
    },
  },
];

function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  switch (name) {
    case "add_task": {
      const title = str(args.title).trim() || "Untitled task";
      const t = await addTask(title);
      const patch: Partial<{ date: string; time: string; priority: Priority }> =
        {};
      if (args.date) patch.date = str(args.date);
      if (args.time) patch.time = str(args.time);
      const p = str(args.priority);
      if (p === "low" || p === "med" || p === "high") patch.priority = p;
      if (Object.keys(patch).length) await updateTask(t.id, patch);
      const when = patch.date
        ? ` for ${formatDateLabel(patch.date)}${patch.time ? ` at ${formatTimeLabel(patch.time)}` : ""}`
        : "";
      return { summary: `Added task: "${title}"${when}` };
    }
    case "update_task": {
      const q = str(args.title).toLowerCase().trim();
      const tasks = await listTasks();
      // Prefer an open task when several match the same words.
      const match =
        tasks.find((t) => !t.done && t.title.toLowerCase().includes(q)) ??
        tasks.find((t) => t.title.toLowerCase().includes(q));
      if (!match)
        return { summary: `No task matching "${str(args.title)}" was found.` };
      const patch: Partial<{
        title: string;
        date: string;
        time: string;
        priority: Priority;
      }> = {};
      const newTitle = str(args.new_title).trim();
      if (newTitle) patch.title = newTitle;
      if (args.date) patch.date = str(args.date);
      if (args.time) patch.time = str(args.time);
      const p = str(args.priority);
      if (p === "low" || p === "med" || p === "high") patch.priority = p;
      if (!Object.keys(patch).length)
        return { summary: `Nothing to change on "${match.title}".` };
      await updateTask(match.id, patch);
      const when = patch.date
        ? ` → ${formatDateLabel(patch.date)}${patch.time ? ` at ${formatTimeLabel(patch.time)}` : ""}`
        : patch.time
          ? ` → ${formatTimeLabel(patch.time)}`
          : "";
      return { summary: `Updated task: "${patch.title ?? match.title}"${when}` };
    }
    case "add_project": {
      const name = str(args.name).trim() || "Untitled project";
      const project = await addProject(name);
      const description = str(args.description).trim();
      if (description) await updateProject(project.id, { description });
      return { summary: `Added project: "${name}"` };
    }
    case "update_project": {
      const q = str(args.name).toLowerCase().trim();
      const match = (await listProjects()).find((p) =>
        p.name.toLowerCase().includes(q),
      );
      if (!match)
        return { summary: `No project matching "${str(args.name)}" was found.` };
      const patch: Partial<{
        status: ProjectStatus;
        dueDate: string;
        description: string;
      }> = {};
      const s = str(args.status);
      if (s === "idea" || s === "active" || s === "on-hold" || s === "done")
        patch.status = s;
      if (args.dueDate) patch.dueDate = str(args.dueDate);
      const description = str(args.description).trim();
      if (description) patch.description = description;
      if (!Object.keys(patch).length)
        return { summary: `Nothing to change on "${match.name}".` };
      await updateProject(match.id, patch);
      return { summary: `Updated project: "${match.name}"` };
    }
    case "add_seminar": {
      const title = str(args.title).trim() || "Untitled seminar";
      const seminar = await addSeminar(title);
      const notes = str(args.notes).trim();
      if (notes) await updateSeminar(seminar.id, { notes });
      return { summary: `Added seminar idea: "${title}"` };
    }
    case "complete_task": {
      const q = str(args.title).toLowerCase().trim();
      const match = (await listTasks()).find(
        (t) => !t.done && t.title.toLowerCase().includes(q),
      );
      if (!match)
        return { summary: `No open task matching "${str(args.title)}" was found.` };
      await updateTask(match.id, { done: true });
      return { summary: `Marked done: "${match.title}"` };
    }
    case "delete_task": {
      const q = str(args.title).toLowerCase().trim();
      const match = (await listTasks()).find((t) =>
        t.title.toLowerCase().includes(q),
      );
      if (!match)
        return { summary: `No task matching "${str(args.title)}" was found.` };
      await deleteTask(match.id);
      return { summary: `Removed task: "${match.title}"` };
    }
    case "run_skill": {
      const q = str(args.name).toLowerCase().trim();
      const skills = await listSkills();
      const skill =
        skills.find((s) => s.name.toLowerCase() === q) ??
        skills.find((s) => s.name.toLowerCase().includes(q));
      if (!skill)
        return { summary: `No skill matching "${str(args.name)}" was found.` };
      // Function skills run a safe built-in — no model call needed.
      if (skill.kind === "function") {
        const out = runCapability(skill.capability ?? "", str(args.input));
        return { summary: `Ran skill: ${skill.emoji} ${skill.name}`, content: out };
      }
      const { system, user } = buildSkillMessages(skill, str(args.input));
      const msg = await chat({
        model: getSettings().model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      });
      const body = (msg.content ?? "").trim();
      return {
        summary: `Ran skill: ${skill.emoji} ${skill.name}`,
        content: body || undefined,
      };
    }
    case "create_skill": {
      const name = str(args.name).trim();
      if (!name) return { summary: "A new skill needs a name." };
      const capId = str(args.capability).trim();
      // Propose the skill; the Assistant asks the user to approve before it's
      // installed. Nothing is saved here.
      if (capId) {
        const cap = getCapability(capId);
        if (!cap)
          return { summary: `No built-in capability called "${capId}".` };
        return {
          summary: "",
          pendingSkill: {
            emoji: str(args.emoji).trim() || "🧩",
            name,
            description: str(args.description).trim() || cap.label,
            kind: "function",
            system: "",
            template: "",
            capability: capId,
          },
        };
      }
      const instructions = str(args.instructions).trim();
      if (!instructions)
        return { summary: "A text skill needs instructions." };
      let template = str(args.template).trim() || "{{input}}";
      if (!template.includes("{{input}}")) template += "\n\n{{input}}";
      return {
        summary: "",
        pendingSkill: {
          emoji: str(args.emoji).trim() || "✨",
          name,
          description: str(args.description).trim(),
          kind: "prompt",
          system: instructions,
          template,
        },
      };
    }
    case "remember": {
      const fact = str(args.fact).trim();
      if (!fact) return { summary: "Nothing to remember." };
      await addMemory(fact);
      return { summary: `Noted: ${fact}` };
    }
    default:
      return { summary: `Unknown action: ${name}` };
  }
}
