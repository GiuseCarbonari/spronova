import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildCoachContext,
  toPlannedSession,
} from "../lib/ai/coach-context";
import type { MirrorData } from "../lib/intervals/sync";
import type { ReadinessResult } from "../lib/readiness";
import type { BuiltSession } from "../lib/planner/build-week";

/**
 * Test di coach-context (slice 1). Verifica:
 *  - determinismo / lettura stato dal mirror fresco (stale=false, ctl=ultimo);
 *  - degrado senza mirror (phase=null, stale=true, readiness=null, dossier ok);
 *  - mapper toPlannedSession (rest, target, null).
 */

const READINESS: ReadinessResult = {
  decision: "GO",
  priority: 0,
  signals: [{ name: "ri", value: 0.85, status: "green", detail: "ok" }],
  reasons: [],
  confidence: "high",
};

/** Mirror fresco con due giorni di wellness e fetched_at = ora. */
function freshMirror(): MirrorData {
  return {
    fetched_at: new Date().toISOString(),
    athlete_profile: { name: "Test", weight: 70, resting_hr: 50, ftp: 250, zones: null },
    wellness_30d: [
      {
        date: "2026-06-28",
        ctl: 60,
        atl: 55,
        rampRate: null,
        weight: 70,
        restingHR: 48,
        hrv: 80,
        hrvSDNN: null,
        sleepSecs: 25200,
        soreness: null,
        fatigue: null,
        mood: null,
      },
      {
        date: "2026-06-29",
        ctl: 62,
        atl: 58,
        rampRate: null,
        weight: 70,
        restingHR: 49,
        hrv: 82,
        hrvSDNN: null,
        sleepSecs: 25200,
        soreness: null,
        fatigue: null,
        mood: null,
      },
    ] as MirrorData["wellness_30d"],
    activities_90d: [],
    hrv_protocol: "rmssd" as MirrorData["hrv_protocol"],
    readiness_today: READINESS,
    data_quality_warning: null,
  };
}

const PROFILE_ROW: Record<string, unknown> = {
  nome: "Giuseppe",
  livello_esperienza: "advanced",
  obiettivi: "Granfondo estiva",
  fase_corrente: "threshold",
  stile_allenamento: "polarized",
  gare_target: { nome: "GF Test", data: "2026-09-01", distanza_km: 120, dislivello_m: 2000 },
  data_obiettivo: "2026-09-01",
  ftp_outdoor_w: 240,
  ftp_indoor_w: 230,
  max_hr: 190,
  threshold_hr: 170,
  lt2_w: 245,
  lt2_hr: 168,
  limiti_principali: null,
  preferenze_allenamento: null,
  injury_periods: null,
  profile_data: null,
};

test("buildCoachContext: mirror fresco → stale false, ctl ultimo, phase non null", () => {
  const ctx = buildCoachContext(PROFILE_ROW, freshMirror(), "2026-06-29");
  assert.equal(ctx.data_freshness.stale, false);
  assert.equal(ctx.state.ctl, 62); // ultimo CTL del mirror, non ricalcolato
  assert.equal(ctx.state.tsb, 4); // 62 - 58
  assert.notEqual(ctx.phase, null);
  assert.equal(ctx.dossier.ftp_outdoor_w, 240); // dossier iniettato
  assert.equal(ctx.readiness?.decision, "GO");
});

test("buildCoachContext: stale boundary — fetched_at oltre 24h → stale true; sotto → false", () => {
  // 24h + 1 minuto fa → stantio. La data evento è lontana per non far scattare
  // taper/peak; con GF a 2026-09-01 e today 2026-06-29 mancano ~64gg (> 42).
  const old = freshMirror();
  old.fetched_at = new Date(Date.now() - (24 * 60 * 60 * 1000 + 60_000)).toISOString();
  assert.equal(buildCoachContext(PROFILE_ROW, old, "2026-06-29").data_freshness.stale, true);

  // 23h fa → ancora fresco.
  const recent = freshMirror();
  recent.fetched_at = new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString();
  assert.equal(buildCoachContext(PROFILE_ROW, recent, "2026-06-29").data_freshness.stale, false);
});

