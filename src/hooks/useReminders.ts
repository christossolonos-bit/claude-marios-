import { useEffect, useRef } from "react";
import { listTasks } from "@/lib/tasks";
import { formatTimeLabel } from "@/lib/date";
import { notify, ensureNotifyPermission } from "@/lib/notify";

// Fires a desktop notification when a scheduled task's time arrives while the
// app is running (open or minimized). To avoid spamming old/overdue tasks on
// startup, it only fires for times that pass during this session.
export function useReminders(): void {
  const fired = useRef<Set<string>>(new Set());
  const startedAt = useRef<number>(Date.now());

  useEffect(() => {
    ensureNotifyPermission();
    let active = true;

    async function check() {
      const tasks = await listTasks();
      const now = Date.now();
      for (const t of tasks) {
        if (t.done || !t.date || !t.time) continue;
        const due = new Date(`${t.date}T${t.time}`).getTime();
        if (Number.isNaN(due)) continue;
        const key = `${t.id}|${t.date}T${t.time}`;
        if (fired.current.has(key)) continue;
        // Due now (or just passed), and it became due during this session.
        if (now >= due && due >= startedAt.current - 60_000) {
          fired.current.add(key);
          notify(t.title, `Reminder · ${formatTimeLabel(t.time)}`);
        }
      }
    }

    check();
    const id = window.setInterval(() => {
      if (active) check();
    }, 30_000);

    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, []);
}
