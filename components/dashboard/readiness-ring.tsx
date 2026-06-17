import type { ReadinessResult } from "@/lib/readiness";

const RING: Record<
  ReadinessResult["decision"],
  { from: string; to: string; label: string; labelColor: string; glow: string }
> = {
  GO: {
    from: "#46b88a",
    to: "#7fc8c0",
    label: "Via libera",
    labelColor: "#7fe0b3",
    glow: "rgba(70,184,138,0.45)",
  },
  MODIFY: {
    from: "#e0a83e",
    to: "#f0c878",
    label: "Adatta la seduta",
    labelColor: "#f0c878",
    glow: "rgba(224,168,62,0.45)",
  },
  SKIP: {
    from: "#d9665b",
    to: "#ed8a82",
    label: "Riposo",
    labelColor: "#ed8a82",
    glow: "rgba(217,102,91,0.45)",
  },
};

const TONE: Record<ReadinessResult["decision"], { border: string; bg: string; pillBg: string; pillBorder: string; pillText: string }> = {
  GO: {
    border: "border-ready-go-border",
    bg: "from-ready-go/[0.12] to-[#0e121b]/60",
    pillBg: "bg-ready-go/[0.14]",
    pillBorder: "border-ready-go/40",
    pillText: "text-[#7fe0b3]",
  },
  MODIFY: {
    border: "border-ready-modify-border",
    bg: "from-ready-modify/[0.12] to-[#0e121b]/60",
    pillBg: "bg-ready-modify/[0.14]",
    pillBorder: "border-ready-modify/40",
    pillText: "text-[#f0c878]",
  },
  SKIP: {
    border: "border-ready-skip-border",
    bg: "from-ready-skip/[0.12] to-[#0e121b]/60",
    pillBg: "bg-ready-skip/[0.14]",
    pillBorder: "border-ready-skip/40",
    pillText: "text-[#ed8a82]",
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
  unavailable: "bg-muted/60",
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

  const visibleSignals = readiness.signals
    .filter((s) => s.status === "amber" || s.status === "red")
    .slice(0, 3);
  const allGreen = visibleSignals.length === 0;
  const criticalSignal = readiness.signals.find(
    (s) => s.status === "amber" || s.status === "red"
  );
  const leadText = criticalSignal?.detail ?? (
    readiness.decision === "GO"
      ? "Recupero buono e carico in equilibrio."
      : readiness.decision === "MODIFY"
      ? "Alcuni segnali suggeriscono cautela."
      : "Il corpo ha bisogno di recupero."
  );

  return (
    <div
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
        <div className="relative h-[130px] w-[130px] shrink-0 sm:h-[144px] sm:w-[144px]">
          <svg
            viewBox="0 0 200 200"
            className="h-full w-full"
            style={{ transform: "rotate(-90deg)" }}
          >
            <defs>
              <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={ring.from} />
                <stop offset="100%" stopColor={ring.to} />
              </linearGradient>
            </defs>
            {/* Track */}
            <circle
              cx="100" cy="100" r="84"
              fill="none"
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="14"
            />
            {/* Active arc */}
            <circle
              cx="100" cy="100" r="84"
              fill="none"
              stroke={`url(#${gradientId})`}
              strokeWidth="14"
              strokeLinecap="round"
              style={{ filter: `drop-shadow(0 0 10px ${ring.glow})` }}
            />
          </svg>
          {/* Center text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center px-2 text-center">
            <span
              className="font-serif text-[17px] font-medium leading-tight"
              style={{ color: ring.labelColor }}
            >
              {ring.label}
            </span>
            <span className="mt-1 text-[9px] uppercase tracking-[0.12em] text-muted">
              {readiness.decision}
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
      <div className="mt-4 flex gap-2 border-t border-white/[0.06] pt-3">
        {readiness.signals.map((s) => (
          <div key={s.name} className="flex flex-1 flex-col items-center gap-1.5">
            <span
              className={`h-1 w-full rounded-full ${STATUS_DOT[s.status] ?? "bg-muted/40"}`}
              style={{ opacity: s.status === "unavailable" ? 0.3 : 0.85 }}
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
