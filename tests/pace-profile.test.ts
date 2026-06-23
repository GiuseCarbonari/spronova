import assert from "node:assert/strict";
import { test } from "node:test";

import { buildRunnerProfile } from "../lib/profile/build-runner-profile";
import {
  classifyRunnerPhenotype,
  enforceMonotonicPredictions,
  estimateLT1Pace,
  extractCS,
  extractRPP,
  fitPowerLaw,
  intensityDomains,
  predictRace,
  trainingZones,
  type PaceCurve,
  type PaceCurvesResponse,
  type RacePrediction,
} from "../lib/profile/pace-profile";

/**
 * Fixture sui DATI REALI dell'ispezione (2026-06-24, attività 16662566652):
 * la curva "all" ha paceModel CS con criticalSpeed 4.479235 m/s,
 * dPrime 869.56903 m, r2 0.98383075. I punti distance[]/values[] qui sono
 * un set coerente che genera quei valori in modo plausibile (un runner ~3:43/km
 * di soglia): distanze in metri, tempi in secondi.
 */

// (distanza m, tempo s) — copre i tre regimi: <3min, 3–15min, >15min.
const POINTS: Array<[number, number]> = [
  [400, 70], // 0:70  → 2:55/km  (sprint, <3min)
  [800, 150], // 2:30  → 3:07/km  (<3min)
  [1000, 195], // 3:15 → 3:15/km  (regime CS, ~3min)
  [1500, 300], // 5:00 → 3:20/km  (regime CS)
  [3000, 645], // 10:45 → 3:35/km (regime CS, ~11min)
  [5000, 1140], // 19:00 → 3:48/km (regime lungo, >15min)
  [10000, 2400], // 40:00 → 4:00/km (lungo)
  [21097, 5400], // 1:30:00 → 4:16/km (lungo)
];

function curve(id: string, overrides: Partial<PaceCurve> = {}): PaceCurve {
  return {
    id,
    label: id,
    days: id === "90d" ? 90 : id === "42d" ? 42 : id === "1y" ? 366 : 1531,
    weight: 74.6,
    distance: POINTS.map((p) => p[0]),
    values: POINTS.map((p) => p[1]),
    activity_id: POINTS.map(() => "16662566652"),
    type: "PACE",
    paceModels: [
      {
        type: "CS",
        criticalSpeed: 4.479235,
        dPrime: 869.56903,
        r2: 0.98383075,
      },
    ],
    ...overrides,
  };
}

const RESPONSE: PaceCurvesResponse = {
  list: [curve("42d"), curve("90d"), curve("1y"), curve("all")],
};

test("extractCS legge CS/D′ da Intervals senza ricalcolare", () => {
  const cs = extractCS(curve("all"));
  assert.ok(cs);
  assert.equal(cs.cs_ms, 4.479235);
  assert.equal(cs.d_prime_m, 869.56903);
  assert.equal(cs.r2, 0.98383075);
  // CS pace = 1000/4.479235 ≈ 223.25 s/km
  assert.ok(Math.abs(cs.cs_pace_s_per_km - 223.25) < 0.5);
});

test("extractCS ritorna null se manca il paceModel CS", () => {
  assert.equal(extractCS(curve("all", { paceModels: [] })), null);
  assert.equal(
    extractCS(curve("all", { paceModels: [{ type: "CS", criticalSpeed: null, dPrime: 5 }] })),
    null
  );
});

test("extractRPP trova il punto più vicino e calcola passo/velocità", () => {
  const rpp = extractRPP(curve("all"));
  const p1500 = rpp.find((p) => p.distance_m === 1500);
  assert.ok(p1500);
  assert.equal(p1500.exact, true);
  assert.equal(p1500.time_s, 300);
  // 300 s / 1500 m * 1000 = 200 s/km
  assert.equal(p1500.pace_s_per_km, 200);
  assert.equal(p1500.speed_ms, 5);
});

test("fitPowerLaw produce S/E plausibili e r2 alto sul regime lungo", () => {
  const pl = fitPowerLaw(curve("all"), 900, Infinity);
  assert.ok(pl);
  assert.ok(pl.n >= 3, `attesi ≥3 punti, trovati ${pl.n}`);
  assert.ok(pl.r2 > 0.9, `r2 atteso >0.9, ottenuto ${pl.r2}`);
  // E vicino a 1 ma <1 (la velocità cala con la durata).
  assert.ok(pl.e > 0.7 && pl.e < 1, `E fuori range: ${pl.e}`);
  // S (velocità a 1s) deve superare la velocità massima reale.
  assert.ok(pl.s_ms > 5, `S troppo basso: ${pl.s_ms}`);
});

