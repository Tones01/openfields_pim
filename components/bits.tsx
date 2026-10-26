export function StatusPill({ status }: { status: string | null | undefined }) {
  const s = status ?? "New";
  return (
    <span className={`pill pill-${s.toLowerCase()}`}>
      <span className="dot" />
      {s}
    </span>
  );
}

export function CompleteBar({ pct }: { pct: number }) {
  const tone = pct === 100 ? "full" : pct >= 85 ? "mid" : "low";
  return (
    <span className={`complete ${tone}`} title={`${pct}% of required fields filled`}>
      <span className="bar">
        <span style={{ width: `${pct}%` }} />
      </span>
      <span className="pct">{pct}%</span>
    </span>
  );
}

export function timeAgo(iso: string): string {
  const d = new Date(iso);
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.round(s / 86400)} d ago`;
  return d.toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });
}

/** Show a change-log value in plain words ("[\"Local\",\"Craft\"]" -> "Local, Craft") */
export function logValue(v: string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "blank";
  if (v.startsWith("[")) {
    try {
      const arr = JSON.parse(v);
      if (Array.isArray(arr)) return arr.length ? arr.join(", ") : "blank";
    } catch {
      /* not JSON */
    }
  }
  return v;
}
