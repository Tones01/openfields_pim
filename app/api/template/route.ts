import { productsWorkbook, xlsxResponse } from "@/lib/excel";

export async function GET() {
  const buf = await productsWorkbook([], { sheetName: "Products", withMeta: false });
  return xlsxResponse(buf, "OFD PIM upload template.xlsx");
}
