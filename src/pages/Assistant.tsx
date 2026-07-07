import { Bot } from "lucide-react";
import PagePlaceholder from "@/components/PagePlaceholder";

export default function Assistant() {
  return (
    <PagePlaceholder
      icon={Bot}
      title="Assistant"
      phase="Phase 2"
      description="Your personalized life-coach AI, running fully local on Ollama — private and offline."
      features={[
        "Chat with your local model (default qwen3.5:4b)",
        "Custom life-coach system prompt tuned to you",
        "Uses your notes and seminars as context",
        "Model picker that auto-detects installed models",
      ]}
    />
  );
}
