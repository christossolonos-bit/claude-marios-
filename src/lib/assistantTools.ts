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
import { listSkills, buildSkillMessages } from "@/lib/skills";
import { chat } from "@/lib/ollama";
import { getSettings } from "@/lib/settings";
import { formatDateLabel, formatTimeLabel } from "@/lib/date";

// A tool run reports a short confirmation (shown as a chip) and may also produce
// longer generated content (e.g. a skill's output) to fold into the reply body.
export interface ToolResult {
  summary: string;
  content?: string;
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
