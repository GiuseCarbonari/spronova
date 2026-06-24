/**
 * Ridistribuzione settimanale (M9, Section 11 B §3-§4) — funzione PURA.
 *
 * PRINCIPIO FERMO: recuperare una seduta non significa incastrarla a forza.
 * Se non c'è spazio per le 48h di recupero, si riduce il volume. La sicurezza
 * e il recupero vengono sempre prima del completare il piano.
 *
 * Regole rispettate:
 *  - 48h minimo tra sedute dure (§3.1)
 *  - max 2 dure/sett ≤10h, 3 se >10h (§4)
 *  - rispetto cap di durata del giorno target (§5.4)
 *  - le sessioni facili si perdono senza danno; le dure si spostano o si segnala
 */

import type { BuiltSession } from "@/lib/planner/build-week";
import type { Phase } from "@/lib/planner/phase-detector";
import { DAY_KEYS, type DayKey } from "@/lib/planner/session-selector";

// --- Tipi pubblici -----------------------------------------------------------

export interface RedistributeChange {
  day: DayKey;
  action: "moved" | "dropped" | "kept";
  from?: DayKey;
  to?: DayKey;
  reason: string;
}

export interface RedistributeResult {
  new_week: BuiltSession[];
  changes: RedistributeChange[];
  volume_reduced: boolean;
  explanation: string;
}

// --- Costanti ----------------------------------------------------------------

const DAY_LABELS: Record<DayKey, string> = {
  mon: "lunedì",
  tue: "martedì",
  wed: "mercoledì",
  thu: "giovedì",
  fri: "venerdì",
  sat: "sabato",
  sun: "domenica",
};

const DAY_LABELS_CAPS: Record<DayKey, string> = {
  mon: "Lunedì",
  tue: "Martedì",
  wed: "Mercoledì",
  thu: "Giovedì",
  fri: "Venerdì",
  sat: "Sabato",
  sun: "Domenica",
};

const WEEKEND = new Set<DayKey>(["sat", "sun"]);

// --- Helper ------------------------------------------------------------------

function dayIndex(day: DayKey): number {
  return DAY_KEYS.indexOf(day);
}

/** true se `day` dista ≥minGapDays giorni da tutte le sedute dure in `hardDays`. */
function respects48h(day: DayKey, hardDays: DayKey[], minGapDays: number): boolean {
  return hardDays.every((h) => Math.abs(dayIndex(day) - dayIndex(h)) >= minGapDays);
}

function capForDay(
  day: DayKey,
  dossier: { durata_max_weekday_min: number | null; durata_max_weekend_min: number | null }
): number | null {
  const cap = WEEKEND.has(day)
    ? dossier.durata_max_weekend_min
    : dossier.durata_max_weekday_min;
  return cap != null && cap > 0 ? cap : null;
}

/** Priorità della seduta dura da mantenere quando si deve scartarne una. */
function hardPriority(libraryId: string | null, phase: Phase): number {
  if (!libraryId) return 0;
  if (phase === "build" || phase === "peak") {
    if (libraryId.startsWith("VO2")) return 5;
    if (libraryId.startsWith("TH")) return 4;
    if (libraryId.startsWith("MIX") || libraryId.startsWith("SS")) return 3;
    if (libraryId === "AE-6") return 2;
  }
  if (phase === "base") {
    if (libraryId.startsWith("SS")) return 5;
    if (libraryId.startsWith("VO2")) return 4;
    if (libraryId.startsWith("TH")) return 3;
    if (libraryId === "AE-6") return 2;
  }
  if (phase === "taper") {
    if (libraryId === "MIX-2") return 5;
  }
  return 2;
}

