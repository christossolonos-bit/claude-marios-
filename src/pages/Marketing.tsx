import { Megaphone } from "lucide-react";
import PagePlaceholder from "@/components/PagePlaceholder";

export default function Marketing() {
  return (
    <PagePlaceholder
      icon={Megaphone}
      title="Marketing"
      phase="Phase 3"
      description="Generate promo content with your local AI — no cloud, no per-word costs."
      features={[
        "AI-generated social posts, blurbs, and ad copy",
        "Email newsletter drafts",
        "Content calendar to queue and schedule posts",
      ]}
    />
  );
}
