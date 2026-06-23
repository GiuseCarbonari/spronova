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
  DEFAULT_RPP_DISTANCES_M,
  REGIME_LONG_MIN_S,
  REGIME_SHORT_MAX_S,
  type CSResult,
  type IntensityDomain,
  type PaceCurve,
  type PaceCurvesResponse,
  type PacePoint,
  type PaceZone,
  type PowerLawFit,
  type RacePrediction,
  type RunnerPhenotypeResult,
} from "@/lib/profile/pace-profile";

/**
 * Orchestratore del profilo corsa (Modulo Corsa) — puro.
 *
 * Specchio di build-profile.ts ma su pace-curves: legge CS/D′ da Intervals
 * (No Virtual Math), fitta il power-law per i regimi <3min e >15min (fit
 * nostro, dichiarato v0), e compone profile_data + predizioni gara + zone.
 *
 * Le distanze di predizione gara seguono lo schema AnalyzeMe (Walt 2025).
 */

/** Distanze ufficiali per la tabella predizioni gara (metri). */
export const RACE_PREDICTION_DISTANCES_M = [
  400, 800, 1500, 2000, 3000, 5000, 10000, 15000, 21097, 30000, 42195, 50000,
] as const;

export interface RunnerProfileData {
  meta: {
    generated_at: string;
    window_days: number;
    source: "intervals_pace_curves";
    confidence: "high" | "medium" | "low";
  };
  sport: "run";
  weight_kg: number | null;
  rpp: PacePoint[];
  cs_dprime: {
    cs_ms: number;
    cs_pace_s_per_km: number;
    d_prime_m: number;
    r2: number | null;
    source: string;
  } | null;
  /** Fit power-law per i due regimi non-iperbolici (può essere null). */
  power_law: {
    short: PowerLawFit | null;
    long: PowerLawFit | null;
  };
  phenotype: RunnerPhenotypeResult;
  /** vVO2max stimata: velocità al miglior 5 min (≈ 300 s). */
  vvo2max_ms: number | null;
  /** Frazione di utilizzo CS / v@5min (quota della VO2max sostenibile). */
  utilization_fraction: number | null;
  /** LT1 stimato (~78% CS, formula empirica) come passo s/km. */
  lt1_pace_s_per_km: number | null;
  race_predictions: RacePrediction[];
  zones: PaceZone[];
  intensity_domains: IntensityDomain[];
}

/** Trova la curva per id, primaria 42d con fallback verso finestre più larghe. */
function pickPrimary(curves: PaceCurvesResponse): PaceCurve | null {
  const byId = (id: string) => curves.list.find((c) => c.id === id) ?? null;
  return (
    byId("42d") ?? byId("90d") ?? byId("1y") ?? byId("all") ?? curves.list[0] ?? null
  );
}

/** Velocità (m/s) al punto più vicino a `targetSecs` di durata nella curva. */
function speedAtDuration(curve: PaceCurve, targetSecs: number): number | null {
  let best = -1;
  let bestDelta = Infinity;
  for (let i = 0; i < curve.distance.length; i++) {
    const t = curve.values[i];
    const d = curve.distance[i];
    if (t == null || d == null || t <= 0 || d <= 0) continue;
    const delta = Math.abs(t - targetSecs);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = i;
    }
  }
  if (best < 0) return null;
  return curve.distance[best] / curve.values[best];
}

export function buildRunnerProfile(
  paceCurves: PaceCurvesResponse,
  athleteRaw: Record<string, unknown>,
  generatedAt: string = new Date().toISOString()
): RunnerProfileData {
  const primary = pickPrimary(paceCurves);
  if (!primary) {
    throw new Error("Risposta pace-curves senza curve disponibili");
  }

  const icuWeight =
    typeof athleteRaw.icu_weight === "number" ? athleteRaw.icu_weight : null;
  const weightKg = icuWeight ?? primary.weight ?? null;

  // CS/D′ letti da Intervals (No Virtual Math).
  const cs: CSResult | null = extractCS(primary);

  // Fit power-law NOSTRI per i due regimi non-iperbolici.
  const plShort = fitPowerLaw(primary, 0, REGIME_SHORT_MAX_S);
  const plLong = fitPowerLaw(primary, REGIME_LONG_MIN_S, Infinity);

  const rpp = extractRPP(primary, DEFAULT_RPP_DISTANCES_M);
  const phenotype = classifyRunnerPhenotype(plLong, plShort);

  // vVO2max ≈ velocità sostenibile ~5 min; frazione di utilizzo = CS / vVO2max.
  const vvo2max = speedAtDuration(primary, 300);
  const utilization =
    cs != null && vvo2max != null && vvo2max > 0 ? cs.cs_ms / vvo2max : null;

  const racePredictions = enforceMonotonicPredictions(
    RACE_PREDICTION_DISTANCES_M.map((d) =>
      predictRace(d, cs, plShort, plLong)
    ).filter((p): p is RacePrediction => p != null)
  );

  const zones = trainingZones(cs);
  const lt1Pace = estimateLT1Pace(cs);
  const domains = intensityDomains(cs, lt1Pace, vvo2max);

  // Confidence: non può essere alta senza CS. Altrimenti segue il fenotipo.
  const confidence: RunnerProfileData["meta"]["confidence"] =
    cs == null ? "low" : phenotype.confidence;

  return {
    meta: {
      generated_at: generatedAt,
      window_days: primary.days ?? 42,
      source: "intervals_pace_curves",
      confidence,
    },
    sport: "run",
    weight_kg: weightKg,
    rpp,
    cs_dprime: cs
      ? {
          cs_ms: cs.cs_ms,
          cs_pace_s_per_km: cs.cs_pace_s_per_km,
          d_prime_m: cs.d_prime_m,
          r2: cs.r2,
          source: cs.source,
        }
      : null,
    power_law: { short: plShort, long: plLong },
    phenotype,
    vvo2max_ms: vvo2max,
    utilization_fraction: utilization,
    lt1_pace_s_per_km: lt1Pace,
    race_predictions: racePredictions,
    zones,
    intensity_domains: domains,
  };
}
