import assert from "node:assert/strict";
import { test, describe } from "node:test";

import type { BuiltSession } from "../lib/planner/build-week";
import { diffPlan } from "../lib/planner/plan-diff";

/**
 * Test suite per diffPlan() — confronto piano inviato vs piano corrente.
 * Funzione pura, deterministica, nessuna AI.
 */

/** Costruisce una BuiltSession minima per il diff (solo i campi letti). */
function session(over: Partial<BuiltSession>): BuiltSession {
  return {
    day: "mon",
    date: "2026-06-29",
    is_hard: false,
    rest: false,
    title: "Lunedì — Endurance (AE-1)",
    sport: "Ciclismo",
    estimated_duration_min: 60,
    session_objective: "",
    description: "",
    interval_structure: "",
    power_target_zone: null,
    hr_target_zone: null,
    rpe_target: null,
    coach_notes: "",
    session_rationale: "",
    fatigue_alternative_library_id: null,
    library_id: "AE-1",
    frameworks_cited: [],
    validation_metadata: null,
    ...over,
  };
}

describe("diffPlan", () => {
  test("snapshot null → nessun diff", () => {
    const current = [session({})];
    assert.deepEqual(diffPlan(null, current), []);
  });

  test("snapshot vuoto → nessun diff", () => {
    assert.deepEqual(diffPlan([], [session({})]), []);
  });

  test("snapshot identico al corrente → nessun diff", () => {
    const a = session({ date: "2026-06-29", library_id: "AE-1" });
    const b = session({ date: "2026-06-30", day: "tue", library_id: "SS-1", is_hard: true });
    assert.deepEqual(diffPlan([a, b], [a, b]), []);
  });

  test("dura → recupero (cambio is_hard + library_id) → 1 change con reason da session_rationale", () => {
    const before = session({
      date: "2026-06-29",
      is_hard: true,
      library_id: "VO2-1",
      title: "Lunedì — VO2max (VO2-1)",
    });
    const after = session({
      date: "2026-06-29",
      is_hard: false,
      library_id: "AE-4",
      title: "Lunedì — Recupero (AE-4)",
      session_rationale: "Readiness bassa: scarico aerobico",
    });
    const changes = diffPlan([before], [after]);
    assert.equal(changes.length, 1);
    assert.equal(changes[0].date, "2026-06-29");
    assert.ok(changes[0].reason.length > 0, "reason non vuoto");
    assert.equal(changes[0].reason, "Readiness bassa: scarico aerobico");
  });

  test("dura → recupero senza rationale → fallback non vuoto", () => {
    const before = session({ is_hard: true, library_id: "VO2-1" });
    const after = session({ is_hard: false, library_id: "AE-4", session_rationale: "" });
    const changes = diffPlan([before], [after]);
    assert.equal(changes.length, 1);
    assert.equal(changes[0].reason, "Carico ridotto (readiness/ACWR)");
  });

  test("giorno infortunio (blocked_by_user + title Infortunio) → reason periodo infortunio", () => {
    const before = session({
      date: "2026-07-01",
      day: "wed",
      is_hard: true,
      library_id: "SS-1",
    });
    const after = session({
      date: "2026-07-01",
      day: "wed",
      rest: true,
      is_hard: false,
      blocked_by_user: true,
      title: "Infortunio",
      library_id: null,
    });
    const changes = diffPlan([before], [after]);
    assert.equal(changes.length, 1);
    assert.equal(changes[0].reason, "Periodo infortunio → giorno messo a riposo");
    assert.equal(changes[0].to, "Infortunio");
  });

  // --- Mappa priorità motivi: rami non coperti sopra ---

  test("giorno bloccato dall'utente (no infortunio) → reason blocco utente", () => {
    // blocked_by_user true ma title != "Infortunio" → seconda riga della mappa,
    // ha priorità su qualsiasi cambio is_hard/library_id.
    const before = session({ date: "2026-07-02", day: "thu", is_hard: true, library_id: "SS-1" });
    const after = session({
      date: "2026-07-02",
      day: "thu",
      rest: true,
      is_hard: false,
      blocked_by_user: true,
      title: "Non disponibile",
      library_id: null,
      session_rationale: "qualcosa che NON deve vincere",
    });
    const changes = diffPlan([before], [after]);
    assert.equal(changes.length, 1);
    assert.equal(changes[0].reason, "Giorno bloccato dall'utente");
  });

  test("aggiunta dura (non-hard → hard) con rationale → usa session_rationale", () => {
    const before = session({ is_hard: false, library_id: "AE-1" });
    const after = session({
      is_hard: true,
      library_id: "VO2-1",
      session_rationale: "Readiness alta: inserita VO2",
    });
    const changes = diffPlan([before], [after]);
    assert.equal(changes.length, 1);
    assert.equal(changes[0].reason, "Readiness alta: inserita VO2");
  });

  test("aggiunta dura (non-hard → hard) senza rationale → fallback dedicato", () => {
    const before = session({ is_hard: false, library_id: "AE-1" });
    const after = session({ is_hard: true, library_id: "VO2-1", session_rationale: "" });
    const changes = diffPlan([before], [after]);
    assert.equal(changes.length, 1);
    assert.equal(changes[0].reason, "Sessione intensa aggiunta dalla rigenerazione");
  });

  test("sostituzione formato (solo library_id) senza rationale → fallback sostituzione", () => {
    // is_hard invariato, cambia solo library_id (+ title coerente col formato).
    const before = session({ is_hard: true, library_id: "SS-1", title: "Soglia (SS-1)" });
    const after = session({
      is_hard: true,
      library_id: "SS-2",
      title: "Soglia (SS-2)",
      session_rationale: "",
    });
    const changes = diffPlan([before], [after]);
    assert.equal(changes.length, 1);
    assert.equal(changes[0].reason, "Seduta sostituita dalla rigenerazione");
  });

  test("solo durata cambiata → Volume aggiustato (ignora rationale)", () => {
    // Stessa seduta, cambia solo estimated_duration_min: il ramo durata è
    // deterministico e NON usa session_rationale.
    const before = session({ estimated_duration_min: 60 });
    const after = session({ estimated_duration_min: 90, session_rationale: "non usato qui" });
    const changes = diffPlan([before], [after]);
    assert.equal(changes.length, 1);
    assert.equal(changes[0].reason, "Volume aggiustato (progressione/mesociclo)");
    assert.equal(changes[0].from, "Lunedì — Endurance (AE-1) 60′");
    assert.equal(changes[0].to, "Lunedì — Endurance (AE-1) 90′");
  });

  test("solo title cambiato (nessun ramo specifico) → fallback generico", () => {
    // Cambia solo il title: non è is_hard, né library_id, né durata, né blocco.
    // Senza rationale → fallback generico "Modificato dalla rigenerazione".
    const before = session({ title: "Endurance A" });
    const after = session({ title: "Endurance B", session_rationale: "" });
    const changes = diffPlan([before], [after]);
    assert.equal(changes.length, 1);
    assert.equal(changes[0].reason, "Modificato dalla rigenerazione");
  });

  test("giorno presente solo nel corrente (prev assente) → from = —", () => {
    // mon è in entrambe le liste e identico (no change); tue esiste solo nel
    // corrente → 1 solo change, sul giorno nuovo, con from "—".
    const mon = session({ date: "2026-06-29", day: "mon" });
    const tue = session({ date: "2026-06-30", day: "tue", title: "Nuovo giorno" });
    const changes = diffPlan([mon], [mon, tue]);
    assert.equal(changes.length, 1);
    assert.equal(changes[0].date, "2026-06-30");
    assert.equal(changes[0].from, "—");
    assert.equal(changes[0].to, "Nuovo giorno 60′");
  });

  test("giorno presente solo nello snapshot (rimosso dal corrente) → to = —", () => {
    const keep = session({ date: "2026-06-29", day: "mon" });
    const removed = session({ date: "2026-06-30", day: "tue", title: "Vecchio giorno" });
    const changes = diffPlan([keep, removed], [keep]);
    assert.equal(changes.length, 1);
    assert.equal(changes[0].date, "2026-06-30");
    assert.equal(changes[0].to, "—");
    assert.equal(changes[0].reason, "Giorno rimosso dalla rigenerazione");
  });
});
