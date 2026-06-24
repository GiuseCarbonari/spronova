/**
 * Session selector (Section 11 B §3-§4 + WORKOUT_REFERENCE.md §3/§5) —
 * funzione PURA e deterministica: stessi input → stessa settimana.
 *
 * Decide QUALI sedute mettere e in QUALI giorni, rispettando le regole ferme:
 *  - max 2 sedute dure/sett (amatoriale ≤10h), 3 se >10h;               (§4)
 *  - spacing minimo 48h tra sedute dure (≥1 giorno facile in mezzo);     (§3.1)
 *  - 1 lungo di durabilità, di norma nel weekend;                        (§3.3)
 *  - readiness MODIFY → solo SS-4/AE-7 come "dura"; SKIP → niente dura.  (spec D)
 *
 * Ogni `library_id` proviene dal catalogo reale (workout-library.ts). La
 * selezione del template specifico segue la decision matrix §5.1 + i
 * limitatori della gap analysis. Nessuna AI, nessun numero inventato.
 */

import { getTemplate, type WorkoutTemplate } from "@/lib/planner/workout-library";
import { getRunTemplate } from "@/lib/planner/run-workout-library";
import type { Phase } from "@/lib/planner/phase-detector";
import {
  resolveProgressionState,
  isBaseState,
  type ProgressionState,
} from "@/lib/planner/progression";

export type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export const DAY_KEYS: DayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const WEEKEND: DayKey[] = ["sat", "sun"];

export type SessionSlot =
  | "primary_hard"
  | "secondary_hard"
  | "third_hard"
  | "long_ride"
  | "opener"
  | "easy"
  | "recovery"
  | "rest";

export interface SelectedSession {
  day: DayKey;
  /** null = giorno di riposo. Altrimenti un id REALE della Workout Library. */
  library_id: string | null;
  is_hard: boolean;
  slot: SessionSlot;
  adapted_duration_min: number | null;
  target_zone: string | null;
  rationale: string;
  /** Step di progressione §5.2 (duration vector, 0 = base). Retrocompat. */
  progression_step?: number;
  /** Stato multi-vettore §5.2 {duration,recovery,intensity}. */
  progression_state?: ProgressionState;
}

/** Sottoinsieme del dossier che serve al planner (§12.2). */
export interface PlannerDossier {
  disponibilita_ore_sett: number | null;
  giorni_preferiti: string[];
  giorni_impossibili: string[];
  durata_max_weekday_min: number | null;
  durata_max_weekend_min: number | null;
  indoor_outdoor: string | null;
  ha_rulli: boolean | null;
  sport_principali?: string[];
}

/** true se lo sport principale è corsa (running/trail), non ciclismo. */
export function isRunSport(dossier: PlannerDossier): boolean {
  const sports = dossier.sport_principali ?? [];
  if (sports.length === 0) return false;
  const running = sports.some((s) =>
    /corsa|running|trail/i.test(s)
  );
  const cycling = sports.some((s) =>
    /cicl|mtb|gravel|bici|bike/i.test(s)
  );
  // Running se ha sport di corsa E non ha sport di ciclismo come primo sport,
  // oppure se non ha affatto sport di ciclismo.
  return running && !cycling;
}

/** Readiness di OGGI (l'unica disponibile): si applica al giorno corrente. */
export interface PlannerReadiness {
  decision: "GO" | "MODIFY" | "SKIP";
  /** Giorno della settimana a cui si riferisce, o null se sconosciuto. */
  dayKey: DayKey | null;
  /** TSB odierno (CTL - ATL, letto dal mirror). Null se non disponibile. */
  tsb?: number | null;
  /** Recovery Index odierno (letto dal mirror). Null se non disponibile. */
  ri?: number | null;
}

/** Soglie dell'eccezione "sedute dure consecutive" (WORKOUT_REFERENCE.md §3.1). */
const BACK_TO_BACK_RI_MIN = 0.85;

/**
 * Distanza minima (in giorni) richiesta tra sedute dure. 2 di norma (48h);
 * 1 (consecutive ammesse) solo se TSB > 0 e RI ≥ 0.85 (§3.1, eccezione).
 */
