import { FIELDS, type FieldKey } from "./fields.ts";
import { headerKey } from "./clean.ts";

/** Columns from the old workbook that are worked out by the PIM, so we skip them */
const IGNORE_HEADERS = new Set(
  ["total pack size", "size basis", "thc range", "cbd range", "size check", "pack size label"].map(headerKey),
);

/** Guess which product field each spreadsheet column is. Each field is used at most once. */
export function guessMapping(headers: string[]): (FieldKey | "")[] {
  const used = new Set<FieldKey>();
  const lookup = new Map<string, FieldKey>();
  for (const f of FIELDS) {
    lookup.set(headerKey(f.label), f.key);
    lookup.set(headerKey(f.key), f.key);
    for (const a of f.aliases ?? []) if (!lookup.has(headerKey(a))) lookup.set(headerKey(a), f.key);
  }
  return headers.map((h) => {
    const k = headerKey(h);
    if (!k || IGNORE_HEADERS.has(k)) return "";
    const f = lookup.get(k);
    if (f && !used.has(f)) {
      used.add(f);
      return f;
    }
    return "";
  });
}

/** Find the header row: the first of the top 15 rows with an item-number-like column */
export function findHeaderRow(rows: unknown[][]): number {
  const itemAliases = new Set(
    (FIELDS.find((f) => f.key === "item_number")!.aliases ?? []).concat("item number").map(headerKey),
  );
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    if ((rows[i] ?? []).some((c) => typeof c === "string" && itemAliases.has(headerKey(c)))) return i;
  }
  return 0;
}