test("buildCoachContext: dossier passthrough — obiettivi/soglie/gara NON vengono persi", () => {
  // Questo è il punto centrale della feature: i campi dossier devono raggiungere
  // il contesto AI, sia con mirror fresco sia senza.
  const ctx = buildCoachContext(PROFILE_ROW, freshMirror(), "2026-06-29");
  const d = ctx.dossier;
  assert.equal(d.nome, "Giuseppe");
  assert.equal(d.livello_esperienza, "advanced");
  assert.equal(d.obiettivi, "Granfondo estiva");
  assert.equal(d.fase_corrente, "threshold");
  assert.equal(d.stile_allenamento, "polarized");
  assert.equal(d.data_obiettivo, "2026-09-01");
  assert.equal(d.ftp_outdoor_w, 240);
  assert.equal(d.ftp_indoor_w, 230);
  assert.equal(d.max_hr, 190);
  assert.equal(d.threshold_hr, 170);
  assert.equal(d.lt2_w, 245);
  assert.equal(d.lt2_hr, 168);
  // gara_target (JSONB) passa intero, non appiattito.
  assert.deepEqual(d.gara_target, {
    nome: "GF Test",
    data: "2026-09-01",
    distanza_km: 120,
    dislivello_m: 2000,
  });
});

test("buildCoachContext: injured_today true quando today è nel periodo infortunio, false fuori", () => {
  const injured = { ...PROFILE_ROW, injury_periods: [{ start: "2026-06-25", end: "2026-07-05" }] };
  // today dentro il periodo
  assert.equal(buildCoachContext(injured, freshMirror(), "2026-06-29").injured_today, true);
  // today fuori dal periodo (prima dell'inizio)
  assert.equal(buildCoachContext(injured, freshMirror(), "2026-06-20").injured_today, false);
  // nessun periodo → false (non deve lanciare con injury_periods null)
  assert.equal(buildCoachContext(PROFILE_ROW, freshMirror(), "2026-06-29").injured_today, false);
});

test("buildCoachContext: profile_data null → profile null, ma dossier resta popolato", () => {
  // PROFILE_ROW ha già profile_data: null.
  const ctx = buildCoachContext(PROFILE_ROW, freshMirror(), "2026-06-29");
  assert.equal(ctx.profile, null);
  assert.equal(ctx.dossier.obiettivi, "Granfondo estiva"); // dossier non dipende da profile_data
});

test("buildCoachContext: profile_data presente → CP/W′ estratti e arrotondati", () => {
  const withProfile: Record<string, unknown> = {
    ...PROFILE_ROW,
    profile_data: {
      phenotype: { primary: "all-rounder" },
      cp_wprime: { cp_w: 248.7, w_prime_kj: 21.34 },
      weight_kg: 70,
    },
  };
  const ctx = buildCoachContext(withProfile, freshMirror(), "2026-06-29");
  assert.notEqual(ctx.profile, null);
  assert.equal(ctx.profile?.phenotype_primary, "all-rounder");
  assert.equal(ctx.profile?.cp_w, 249); // Math.round(248.7)
  assert.equal(ctx.profile?.w_prime_kj, 21.3); // toFixed(1)
  assert.equal(ctx.profile?.weight_kg, 70);
});

test("buildCoachContext: PURA → stessi input, stesso output", () => {
  const mirror = freshMirror();
  const a = JSON.stringify(buildCoachContext(PROFILE_ROW, mirror, "2026-06-29"));
  const b = JSON.stringify(buildCoachContext(PROFILE_ROW, mirror, "2026-06-29"));
  assert.equal(a, b);
});

test("buildCoachContext: mirror null → phase null, stale true, readiness null, dossier popolato", () => {
  const ctx = buildCoachContext(PROFILE_ROW, null, "2026-06-29");
  assert.equal(ctx.phase, null);
  assert.equal(ctx.data_freshness.stale, true);
  assert.equal(ctx.readiness, null);
  assert.equal(ctx.state.ctl, null);
  assert.equal(ctx.dossier.obiettivi, "Granfondo estiva"); // popolato comunque
  assert.equal(ctx.dossier.ftp_outdoor_w, 240);
});

