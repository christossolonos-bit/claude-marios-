import { useEffect, useRef } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  CalendarDays,
  Languages,
  BookText,
  Presentation,
  Bot,
  BookOpen,
  Rocket,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useReminders } from "@/hooks/useReminders";
import { healActiveModel } from "@/lib/ollama";

const LAST_ROUTE = "authorhub.lastroute";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/schedule", label: "Schedule", icon: CalendarDays },
  { to: "/book", label: "Book", icon: BookText },
  { to: "/translate", label: "Translate", icon: Languages },
  { to: "/presentations", label: "Presentations", icon: Presentation },
  { to: "/assistant", label: "Assistant", icon: Bot },
  { to: "/setup", label: "Setup", icon: Rocket },
  { to: "/settings", label: "Settings", icon: Settings },
];

export default function Layout() {
  useReminders();
  const location = useLocation();
  const navigate = useNavigate();
  const restored = useRef(false);

  // On launch, make sure the saved model is actually installed on this machine.
  useEffect(() => {
    healActiveModel();
  }, []);

  // Reopen the tab the user was last on, so the app resumes where they left off
  // instead of always starting on the Dashboard. Runs once, before the user
  // navigates.
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const last = localStorage.getItem(LAST_ROUTE);
    const target = last === "/writing" ? "/book" : last;
    if (target && target !== location.pathname) {
      navigate(target, { replace: true });
    }
  }, [location.pathname, navigate]);

  // Remember the current tab for next launch.
  useEffect(() => {
    localStorage.setItem(LAST_ROUTE, location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex h-screen bg-transparent text-foreground">
      <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-card/80 backdrop-blur-sm print:hidden">
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
                    ? "bg-primary text-primary-foreground shadow-sm"
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
      <main className="flex-1 overflow-y-auto bg-transparent">
        <Outlet />
      </main>
    </div>
  );
}
