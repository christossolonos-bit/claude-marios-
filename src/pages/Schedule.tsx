import { CalendarDays } from "lucide-react";
import PagePlaceholder from "@/components/PagePlaceholder";

export default function Schedule() {
  return (
    <PagePlaceholder
      icon={CalendarDays}
      title="Schedule"
      phase="Phase 1"
      description="Plan your day and get live reminders — the daily-organizer heart of the app."
      features={[
        "Day and week calendar view",
        "Task list with times, priorities, and notes",
        "Local desktop reminders from the system tray",
        "Discord DM reminders (Phase 5)",
      ]}
    />
  );
}
