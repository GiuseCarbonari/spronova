import Link from "next/link";

type SessionKind = "hard" | "easy" | "rest";

const KIND_COPY: Record<SessionKind, { label: string; chipBg: string; chipText: string; border: string }> = {
  hard: {
    label: "Duro",
    chipBg: "bg-ready-skip/[0.16]",
    chipText: "text-ready-skip",
    border: "border-ready-skip-border",
  },
  easy: {
    label: "Facile",
    chipBg: "bg-accent2-dim",
    chipText: "text-accent2-hover",
    border: "border-accent2/40",
  },
  rest: {
    label: "Riposo",
    chipBg: "bg-surface-2",
    chipText: "text-muted",
    border: "border-border",
  },
};

/** Minuti → "1h 05′" / "45′". */
function formatMinutes(min: number | null): string {
  if (min == null) return "—";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${m.toString().padStart(2, "0")}′` : `${m}′`;
}

export function TodaySessionCard({
  title,
  isHard,
  rest,
  durationMin,
  zone,
  structure,
}: {
  title: string;
  isHard: boolean;
  rest: boolean;
  durationMin: number | null;
  zone: string | null;
  structure: string | null;
}) {
  const kind: SessionKind = rest ? "rest" : isHard ? "hard" : "easy";
  const copy = KIND_COPY[kind];

  return (
    <div id="tour-session" className={`rounded-[18px] border bg-gradient-to-br from-brand/[0.16] to-surface-2/60 p-[18px] ${copy.border}`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.14em] text-brand-hover">
          Seduta di oggi
        </span>
        <span className={`rounded-full px-2.5 py-1 text-[11px] ${copy.chipBg} ${copy.chipText}`}>
          {copy.label}
          {zone ? ` · ${zone}` : ""}
        </span>
      </div>

      <div className="mt-2.5 font-serif text-[22px] leading-tight text-foreground">{title}</div>

      <div className="mt-3 flex flex-wrap gap-4 text-[12.5px] text-secondary">
        <span>⏱ {formatMinutes(durationMin)}</span>
        {zone && <span>♥ {zone}</span>}
      </div>

      {structure && (
        <p className="mt-3 text-[12.5px] leading-relaxed text-secondary">{structure}</p>
      )}

      {!rest && (
        <Link
          href="/plan"
          className="mt-4 block w-full rounded-xl border border-brand/50 bg-brand-dim px-4 py-2.5 text-center text-[13px] font-semibold text-brand-hover transition-colors hover:bg-brand-dim/80"
        >
          Vedi struttura completa
        </Link>
      )}
    </div>
  );
}
