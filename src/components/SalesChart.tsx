import { formatMoney } from "@/lib/sales";

export default function SalesChart({
  data,
  currency,
}: {
  data: { month: string; label: string; revenue: number }[];
  currency: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.revenue));

  return (
    <div className="flex h-40 items-stretch gap-3">
      {data.map((d) => (
        <div key={d.month} className="flex flex-1 flex-col items-center gap-1">
          <div className="flex w-full flex-1 items-end">
            <div
              className="w-full rounded-t bg-primary transition-all"
              style={{ height: `${(d.revenue / max) * 100}%` }}
              title={formatMoney(d.revenue, currency)}
            />
          </div>
          <span className="text-[10px] text-muted-foreground">{d.label}</span>
        </div>
      ))}
    </div>
  );
}
