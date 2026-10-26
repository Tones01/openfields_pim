// One place that describes every product field: its label, type,
// which section it sits in, whether it counts toward completeness,
// and the column names a spreadsheet might use for it.

export type FieldKey =
  | "item_number"
  | "product_name"
  | "variation_name"
  | "category"
  | "subcategory"
  | "brand"
  | "licensed_producer"
  | "lp_group"
  | "strain_type"
  | "status"
  | "gtin"
  | "size_text"
  | "units_per_pack"
  | "unit_size"
  | "unit_of_measure"
  | "case_qty"
  | "thc_min"
  | "thc_max"
  | "thc_unit"
  | "cbd_min"
  | "cbd_max"
  | "cbd_unit"
  | "description"
  | "tags";

export type FieldType = "text" | "longtext" | "number" | "integer" | "choice" | "tags";

export type Section = "Identity" | "Classification" | "Size and packaging" | "Potency" | "Description";

export interface FieldDef {
  key: FieldKey;
  label: string;
  type: FieldType;
  section: Section;
  required?: boolean;
  choices?: readonly string[];
  /** Offer existing values as suggestions while typing */
  suggest?: boolean;
  /** Other column headers that mean this field (lower-case, compared loosely) */
  aliases?: string[];
}

export const STATUSES = ["New", "Active", "Delist"] as const;
export const UNITS_OF_MEASURE = ["g", "mg", "mL"] as const;
export const POTENCY_UNITS = ["%", "mg", "mg/g", "mg/mL"] as const;

export const FIELDS: FieldDef[] = [
  { key: "item_number", label: "Item Number", type: "text", section: "Identity", required: true,
    aliases: ["item number", "item no", "item #", "item", "itemnumber", "item_number", "sku", "item id"] },
  { key: "product_name", label: "Product Name", type: "text", section: "Identity", required: true,
    aliases: ["product name", "name", "product"] },
  { key: "variation_name", label: "Variation Name", type: "text", section: "Identity",
    aliases: ["variation name", "variation", "full name", "item name", "product description name"] },
  { key: "brand", label: "Brand", type: "text", section: "Identity", required: true, suggest: true,
    aliases: ["brand", "brand name"] },
  { key: "licensed_producer", label: "Licensed Producer", type: "text", section: "Identity", required: true, suggest: true,
    aliases: ["licensed producer", "lp", "producer", "supplier", "vendor", "lp name"] },
  { key: "lp_group", label: "LP Group", type: "text", section: "Identity", suggest: true,
    aliases: ["lp group", "licensed producer group", "producer group", "supplier group"] },
  { key: "status", label: "Status", type: "choice", section: "Identity", choices: STATUSES,
    aliases: ["status", "item status", "product status"] },
  { key: "gtin", label: "GTIN / UPC", type: "text", section: "Identity", required: true,
    aliases: ["gtin", "upc", "barcode", "upc / gtin", "gtin / upc", "upc code", "ean"] },

  { key: "category", label: "Category", type: "text", section: "Classification", required: true, suggest: true,
    aliases: ["category", "product category"] },
  { key: "subcategory", label: "Subcategory", type: "text", section: "Classification", required: true, suggest: true,
    aliases: ["subcategory", "sub category", "sub-category", "product type", "format"] },
  { key: "strain_type", label: "Strain Type", type: "text", section: "Classification", required: true, suggest: true,
    aliases: ["strain type", "strain", "plant type", "species"] },
  { key: "tags", label: "Tags", type: "tags", section: "Classification",
    aliases: ["tags", "tag"] },

  { key: "size_text", label: "Size Text", type: "text", section: "Size and packaging",
    aliases: ["size text", "size", "pack size", "package size", "format / size", "pack size label"] },
  { key: "units_per_pack", label: "Units Per Pack", type: "number", section: "Size and packaging",
    aliases: ["units per pack", "pack count", "units", "count"] },
  { key: "unit_size", label: "Unit Size", type: "number", section: "Size and packaging", required: true,
    aliases: ["unit size", "net weight per unit", "weight per unit"] },
  { key: "unit_of_measure", label: "Unit of Measure", type: "choice", section: "Size and packaging", choices: UNITS_OF_MEASURE,
    aliases: ["unit of measure", "uom", "unit"] },
  { key: "case_qty", label: "Case Qty", type: "integer", section: "Size and packaging", required: true,
    aliases: ["case qty", "case quantity", "units per case", "case pack", "case size", "order minimum", "sales order minimum"] },

  { key: "thc_min", label: "THC Min", type: "number", section: "Potency", required: true,
    aliases: ["thc min", "thc low", "min thc", "thc"] },
  { key: "thc_max", label: "THC Max", type: "number", section: "Potency",
    aliases: ["thc max", "thc high", "max thc"] },
  { key: "thc_unit", label: "THC Unit", type: "choice", section: "Potency", choices: POTENCY_UNITS,
    aliases: ["thc unit", "thc uom"] },
  { key: "cbd_min", label: "CBD Min", type: "number", section: "Potency", required: true,
    aliases: ["cbd min", "cbd low", "min cbd", "cbd"] },
  { key: "cbd_max", label: "CBD Max", type: "number", section: "Potency",
    aliases: ["cbd max", "cbd high", "max cbd"] },
  { key: "cbd_unit", label: "CBD Unit", type: "choice", section: "Potency", choices: POTENCY_UNITS,
    aliases: ["cbd unit", "cbd uom"] },

  { key: "description", label: "Description", type: "longtext", section: "Description", required: true,
    aliases: ["description", "long description", "product description", "short description", "copy"] },
];