function makeRest(
  original: BuiltSession,
  reason: string,
  blockedByUser = false
): BuiltSession {
  return {
    ...original,
    is_hard: false,
    rest: true,
    blocked_by_user: blockedByUser,
    title: `${DAY_LABELS_CAPS[original.day as DayKey]} — Riposo`,
    sport: "Riposo",
    estimated_duration_min: null,
    library_id: null,
    session_objective: "Recupero",
    description: "Giorno bloccato o rimosso nella ridistribuzione.",
    interval_structure: "—",
    power_target_zone: null,
    hr_target_zone: null,
    rpe_target: null,
    coach_notes: reason,
    session_rationale: reason,
    fatigue_alternative_library_id: null,
    frameworks_cited: [],
    validation_metadata: null,
  };
}

function rebuildTitle(session: BuiltSession, newDay: DayKey): string {
  const body = session.title.includes(" — ")
    ? session.title.split(" — ").slice(1).join(" — ")
    : session.title;
  return `${DAY_LABELS_CAPS[newDay]} — ${body}`;
}

// --- redistributeWeek --------------------------------------------------------

/**
 * Ridistribuisce la settimana escludendo `blockedDay`.
 *
 * @param currentPlan   Settimana corrente (7 sessioni, una per giorno).
 * @param blockedDay    Giorno che l'utente non può fare.
 * @param remainingDays Giorni ancora disponibili: futuri, non impossibili da
 *                      dossier, non già passati/completati. Calcolati dal
 *                      chiamante; NON includono `blockedDay`.
 * @param dossier       Subset del dossier per i cap di durata e disponibilità.
 * @param phase         Fase rilevata (per ordinare la priorità delle dure).
 * @param minGapDays    Gap minimo richiesto tra dure: 2 (48h) salvo eccezione
 *                      TSB/RI (§3.1) → 1. Calcolato dal chiamante con
 *                      `effectiveMinGapDays` (session-selector.ts).
 */
