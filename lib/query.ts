// Filters shared by the catalogue grid and the Excel export, read from the URL.

import { MISSING_FILTERS, type FieldKey } from "./fields";

export interface Filters {
  q: string;
  status: string; // "Active" | "New" | "Delist" | "all"
  category: string;
  lp: string;
  brand: string;
  missing: string; // a FieldKey from MISSING_FILTERS, or ""
  sort: string; // "name" | "lp" | "updated" | "item" | "complete"
  page: number;
}

export const PAGE_SIZE = 100;

type Params = Record<string, string | string[] | undefined>;

function one(p: Params, k: string): string {
  const v = p[k];
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

export function readFilters(p: Params): Filters {
  const missing = one(p, "missing");
  return {
    q: one(p, "q"),
    status: one(p, "status") || "Active",
    category: one(p, "category"),
    lp: one(p, "lp"),
    brand: one(p, "brand"),
    missing: MISSING_FILTERS.some((m) => m.key === missing) ? missing : "",
    sort: ["name", "lp", "updated", "item"].includes(one(p, "sort")) ? one(p, "sort") : "lp",
    page: Math.max(1, Number(one(p, "page")) || 1),
  };
}

export function filtersToSearch(f: Partial<Filters>): string {
  const s = new URLSearchParams();
  if (f.q) s.set("q", f.q);
  if (f.status && f.status !== "Active") s.set("status", f.status);
  if (f.category) s.set("category", f.category);
  if (f.lp) s.set("lp", f.lp);
  if (f.brand) s.set("brand", f.brand);
  if (f.missing) s.set("missing", f.missing);
  if (f.sort && f.sort !== "lp") s.set("sort", f.sort);
  if (f.page && f.page > 1) s.set("page", String(f.page));
  const str = s.toString();
  return str ? `?${str}` : "";
}

// Minimal shape of the Supabase query builder methods we use
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Q = any;

export function applyFilters(query: Q, f: Filters): Q {
  if (f.q) {
    const term = f.q.replace(/[%,()*\\]/g, " ").trim();
    if (term) {
      query = query.or(
        ["product_name", "variation_name", "item_number", "gtin", "brand", "licensed_producer"]
          .map((c) => `${c}.ilike.%${term}%`)
          .join(","),
      );
    }
  }
  if (f.status !== "all") query = query.eq("status", f.status);
  if (f.category) query = query.eq("category", f.category);
  if (f.lp) query = query.eq("licensed_producer", f.lp);
  if (f.brand) query = query.eq("brand", f.brand);
  if (f.missing) query = query.is(f.missing as FieldKey, null);
  return query;
}

export function applySort(query: Q, f: Filters): Q {
  switch (f.sort) {
    case "name":
      return query.order("product_name", { ascending: true, nullsFirst: false }).order("item_number");
    case "updated":
      return query.order("updated_at", { ascending: false }).order("item_number");
    case "item":
      return query.order("item_number");
    default:
      return query
        .order("licensed_producer", { ascending: true, nullsFirst: false })
        .order("product_name", { ascending: true, nullsFirst: false })
        .order("item_number");
  }
}
