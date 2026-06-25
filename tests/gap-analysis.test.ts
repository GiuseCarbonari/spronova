import assert from "node:assert/strict";
import { test } from "node:test";

import type { AthleteProfileData } from "../lib/profile/build-profile";
import type { Climb, TerrainSummary } from "../lib/terrain/gpx-parser";
import {
  classifyDemand,
  computeGapAnalysis,
  estimateClimbDuration,
  estimateFatigue,
  groupLimiters,
} from "../lib/terrain/gap-analysis";

/**
 * Test di lib/terrain/gap-analysis.ts (PRD §33 C.6). Verificano i modelli di
 * stima dichiarati (durata/fatica), la classificazione della domanda e la
 * costruzione/raggruppamento dei limitatori — nessuna chiamata AI/rete.
 */

function makeClimb(overrides: Partial<Climb> = {}): Climb {
  return {
    position_km: 10,
    distance_km: 5,
    elevation_m: 400,
    avg_gradient_pct: 8,
    max_gradient_pct: 9,
    category: "Cat 2",
    start_coords: { lat: 45, lon: 9 },
    end_coords: { lat: 45.05, lon: 9 },
    ...overrides,
  };
}

function makeProfile(overrides: Partial<AthleteProfileData> = {}): AthleteProfileData {
  return {
    meta: {
      generated_at: "2026-06-16T00:00:00.000Z",
      window_days: 90,
      source: "intervals_power_curves",
      confidence: "high",
    },
    weight_kg: 75,
    weight_source: "power_curve",
    rpp: [
      { duration_s: 300, actual_secs: 300, watts: 300, wkg: 4.0, exact: true, watts_1y: null, wkg_1y: null },
      { duration_s: 1200, actual_secs: 1200, watts: 240, wkg: 3.2, exact: true, watts_1y: null, wkg_1y: null },
      { duration_s: 3600, actual_secs: 3600, watts: 200, wkg: 2.67, exact: true, watts_1y: null, wkg_1y: null },
    ],
    cp_wprime: {
      cp_w: 238,
      cp_wkg: 3.17,
      w_prime_j: 21_350,
      w_prime_kj: 21.35,
      p_max_w: 965,
      ftp_model_w: 226,
      model: "MORTON_3P",
      source: "power-curves.json",
    },
    cp_power_law: null,
    apr: { msp: 965, denominator: "cp", apr: 727, apr_ratio: 4.05 },
    phenotype: { primary: "diesel", secondary: null, confidence: "high", basis: [], thresholds_version: "v0" },
    vo2max_5m: null,
    ...overrides,
  };
}

function makeTerrain(climbs: Climb[], total_distance_km = 50): TerrainSummary {
  return {
    total_distance_km,
    total_elevation_m: climbs.reduce((s, c) => s + c.elevation_m, 0),
    elevation_per_km: 20,
    course_character: "hilly",
    climbs,
    descents: [],
    polyline: [],
  };
}

test("estimateClimbDuration: null senza CP o peso", () => {
  const climb = makeClimb();
  assert.equal(estimateClimbDuration(climb, null, 75), null);
  assert.equal(estimateClimbDuration(climb, 238, null), null);
});

test("estimateClimbDuration: durata positiva e coerente con la pendenza", () => {
  const gentle = makeClimb({ avg_gradient_pct: 4, distance_km: 5 });
  const steep = makeClimb({ avg_gradient_pct: 12, distance_km: 5 });
  const durGentle = estimateClimbDuration(gentle, 238, 75);
  const durSteep = estimateClimbDuration(steep, 238, 75);
  assert.ok(durGentle != null && durGentle > 0);
  assert.ok(durSteep != null && durSteep > 0);
  assert.ok(durSteep! > durGentle!, "a parità di potenza, più pendenza ⇒ più tempo sulla stessa distanza");
});

test("classifyDemand: salita lunga (>1200s) → long_sustained", () => {
  const climb = makeClimb({ max_gradient_pct: 6 });
  const { demand_type, has_steep_pitch } = classifyDemand(climb, 1500);
  assert.equal(demand_type, "long_sustained");
  assert.equal(has_steep_pitch, false);
});

test("classifyDemand: durata breve (<300s) → short_punch, pendenza ≥8% → has_steep_pitch", () => {
  const climb = makeClimb({ max_gradient_pct: 10 });
  const { demand_type, has_steep_pitch } = classifyDemand(climb, 120);
  assert.equal(demand_type, "short_punch");
  assert.equal(has_steep_pitch, true);
});

