/**
 * Pace profile — funzioni pure del Modulo Corsa (specchio di power-profile.ts).
 *
 * Nessuna chiamata API, nessun clock, nessun DB: stessi input → stesso output.
 *
 * Differenza strutturale dal modulo bici: l'asse della curva è DISTANZA→TEMPO
 * (distance[] in metri, values[] in secondi), non durata→potenza. Il modello
 * fisiologico è il Critical Speed (CS) / D′, l'analogo running di CP / W′:
 *   d = CS·t + D′      →      t = d / v ,  con asintoto velocità = CS
 * (Burnley & Jones 2018; Poole et al. 2016).
 *
 * Regola "No Virtual Math" per CS/D′: Intervals li calcola (paceModels type
 * "CS") e qui si LEGGONO, mai rifittati. L'UNICO fit nostro è il power-law
 * `v(t) = S·t^(E−1)` per i regimi <3min e >15min, dove il CS iperbolico
 * predice peggio (Walt et al. 2025, IJSPP): quello è dichiarato come fit v0.
 */

// --- Tipi della risposta pace-curves.json (struttura verificata 2026-06-24) -

export interface PaceModel {
  type: string; // "CS"
  criticalSpeed?: number | null; // m/s
  dPrime?: number | null; // metri
  r2?: number | null;
}

export interface PaceCurve {
  id: string; // "42d" | "90d" | "1y" | "all"
  label?: string;
  days?: number;
  weight?: number | null;
  /** Asse X: distanze in metri (array parallelo a values/activity_id). */
  distance: number[];
  /** Asse Y: tempo in secondi impiegato per ogni distanza. */
  values: number[];
  activity_id?: string[];
  type?: string; // "PACE"
  paceModels?: PaceModel[];
}

export interface PaceCurvesResponse {
  list: PaceCurve[];
  /** Mappa id-attività → metadati; non usata dal parser, solo audit. */
  activities?: Record<string, unknown>;
}

// --- a) extractCS — lettura CS/D′ (No Virtual Math) -------------------------

export interface CSResult {
  /** Critical Speed in m/s (asintoto velocità sostenibile). */
  cs_ms: number;
  /** Critical Speed come passo in secondi/km. */
  cs_pace_s_per_km: number;
  /** D′: distanza anaerobica in metri (analogo di W′). */
  d_prime_m: number;
  /** Bontà del fit di Intervals, se presente. */
  r2: number | null;
  source: "intervals_cs";
}

/**
 * Legge CS/D′ dal paceModel "CS" della curva. Nessun ricalcolo: se Intervals
 * non l'ha calcolato (criticalSpeed/dPrime mancanti) ritorna null.
 */
export function extractCS(curve: PaceCurve): CSResult | null {
  const cs = (curve.paceModels ?? []).find((m) => m.type === "CS");
  if (cs?.criticalSpeed == null || cs.dPrime == null || cs.criticalSpeed <= 0) {
    return null;
  }
  return {
    cs_ms: cs.criticalSpeed,
    cs_pace_s_per_km: 1000 / cs.criticalSpeed,
    d_prime_m: cs.dPrime,
    r2: cs.r2 ?? null,
    source: "intervals_cs",
  };
}

// --- b) Record Pace Profile (MMP analogo: miglior tempo a distanze chiave) ---

/** Distanze standard del Record Pace Profile (metri). */
export const DEFAULT_RPP_DISTANCES_M = [
  400, 800, 1000, 1500, 5000, 10000, 21097, 42195,
] as const;

export interface PacePoint {
  /** Distanza richiesta (metri). */
  distance_m: number;
  /** Distanza del punto realmente trovato in distance[] (per audit). */
  actual_m: number | null;
  /** Tempo in secondi per quella distanza. */
  time_s: number | null;
  /** Passo in secondi/km. */
  pace_s_per_km: number | null;
  /** Velocità in m/s. */
  speed_ms: number | null;
  /** false se la distanza richiesta non è esattamente presente. */
  exact: boolean;
}

/**
 * Estrae il miglior tempo alle distanze target dal punto PIÙ VICINO in
 * distance[]. Lookup puro negli array paralleli: nessuna interpolazione.
 */
export function extractRPP(
  curve: PaceCurve,
  targets: readonly number[] = DEFAULT_RPP_DISTANCES_M
): PacePoint[] {
  return targets.map((target) => {
    if (curve.distance.length === 0) {
      return {
        distance_m: target,
        actual_m: null,
        time_s: null,
        pace_s_per_km: null,
        speed_ms: null,
        exact: false,
      };
    }
    let best = 0;
    for (let i = 1; i < curve.distance.length; i++) {
      if (
        Math.abs(curve.distance[i] - target) <
        Math.abs(curve.distance[best] - target)
      ) {
        best = i;
      }
    }
    const actual = curve.distance[best];
    const time = curve.values[best] ?? null;
    return {
      distance_m: target,
      actual_m: actual,
      time_s: time,
      pace_s_per_km: time != null && actual > 0 ? (time / actual) * 1000 : null,
      speed_ms: time != null && time > 0 ? actual / time : null,
      exact: actual === target,
    };
  });
}

