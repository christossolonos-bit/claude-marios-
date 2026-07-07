import { useCallback, useEffect, useState } from "react";
import { LineChart, Plus, Upload, ExternalLink, X } from "lucide-react";
import {
  type Sale,
  type SaleFormat,
  type Storefront,
  listSales,
  addSale,
  updateSale,
  deleteSale,
  listStorefronts,
  addStorefront,
  deleteStorefront,
  lastSixMonths,
  byPlatform,
  thisMonthRevenue,
  formatMoney,
} from "@/lib/sales";
import { getSettings } from "@/lib/settings";
import { formatDateLabel } from "@/lib/date";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import SaleDialog from "@/components/SaleDialog";
import SalesChart from "@/components/SalesChart";

function openExternal(url: string) {
  const full = /^https?:\/\//.test(url) ? url : `https://${url}`;
  const w = window as unknown as { __TAURI__?: unknown };
  if (w.__TAURI__) {
    import("@tauri-apps/plugin-opener")
      .then((m) => m.openUrl(full))
      .catch(() => window.open(full, "_blank", "noopener"));
  } else {
    window.open(full, "_blank", "noopener");
  }
}

function parseCsv(text: string): Omit<Sale, "id" | "createdAt">[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return [];
  const out: Omit<Sale, "id" | "createdAt">[] = [];
  const first = lines[0].toLowerCase();
  const start = first.includes("date") && first.includes("title") ? 1 : 0;
  const valid: SaleFormat[] = ["ebook", "paperback", "audio", "other"];
  for (let i = start; i < lines.length; i++) {
    const cols = lines[i]
      .split(",")
      .map((c) => c.trim().replace(/^"|"$/g, ""));
    const [date, title, platform, format, units, revenue] = cols;
    if (!date || !title) continue;
    const fmt = valid.includes((format ?? "").toLowerCase() as SaleFormat)
      ? ((format as string).toLowerCase() as SaleFormat)
      : "ebook";
    out.push({
      date,
      title,
      platform: platform || "Other",
      format: fmt,
      units: Number(units) || 0,
      revenue: Number(revenue) || 0,
    });
  }
  return out;
}

