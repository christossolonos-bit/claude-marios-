import { Settings as SettingsIcon } from "lucide-react";
import PagePlaceholder from "@/components/PagePlaceholder";

export default function Settings() {
  return (
    <PagePlaceholder
      icon={SettingsIcon}
      title="Settings"
      phase="Phase 2"
      description="Configure your assistant, connected accounts, and app preferences."
      features={[
        "Ollama model picker (auto-detects installed models)",
        "Life-coach persona and profile details",
        "Discord connection for DM reminders (Phase 5)",
        "Light / dark theme",
      ]}
    />
  );
}
