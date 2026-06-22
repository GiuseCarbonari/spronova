import type { IntervalsEvent } from "@/lib/intervals-client";
import { WORKOUT_UID_PREFIX } from "@/lib/planner/intervals-workout-format";

/**
 * Seleziona gli eventi ORFANI da cancellare dopo un push: i NOSTRI workout
 * (external_id con prefisso `curveload-`) presenti sul calendario ma il cui
 * external_id non è più nel set del piano appena inviato. È il caso della
 * settimana ridistribuita, dove una seduta cambia giorno o tipo: l'upsert (per
 * external_id) crea il nuovo evento e lascia orfano il vecchio.
 *
 * Funzione PURA (nessun I/O), così la proprietà di sicurezza è testabile:
 * un evento senza external_id, o con prefisso diverso, non viene MAI
 * selezionato — non cancelliamo mai eventi che non ha creato questa app.
 */
export function selectOrphanEvents(
  onCalendar: IntervalsEvent[],
  keepExternalIds: Set<string>
): IntervalsEvent[] {
  return onCalendar.filter(
    (event) =>
      typeof event.external_id === "string" &&
      event.external_id.startsWith(WORKOUT_UID_PREFIX) &&
      !keepExternalIds.has(event.external_id)
  );
}