export function effectiveMinGapDays(tsb: number | null, ri: number | null): number {
  return tsb != null && tsb > 0 && ri != null && ri >= BACK_TO_BACK_RI_MIN ? 1 : 2;
}

export interface PlannerLimiters {
  /** training_lever dei limitatori (gap-analysis). */
  levers: string[];
}

const HARD_LIMIT_LOW_HOURS = 10; // ≤10h ⇒ max 2 dure; >10h ⇒ 3

function dayIndex(day: DayKey): number {
  return DAY_KEYS.indexOf(day);
}

/**
 * Priorità di SEQUENCING per dominio (WORKOUT_REFERENCE.md §3.2). Più alto =
 * va piazzato PRIMA nella settimana (giorni più freschi). Usato per ordinare
 * le dure ravvicinate.
 *
 *  - anaerobic: massima freschezza richiesta ("place early in the week").
 *  - vo2max / threshold: alta (TH trattato come VO₂max — alto costo recupero).
 *  - strength_endurance: media-alta ma con vincolo "non prima di VO₂max/lungo"
 *    (gestito a parte); qui sotto VO₂max così non lo precede.
 *  - sweet_spot / tempo / race_specific: più bassa.
 */
function sequencingPriority(domain: string | undefined): number {
  switch (domain) {
    case "anaerobic":
      return 5;
    case "vo2max":
    case "threshold":
      return 4;
    case "strength_endurance":
      return 3;
    case "race_specific":
      return 2;
    case "sweet_spot":
    case "tempo":
      return 1;
    default:
      return 0;
  }
}

/** Dominio del template (ciclismo o corsa) per un library_id. */
function domainOf(libraryId: string, isRun: boolean): string | undefined {
  const t = isRun ? getRunTemplate(libraryId) : getTemplate(libraryId);
  return t?.domain;
}

/**
 * §3.2 — Applica l'ordering alle dure RAVVICINATE. Per ogni coppia di sedute
 * dure consecutive (tra cui c'è ≤1 giorno di recupero, cioè gap di giorni ≤2)
 * la cui priorità di sequencing è invertita, scambia i due giorni: la dura a
 * priorità più alta deve venire prima. Con gap ≥3 (≥2 giorni di recupero)
 * l'ordine è ininfluente e non si interviene. Mutazione in-place della mappa.
 */
function enforceCloseHardOrdering(
  sessions: Map<DayKey, SelectedSession>,
  isRun: boolean
): void {
  const hard = DAY_KEYS.map((d) => sessions.get(d)).filter(
    (s): s is SelectedSession => s != null && s.is_hard && s.library_id != null
  );
  for (let i = 0; i < hard.length - 1; i++) {
    const a = hard[i];
    const b = hard[i + 1];
    const gap = dayIndex(b.day) - dayIndex(a.day); // ≥1 (a precede b)
    if (gap > 2) continue; // ≥2 giorni di recupero: ordine ininfluente
    const pa = sequencingPriority(domainOf(a.library_id!, isRun));
    const pb = sequencingPriority(domainOf(b.library_id!, isRun));
    if (pb > pa) {
      // b (priorità più alta) dovrebbe precedere a: scambia i giorni.
      const swappedA: SelectedSession = { ...b, day: a.day };
      const swappedB: SelectedSession = { ...a, day: b.day };
      sessions.set(a.day, swappedA);
      sessions.set(b.day, swappedB);
      hard[i] = swappedA;
      hard[i + 1] = swappedB;
    }
  }
}

/** Giorni allenabili: i preferiti se indicati, altrimenti tutti meno gli impossibili. */
export function computeAvailableDays(dossier: PlannerDossier): DayKey[] {
  const impossible = new Set(dossier.giorni_impossibili ?? []);
  const preferred = (dossier.giorni_preferiti ?? []).filter((d): d is DayKey =>
    (DAY_KEYS as string[]).includes(d)
  );
  const basis = preferred.length > 0 ? preferred : DAY_KEYS;
  return DAY_KEYS.filter((d) => basis.includes(d) && !impossible.has(d));
}

