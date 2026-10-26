"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import Papa from "papaparse";
import { FIELDS, type FieldKey } from "@/lib/fields";
import { cleanRow, type Clean } from "@/lib/clean";
import { findHeaderRow, guessMapping } from "@/lib/mapping";
import { findExisting, importChunk } from "@/app/(app)/upload/actions";

type Cell = string | number | boolean | null;
interface Sheet {
  name: string;
  rows: Cell[][];
}
interface Prepared {
  line: number; // spreadsheet row number, for people to find it
  row: Clean;
  warnings: string[];
  /** Values worked out (not typed in the file): only used for new products */
  derived: FieldKey[];
  error?: string;
  kind: "new" | "existing" | "skip";
}

const CHUNK = 250;

function cellToValue(v: unknown): Cell {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("result" in o) return cellToValue(o.result);
    if ("richText" in o && Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((t) => t.text).join("");
    if ("text" in o) return cellToValue(o.text);
    if ("error" in o) return null;
    return null;
  }
  return v as Cell;
}

async function readFile(file: File): Promise<Sheet[]> {
  if (/\.csv$|\.txt$/i.test(file.name)) {
    const text = await file.text();
    const parsed = Papa.parse<Cell[]>(text, { skipEmptyLines: false });
    return [{ name: file.name, rows: parsed.data }];
  }
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  return wb.worksheets
    .filter((ws) => ws.state !== "hidden" && ws.state !== "veryHidden")
    .map((ws) => {
      const rows: Cell[][] = [];
      ws.eachRow({ includeEmpty: true }, (row, n) => {
        const vals = (row.values as unknown[]).slice(1).map(cellToValue);
        rows[n - 1] = vals;
      });
      for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
      return { name: ws.name, rows };
    });
}

function hasData(r: Cell[]) {
  return r.some((c) => c !== null && String(c).trim() !== "");
}

