// Task data layer.
//
// Backed by localStorage for now so it works in both the browser preview and
// the Tauri webview (localStorage persists in both). The API is async so we can
// swap in the Tauri SQLite plugin later without changing any calling code.

export type Priority = "low" | "med" | "high";

export interface Task {
  id: string;
  title: string;
  done: boolean;
  date: string | null; // "YYYY-MM-DD" or null (no date yet)
  time: string | null; // "HH:MM" or null
  priority: Priority;
  notes: string;
  projectId: string | null;
  createdAt: number;
}

const KEY = "authorhub.tasks.v1";

function read(): Task[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Task[]) : [];
  } catch {
    return [];
  }
}

function write(tasks: Task[]): void {
  localStorage.setItem(KEY, JSON.stringify(tasks));
}

export async function listTasks(): Promise<Task[]> {
  return read();
}

export async function addTask(title: string): Promise<Task> {
  const task: Task = {
    id: crypto.randomUUID(),
    title: title.trim(),
    done: false,
    date: null,
    time: null,
    priority: "med",
    notes: "",
    projectId: null,
    createdAt: Date.now(),
  };
  const tasks = read();
  tasks.push(task);
  write(tasks);
  return task;
}

export async function updateTask(
  id: string,
  patch: Partial<Task>,
): Promise<void> {
  write(read().map((t) => (t.id === id ? { ...t, ...patch } : t)));
}

export async function deleteTask(id: string): Promise<void> {
  write(read().filter((t) => t.id !== id));
}
