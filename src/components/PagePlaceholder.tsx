import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";

export default function PagePlaceholder({
  icon: Icon,
  title,
  description,
  phase,
  features,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  phase: string;
  features: string[];
}) {
  return (
    <div className="max-w-4xl p-8">
      <div className="mb-1 flex items-center gap-3">
        <Icon className="size-7 text-primary" />
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <span className="ml-1 rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
          {phase}
        </span>
      </div>
      <p className="mb-6 text-muted-foreground">{description}</p>
      <Card>
        <CardHeader>
          <CardTitle>Planned for this module</CardTitle>
          <CardDescription>Coming as we build {phase}.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {features.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
