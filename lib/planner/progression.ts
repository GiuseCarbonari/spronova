/**
 * Progressione DENTRO un formato (WORKOUT_REFERENCE.md §5.2) — dato + logica
 * PURA, nessuna AI.
 *
 * §5.2 "Progress within a format before changing format":
 *  1. Duration first  → +1 intervallo o +1 min per intervallo (4×4 → 5×4)
 *  2. Recovery second → −15..30 s di recupero (fuori scope di questa v1)
 *  3. Intensity last  → solo se completa sopra il fondo della zona (fuori scope)
 *
 * Gate (§5.2 + §11A): si avanza di UNO step solo se l'ultima occorrenza dello
 * stesso formato è stata COMPLETATA con costanza (compliance ≥ soglia). Un solo
 * vettore cambia per settimana. Se non completata, si RIPETE lo step (mai
 * regressione automatica: la regressione è dominio della readiness/fase).
 *
 * Questa v1 implementa SOLO il vettore "duration" sui formati hard strutturati
 * più comuni. Gli altri restano allo step base finché non si estende la scaletta.
 */

/** Compliance minima (0–100) per avanzare di uno step. */
export const PROGRESSION_COMPLIANCE_GATE = 90;

/** Uno step della scaletta di progressione di un formato (duration vector). */
export interface ProgressionStep {
  /** Numero di intervalli/blocchi di lavoro. */
  intervals: number;
  /** Durata di ogni intervallo in minuti. */
  interval_min: number;
  /** Recupero tra gli intervalli in minuti (informativo; non progredito in v1). */
  recovery_min: number;
  /** Minuti di lavoro totali (intervals × interval_min). */
  work_minutes: number;
  /** Minuti totali stimati della seduta (lavoro + WU/CD/recuperi). */
  est_total_minutes: number;
  /** Struttura testuale, coerente con lo stile della libreria. */
  structure: string;
}

/** Costruisce uno step calcolando work_minutes e la struttura testuale. */
function step(
  intervals: number,
  intervalMin: number,
  recoveryMin: number,
  /** Overhead fisso (WU+CD+recuperi) in minuti, per stimare il totale. */
  overheadMin: number
): ProgressionStep {
  const work = intervals * intervalMin;
  const recoveries = Math.max(0, intervals - 1) * recoveryMin;
  return {
    intervals,
    interval_min: intervalMin,
    recovery_min: recoveryMin,
    work_minutes: work,
    est_total_minutes: work + recoveries + overheadMin,
    structure: `${intervals} × ${intervalMin} min, con ${recoveryMin} min Z1 di recupero tra gli intervalli`,
  };
}

/**
 * Scalette di progressione per library_id. Lo step 0 corrisponde alla struttura
 * BASE del template (così uno storico vuoto parte da lì). Solo formati hard
 * strutturati con una progressione di durata sensata (§5.2 examples).
 *
 * Le scalette NON cambiano formato: quando si esaurisce lo step top-end, §5.3
 * dice di cambiare formato — lì interviene il selector (fuori scope di §5.2).
 */