export const FIELD_BY_KEY: Record<FieldKey, FieldDef> = Object.fromEntries(
  FIELDS.map((f) => [f.key, f]),
) as Record<FieldKey, FieldDef>;

export const SECTIONS: Section[] = ["Identity", "Classification", "Size and packaging", "Potency", "Description"];

/** Categories that don't need potency (THC/CBD) to count as complete */
const NO_POTENCY_CATEGORIES = ["accessory", "accessories", "cultivation"];

export type ProductRow = Partial<Record<FieldKey, unknown>> & {
  item_number: string;
  updated_at?: string;
  updated_by?: string | null;
  created_at?: string;
  created_by?: string | null;
};

function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

export function requiredFieldsFor(p: Partial<Record<FieldKey, unknown>>): FieldDef[] {
  const cat = String(p.category ?? "").toLowerCase();
  const skipPotency = NO_POTENCY_CATEGORIES.includes(cat);
  return FIELDS.filter((f) => f.required && !(skipPotency && f.section === "Potency"));
}

export function missingFields(p: Partial<Record<FieldKey, unknown>>): FieldDef[] {
  return requiredFieldsFor(p).filter((f) => isEmpty(p[f.key]));
}

export function completeness(p: Partial<Record<FieldKey, unknown>>): number {
  const req = requiredFieldsFor(p);
  if (req.length === 0) return 100;
  const filled = req.filter((f) => !isEmpty(p[f.key])).length;
  return Math.round((filled / req.length) * 100);
}

/** Fields you can filter on with "Missing ..." in the catalogue */
export const MISSING_FILTERS: { key: FieldKey; label: string }[] = [
  { key: "gtin", label: "GTIN / UPC" },
  { key: "case_qty", label: "Case Qty" },
  { key: "thc_min", label: "THC" },
  { key: "cbd_min", label: "CBD" },
  { key: "description", label: "Description" },
  { key: "unit_size", label: "Size" },
  { key: "brand", label: "Brand" },
  { key: "strain_type", label: "Strain Type" },
];

export const PRODUCT_COLUMNS = ["item_number", ...FIELDS.filter((f) => f.key !== "item_number").map((f) => f.key)];
