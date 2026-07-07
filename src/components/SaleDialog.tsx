import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { type Sale, type SaleFormat } from "@/lib/sales";
import { todayISO } from "@/lib/date";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const selectClass =
  "mt-1 flex h-9 w-full rounded-md border border-border bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const formats: { value: SaleFormat; label: string }[] = [
  { value: "ebook", label: "E-book" },
  { value: "paperback", label: "Paperback" },
  { value: "audio", label: "Audiobook" },
  { value: "other", label: "Other" },
];

interface Draft {
  date: string;
  title: string;
  platform: string;
  format: SaleFormat;
  units: string;
  revenue: string;
}

function toDraft(sale: Sale | null): Draft {
  if (!sale)
    return {
      date: todayISO(),
      title: "",
      platform: "",
      format: "ebook",
      units: "1",
      revenue: "",
    };
  return {
    date: sale.date,
    title: sale.title,
    platform: sale.platform,
    format: sale.format,
    units: String(sale.units),
    revenue: String(sale.revenue),
  };
}

export default function SaleDialog({
  open,
  sale,
  platforms,
  onClose,
  onSubmit,
  onDelete,
}: {
  open: boolean;
  sale: Sale | null;
  platforms: string[];
  onClose: () => void;
  onSubmit: (data: Omit<Sale, "id" | "createdAt">) => void;
  onDelete?: (id: string) => void;
}) {
  const [d, setD] = useState<Draft>(() => toDraft(sale));

  useEffect(() => {
    setD(toDraft(sale));
  }, [sale, open]);

  if (!open) return null;

  const set = (p: Partial<Draft>) => setD((prev) => ({ ...prev, ...p }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!d.title.trim()) return;
    onSubmit({
      date: d.date,
      title: d.title.trim(),
      platform: d.platform.trim() || "Other",
      format: d.format,
      units: Number(d.units) || 0,
      revenue: Number(d.revenue) || 0,
    });
  }

  return (
    <Dialog open={open} onClose={onClose}>
      <h2 className="mb-4 pr-6 text-lg font-semibold">
        {sale ? "Edit sale" : "Add sale"}
      </h2>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium">Date</label>
            <Input
              type="date"
              value={d.date}
              onChange={(e) => set({ date: e.target.value })}
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Format</label>
            <select
              value={d.format}
              onChange={(e) => set({ format: e.target.value as SaleFormat })}
              className={selectClass}
            >
              {formats.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium">Title</label>
          <Input
            value={d.title}
            onChange={(e) => set({ title: e.target.value })}
            className="mt-1"
            placeholder="Book or product name"
          />
        </div>

        <div>
          <label className="text-sm font-medium">Platform</label>
          <Input
            list="sale-platforms"
            value={d.platform}
            onChange={(e) => set({ platform: e.target.value })}
            className="mt-1"
            placeholder="Amazon, Gumroad, ..."
          />
          <datalist id="sale-platforms">
            {platforms.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium">Units</label>
            <Input
              type="number"
              min="0"
              value={d.units}
              onChange={(e) => set({ units: e.target.value })}
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Revenue</label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={d.revenue}
              onChange={(e) => set({ revenue: e.target.value })}
              className="mt-1"
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          {sale && onDelete ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => onDelete(sale.id)}
              className="text-red-600 hover:bg-red-50 hover:text-red-700"
            >
              <Trash2 className="size-4" />
              Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">{sale ? "Save" : "Add"}</Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