/** Distanza minima in giorni da tutti i giorni "duri" già piazzati (48h ⇒ ≥2). */
function respects48h(day: DayKey, hardDays: DayKey[], minGapDays: number): boolean {
  return hardDays.every((h) => Math.abs(dayIndex(day) - dayIndex(h)) >= minGapDays);
}

/** Primo giorno disponibile tra i candidati che rispetta lo spacing minimo. */
function pickDay(
  candidates: DayKey[],
  available: Set<DayKey>,
  taken: Set<DayKey>,
  hardDays: DayKey[],
  enforce48h: boolean,
  minGapDays = 2
): DayKey | null {
  for (const d of candidates) {
    if (!available.has(d) || taken.has(d)) continue;
    if (enforce48h && !respects48h(d, hardDays, minGapDays)) continue;
    return d;
  }
  return null;
}

// --- Scelta dei template per slot (decision matrix §5.1 + limitatori) --------

interface SlotChoice {
  library_id: string;
  note: string;
}

// --- Template per la CORSA (run-workout-library) ----------------------------

function primaryHardChoiceRun(phase: Phase): SlotChoice {
  switch (phase) {
    case "build":
    case "peak":
      return { library_id: "RV-1", note: "VO₂max (ripetute) prioritario in build/peak" };
    case "base":
      return { library_id: "RS-1", note: "Tempo run come dura principale in base" };
    case "taper":
      return { library_id: "RR-2", note: "Opener pre-gara in taper" };
    case "recovery":
      return { library_id: "RA-4", note: "Solo recupero in fase recovery" };
  }
}

function secondaryHardChoiceRun(phase: Phase, lev: Set<string>): SlotChoice {
  if (phase === "recovery" || phase === "taper") {
    return { library_id: "RA-1", note: "Nessuna seconda dura in recovery/taper" };
  }
  if (lev.has("threshold_long") && (phase === "build" || phase === "peak")) {
    return { library_id: "RS-1", note: "Limitatore threshold_long → tempo run diretto" };
  }
  if (phase === "peak") {
    return { library_id: "RR-1", note: "Lavoro race-specific (race-pace run) in peak" };
  }
  if (phase === "base") {
    return { library_id: "RS-2", note: "Cruise intervals come seconda dura in base" };
  }
  return { library_id: "RS-1", note: "Seconda strutturata tempo run in build" };
}

function longRunChoice(phase: Phase, lev: Set<string>): SlotChoice {
  if (phase === "recovery") {
    return { library_id: "RA-2", note: "Lungo ridotto (Z2, cap) in recovery" };
  }
  if (lev.has("durability_fatigued") && (phase === "build" || phase === "peak")) {
    return { library_id: "RA-6", note: "Limitatore durabilità → lungo fast-finish (occupa slot duro)" };
  }
  return { library_id: "RA-3", note: "Lungo di durabilità settimanale" };
}

/** Template della seduta dura PRIMARIA per fase. */
function primaryHardChoice(phase: Phase): SlotChoice {
  switch (phase) {
    case "build":
    case "peak":
      return { library_id: "VO2-1", note: "VO₂max prioritario in build/peak (§5.1)" };
    case "base":
      return { library_id: "SS-1", note: "Sweet spot come dura principale in base (§5.1)" };
    case "taper":
      return { library_id: "MIX-2", note: "Opener pre-gara in taper (§4.3 race-week)" };
    case "recovery":
      return { library_id: "AE-4", note: "Solo recupero in fase recovery (§4.3)" };
  }
}

/** Template della seduta dura SECONDARIA per fase + limitatori. */
function secondaryHardChoice(phase: Phase, lev: Set<string>): SlotChoice {
  if (phase === "recovery" || phase === "taper") {
    return { library_id: "AE-1", note: "Nessuna seconda dura in recovery/taper" };
  }
  if (lev.has("threshold_long") && (phase === "build" || phase === "peak")) {
    return { library_id: "TH-1", note: "Limitatore threshold_long → soglia diretta (§5.1)" };
  }
  if (phase === "peak") {
    return { library_id: "MIX-1", note: "Lavoro race-specific in peak (§5.1)" };
  }
  if (phase === "base") {
    return { library_id: "SS-5", note: "Seconda sweet spot ripetuta in base" };
  }
  // build di default: seconda sweet spot (pairing con eventuale durabilità)
  return { library_id: "SS-1", note: "Seconda strutturata sweet spot in build" };
}