export const PROGRESSION_LADDERS: Record<string, ProgressionStep[]> = {
  // VO2-1: 4×4 → 5×4 → 6×4 (overhead ~ WU/CD ~ 35′ sul totale base 70 con 3 rec da 3.5)
  "VO2-1": [
    step(4, 4, 4, 42), // base ≈ 16 work + 12 rec + 42 = 70
    step(5, 4, 4, 38), // ≈ 20 + 16 + 38 = 74
    step(6, 4, 4, 34), // ≈ 24 + 20 + 34 = 78
  ],
  // VO2-2 short-short: 8 → 9 → 10 rip per set (progressione rep count, §5.2)
  // Modellato come "intervalli" = ripetizioni equivalenti per semplicità del vettore.
  "VO2-2": [
    step(8, 1, 0, 36), // base ≈ 60 tot (struttura testuale sovrascritta sotto)
    step(9, 1, 0, 33),
    step(10, 1, 0, 30),
  ],
  // SS-5: 4×10 → 4×12 → 5×12 (duration → count, §5.2 sweet spot)
  "SS-5": [
    step(4, 10, 5, 30), // base ≈ 40 + 15 + 30 = 85
    step(4, 12, 5, 26), // ≈ 48 + 15 + 26 = 89
    step(5, 12, 5, 20), // ≈ 60 + 20 + 20 = 100
  ],
  // SS-1: 2×15 → 3×15 → 3×18 (duration progression, §5.2 esempio diretto)
  "SS-1": [
    step(2, 15, 5, 30), // base ≈ 30 + 5 + 30 = 65 (work_minutes base 65 → uso 2×15+overhead)
    step(3, 15, 5, 25), // ≈ 45 + 10 + 25 = 80
    step(3, 18, 5, 21), // ≈ 54 + 10 + 21 = 85
  ],
  // TH-1: 2×15 → 2×20 → 3×15 (threshold duration, §5.2 deload esempio inverso)
  "TH-1": [
    step(2, 15, 6, 28), // ≈ 30 + 6 + 28 = 64
    step(2, 20, 6, 24), // ≈ 40 + 6 + 24 = 70 (base)
    step(3, 15, 6, 18), // ≈ 45 + 12 + 18 = 75
  ],
  // TH-2 Seiler 4×8 → 5×8 → 6×8
  "TH-2": [
    step(4, 8, 2, 30), // ≈ 32 + 6 + 30 = 68 (base)
    step(5, 8, 2, 26), // ≈ 40 + 8 + 26 = 74
    step(6, 8, 2, 22), // ≈ 48 + 10 + 22 = 80
  ],
};

/** Override testuale per i formati short-short (la struttura step() non si applica). */
const SHORT_SHORT_STRUCTURE: Record<string, (s: ProgressionStep) => string> = {
  "VO2-2": (s) =>
    `2–3 set da ${s.intervals} ripetizioni di 30 s on / 15 s off. 5 min Z1 tra i set.`,
};

// --- Vettori recovery & intensity (§5.2: "recovery second", "intensity last") -

/**
 * Quanti sub-step di RECOVERY ha un formato (riduzione del recupero) e di quanti
 * minuti ciascuno. §5.2: "reduce rest by 15–30 s" → 0.5 min/step. Si applica
 * SOLO dopo aver esaurito il vettore duration.
 */
export const RECOVERY_STEPS_BY_FORMAT: Record<string, { steps: number; deltaMin: number }> = {
  "VO2-1": { steps: 2, deltaMin: 0.5 }, // 4 → 3.5 → 3 min di recupero
  "SS-5": { steps: 2, deltaMin: 0.5 }, // 5 → 4.5 → 4
  "SS-1": { steps: 2, deltaMin: 0.5 },
  "TH-1": { steps: 2, deltaMin: 0.5 },
  "TH-2": { steps: 1, deltaMin: 0.5 }, // recupero già breve (2 min)
  // VO2-2 short-short: il rapporto on/off è fisso per definizione del formato.
  "VO2-2": { steps: 0, deltaMin: 0 },
};

/**
 * Quanti sub-step di INTENSITY ha un formato. §5.2: "intensity last" — alza il
 * target verso il fondo-alto della zona. Modellato come nota di prescrizione
 * (niente watt inventati). 1 = un solo livello "target alto della zona".
 */
export const INTENSITY_STEPS_BY_FORMAT: Record<string, number> = {
  "VO2-1": 1,
  "VO2-2": 1,
  "SS-5": 1,
  "SS-1": 1,
  "TH-1": 1,
  "TH-2": 1,
};

/** Compliance più alta richiesta per il vettore intensity (§5.2 più cauto). */
export const INTENSITY_COMPLIANCE_GATE = 95;