export default function Sales() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [stores, setStores] = useState<Storefront[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Sale | null>(null);
  const [storeName, setStoreName] = useState("");
  const [storeUrl, setStoreUrl] = useState("");
  const currency = getSettings().currency;

  const refresh = useCallback(async () => {
    const [s, st] = await Promise.all([listSales(), listStorefronts()]);
    setSales(s);
    setStores(st);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function openAdd() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(s: Sale) {
    setEditing(s);
    setDialogOpen(true);
  }

  async function submitSale(data: Omit<Sale, "id" | "createdAt">) {
    if (editing) await updateSale(editing.id, data);
    else await addSale(data);
    setDialogOpen(false);
    refresh();
  }

  async function removeSale(id: string) {
    await deleteSale(id);
    setDialogOpen(false);
    refresh();
  }

  async function handleAddStore(e: React.FormEvent) {
    e.preventDefault();
    if (!storeName.trim() || !storeUrl.trim()) return;
    await addStorefront(storeName.trim(), storeUrl.trim());
    setStoreName("");
    setStoreUrl("");
    refresh();
  }

  function onCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const rows = parseCsv(String(reader.result));
      for (const r of rows) await addSale(r);
      refresh();
    };
    reader.readAsText(f);
    e.target.value = "";
  }

  const totalRevenue = sales.reduce((a, s) => a + s.revenue, 0);
  const totalUnits = sales.reduce((a, s) => a + s.units, 0);
  const months = lastSixMonths(sales);
  const platforms = byPlatform(sales);
  const platformNames = [...new Set(sales.map((s) => s.platform))];
  const recent = [...sales]
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
    .slice(0, 12);

  const stats = [
    { label: "Total revenue", value: formatMoney(totalRevenue, currency) },
    { label: "Units sold", value: String(totalUnits) },
    { label: "This month", value: formatMoney(thisMonthRevenue(sales), currency) },
    {
      label: "Avg / sale",
      value: formatMoney(sales.length ? totalRevenue / sales.length : 0, currency),
    },
  ];

  return (
    <div className="mx-auto max-w-5xl p-8">
      <div className="mb-1 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <LineChart className="size-7 text-primary" />
          <h1 className="text-2xl font-semibold tracking-tight">Sales</h1>
        </div>
        <div className="flex gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent">
            <Upload className="size-4" />
            Import CSV
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={onCsv}
              className="hidden"
            />
          </label>
          <Button onClick={openAdd}>
            <Plus className="size-4" />
            Add sale
          </Button>
        </div>
      </div>
      <p className="mb-6 text-muted-foreground">
        Track how your book is selling across every platform.
      </p>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">{s.label}</div>
              <div className="mt-2 text-2xl font-semibold">{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Revenue</CardTitle>
          <CardDescription>Last 6 months</CardDescription>
        </CardHeader>
        <CardContent>
          <SalesChart data={months} currency={currency} />
        </CardContent>
      </Card>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>By platform</CardTitle>
            <CardDescription>Where sales come from</CardDescription>
          </CardHeader>
          <CardContent>
            {platforms.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sales yet.</p>
            ) : (
              <div className="space-y-3">
                {platforms.map((p) => {
                  const share = totalRevenue
                    ? Math.round((p.revenue / totalRevenue) * 100)
                    : 0;
                  return (
                    <div key={p.platform}>
                      <div className="mb-1 flex justify-between text-sm">
                        <span>{p.platform}</span>
                        <span className="text-muted-foreground">
                          {formatMoney(p.revenue, currency)} · {p.units} units
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${share}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Storefronts</CardTitle>
            <CardDescription>Quick links to your stores</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {stores.length > 0 && (
              <div className="space-y-2">
                {stores.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
                  >
                    <button
                      onClick={() => openExternal(s.url)}
                      className="flex items-center gap-2 font-medium hover:underline"
                    >
                      <ExternalLink className="size-4 text-muted-foreground" />
                      {s.name}
                    </button>
                    <button
                      onClick={() => deleteStorefront(s.id).then(refresh)}
                      aria-label="Remove"
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <form onSubmit={handleAddStore} className="flex gap-2">
              <Input
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                placeholder="Name"
                className="w-1/3"
              />
              <Input
                value={storeUrl}
                onChange={(e) => setStoreUrl(e.target.value)}
                placeholder="https://..."
              />
              <Button type="submit" variant="outline" size="icon">
                <Plus className="size-4" />
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent sales</CardTitle>
          <CardDescription>Click a row to edit</CardDescription>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No sales recorded yet. Add one manually or import a CSV
              (columns: date, title, platform, format, units, revenue).
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="pb-2 font-medium">Date</th>
                    <th className="pb-2 font-medium">Title</th>
                    <th className="pb-2 font-medium">Platform</th>
                    <th className="pb-2 text-right font-medium">Units</th>
                    <th className="pb-2 text-right font-medium">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((s) => (
                    <tr
                      key={s.id}
                      onClick={() => openEdit(s)}
                      className="cursor-pointer border-b border-border last:border-0 hover:bg-accent/50"
                    >
                      <td className="py-2 text-muted-foreground">
                        {formatDateLabel(s.date)}
                      </td>
                      <td className="py-2">{s.title}</td>
                      <td className="py-2 text-muted-foreground">
                        {s.platform}
                      </td>
                      <td className="py-2 text-right">{s.units}</td>
                      <td className="py-2 text-right font-medium">
                        {formatMoney(s.revenue, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <SaleDialog
        open={dialogOpen}
        sale={editing}
        platforms={platformNames}
        onClose={() => setDialogOpen(false)}
        onSubmit={submitSale}
        onDelete={removeSale}
      />
    </div>
  );
}