// --- c) fitPowerLaw — fit v(t) = S·t^(E−1) (NOSTRO fit, dichiarato v0) -------

export interface PowerLawFit {
  /** Scale: velocità teorica a t=1s (m/s). */
  s_ms: number;
  /** Endurance exponent: ~1 piatto (diesel), <1 più ripido (veloce). */
  e: number;
  /** R² del fit nel range usato. */
  r2: number;
  /** Numero di punti usati nel fit. */
  n: number;
}

/**
 * Fit log-lineare di v(t) = S·t^(E−1) sui punti (durata, velocità) della curva
 * la cui DURATA cade in [minSecs, maxSecs]. La durata di un punto è values[i]
 * (è già il tempo), la velocità è distance[i]/values[i].
 *
 * Linearizzazione: ln(v) = ln(S) + (E−1)·ln(t). Regressione ai minimi quadrati
 * → slope = E−1, intercept = ln(S). Ritorna null con <3 punti (fit non
 * significativo): coerente con la dichiarazione di confidence bassa a valle.
 */
export function fitPowerLaw(
  curve: PaceCurve,
  minSecs: number,
  maxSecs: number
): PowerLawFit | null {
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < curve.distance.length; i++) {
    const t = curve.values[i];
    const d = curve.distance[i];
    if (t == null || d == null || t < minSecs || t > maxSecs || t <= 0 || d <= 0) {
      continue;
    }
    xs.push(Math.log(t));
    ys.push(Math.log(d / t)); // ln(velocità)
  }
  const n = xs.length;
  if (n < 3) return null;

  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - meanX) ** 2;
    sxy += (xs[i] - meanX) * (ys[i] - meanY);
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx; // E − 1
  const intercept = meanY - slope * meanX; // ln(S)

  // R²
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const pred = intercept + slope * xs[i];
    ssRes += (ys[i] - pred) ** 2;
    ssTot += (ys[i] - meanY) ** 2;
  }
  const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot;

  return { s_ms: Math.exp(intercept), e: slope + 1, r2, n };
}

// --- d) predictRace — predizione tempo per distanza, modello per regime ------

export type PaceModelUsed = "pl_short" | "cs_dprime" | "pl_long";

export interface RacePrediction {
  distance_m: number;
  /** Tempo previsto in secondi. */
  time_s: number;
  /** Passo medio in secondi/km. */
  pace_s_per_km: number;
  model: PaceModelUsed;
  /** true se il tempo è stato corretto per imporre la monotonicità (vedi sotto). */
  adjusted?: boolean;
}

/** Soglie temporali dei regimi (secondi), come AnalyzeMe/Walt 2025. */
export const REGIME_SHORT_MAX_S = 180; // <3 min → power-law veloce
export const REGIME_LONG_MIN_S = 900; // >15 min → power-law fondo

/**
 * Predice il tempo per una distanza scegliendo il modello in base al regime
 * di durata STIMATA, risolto per iterazione (il regime dipende dal tempo, che
 * dipende dal modello). Tre modelli:
 *  - <3 min:  power-law sprint   t = (d / S)^(1/E)
 *  - 3–15 min: CS-D′ iperbolico  t = (d − D′) / CS
 *  - >15 min: power-law fondo    t = (d / S)^(1/E)
 *
 * Ritorna null se il modello richiesto per quel regime non è disponibile.
 */
