import {
  computeReadinessScore,
  type ReadinessResult,
} from "@/lib/readiness";

const RING: Record<
  ReadinessResult["decision"],
  { from: string; to: string; labelColor: string; glow: string }
> = {
  GO: {
    from: "#46b88a",
    to: "#7fc8c0",
    labelColor: "var(--ready-go)",
    glow: "rgba(70,184,138,0.45)",
  },
  MODIFY: {
    from: "#e0a83e",
    to: "#f0c878",
    labelColor: "var(--ready-modify)",
    glow: "rgba(224,168,62,0.45)",
  },
  SKIP: {
    from: "#d9665b",
    to: "#ed8a82",
    labelColor: "var(--ready-skip)",
    glow: "rgba(217,102,91,0.45)",
  },
};

const TONE: Record<ReadinessResult["decision"], { border: string; bg: string; pillBg: string; pillBorder: string; pillText: string }> = {
  GO: {
    border: "border-ready-go-border",
    bg: "from-ready-go/[0.12] to-surface-2/60",
    pillBg: "bg-ready-go/[0.14]",
    pillBorder: "border-ready-go/40",
    pillText: "text-ready-go",
  },
  MODIFY: {
    border: "border-ready-modify-border",
    bg: "from-ready-modify/[0.12] to-surface-2/60",
    pillBg: "bg-ready-modify/[0.14]",
    pillBorder: "border-ready-modify/40",
    pillText: "text-ready-modify",
  },
  SKIP: {
    border: "border-ready-skip-border",
    bg: "from-ready-skip/[0.12] to-surface-2/60",
    pillBg: "bg-ready-skip/[0.14]",
    pillBorder: "border-ready-skip/40",
    pillText: "text-ready-skip",
  },
};

const SIGNAL_LABEL: Record<string, string> = {
  hrv: "HRV",
  rhr: "FC riposo",
  sleep: "Sonno",
  tsb: "Freschezza",
  acwr: "Carico",
  ri: "Indice recupero",
};

const STATUS_DOT: Record<string, string> = {
  green: "bg-ready-go",
  amber: "bg-ready-modify",
  red: "bg-ready-skip",
  unavailable: "bg-muted/40",
};

const CTA: Record<ReadinessResult["decision"], string> = {
  GO: "Esegui la seduta prevista.",
  MODIFY: "Valuta di alleggerire la seduta.",
  SKIP: "Oggi è meglio fermarsi.",
};

const CONFIDENCE_LABEL: Record<ReadinessResult["confidence"], string> = {
  high: "Dati completi",
  medium: "Alcuni dati mancano",
  low: "Pochi segnali",
};

export function ReadinessRing({ readiness }: { readiness: ReadinessResult }) {
  const ring = RING[readiness.decision];
  const tone = TONE[readiness.decision];
  const gradientId = `ring-${readiness.decision}`;
  const score = computeReadinessScore(readiness);
  const radius = 84;
  const circumference = 2 * Math.PI * radius;
  const scoreOffset = circumference * (1 - score / 100);

  const visibleSignals = readiness.signals
    .filter((s) => s.status === "amber" || s.status === "red")
    .slice(0, 3);
  const allGreen = visibleSignals.length === 0;
  const leadText =
    readiness.decision === "GO"
      ? "Recupero buono e carico in equilibrio."
      : readiness.decision === "MODIFY"
        ? "Alcuni segnali suggeriscono cautela."
        : "Il corpo ha bisogno di recupero.";

  return (
    <div
      id="tour-readiness"
      className={`relative overflow-hidden rounded-[24px] border bg-gradient-to-br px-5 py-5 ${tone.border} ${tone.bg}`}
    >
      {/* Header pill */}
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] ${tone.pillBg} ${tone.pillBorder} ${tone.pillText}`}
      >
        Readiness
      </span>

      {/* Body: ring + right column */}
      <div className="mt-4 flex items-center gap-5">
        {/* Ring */}
        <div
          className="relative h-[130px] w-[130px] shrink-0 sm:h-[144px] sm:w-[144px]"
          aria-label={`Readiness ${score} su 100, decisione ${readiness.decision}`}
        >
          <svg
            viewBox="0 0 200 200"
            className="h-full w-full"
          >
            <defs>
              <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={ring.from} />
                <stop offset="100%" stopColor={ring.to} />
              </linearGradient>
            </defs>
            <g transform="rotate(-90 100 100)">
              {/* Track */}
              <circle
                cx="100" cy="100" r={radius}
                fill="none"
                stroke="color-mix(in srgb, var(--foreground) 9%, transparent)"
                strokeWidth="14"
              />
              {/* Active arc */}
              <circle
                cx="100" cy="100" r={radius}
                fill="none"
                stroke={`url(#${gradientId})`}
                strokeWidth="14"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={scoreOffset}
                style={{ filter: `drop-shadow(0 0 10px ${ring.glow})` }}
              >
                <animate
                  attributeName="stroke-dashoffset"
                  from={circumference}
                  to={scoreOffset}
                  dur="850ms"
                  fill="freeze"
                  calcMode="spline"
                  keySplines="0.16 1 0.3 1"
                />
              </circle>
            </g>
          </svg>
          {/* Center text */}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-2 text-center">
            <span
              className="font-body text-[35px] font-semibold leading-[0.9] tabular-nums sm:text-[38px]"
              style={{ color: ring.labelColor }}
            >
              {score}
            </span>
            <span className="mt-1 text-[8px] uppercase leading-none tracking-[0.14em] text-muted">
              su 100
            </span>
          </div>
        </div>

        {/* Right: reason + signals */}
        <div className="min-w-0 flex-1 space-y-3">
          {/* Lead sentence */}
          <p className="text-[13px] leading-snug text-secondary">
            {leadText}{" "}
            <span className="font-medium text-foreground">{CTA[readiness.decision]}</span>
          </p>

          {/* Signal pills */}
          {allGreen ? (
            <p className="text-[12px] text-ready-go">
              {readiness.signals.some((s) => s.status === "unavailable")
                ? "Nessun segnale critico rilevato con i dati disponibili."
                : "Tutti i segnali sono nella norma."}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {visibleSignals.map((s) => (
                <li key={s.name} className="flex items-start gap-2">
                  <span
                    className={`mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[s.status] ?? "bg-muted"}`}
                    aria-hidden
                  />
                  <span className="text-[12px] leading-snug text-secondary">
                    <span className="font-medium text-foreground">{SIGNAL_LABEL[s.name] ?? s.name}:</span>{" "}
                    {s.detail}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {/* Confidence footer */}
          <p className="text-[11px] text-faint">
            Confidenza {readiness.confidence === "high" ? "alta" : readiness.confidence === "medium" ? "media" : "bassa"} — {CONFIDENCE_LABEL[readiness.confidence]}
          </p>
        </div>
      </div>

      {/* Signal bar: tutti i segnali in miniatura */}
      <div className="mt-4 flex gap-2 border-t border-border pt-3">
        {readiness.signals.map((s) => (
          <div key={s.name} className="flex flex-1 flex-col items-center gap-1.5">
            <span
              className={`h-1 w-full rounded-full ${STATUS_DOT[s.status] ?? "bg-muted/40"}`}
              style={{ opacity: s.status === "unavailable" ? 1 : 0.85 }}
            />
            <span className="text-[9px] uppercase tracking-[0.08em] text-faint">
              {SIGNAL_LABEL[s.name] ?? s.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