export function redistributeWeek(
  currentPlan: BuiltSession[],
  blockedDay: DayKey,
  remainingDays: DayKey[],
  dossier: {
    disponibilita_ore_sett: number | null;
    durata_max_weekday_min: number | null;
    durata_max_weekend_min: number | null;
  },
  phase: Phase,
  minGapDays = 2
): RedistributeResult {
  const week = new Map<DayKey, BuiltSession>();
  for (const s of currentPlan) week.set(s.day as DayKey, s);

  const changes: RedistributeChange[] = [];
  const blockedSession = week.get(blockedDay);

  // Giorno non trovato o già di riposo: nessun cambiamento.
  if (!blockedSession || blockedSession.rest) {
    return {
      new_week: DAY_KEYS.map((d) => week.get(d)).filter(Boolean) as BuiltSession[],
      changes: [
        {
          day: blockedDay,
          action: "kept",
          reason: "Giorno già di riposo: nessun cambiamento.",
        },
      ],
      volume_reduced: false,
      explanation: "Il giorno era già di riposo: nessun cambiamento necessario.",
    };
  }

  // Giorni duri RIMANENTI (escluso quello bloccato).
  const otherHardDays = DAY_KEYS.filter(
    (d) => d !== blockedDay && (week.get(d)?.is_hard ?? false)
  );

  let volumeReduced = false;

  if (!blockedSession.is_hard) {
    // ─── Sessione FACILE: cerca un giorno di riposo tra i rimanenti ──────
    const freeSlot = remainingDays
      .filter((d) => d !== blockedDay)
      .find((d) => {
        const slot = week.get(d);
        // Non riusare un giorno che l'utente ha bloccato esplicitamente.
        return slot?.rest === true && slot.blocked_by_user !== true;
      });

    if (freeSlot) {
      const targetDate = week.get(freeSlot)!.date;
      week.set(freeSlot, {
        ...blockedSession,
        day: freeSlot,
        date: targetDate,
        title: rebuildTitle(blockedSession, freeSlot),
      });
      week.set(
        blockedDay,
        makeRest(
          blockedSession,
          `Sessione facile spostata a ${DAY_LABELS[freeSlot]}.`,
          true
        )
      );
      changes.push({
        day: blockedDay,
        action: "moved",
        from: blockedDay,
        to: freeSlot,
        reason: `Sessione facile spostata a ${DAY_LABELS[freeSlot]}.`,
      });
    } else {
      // Nessun giorno libero: scarta la facile (costo basso).
      week.set(
        blockedDay,
        makeRest(
          blockedSession,
          "Sessione facile rimossa: nessun giorno libero disponibile.",
          true
        )
      );
      changes.push({
        day: blockedDay,
        action: "dropped",
        reason:
          "Sessione facile rimossa: nessun giorno libero disponibile. Le sessioni facili si possono perdere senza danno.",
      });
    }
  } else {
    // ─── Sessione DURA: cerca un slot valido con 48h garantite ───────────
    const blockedDuration = blockedSession.estimated_duration_min ?? 60;
    let targetDay: DayKey | null = null;

    for (const d of remainingDays) {
      if (d === blockedDay) continue;
      const existing = week.get(d);
      if (!existing || existing.is_hard) continue; // già duro: non sovrascrivere
      if (existing.blocked_by_user === true) continue; // bloccato dall'utente: non riusare
      if (!respects48h(d, otherHardDays, minGapDays)) continue; // violerebbe il gap minimo
      const cap = capForDay(d, dossier);
      if (cap != null && blockedDuration > cap) continue; // non ci sta nel cap
      targetDay = d;
      break;
    }

    if (targetDay != null) {
      const displaced = week.get(targetDay)!;

      // Se il giorno target aveva una sessione facile, viene rimossa.
      if (!displaced.rest) {
        changes.push({
          day: targetDay,
          action: "dropped",
          reason: `Sessione facile rimossa per fare spazio alla seduta dura spostata da ${DAY_LABELS[blockedDay]}.`,
        });
      }

      week.set(targetDay, {
        ...blockedSession,
        day: targetDay,
        date: displaced.date,
        title: rebuildTitle(blockedSession, targetDay),
      });
      week.set(
        blockedDay,
        makeRest(
          blockedSession,
          `Seduta dura spostata a ${DAY_LABELS[targetDay]}.`,
          true
        )
      );
      changes.push({
        day: blockedDay,
        action: "moved",
        from: blockedDay,
        to: targetDay,
        reason: `Seduta dura spostata a ${DAY_LABELS[targetDay]}, rispettando le 48h di recupero (§3.1).`,
      });
    } else {
      // Nessun slot valido: riduzione di volume.
      week.set(
        blockedDay,
        makeRest(
          blockedSession,
          "Seduta dura rimossa: nessuno spazio con recupero 48h disponibile.",
          true
        )
      );
      changes.push({
        day: blockedDay,
        action: "dropped",
        reason:
          "Nessuno spazio disponibile rispettando le 48h. Settimana a volume ridotto — è la scelta corretta.",
      });
      volumeReduced = true;
    }
  }

  // ─── Sicurezza finale: verifica spacing 48h sul risultato ────────────────
  // In teoria non serve (la logica sopra lo garantisce), ma difende da edge
  // case in cui il piano originale era già borderline.
  const resultSessions = DAY_KEYS.map((d) => week.get(d)).filter(
    Boolean
  ) as BuiltSession[];
  const hardPositions = resultSessions
    .filter((s) => s.is_hard)
    .map((s) => ({ day: s.day as DayKey, idx: dayIndex(s.day as DayKey) }))
    .sort((a, b) => a.idx - b.idx);

  for (let i = 1; i < hardPositions.length; i++) {
    if (hardPositions[i].idx - hardPositions[i - 1].idx < minGapDays) {
      // Spacing violato: rimuovi la seduta a priorità più bassa.
      const a = hardPositions[i - 1];
      const b = hardPositions[i];
      const aSession = week.get(a.day)!;
      const bSession = week.get(b.day)!;
      const aPri = hardPriority(aSession.library_id, phase);
      const bPri = hardPriority(bSession.library_id, phase);
      const dropDay = aPri >= bPri ? b.day : a.day;
      const dropSession = week.get(dropDay)!;
      week.set(
        dropDay,
        makeRest(
          dropSession,
          "Rimossa per rispettare il recupero minimo 48h tra sedute dure (§3.1)."
        )
      );
      changes.push({
        day: dropDay,
        action: "dropped",
        reason:
          "Rimossa per rispettare il recupero minimo di 48h tra sedute dure (Section 11 B §3.1).",
      });
      volumeReduced = true;
    }
  }

  const newWeek = DAY_KEYS.map((d) => week.get(d)).filter(
    Boolean
  ) as BuiltSession[];
  const finalHard = newWeek.filter((s) => s.is_hard).length;
  const originalHard = currentPlan.filter((s) => s.is_hard).length;

  const explanation = buildExplanation(
    changes,
    blockedDay,
    blockedSession,
    finalHard,
    originalHard,
    volumeReduced
  );

  return { new_week: newWeek, changes, volume_reduced: volumeReduced, explanation };
}

