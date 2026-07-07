// Sales + storefront data layer (localStorage, async — swap-ready for SQLite).

import { todayISO } from "@/lib/date";

export type SaleFormat = "ebook" | "paperback" | "audio" | "other";

export interface Sale {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  platform: string;
  format: SaleFormat;
  units: number;
  revenue: number;
  createdAt: number;
}

export interface Storefront {
  id: string;
  name: string;
  url: string;
}

const SALES_KEY = "authorhub.sales.v1";
const STORE_KEY = "authorhub.storefronts.v1";

function readSales(): Sale[] {
  try {
    const raw = localStorage.getItem(SALES_KEY);
    return raw ? (JSON.parse(raw) as Sale[]) : [];
  } catch {
    return [];
  }
}

function writeSales(sales: Sale[]): void {
  localStorage.setItem(SALES_KEY, JSON.stringify(sales));
}

export async function listSales(): Promise<Sale[]> {
  return readSales();
}

export async function addSale(
  data: Omit<Sale, "id" | "createdAt">,
): Promise<Sale> {
  const sale: Sale = { ...data, id: crypto.randomUUID(), createdAt: Date.now() };
  const sales = readSales();
  sales.push(sale);
  writeSales(sales);
  return sale;
}

export async function updateSale(
  id: string,
  patch: Partial<Sale>,
): Promise<void> {
  writeSales(readSales().map((s) => (s.id === id ? { ...s, ...patch } : s)));
}

export async function deleteSale(id: string): Promise<void> {
  writeSales(readSales().filter((s) => s.id !== id));
}

function readStores(): Storefront[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as Storefront[]) : [];
  } catch {
    return [];
  }
}

function writeStores(stores: Storefront[]): void {
  localStorage.setItem(STORE_KEY, JSON.stringify(stores));
}

export async function listStorefronts(): Promise<Storefront[]> {
  return readStores();
}

export async function addStorefront(
  name: string,
  url: string,
): Promise<Storefront> {
  const store: Storefront = { id: crypto.randomUUID(), name, url };
  const stores = readStores();
  stores.push(store);
  writeStores(stores);
  return store;
}

export async function deleteStorefront(id: string): Promise<void> {
  writeStores(readStores().filter((s) => s.id !== id));
}

// --- aggregation helpers ---

export function formatMoney(n: number, currency: string): string {
  return `${currency}${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function lastSixMonths(
  sales: Sale[],
): { month: string; label: string; revenue: number }[] {
  const now = new Date();
  const out: { month: string; label: string; revenue: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString(undefined, { month: "short" });
    const revenue = sales
      .filter((s) => s.date.startsWith(key))
      .reduce((a, s) => a + s.revenue, 0);
    out.push({ month: key, label, revenue });
  }
  return out;
}

export function byPlatform(
  sales: Sale[],
): { platform: string; revenue: number; units: number }[] {
  const map = new Map<string, { revenue: number; units: number }>();
  for (const s of sales) {
    const cur = map.get(s.platform) ?? { revenue: 0, units: 0 };
    cur.revenue += s.revenue;
    cur.units += s.units;
    map.set(s.platform, cur);
  }
  return [...map.entries()]
    .map(([platform, v]) => ({ platform, ...v }))
    .sort((a, b) => b.revenue - a.revenue);
}

export function thisMonthRevenue(sales: Sale[]): number {
  const key = todayISO().slice(0, 7);
  return sales
    .filter((s) => s.date.startsWith(key))
    .reduce((a, s) => a + s.revenue, 0);
}