export function BulkUpload() {
  const [fileName, setFileName] = useState("");
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [headerRow, setHeaderRow] = useState(0);
  const [mapping, setMapping] = useState<(FieldKey | "")[]>([]);
  const [step, setStep] = useState<"pick" | "map" | "preview" | "importing" | "done">("pick");
  const [prepared, setPrepared] = useState<Prepared[]>([]);
  const [mode, setMode] = useState<"add_only" | "add_update">("add_only");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, inserted: 0, updated: 0, failed: [] as string[] });

  const sheet = sheets[sheetIdx];
  const headers = useMemo(() => (sheet?.rows[headerRow] ?? []).map((h) => (h === null ? "" : String(h).trim())), [sheet, headerRow]);
  const dataRows = useMemo(
    () => (sheet ? sheet.rows.slice(headerRow + 1).map((r, i) => ({ r, line: headerRow + i + 2 })).filter((x) => hasData(x.r)) : []),
    [sheet, headerRow],
  );

  function chooseSheet(sheetsIn: Sheet[], idx: number) {
    const hr = findHeaderRow(sheetsIn[idx].rows);
    const hs = (sheetsIn[idx].rows[hr] ?? []).map((h) => (h === null ? "" : String(h)));
    setSheetIdx(idx);
    setHeaderRow(hr);
    setMapping(guessMapping(hs));
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      const s = await readFile(file);
      if (s.length === 0) throw new Error("No sheets found in that file.");
      // Prefer the first sheet that has an item number column
      let idx = s.findIndex((sh) => guessMapping((sh.rows[findHeaderRow(sh.rows)] ?? []).map((h) => String(h ?? ""))).includes("item_number"));
      if (idx < 0) idx = 0;
      setFileName(file.name);
      setSheets(s);
      chooseSheet(s, idx);
      setStep("map");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read that file.");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  function setMap(i: number, v: FieldKey | "") {
    setMapping((m) => m.map((x, j) => (j === i ? v : x === v && v !== "" ? "" : x)));
  }

  async function buildPreview() {
    setError("");
    if (!mapping.includes("item_number")) {
      setError("Pick which column holds the Item Number. Every product needs one.");
      return;
    }
    setBusy(true);
    try {
      const seen = new Set<string>();
      const out: Prepared[] = dataRows.map(({ r, line }) => {
        const raw: Partial<Record<FieldKey, unknown>> = {};
        mapping.forEach((k, i) => {
          if (k) raw[k] = r[i];
        });
        const { row, warnings, derived } = cleanRow(raw);
        const item = typeof row.item_number === "string" ? row.item_number : "";
        let errorMsg: string | undefined;
        if (!item) errorMsg = "No item number";
        else if (seen.has(item.toLowerCase())) errorMsg = "Item number appears earlier in the file";
        if (item) seen.add(item.toLowerCase());
        return { line, row, warnings, derived, error: errorMsg, kind: errorMsg ? "skip" : "new" };
      });
      const items = out.filter((p) => !p.error).map((p) => p.row.item_number as string);
      const existing = new Set(await findExisting(items));
      for (const p of out) if (!p.error && existing.has(p.row.item_number as string)) p.kind = "existing";
      setPrepared(out);
      setStep("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong checking the file.");
    } finally {
      setBusy(false);
    }
  }

  const counts = useMemo(() => {
    const c = { new: 0, existing: 0, skip: 0, warnings: 0 };
    for (const p of prepared) {
      c[p.kind]++;
      if (p.warnings.length) c.warnings++;
    }
    return c;
  }, [prepared]);

  async function runImport() {
    const toSend = prepared
      .filter((p) => p.kind === "new" || (mode === "add_update" && p.kind === "existing"))
      .map((p) =>
        p.kind === "existing" ? Object.fromEntries(Object.entries(p.row).filter(([k]) => !p.derived.includes(k as FieldKey))) : p.row,
      );
    setStep("importing");
    const prog = { done: 0, total: toSend.length, inserted: 0, updated: 0, failed: [] as string[] };
    setProgress({ ...prog });
    for (let i = 0; i < toSend.length; i += CHUNK) {
      const chunk = toSend.slice(i, i + CHUNK);
      const res = await importChunk(chunk as Record<string, unknown>[], mode);
      if (res.ok) {
        prog.inserted += res.inserted;
        prog.updated += res.updated;
      } else {
        prog.failed.push(`Rows ${i + 1}–${i + chunk.length}: ${res.message}`);
      }
      prog.done += chunk.length;
      setProgress({ ...prog, failed: [...prog.failed] });
    }
    setStep("done");
  }

  function reset() {
    setStep("pick");
    setSheets([]);
    setPrepared([]);
    setFileName("");
    setError("");
  }

  const mappedFields = new Set(mapping.filter(Boolean));
  const unmappedRequired = FIELDS.filter((f) => f.required && !mappedFields.has(f.key));

  return (
    <div className="upload">
      <ol className="steps">
        <li className={step === "pick" ? "on" : "past"}>1. Choose file</li>
        <li className={step === "map" ? "on" : step === "pick" ? "" : "past"}>2. Match columns</li>
        <li className={step === "preview" ? "on" : ["importing", "done"].includes(step) ? "past" : ""}>3. Check and import</li>
      </ol>

      {error && <p className="notice error">{error}</p>}

      {step === "pick" && (
        <div className="card drop">
          <label className="btn primary">
            {busy ? "Reading file…" : "Choose a spreadsheet"}
            <input type="file" accept=".xlsx,.csv" onChange={onFile} hidden disabled={busy} />
          </label>
          <p className="muted small">.xlsx or .csv. Big files (thousands of rows) take a few seconds to read.</p>
        </div>
      )}

      {step === "map" && sheet && (
        <div className="card">
          <header>
            <h2>{fileName}</h2>
            <span className="muted small">{dataRows.length.toLocaleString()} rows with data</span>
          </header>
          <div className="map-controls">
            {sheets.length > 1 && (
              <label className="field inline">
                <span>Sheet</span>
                <select value={sheetIdx} onChange={(e) => chooseSheet(sheets, Number(e.target.value))}>
                  {sheets.map((s, i) => (
                    <option key={s.name + i} value={i}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="field inline">
              <span>Header row</span>
              <input
                type="number"
                min={1}
                max={20}
                value={headerRow + 1}
                onChange={(e) => {
                  const hr = Math.max(0, Number(e.target.value) - 1);
                  setHeaderRow(hr);
                  setMapping(guessMapping((sheet.rows[hr] ?? []).map((h) => String(h ?? ""))));
                }}
              />
            </label>
          </div>
          <table className="grid map">
            <thead>
              <tr>
                <th>Column in your file</th>
                <th>Example</th>
                <th>Goes into</th>
              </tr>
            </thead>
            <tbody>
              {headers.map((h, i) => {
                const example = dataRows.find((d) => d.r[i] !== null && String(d.r[i]).trim() !== "")?.r[i];
                return (
                  <tr key={i} className={mapping[i] ? "" : "ignored"}>
                    <td>{h || <span className="muted">(no header)</span>}</td>
                    <td className="clip muted">{example === undefined ? "" : String(example)}</td>
                    <td>
                      <select value={mapping[i] ?? ""} onChange={(e) => setMap(i, e.target.value as FieldKey | "")}>
                        <option value="">Don't import</option>
                        {FIELDS.map((f) => (
                          <option key={f.key} value={f.key}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {unmappedRequired.length > 0 && (
            <p className="muted small">
              Not in this file (products will show these as missing): {unmappedRequired.map((f) => f.label).join(", ")}.
              {unmappedRequired.some((f) => ["product_name", "unit_size"].includes(f.key)) && mappedFields.has("variation_name")
                ? " Product name and size will be worked out from Variation Name where possible."
                : ""}
            </p>
          )}
          <div className="actions">
            <button className="btn ghost" onClick={reset}>
              Start over
            </button>
            <button className="btn primary" onClick={buildPreview} disabled={busy}>
              {busy ? "Checking…" : "Check rows"}
            </button>
          </div>
        </div>
      )}

      {step === "preview" && (
        <div className="card">
          <header>
            <h2>Check before importing</h2>
          </header>
          <div className="summary">
            <div>
              <strong>{counts.new.toLocaleString()}</strong>
              <span>new products</span>
            </div>
            <div>
              <strong>{counts.existing.toLocaleString()}</strong>
              <span>already in the PIM</span>
            </div>
            <div className={counts.skip ? "bad" : ""}>
              <strong>{counts.skip.toLocaleString()}</strong>
              <span>rows skipped</span>
            </div>
            <div className={counts.warnings ? "warn" : ""}>
              <strong>{counts.warnings.toLocaleString()}</strong>
              <span>rows with warnings</span>
            </div>
          </div>

          {counts.existing > 0 && (
            <fieldset className="mode">
              <legend>For the {counts.existing.toLocaleString()} products already in the PIM</legend>
              <label>
                <input type="radio" checked={mode === "add_only"} onChange={() => setMode("add_only")} /> Leave them as they are
              </label>
              <label>
                <input type="radio" checked={mode === "add_update"} onChange={() => setMode("add_update")} /> Update them with
                values from this file (blank cells are ignored)
              </label>
            </fieldset>
          )}

          <label className="small">
            <input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} /> Only show rows
            with problems
          </label>

          <div className="grid-wrap short">
            <table className="grid">
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Item #</th>
                  <th>Product</th>
                  <th>Will</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {prepared
                  .filter((p) => !onlyProblems || p.error || p.warnings.length)
                  .slice(0, 500)
                  .map((p) => (
                    <tr key={p.line}>
                      <td className="muted">{p.line}</td>
                      <td className="mono">{String(p.row.item_number ?? "")}</td>
                      <td className="clip">{String(p.row.product_name ?? p.row.variation_name ?? "")}</td>
                      <td>
                        {p.kind === "skip" ? (
                          <span className="tag bad">Skip</span>
                        ) : p.kind === "new" ? (
                          <span className="tag good">Add</span>
                        ) : mode === "add_update" ? (
                          <span className="tag">Update</span>
                        ) : (
                          <span className="tag muted">No change</span>
                        )}
                      </td>
                      <td className="small">{[p.error, ...p.warnings].filter(Boolean).join(" · ")}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <p className="muted small">Showing up to 500 rows. Warnings don't stop a row from importing.</p>
          <div className="actions">
            <button className="btn ghost" onClick={() => setStep("map")}>
              Back to columns
            </button>
            <button
              className="btn primary"
              onClick={runImport}
              disabled={counts.new + (mode === "add_update" ? counts.existing : 0) === 0}
            >
              Import {(counts.new + (mode === "add_update" ? counts.existing : 0)).toLocaleString()} rows
            </button>
          </div>
        </div>
      )}

      {(step === "importing" || step === "done") && (
        <div className="card">
          <header>
            <h2>{step === "importing" ? "Importing…" : "Import finished"}</h2>
          </header>
          <div className="bar wide full">
            <span style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 100}%` }} />
          </div>
          <p>
            {progress.done.toLocaleString()} of {progress.total.toLocaleString()} rows sent · {progress.inserted.toLocaleString()}{" "}
            added · {progress.updated.toLocaleString()} updated
          </p>
          {progress.failed.length > 0 && (
            <div className="notice error">
              <p>Some rows didn't import:</p>
              <ul>
                {progress.failed.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
          )}
          {step === "done" && (
            <div className="actions">
              <button className="btn ghost" onClick={reset}>
                Upload another file
              </button>
              <Link className="btn primary" href="/?sort=updated&status=all">
                See the products
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
