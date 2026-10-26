// Turning messy spreadsheet / form values into clean product values.
// Pure functions, no imports from React or Supabase, so they're easy to test.

import { FIELD_BY_KEY, type FieldKey, POTENCY_UNITS, STATUSES, UNITS_OF_MEASURE } from "./fields.ts";

export type Clean = Partial<Record<FieldKey, string | number | string[] | null>>;

/** The part of a Variation Name before the first " - " (matches the workbook's Product Name formula) */
export function productNameFromVariation(variation: string): string | null {
  const v = variation.trim();
  if (!v) return null;
  const i = v.indexOf(" - ");
  return (i === -1 ? v : v.slice(0, i)).trim() || null;
}

/** The part of a Variation Name after the last "-" (matches the workbook's Size Text formula) */
export function sizeTextFromVariation(variation: string): string | null {
  const v = variation.replace(/[–—]/g, "-").trim();
  if (!v) return null;
  const i = v.lastIndexOf("-");
  const out = (i === -1 ? v : v.slice(i + 1)).trim();
  return out || null;
}

export interface SizeParts {
  units_per_pack: number;
  unit_size: number;
  unit_of_measure: "g" | "mg" | "mL";
}

/**
 * Reads sizes like "3.5g", "14 x 0.5g", "10 x 10mg", "355mL", "5 x 2 x 5mg".
 * Units per pack = everything before the last "x" multiplied together.
 * Returns null when the text can't be read (e.g. "5 Pack").
 */
export function parseSize(sizeText: string | null | undefined): SizeParts | null {
  if (!sizeText) return null;
  const s = sizeText.toLowerCase().replace(/\s+/g, "").replace(/×/g, "x");
  const m = s.match(/^((?:\d*\.?\d+x)*)(\d*\.?\d+)(mg|ml|g)$/);
  if (!m) return null;
  const packs = m[1] ? m[1].split("x").filter(Boolean).map(Number) : [];
  const units = packs.reduce((a, b) => a * b, 1);
  const size = Number(m[2]);
  if (!isFinite(units) || !isFinite(size) || size <= 0 || units <= 0) return null;
  const uom = m[3] === "ml" ? "mL" : (m[3] as "g" | "mg");
  return { units_per_pack: units, unit_size: size, unit_of_measure: uom };
}

export function packLabel(p: { units_per_pack?: unknown; unit_size?: unknown; unit_of_measure?: unknown }): string {
  const u = Number(p.units_per_pack);
  const s = p.unit_size;
  const uom = p.unit_of_measure ?? "";
  if (s === null || s === undefined || s === "") return "";
  return u > 1 ? `${u} x ${s}${uom}` : `${s}${uom}`;
}

export function potencyLabel(min: unknown, max: unknown, unit: unknown): string {
  if (min === null || min === undefined || min === "") return "";
  const u = unit ? String(unit) : "";
  const range = max !== null && max !== undefined && max !== "" && Number(max) > Number(min) ? `${min}–${max}` : `${min}`;
  return u === "%" ? `${range}%` : u ? `${range} ${u}` : range;
}

function toText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/ /g, " ").trim();
  return s === "" ? null : s;
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number") return isFinite(v) ? v : null;
  const s = toText(v);
  if (s === null) return null;
  const n = Number(s.replace(/[,%\s]/g, "").replace(/(mg\/ml|mg\/g|mg|ml|g)$/i, ""));
  return isFinite(n) ? n : null;
}

function matchChoice(v: string, choices: readonly string[]): string | null {
  const low = v.toLowerCase();
  return choices.find((c) => c.toLowerCase() === low) ?? null;
}

export function normalizeStatus(v: unknown): string | null {
  const s = toText(v)?.toLowerCase();
  if (!s) return null;
  if (["active", "a", "live", "selling"].includes(s)) return "Active";
  if (["delist", "delisted", "inactive", "discontinued", "d"].includes(s)) return "Delist";
  if (["new", "pending", "draft"].includes(s)) return "New";
  return null;
}

export function normalizeGtin(v: unknown): string | null {
  if (typeof v === "number") v = Math.round(v).toString();
  const s = toText(v);
  if (!s) return null;
  const digits = s.replace(/\D/g, "");
  return digits === "" ? null : digits;
}

/** GTINs are 8, 12, 13 or 14 digits and end in a check digit */
export function gtinProblem(gtin: string | null | undefined): string | null {
  if (!gtin) return null;
  if (![8, 12, 13, 14].includes(gtin.length)) return `GTIN should be 8, 12, 13 or 14 digits (has ${gtin.length})`;
  const digits = gtin.split("").map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  if ((10 - (sum % 10)) % 10 !== check) return "GTIN check digit doesn't match";
  return null;
}

