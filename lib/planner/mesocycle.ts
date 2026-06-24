/**
 * Posizione nel mesociclo + traiettoria volume (WORKOUT_REFERENCE.md §4.1-4.2)
 * — logica PURA, nessuna AI.
 *
 * §4.1 Build:Deload — default 3:1 (3 settimane progressive + 1 scarico).
 * §4.2 Volume Trajectory:
 *   - Settimana 1 → ~95-100% del target (qui 100%)
 *   - Settimana 2 → ~100-105%          (qui 102%)
 *   - Settimana 3 → ~105-110% (picco)  (qui 108%)
 *   - Scarico     → ~60-70% del picco   (qui 65%), 1 sola dura ridotta.
 *
 * Vincolo §2: il picco non supera +10% del baseline (clamp del volume_factor).
 *
 * La POSIZIONE nel blocco è derivata dallo storico delle fasi (weekly_plans):
 * contiamo le settimane consecutive recenti nella stessa fase di CARICO. Una
 * settimana di scarico (o una fase recovery/taper) RESETTA il conteggio.
 *
 * Le fasi recovery/taper NON seguono la 3:1: recovery è già scarico forzato
 * (Section 11 A) e taper ha il proprio protocollo race-week (§4.3). Per quelle
 * il volume_factor resta 1 e is_deload è false (la fase stessa gestisce il carico).
 */

import type { Phase } from "@/lib/planner/phase-detector";

/** Fasi che seguono la periodizzazione 3:1 (carico progressivo). */
const LOADING_PHASES: ReadonlySet<Phase> = new Set<Phase>(["base", "build", "peak"]);

/** Settimane di carico prima di uno scarico (default §4.1). */
export const BUILD_DELOAD_RATIO = 3;

/** Fattori di volume per settimana del blocco (§4.2). Picco a settimana 3. */
const VOLUME_FACTOR_BY_WEEK: Record<number, number> = {
  1: 1.0,
  2: 1.02,
  3: 1.08,
};
/** Scarico: ~65% del picco (§4.2). Applicato come fattore assoluto sul target. */
const DELOAD_VOLUME_FACTOR = 0.65;
/** Clamp §2: il fattore non supera +10% del baseline. */
const MAX_VOLUME_FACTOR = 1.1;

export interface MesocyclePosition {
  /** Settimana nel blocco: 1-3 carico, 4 = scarico. */
  week_in_block: number;
  /** true se questa è la settimana di scarico. */
  is_deload: boolean;
  /** Moltiplicatore del target volume/durata per questa settimana (§4.2). */
  volume_factor: number;
  /** Spiegazione auditabile. */
  reason: string;
}

/**
 * Calcola la posizione nel mesociclo per la settimana CORRENTE.
 *
 * @param recentLoadingWeeks Numero di settimane di carico CONSECUTIVE già
 *   completate nella fase corrente (dallo storico, esclusa la settimana che
 *   stiamo generando). 0 = inizio blocco. Le settimane di scarico/recovery/taper
 *   non vanno contate (il chiamante le esclude resettando il conteggio).
 * @param currentPhase Fase rilevata per la settimana corrente.
 */
export function computeMesocyclePosition(
  recentLoadingWeeks: number,
  currentPhase: Phase
): MesocyclePosition {
  // Fasi non-carico: nessuna 3:1, la fase gestisce il proprio volume.
  if (!LOADING_PHASES.has(currentPhase)) {
    return {
      week_in_block: 1,
      is_deload: false,
      volume_factor: 1,
      reason: `Fase ${currentPhase}: periodizzazione 3:1 non applicata (carico gestito dalla fase).`,
    };
  }

  // Posizione 1-based nel ciclo di 4 (3 carico + 1 scarico).
  const cycleLen = BUILD_DELOAD_RATIO + 1; // 4
  const weekInBlock = (recentLoadingWeeks % cycleLen) + 1;
  const isDeload = weekInBlock === cycleLen; // settimana 4

  if (isDeload) {
    return {
      week_in_block: weekInBlock,
      is_deload: true,
      volume_factor: DELOAD_VOLUME_FACTOR,
      reason: `Settimana ${weekInBlock} del blocco: SCARICO (§4.2). Volume al ${Math.round(
        DELOAD_VOLUME_FACTOR * 100
      )}% con 1 sola seduta strutturata ridotta.`,
    };
  }

  const raw = VOLUME_FACTOR_BY_WEEK[weekInBlock] ?? 1;
  const factor = Math.min(raw, MAX_VOLUME_FACTOR);
  return {
    week_in_block: weekInBlock,
    is_deload: false,
    volume_factor: factor,
    reason: `Settimana ${weekInBlock} di ${BUILD_DELOAD_RATIO} del blocco (§4.2): volume al ${Math.round(
      factor * 100
    )}% del target.`,
  };
}

/** Fase storica minima per derivare il conteggio. */
export interface HistoricalPhaseWeek {
  week_start: string; // YYYY-MM-DD
  phase: Phase;
  is_deload?: boolean;
}

/**
 * Conta le settimane di CARICO consecutive completate prima della settimana
 * corrente, dallo storico. Si ferma al primo "reset": una settimana di scarico,
 * un cambio verso fase non-carico, o un buco/cambio di fase di carico.
 *
 * @param history      Settimane passate (qualsiasi ordine), con phase e is_deload.
 * @param currentPhase Fase della settimana che stiamo generando.
 */
export function countConsecutiveLoadingWeeks(
  history: HistoricalPhaseWeek[],
  currentPhase: Phase
): number {
  if (!LOADING_PHASES.has(currentPhase)) return 0;
  // Ordina dalla più recente alla più vecchia.
  const sorted = [...history].sort((a, b) => b.week_start.localeCompare(a.week_start));
  let count = 0;
  for (const w of sorted) {
    // Reset su scarico, fase non-carico o cambio di fase di carico.
    if (w.is_deload === true) break;
    if (!LOADING_PHASES.has(w.phase)) break;
    if (w.phase !== currentPhase) break;
    count++;
  }
  return count;
}
