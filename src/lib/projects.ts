// Project data layer — same localStorage-backed, async pattern as tasks.ts,
// ready to swap for the Tauri SQLite plugin later without touching callers.

export type ProjectStatus = "idea" | "active" | "on-hold" | "done";

export interface Project {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  dueDate: string | null; // "YYYY-MM-DD" or null
  createdAt: number;
}

export const STATUS_ORDER: ProjectStatus[] = [
  "active",
  "idea",
  "on-hold",
  "done",
];

export const statusMeta: Record<
  ProjectStatus,
  { label: string; pill: string }
> = {
  active: { label: "Active", pill: "bg-green-100 text-green-700" },
  idea: { label: "Idea", pill: "bg-violet-100 text-violet-700" },
  "on-hold": { label: "On hold", pill: "bg-amber-100 text-amber-700" },
  done: { label: "Done", pill: "bg-zinc-100 text-zinc-600" },
};

const KEY = "authorhub.projects.v1";

function read(): Project[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Project[]) : [];
  } catch {
    return [];
  }
}

function write(projects: Project[]): void {
  localStorage.setItem(KEY, JSON.stringify(projects));
}

export async function listProjects(): Promise<Project[]> {
  return read();
}

export async function addProject(name: string): Promise<Project> {
  const project: Project = {
    id: crypto.randomUUID(),
    name: name.trim(),
    description: "",
    status: "active",
    dueDate: null,
    createdAt: Date.now(),
  };
  const projects = read();
  projects.push(project);
  write(projects);
  return project;
}

export async function updateProject(
  id: string,
  patch: Partial<Project>,
): Promise<void> {
  write(read().map((p) => (p.id === id ? { ...p, ...patch } : p)));
}

export async function deleteProject(id: string): Promise<void> {
  write(read().filter((p) => p.id !== id));
}