// --- recoverMissedSession ----------------------------------------------------

export type Readiness = "GO" | "MODIFY" | "SKIP";

export interface RecoverResult {
  new_week: BuiltSession[];
  changes: RedistributeChange[];
  /** Esito del recupero: la seduta è stata spostata, oppure no e perché. */
  recovered: boolean;
  /** Motivo del rifiuto quando `recovered` è false. */
  blocked_reason: string | null;
  /** Giorno consigliato per la dura (può NON essere oggi). Null se nessuno. */
  suggested_day: DayKey | null;
  /** Avviso da mostrare quando recuperare oggi è rischioso (MODIFY/SKIP). */
  risk_warning: string | null;
  /** true se la seduta applicata è la versione facile (downgrade di fatica). */
  downgraded: boolean;
  explanation: string;
}

/**
 * Esamina i giorni dal `today` in poi e restituisce il PRIMO valido per una
 * dura: oggi solo se readiness=GO; i giorni futuri (readiness ignota) se
 * disponibili, liberi/facili, con 48h dalle altre dure e dentro il cap.
 */
function findBestRecoveryDay(
  week: Map<DayKey, BuiltSession>,
  sourceDay: DayKey,
  today: DayKey,
  todayReadiness: Readiness,
  availableDays: Set<DayKey>,
  dossier: { durata_max_weekday_min: number | null; durata_max_weekend_min: number | null },
  duration: number,
  isHard: boolean,
  minGapDays: number
): DayKey | null {
  const fromToday = DAY_KEYS.slice(dayIndex(today)); // oggi → domenica
  for (const d of fromToday) {
    if (d === sourceDay) continue;
    if (!availableDays.has(d)) continue;
    const slot = week.get(d);
    if (!slot) continue;
    // Non sovrascrivere una dura già pianificata né un giorno bloccato dall'utente.
    if (!slot.rest && slot.is_hard) continue;
    if (slot.blocked_by_user === true) continue;
    // Oggi: ammesso per una dura solo se sei pronto (spec D).
    if (d === today && isHard && todayReadiness !== "GO") continue;
    // 48h dalle altre dure.
    if (isHard) {
      const otherHardDays = DAY_KEYS.filter(
        (h) => h !== sourceDay && h !== d && (week.get(h)?.is_hard ?? false)
      );
      if (!respects48h(d, otherHardDays, minGapDays)) continue;
    }
    // Cap di durata.
    const cap = capForDay(d, dossier);
    if (cap != null && duration > cap) continue;
    return d;
  }
  return null;
}

