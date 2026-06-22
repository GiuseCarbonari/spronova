import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { ReadinessResult, ReadinessSignal } from "@/lib/readiness";
import { cn } from "@/lib/utils";

const STYLES: Record<
  ReadinessResult["decision"],
  { text: string; border: string; dot: string; glow: string }
> = {
  GO: {
    text: "text-ready-go",
    border: "border-ready-go-border",
    dot: "bg-ready-go",
    glow: "shadow-[0_0_44px_-22px_rgba(91,232,154,.9)]",
  },
  MODIFY: {
    text: "text-ready-modify",
    border: "border-ready-modify-border",
    dot: "bg-ready-modify",
    glow: "shadow-[0_0_44px_-22px_rgba(255,194,77,.9)]",
  },
  SKIP: {
    text: "text-ready-skip",
    border: "border-ready-skip-border",
    dot: "bg-ready-skip",
    glow: "shadow-[0_0_44px_-22px_rgba(255,104,85,.9)]",
  },
};

const HUMAN_LABELS: Record<ReadinessResult["decision"], string> = {
  GO: "Via libera",
  MODIFY: "Vai più piano oggi",
  SKIP: "Oggi riposa",
};

const COPY: Record<
  ReadinessResult["decision"],
  { phrase: string; action: string }
> = {
  GO: {
    phrase: "Sei pronto per la seduta prevista.",
    action: "Apri il piano di oggi",
  },
  MODIFY: {
    phrase: "I tuoi segnali suggeriscono di alleggerire.",
    action: "Controlla il piano adattato",
  },
  SKIP: {
    phrase: "Il corpo ha bisogno di recupero. Meglio fermarsi.",
    action: "Controlla il piano di recupero",
  },
};

const CONFIDENCE_COPY: Record<ReadinessResult["confidence"], string> = {
  high: "Confidenza alta: i dati chiave di oggi sono completi.",
  medium: "Confidenza media: alcuni dati chiave mancano o sono parziali.",
  low: "Confidenza bassa: il coach usa pochi segnali e resta prudente.",
};

type ConditionMetrics = {
  ctl: number | null;
  atl: number | null;
  tsb: number | null;
  ctlDelta: number | null;
  atlDelta: number | null;
  tsbDelta: number | null;
};

function formatNumber(value: number | null, showSign = false) {
  if (value == null) return "—";
  const rounded = Math.round(value);
  return showSign && rounded > 0 ? `+${rounded}` : String(rounded);
}