/** Template del lungo per fase + limitatore durabilità. */
function longRideChoice(phase: Phase, lev: Set<string>): SlotChoice {
  if (phase === "recovery") {
    return { library_id: "AE-2", note: "Lungo ridotto (Z2, cap) in recovery (§4.3)" };
  }
  if (lev.has("durability_fatigued") && (phase === "build" || phase === "peak")) {
    return { library_id: "AE-6", note: "Limitatore durabilità → lungo fast-finish (§5.1, occupa slot duro)" };
  }
  return { library_id: "AE-3", note: "Lungo di durabilità settimanale (§4)" };
}

/** Downgrade per giornata MODIFY: una "dura" diventa SS-4 (tempo). */
const MODIFY_DOWNGRADE_ID = "SS-4";
/** AE-6 (lungo duro) in MODIFY scende a AE-3 (toglie il finale Z3). */
const LONG_MODIFY_DOWNGRADE_ID = "AE-3";

// --- Adattamento durata al dossier (§5.4 time-crunch) ------------------------

function capForDay(day: DayKey, dossier: PlannerDossier): number | null {
  const cap = WEEKEND.includes(day)
    ? dossier.durata_max_weekend_min
    : dossier.durata_max_weekday_min;
  return cap != null && cap > 0 ? cap : null;
}

/** Nota di fattibilità indoor (no rulli + lungo) — non cambia i minuti. */
function indoorNote(template: WorkoutTemplate, dossier: PlannerDossier): string | null {
  if (
    dossier.indoor_outdoor === "indoor" &&
    dossier.ha_rulli === false &&
    template.domain === "endurance" &&
    template.est_total_minutes >= 120
  ) {
    return "Senza rulli un lungo indoor non è fattibile: da svolgere outdoor.";
  }
  return null;
}

/** Costruisce la SelectedSession a partire dal template scelto. */
function buildSession(
  day: DayKey,
  libraryId: string,
  slot: SessionSlot,
  baseNote: string,
  dossier: PlannerDossier,
  extraNotes: string[],
  isRun = false,
  /** Stato di progressione §5.2 (multi-vettore) per questo formato. */
  progressionState?: ProgressionState,
  /** Fattore volume del mesociclo §4.2 (1 = nessuna variazione). */
  volumeFactor = 1
): SelectedSession {
  const template = isRun ? getRunTemplate(libraryId) : getTemplate(libraryId);
  if (!template) {
    return {
      day,
      library_id: null,
      is_hard: false,
      slot: "rest",
      adapted_duration_min: null,
      target_zone: null,
      rationale: `Template ${libraryId} assente in libreria: riposo precauzionale.`,
    };
  }
  const notes = [baseNote, ...extraNotes];

  // §5.2 — progressione multi-vettore (solo ciclismo, solo formati con scaletta).
  // duration → recovery → intensity. Sovrascrive durata/struttura PRIMA del cap.
  let estTotal = template.est_total_minutes;
  let appliedState: ProgressionState | undefined;
  if (!isRun && progressionState != null) {
    const resolved = resolveProgressionState(libraryId, progressionState);
    if (resolved) {
      estTotal = resolved.est_total_minutes;
      appliedState = progressionState;
      if (!isBaseState(progressionState) && resolved.duration_step > 0) {
        notes.push(
          `Progressione §5.2 (durata, step ${resolved.duration_step}): ${resolved.structure}.`
        );
      }
      notes.push(...resolved.notes);
    }
  }

  // §4.2 — traiettoria volume del mesociclo: scala la durata prescritta.
  if (volumeFactor !== 1) {
    estTotal = Math.round(estTotal * volumeFactor);
  }

  const cap = capForDay(day, dossier);
  const truncated = cap != null && estTotal > cap;
  const minutes = truncated ? cap : estTotal;
  if (truncated) {
    notes.push(
      `Durata adattata a ${minutes}′ (max del giorno): applicate regole time-crunch §5.4 (taglia CD, poi WU, poi n. intervalli).`
    );
  }
  // Nota indoor solo per il ciclismo (la corsa non richiede rulli)
  if (!isRun) {
    const indoor = indoorNote(template as WorkoutTemplate, dossier);
    if (indoor) notes.push(indoor);
  }

  return {
    day,
    library_id: libraryId,
    is_hard: template.is_hard_session,
    slot,
    adapted_duration_min: minutes,
    target_zone: template.power_target_zone,
    rationale: notes.filter(Boolean).join(" "),
    ...(appliedState != null
      ? { progression_step: appliedState.duration, progression_state: appliedState }
      : {}),
  };
}

