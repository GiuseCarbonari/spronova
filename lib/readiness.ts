/**
 * Motore readiness — priority ladder P0–P3 di Section 11 (PRD §14.5).
 *
 * computeReadiness() è una FUNZIONE PURA e deterministica: stessi input →
 * stessa decisione, nessuna chiamata API, nessun accesso a clock o DB.
 * Così è testabile a tavolino (tests/readiness.test.ts) e auditabile:
 * la decisione salvata nello snapshot è riproducibile dai dati salvati.
 *
 * Provenienza dei numeri (regola "No Virtual Math"):
 *  - ctl e atl sono LETTI dal wellness Intervals (pre-calcolati da Intervals);
 *  - TSB = ctl − atl e ACWR = atl / ctl sono semplici operazioni aritmetiche
 *    sui valori letti, come da specifica Milestone 2 — non derivazioni;
 *  - le baseline HRV/RHR sono medie dei 7 giorni precedenti forniti in input.
 *
 * Nota Milestone 2: Recovery Index e alarm tier-1 (P0) arrivano dal mirror
 * Section 11, non dall'API Intervals — qui sono accettati come input
 * opzionale `extras` così la ladder è completa e testabile, ma finché non
 * vengono forniti P0 non può scattare.
 */

import {
  HRV_PROTOCOL_LABELS,
  hrvValue,
  type HrvProtocol,
} from "@/lib/hrv";

/** Giorno wellness minimo richiesto dal motore (sottoinsieme di WellnessDay). */
export interface ReadinessInputDay {
  date: string;
  ctl: number | null;
  atl: number | null;
  restingHR: number | null;
  hrv: number | null;
  hrvSDNN?: number | null;
  sleepSecs: number | null;
}

/** Input opzionali Section 11 non disponibili via API Intervals (Milestone 2). */
export interface ReadinessExtras {
  /**
   * Recovery Index pre-calcolato (dal mirror Section 11). Se assente,
   * computeReadiness lo deriva internamente da HRV e RHR vs baseline 7g.
   */
  recoveryIndex?: number | null;
  tier1AlarmActive?: boolean;
  hrvProtocol?: HrvProtocol;
  /** Ultimo valore HRV noto (carry-forward se oggi manca) + data per l'avvertenza. */
  lastKnownHrv?: { value: number; date: string } | null;
  /** Ultimo valore RHR noto (carry-forward se oggi manca) + data per l'avvertenza. */
  lastKnownRhr?: { value: number; date: string } | null;
  /**
   * Storico RI degli ultimi giorni (cronologico, ultimo = ieri) per rilevare
   * la persistenza RI < 0.7 su 2+ giorni consecutivi (Section 11 amber rule).
   */
  riHistory?: Array<number | null>;
}

export type SignalStatus = "green" | "amber" | "red" | "unavailable";

export interface ReadinessSignal {
  name: "hrv" | "rhr" | "sleep" | "tsb" | "acwr" | "ri";
  value: number | null;
  status: SignalStatus;
  /** Spiegazione leggibile, mostrata in dashboard. */
  detail: string;
}

export interface ReadinessResult {
  decision: "GO" | "MODIFY" | "SKIP";
  priority: 0 | 1 | 2 | 3;
  signals: ReadinessSignal[];
  /** Motivi della decisione (regole della ladder che hanno fatto match). */
  reasons: string[];
  confidence: "high" | "medium" | "low";
}

const SIGNAL_SCORE_WEIGHT: Record<ReadinessSignal["name"], number> = {
  hrv: 1.15,
  rhr: 1.15,
  sleep: 1,
  tsb: 1,
  acwr: 1.2,
  ri: 1.25,
};

const SIGNAL_HEALTH: Record<SignalStatus, number | null> = {
  green: 1,
  amber: 0.58,
  red: 0.18,
  unavailable: null,
};

const CONFIDENCE_SCORE_PENALTY: Record<ReadinessResult["confidence"], number> = {
  high: 0,
  medium: 4,
  low: 9,
};

const SCORE_BANDS: Record<
  ReadinessResult["decision"],
  { min: number; max: number }
> = {
  GO: { min: 70, max: 100 },
  MODIFY: { min: 40, max: 69 },
  SKIP: { min: 0, max: 39 },
};