/** Stato di progressione multi-vettore di un formato (§5.2). */
export interface ProgressionState {
  /** Step del vettore DURATION (indice nella scaletta). */
  duration: number;
  /** Step del vettore RECOVERY (0 = recupero pieno). */
  recovery: number;
  /** Step del vettore INTENSITY (0 = fondo zona). */
  intensity: number;
}

const ZERO_STATE: ProgressionState = { duration: 0, recovery: 0, intensity: 0 };

/** Numero di sub-step recovery per un formato. */
function recoveryLength(libraryId: string): number {
  return RECOVERY_STEPS_BY_FORMAT[libraryId]?.steps ?? 0;
}

/** Numero di sub-step intensity per un formato. */
function intensityLength(libraryId: string): number {
  return INTENSITY_STEPS_BY_FORMAT[libraryId] ?? 0;
}

/** true se il formato ha una scaletta di progressione definita. */
export function hasProgression(libraryId: string): boolean {
  return libraryId in PROGRESSION_LADDERS;
}

/** Numero di step disponibili per un formato (0 se non progredibile). */
export function progressionLength(libraryId: string): number {
  return PROGRESSION_LADDERS[libraryId]?.length ?? 0;
}

/**
 * Ritorna lo step `index` (clampato all'ultimo disponibile) per un formato, con
 * la struttura testuale corretta (override per short-short). Null se il formato
 * non è progredibile o l'indice è negativo.
 */
export function getProgressionStep(
  libraryId: string,
  index: number
): ProgressionStep | null {
  const ladder = PROGRESSION_LADDERS[libraryId];
  if (!ladder || ladder.length === 0 || index < 0) return null;
  const clamped = Math.min(index, ladder.length - 1);
  const s = ladder[clamped];
  const structureFn = SHORT_SHORT_STRUCTURE[libraryId];
  return structureFn ? { ...s, structure: structureFn(s) } : s;
}

/**
 * Decide lo step della settimana corrente per un formato, dato lo step
 * precedente (o null se prima volta) e la compliance dell'ultima occorrenza.
 *
 * Regole §5.2:
 *  - prima volta → step 0 (base);
 *  - compliance ≥ gate → avanza di 1 (clampato al top della scaletta);
 *  - altrimenti → ripete lo stesso step (consolidamento, niente regressione).
 *
 * @param libraryId       Formato.
 * @param previousStep    Step usato l'ultima volta (null se mai prescritto).
 * @param lastCompliance  Compliance 0–100 dell'ultima occorrenza (null se ignota).
 */
export function nextProgressionStep(
  libraryId: string,
  previousStep: number | null,
  lastCompliance: number | null
): number {
  const len = progressionLength(libraryId);
  if (len === 0) return 0;
  if (previousStep == null) return 0; // prima esposizione: parti dalla base
  const top = len - 1;
  const completed =
    lastCompliance != null && lastCompliance >= PROGRESSION_COMPLIANCE_GATE;
  const next = completed ? previousStep + 1 : previousStep;
  return Math.max(0, Math.min(top, next));
}

/** Clampa uno stato multi-vettore ai limiti del formato. */
function clampState(libraryId: string, st: ProgressionState): ProgressionState {
  return {
    duration: Math.max(0, Math.min(progressionLength(libraryId) - 1, st.duration)),
    recovery: Math.max(0, Math.min(recoveryLength(libraryId), st.recovery)),
    intensity: Math.max(0, Math.min(intensityLength(libraryId), st.intensity)),
  };
}

/**
 * Avanza lo stato multi-vettore di UN SOLO vettore (§5.2: "only one vector per
 * week"), nell'ordine fermo duration → recovery → intensity:
 *  - se la duration non è al top → avanza duration;
 *  - altrimenti se la recovery non è al top → avanza recovery;
 *  - altrimenti se l'intensity non è al top → avanza intensity (gate più alto);
 *  - altrimenti resta (formato esaurito: §5.3 dirà di cambiare formato).
 *
 * Avanza solo se l'ultima occorrenza è stata COMPLETATA (compliance ≥ gate).
 * Niente regressione automatica (consolida lo stesso stato).
 *
 * @param previousState   Stato precedente (null = prima esposizione).
 * @param lastCompliance  Compliance 0–100 dell'ultima occorrenza.
 */
