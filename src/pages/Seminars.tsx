import { Lightbulb } from "lucide-react";
import PagePlaceholder from "@/components/PagePlaceholder";

export default function Seminars() {
  return (
    <PagePlaceholder
      icon={Lightbulb}
      title="Seminars"
      phase="Phase 2"
      description="Capture and organize seminar ideas, with your local AI coach helping you shape them."
      features={[
        "Idea board for seminar and talk concepts",
        "AI-assisted outlining and structuring",
        "Turn an idea into a session plan or project",
      ]}
    />
  );
}
