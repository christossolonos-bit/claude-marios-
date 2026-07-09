// Tools the assistant can call to act on the app. Every action stays inside the
// app's local data — nothing leaves the folder or the machine.

import {
  addTask,
  updateTask,
  listTasks,
  deleteTask,
  type Priority,
} from "@/lib/tasks";
import { addProject } from "@/lib/projects";
import { addSeminar } from "@/lib/seminars";
import { addMemory } from "@/lib/coachMemory";
import { formatDateLabel, formatTimeLabel } from "@/lib/date";

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
      name: "add_project",
      description: "Create a project (a book, course, or coaching program).",
      parameters: {
        type: "object",
        properties: { name: { type: "string" } },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_seminar",
      description: "Capture a new seminar or talk idea.",
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
): Promise<string> {
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
      return `Added task: "${title}"${when}`;
    }
    case "add_project": {
      const name = str(args.name).trim() || "Untitled project";
      await addProject(name);
      return `Added project: "${name}"`;
    }
    case "add_seminar": {
      const title = str(args.title).trim() || "Untitled seminar";
      await addSeminar(title);
      return `Added seminar idea: "${title}"`;
    }
    case "complete_task": {
      const q = str(args.title).toLowerCase().trim();
      const match = (await listTasks()).find(
        (t) => !t.done && t.title.toLowerCase().includes(q),
      );
      if (!match) return `No open task matching "${str(args.title)}" was found.`;
      await updateTask(match.id, { done: true });
      return `Marked done: "${match.title}"`;
    }
    case "delete_task": {
      const q = str(args.title).toLowerCase().trim();
      const match = (await listTasks()).find((t) =>
        t.title.toLowerCase().includes(q),
      );
      if (!match) return `No task matching "${str(args.title)}" was found.`;
      await deleteTask(match.id);
      return `Removed task: "${match.title}"`;
    }
    case "remember": {
      const fact = str(args.fact).trim();
      if (!fact) return "Nothing to remember.";
      await addMemory(fact);
      return `Noted: ${fact}`;
    }
    default:
      return `Unknown action: ${name}`;
  }
}