test("buildCoachContext: profileRow null → dossier tutto null, non lancia", () => {
  // Nessuna riga profilo (atleta senza dossier). Deve degradare, non throware.
  const ctx = buildCoachContext(null, null, "2026-06-29");
  assert.equal(ctx.dossier.nome, null);
  assert.equal(ctx.dossier.obiettivi, null);
  assert.equal(ctx.dossier.ftp_outdoor_w, null);
  assert.equal(ctx.dossier.gara_target, null);
  assert.equal(ctx.profile, null);
  assert.equal(ctx.injured_today, false);
  assert.equal(ctx.phase, null);
  assert.equal(ctx.data_freshness.stale, true);
});

test("buildCoachContext: mirror con wellness_30d vuoto → degrada (ctl null), non lancia", () => {
  // FAILURE CASE: mirror malformato (array wellness vuoto). Lo spec dice degradare,
  // non crashare. Il latest è undefined → ctl/atl/hrv null, phase ancora costruita
  // dalla logica (base, default residuale), e la funzione NON deve lanciare.
  const broken = freshMirror();
  broken.wellness_30d = [] as MirrorData["wellness_30d"];
  let ctx!: ReturnType<typeof buildCoachContext>;
  assert.doesNotThrow(() => {
    ctx = buildCoachContext(PROFILE_ROW, broken, "2026-06-29");
  });
  assert.equal(ctx.state.ctl, null);
  assert.equal(ctx.state.atl, null);
  assert.equal(ctx.state.tsb, null);
  assert.equal(ctx.state.acwr, null);
  assert.equal(ctx.state.hrv, null);
  assert.equal(ctx.state.trend_ctl_14d, "−"); // < 2 punti → no trend
  // il dossier resta intatto anche con mirror rotto
  assert.equal(ctx.dossier.ftp_outdoor_w, 240);
});

test("buildCoachContext: profileRow senza chiavi attese → degrada a null, non lancia", () => {
  // FAILURE CASE: riga profilo che NON contiene le colonne attese (forma inattesa).
  // Deve coercere a null campo per campo, non throware.
  let ctx!: ReturnType<typeof buildCoachContext>;
  assert.doesNotThrow(() => {
    ctx = buildCoachContext({ qualcosa_di_inatteso: 1 }, freshMirror(), "2026-06-29");
  });
  assert.equal(ctx.dossier.obiettivi, null);
  assert.equal(ctx.dossier.ftp_outdoor_w, null);
  assert.equal(ctx.profile, null);
});

test("buildCoachContext: power curve + gap_limiters estratti; null-safe senza dati", () => {
  const withCurve: Record<string, unknown> = {
    ...PROFILE_ROW,
    profile_data: {
      phenotype: { primary: "puncheur" },
      cp_wprime: { cp_w: 250, w_prime_kj: 20 },
      weight_kg: 70,
      rpp: [
        { duration_s: 5, watts: 900.4, wkg: 12.86, watts_1y: 950, wkg_1y: 13.57 },
        { duration_s: 300, watts: 300.7, wkg: 4.29, watts_1y: 320, wkg_1y: 4.57 },
        { duration_s: 1200, watts: 260.2, wkg: 3.71, watts_1y: null, wkg_1y: null },
      ],
    },
    gap_analysis: {
      limiters: [
        {
          name: "Salita lunga a fatica",
          severity: "high",
          gap_wkg: 0.42,
          training_lever: "durability_fatigued",
          evidence: "gap +0.42 W/kg",
          climb_ref: 30,
          climb_refs: [30],
        },
      ],
    },
  };
  const ctx = buildCoachContext(withCurve, freshMirror(), "2026-06-29");

  // power curve current: etichette + arrotondamenti
  assert.equal(ctx.profile?.power_curve_current.length, 3);
  assert.deepEqual(ctx.profile?.power_curve_current[0], { label: "5s", watts: 900, wkg: 12.86 });
  assert.deepEqual(ctx.profile?.power_curve_current[1], { label: "5min", watts: 301, wkg: 4.29 });
  // best_1y: il punto senza watts_1y/wkg_1y è escluso
  assert.equal(ctx.profile?.power_curve_best_1y.length, 2);
  assert.equal(ctx.profile?.power_curve_best_1y[0].label, "5s");
  assert.equal(ctx.profile?.power_curve_best_1y[0].watts, 950);

  // gap_limiters: ridotto ai campi utili
  assert.equal(ctx.gap_limiters?.length, 1);
  assert.equal(ctx.gap_limiters?.[0].name, "Salita lunga a fatica");
  assert.equal(ctx.gap_limiters?.[0].severity, "high");
  assert.equal(ctx.gap_limiters?.[0].gap_wkg, 0.42);

  // null-safe: PROFILE_ROW ha profile_data null e nessun gap_analysis
  const empty = buildCoachContext(PROFILE_ROW, freshMirror(), "2026-06-29");
  assert.equal(empty.profile, null); // niente curva senza profile_data
  assert.equal(empty.gap_limiters, null); // niente gap_analysis → null

  // gap_limiters presente anche nel ramo senza mirror
  const noMirror = buildCoachContext(withCurve, null, "2026-06-29");
  assert.equal(noMirror.gap_limiters?.length, 1);
});

