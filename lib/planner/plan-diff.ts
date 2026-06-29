/**
 * Diff piano inviato vs piano corrente — funzione PURA, zero AI, zero token.
 *
 * Confronta lo snapshot delle sedute realmente inviate a Intervals
 * (weekly_plans.pushed_snapshot) con le sedute del piano corrente, giorno per
 * giorno, e produce per ogni cambiamento un "perché" deterministico. Il motivo
 * primario è `session_rationale` della seduta corrente (già popolato dal selector
 * Section 11 B); la mappa sotto è il fallback/normalizzazione quando il rationale
 * è vuoto o non spiega il *cambiamento* (infortunio, blocco, locked).
 */

import type { BuiltSession } from "@/lib/planner/build-week";

export interface PlanChange {
  day: BuiltSession["day"]; // "mon".."sun"
  date: string; // YYYY-MM-DD
  from: string; // titolo/etichetta seduta PRIMA (pushed_snapshot)
  to: string; // titolo/etichetta seduta DOPO (piano corrente)
  reason: string; // "perché" deterministico
}

/** Etichetta leggibile della seduta per il diff (from/to). */
function label(s: BuiltSession | undefined): string {
  if (!s) return "—";
  if (s.rest && s.blocked_by_user) {
    // Infortunio o blocco esplicito: usa il title se valorizzato.
    return s.title && s.title.trim() ? s.title : "Bloccato/Infortunio";
  }
  if (s.rest) return "Riposo";
  const dur =
    s.estimated_duration_min != null ? ` ${s.estimated_duration_min}′` : "";
  return `${s.title}${dur}`;
}

/** Campi il cui cambiamento conta come "seduta cambiata" (no prosa/note). */
function isChanged(prev: BuiltSession, curr: BuiltSession): boolean {
  return (
    prev.rest !== curr.rest ||
    prev.is_hard !== curr.is_hard ||
    prev.library_id !== curr.library_id ||
    prev.title !== curr.title ||
    prev.estimated_duration_min !== curr.estimated_duration_min ||
    (prev.blocked_by_user ?? false) !== (curr.blocked_by_user ?? false)
  );
}

/**
 * "Perché" deterministico per una seduta cambiata. Primo che matcha vince.
 * Fonte primaria del motivo = `curr.session_rationale`; la tabella è
 * fallback/normalizzazione. ponytail: il diff non rilegge le attività, quindi un
 * giorno passato cambiato senza causa estraibile cade nel fallback generico.
 */
function reasonFor(prev: BuiltSession | undefined, curr: BuiltSession): string {
  const rationale = curr.session_rationale?.trim() || "";

  if (curr.blocked_by_user === true && curr.title === "Infortunio") {
    return "Periodo infortunio → giorno messo a riposo";
  }
  if (curr.blocked_by_user === true) {
    return "Giorno bloccato dall'utente";
  }
  if (!prev) {
    return rationale || "Modificato dalla rigenerazione";
  }
  if (prev.is_hard && !curr.is_hard) {
    return rationale || "Carico ridotto (readiness/ACWR)";
  }
  if (!prev.is_hard && curr.is_hard) {
    return rationale || "Sessione intensa aggiunta dalla rigenerazione";
  }
  if (curr.library_id !== prev.library_id) {
    return rationale || "Seduta sostituita dalla rigenerazione";
  }
  if (curr.estimated_duration_min !== prev.estimated_duration_min) {
    return "Volume aggiustato (progressione/mesociclo)";
  }
  return rationale || "Modificato dalla rigenerazione";
}

/**
 * Confronta il piano inviato (snapshot) col piano corrente, giorno per giorno.
 * snapshot null/[] → ritorna [] (piano mai inviato: niente diff).
 */
export function diffPlan(
  pushedSnapshot: BuiltSession[] | null,
  current: BuiltSession[]
): PlanChange[] {
  if (!pushedSnapshot || pushedSnapshot.length === 0) return [];

  const prevByDate = new Map(pushedSnapshot.map((s) => [s.date, s]));
  const changes: PlanChange[] = [];

  for (const curr of current) {
    const prev = prevByDate.get(curr.date);
    // Giorno presente solo nel corrente, oppure differente sui campi rilevanti.
    if (prev && !isChanged(prev, curr)) continue;
    changes.push({
      day: curr.day,
      date: curr.date,
      from: label(prev),
      to: label(curr),
      reason: reasonFor(prev, curr),
    });
  }

  // Giorni presenti solo nello snapshot (rimossi dal corrente) — raro (7gg fissi).
  const currDates = new Set(current.map((s) => s.date));
  for (const prev of pushedSnapshot) {
    if (currDates.has(prev.date)) continue;
    changes.push({
      day: prev.day,
      date: prev.date,
      from: label(prev),
      to: "—",
      reason: "Giorno rimosso dalla rigenerazione",
    });
  }

  return changes;
}
