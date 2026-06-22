import assert from "node:assert/strict";
import { test } from "node:test";

import type { IntervalsEvent } from "@/lib/intervals-client";
import { selectOrphanEvents } from "@/lib/planner/reconcile";

/** Costruisce un evento calendario minimo con l'external_id dato. */
function ev(id: number, external_id: string | null): IntervalsEvent {
  return {
    id,
    name: "WORKOUT",
    start_date_local: "2026-06-15T00:00:00",
    category: "WORKOUT",
    type: "Ride",
    distance: null,
    external_id,
  };
}

test("selectOrphanEvents: cancella i nostri eventi non più nel piano", () => {
  const keep = new Set(["curveload-aaa", "curveload-bbb"]);
  const onCalendar = [
    ev(1, "curveload-aaa"), // ancora nel piano → tenere
    ev(2, "curveload-ccc"), // nostro ma non nel piano → orfano
  ];
  const orphans = selectOrphanEvents(onCalendar, keep);
  assert.deepEqual(
    orphans.map((e) => e.id),
    [2]
  );
});

test("selectOrphanEvents: non tocca MAI eventi non nostri", () => {
  const keep = new Set<string>(); // piano vuoto: tutto sarebbe orfano se nostro
  const onCalendar = [
    ev(10, null), // creato a mano dall'utente
    ev(11, "strava-12345"), // altra app
    ev(12, "curveload-zzz"), // nostro → unico orfano
  ];
  const orphans = selectOrphanEvents(onCalendar, keep);
  assert.deepEqual(
    orphans.map((e) => e.id),
    [12]
  );
});

test("selectOrphanEvents: nessun orfano se tutti gli external_id sono nel piano", () => {
  const keep = new Set(["curveload-aaa", "curveload-bbb"]);
  const onCalendar = [ev(1, "curveload-aaa"), ev(2, "curveload-bbb")];
  assert.equal(selectOrphanEvents(onCalendar, keep).length, 0);
});