function clampScore(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Trasforma la decisione Section 11 in un indice 0-100 senza cambiarla.
 * Le bande restano coerenti con la ladder: SKIP 0-39, MODIFY 40-69, GO 70-100.
 */
export function computeReadinessScore(readiness: ReadinessResult): number {
  let weightedHealth = 0;
  let totalWeight = 0;

  for (const signal of readiness.signals) {
    const health = SIGNAL_HEALTH[signal.status];
    if (health == null) continue;

    const weight = SIGNAL_SCORE_WEIGHT[signal.name];
    weightedHealth += health * weight;
    totalWeight += weight;
  }

  const baseHealth = totalWeight > 0 ? weightedHealth / totalWeight : 0.72;
  const rawScore = Math.round(
    baseHealth * 100 - CONFIDENCE_SCORE_PENALTY[readiness.confidence]
  );

  let { min, max } = SCORE_BANDS[readiness.decision];

  if (readiness.decision === "SKIP") {
    max = readiness.priority === 0 ? 24 : readiness.priority === 1 ? 34 : max;
  }

  return clampScore(rawScore, min, max);
}

/**
 * Recovery Index = (HRV_today / HRV_baseline) ÷ (RHR_today / RHR_baseline).
 *
 * Formula Section 11: rapporto composito che sale quando HRV è alta e RHR è
 * bassa (recupero ottimale). null se mancano HRV o RHR (divisione per zero
 * inclusa). Arrotondato a 2 decimali per auditabilità.
 *
 * Thresholds Section 11:
 *   RI ≥ 0.8 → green
 *   RI 0.7–0.79 → amber (solo se persistente 2+ giorni)
 *   RI < 0.7 per 2+ giorni → amber
 *   RI < 0.6 qualsiasi giorno → red (P0 safety stop)
 */
export function computeRecoveryIndex(
  hrvToday: number | null,
  rhrToday: number | null,
  hrvBaseline: number | null,
  rhrBaseline: number | null
): number | null {
  if (
    hrvToday == null ||
    rhrToday == null ||
    hrvBaseline == null ||
    rhrBaseline == null ||
    hrvBaseline === 0 ||
    rhrToday === 0
  )
    return null;
  const ri = (hrvToday / hrvBaseline) / (rhrToday / rhrBaseline);
  return Math.round(ri * 100) / 100;
}

/**
 * Conta quanti giorni consecutivi finali (incluso oggi) hanno RI < 0.7.
 * Usato per la amber-persistence rule di Section 11.
 */
export function riConsecutiveDaysBelow(
  riToday: number | null,
  riHistory: Array<number | null>
): number {
  const series = [...riHistory, riToday];
  let count = 0;
  for (let i = series.length - 1; i >= 0; i--) {
    const v = series[i];
    if (v != null && v < 0.7) count++;
    else break;
  }
  return count;
}

/** Media aritmetica dei valori non-null; null se non ce ne sono. */
function meanOf(values: Array<number | null>): number | null {
  const present = values.filter((v): v is number => v != null);
  if (present.length === 0) return null;
  return present.reduce((sum, v) => sum + v, 0) / present.length;
}

export function computeReadiness(
  wellnessToday: ReadinessInputDay | null,
  wellnessHistory7d: ReadinessInputDay[],
  extras: ReadinessExtras = {}
): ReadinessResult {
  const signals: ReadinessSignal[] = [];
  const reasons: string[] = [];
  const hrvProtocol = extras.hrvProtocol ?? "rmssd";
  const hrvLabel = HRV_PROTOCOL_LABELS[hrvProtocol];

  // --- Metriche di carico: lette, non ricalcolate -------------------------
  const ctl = wellnessToday?.ctl ?? null;
  const atl = wellnessToday?.atl ?? null;
  // TSB = ctl − atl (sottrazione semplice sui valori Intervals).
  const tsb = ctl != null && atl != null ? ctl - atl : null;
  // ACWR = atl / ctl, con 0 se ctl = 0 (da specifica: evita la divisione per zero).
  const acwr = ctl != null && atl != null ? (ctl === 0 ? 0 : atl / ctl) : null;

  // --- Baseline 7 giorni precedenti ---------------------------------------
  const hrvBaseline = meanOf(
    wellnessHistory7d.map((day) => hrvValue(day, hrvProtocol))
  );
  const rhrBaseline = meanOf(wellnessHistory7d.map((d) => d.restingHR));

  const hrvTodayRaw = hrvValue(wellnessToday, hrvProtocol);
  const rhrTodayRaw = wellnessToday?.restingHR ?? null;
  const sleepHours =
    wellnessToday?.sleepSecs != null ? wellnessToday.sleepSecs / 3600 : null;

  // Carry-forward: usa l'ultimo valore noto se oggi manca, con flag stale.
  const hrvToday = hrvTodayRaw ?? extras.lastKnownHrv?.value ?? null;
  const hrvStale = hrvTodayRaw == null && hrvToday != null;
  const rhrToday = rhrTodayRaw ?? extras.lastKnownRhr?.value ?? null;
  const rhrStale = rhrTodayRaw == null && rhrToday != null;

  // Variazione HRV % vs baseline (positiva = HRV in calo = peggio).
  const hrvDropPct =
    hrvToday != null && hrvBaseline != null && hrvBaseline > 0
      ? ((hrvBaseline - hrvToday) / hrvBaseline) * 100
      : null;
  // Delta RHR in bpm vs baseline (positivo = RHR più alta = peggio).
  const rhrDelta =
    rhrToday != null && rhrBaseline != null ? rhrToday - rhrBaseline : null;

  function staleSuffix(date: string | undefined): string {
    if (!date) return " (dato precedente)";
    const d = new Date(date);
    return ` (ultima misura ${d.getDate()} ${d.toLocaleString("it-IT", { month: "short" })})`;
  }

  // --- Classificazione segnali (tabella PRD §14.5) ------------------------
  // I segnali mancanti sono "unavailable" ed esclusi dai conteggi ambra/rossi.

  if (hrvDropPct == null) {
    signals.push({
      name: "hrv",
      value: null,
      status: "unavailable",
      detail: `HRV ${hrvLabel} — nessun dato disponibile`,
    });
  } else {
    const status: SignalStatus =
      hrvDropPct > 20 ? "red" : hrvDropPct > 10 ? "amber" : "green";
    const trendText = `${hrvDropPct > 0 ? "↓" : "↑"}${Math.abs(hrvDropPct).toFixed(0)}% vs baseline 7g`;
    const staleNote = hrvStale ? staleSuffix(extras.lastKnownHrv?.date) : "";
    signals.push({
      name: "hrv",
      value: hrvToday,
      status,
      detail: `HRV ${hrvLabel} ${trendText}${staleNote}`,
    });
  }

  if (rhrDelta == null) {
    signals.push({
      name: "rhr",
      value: null,
      status: "unavailable",
      detail: "FC riposo — nessun dato disponibile",
    });
  } else {
    const status: SignalStatus =
      rhrDelta >= 5 ? "red" : rhrDelta >= 3 ? "amber" : "green";
    const trendText = `${rhrDelta >= 0 ? "+" : ""}${rhrDelta.toFixed(0)} bpm vs baseline 7g`;
    const staleNote = rhrStale ? staleSuffix(extras.lastKnownRhr?.date) : "";
    signals.push({
      name: "rhr",
      value: rhrToday,
      status,
      detail: `FC riposo ${trendText}${staleNote}`,
    });
  }

  if (sleepHours == null) {
    signals.push({
      name: "sleep",
      value: null,
      status: "unavailable",
      detail: "Sonno non disponibile",
    });
  } else {
    const status: SignalStatus =
      sleepHours < 5 ? "red" : sleepHours < 7 ? "amber" : "green";
    signals.push({
      name: "sleep",
      value: Math.round(sleepHours * 10) / 10,
      status,
      detail: `Sonno ${sleepHours.toFixed(1)}h`,
    });
  }

  // TSB: soglia di fase default −15 (PRD §14.5). Da −15 a −30 è ambra ma
  // NORMALE: è il meccanismo dell'adattamento e da solo non genera
  // MODIFY/SKIP (correzione chiave v2 del PRD) — pesa solo nei conteggi P2.
  if (tsb == null) {
    signals.push({
      name: "tsb",
      value: null,
      status: "unavailable",
      detail: "TSB non disponibile (mancano ctl/atl)",
    });
  } else {
    const status: SignalStatus =
      tsb < -30 ? "red" : tsb <= -15 ? "amber" : "green";
    signals.push({
      name: "tsb",
      value: Math.round(tsb * 10) / 10,
      status,
      detail: `TSB ${tsb.toFixed(1)}${status === "amber" ? " (normale in carico)" : ""}`,
    });
  }

  // ACWR: il lato basso (<0.8) non è una penalità di readiness (Section 11).
  if (acwr == null) {
    signals.push({
      name: "acwr",
      value: null,
      status: "unavailable",
      detail: "ACWR non disponibile (mancano ctl/atl)",
    });
  } else {
    const status: SignalStatus =
      acwr >= 1.5 ? "red" : acwr >= 1.3 ? "amber" : "green";
    signals.push({
      name: "acwr",
      value: Math.round(acwr * 100) / 100,
      status,
      detail: `ACWR ${acwr.toFixed(2)}`,
    });
  }

  // RI: usa il valore esterno se fornito, altrimenti lo calcola internamente
  // da HRV e RHR vs baseline 7g (Section 11 formula).
  const riExternal = extras.recoveryIndex ?? null;
  const riComputed =
    riExternal != null
      ? null
      : computeRecoveryIndex(hrvToday, rhrToday, hrvBaseline, rhrBaseline);
  const ri = riExternal ?? riComputed;
  const riSource = riExternal != null ? "esterno" : riComputed != null ? "calcolato" : null;

  // Amber rule Section 11: RI < 0.7 è amber SOLO se persiste 2+ giorni.
  const riDaysBelow = ri != null
    ? riConsecutiveDaysBelow(ri, extras.riHistory ?? [])
    : 0;

  const riStatus: SignalStatus =
    ri == null
      ? "unavailable"
      : ri < 0.6
        ? "red"
        : ri < 0.7 && riDaysBelow >= 2
          ? "amber"
          : ri < 0.7
            ? "green" // sotto 0.7 ma primo giorno: non ancora amber
            : "green";

  const riDetail =
    ri == null
      ? "Recovery Index non disponibile"
      : `RI ${ri.toFixed(2)}${riSource === "calcolato" ? " (da HRV+RHR)" : ""}${
          ri < 0.7 && riDaysBelow < 2 ? " — 1° giorno, monitorare" : ""
        }${riDaysBelow >= 2 ? ` — ${riDaysBelow}gg consecutivi < 0.7` : ""}`;

  signals.push({ name: "ri", value: ri, status: riStatus, detail: riDetail });

  const redCount = signals.filter((s) => s.status === "red").length;
  const amberCount = signals.filter((s) => s.status === "amber").length;

  // --- Confidence: quanti segnali chiave sono realmente disponibili -------
  const availableKeySignals = [
    hrvDropPct != null,
    rhrDelta != null,
    sleepHours != null,
    tsb != null, // copre anche ACWR (stessi input ctl/atl)
  ].filter(Boolean).length;
  const confidence: ReadinessResult["confidence"] =
    availableKeySignals >= 4
      ? "high"
      : availableKeySignals >= 2
        ? "medium"
        : "low";

  // --- Priority ladder: first match wins (PRD §14.5) ----------------------
  const finish = (
    decision: ReadinessResult["decision"],
    priority: ReadinessResult["priority"]
  ): ReadinessResult => ({ decision, priority, signals, reasons, confidence });

  // P0 — Safety stop (non negoziabile)
  if (ri != null && ri < 0.6) {
    reasons.push(`P0 safety stop: Recovery Index ${ri.toFixed(2)} < 0.6`);
    return finish("SKIP", 0);
  }
  if (extras.tier1AlarmActive) {
    reasons.push("P0 safety stop: alarm tier-1 attivo");
    return finish("SKIP", 0);
  }
  // RI < 0.7 per 2+ giorni consecutivi = tier-1 alert → P1 SKIP (Section 11).
  if (ri != null && ri < 0.7 && riDaysBelow >= 2) {
    reasons.push(
      `P1 sovraccarico acuto: RI ${ri.toFixed(2)} < 0.7 per ${riDaysBelow} giorni consecutivi`
    );
    return finish("SKIP", 1);
  }

  // P1 — Sovraccarico acuto → Skip
  if (acwr != null && acwr >= 1.5) {
    reasons.push(`P1 sovraccarico acuto: ACWR ${acwr.toFixed(2)} ≥ 1.5`);
    return finish("SKIP", 1);
  }
  if (tsb != null && tsb < -30 && hrvDropPct != null && hrvDropPct > 10) {
    reasons.push(
      `P1 sovraccarico acuto: TSB ${tsb.toFixed(1)} < −30 con HRV ↓${hrvDropPct.toFixed(0)}% > 10%`
    );
    return finish("SKIP", 1);
  }

  // P1 — Sovraccarico → Modify
  if (acwr != null && acwr >= 1.3) {
    reasons.push(`P1 sovraccarico: ACWR ${acwr.toFixed(2)} ≥ 1.3`);
    return finish("MODIFY", 1);
  }
  if (tsb != null && tsb < -25 && hrvDropPct != null && hrvDropPct > 10) {
    reasons.push(
      `P1 sovraccarico: TSB ${tsb.toFixed(1)} < −25 con HRV ↓${hrvDropPct.toFixed(0)}% > 10%`
    );
    return finish("MODIFY", 1);
  }

  // P2 — Fatica accumulata. Da PRD §14.5: con 2+ segnali rossi il risultato
  // è Skip; con ambra ≥ soglia di fase (default 2, nessuna fase tightened
  // in Milestone 2) è Modify.
  if (redCount >= 2) {
    reasons.push(`P2 fatica accumulata: ${redCount} segnali rossi`);
    return finish("SKIP", 2);
  }
  if (amberCount >= 2) {
    reasons.push(`P2 fatica accumulata: ${amberCount} segnali ambra`);
    return finish("MODIFY", 2);
  }

  // P3 — Via libera
  reasons.push("P3: nessuna condizione di stop o fatica");
  return finish("GO", 3);
}
