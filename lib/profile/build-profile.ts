import {
  classifyPhenotype,
  computeAPR,
  extractCPW,
  extractMMP,
  type APRResult,
  type MMPPoint,
  type PhenotypeResult,
  type PowerCurve,
  type PowerCurvesResponse,
} from "@/lib/profile/power-profile";

/**
 * Orchestratore del profilo atleta (PRD §33 schema D) — puro.
 *
 * Compone le funzioni di power-profile.ts in un unico oggetto profile_data:
 * curva 90 giorni come stato di forma corrente (finestra primaria),
 * curva 1 anno come riferimento/potenziale (§33 C.1). L'impurità del clock
 * è iniettabile (generatedAt) per i test.
 *
 * La gap analysis vs evento target NON è qui: arriverà col passo successivo
 * (richiede routes.json).
 */

export interface RPPEntry {
  duration_s: number;
  /** Durata reale del punto letto in secs[] (audit per i punti non esatti). */
  actual_secs: number | null;
  watts: number | null;
  wkg: number | null;
  exact: boolean;
  /** Riferimento all-time/potenziale dalla curva 1y (PRD §33 C.1). */
  watts_1y: number | null;
  wkg_1y: number | null;
}

export interface AthleteProfileData {
  meta: {
    generated_at: string;
    window_days: 42 | 90;
    source: "intervals_power_curves";
    confidence: "high" | "medium" | "low";
  };
  weight_kg: number | null;
  weight_source: "power_curve" | "icu_weight" | null;
  rpp: RPPEntry[];
  cp_wprime: {
    cp_w: number;
    cp_wkg: number | null;
    w_prime_j: number;
    w_prime_kj: number;
    p_max_w: number | null;
    ftp_model_w: number | null;
    model: "MORTON_3P" | "MS_2P" | "FFT_CURVES" | "ECP";
    source: string;
  } | null;
  apr: APRResult | null;
  phenotype: PhenotypeResult;
  vo2max_5m: number | null;
}

/** Trova la curva per id, con messaggio chiaro se la finestra manca. */
function findCurve(
  curves: PowerCurvesResponse,
  id: string
): PowerCurve | null {
  return curves.list.find((c) => c.id === id) ?? null;
}

export function buildAthleteProfile(
  powerCurves: PowerCurvesResponse,
  athleteRaw: Record<string, unknown>,
  generatedAt: string = new Date().toISOString()
): AthleteProfileData {
  // Curva primaria 42d: stima più recente dello stato di forma.
  // Fallback 90d se la 42d non è disponibile (dati insufficienti).
  const primary =
    findCurve(powerCurves, "42d") ??
    findCurve(powerCurves, "90d") ??
    powerCurves.list[0];
  if (!primary) {
    throw new Error("Risposta power-curves senza curve disponibili");
  }
  const reference1y = findCurve(powerCurves, "1y");

  // --- Peso: icu_weight dal profilo atleta (fonte authoritative), poi
  // curve.weight come fallback. Strava non è una fonte accettabile: se
  // icu_weight_sync punta a Strava usiamo comunque il valore numerico senza
  // mostrare il warning — il dato numerico è lo stesso, la fonte è Intervals.
  const icuWeight =
    typeof athleteRaw.icu_weight === "number" ? athleteRaw.icu_weight : null;
  const weightKg = icuWeight ?? primary.weight ?? null;
  const weightSource: AthleteProfileData["weight_source"] =
    icuWeight != null ? "icu_weight" : primary.weight != null ? "power_curve" : null;

  // --- Estrazioni pure (tutte lette, mai ricalcolate) ----------------------
  const mmp90: MMPPoint[] = extractMMP(primary);
  const mmp1y: MMPPoint[] = reference1y ? extractMMP(reference1y) : [];
  const cpw = extractCPW(primary);

  const cpWkg =
    cpw != null && weightKg != null && weightKg > 0
      ? cpw.cp / weightKg
      : null;
  const apr = computeAPR(mmp90, cpw?.cp ?? null, cpw?.pMax ?? null);
  const phenotype = classifyPhenotype(mmp90, apr?.apr_ratio ?? null, cpWkg);

  const rpp: RPPEntry[] = mmp90.map((point) => {
    const ref = mmp1y.find((p) => p.duration_s === point.duration_s);
    return {
      duration_s: point.duration_s,
      actual_secs: point.actual_secs,
      watts: point.watts,
      wkg: point.wkg,
      exact: point.exact,
      watts_1y: ref?.watts ?? null,
      wkg_1y: ref?.wkg ?? null,
    };
  });

  // La confidence complessiva del profilo segue quella del fenotipo ma non
  // può essere alta senza CP (PRD §33 F: completezza dati).
  const confidence: AthleteProfileData["meta"]["confidence"] =
    cpw == null ? "low" : phenotype.confidence;

  return {
    meta: {
      generated_at: generatedAt,
      window_days: (primary.days ?? 42) <= 42 ? 42 : 90,
      source: "intervals_power_curves",
      confidence,
    },
    weight_kg: weightKg,
    weight_source: weightSource,
    rpp,
    cp_wprime: cpw
      ? {
          cp_w: cpw.cp,
          cp_wkg: cpWkg,
          w_prime_j: cpw.wPrime,
          w_prime_kj: cpw.wPrime / 1000,
          p_max_w: cpw.pMax,
          ftp_model_w: cpw.ftp,
          model: cpw.model,
          source: cpw.source,
        }
      : null,
    apr,
    phenotype,
    vo2max_5m: primary.vo2max_5m ?? null,
  };
}
