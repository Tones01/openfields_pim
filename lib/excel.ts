import ExcelJS from "exceljs";
import { FIELDS } from "./fields";

const FOREST = "FF0D211B";
const IVORY = "FFF6F2E9";

export async function productsWorkbook(rows: Record<string, unknown>[], opts: { sheetName: string; withMeta: boolean }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Open Fields PIM";
  const ws = wb.addWorksheet(opts.sheetName, { views: [{ state: "frozen", ySplit: 1 }] });
  const cols = [
    ...FIELDS.map((f) => ({ header: f.label, key: f.key, width: f.type === "longtext" ? 60 : Math.max(12, f.label.length + 4) })),
    ...(opts.withMeta
      ? [
          { header: "Last Changed", key: "updated_at", width: 20 },
          { header: "Changed By", key: "updated_by", width: 26 },
        ]
      : []),
  ];
  ws.columns = cols;
  for (const r of rows) {
    ws.addRow({
      ...r,
      tags: Array.isArray(r.tags) ? (r.tags as string[]).join(", ") : r.tags,
      updated_at: r.updated_at ? new Date(String(r.updated_at)) : null,
    });
  }
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: IVORY } };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FOREST } };
  head.height = 20;
  ws.getColumn("gtin").numFmt = "@";
  ws.getColumn("item_number").numFmt = "@";
  if (opts.withMeta) ws.getColumn("updated_at").numFmt = "yyyy-mm-dd hh:mm";
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function xlsxResponse(buf: Buffer, filename: string) {
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