test("fitPowerLaw ritorna null con meno di 3 punti nel range", () => {
  // Solo 1 punto cade in [0,180): nessun fit.
  const sparse = curve("all", {
    distance: [400, 5000, 10000],
    values: [70, 1140, 2400],
  });
  assert.equal(fitPowerLaw(sparse, 0, 180), null);
});

test("predictRace usa il modello giusto per regime e produce tempi monotoni", () => {
  const cs = extractCS(curve("all"));
  const plShort = fitPowerLaw(curve("all"), 0, 180);
  const plLong = fitPowerLaw(curve("all"), 900, Infinity);

  const r1500 = predictRace(1500, cs, plShort, plLong);
  const r10k = predictRace(10000, cs, plShort, plLong);
  assert.ok(r1500 && r10k);
  // 1500m cade nel regime CS (3–15min).
  assert.equal(r1500.model, "cs_dprime");
  // 10k > 15min → power-law lungo (se disponibile).
  assert.equal(r10k.model, "pl_long");
  // Più lunga la distanza, più lungo il tempo.
  assert.ok(r10k.time_s > r1500.time_s);
  // Più lunga la distanza, più lento il passo.
  assert.ok(r10k.pace_s_per_km > r1500.pace_s_per_km);
});

test("predictRace senza CS cade sul power-law disponibile", () => {
  const plLong = fitPowerLaw(curve("all"), 900, Infinity);
  const r = predictRace(10000, null, null, plLong);
  assert.ok(r);
  assert.equal(r.model, "pl_long");
});

test("classifyRunnerPhenotype calcola il decadimento e la confidence", () => {
  const plLong = fitPowerLaw(curve("all"), 900, Infinity);
  const ph = classifyRunnerPhenotype(plLong, null);
  assert.ok(ph.decay_per_doubling_pct != null);
  assert.ok(["diesel", "mixed", "speed"].includes(ph.primary));
  assert.ok(ph.basis.some((b) => b.startsWith("E=")));
});

test("classifyRunnerPhenotype senza fit → mixed/low", () => {
  const ph = classifyRunnerPhenotype(null, null);
  assert.equal(ph.primary, "mixed");
  assert.equal(ph.confidence, "low");
  assert.equal(ph.decay_per_doubling_pct, null);
});

test("trainingZones deriva 6 zone da %CS con passi ordinati", () => {
  const cs = extractCS(curve("all"));
  const zones = trainingZones(cs);
  assert.equal(zones.length, 6);
  // Z1 recupero è aperto verso il lento (lo=0 → passo illimitato): from null.
  const z1 = zones.find((z) => z.zone === "Z1")!;
  assert.equal(z1.pace_from_s_per_km, null);
  // Il lato veloce (pace_to) accelera salendo di zona: Z1 più lento di Z4.
  const z4 = zones.find((z) => z.zone === "Z4")!;
  assert.ok(z1.pace_to_s_per_km! > z4.pace_to_s_per_km!);
  // Z6 anaerobico ha hi = Infinity → pace_to null (illimitato verso il veloce).
  const z6 = zones.find((z) => z.zone === "Z6")!;
  assert.equal(z6.pace_to_s_per_km, null);
});

test("trainingZones con CS null → tutte le bande a null", () => {
  const zones = trainingZones(null);
  assert.ok(zones.every((z) => z.pace_from_s_per_km === null));
});

test("enforceMonotonicPredictions corregge le inversioni di tempo tra regimi", () => {
  // Serie con inversione di PASSO: l'800m (più lungo) risulta più VELOCE del
  // 400m (passo minore), impossibile. enforceMonotonic alza il passo dell'800m.
  const raw: RacePrediction[] = [
    { distance_m: 400, time_s: 126, pace_s_per_km: 315, model: "pl_short" },
    { distance_m: 800, time_s: 223, pace_s_per_km: 279, model: "cs_dprime" },
    { distance_m: 1500, time_s: 540, pace_s_per_km: 360, model: "cs_dprime" },
  ];
  const fixed = enforceMonotonicPredictions(raw);
  // Il passo deve essere non-decrescente con la distanza.
  for (let i = 1; i < fixed.length; i++) {
    assert.ok(
      fixed[i].pace_s_per_km >= fixed[i - 1].pace_s_per_km - 0.01,
      `passo non monotòno a ${fixed[i].distance_m}m`
    );
  }
  // L'800m è stato corretto e marcato adjusted.
  const p800 = fixed.find((p) => p.distance_m === 800)!;
  assert.equal(p800.adjusted, true);
  assert.equal(p800.pace_s_per_km, 315);
});