function formatDelta(value: number | null) {
  if (value == null) return "—";
  const rounded = Math.round(value);
  if (rounded === 0) return "0";
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

function Trend({
  value,
  invert = false,
}: {
  value: number | null;
  invert?: boolean;
}) {
  if (value == null || Math.abs(value) < 0.5) {
    return <span className="font-data text-[11px] text-muted">stabile</span>;
  }
  const up = value > 0;
  const positive = invert ? !up : up;
  return (
    <span
      className={cn(
        "font-data inline-flex items-center gap-1 text-[11px] font-semibold",
        positive ? "text-amber" : "text-muted"
      )}
    >
      <span aria-hidden>{up ? "↗" : "↘"}</span>
      {Math.abs(Math.round(value))}
    </span>
  );
}

function MetricChip({
  label,
  value,
  delta,
  colorClass,
  showSign,
  invertTrend,
}: {
  label: string;
  value: number | null;
  delta: number | null;
  colorClass: string;
  showSign?: boolean;
  invertTrend?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1 border-l border-border pl-4 first:border-l-0 first:pl-0">
      <span className="flex items-center gap-2 text-xs font-semibold text-muted">
        <span className={cn("h-2 w-2 rounded-full", colorClass)} />
        {label}
      </span>
      <span className="font-data flex items-baseline gap-2 text-[22px] font-semibold leading-none text-foreground">
        {formatNumber(value, showSign)}
        <Trend value={delta} invert={invertTrend} />
      </span>
    </div>
  );
}

function DeltaBadge({
  label,
  delta,
  colorClass,
  invertTrend,
}: {
  label: string;
  delta: number | null;
  colorClass: string;
  invertTrend?: boolean;
}) {
  const up = delta != null && delta > 0;
  const down = delta != null && delta < 0;
  const positive = delta == null || Math.abs(delta) < 0.5 ? false : invertTrend ? !up : up;

  return (
    <div className="rounded-2xl border border-border bg-surface-2 p-4 backdrop-blur-xl">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted">
        <span className={cn("h-2 w-2 rounded-full", colorClass)} />
        {label}
      </div>
      <div
        className={cn(
          "font-data mt-2 flex items-baseline gap-2 text-[28px] font-semibold leading-none",
          positive ? "text-amber" : "text-foreground"
        )}
      >
        <span>{formatDelta(delta)}</span>
        <span className="text-sm text-muted" aria-hidden>
          {up ? "↗" : down ? "↘" : "→"}
        </span>
      </div>
      <p className="font-data mt-2 text-[11px] text-faint">vs ieri</p>
    </div>
  );
}

function SignalList({ signals }: { signals: ReadinessSignal[] }) {
  return (
    <ul className="space-y-2 text-sm leading-relaxed text-secondary">
      {signals.map((signal) => (
        <li key={signal.name} className="flex gap-2.5">
          <span
            className={cn(
              "mt-[0.55rem] h-1.5 w-1.5 shrink-0 rounded-full",
              signal.status === "red" ? "bg-ready-skip" : "bg-ready-modify"
            )}
            aria-hidden
          />
          <span>{signal.detail}</span>
        </li>
      ))}
    </ul>
  );
}

export function ReadinessHero({
  readiness,
  conditionMetrics,
}: {
  readiness: ReadinessResult;
  conditionMetrics?: ConditionMetrics;
}) {
  const styles = STYLES[readiness.decision];
  const copy = COPY[readiness.decision];
  const humanLabel = HUMAN_LABELS[readiness.decision];

  const signals = readiness.signals.filter(
    (signal) => signal.status === "amber" || signal.status === "red"
  );

  return (
    <section className="aurora-glass relative overflow-hidden rounded-[32px] px-5 py-6 sm:px-7 sm:py-7">
      <div className="pointer-events-none absolute -right-16 -top-16 h-72 w-72 rounded-full bg-amber/24 blur-3xl" />
      <div className="pointer-events-none absolute -left-24 top-1/3 h-80 w-80 rounded-full bg-telemetry-blue/16 blur-3xl" />

      <div className="relative z-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="font-data text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
              Condizione
            </p>
            <h2 className="font-display mt-1 text-[26px] font-bold leading-tight tracking-[-0.03em] text-foreground">
              Condizione di oggi
            </h2>
          </div>
          <p
            className={cn(
              "max-w-[260px] rounded-2xl border bg-surface px-3 py-2 text-xs leading-relaxed text-secondary",
              styles.border
            )}
          >
            <span className={cn("mr-2 inline-block h-2 w-2 rounded-full", styles.dot)} />
            {CONFIDENCE_COPY[readiness.confidence]}
          </p>
        </div>

        {conditionMetrics && (
          <div className="mt-5 flex gap-4 rounded-[22px] border border-border bg-surface p-4 backdrop-blur-xl">
            <MetricChip
              label="Forma"
              value={conditionMetrics.ctl}
              delta={conditionMetrics.ctlDelta}
              colorClass="bg-amber"
            />
            <MetricChip
              label="Fatica"
              value={conditionMetrics.atl}
              delta={conditionMetrics.atlDelta}
              colorClass="bg-telemetry-blue"
              invertTrend
            />
            <MetricChip
              label="Freschezza"
              value={conditionMetrics.tsb}
              delta={conditionMetrics.tsbDelta}
              colorClass="bg-telemetry-gold"
              showSign
            />
          </div>
        )}

        <div className="mt-6 grid gap-7 lg:grid-cols-[330px_minmax(0,1fr)] lg:items-center">
          <div
            className={cn(
              "rounded-[30px] border bg-surface/80 p-5 backdrop-blur-xl",
              styles.border,
              styles.glow
            )}
          >
            <div className="flex flex-col items-center rounded-[26px] border border-border bg-surface-2 px-5 py-7 text-center">
              <span className="font-data text-[9px] uppercase tracking-[0.24em] text-muted">
                Readiness
              </span>
              <span
                className={cn(
                  "font-display mt-2 text-[34px] font-bold leading-none tracking-[-0.05em]",
                  styles.text
                )}
              >
                {humanLabel}
              </span>
              <span className="font-data mt-2 text-[11px] font-semibold tracking-[0.08em] text-muted">
                {readiness.decision}
              </span>
            </div>

            {conditionMetrics && (
              <div className="mt-4 grid grid-cols-3 gap-3">
                <DeltaBadge
                  label="Forma"
                  delta={conditionMetrics.ctlDelta}
                  colorClass="bg-amber"
                />
                <DeltaBadge
                  label="Fatica"
                  delta={conditionMetrics.atlDelta}
                  colorClass="bg-telemetry-blue"
                  invertTrend
                />
                <DeltaBadge
                  label="Freschezza"
                  delta={conditionMetrics.tsbDelta}
                  colorClass="bg-telemetry-gold"
                />
              </div>
            )}
          </div>

          <div className="max-w-xl">
            <h3 className="font-display text-[24px] font-bold leading-tight tracking-[-0.03em] text-foreground">
              {copy.phrase}
            </h3>

            <div className="mt-4 rounded-[22px] border border-border bg-surface p-4">
              <p className="font-data text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
                Perché
              </p>
              <div className="mt-3">
                {signals.length > 0 ? (
                  <SignalList signals={signals} />
                ) : (
                  <p className="text-sm leading-relaxed text-secondary">
                    Nessun segnale critico rilevato nei dati di oggi.
                  </p>
                )}
              </div>
            </div>

            <Button asChild className="mt-5 w-full sm:w-auto">
              <Link href="/plan">{copy.action}</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
