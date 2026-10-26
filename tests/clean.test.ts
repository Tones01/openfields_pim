import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cleanRow, gtinProblem, parsePotency, parseSize, productNameFromVariation, sizeTextFromVariation,
} from "../lib/clean.ts";
import { findHeaderRow, guessMapping } from "../lib/mapping.ts";
import { completeness, missingFields } from "../lib/fields.ts";

test("size text and product name from variation name", () => {
  const v = "OG Kush - Bonkers - Joints - 14 x 0.5g";
  assert.equal(productNameFromVariation(v), "OG Kush");
  assert.equal(sizeTextFromVariation(v), "14 x 0.5g");
  assert.equal(sizeTextFromVariation("Bacon CBD – Apothecary – Oils – 30mL"), "30mL");
});

test("parse sizes", () => {
  assert.deepEqual(parseSize("3.5g"), { units_per_pack: 1, unit_size: 3.5, unit_of_measure: "g" });
  assert.deepEqual(parseSize("14 x 0.5g"), { units_per_pack: 14, unit_size: 0.5, unit_of_measure: "g" });
  assert.deepEqual(parseSize("355mL"), { units_per_pack: 1, unit_size: 355, unit_of_measure: "mL" });
  assert.deepEqual(parseSize("5 x 2 x 5mg"), { units_per_pack: 10, unit_size: 5, unit_of_measure: "mg" });
  assert.equal(parseSize("5 Pack"), null);
});

test("potency ranges", () => {
  assert.deepEqual(parsePotency("22–26%"), { min: 22, max: 26, unit: "%" });
  assert.deepEqual(parsePotency("10mg"), { min: 10, max: null, unit: "mg" });
  assert.deepEqual(parsePotency(24.5), { min: 24.5, max: null, unit: null });
});

test("gtin check digit", () => {
  assert.equal(gtinProblem("036000291453"), "GTIN check digit doesn't match");
  assert.equal(gtinProblem("036000291452"), null);
  assert.match(gtinProblem("12345") ?? "", /8, 12, 13 or 14/);
});

test("clean a workbook row", () => {
  const { row, warnings } = cleanRow({
    item_number: " W4D62B06 ",
    variation_name: "OG Kush - Bonkers - Joints - 14 x 0.5g",
    status: "ACTIVE",
    gtin: "0 36000 29145 2",
    thc_min: "20-24%",
    tags: "Local, Craft, Local",
  });
  assert.equal(row.item_number, "W4D62B06");
  assert.equal(row.product_name, "OG Kush");
  assert.equal(row.status, "Active");
  assert.equal(row.gtin, "036000291452");
  assert.equal(row.units_per_pack, 14);
  assert.equal(row.unit_size, 0.5);
  assert.equal(row.thc_min, 20);
  assert.equal(row.thc_max, 24);
  assert.equal(row.thc_unit, "%");
  assert.deepEqual(row.tags, ["Local", "Craft"]);
  assert.deepEqual(warnings, []);
});

test("map the existing workbook headers", () => {
  const headers = ["Item Number", "Product Name", "Variation Name", "Category", "Subcategory", "Brand",
    "Licensed Producer", "LP Group", "Strain Type", "Status", "UPC", "Size Text", "Units Per Pack", "Unit Size",
    "Unit of Measure", "Total Pack Size", "Size Basis", "Pack Size Label", "Case Qty", "THC Min", "THC Max",
    "THC Unit", "THC Range", "CBD Min", "CBD Max", "CBD Unit", "CBD Range", "Size Check", "Long Description"];
  const m = guessMapping(headers);
  assert.deepEqual(m, ["item_number", "product_name", "variation_name", "category", "subcategory", "brand",
    "licensed_producer", "lp_group", "strain_type", "status", "gtin", "size_text", "units_per_pack", "unit_size",
    "unit_of_measure", "", "", "", "case_qty", "thc_min", "thc_max", "thc_unit", "", "cbd_min", "cbd_max",
    "cbd_unit", "", "", "description"]);
  const input = ["Item number", "Variation Name", "Licensed Producer Group", "Size"];
  assert.deepEqual(guessMapping(input), ["item_number", "variation_name", "lp_group", "size_text"]);
});

test("header row detection skips title rows", () => {
  assert.equal(findHeaderRow([["Product Catalogue"], ["Table: ..."], [], ["Item Number", "Product Name"]]), 3);
});

test("completeness skips potency for accessories", () => {
  const p = { item_number: "X", product_name: "Grinder", brand: "B", licensed_producer: "L", category: "Accessory",
    subcategory: "Tools", strain_type: "Accessory", gtin: "036000291452", unit_size: 1, case_qty: 6, description: "d" };
  assert.equal(completeness(p), 100);
  assert.equal(missingFields({ ...p, category: "Flower" }).length, 2);
});
