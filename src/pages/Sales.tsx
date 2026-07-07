import { LineChart } from "lucide-react";
import PagePlaceholder from "@/components/PagePlaceholder";

export default function Sales() {
  return (
    <PagePlaceholder
      icon={LineChart}
      title="Sales"
      phase="Phase 3"
      description="See how your book is selling online — digital sales, revenue, and reviews at a glance."
      features={[
        "Sales dashboard with revenue charts",
        "Track digital book sales over time",
        "Storefront links (Amazon, Gumroad, your store)",
        "Manual entry and CSV import to start",
      ]}
    />
  );
}
