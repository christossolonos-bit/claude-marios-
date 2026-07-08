import { NavLink, Outlet } from "react-router-dom";
import {
  LayoutDashboard,
  CalendarDays,
  FolderKanban,
  Lightbulb,
  Bot,
  LineChart,
  Megaphone,
  BookOpen,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useReminders } from "@/hooks/useReminders";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/schedule", label: "Schedule", icon: CalendarDays },
  { to: "/projects", label: "Projects", icon: FolderKanban },
  { to: "/seminars", label: "Seminars", icon: Lightbulb },
  { to: "/assistant", label: "Assistant", icon: Bot },
  { to: "/sales", label: "Sales", icon: LineChart },
  { to: "/marketing", label: "Marketing", icon: Megaphone },
  { to: "/media-kit", label: "Media Kit", icon: BookOpen },
  { to: "/settings", label: "Settings", icon: Settings },
];

export default function Layout() {
  useReminders();

  return (
    <div className="flex h-screen bg-background text-foreground">
      <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-card print:hidden">
        <div className="flex h-14 items-center gap-2 border-b border-border px-5">
          <BookOpen className="size-5 text-primary" />
          <span className="font-semibold tracking-tight">AuthorHub</span>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )
              }
            >
              <Icon className="size-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-border p-3 text-xs text-muted-foreground">
          Phase 0 · v0.1.0
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
