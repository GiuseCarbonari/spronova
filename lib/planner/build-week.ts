/**
 * Build week (PRD §15.4 + Section 11 B §6/C) — funzione PURA, nessuna AI.
 *
 * Trasforma le sedute selezionate (session-selector) negli oggetti workout
 * completi del PRD §15.4 (titolo, struttura, target, note, alternativa di
 * fatica…) con TESTI generati deterministicamente da template string, e
 * allega a ciascuna il `validation_metadata` di Section 11 C (protocol_version,
 * checklist_passed, frameworks_cited, confidence, phase_detected, library_id).
 *
 * Costruisce anche l'header di audit del piano (Section 11 B §6): fase, conteggio
 * dure, spacing 48h, stima polarizzazione/volume, progression_vector.
 */

import type { AthleteProfileData } from "@/lib/profile/build-profile";
import type { Phase } from "@/lib/planner/phase-detector";
import {
  DAY_KEYS,
  countHardSessions,
  effectiveMinGapDays,
  hardSpacingOk,
  isRunSport,
  type DayKey,
  type SelectedSession,
} from "@/lib/planner/session-selector";
import {
  getTemplate,
  type WorkoutDomain,
  type WorkoutTemplate,
} from "@/lib/planner/workout-library";
import {
  getRunTemplate,
  type RunWorkoutDomain,
  type RunWorkoutTemplate,
} from "@/lib/planner/run-workout-library";
import {
  resolveProgressionState,
  type ProgressionState,
} from "@/lib/planner/progression";

const PROTOCOL_VERSION = "11.33";
const VALIDATION_PROTOCOL = "URF_v5.1";

/** Etichette giorno per i titoli/descrizioni. */
const DAY_LABELS: Record<DayKey, string> = {
  mon: "Lunedì",
  tue: "Martedì",
  wed: "Mercoledì",
  thu: "Giovedì",
  fri: "Venerdì",
  sat: "Sabato",
  sun: "Domenica",
};

/** Obiettivo seduta per dominio (PRD §15.4 "obiettivo seduta"). */
const DOMAIN_OBJECTIVE: Record<WorkoutDomain, string> = {
  endurance: "Costruire base aerobica e durabilità",
  tempo: "Volume a intensità moderata, ponte verso la soglia",
  sweet_spot: "Stimolo a soglia ad alto rendimento/basso costo di recupero",
  threshold: "Elevare la soglia funzionale (FTP/MLSS)",
  vo2max: "Massima potenza aerobica e gittata cardiaca",
  anaerobic: "Capacità anaerobica e reclutamento neuromuscolare",
  race_specific: "Fitness specifica di gara e gestione delle transizioni",
  strength_endurance: "Forza-resistenza e torque (bassa cadenza)",
};

const RUN_DOMAIN_OBJECTIVE: Record<RunWorkoutDomain, string> = {
  endurance: "Costruire base aerobica e durabilità in corsa",
  tempo: "Volume a intensità moderata, ponte verso il passo soglia",
  sweet_spot: "Stimolo a passo soglia ad alto rendimento",
  threshold: "Elevare il passo soglia (LT2/MLSS)",
  vo2max: "Massima capacità aerobica e gittata cardiaca",
  anaerobic: "Capacità anaerobica e reclutamento neuromuscolare in corsa",
  race_specific: "Fitness specifica di gara e gestione del passo",
  strength_endurance: "Forza-resistenza e potenza muscolare in salita",
};

/** Framework citati per dominio (oltre a quelli di base del piano). */
const DOMAIN_FRAMEWORKS: Record<WorkoutDomain, string[]> = {
  endurance: ["Seiler-TID"],
  tempo: ["Coggan-Levels"],
  sweet_spot: ["Coggan-Levels"],
  threshold: ["Coggan-Levels", "Seiler-LongIntervals"],
  vo2max: ["Seiler-TID", "Buchheit-HIIT"],
  anaerobic: ["Section11-B§3.2"],
  race_specific: ["Section11-B§3.2"],
  strength_endurance: ["Section11-WR§1F"],
};

