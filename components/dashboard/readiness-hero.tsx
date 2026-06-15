import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { ReadinessResult, ReadinessSignal } from "@/lib/readiness";
import { cn } from "@/lib/utils";

const STYLES: Record<
  ReadinessResult["decision"],
  { text: string; border: string; bar: string }
> = {
  GO: {
    text: "text-ready-go",
    border: "border-ready-go-border",
    bar: "border-l-ready-go",
  },
  MODIFY: {
    text: "text-ready-modify",
    border: "border-ready-modify-border",
    bar: "border-l-ready-modify",
  },
  SKIP: {
    text: "text-ready-skip",
    border: "border-ready-skip-border",
    bar: "border-l-ready-skip",
  },
};

/** Parola grande in italiano (dal glossario sez. 1). */
const HUMAN_LABELS: Record<ReadinessResult["decision"], string> = {
  GO: "Via libera",
  MODIFY: "Vai più piano oggi",
  SKIP: "Oggi riposa",
};

/** Frase sotto (trascritta esatta dal glossario sez. 1). */
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

const CONFIDENCE_LABELS: Record<ReadinessResult["confidence"], string> = {
  high: "alta",
  medium: "media",
  low: "bassa",
};

function SignalList({ signals }: { signals: ReadinessSignal[] }) {
  return (
    <ul className="space-y-2 text-sm leading-relaxed text-secondary">
      {signals.map((signal) => (
        <li key={signal.name} className="flex gap-2.5">
          <span
            className={cn(
              "mt-[0.55rem] h-1.5 w-1.5 shrink-0 rounded-full",
              signal.status === "red"
                ? "bg-ready-skip"
                : "bg-ready-modify"
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
}: {
  readiness: ReadinessResult;
}) {
  const styles = STYLES[readiness.decision];
  const copy = COPY[readiness.decision];
  const humanLabel = HUMAN_LABELS[readiness.decision];

  const signals = readiness.signals.filter(
    (signal) => signal.status === "amber" || signal.status === "red"
  );

  return (
    <section
      className={cn(
        "rounded-2xl border border-l-[3px] bg-surface px-5 py-6 sm:px-7 sm:py-7",
        styles.border,
        styles.bar
      )}
    >
      <div className="flex items-center justify-between gap-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
          Readiness di oggi
        </p>
        <p className="text-xs text-muted">
          Confidenza {CONFIDENCE_LABELS[readiness.confidence]}
        </p>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-[minmax(170px,0.7fr)_minmax(0,1.3fr)] md:items-start md:gap-10">
        {/* Colonna sinistra: parola umana grande + sigla tecnica piccola */}
        <div>
          <p
            className={cn(
              "text-[40px] font-semibold leading-tight tracking-[-0.04em] sm:text-[50px]",
              styles.text
            )}
          >
            {humanLabel}
          </p>
          <p className="mt-1 text-xs font-medium tracking-[0.06em] text-muted">
            {readiness.decision}
          </p>
        </div>

        {/* Colonna destra: frase + "Perché?" + bottone */}
        <div className="max-w-xl">
          <h2 className="text-xl font-medium leading-snug tracking-[-0.02em] text-foreground sm:text-[22px]">
            {copy.phrase}
          </h2>

          {/* Link "Perché?" che apre i segnali determinanti */}
          <details className="group mt-3">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-sm text-muted transition-colors hover:text-foreground">
              <span className="group-open:hidden">Perché? ▾</span>
              <span className="hidden group-open:inline">Nascondi segnali ▴</span>
            </summary>
            <div className="mt-3">
              {signals.length > 0 ? (
                <SignalList signals={signals} />
              ) : (
                <p className="text-sm leading-relaxed text-secondary">
                  Nessun segnale critico rilevato nei dati di oggi.
                </p>
              )}
            </div>
          </details>

          <Button asChild variant="outline" className="mt-5 w-full sm:w-auto">
            <Link href="/plan">{copy.action}</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