export function predictRace(
  distance_m: number,
  cs: CSResult | null,
  plShort: PowerLawFit | null,
  plLong: PowerLawFit | null
): RacePrediction | null {
  const tFromCS = (d: number) =>
    cs ? (d - cs.d_prime_m) / cs.cs_ms : null;
  const tFromPL = (d: number, pl: PowerLawFit) =>
    // d = S·t^E  →  t = (d / S)^(1/E)
    Math.pow(d / pl.s_ms, 1 / pl.e);

  const tCS = tFromCS(distance_m);

  // Stima del regime dalla durata CS (o dal power-law se manca la CS).
  const tRef = tCS ?? (plLong ?? plShort ? tFromPL(distance_m, (plLong ?? plShort)!) : null);
  if (tRef == null || tRef <= 0) return null;

  let t: number;
  let model: PaceModelUsed;

  if (tRef < REGIME_SHORT_MAX_S && plShort) {
    // Sprint: la CS sovrastima (non modella la riserva neuromuscolare). Il
    // power-law corto si usa solo se ABBASSA il tempo — mai per peggiorarlo.
    const tPL = tFromPL(distance_m, plShort);
    if (tCS == null || tPL < tCS) {
      t = tPL;
      model = "pl_short";
    } else {
      t = tCS;
      model = "cs_dprime";
    }
  } else if (tRef > REGIME_LONG_MIN_S && plLong) {
    // Endurance: la CS sovrastima la tenuta (Walt 2025). Il power-law lungo si
    // usa solo se ALZA il tempo (rende più lento) — coerente con la fatica.
    const tPL = tFromPL(distance_m, plLong);
    if (tCS == null || tPL > tCS) {
      t = tPL;
      model = "pl_long";
    } else {
      t = tCS;
      model = "cs_dprime";
    }
  } else if (tCS != null) {
    t = tCS;
    model = "cs_dprime";
  } else {
    // Senza CS: usa il power-law del regime più vicino.
    const pl = tRef > REGIME_LONG_MIN_S ? plLong : plShort;
    if (!pl) return null;
    t = tFromPL(distance_m, pl);
    model = tRef > REGIME_LONG_MIN_S ? "pl_long" : "pl_short";
  }

  return {
    distance_m,
    time_s: t,
    pace_s_per_km: (t / distance_m) * 1000,
    model,
  };
}

/**
 * Impone la monotonicità del PASSO su una serie di predizioni ORDINATE per
 * distanza crescente: una distanza più lunga non può avere un passo più veloce
 * di una più corta (il passo deve essere non-decrescente con la distanza). I
 * tre modelli sono fittati in modo indipendente e ai confini dei regimi possono
 * scavalcarsi — tipicamente il power-law corto, tarato sugli sprint brevissimi,
 * dà sui 400 m un passo più lento del CS-D′ sugli 800 m, che è impossibile.
 * Qui si alza il passo del punto incoerente almeno a quello del precedente,
 * marcando `adjusted`. È una pezza onesta sulla discontinuità tra modelli, non
 * un nuovo fit.
 */
export function enforceMonotonicPredictions(
  predictions: RacePrediction[]
): RacePrediction[] {
  const sorted = [...predictions].sort((a, b) => a.distance_m - b.distance_m);
  const out: RacePrediction[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i];
    const prev = out[i - 1];
    if (prev && p.pace_s_per_km < prev.pace_s_per_km) {
      // Inversione: il punto più lungo non può essere più veloce del precedente.
      // Alza il suo passo a quello del precedente e ricalcola il tempo.
      const pace = prev.pace_s_per_km;
      out.push({
        ...p,
        pace_s_per_km: pace,
        time_s: (pace * p.distance_m) / 1000,
        adjusted: true,
      });
    } else {
      out.push(p);
    }
  }
  return out;
}

// --- e) classifyRunnerPhenotype ---------------------------------------------

export type RunnerPhenotype = "diesel" | "mixed" | "speed";

export interface RunnerPhenotypeResult {
  primary: RunnerPhenotype;
  confidence: "high" | "medium" | "low";
  /** Calo % di velocità al raddoppio della durata (indice resistenza fatica). */
  decay_per_doubling_pct: number | null;
  basis: string[];
  thresholds_version: "v0";
}

// Soglie v0 (euristiche, da calibrare): calo % al raddoppio durata.
// Power-law: v ∝ t^(E−1) → al raddoppio v cambia di 2^(E−1). Un E vicino a 1
// = poco calo = diesel; E più basso = calo marcato = velocista.
const V0_DECAY_DIESEL_PCT = 6; // <6% per raddoppio → diesel
const V0_DECAY_SPEED_PCT = 9; // >9% per raddoppio → velocista

/**
 * Classifica il fenotipo del runner dal decadimento di velocità (forma del
 * profilo, comparabile tra livelli). Usa l'esponente E del power-law lungo se
 * disponibile, altrimenti quello corto. Senza fit → confidence low, mixed.
 */
export function classifyRunnerPhenotype(
  plLong: PowerLawFit | null,
  plShort: PowerLawFit | null
): RunnerPhenotypeResult {
  const pl = plLong ?? plShort;
  const basis: string[] = [];

  if (!pl) {
    return {
      primary: "mixed",
      confidence: "low",
      decay_per_doubling_pct: null,
      basis: ["nessun fit power-law disponibile"],
      thresholds_version: "v0",
    };
  }

  // Calo di velocità al raddoppio della durata: 1 − 2^(E−1), in percentuale.
  const decayPct = (1 - Math.pow(2, pl.e - 1)) * 100;
  basis.push(`E=${pl.e.toFixed(3)}`);
  basis.push(`decay_per_doubling=${decayPct.toFixed(1)}%`);
  basis.push(`fit_r2=${pl.r2.toFixed(3)}`);

  let primary: RunnerPhenotype;
  if (decayPct < V0_DECAY_DIESEL_PCT) primary = "diesel";
  else if (decayPct > V0_DECAY_SPEED_PCT) primary = "speed";
  else primary = "mixed";

  // Confidence dalla bontà e numerosità del fit.
  const confidence: RunnerPhenotypeResult["confidence"] =
    pl.r2 >= 0.97 && pl.n >= 5
      ? "high"
      : pl.r2 >= 0.9 && pl.n >= 3
        ? "medium"
        : "low";

  return {
    primary,
    confidence,
    decay_per_doubling_pct: decayPct,
    basis,
    thresholds_version: "v0",
  };
}

