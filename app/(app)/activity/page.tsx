import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireMember } from "@/lib/auth";
import { FIELD_BY_KEY, type FieldKey } from "@/lib/fields";
import { logValue, timeAgo } from "@/components/bits";

export const dynamic = "force-dynamic";

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireMember();
  const sp = await searchParams;
  const supabase = await createClient();
  let q = supabase
    .from("change_log")
    .select("id, item_number, changed_at, changed_by, action, field, old_value, new_value, source")
    .order("changed_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(300);
  if (sp.item) q = q.eq("item_number", sp.item);
  if (sp.who) q = q.eq("changed_by", sp.who);
  const { data: log, error } = await q;

  return (
    <main className="page">
      <div className="page-head">
        <h1>Activity{sp.item ? ` for ${sp.item}` : ""}</h1>
        <p className="muted">Every change, newest first. {sp.item || sp.who ? <Link href="/activity">Show all</Link> : "Showing the latest 300."}</p>
      </div>
      {error && <p className="notice error">{error.message}</p>}
      <div className="grid-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th>When</th>
              <th>Who</th>
              <th>Item #</th>
              <th>What</th>
              <th>Before</th>
              <th>After</th>
              <th>How</th>
            </tr>
          </thead>
          <tbody>
            {(log ?? []).map((e) => (
              <tr key={e.id}>
                <td title={new Date(e.changed_at).toLocaleString("en-CA")}>{timeAgo(e.changed_at)}</td>
                <td>
                  <Link href={`/activity?who=${encodeURIComponent(e.changed_by)}`}>{e.changed_by}</Link>
                </td>
                <td className="mono">
                  <Link href={`/products/${encodeURIComponent(e.item_number)}`}>{e.item_number}</Link>
                </td>
                <td>{e.action === "updated" ? FIELD_BY_KEY[e.field as FieldKey]?.label ?? e.field : e.action}</td>
                <td className="clip muted" title={e.old_value ?? ""}>{e.old_value === null ? "" : logValue(e.old_value)}</td>
                <td className="clip" title={e.new_value ?? ""}>{e.new_value === null ? "" : logValue(e.new_value)}</td>
                <td className="muted">{e.source}</td>
              </tr>
            ))}
            {(log ?? []).length === 0 && (
              <tr>
                <td colSpan={7} className="empty">No activity yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