test("buildCoachContext: punto con solo wkg → kept con watts null; punto senza valori → filtrato", () => {
  // Spec §7: un punto con solo wkg (watts null) è mantenuto con watts: null;
  // un punto senza né watts né wkg è escluso (no righe vuote).
  const row: Record<string, unknown> = {
    ...PROFILE_ROW,
    profile_data: {
      phenotype: { primary: "all-rounder" },
      cp_wprime: { cp_w: 250, w_prime_kj: 20 },
      weight_kg: 70,
      rpp: [
        { duration_s: 15, watts: null, wkg: 11.43, watts_1y: null, wkg_1y: 12.0 }, // solo wkg
        { duration_s: 60, watts: 380.6, wkg: 5.44, watts_1y: 400, wkg_1y: 5.71 }, // entrambi
        { duration_s: 600, watts: null, wkg: null, watts_1y: null, wkg_1y: null }, // nessuno → filtrato
      ],
    },
  };
  const ctx = buildCoachContext(row, freshMirror(), "2026-06-29");
  // current: 2 punti (il punto-15s con solo wkg è tenuto, il 600s vuoto è escluso)
  assert.equal(ctx.profile?.power_curve_current.length, 2);
  assert.deepEqual(ctx.profile?.power_curve_current[0], { label: "15s", watts: null, wkg: 11.43 });
  assert.deepEqual(ctx.profile?.power_curve_current[1], { label: "1min", watts: 381, wkg: 5.44 });
  // best_1y: il 15s ha solo wkg_1y → tenuto con watts null; il 600s vuoto escluso
  assert.equal(ctx.profile?.power_curve_best_1y.length, 2);
  assert.deepEqual(ctx.profile?.power_curve_best_1y[0], { label: "15s", watts: null, wkg: 12.0 });
});

test("buildCoachContext: rpp assente/vuoto → curve [] (non null), profile non-null", () => {
  // Spec §7: rpp assente/vuoto → power_curve_current/best_1y = [] (mai null,
  // mai punti inventati). Il profile resta non-null perché profile_data c'è.
  const noRpp: Record<string, unknown> = {
    ...PROFILE_ROW,
    profile_data: { phenotype: { primary: "climber" }, cp_wprime: { cp_w: 230, w_prime_kj: 18 }, weight_kg: 65 },
  };
  const ctxNoRpp = buildCoachContext(noRpp, freshMirror(), "2026-06-29");
  assert.notEqual(ctxNoRpp.profile, null);
  assert.deepEqual(ctxNoRpp.profile?.power_curve_current, []);
  assert.deepEqual(ctxNoRpp.profile?.power_curve_best_1y, []);

  const emptyRpp = { ...noRpp, profile_data: { ...(noRpp.profile_data as object), rpp: [] } };
  const ctxEmpty = buildCoachContext(emptyRpp, freshMirror(), "2026-06-29");
  assert.deepEqual(ctxEmpty.profile?.power_curve_current, []);
  assert.deepEqual(ctxEmpty.profile?.power_curve_best_1y, []);
});