// --- f) trainingZones — zone basate su % CS (come AnalyzeMe) -----------------

export interface PaceZone {
  zone: string; // "Z1".."Z6"
  name: string;
  /** Limiti come passo s/km: from = più lento (numero più alto), to = più veloce. */
  pace_from_s_per_km: number | null;
  pace_to_s_per_km: number | null;
}

// Limiti come % della CS in VELOCITÀ (frazioni). AnalyzeMe-style.
const ZONE_BANDS: Array<{ zone: string; name: string; lo: number; hi: number }> = [
  { zone: "Z1", name: "Recupero", lo: 0, hi: 0.78 },
  { zone: "Z2", name: "Endurance", lo: 0.78, hi: 0.88 },
  { zone: "Z3", name: "Tempo", lo: 0.88, hi: 0.94 },
  { zone: "Z4", name: "Soglia", lo: 0.94, hi: 1.03 },
  { zone: "Z5", name: "VO2max", lo: 1.03, hi: 1.1 },
  { zone: "Z6", name: "Anaerobico", lo: 1.1, hi: Infinity },
];

// --- g) intensityDomains — 4 domini fisiologici (Moderate/Heavy/Severe/Extreme)

export interface IntensityDomain {
  name: "Moderate" | "Heavy" | "Severe" | "Extreme";
  /** Limite più lento del dominio (s/km), null = illimitato verso il lento. */
  pace_slow_s_per_km: number | null;
  /** Limite più veloce del dominio (s/km), null = illimitato verso il veloce. */
  pace_fast_s_per_km: number | null;
}

/**
 * I 4 domini d'intensità (Burnley & Jones): confini a LT1, CS e vVO2max.
 *  - Moderate: < LT1 (lattato basale stabile)
 *  - Heavy:    LT1 – CS (lattato elevato ma in equilibrio)
 *  - Severe:   CS – vVO2max (VO2 sale al 100%, no steady state)
 *  - Extreme:  > vVO2max (esaurimento prima del 100% VO2)
 */
export function intensityDomains(
  cs: CSResult | null,
  lt1PaceSPerKm: number | null,
  vvo2maxMs: number | null
): IntensityDomain[] {
  const csPace = cs?.cs_pace_s_per_km ?? null;
  const vvo2Pace = vvo2maxMs != null && vvo2maxMs > 0 ? 1000 / vvo2maxMs : null;
  return [
    { name: "Moderate", pace_slow_s_per_km: null, pace_fast_s_per_km: lt1PaceSPerKm },
    { name: "Heavy", pace_slow_s_per_km: lt1PaceSPerKm, pace_fast_s_per_km: csPace },
    { name: "Severe", pace_slow_s_per_km: csPace, pace_fast_s_per_km: vvo2Pace },
    { name: "Extreme", pace_slow_s_per_km: vvo2Pace, pace_fast_s_per_km: null },
  ];
}

/**
 * LT1 stimato dalla CS via formula empirica (~78% della velocità CS, come
 * AnalyzeMe). Dichiarato come stima: è una relazione media, non una misura.
 */
export const LT1_FROM_CS_FRACTION = 0.78;

export function estimateLT1Pace(cs: CSResult | null): number | null {
  if (!cs) return null;
  // velocità LT1 = 78% CS → passo = 1000 / (0.78·CS)
  return 1000 / (cs.cs_ms * LT1_FROM_CS_FRACTION);
}

/** Calcola le 6 zone di passo dai limiti in % CS. CS è il riferimento (m/s). */
export function trainingZones(cs: CSResult | null): PaceZone[] {
  return ZONE_BANDS.map((band) => {
    if (!cs) {
      return {
        zone: band.zone,
        name: band.name,
        pace_from_s_per_km: null,
        pace_to_s_per_km: null,
      };
    }
    const vLo = cs.cs_ms * band.lo; // velocità minima della banda
    const vHi = cs.cs_ms * band.hi; // velocità massima della banda
    return {
      zone: band.zone,
      name: band.name,
      // passo più lento = velocità minore → limite "from"
      pace_from_s_per_km: vLo > 0 ? 1000 / vLo : null,
      pace_to_s_per_km: Number.isFinite(vHi) && vHi > 0 ? 1000 / vHi : null,
    };
  });
}