const RUN_DOMAIN_FRAMEWORKS: Record<RunWorkoutDomain, string[]> = {
  endurance: ["Seiler-TID"],
  tempo: ["Daniels-Running"],
  sweet_spot: ["Daniels-Running"],
  threshold: ["Daniels-Running", "Seiler-LongIntervals"],
  vo2max: ["Seiler-TID", "Buchheit-HIIT"],
  anaerobic: ["Section11-B§3.2"],
  race_specific: ["Section11-B§3.2"],
  strength_endurance: ["Section11-WR§1F"],
};

/** Alternativa "in caso di fatica" per library_id (downgrade ragionato). */
const FATIGUE_ALTERNATIVE: Record<string, string | null> = {
  // Corsa
  "RA-1": "RA-4",
  "RA-2": "RA-1",
  "RA-3": "RA-2",
  "RA-4": null,
  "RA-5": "RA-4",
  "RA-6": "RA-3",
  "RS-1": "RS-4",
  "RS-2": "RS-4",
  "RS-3": "RS-4",
  "RS-4": "RA-5",
  "RV-1": "RS-4",
  "RV-2": "RS-4",
  "RV-3": "RS-4",
  "RN-1": "RA-4",
  "RN-2": "RA-1",
  "RR-1": "RS-4",
  "RR-2": "RA-4",
  // Ciclismo
  // Endurance
  "AE-1": "AE-4",
  "AE-2": "AE-1",
  "AE-3": "AE-2",
  "AE-4": null,
  "AE-5": "AE-4",
  "AE-6": "AE-3",
  "AE-7": "AE-1",
  // Sweet spot / tempo / threshold
  "SS-1": "SS-4",
  "SS-2": "SS-4",
  "SS-3": "SS-1",
  "SS-4": "AE-7",
  "SS-5": "SS-4",
  "TH-1": "SS-1",
  "TH-2": "SS-1",
  // VO2max
  "VO2-1": "SS-4",
  "VO2-2": "SS-4",
  "VO2-3": "VO2-2",
  "VO2-4": "SS-4",
  "VO2-5": "VO2-2",
  // Anaerobic
  "AN-1": "AE-1",
  "AN-2": "AE-1",
  "AN-3": "AN-2",
  // Mixed
  "MIX-1": "AE-7",
  "MIX-2": "AE-4",
  // Strength-endurance
  "SE-1": "SS-4",
  "SE-2": "SS-1",
};

export interface ValidationMetadata {
  protocol_version: string;
  checklist_passed: Array<number | string>;
  checklist_failed: Array<number | string>;
  frameworks_cited: string[];
  confidence: "high" | "medium" | "low";
  phase_detected: Phase;
  library_id: string;
  is_hard_session: boolean;
  adapted_duration_min: number | null;
}

/** Oggetto workout completo del PRD §15.4. */
export interface BuiltSession {
  day: DayKey;
  date: string; // YYYY-MM-DD
  is_hard: boolean;
  rest: boolean;
  /**
   * true = giorno reso "riposo" perché l'utente lo ha esplicitamente bloccato
   * (ridistribuzione "Non posso allenarmi questo giorno"). A differenza di un
   * riposo normale, NON va rigenerato da "Rigenera": è una scelta dell'utente.
   * Opzionale: i piani esistenti senza questo campo lo trattano come assente.
   */
  blocked_by_user?: boolean;
  title: string;
  sport: string;
  estimated_duration_min: number | null;
  session_objective: string;
  description: string;
  interval_structure: string;
  power_target_zone: string | null;
  hr_target_zone: string | null;
  rpe_target: string | null;
  coach_notes: string;
  session_rationale: string;
  fatigue_alternative_library_id: string | null;
  library_id: string | null;
  /**
   * Indice dello step di progressione §5.2 (duration vector, 0 = base).
   * Assente sui riposi e sui formati non progredibili. Retrocompat.
   */
  progression_step?: number;
  /** Stato multi-vettore §5.2 {duration,recovery,intensity} applicato. */
  progression_state?: ProgressionState;
  frameworks_cited: string[];
  validation_metadata: ValidationMetadata | null;
}

