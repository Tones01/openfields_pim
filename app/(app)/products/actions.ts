"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { cleanRow, cleanValue } from "@/lib/clean";
import { FIELD_BY_KEY, type FieldKey } from "@/lib/fields";

export type SaveResult = { ok: true; message: string; item?: string } | { ok: false; message: string };

function friendly(msg: string, code?: string): string {
  if (code === "23505") return "That item number already exists.";
  if (code === "42501" || /row-level security/i.test(msg)) return "You don't have edit access.";
  if (code === "23514") return "One of the values isn't allowed (check status, units and case qty).";
  return msg;
}

/** Save only the fields that changed. Blank means "clear this field". */
export async function saveProduct(itemNumber: string, changes: Record<string, unknown>): Promise<SaveResult> {
  const update: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(changes)) {
    if (!(k in FIELD_BY_KEY) || k === "item_number") continue;
    const key = k as FieldKey;
    const c = cleanValue(key, v);
    update[key] = key === "tags" ? c ?? [] : c;
  }
  if ("status" in update && !update.status) return { ok: false, message: "Status can't be blank." };
  if (Object.keys(update).length === 0) return { ok: true, message: "No changes to save." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("products").update(update).eq("item_number", itemNumber).select("item_number");
  if (error) return { ok: false, message: friendly(error.message, error.code) };
  if (!data || data.length === 0) return { ok: false, message: "Not saved. You may not have edit access." };
  revalidatePath(`/products/${encodeURIComponent(itemNumber)}`);
  return { ok: true, message: `Saved ${Object.keys(update).length} change${Object.keys(update).length === 1 ? "" : "s"}.` };
}

export async function createProduct(values: Record<string, unknown>): Promise<SaveResult> {
  const { row } = cleanRow(values as Partial<Record<FieldKey, unknown>>);
  const item = typeof row.item_number === "string" ? row.item_number : "";
  if (!item) return { ok: false, message: "Item number is required." };
  const supabase = await createClient();
  const { error } = await supabase.from("products").insert({ ...row, status: row.status ?? "New" });
  if (error) return { ok: false, message: friendly(error.message, error.code) };
  revalidatePath("/");
  return { ok: true, message: "Product added.", item };
}

export async function itemNumberExists(itemNumber: string): Promise<boolean> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("products")
    .select("item_number", { count: "exact", head: true })
    .eq("item_number", itemNumber.trim());
  return (count ?? 0) > 0;
}
