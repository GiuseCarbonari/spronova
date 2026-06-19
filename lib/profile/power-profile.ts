/**
 * Power profile — funzioni pure del Modulo Profilo Atleta (PRD §33).
 *
 * Nessuna chiamata API, nessun clock, nessun DB: stessi input → stesso
 * output, testato in tests/power-profile.test.ts con i dati reali
 * dell'ispezione (Milestone 3 passo 1).
 *
 * Regola "No Virtual Math": CP, W′ e pMax si LEGGONO dai powerModels che
 * Intervals calcola (Morton 3P primario, MS 2P fallback) — qui non c'è
 * nessun fit. Le uniche operazioni sono lookup negli array paralleli
 * secs[]/values[]/watts_per_kg[] e i rapporti di forma del fenotipo.
 */

// --- Tipi della risposta power-curves.json (struttura verificata) ----------

export interface PowerModel {
  type: string; // "MS_2P" | "MORTON_3P" | "FFT_CURVES" | "ECP"
  criticalPower?: number | null;
  wPrime?: number | null;
  pMax?: number | null;
  ftp?: number | null;
}

export interface PowerCurve {
  id: string; // "42d" | "90d" | "1y" | "all"
  label?: string;
  days?: number;
  weight?: number | null;
  secs: number[];
  values: number[];
  watts_per_kg: number[];
  powerModels?: PowerModel[];
  vo2max_5m?: number | null;
  // mapPlot esiste nella risposta ma è spesso 0 e NON affidabile (note API):
  // non viene letto. La riserva anaerobica usa CP come denominatore (MPR).
  mapPlot?: { map?: number; mapWatts?: number; mapSecs?: number } | null;
}

export interface PowerCurvesResponse {
  list: PowerCurve[];
}

// --- a) extractMMP ----------------------------------------------------------

/** Durate standard del Record Power Profile (PRD §33 C.1). */
export const DEFAULT_MMP_TARGETS_SECS = [
  1, 5, 15, 30, 60, 300, 600, 1200, 3600,
] as const;

export interface MMPPoint {
  /** Durata richiesta (secondi). */
  duration_s: number;
  /** Durata del punto realmente trovato in secs[] (per audit). */
  actual_secs: number | null;
  watts: number | null;
  wkg: number | null;
  /** false se la durata richiesta non è esattamente presente in secs[]. */
  exact: boolean;
}

/**
 * Estrae la MMP alle durate target dal punto PIÙ VICINO in secs[].
 * Lookup puro negli array paralleli: nessuna interpolazione (sarebbe un
 * numero inventato), il flag exact dichiara l'approssimazione.
 */
export function extractMMP(
  curve: PowerCurve,
  targetSecs: readonly number[] = DEFAULT_MMP_TARGETS_SECS
): MMPPoint[] {
  return targetSecs.map((target) => {
    if (curve.secs.length === 0) {
      return {
        duration_s: target,
        actual_secs: null,
        watts: null,
        wkg: null,
        exact: false,
      };
    }
    // Indice della durata più vicina al target (secs[] è ordinato, ma la
    // scansione lineare è comunque deterministica e a prova di refuso).
    let bestIndex = 0;
    for (let i = 1; i < curve.secs.length; i++) {
      if (
        Math.abs(curve.secs[i] - target) <
        Math.abs(curve.secs[bestIndex] - target)
      ) {
        bestIndex = i;
      }
    }
    return {
      duration_s: target,
      actual_secs: curve.secs[bestIndex],
      watts: curve.values[bestIndex] ?? null,
      wkg: curve.watts_per_kg[bestIndex] ?? null,
      exact: curve.secs[bestIndex] === target,
    };
  });
}

// --- b) extractCPW -----------------------------------------------------------

export interface CPWResult {
  cp: number;
  wPrime: number;
  pMax: number | null;
  ftp: number | null;
  model: "MORTON_3P" | "MS_2P" | "FFT_CURVES" | "ECP";
  source: "intervals_morton3p" | "intervals_ms2p" | "intervals_fft" | "intervals_ecp";
}

/**
 * Legge CP/W′ dai powerModels della curva con ordine di preferenza:
 * MORTON_3P → MS_2P → FFT_CURVES → ECP.
 *
 * Intervals non include sempre tutti i modelli in ogni finestra temporale:
 * la curva 90d spesso ha solo FFT_CURVES/ECP mentre la 42d ha anche
 * MORTON_3P/MS_2P. Il fallback garantisce che la CP venga sempre letta
 * quando Intervals l'ha calcolata con qualsiasi modello.
 */
export function extractCPW(curve: PowerCurve): CPWResult | null {
  const models = curve.powerModels ?? [];

  const morton = models.find((m) => m.type === "MORTON_3P");
  if (morton?.criticalPower != null && morton.wPrime != null) {
    return {
      cp: morton.criticalPower,
      wPrime: morton.wPrime,
      pMax: morton.pMax ?? null,
      ftp: morton.ftp ?? null,
      model: "MORTON_3P",
      source: "intervals_morton3p",
    };
  }

  const ms2p = models.find((m) => m.type === "MS_2P");
  if (ms2p?.criticalPower != null && ms2p.wPrime != null) {
    return {
      cp: ms2p.criticalPower,
      wPrime: ms2p.wPrime,
      pMax: null,
      ftp: ms2p.ftp ?? null,
      model: "MS_2P",
      source: "intervals_ms2p",
    };
  }

  const fft = models.find((m) => m.type === "FFT_CURVES");
  if (fft?.criticalPower != null && fft.wPrime != null) {
    return {
      cp: fft.criticalPower,
      wPrime: fft.wPrime,
      pMax: fft.pMax ?? null,
      ftp: fft.ftp ?? null,
      model: "FFT_CURVES",
      source: "intervals_fft",
    };
  }

  const ecp = models.find((m) => m.type === "ECP");
  if (ecp?.criticalPower != null && ecp.wPrime != null) {
    return {
      cp: ecp.criticalPower,
      wPrime: ecp.wPrime,
      pMax: ecp.pMax ?? null,
      ftp: ecp.ftp ?? null,
      model: "ECP",
      source: "intervals_ecp",
    };
  }

  return null;
}