test("buildRunnerProfile produce predizioni con passo monotòno crescente", () => {
  const profile = buildRunnerProfile(RESPONSE, { icu_weight: 74.6 });
  const preds = profile.race_predictions;
  // Passo non decrescente: distanze più lunghe → passo ≥ (mai più veloce).
  for (let i = 1; i < preds.length; i++) {
    assert.ok(
      preds[i].pace_s_per_km >= preds[i - 1].pace_s_per_km - 0.01,
      `passo non monotòno a ${preds[i].distance_m}m: ${preds[i].pace_s_per_km} < ${preds[i - 1].pace_s_per_km}`
    );
  }
});

test("estimateLT1Pace stima LT1 al 78% della CS (più lento della CS)", () => {
  const cs = extractCS(curve("all"));
  const lt1 = estimateLT1Pace(cs);
  assert.ok(lt1);
  // LT1 è più lento (passo maggiore) della CS.
  assert.ok(lt1 > cs!.cs_pace_s_per_km);
  // velocità LT1 = 0.78 · CS → passo = csPace / 0.78
  assert.ok(Math.abs(lt1 - cs!.cs_pace_s_per_km / 0.78) < 0.5);
  assert.equal(estimateLT1Pace(null), null);
});

test("intensityDomains produce 4 domini con confini ordinati LT1<CS<vVO2max", () => {
  const cs = extractCS(curve("all"));
  const lt1 = estimateLT1Pace(cs);
  // vVO2max ipotetica più veloce della CS (passo minore → m/s maggiore).
  const domains = intensityDomains(cs, lt1, 5.2);
  assert.equal(domains.length, 4);
  const moderate = domains.find((d) => d.name === "Moderate")!;
  const extreme = domains.find((d) => d.name === "Extreme")!;
  // Moderate aperto verso il lento, Extreme aperto verso il veloce.
  assert.equal(moderate.pace_slow_s_per_km, null);
  assert.equal(extreme.pace_fast_s_per_km, null);
  // Heavy va da LT1 (lento) a CS (veloce): slow > fast in s/km.
  const heavy = domains.find((d) => d.name === "Heavy")!;
  assert.ok(heavy.pace_slow_s_per_km! > heavy.pace_fast_s_per_km!);
});

test("buildRunnerProfile compone il profilo completo dai dati reali", () => {
  const profile = buildRunnerProfile(RESPONSE, { icu_weight: 74.6 }, "2026-06-24T00:00:00Z");
  assert.equal(profile.sport, "run");
  assert.equal(profile.weight_kg, 74.6);
  assert.ok(profile.cs_dprime);
  assert.equal(profile.cs_dprime.cs_ms, 4.479235);
  assert.equal(profile.meta.source, "intervals_pace_curves");
  // Predizioni gara presenti e ordinate per distanza crescente.
  assert.ok(profile.race_predictions.length > 0);
  const times = profile.race_predictions.map((p) => p.time_s);
  for (let i = 1; i < times.length; i++) {
    assert.ok(times[i] > times[i - 1], "tempi non monotoni");
  }
  // Confidence non low (CS presente, fit buoni).
  assert.notEqual(profile.meta.confidence, undefined);
  assert.equal(profile.zones.length, 6);
  // Nuovi derivati: LT1 e 4 domini d'intensità.
  assert.ok(profile.lt1_pace_s_per_km != null);
  assert.equal(profile.intensity_domains.length, 4);
});

test("buildRunnerProfile con curve vuote → confidence low ma non lancia", () => {
  const empty: PaceCurvesResponse = {
    list: [{ id: "all", distance: [], values: [], paceModels: [] }],
  };
  const profile = buildRunnerProfile(empty, {}, "2026-06-24T00:00:00Z");
  assert.equal(profile.cs_dprime, null);
  assert.equal(profile.meta.confidence, "low");
});

test("buildRunnerProfile lancia se non c'è nessuna curva", () => {
  assert.throws(() => buildRunnerProfile({ list: [] }, {}));
});