test("estimateFatigue: fresh/moderate/fatigued in base alla frazione di percorso", () => {
  const total = 100;
  assert.equal(estimateFatigue(makeClimb({ position_km: 10 }), total, 50).fatigue_level, "fresh");
  assert.equal(estimateFatigue(makeClimb({ position_km: 50 }), total, 50).fatigue_level, "moderate");
  assert.equal(estimateFatigue(makeClimb({ position_km: 90 }), total, 50).fatigue_level, "fatigued");
});

test("computeGapAnalysis: nota CP assente quando profilo senza cp_wprime", () => {
  const terrain = makeTerrain([makeClimb()]);
  const profile = makeProfile({ cp_wprime: null });
  const result = computeGapAnalysis(terrain, profile, 50);
  assert.ok(result.note?.includes("CP non disponibile"));
});

test("computeGapAnalysis: nessuna nota quando CP e peso sono disponibili", () => {
  const terrain = makeTerrain([makeClimb()]);
  const profile = makeProfile();
  const result = computeGapAnalysis(terrain, profile, 50);
  assert.equal(result.note, null);
});

test("computeGapAnalysis: salita lunga a fatica → leva durability_fatigued", () => {
  // Salita lunga (oltre 1200s stimati) verso la fine del percorso (fatigued).
  const climb = makeClimb({
    position_km: 90,
    distance_km: 8,
    avg_gradient_pct: 6,
    elevation_m: 480,
    max_gradient_pct: 7,
  });
  const terrain = makeTerrain([climb], 100);
  const profile = makeProfile();
  const result = computeGapAnalysis(terrain, profile, 60);

  assert.equal(result.climb_demands[0].demand_type, "long_sustained");
  assert.equal(result.climb_demands[0].fatigue_level, "fatigued");
  assert.equal(result.limiters.length, 1);
  assert.equal(result.limiters[0].training_lever, "durability_fatigued");
});

test("computeGapAnalysis: severità ordinate high → medium → low", () => {
  const terrain = makeTerrain(
    [
      makeClimb({ position_km: 5, distance_km: 6, avg_gradient_pct: 9, elevation_m: 540, max_gradient_pct: 9 }),
      makeClimb({ position_km: 40, distance_km: 6, avg_gradient_pct: 3, elevation_m: 180, max_gradient_pct: 4 }),
    ],
    100
  );
  // Profilo debole in salita lunga (RPP basso) per garantire severità alta sulla prima.
  const weakProfile = makeProfile({
    rpp: [{ duration_s: 1200, actual_secs: 1200, watts: 150, wkg: 2.0, exact: true, watts_1y: null, wkg_1y: null }],
  });
  const result = computeGapAnalysis(terrain, weakProfile, 50);
  const severities = result.limiters.map((l) => l.severity);
  const ranks: Record<string, number> = { high: 0, medium: 1, low: 2 };
  for (let i = 1; i < severities.length; i++) {
    assert.ok(ranks[severities[i]] >= ranks[severities[i - 1]], "le severità devono essere non-decrescenti (rosso→giallo→verde)");
  }
});

test("groupLimiters: ≥2 salite con stessa leva+severità si aggregano in un solo limitatore ×N", () => {
  const base = {
    demand_type: "long_sustained" as const,
    fatigue_level: "moderate" as const,
    training_lever: "threshold_long",
    severity: "medium" as const,
    workout_library_refs: ["soglia 2×20'"],
    est_duration_s: 1500,
    required_wkg: 3.0,
    athlete_wkg: 2.8,
    name: "Salita lunga sostenuta",
    evidence: "x",
  };
  const limiters = [
    { ...base, climb_ref: 5, climb_refs: [5], gap_wkg: 0.2 },
    { ...base, climb_ref: 30, climb_refs: [30], gap_wkg: 0.3 },
  ];
  const grouped = groupLimiters(limiters);
  assert.equal(grouped.length, 1);
  assert.match(grouped[0].name, /×2/);
  assert.deepEqual(grouped[0].climb_refs, [5, 30]);
  assert.equal(grouped[0].gap_wkg, 0.25, "gap medio delle due salite");
});

test("groupLimiters: limitatori con leva o severità diverse restano separati", () => {
  const a = {
    climb_ref: 5,
    climb_refs: [5],
    demand_type: "long_sustained" as const,
    fatigue_level: "moderate" as const,
    training_lever: "threshold_long",
    severity: "high" as const,
    workout_library_refs: [],
    est_duration_s: 1500,
    required_wkg: 3.0,
    athlete_wkg: 2.5,
    gap_wkg: 0.5,
    name: "A",
    evidence: "x",
  };
  const b = { ...a, climb_ref: 30, climb_refs: [30], severity: "low" as const, name: "B" };
  const grouped = groupLimiters([a, b]);
  assert.equal(grouped.length, 2, "severità diverse non si aggregano");
});
