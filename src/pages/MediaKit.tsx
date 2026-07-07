import { BookOpen } from "lucide-react";
import PagePlaceholder from "@/components/PagePlaceholder";

export default function MediaKit() {
  return (
    <PagePlaceholder
      icon={BookOpen}
      title="Media Kit"
      phase="Phase 4"
      description="A polished press kit and landing page for your book and coaching brand."
      features={[
        "Author bio, cover, and testimonials",
        "Exportable one-page media kit",
        "Shareable promo landing page",
      ]}
    />
  );
}
