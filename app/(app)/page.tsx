import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireMember } from "@/lib/auth";
import { applyFilters, applySort, filtersToSearch, PAGE_SIZE, readFilters } from "@/lib/query";
import { completeness, MISSING_FILTERS, STATUSES } from "@/lib/fields";
import { packLabel, potencyLabel } from "@/lib/clean";
import { CompleteBar, StatusPill } from "@/components/bits";

export const dynamic = "force-dynamic";

const LIST_COLUMNS =
  "item_number, product_name, variation_name, category, subcategory, brand, licensed_producer, strain_type, status, gtin, units_per_pack, unit_size, unit_of_measure, case_qty, thc_min, thc_max, thc_unit, cbd_min, cbd_max, cbd_unit, description, updated_at";

export default async function CataloguePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const me = await requireMember();
  const f = readFilters(await searchParams);
  const supabase = await createClient();

  const from = (f.page - 1) * PAGE_SIZE;
  let query = supabase.from("products").select(LIST_COLUMNS, { count: "exact" });
  query = applySort(applyFilters(query, f), f).range(from, from + PAGE_SIZE - 1);

  const [{ data: rows, count, error }, { data: options }, statusCounts] = await Promise.all([
    query,
    supabase.rpc("field_options"),
    Promise.all(
      STATUSES.map(async (s) => {
        const { count } = await supabase.from("products").select("item_number", { count: "exact", head: true }).eq("status", s);
        return [s, count ?? 0] as const;
      }),
    ),
  ]);

  const opts = (options ?? {}) as Record<string, string[]>;
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const counts = Object.fromEntries(statusCounts) as Record<string, number>;
  const anyFilter = f.q || f.category || f.lp || f.brand || f.missing || f.status !== "Active";

  return (
    <main className="catalogue">
      <form className="toolbar" method="get">
        <div className="toolbar-group">
          <select name="status" defaultValue={f.status} aria-label="Status">
            <option value="Active">Active ({counts.Active ?? 0})</option>
            <option value="New">New ({counts.New ?? 0})</option>
            <option value="Delist">Delist ({counts.Delist ?? 0})</option>
            <option value="all">All statuses</option>
          </select>
          <select name="category" defaultValue={f.category} aria-label="Category">
            <option value="">All categories</option>
            {(opts.category ?? []).map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select name="lp" defaultValue={f.lp} aria-label="Licensed producer" className="wide">
            <option value="">All producers</option>
            {(opts.licensed_producer ?? []).map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select name="brand" defaultValue={f.brand} aria-label="Brand">
            <option value="">All brands</option>
            {(opts.brand ?? []).map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select name="missing" defaultValue={f.missing} aria-label="Missing field">
            <option value="">Any completeness</option>
            {MISSING_FILTERS.map((m) => (
              <option key={m.key} value={m.key}>
                Missing {m.label}
              </option>
            ))}
          </select>
          <select name="sort" defaultValue={f.sort} aria-label="Sort">
            <option value="lp">Sort: Producer</option>
            <option value="name">Sort: Name</option>
            <option value="updated">Sort: Recently changed</option>
            <option value="item">Sort: Item number</option>
          </select>
        </div>
        <div className="toolbar-group">
          <input type="search" name="q" defaultValue={f.q} placeholder="Search name, item number, GTIN" className="search" />
          <button className="btn sm">Apply</button>
          {anyFilter ? (
            <Link href="/" className="btn ghost sm">
              Clear
            </Link>
          ) : null}
          <a className="btn sm" href={`/api/export${filtersToSearch({ ...f, page: 1 })}`}>
            Export to Excel
          </a>
          {me.canEdit && (
            <Link href="/products/new" className="btn primary sm">
              + Add product
            </Link>
          )}
        </div>
      </form>

      {error && <p className="notice error">Couldn't load products: {error.message}</p>}

      <div className="grid-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th>Item #</th>
              <th>Product</th>
              <th>Producer</th>
              <th>Category</th>
              <th>Size</th>
              <th>GTIN</th>
              <th>THC / CBD</th>
              <th className="num">Case</th>
              <th>Status</th>
              <th>Complete</th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((r) => {
              const href = `/products/${encodeURIComponent(r.item_number)}`;
              const thc = potencyLabel(r.thc_min, r.thc_max, r.thc_unit);
              const cbd = potencyLabel(r.cbd_min, r.cbd_max, r.cbd_unit);
              return (
                <tr key={r.item_number}>
                  <td className="mono">
                    <Link href={href}>{r.item_number}</Link>
                  </td>
                  <td className="name">
                    <Link href={href}>{r.product_name || r.variation_name || "Untitled"}</Link>
                    <span className="sub">{r.brand}</span>
                  </td>
                  <td className="clip" title={r.licensed_producer ?? ""}>{r.licensed_producer}</td>
                  <td>
                    {r.category}
                    <span className="sub">{r.subcategory}</span>
                  </td>
                  <td>{packLabel(r)}</td>
                  <td className="mono">{r.gtin ?? <span className="gap">None</span>}</td>
                  <td>{thc || cbd ? `${thc || "–"} / ${cbd || "–"}` : <span className="gap">None</span>}</td>
                  <td className="num">{r.case_qty ?? <span className="gap">–</span>}</td>
                  <td>
                    <StatusPill status={r.status} />
                  </td>
                  <td>
                    <CompleteBar pct={completeness(r)} />
                  </td>
                </tr>
              );
            })}
            {rows && rows.length === 0 && (
              <tr>
                <td colSpan={10} className="empty">
                  {total === 0 && !anyFilter ? (
                    <>
                      No products yet.{" "}
                      {me.canEdit ? <Link href="/upload">Upload your product list</Link> : "Ask an editor to upload the product list."}
                    </>
                  ) : (
                    "No products match these filters."
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <footer className="statusbar">
        <span>
          {total.toLocaleString()} product{total === 1 ? "" : "s"}
          {pages > 1 ? ` · page ${f.page} of ${pages}` : ""}
        </span>
        <span className="pager">
          {f.page > 1 && (
            <Link className="btn ghost sm" href={`/${filtersToSearch({ ...f, page: f.page - 1 })}`}>
              ← Previous
            </Link>
          )}
          {f.page < pages && (
            <Link className="btn ghost sm" href={`/${filtersToSearch({ ...f, page: f.page + 1 })}`}>
              Next →
            </Link>
          )}
        </span>
      </footer>
    </main>
  );
}
