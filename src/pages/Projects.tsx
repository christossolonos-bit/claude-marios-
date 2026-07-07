import { FolderKanban } from "lucide-react";
import PagePlaceholder from "@/components/PagePlaceholder";

export default function Projects() {
  return (
    <PagePlaceholder
      icon={FolderKanban}
      title="Projects"
      phase="Phase 1"
      description="Track your books, courses, and coaching projects from idea to launch."
      features={[
        "Project boards with status and deadlines",
        "Link tasks and seminar ideas to a project",
        "Progress overview on the dashboard",
      ]}
    />
  );
}