/** "22-26%" -> {min: 22, max: 26, unit: "%"}; "10mg" -> {min: 10, unit: "mg"} */
export function parsePotency(v: unknown): { min: number | null; max: number | null; unit: string | null } {
  if (typeof v === "number") return { min: v, max: null, unit: null };
  const s = toText(v);
  if (!s) return { min: null, max: null, unit: null };
  const clean = s.replace(/[–—]/g, "-").replace(/\s+/g, "").toLowerCase();
  const m = clean.match(/^<?(\d*\.?\d+)(?:-(\d*\.?\d+))?(%|mg\/ml|mg\/g|mg)?$/);
  if (!m) return { min: toNumber(s), max: null, unit: null };
  const unitMap: Record<string, string> = { "%": "%", mg: "mg", "mg/g": "mg/g", "mg/ml": "mg/mL" };
  return { min: Number(m[1]), max: m[2] ? Number(m[2]) : null, unit: m[3] ? unitMap[m[3]] : null };
}

/** Clean one value for one field. Returns null for blanks or values that can't be read. */
export function cleanValue(key: FieldKey, raw: unknown): string | number | string[] | null {
  const def = FIELD_BY_KEY[key];
  switch (key) {
    case "status":
      return normalizeStatus(raw);
    case "gtin":
      return normalizeGtin(raw);
    case "unit_of_measure": {
      const s = toText(raw);
      return s ? matchChoice(s, UNITS_OF_MEASURE) : null;
    }
    case "thc_unit":
    case "cbd_unit": {
      const s = toText(raw);
      return s ? matchChoice(s, POTENCY_UNITS) : null;
    }
    case "tags": {
      if (Array.isArray(raw)) return raw.map((t) => String(t).trim()).filter(Boolean);
      const s = toText(raw);
      return s ? Array.from(new Set(s.split(/[,;|]/).map((t) => t.trim()).filter(Boolean))) : null;
    }
  }
  switch (def.type) {
    case "number":
      return toNumber(raw);
    case "integer": {
      const n = toNumber(raw);
      return n === null ? null : Math.round(n);
    }
    case "longtext":
      return toText(raw);
    default:
      // Short text: tidy repeated spaces ("Grape Escape  - 1Spliff" -> "Grape Escape - 1Spliff")
      return toText(raw)?.replace(/\s+/g, " ") ?? null;
  }
}

/**
 * Clean a whole row (keyed by field) and fill in what can be worked out:
 * product name and size from the Variation Name, size parts from Size Text,
 * min/max/unit from a potency range typed in one cell.
 */
export function cleanRow(input: Partial<Record<FieldKey, unknown>>): { row: Clean; warnings: string[]; derived: FieldKey[] } {
  const row: Clean = {};
  const warnings: string[] = [];
  const derived: FieldKey[] = [];

  for (const [k, v] of Object.entries(input) as [FieldKey, unknown][]) {
    if (k === "thc_min" || k === "cbd_min") {
      const p = parsePotency(v);
      if (p.min !== null) row[k] = p.min;
      const maxKey = k === "thc_min" ? "thc_max" : "cbd_max";
      const unitKey = k === "thc_min" ? "thc_unit" : "cbd_unit";
      if (p.max !== null && input[maxKey] === undefined) row[maxKey] = p.max;
      if (p.unit !== null && input[unitKey] === undefined) row[unitKey] = p.unit;
      continue;
    }
    const c = cleanValue(k, v);
    if (c !== null) row[k] = c;
    else if (k === "status" && toText(v)) warnings.push(`Status "${toText(v)}" not recognised, left as is`);
    else if (k === "unit_of_measure" && toText(v)) warnings.push(`Unit "${toText(v)}" not recognised`);
  }

  const variation = typeof row.variation_name === "string" ? row.variation_name : null;
  if (!row.product_name && variation) {
    row.product_name = productNameFromVariation(variation);
    derived.push("product_name");
  }
  if (!row.size_text && variation) {
    const st = sizeTextFromVariation(variation);
    if (st && parseSize(st)) {
      row.size_text = st;
      derived.push("size_text");
    }
  }
  if (typeof row.size_text === "string" && row.unit_size == null) {
    const parts = parseSize(row.size_text);
    if (parts) {
      if (row.units_per_pack == null) {
        row.units_per_pack = parts.units_per_pack;
        derived.push("units_per_pack");
      }
      row.unit_size = parts.unit_size;
      derived.push("unit_size");
      if (row.unit_of_measure == null) {
        row.unit_of_measure = parts.unit_of_measure;
        derived.push("unit_of_measure");
      }
    } else {
      warnings.push(`Couldn't read size "${row.size_text}"`);
    }
  }

  const g = gtinProblem(row.gtin as string | undefined);
  if (g) warnings.push(g);

  for (const [a, b] of [["thc_min", "thc_max"], ["cbd_min", "cbd_max"]] as const) {
    if (typeof row[a] === "number" && typeof row[b] === "number" && (row[b] as number) < (row[a] as number)) {
      warnings.push(`${a === "thc_min" ? "THC" : "CBD"} max is lower than min`);
    }
  }

  return { row, warnings, derived };
}

/** Loose header compare: "Item #" ~ "item no" ~ "ITEM_NUMBER" */
export function headerKey(h: string): string {
  return h.toLowerCase().replace(/[_\-./]+/g, " ").replace(/[^a-z0-9# ]/g, "").replace(/\s+/g, " ").trim();
}
