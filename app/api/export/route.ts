import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMe } from "@/lib/auth";
import { applyFilters, applySort, readFilters } from "@/lib/query";
import { productsWorkbook, xlsxResponse } from "@/lib/excel";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const me = await getMe();
  if (!me) return new Response("Not signed in", { status: 401 });
  const f = readFilters(Object.fromEntries(request.nextUrl.searchParams));
  const supabase = await createClient();

  const rows: Record<string, unknown>[] = [];
  const PAGE = 1000;
  for (let from = 0; from < 50000; from += PAGE) {
    const q = applySort(applyFilters(supabase.from("products").select("*"), f), f).range(from, from + PAGE - 1);
    const { data, error } = await q;
    if (error) return new Response(error.message, { status: 500 });
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }

  const buf = await productsWorkbook(rows, { sheetName: "Products", withMeta: true });
  const stamp = new Date().toISOString().slice(0, 10);
  return xlsxResponse(buf, `OFD products ${stamp}.xlsx`);
}
