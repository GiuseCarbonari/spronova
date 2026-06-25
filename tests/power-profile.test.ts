import assert from "node:assert/strict";
import { test } from "node:test";

import { buildAthleteProfile } from "../lib/profile/build-profile";
import {
  classifyPhenotype,
  computeAPR,
  estimatePowerLawCP,
  extractCPW,
  extractMMP,
  type PowerCurve,
  type PowerCurvesResponse,
} from "../lib/profile/power-profile";

/**
 * Fixture costruita sui DATI REALI dell'ispezione (Milestone 3 passo 1):
 * curva 90d con CP 238 W, W′ 21351 J, pMax 965 W, MMP 1s = 965 W (12.53
 * W/kg → peso curva 77.0 kg). I valori delle altre durate sono di contorno
 * ma coerenti col profilo reale; le asserzioni su CP/W′/pMax/APR fissano
 * esattamente i numeri verificati.
 */

const WEIGHT = 77.0;
const SECS = [1, 2, 3, 5, 15, 30, 60, 120, 300, 600, 1200, 1800, 3600];
const VALUES = [965, 950, 930, 880, 700, 580, 450, 350, 280, 262, 250, 245, 238];

function curve(id: string, overrides: Partial<PowerCurve> = {}): PowerCurve {
  return {
    id,
    label: id,
    days: id === "90d" ? 90 : id === "42d" ? 42 : 365,
    weight: WEIGHT,
    secs: [...SECS],
    values: [...VALUES],
    watts_per_kg: VALUES.map((w) => Math.round((w / WEIGHT) * 100) / 100),
    powerModels: [
      { type: "MS_2P", criticalPower: 242, wPrime: 19000, ftp: 240 },
      {
        type: "MORTON_3P",
        criticalPower: 238,
        wPrime: 21351,
        pMax: 965,
        ftp: 236,
      },
      {
        type: "FFT_CURVES",
        criticalPower: 245,
        wPrime: 20000,
        pMax: 950,
        ftp: 241,
      },
    ],
    vo2max_5m: 48.2,
    mapPlot: { map: 0, mapWatts: 0, mapSecs: 0 },
    ...overrides,
  };
}

const RESPONSE: PowerCurvesResponse = {
  list: [curve("42d"), curve("90d"), curve("1y")],
};

test("extractCPW: legge Morton 3P (CP 238, W' 21351, pMax 965)", () => {
  const cpw = extractCPW(curve("90d"));
  assert.ok(cpw);
  assert.equal(cpw.cp, 238);
  assert.equal(cpw.wPrime, 21351);
  assert.equal(cpw.pMax, 965);
  assert.equal(cpw.model, "MORTON_3P");
  assert.equal(cpw.source, "intervals_morton3p");
});

test("extractCPW: fallback MS_2P se Morton 3P assente", () => {
  const noMorton = curve("90d", {
    powerModels: [{ type: "MS_2P", criticalPower: 242, wPrime: 19000, ftp: 240 }],
  });
  const cpw = extractCPW(noMorton);
  assert.ok(cpw);
  assert.equal(cpw.cp, 242);
  assert.equal(cpw.model, "MS_2P");
  assert.equal(cpw.pMax, null); // il 2P non stima pMax
});

test("extractCPW: null senza modelli", () => {
  assert.equal(extractCPW(curve("90d", { powerModels: [] })), null);
});

test("extractMMP: durate esatte lette allo stesso indice", () => {
  const mmp = extractMMP(curve("90d"));
  const at1s = mmp.find((p) => p.duration_s === 1);
  assert.equal(at1s?.watts, 965);
  assert.equal(at1s?.wkg, 12.53); // dato reale dell'ispezione
  assert.equal(at1s?.exact, true);

  const at60s = mmp.find((p) => p.duration_s === 60);
  assert.equal(at60s?.watts, 450);
  assert.equal(at60s?.exact, true);
});

test("extractMMP: durata non presente → punto più vicino, exact=false", () => {
  const mmp = extractMMP(curve("90d"), [20]);
  assert.equal(mmp[0].exact, false);
  assert.equal(mmp[0].actual_secs, 15); // 15s è più vicino a 20 di 30s
  assert.equal(mmp[0].watts, 700);
});

test("computeAPR: MPR = MSP − CP con i dati reali (965 − 238)", () => {
  const mmp = extractMMP(curve("90d"));
  const apr = computeAPR(mmp, 238, 965);
  assert.ok(apr);
  assert.equal(apr.msp, 965);
  assert.equal(apr.apr, 727);
  assert.ok(Math.abs(apr.apr_ratio - 4.055) < 0.01);
  assert.equal(apr.denominator, "cp");
});

test("computeAPR: fallback MMP 1s se pMax assente", () => {
  const mmp = extractMMP(curve("90d"));
  const apr = computeAPR(mmp, 238, null);
  assert.ok(apr);
  assert.equal(apr.msp, 965); // MMP a 1s
});