/**
 * Recupera una seduta SALTATA in modo READINESS-AWARE.
 *
 * Non incastra la dura su "oggi" a forza: se oggi non sei pronto (MODIFY/SKIP),
 * propone il giorno migliore della settimana e tiene oggi facile, avvisando del
 * rischio. L'utente resta libero di forzare oggi (eventualmente in versione più
 * breve/facile) con `forceDay` + `downgrade`. La seduta sorgente NON viene
 * distrutta finché il recupero non è effettivamente applicato.
 *
 * @param currentPlan    Settimana corrente (7 sessioni).
 * @param sourceDay      Giorno della seduta saltata (passato).
 * @param today          Giorno odierno.
 * @param todayReadiness Readiness di oggi (GO/MODIFY/SKIP).
 * @param availableDays  Giorni allenabili (da dossier).
 * @param dossier        Cap di durata.
 * @param minGapDays     Gap minimo tra dure (2 di norma, 1 con eccezione §3.1).
 * @param opts.forceDay  Giorno forzato dall'utente (override del suggerimento).
 * @param opts.downgrade Applica la versione facile (fatigue alternative).
 */
export function recoverMissedSession(
  currentPlan: BuiltSession[],
  sourceDay: DayKey,
  today: DayKey,
  todayReadiness: Readiness,
  availableDays: DayKey[],
  dossier: { durata_max_weekday_min: number | null; durata_max_weekend_min: number | null },
  minGapDays = 2,
  opts: { forceDay?: DayKey; downgrade?: boolean } = {}
): RecoverResult {
  const week = new Map<DayKey, BuiltSession>();
  for (const s of currentPlan) week.set(s.day as DayKey, s);
  const available = new Set(availableDays);

  const source = week.get(sourceDay);

  const base = (): Omit<RecoverResult, "blocked_reason" | "recovered" | "explanation"> => ({
    new_week: DAY_KEYS.map((d) => week.get(d)).filter(Boolean) as BuiltSession[],
    changes: [],
    suggested_day: null,
    risk_warning: null,
    downgraded: false,
  });
  const reject = (reason: string): RecoverResult => ({
    ...base(),
    changes: [{ day: sourceDay, action: "kept", reason }],
    recovered: false,
    blocked_reason: reason,
    explanation: reason,
  });

  if (!source || source.rest) {
    return reject(`Nessuna seduta da recuperare in ${DAY_LABELS[sourceDay]}.`);
  }

  const duration = source.estimated_duration_min ?? 60;
  const isHard = source.is_hard;

  // Giorno migliore secondo readiness/48h/cap (può essere oggi o un futuro).
  const suggested = findBestRecoveryDay(
    week, sourceDay, today, todayReadiness, available, dossier, duration, isHard, minGapDays
  );

  // Giorno effettivo: quello forzato dall'utente (se passato), altrimenti il suggerito.
  const targetDay = opts.forceDay ?? suggested;

  if (!targetDay) {
    return reject(
      "Nessun giorno valido per recuperare questa seduta dura senza violare 48h, " +
        "cap di durata o readiness. Va bene così: questa settimana resta a volume ridotto."
    );
  }

  const target = week.get(targetDay);
  if (!target) {
    return reject(`Giorno di destinazione (${DAY_LABELS[targetDay]}) non valido.`);
  }
  if (targetDay === sourceDay) {
    return reject("Il giorno di destinazione coincide con quello della seduta saltata.");
  }

  // Avviso di rischio: si sta mettendo una dura OGGI mentre non sei pronto.
  let riskWarning: string | null = null;
  if (isHard && targetDay === today && todayReadiness !== "GO") {
    const better = suggested && suggested !== today ? DAY_LABELS[suggested] : null;
    riskWarning =
      `Oggi la tua prontezza è ${todayReadiness}: una seduta dura non è l'ideale. ` +
      (better
        ? `Consiglio: oggi facile e recupera la dura ${better}, recuperi meglio. `
        : "") +
      "Se vuoi farla comunque oggi, valuta una versione più breve o facile.";
  }

  // ─── Validazioni hard sul target effettivo (anche se forzato) ─────────────
  if (!target.rest && target.is_hard) {
    return reject(
      `${DAY_LABELS_CAPS[targetDay]} ha già una seduta dura: spostarla qui violerebbe il carico del giorno.`
    );
  }
  if (isHard) {
    const otherHardDays = DAY_KEYS.filter(
      (d) => d !== sourceDay && d !== targetDay && (week.get(d)?.is_hard ?? false)
    );
    if (!respects48h(targetDay, otherHardDays, minGapDays)) {
      return reject(
        `Recuperare la seduta dura su ${DAY_LABELS[targetDay]} violerebbe il recupero minimo di 48h tra sedute dure (§3.1).`
      );
    }
  }
  const cap = capForDay(targetDay, dossier);
  if (cap != null && duration > cap) {
    return reject(
      `La seduta (${duration}′) supera il tempo massimo disponibile di ${DAY_LABELS[targetDay]} (${cap}′).`
    );
  }

  // ─── Downgrade opzionale alla versione facile (fatigue alternative) ────────
  const downgraded =
    opts.downgrade === true && source.fatigue_alternative_library_id != null;
  const recoveredLibraryId = downgraded
    ? source.fatigue_alternative_library_id!
    : source.library_id;

  // ─── Applica: sposta la seduta su targetDay, sourceDay → riposo ───────────
  const changes: RedistributeChange[] = [];
  if (!target.rest) {
    changes.push({
      day: targetDay,
      action: "dropped",
      reason: `Sessione di ${DAY_LABELS[targetDay]} rimossa per fare spazio alla seduta recuperata.`,
    });
  }

  week.set(targetDay, {
    ...source,
    day: targetDay,
    date: target.date,
    rest: false,
    // Pinnata: la rigenerazione non deve sovrascrivere la dura recuperata.
    blocked_by_user: true,
    is_hard: downgraded ? false : source.is_hard,
    library_id: recoveredLibraryId,
    title: rebuildTitle(source, targetDay),
  });
  week.set(
    sourceDay,
    makeRest(source, `Seduta recuperata su ${DAY_LABELS[targetDay]}.`)
  );
  changes.push({
    day: sourceDay,
    action: "moved",
    from: sourceDay,
    to: targetDay,
    reason: `Seduta di ${DAY_LABELS[sourceDay]} recuperata su ${DAY_LABELS[targetDay]}${downgraded ? " (versione facile)" : ""}.`,
  });

  const name = recoveredLibraryId ?? "Sessione";
  return {
    new_week: DAY_KEYS.map((d) => week.get(d)).filter(Boolean) as BuiltSession[],
    changes,
    recovered: true,
    blocked_reason: null,
    suggested_day: suggested,
    risk_warning: riskWarning,
    downgraded,
    explanation:
      `${name} di ${DAY_LABELS[sourceDay]} recuperata su ${DAY_LABELS[targetDay]}` +
      `${downgraded ? " in versione facile" : ""}, rispettando 48h e cap di durata.`,
  };
}

function buildExplanation(
  changes: RedistributeChange[],
  blockedDay: DayKey,
  blockedSession: BuiltSession,
  finalHard: number,
  originalHard: number,
  volumeReduced: boolean
): string {
  const parts: string[] = [
    `Ridistribuzione per ${DAY_LABELS[blockedDay]} bloccato.`,
  ];

  for (const c of changes) {
    if (c.action === "moved" && c.to) {
      const name = blockedSession.library_id ?? "Sessione";
      parts.push(`${name} spostata a ${DAY_LABELS[c.to]}.`);
    }
  }

  if (volumeReduced && finalHard < originalHard) {
    const diff = originalHard - finalHard;
    parts.push(
      `Settimana a volume ridotto: ${finalHard} seduta${finalHard !== 1 ? "e" : ""} dur${finalHard !== 1 ? "e" : "a"} ` +
        `invece di ${originalHard} (${diff} non recuperabil${diff !== 1 ? "i" : "e"} senza violare le 48h). ` +
        `È la scelta corretta per il recupero.`
    );
  }

  return parts.join(" ");
}
