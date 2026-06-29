import type { PlanChange } from "@/lib/planner/plan-diff";

/**
 * Avviso "il piano è cambiato": lista seduta-per-seduta dei cambiamenti vs
 * l'ultimo piano inviato a Intervals. Server Component (dati già pronti dal
 * Server Component padre, nessuno stato). changes vuoto → render null.
 */

const DAY_LABEL: Record<PlanChange["day"], string> = {
  mon: "Lun",
  tue: "Mar",
  wed: "Mer",
  thu: "Gio",
  fri: "Ven",
  sat: "Sab",
  sun: "Dom",
};

export function PlanDiffNotice({ changes }: { changes: PlanChange[] }) {
  if (changes.length === 0) return null;

  const n = changes.length;
  return (
    <div className="min-w-0 rounded-[16px] border border-ready-modify-border bg-surface px-4 py-3">
      <div className="mb-2 break-words text-[10px] uppercase tracking-[0.14em] text-ready-modify">
        Il piano è cambiato: {n} sedut{n === 1 ? "a" : "e"} modificat
        {n === 1 ? "a" : "e"}
      </div>
      <ul className="space-y-2">
        {changes.map((c) => (
          <li key={c.date} className="break-words text-[13px] leading-relaxed">
            <span className="font-semibold text-foreground">
              {DAY_LABEL[c.day]}
            </span>{" "}
            <span className="text-secondary">
              {c.from} → {c.to}
            </span>
            <span className="block text-[12px] text-muted">{c.reason}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