test("buildCoachContext: gap_analysis presente ma limiters vuoto/assente → gap_limiters null", () => {
  // Spec §7: gap_analysis null / no limiters / limiters vuoto → gap_limiters null.
  const emptyLimiters = { ...PROFILE_ROW, gap_analysis: { limiters: [] } };
  assert.equal(buildCoachContext(emptyLimiters, freshMirror(), "2026-06-29").gap_limiters, null);

  const noLimitersKey = { ...PROFILE_ROW, gap_analysis: { event: "GF Test", note: "x" } };
  assert.equal(buildCoachContext(noLimitersKey, freshMirror(), "2026-06-29").gap_limiters, null);

  const nullGap = { ...PROFILE_ROW, gap_analysis: null };
  assert.equal(buildCoachContext(nullGap, freshMirror(), "2026-06-29").gap_limiters, null);
});

test("buildCoachContext: DETERMINISMO con curva+gap_limiters → stessi input, stesso output", () => {
  // La determinism test esistente usa PROFILE_ROW (profile_data null) e NON
  // esercita la curva. Questa lo fa con un contesto che include power curve +
  // gap_limiters, confermando che il nuovo mapping resta puro.
  const withCurve: Record<string, unknown> = {
    ...PROFILE_ROW,
    profile_data: {
      phenotype: { primary: "puncheur" },
      cp_wprime: { cp_w: 250, w_prime_kj: 20 },
      weight_kg: 70,
      rpp: [
        { duration_s: 5, watts: 900.4, wkg: 12.86, watts_1y: 950, wkg_1y: 13.57 },
        { duration_s: 1200, watts: 260.2, wkg: 3.71, watts_1y: null, wkg_1y: null },
      ],
    },
    gap_analysis: {
      limiters: [
        { name: "Salita lunga", severity: "high", gap_wkg: 0.42, training_lever: "x", evidence: "y" },
      ],
    },
  };
  const mirror = freshMirror();
  const a = JSON.stringify(buildCoachContext(withCurve, mirror, "2026-06-29"));
  const b = JSON.stringify(buildCoachContext(withCurve, mirror, "2026-06-29"));
  assert.equal(a, b);
  // sanity: l'output esercitato include davvero la curva e i limiters
  assert.match(a, /power_curve_current/);
  assert.match(a, /gap_limiters/);
});

test("toPlannedSession: rest → rest true; targets mappati; null → null", () => {
  assert.equal(toPlannedSession(null), null);

  const rest = { rest: true, title: "Riposo", sport: "Ciclismo" } as unknown as BuiltSession;
  assert.equal(toPlannedSession(rest)?.rest, true);

  const hard = {
    rest: false,
    title: "VO2max 5x4",
    sport: "Ciclismo",
    is_hard: true,
    estimated_duration_min: 75,
    session_objective: "Massima potenza aerobica",
    interval_structure: "5x4min",
    power_target_zone: "Z5",
    hr_target_zone: "Z4-5",
    rpe_target: "8-9",
    session_rationale: "Sviluppo VO2",
  } as unknown as BuiltSession;
  const mapped = toPlannedSession(hard);
  assert.equal(mapped?.rest, false);
  assert.equal(mapped?.title, "VO2max 5x4");
  assert.equal(mapped?.sport, "Ciclismo");
  assert.equal(mapped?.is_hard, true);
  assert.equal(mapped?.duration_min, 75); // estimated_duration_min
  assert.equal(mapped?.objective, "Massima potenza aerobica"); // session_objective
  assert.equal(mapped?.interval_structure, "5x4min");
  assert.equal(mapped?.power_target_zone, "Z5");
  assert.equal(mapped?.hr_target_zone, "Z4-5");
  assert.equal(mapped?.rpe_target, "8-9");
  assert.equal(mapped?.rationale, "Sviluppo VO2"); // session_rationale
});