/** Header di audit del piano (Section 11 B §6). */
export interface WeekAudit {
  phase: Phase;
  week_start: string;
  hard_sessions: number;
  max_hard_allowed: number;
  hard_spacing_ok: boolean;
  /** Gap minimo applicato in giorni: 2 (48h) salvo eccezione TSB/RI (§3.1) → 1. */
  min_gap_days_applied: number;
  /** Età del mirror dati in ore (checklist §11C item 6). Null se non passata. */
  data_age_hours: number | null;
  volume_hours_estimate: number;
  easy_time_ratio_estimate: number | null;
  polarization_note: string;
  load_variance: boolean;
  progression_vector: "duration" | "intensity" | "none";
  validation_protocol: string;
  confidence: "high" | "medium" | "low";
  checklist_passed: Array<number | string>;
  checklist_failed: Array<number | string>;
  frameworks_cited: string[];
}

export interface BuiltWeek {
  week_start: string;
  phase: Phase;
  sessions: BuiltSession[];
  audit: WeekAudit;
}

const BASE_FRAMEWORKS = ["Section11-B§4", "Seiler-80/20", "Gabbett-ACWR"];

/** weekStart (YYYY-MM-DD) + offset giorni → YYYY-MM-DD (in UTC, niente drift). */
function addDays(weekStart: string, offset: number): string {
  const [y, m, d] = weekStart.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + offset);
  return dt.toISOString().slice(0, 10);
}

function restSession(s: SelectedSession, date: string): BuiltSession {
  return {
    day: s.day,
    date,
    is_hard: false,
    rest: true,
    title: `${DAY_LABELS[s.day]} — Riposo`,
    sport: "Riposo",
    estimated_duration_min: null,
    session_objective: "Recupero",
    description: "Giorno di riposo: nessun allenamento programmato.",
    interval_structure: "—",
    power_target_zone: null,
    hr_target_zone: null,
    rpe_target: null,
    coach_notes: s.rationale,
    session_rationale: s.rationale,
    fatigue_alternative_library_id: null,
    library_id: null,
    frameworks_cited: [],
    validation_metadata: null,
  };
}

/** Descrizione semplice + struttura con riferimento WU/CD per le strutturate. */
function describe(
  template: WorkoutTemplate | RunWorkoutTemplate,
  durationMin: number | null,
  isRun = false
): { description: string; structure: string } {
  const needsWuCd = template.domain !== "endurance";
  let wuCd: string;
  if (isRun) {
    wuCd = needsWuCd
      ? " Includi riscaldamento (10–15′ jogging facile) e defaticamento (8–10′ camminata/jogging)."
      : " Corsa con entrata progressiva (5–10′ a ritmo Z1) e uscita graduale.";
  } else {
    wuCd = needsWuCd
      ? " Includi riscaldamento (WU-STD/WU-PROG, 15–20′) e defaticamento (CD-STD, 10–15′)."
      : " Pedalata con ramp-in/ramp-out (10–15′ in entrata e in uscita).";
  }
  const dur = durationMin != null ? ` Durata totale prevista ~${durationMin}′.` : "";
  return {
    description: `${template.title}. ${template.structure}.${dur}${wuCd}`,
    structure: `${template.structure}.${wuCd}`,
  };
}

/** Etichetta sport per il campo BuiltSession.sport. */
function resolveSport(
  dossier: { indoor_outdoor?: string | null; sport_principali?: string[] }
): string {
  const sports = dossier.sport_principali ?? [];
  const isRun = sports.some((s) => /corsa|running|trail/i.test(s));
  const isCycling = sports.some((s) => /cicl|mtb|gravel|bici|bike/i.test(s));
  const isTrail = sports.some((s) => /trail/i.test(s));

  if (isRun && !isCycling) {
    return isTrail ? "Trail running" : "Corsa";
  }
  if (dossier.indoor_outdoor === "indoor") return "indoor";
  const isMtb = sports.some((s) => /mtb|gravel/i.test(s));
  return isMtb ? "MTB" : "Ciclismo";
}