export function nextProgressionState(
  libraryId: string,
  previousState: ProgressionState | null,
  lastCompliance: number | null
): ProgressionState {
  if (!hasProgression(libraryId)) return ZERO_STATE;
  if (previousState == null) return ZERO_STATE; // prima esposizione: base
  const prev = clampState(libraryId, previousState);

  const completed =
    lastCompliance != null && lastCompliance >= PROGRESSION_COMPLIANCE_GATE;
  if (!completed) return prev; // consolida

  const durTop = progressionLength(libraryId) - 1;
  const recTop = recoveryLength(libraryId);
  const intTop = intensityLength(libraryId);

  if (prev.duration < durTop) {
    return { ...prev, duration: prev.duration + 1 };
  }
  if (prev.recovery < recTop) {
    return { ...prev, recovery: prev.recovery + 1 };
  }
  if (prev.intensity < intTop) {
    // §5.2 intensity last: gate più severo ("completa sopra il fondo zona").
    if (lastCompliance != null && lastCompliance >= INTENSITY_COMPLIANCE_GATE) {
      return { ...prev, intensity: prev.intensity + 1 };
    }
    return prev; // completata ma non abbastanza per alzare l'intensità
  }
  return prev; // formato al massimo: §5.3 (cambio formato) — fuori scope qui
}

/** Risultato risolto di uno stato multi-vettore: struttura + durata + note. */
export interface ResolvedProgression {
  /** Step di durata sottostante (per audit/retrocompat). */
  duration_step: number;
  est_total_minutes: number;
  structure: string;
  /** Note di prescrizione per i vettori recovery/intensity applicati. */
  notes: string[];
}

/**
 * Risolve uno stato multi-vettore nella prescrizione concreta: prende lo step
 * di durata, poi applica la riduzione del recupero e la nota di intensità.
 * Null se il formato non è progredibile.
 */
export function resolveProgressionState(
  libraryId: string,
  state: ProgressionState
): ResolvedProgression | null {
  const base = getProgressionStep(libraryId, state.duration);
  if (!base) return null;
  const st = clampState(libraryId, state);
  const notes: string[] = [];

  let recoveryMin = base.recovery_min;
  let structure = base.structure;
  let estTotal = base.est_total_minutes;

  // Vettore recovery: riduci il recupero e ricalcola la struttura/totale.
  const rec = RECOVERY_STEPS_BY_FORMAT[libraryId];
  if (rec && st.recovery > 0 && rec.deltaMin > 0) {
    const reduction = rec.deltaMin * st.recovery;
    const newRecovery = Math.max(0, recoveryMin - reduction);
    // Il totale cala della riduzione totale sui recuperi tra gli intervalli.
    const gaps = Math.max(0, base.intervals - 1);
    estTotal = Math.round(estTotal - reduction * gaps);
    recoveryMin = newRecovery;
    structure = `${base.intervals} × ${base.interval_min} min, con ${newRecovery} min Z1 di recupero tra gli intervalli`;
    notes.push(
      `Progressione §5.2 (recovery): recupero ridotto a ${newRecovery}′ tra gli intervalli — stessa durata di lavoro, densità maggiore.`
    );
  }

  // Vettore intensity: nota di prescrizione (niente watt inventati).
  if (st.intensity > 0) {
    notes.push(
      "Progressione §5.2 (intensity): punta al fondo-alto della zona target. Alza solo se reggi la potenza per l'intera serie."
    );
  }

  return { duration_step: st.duration, est_total_minutes: estTotal, structure, notes };
}