test("estimatePowerLawCP: riproduce il report utente (MMP reali → CP ≈ 221)", () => {
  // MMP reali dal report AnalyzeMe dell'utente (durate aerobiche).
  const reportSecs = [60, 120, 300, 600, 1200, 1800, 3600];
  const reportVals = [441, 344, 279, 279, 241, 213, 192];
  const reportCurve = curve("90d", {
    secs: reportSecs,
    values: reportVals,
    watts_per_kg: reportVals.map((w) => Math.round((w / WEIGHT) * 100) / 100),
  });
  const mmp = extractMMP(reportCurve, reportSecs);
  const pl = estimatePowerLawCP(mmp);
  assert.ok(pl);
  // La power-law a 20 min sui MMP reali cade nel range del report (≈221 W),
  // ben sopra il Morton 3P di Intervals (≈199 W sullo stesso atleta).
  assert.ok(pl.cp >= 215 && pl.cp <= 240, `CP power-law fuori range: ${pl.cp}`);
  assert.equal(pl.model, "POWER_LAW");
  assert.equal(pl.source, "app_powerlaw_fit");
  assert.ok(pl.e > 0 && pl.e < 1, `E fuori range fisiologico: ${pl.e}`);
});

test("estimatePowerLawCP: null con meno di 3 punti aerobici", () => {
  const sparse = extractMMP(
    curve("90d", { secs: [300, 600], values: [280, 262], watts_per_kg: [3.6, 3.4] }),
    [300, 600]
  );
  assert.equal(estimatePowerLawCP(sparse), null);
});

test("classifyPhenotype: deterministico sulla fixture (diesel + punta esplosiva)", () => {
  const mmp = extractMMP(curve("90d"));
  const cpWkg = 238 / WEIGHT; // 3.09
  // flatness = wkg(300)/wkg(1200) = 3.64/3.25 ≈ 1.12 < 1.15 → diesel
  // apr_ratio 4.05 > 2.6 → tratto esplosivo come secondario
  const result = classifyPhenotype(mmp, 965 / 238, cpWkg);
  assert.equal(result.primary, "diesel");
  assert.equal(result.secondary, "sprinter");
  assert.equal(result.confidence, "high");
  assert.equal(result.thresholds_version, "v0");
  assert.ok(result.basis.some((b) => b.startsWith("apr_ratio=")));
});

test("classifyPhenotype: dati assenti → all_rounder con confidence low", () => {
  const empty = extractMMP(curve("90d", { secs: [], values: [], watts_per_kg: [] }));
  const result = classifyPhenotype(empty, null, null);
  assert.equal(result.primary, "all_rounder");
  assert.equal(result.confidence, "low");
});

test("buildAthleteProfile: integrazione completa sui dati reali", () => {
  const profile = buildAthleteProfile(
    RESPONSE,
    { icu_weight: 76.5, icu_resting_hr: 48 },
    "2026-06-12T10:00:00.000Z"
  );

  assert.equal(profile.meta.generated_at, "2026-06-12T10:00:00.000Z");
  // Finestra primaria 42d (build-profile.ts: 42d ha priorità, 90d è fallback).
  assert.equal(profile.meta.window_days, 42);
  assert.equal(profile.meta.confidence, "high");

  // Peso da icu_weight (fonte authoritative: ha priorità sulla curva).
  assert.equal(profile.weight_kg, 76.5);
  assert.equal(profile.weight_source, "icu_weight");

  // CP/W' letti, non ricalcolati.
  assert.equal(profile.cp_wprime?.cp_w, 238);
  assert.equal(profile.cp_wprime?.w_prime_kj, 21.351);
  assert.equal(profile.cp_wprime?.p_max_w, 965);
  assert.ok(Math.abs((profile.cp_wprime?.cp_wkg ?? 0) - 238 / 76.5) < 0.01);

  // CP power-law: modello alternativo presente, calcolato sugli stessi MMP.
  assert.ok(profile.cp_power_law);
  assert.equal(profile.cp_power_law?.model, "POWER_LAW");
  assert.ok((profile.cp_power_law?.cp_w ?? 0) > 0);
  // cp_wprime resta il dato LETTO da Intervals (regola No Virtual Math).
  assert.equal(profile.cp_wprime?.cp_w, 238);

  // APR coerente.
  assert.equal(profile.apr?.apr, 727);

  // RPP con riferimento 1y allineato per durata.
  const rpp60 = profile.rpp.find((p) => p.duration_s === 60);
  assert.equal(rpp60?.watts, 450);
  assert.equal(rpp60?.watts_1y, 450);

  assert.equal(profile.phenotype.primary, "diesel");
  assert.equal(profile.vo2max_5m, 48.2);
});

test("buildAthleteProfile: senza modelli CP la confidence scende a low", () => {
  const response: PowerCurvesResponse = {
    list: [curve("90d", { powerModels: [] })],
  };
  const profile = buildAthleteProfile(response, {});
  assert.equal(profile.cp_wprime, null);
  assert.equal(profile.apr, null);
  assert.equal(profile.meta.confidence, "low");
});