// --- selectWeekSessions ------------------------------------------------------

/**
 * Compone la settimana. Ritorna 7 voci (lun→dom): le sedute assegnate più i
 * giorni di riposo (library_id null), così la griglia è completa e la
 * validazione può contare hard/spacing su tutta la settimana.
 */
export function selectWeekSessions(
  phase: Phase,
  dossier: PlannerDossier,
  readiness: PlannerReadiness,
  gapAnalysis: PlannerLimiters | null,
  availableDays: DayKey[],
  /**
   * Stato di progressione §5.2 per formato (library_id → stato multi-vettore di
   * questa settimana), derivato dallo storico dal chiamante. Vuoto = base.
   */
  progressionByFormat: Record<string, ProgressionState> = {},
  /**
   * Posizione nel mesociclo §4.2: fattore volume e flag scarico. Default neutro
   * (volume_factor 1, niente deload) se il chiamante non lo passa.
   */
  mesocycle: { volume_factor: number; is_deload: boolean } = {
    volume_factor: 1,
    is_deload: false,
  }
): SelectedSession[] {
  const available = new Set(availableDays);
  const lev = new Set(gapAnalysis?.levers ?? []);
  const volumeFactor = mesocycle.volume_factor;
  // §4.2 — in scarico una sola seduta strutturata (ridotta); altrimenti il
  // tetto dipende dalle ore disponibili (≤10h → 2, >10h → 3).
  const maxHard = mesocycle.is_deload
    ? 1
    : (dossier.disponibilita_ore_sett ?? 0) > HARD_LIMIT_LOW_HOURS
      ? 3
      : 2;
  const minGapDays = effectiveMinGapDays(readiness.tsb ?? null, readiness.ri ?? null);

  const run = isRunSport(dossier);

  // readiness si applica solo al giorno indicato (oggi).
  const readinessDay = readiness.dayKey;
  const isReadinessDay = (d: DayKey) => readinessDay != null && d === readinessDay;

  const sessions = new Map<DayKey, SelectedSession>();
  const hardDays: DayKey[] = [];
  const taken = new Set<DayKey>();

  // ID di recupero/facile in base allo sport
  const recoveryId = run ? "RA-4" : "AE-4";
  const easyId = run ? "RA-1" : "AE-1";

  // Downgrade MODIFY per le sedute dure
  const modifyDowngradeId = run ? "RS-4" : MODIFY_DOWNGRADE_ID;
  const longModifyDowngradeId = run ? "RA-3" : LONG_MODIFY_DOWNGRADE_ID;

  // recovery/taper: niente sedute dure strutturate, settimana leggera.
  const allowStructuredHard = phase !== "recovery" && phase !== "taper";

  // 1) Lungo (di norma weekend). In taper niente lungo.
  let longDay: DayKey | null = null;
  if (phase !== "taper") {
    const longChoice = run ? longRunChoice(phase, lev) : longRideChoice(phase, lev);
    const longTemplate = run
      ? getRunTemplate(longChoice.library_id)
      : getTemplate(longChoice.library_id);
    const longIsHard = longTemplate?.is_hard_session ?? false;
    longDay =
      pickDay(["sat", "sun"], available, taken, hardDays, false) ??
      [...DAY_KEYS].reverse().find((d) => available.has(d)) ??
      null;

    if (longDay) {
      let libId = longChoice.library_id;
      const extra: string[] = [];
      if (longIsHard && isReadinessDay(longDay) && readiness.decision === "MODIFY") {
        libId = longModifyDowngradeId;
        extra.push("Readiness MODIFY oggi: lungo fast-finish declassato a Z2 puro.");
      }
      if (longIsHard && isReadinessDay(longDay) && readiness.decision === "SKIP") {
        libId = recoveryId;
        extra.push("Readiness SKIP oggi: lungo sostituito da recupero attivo.");
      }
      const finalTemplate = run ? getRunTemplate(libId) : getTemplate(libId);
      const session = buildSession(
        longDay,
        libId,
        "long_ride",
        `Fase ${phase}. Lungo settimanale. ${longChoice.note}.`,
        dossier,
        extra,
        run,
        undefined,
        volumeFactor
      );
      sessions.set(longDay, session);
      taken.add(longDay);
      if (finalTemplate?.is_hard_session) hardDays.push(longDay);
    }
  }

  // 2) Quante dure strutturate restano da piazzare.
  const longConsumesHardSlot = longDay != null && hardDays.includes(longDay);
  const structuredBudget = allowStructuredHard
    ? Math.max(0, maxHard - (longConsumesHardSlot ? 1 : 0))
    : 0;
  const structuredTarget = Math.min(structuredBudget, maxHard >= 3 ? 3 : 2);

  const hardSlotPlan: Array<{ slot: SessionSlot; choice: SlotChoice }> = [];
  if (structuredTarget >= 1) {
    hardSlotPlan.push({
      slot: "primary_hard",
      choice: run ? primaryHardChoiceRun(phase) : primaryHardChoice(phase),
    });
  }
  if (structuredTarget >= 2) {
    hardSlotPlan.push({
      slot: "secondary_hard",
      choice: run ? secondaryHardChoiceRun(phase, lev) : secondaryHardChoice(phase, lev),
    });
  }
  if (structuredTarget >= 3) {
    const thirdId = run ? "RS-4" : "SS-4";
    hardSlotPlan.push({
      slot: "third_hard",
      choice: { library_id: thirdId, note: "Terza strutturata (volume tempo) — disponibilità alta" },
    });
  }

  // 3) Ordina le dure per priorità di sequencing §3.2 PRIMA di assegnare i
  //    giorni: la seduta che richiede più freschezza (anaerobico, poi
  //    VO₂max/threshold) prende i giorni più "early". A parità, l'ordine
  //    originale (primaria prima della secondaria) viene mantenuto (sort stabile).
  const orderedSlotPlan = hardSlotPlan
    .map((entry, i) => ({ entry, i }))
    .sort((a, b) => {
      const pa = sequencingPriority(domainOf(a.entry.choice.library_id, run));
      const pb = sequencingPriority(domainOf(b.entry.choice.library_id, run));
      return pb - pa || a.i - b.i;
    })
    .map((x) => x.entry);

  // Pool di candidati condiviso, da inizio a fine settimana: chi ha priorità
  // più alta (piazzato per primo) sceglie i giorni più freschi.
  const earlyToLate: DayKey[] = ["tue", "wed", "thu", "mon", "fri", "sat", "sun"];

  for (const { slot, choice } of orderedSlotPlan) {
    const day = pickDay(earlyToLate, available, taken, hardDays, true, minGapDays);
    if (!day) continue;

    let libId = choice.library_id;
    const extra: string[] = [];
    if (minGapDays === 1 && hardDays.some((h) => Math.abs(dayIndex(day) - dayIndex(h)) === 1)) {
      extra.push(
        "Sedute dure consecutive ammesse: TSB>0 e RI≥0.85 (§3.1, eccezione al gap 48h)."
      );
    }
    if (isReadinessDay(day) && readiness.decision === "MODIFY") {
      libId = modifyDowngradeId;
      extra.push(
        run
          ? "Readiness MODIFY oggi: dura declassata a tempo moderato (RS-4)."
          : "Readiness MODIFY oggi: dura declassata a tempo (SS-4/AE-7, §5.1)."
      );
    } else if (isReadinessDay(day) && readiness.decision === "SKIP") {
      const session = buildSession(
        day,
        recoveryId,
        "recovery",
        `Fase ${phase}. Readiness SKIP oggi: niente seduta dura, recupero attivo.`,
        dossier,
        [],
        run
      );
      sessions.set(day, session);
      taken.add(day);
      continue;
    }

    if (mesocycle.is_deload) {
      extra.push(
        "Settimana di scarico §4.2: unica seduta strutturata, volume ridotto a intensità invariata."
      );
    }

    const finalTemplate = run ? getRunTemplate(libId) : getTemplate(libId);
    const session = buildSession(
      day,
      libId,
      slot,
      `Fase ${phase}. Seduta dura ${slot === "primary_hard" ? "primaria" : slot === "secondary_hard" ? "secondaria" : "aggiuntiva"}. ${choice.note}.`,
      dossier,
      extra,
      run,
      progressionByFormat[libId],
      volumeFactor
    );
    sessions.set(day, session);
    taken.add(day);
    if (finalTemplate?.is_hard_session) hardDays.push(day);
  }

  // 3b) Sicurezza §3.2: per le dure RAVVICINATE (≤1 giorno di recupero tra
  //     loro), quella a priorità di sequencing più alta deve venire PRIMA.
  //     Se l'ordine è invertito, scambia i due giorni. Con ≥2 giorni di gap
  //     l'ordine non conta (§3.2) e non si tocca nulla.
  enforceCloseHardOrdering(sessions, run);

  // 4) Taper: un opener leggero sul primo giorno disponibile infrasett.
  if (phase === "taper") {
    const openerId = run ? "RR-2" : "MIX-2";
    const openerDay = pickDay(["wed", "thu", "fri", "tue"], available, taken, [], false);
    if (openerDay) {
      const session = buildSession(
        openerDay,
        openerId,
        "opener",
        "Fase taper: opener di attivazione pre-gara (§4.3 race-week), senza fatica.",
        dossier,
        [],
        run
      );
      sessions.set(openerDay, session);
      taken.add(openerDay);
    }
  }

  // 5) Riempi i giorni rimanenti con sedute facili o riposo.
  for (const day of DAY_KEYS) {
    if (sessions.has(day)) continue;
    if (!available.has(day)) {
      sessions.set(day, {
        day,
        library_id: null,
        is_hard: false,
        slot: "rest",
        adapted_duration_min: null,
        target_zone: null,
        rationale: "Giorno non disponibile (dal dossier): riposo.",
      });
      continue;
    }
    const prevIdx = dayIndex(day) - 1;
    const prevDay = prevIdx >= 0 ? DAY_KEYS[prevIdx] : null;
    const afterHard = prevDay != null && hardDays.includes(prevDay);
    const fillId = phase === "recovery" ? recoveryId : afterHard ? recoveryId : easyId;
    const slot: SessionSlot = fillId === recoveryId ? "recovery" : "easy";
    const note =
      phase === "recovery"
        ? "Fase recovery: solo Z1–Z2."
        : afterHard
          ? "Recupero attivo dopo la seduta dura del giorno prima (§3.1)."
          : "Mantenimento aerobico facile.";
    sessions.set(
      day,
      buildSession(day, fillId, slot, note, dossier, [], run, undefined, volumeFactor)
    );
  }

  return DAY_KEYS.map((d) => sessions.get(d)!);
}

/** Conta le sedute dure della settimana (per audit/validazione §4). */
export function countHardSessions(sessions: SelectedSession[]): number {
  return sessions.filter((s) => s.is_hard).length;
}

/** true se le sedute dure rispettano il gap minimo (§3.1, 48h salvo eccezione). */
export function hardSpacingOk(sessions: SelectedSession[], minGapDays = 2): boolean {
  const hardIdx = sessions
    .filter((s) => s.is_hard)
    .map((s) => DAY_KEYS.indexOf(s.day))
    .sort((a, b) => a - b);
  for (let i = 1; i < hardIdx.length; i++) {
    if (hardIdx[i] - hardIdx[i - 1] < minGapDays) return false;
  }
  return true;
}