/** Converte il vecchio progression_step (number) nello stato multi-vettore. */
export function stepToState(progressionStep: number | undefined): ProgressionState {
  return progressionStep == null
    ? { ...ZERO_STATE }
    : { duration: progressionStep, recovery: 0, intensity: 0 };
}

/** true se lo stato è il base (nessun vettore avanzato). */
export function isBaseState(st: ProgressionState): boolean {
  return st.duration === 0 && st.recovery === 0 && st.intensity === 0;
}

// --- Stato derivato dallo storico --------------------------------------------

/** Seduta storica minima necessaria a derivare la progressione. */
export interface HistoricalSession {
  date: string; // YYYY-MM-DD
  library_id: string | null;
  progression_step?: number;
  /** Stato multi-vettore §5.2 (assente sui piani vecchi → derivato da step). */
  progression_state?: ProgressionState;
}

/**
 * Calcola lo step di progressione di QUESTA settimana per ogni formato
 * progredibile, a partire dallo storico dei piani e dalla compliance reale.
 *
 * Per ciascun formato con scaletta: trova l'ULTIMA occorrenza nello storico
 * (data più recente), legge lo step usato e la sua compliance, poi applica
 * `nextProgressionStep`. Formati mai prescritti → step 0 (base).
 *
 * Funzione PURA: stesso storico + compliance → stesso risultato.
 *
 * @param historicalSessions Sedute dei piani precedenti (qualsiasi numero di
 *                           settimane). Solo le hard con library_id contano.
 * @param complianceByDate   Compliance 0–100 per data (da Intervals); assente
 *                           = seduta non completata / nessun dato.
 */
export function computeProgressionByFormat(
  historicalSessions: HistoricalSession[],
  complianceByDate: Record<string, number>
): Record<string, number> {
  // Ultima occorrenza per formato progredibile.
  const lastByFormat = new Map<string, HistoricalSession>();
  for (const s of historicalSessions) {
    if (!s.library_id || !hasProgression(s.library_id)) continue;
    const prev = lastByFormat.get(s.library_id);
    if (!prev || s.date > prev.date) lastByFormat.set(s.library_id, s);
  }

  const result: Record<string, number> = {};
  for (const libraryId of Object.keys(PROGRESSION_LADDERS)) {
    const last = lastByFormat.get(libraryId);
    const previousStep = last?.progression_step ?? (last ? 0 : null);
    const lastCompliance = last ? complianceByDate[last.date] ?? null : null;
    result[libraryId] = nextProgressionStep(libraryId, previousStep, lastCompliance);
  }
  return result;
}

/**
 * Variante multi-vettore (§5.2): stato {duration,recovery,intensity} per formato.
 * Legge l'ultima occorrenza, ricostruisce lo stato precedente (da
 * progression_state se presente, altrimenti dal vecchio progression_step) e
 * avanza di un solo vettore se completata. Retrocompatibile coi piani vecchi.
 */
export function computeProgressionStateByFormat(
  historicalSessions: HistoricalSession[],
  complianceByDate: Record<string, number>
): Record<string, ProgressionState> {
  const lastByFormat = new Map<string, HistoricalSession>();
  for (const s of historicalSessions) {
    if (!s.library_id || !hasProgression(s.library_id)) continue;
    const prev = lastByFormat.get(s.library_id);
    if (!prev || s.date > prev.date) lastByFormat.set(s.library_id, s);
  }

  const result: Record<string, ProgressionState> = {};
  for (const libraryId of Object.keys(PROGRESSION_LADDERS)) {
    const last = lastByFormat.get(libraryId);
    const previousState = last
      ? last.progression_state ?? stepToState(last.progression_step)
      : null;
    const lastCompliance = last ? complianceByDate[last.date] ?? null : null;
    result[libraryId] = nextProgressionState(libraryId, previousState, lastCompliance);
  }
  return result;
}
