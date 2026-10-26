import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireMember } from "@/lib/auth";
import { ProductForm } from "@/components/ProductForm";
import { FIELD_BY_KEY, type FieldKey } from "@/lib/fields";
import { logValue, timeAgo } from "@/components/bits";

export const dynamic = "force-dynamic";

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ item: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const me = await requireMember();
  const { item } = await params;
  const sp = await searchParams;
  const itemNumber = decodeURIComponent(item);
  const supabase = await createClient();

  const [{ data: product }, { data: options }, { data: log }] = await Promise.all([
    supabase.from("products").select("*").eq("item_number", itemNumber).maybeSingle(),
    supabase.rpc("field_options"),
    supabase
      .from("change_log")
      .select("id, changed_at, changed_by, action, field, old_value, new_value, source")
      .eq("item_number", itemNumber)
      .order("changed_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(40),
  ]);
  if (!product) notFound();

  const activity = (
    <div className="card">
      <h2>Activity</h2>
      {sp.created && <p className="notice ok">Product added.</p>}
      <ul className="activity">
        {(log ?? []).map((e) => (
          <li key={e.id}>
            <div>
              <strong>{e.changed_by.split("@")[0]}</strong>{" "}
              {e.action === "updated" ? (
                <>
                  changed <em>{FIELD_BY_KEY[e.field as FieldKey]?.label ?? e.field}</em>
                  <span className="change">
                    <s>{logValue(e.old_value)}</s> → {logValue(e.new_value)}
                  </span>
                </>
              ) : (
                e.action
              )}
            </div>
            <span className="muted small">
              {timeAgo(e.changed_at)}
              {e.source !== "app" ? ` · ${e.source}` : ""}
            </span>
          </li>
        ))}
        {(log ?? []).length === 0 && <li className="muted small">No changes yet.</li>}
      </ul>
      <Link href={`/activity?item=${encodeURIComponent(itemNumber)}`} className="small">
        Full history
      </Link>
    </div>
  );

  return (
    <ProductForm
      key={product.updated_at}
      product={product}
      options={(options ?? {}) as Record<string, string[]>}
      canEdit={me.canEdit}
      mode="edit"
      activity={activity}
    />
  );
}
