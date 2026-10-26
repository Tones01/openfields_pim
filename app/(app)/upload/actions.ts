"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { PRODUCT_COLUMNS } from "@/lib/fields";

/** Which of these item numbers are already in the PIM */
export async function findExisting(items: string[]): Promise<string[]> {
  const supabase = await createClient();
  const found: string[] = [];
  for (let i = 0; i < items.length; i += 300) {
    const chunk = items.slice(i, i + 300);
    const { data, error } = await supabase.from("products").select("item_number").in("item_number", chunk);
    if (error) throw new Error(error.message);
    found.push(...(data ?? []).map((r) => r.item_number as string));
  }
  return found;
}

export async function importChunk(
  rows: Record<string, unknown>[],
  mode: "add_only" | "add_update",
): Promise<{ ok: true; inserted: number; updated: number } | { ok: false; message: string }> {
  const allowed = new Set(PRODUCT_COLUMNS);
  const clean = rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k, v]) => allowed.has(k) && v !== null && v !== "")));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("bulk_upsert_products", { rows: clean, mode });
  if (error) return { ok: false, message: error.message };
  const res = data as { inserted: number; updated: number };
  revalidatePath("/");
  return { ok: true, inserted: res.inserted, updated: res.updated };
}