// --- c) computeAPR (variante MPR, PRD §33 C.3) -------------------------------

export interface APRResult {
  /** Maximal Sprint Power: pMax Morton, fallback MMP a 1s. */
  msp: number;
  /** Denominatore della riserva: CP (MPR), non la MAP (qui inaffidabile). */
  denominator: "cp";
  apr: number;
  apr_ratio: number;
}

/**
 * Riserva anaerobica come MPR = MSP − CP (PRD §33 C.3): la CP è già
 * calcolata da Intervals e separa meglio la componente ossidativa rispetto
 * alla MAP, che in questa risposta (mapPlot) è spesso 0.
 */
export function computeAPR(
  mmp: MMPPoint[],
  cp: number | null,
  pMax: number | null
): APRResult | null {
  const msp = pMax ?? mmp.find((p) => p.duration_s === 1)?.watts ?? null;
  if (msp == null || cp == null || cp <= 0) return null;
  return {
    msp,
    denominator: "cp",
    apr: msp - cp,
    apr_ratio: msp / cp,
  };
}

// --- d) classifyPhenotype ----------------------------------------------------

export type PhenotypePrimary =
  | "diesel"
  | "all_rounder"
  | "puncheur"
  | "sprinter";

export interface PhenotypeResult {
  primary: PhenotypePrimary;
  secondary: PhenotypePrimary | null;
  confidence: "high" | "medium" | "low";
  /** Indicatori usati, con valore, per audit ("apr_ratio=4.05", …). */
  basis: string[];
  /** Le soglie sono euristiche v0 da calibrare (PRD §33 C.5): dichiararlo. */
  thresholds_version: "v0";
}

// Soglie v0 (PRD §33 C.5) — euristiche di ingegneria, NON valori pubblicati;
// da calibrare su database normativi e dati reali della beta.
const V0_APR_RATIO_EXPLOSIVE = 2.6;
const V0_FLATNESS_DIESEL = 1.15;
const V0_PUNCH_PUNCHEUR = 1.6;

/**
 * Classifica il fenotipo dalla FORMA del profilo (rapporti tra durate,
 * comparabili tra livelli diversi — PRD §33 C.5), non dai valori assoluti.
 *
 * Precedenza primario (deterministica, v0): diesel → puncheur → sprinter →
 * all_rounder. Il tratto esplosivo non primario diventa secondario.
 */
export function classifyPhenotype(
  mmp: MMPPoint[],
  aprRatio: number | null,
  cpWkg: number | null
): PhenotypeResult {
  const wkgAt = (secs: number) =>
    mmp.find((p) => p.duration_s === secs)?.wkg ?? null;

  const wkg60 = wkgAt(60);
  const wkg300 = wkgAt(300);
  const wkg1200 = wkgAt(1200);

  // Piattezza del profilo: 5min/20min vicino a 1 = motore aerobico piatto.
  const flatness =
    wkg300 != null && wkg1200 != null && wkg1200 > 0
      ? wkg300 / wkg1200
      : null;
  // Punch: 1min relativo alla CP/kg.
  const punch =
    wkg60 != null && cpWkg != null && cpWkg > 0 ? wkg60 / cpWkg : null;

  const basis: string[] = [];
  if (aprRatio != null) basis.push(`apr_ratio=${aprRatio.toFixed(2)}`);
  if (flatness != null) basis.push(`profile_flatness=${flatness.toFixed(2)}`);
  if (punch != null) basis.push(`punch_ratio=${punch.toFixed(2)}`);

  const isExplosive = aprRatio != null && aprRatio > V0_APR_RATIO_EXPLOSIVE;
  const isDiesel = flatness != null && flatness < V0_FLATNESS_DIESEL;
  const isPuncheur = punch != null && punch > V0_PUNCH_PUNCHEUR;

  let primary: PhenotypePrimary;
  if (isDiesel) primary = "diesel";
  else if (isPuncheur) primary = "puncheur";
  else if (isExplosive) primary = "sprinter";
  else primary = "all_rounder";

  // Secondario: il tratto più "esplosivo" non già primario.
  let secondary: PhenotypePrimary | null = null;
  if (primary !== "sprinter" && isExplosive) secondary = "sprinter";
  else if (primary !== "puncheur" && isPuncheur) secondary = "puncheur";

  // Confidence dalla completezza dei dati (PRD §33 F): tutti gli indicatori
  // presenti e durate esatte → high; la maggior parte → medium; altrimenti low.
  const usedPoints = [60, 300, 1200].map((s) =>
    mmp.find((p) => p.duration_s === s)
  );
  const availableIndicators = [
    wkg60 != null,
    wkg300 != null,
    wkg1200 != null,
    aprRatio != null,
    cpWkg != null,
  ].filter(Boolean).length;
  const allExact = usedPoints.every((p) => p?.exact === true);

  const confidence: PhenotypeResult["confidence"] =
    availableIndicators === 5 && allExact
      ? "high"
      : availableIndicators >= 3
        ? "medium"
        : "low";

  return { primary, secondary, confidence, basis, thresholds_version: "v0" };
}
