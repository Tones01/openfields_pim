"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { completeness, FIELDS, missingFields, SECTIONS, type FieldDef, type FieldKey } from "@/lib/fields";
import { parseSize, productNameFromVariation, sizeTextFromVariation } from "@/lib/clean";
import { createProduct, saveProduct } from "@/app/(app)/products/actions";

type Values = Record<FieldKey, string | string[]>;

function toFormValues(p: Record<string, unknown> | null): Values {
  const out = {} as Values;
  for (const f of FIELDS) {
    const v = p?.[f.key];
    if (f.type === "tags") out[f.key] = Array.isArray(v) ? (v as string[]) : [];
    else out[f.key] = v === null || v === undefined ? "" : String(v);
  }
  if (!p) out.status = "New";
  return out;
}

function same(a: string | string[], b: string | string[]) {
  return Array.isArray(a) && Array.isArray(b) ? a.join("\u0001") === b.join("\u0001") : a === b;
}

export function ProductForm({
  product,
  options,
  canEdit,
  mode,
  activity,
}: {
  product: Record<string, unknown> | null;
  options: Record<string, string[]>;
  canEdit: boolean;
  mode: "edit" | "new";
  activity?: React.ReactNode;
}) {
  const router = useRouter();
  const initial = useMemo(() => toFormValues(product), [product]);
  const [values, setValues] = useState<Values>(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [tagDraft, setTagDraft] = useState("");

  const changed = FIELDS.filter((f) => !same(values[f.key], initial[f.key])).map((f) => f.key);
  const dirty = changed.length > 0;
  const asProduct = Object.fromEntries(
    FIELDS.map((f) => [f.key, f.type === "tags" ? values[f.key] : (values[f.key] as string).trim() || null]),
  );
  const pct = completeness(asProduct);
  const missing = missingFields(asProduct);
  const missingKeys = new Set(missing.map((m) => m.key));

  const set = (k: FieldKey, v: string | string[]) => setValues((s) => ({ ...s, [k]: v }));

  function fillFromVariation() {
    const v = (values.variation_name as string).trim();
    if (!v) return;
    setValues((s) => {
      const next = { ...s };
      if (!(s.product_name as string).trim()) next.product_name = productNameFromVariation(v) ?? "";
      if (!(s.size_text as string).trim()) next.size_text = sizeTextFromVariation(v) ?? "";
      return next;
    });
  }

  function fillFromSize() {
    const parts = parseSize(values.size_text as string);
    if (!parts) {
      setMsg({ ok: false, text: `Couldn't read "${values.size_text}". Use a format like 3.5g, 10 x 0.5g or 355mL.` });
      return;
    }
    setValues((s) => ({
      ...s,
      units_per_pack: String(parts.units_per_pack),
      unit_size: String(parts.unit_size),
      unit_of_measure: parts.unit_of_measure,
    }));
  }

  function addTag(t: string) {
    const tag = t.trim();
    if (!tag) return;
    const cur = values.tags as string[];
    if (!cur.some((x) => x.toLowerCase() === tag.toLowerCase())) set("tags", [...cur, tag]);
    setTagDraft("");
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    start(async () => {
      if (mode === "new") {
        const res = await createProduct(asProduct);
        if (res.ok && res.item) {
          router.push(`/products/${encodeURIComponent(res.item)}?created=1`);
          return;
        }
        setMsg({ ok: res.ok, text: res.message });
      } else {
        const diff = Object.fromEntries(changed.map((k) => [k, values[k]]));
        const res = await saveProduct(String(product?.item_number), diff);
        setMsg({ ok: res.ok, text: res.message });
        if (res.ok) router.refresh();
      }
    });
  }

  function renderField(f: FieldDef) {
    const v = values[f.key];
    const req = missingKeys.has(f.key);
    const readOnly = !canEdit || (mode === "edit" && f.key === "item_number");
    const cls = `field${req ? " required-empty" : ""}${changed.includes(f.key) ? " changed" : ""}${
      f.type === "longtext" || f.type === "tags" ? " full" : ""
    }`;
    const placeholder = f.required ? "Required" : "Optional";
    const listId = f.suggest ? `opt-${f.key}` : undefined;

    let input: React.ReactNode;
    if (f.type === "longtext") {
      input = (
        <textarea rows={6} value={v as string} onChange={(e) => set(f.key, e.target.value)} readOnly={readOnly} placeholder={placeholder} />
      );
    } else if (f.type === "choice") {
      input = (
        <select value={v as string} onChange={(e) => set(f.key, e.target.value)} disabled={readOnly}>
          {f.key !== "status" && <option value="">{placeholder}</option>}
          {f.choices!.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      );
    } else if (f.type === "tags") {
      const tags = v as string[];
      input = (
        <div className="tags-input">
          {tags.map((t) => (
            <span key={t} className="chip">
              {t}
              {!readOnly && (
                <button type="button" aria-label={`Remove ${t}`} onClick={() => set("tags", tags.filter((x) => x !== t))}>
                  ×
                </button>
              )}
            </span>
          ))}
          {!readOnly && (
            <input
              value={tagDraft}
              list="opt-tags"
              placeholder="Add a tag and press Enter"
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addTag(tagDraft);
                }
              }}
              onBlur={() => addTag(tagDraft)}
            />
          )}
        </div>
      );
    } else {
      input = (
        <input
          value={v as string}
          onChange={(e) => set(f.key, e.target.value)}
          readOnly={readOnly}
          placeholder={placeholder}
          list={listId}
          inputMode={f.type === "number" || f.type === "integer" ? "decimal" : undefined}
          autoFocus={mode === "new" && f.key === "item_number"}
        />
      );
    }
    return (
      <label key={f.key} className={cls}>
        <span>
          {f.label}
          {f.required && <em className="req">required</em>}
        </span>
        {input}
      </label>
    );
  }

  const title = (values.product_name as string) || (values.variation_name as string) || (mode === "new" ? "New product" : "Untitled");

  return (
    <form onSubmit={submit} className="record">
      <div className="record-bar">
        <Link href="/" className="btn ghost sm">
          ← All products
        </Link>
        <span className="crumb">
          {(values.licensed_producer as string) || "No producer"} / <strong>{title}</strong>
        </span>
        <span className="spacer" />
        {msg && <span className={msg.ok ? "notice ok inline" : "notice error inline"}>{msg.text}</span>}
        {canEdit && (
          <button className="btn primary sm" disabled={pending || (mode === "edit" && !dirty)}>
            {pending ? "Saving…" : mode === "new" ? "Add product" : dirty ? `Save ${changed.length} change${changed.length === 1 ? "" : "s"}` : "Saved"}
          </button>
        )}
      </div>

      <div className="record-body">
        <div className="record-main">
          {SECTIONS.map((section) => {
            const fs = FIELDS.filter((f) => f.section === section);
            const req = fs.filter((f) => f.required);
            const filledReq = req.filter((f) => !missingKeys.has(f.key)).length;
            return (
              <section key={section} className="card">
                <header>
                  <h2>{section}</h2>
                  {req.length > 0 && (
                    <span className="muted small">
                      {filledReq} / {req.length} required
                    </span>
                  )}
                  {canEdit && section === "Identity" && (
                    <button type="button" className="btn ghost sm" onClick={fillFromVariation}>
                      Fill name and size from Variation Name
                    </button>
                  )}
                  {canEdit && section === "Size and packaging" && (
                    <button type="button" className="btn ghost sm" onClick={fillFromSize}>
                      Work out from Size Text
                    </button>
                  )}
                </header>
                <div className="fields">{fs.map(renderField)}</div>
              </section>
            );
          })}
        </div>
        <aside className="record-aside">
          <div className="card">
            <h2>Completeness</h2>
            <div className="big-pct">{pct}%</div>
            <div className={`bar wide ${pct === 100 ? "full" : pct >= 85 ? "mid" : "low"}`}>
              <span style={{ width: `${pct}%` }} />
            </div>
            {missing.length > 0 ? (
              <>
                <p className="muted small">Missing</p>
                <ul className="missing">
                  {missing.map((m) => (
                    <li key={m.key}>{m.label}</li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="muted small">All required fields are filled.</p>
            )}
          </div>
          {activity}
        </aside>
      </div>

      {Object.entries(options).map(([k, list]) => (
        <datalist key={k} id={`opt-${k}`}>
          {list.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      ))}
    </form>
  );
}