/**
 * Costruisce la settimana completa. `phase` è la fase rilevata (per audit e
 * validation_metadata); `athleteProfile` serve solo a graduare la confidence
 * (presenza di CP/peso) — NON si inventano numeri fisiologici.
 */
export function buildWeek(
  weekStartDate: string,
  sessions: SelectedSession[],
  dossier: {
    disponibilita_ore_sett: number | null;
    indoor_outdoor?: string | null;
    sport_principali?: string[];
  },
  athleteProfile: AthleteProfileData | null,
  phase: Phase,
  /**
   * TSB/RI odierni (eccezione §3.1) + età del mirror dati in ore (checklist
   * §11C item 6, Temporal Data Validation). Tutti opzionali/null se assenti.
   */
  auditContext?: { tsb: number | null; ri: number | null; data_age_hours: number | null } | null
): BuiltWeek {
  const hasInputs = athleteProfile?.cp_wprime?.cp_w != null && athleteProfile.weight_kg != null;
  const confidence: "high" | "medium" | "low" = hasInputs ? "high" : "medium";
  const run = isRunSport({ sport_principali: dossier.sport_principali ?? [] } as Parameters<typeof isRunSport>[0]);
  const sport = resolveSport(dossier);

  const built: BuiltSession[] = sessions.map((s) => {
    const date = addDays(weekStartDate, DAY_KEYS.indexOf(s.day));
    if (s.library_id == null) return restSession(s, date);

    // Cerca nella libreria corretta in base allo sport
    const template = run ? getRunTemplate(s.library_id) : getTemplate(s.library_id);
    if (!template) return restSession(s, date);

    const domainFrameworks = run
      ? RUN_DOMAIN_FRAMEWORKS[template.domain as RunWorkoutDomain]
      : DOMAIN_FRAMEWORKS[template.domain as WorkoutDomain];
    const frameworks = [...BASE_FRAMEWORKS, ...(domainFrameworks ?? [])];

    // §5.2 — se la seduta è stata progredita (multi-vettore), usa la struttura
    // risolta dello stato al posto di quella base (durata già adattata nel selector).
    const progResolved =
      !run && s.progression_state != null
        ? resolveProgressionState(s.library_id, s.progression_state)
        : null;
    const effectiveTemplate = progResolved
      ? { ...template, structure: progResolved.structure }
      : template;
    const { description, structure } = describe(
      effectiveTemplate,
      s.adapted_duration_min,
      run
    );

    const checklist_passed: Array<number | string> = [0, 1, 8];

    const validation_metadata: ValidationMetadata = {
      protocol_version: PROTOCOL_VERSION,
      checklist_passed,
      checklist_failed: [],
      frameworks_cited: frameworks,
      confidence,
      phase_detected: phase,
      library_id: s.library_id,
      is_hard_session: template.is_hard_session,
      adapted_duration_min: s.adapted_duration_min,
    };

    const sessionObjective = run
      ? RUN_DOMAIN_OBJECTIVE[template.domain as RunWorkoutDomain]
      : DOMAIN_OBJECTIVE[template.domain as WorkoutDomain];

    return {
      day: s.day,
      date,
      is_hard: template.is_hard_session,
      rest: false,
      title: `${DAY_LABELS[s.day]} — ${template.title} (${template.id})`,
      sport,
      estimated_duration_min: s.adapted_duration_min,
      session_objective: sessionObjective ?? "Allenamento",
      description,
      interval_structure: structure,
      power_target_zone: template.power_target_zone,
      hr_target_zone: template.hr_target_zone,
      rpe_target: template.rpe_target,
      coach_notes: template.coaching_notes,
      session_rationale: s.rationale,
      fatigue_alternative_library_id: FATIGUE_ALTERNATIVE[s.library_id] ?? null,
      library_id: s.library_id,
      ...(s.progression_step != null ? { progression_step: s.progression_step } : {}),
      ...(s.progression_state != null ? { progression_state: s.progression_state } : {}),
      frameworks_cited: frameworks,
      validation_metadata,
    };
  });

  // --- Audit settimana (Section 11 B §6) ------------------------------------
  const hard = countHardSessions(sessions);
  const maxHard = (dossier.disponibilita_ore_sett ?? 0) > 10 ? 3 : 2;
  const minGapDays = effectiveMinGapDays(auditContext?.tsb ?? null, auditContext?.ri ?? null);
  const spacingOk = hardSpacingOk(sessions, minGapDays);

  const totalMin = built.reduce((sum, s) => sum + (s.estimated_duration_min ?? 0), 0);
  const hardMin = built.reduce(
    (sum, s) => sum + (s.is_hard ? s.estimated_duration_min ?? 0 : 0),
    0
  );
  // Stima grezza e DICHIARATA: il tempo "facile" è quello delle sedute non-dure
  // (le dure contengono comunque WU/CD in Z1–Z2, qui non scorporati).
  const easyRatio = totalMin > 0 ? Number(((totalMin - hardMin) / totalMin).toFixed(2)) : null;

  // Item 9 (Rolling Phase Alignment) e 10 (Protocol Version & Framework
  // Citations) sono sempre verificabili qui: la fase è sempre rilevata da
  // detectPhase e protocol_version/frameworks_cited sono sempre popolati.
  // Item 2, 5, 5b, 7 della checklist Section 11 C presuppongono un'AI che
  // legge JSON ad ogni turno conversazionale: non si applicano a questa
  // pipeline deterministica e restano deliberatamente fuori da entrambi gli
  // array (nessun "passed" finto, nessun "failed" su un controllo che qui
  // non ha senso).
  const checklist_passed: Array<number | string> = [0, 1, 3, 4, 8, 9, 10];
  const checklist_failed: Array<number | string> = [];
  // §4: composizione/spacing. §3: distribuzione intensità.
  if (hard <= maxHard) checklist_passed.push("4-session-count");
  else checklist_failed.push("4-session-count");
  if (spacingOk) checklist_passed.push("3.1-48h-spacing");
  else checklist_failed.push("3.1-48h-spacing");
  if (easyRatio == null || easyRatio >= 0.75) checklist_passed.push("3-intensity-distribution");
  else checklist_failed.push("3-intensity-distribution");
  // Item 6 (Temporal Data Validation): mirror >48h → richiedere un refresh.
  const dataAgeHours = auditContext?.data_age_hours ?? null;
  if (dataAgeHours == null) {
    // Età ignota (chiamante non l'ha passata): non si dichiara un esito.
  } else if (dataAgeHours < 48) {
    checklist_passed.push(6);
  } else {
    checklist_failed.push(6);
  }

  const audit: WeekAudit = {
    phase,
    week_start: weekStartDate,
    hard_sessions: hard,
    max_hard_allowed: maxHard,
    hard_spacing_ok: spacingOk,
    min_gap_days_applied: minGapDays,
    data_age_hours: dataAgeHours,
    volume_hours_estimate: Number((totalMin / 60).toFixed(1)),
    easy_time_ratio_estimate: easyRatio,
    polarization_note:
      easyRatio != null && easyRatio >= 0.75
        ? "Distribuzione coerente con 80/20 (stima)."
        : "Quota facile sotto l'80% nella stima: rivedere il volume Z1–Z2.",
    load_variance: false,
    progression_vector: phase === "base" ? "duration" : "intensity",
    validation_protocol: VALIDATION_PROTOCOL,
    confidence,
    checklist_passed,
    checklist_failed,
    frameworks_cited: BASE_FRAMEWORKS,
  };

  return { week_start: weekStartDate, phase, sessions: built, audit };
}
