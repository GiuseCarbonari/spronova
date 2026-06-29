/**
 * Coach context — modulo PURO (no React, no I/O, no clock).
 *
 * Assembla un bundle deterministico di SOLI valori GIÀ calcolati (readiness,
 * stato dal mirror, fase via detectPhase, profilo CP/W′, dossier) da passare
 * all'AcoachQA / al report pre-allenamento. Stessi input → stesso output: la
 * variabilità resta solo nel modello LLM, non in questo layer.
 *
 * Non fa query: riceve la riga athlete_profiles e il mirror già letti dal route
 * e `today` iniettato (mai letto da clock dentro la funzione).
 */

import type { MirrorData } from "@/lib/intervals/sync";
import type { GaraTarget, InjuryPeriod } from "@/lib/onboarding/dossier";
import type { BuiltSession } from "@/lib/planner/build-week";
import { detectPhase } from "@/lib/planner/phase-detector";
import { isInjured } from "@/lib/planner/injury";
import type { AthleteProfileData } from "@/lib/profile/build-profile";
import type { Limiter } from "@/lib/terrain/gap-analysis";

const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // identico a app/dashboard/page.tsx

/** Sottoinsieme dossier rilevante per il coach (letto da athlete_profiles). */
export interface CoachDossier {
  nome: string | null;
  livello_esperienza: string | null;
  obiettivi: string | null;
  fase_corrente: string | null; // fase DICHIARATA dall'atleta (dossier)
  stile_allenamento: string | null;
  gara_target: GaraTarget | null; // da colonna gare_target (JSONB)
  data_obiettivo: string | null;
  // soglie dichiarate dall'atleta
  ftp_outdoor_w: number | null;
  ftp_indoor_w: number | null;
  max_hr: number | null;
  threshold_hr: number | null;
  lt2_w: number | null;
  lt2_hr: number | null;
  limiti_principali: string | null;
  preferenze_allenamento: string | null;
  injury_periods: InjuryPeriod[] | null;
}

/** Una durata della curva di potenza, come passata al coach (valori già calcolati). */
export interface RppPoint {
  label: string; // es. "5s", "1min", "20min" (come comments/profilo)
  watts: number | null;
  wkg: number | null;
}

/** Limitatore salvato da un'analisi gara (gap_analysis), ridotto ai campi utili al coach. */
export interface GapLimiter {
  name: string;
  severity: "high" | "medium" | "low";
  gap_wkg: number | null;
  training_lever: string;
  evidence: string;
}

/** Bundle deterministico passato all'AI. Solo valori GIÀ calcolati. */
export interface CoachContext {
  date: string; // YYYY-MM-DD locale
  data_freshness: {
    fetched_at: string | null; // mirror.fetched_at
    stale: boolean; // > 24h fa
    data_quality_warning: string | null;
  };
  readiness: MirrorData["readiness_today"] | null;
  state: {
    // letti dal mirror, mai ricalcolati
    ctl: number | null;
    atl: number | null;
    tsb: number | null;
    acwr: number | null;
    hrv: number | null;
    rhr: number | null;
    trend_ctl_14d: string;
    trend_atl_14d: string;
    trend_hrv_14d: string;
  };
  phase: { phase: string; reason: string; days_to_event: number | null } | null;
  profile: {
    // da profile_data (può essere null)
    phenotype_primary: string | null;
    cp_w: number | null;
    w_prime_kj: number | null;
    weight_kg: number | null;
    power_curve_current: RppPoint[]; // RPP corrente (finestra 42d/90d)
    power_curve_best_1y: RppPoint[]; // miglior anno = riferimento/potenziale
  } | null;
  gap_limiters: GapLimiter[] | null; // limitatori dell'ultima analisi gara, se presente
  dossier: CoachDossier;
  injured_today: boolean;
}

/** Colonne athlete_profiles necessarie (per la SELECT del route). */
export const COACH_PROFILE_COLUMNS =
  "nome, livello_esperienza, obiettivi, fase_corrente, stile_allenamento, " +
  "gare_target, data_obiettivo, ftp_outdoor_w, ftp_indoor_w, max_hr, " +
  "threshold_hr, lt2_w, lt2_hr, limiti_principali, preferenze_allenamento, " +
  "injury_periods, profile_data, gap_analysis";

/** Delta trend 14gg: (newest - oldest) / oldest * 100. Copia da comments/oggi. */
function computeTrend(values: (number | null)[]): string {
  const filtered = values.filter((v) => v != null && Number.isFinite(v)) as number[];
  if (filtered.length < 2) return "−";
  const oldest = filtered[0];
  const newest = filtered[filtered.length - 1];
  if (oldest === 0) return "−";
  const pct = ((newest - oldest) / oldest) * 100;
  return pct > 0 ? `+${pct.toFixed(0)}%` : `${pct.toFixed(0)}%`;
}

/** Giorni interi da `today` (iniettato) alla data evento. null se assente/passato. */
function daysUntil(today: string, dateStr: string | null): number | null {
  if (!dateStr) return null;
  const target = Date.parse(dateStr);
  const base = Date.parse(today);
  if (Number.isNaN(target) || Number.isNaN(base)) return null;
  const diff = Math.floor((target - base) / (1000 * 60 * 60 * 24));
  return diff >= 0 ? diff : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Assembla il bundle. PURA: stessi input → stesso output (determinismo).
 * @param profileRow riga athlete_profiles (colonne COACH_PROFILE_COLUMNS)
 * @param mirror     mirror_data più recente (null se mai sincronizzato)
 * @param today      data locale YYYY-MM-DD (iniettata dal route)
 */
export function buildCoachContext(
  profileRow: Record<string, unknown> | null,
  mirror: MirrorData | null,
  today: string
): CoachContext {
  const row = profileRow ?? {};

  // --- Dossier (autoritativo su obiettivi/soglie) ---------------------------
  const dossier: CoachDossier = {
    nome: (row.nome as string | null) ?? null,
    livello_esperienza: (row.livello_esperienza as string | null) ?? null,
    obiettivi: (row.obiettivi as string | null) ?? null,
    fase_corrente: (row.fase_corrente as string | null) ?? null,
    stile_allenamento: (row.stile_allenamento as string | null) ?? null,
    gara_target: (row.gare_target as GaraTarget | null) ?? null,
    data_obiettivo: (row.data_obiettivo as string | null) ?? null,
    ftp_outdoor_w: num(row.ftp_outdoor_w),
    ftp_indoor_w: num(row.ftp_indoor_w),
    max_hr: num(row.max_hr),
    threshold_hr: num(row.threshold_hr),
    lt2_w: num(row.lt2_w),
    lt2_hr: num(row.lt2_hr),
    limiti_principali: (row.limiti_principali as string | null) ?? null,
    preferenze_allenamento: (row.preferenze_allenamento as string | null) ?? null,
    injury_periods: (row.injury_periods as InjuryPeriod[] | null) ?? null,
  };

  const injuredToday = isInjured(today, dossier.injury_periods ?? []);

  // --- Profilo CP/W′ + curva di potenza (da profile_data) -------------------
  const rppLabel = (s: number) => (s < 60 ? `${s}s` : `${Math.round(s / 60)}min`);
  const profileData = (row.profile_data as AthleteProfileData | null) ?? null;
  const rpp = Array.isArray(profileData?.rpp) ? profileData.rpp : [];
  const power_curve_current: RppPoint[] = rpp
    .filter((p) => p.watts != null || p.wkg != null)
    .map((p) => ({
      label: rppLabel(p.duration_s),
      watts: p.watts != null ? Math.round(p.watts) : null,
      wkg: p.wkg != null ? Number(p.wkg.toFixed(2)) : null,
    }));
  const power_curve_best_1y: RppPoint[] = rpp
    .filter((p) => p.watts_1y != null || p.wkg_1y != null)
    .map((p) => ({
      label: rppLabel(p.duration_s),
      watts: p.watts_1y != null ? Math.round(p.watts_1y) : null,
      wkg: p.wkg_1y != null ? Number(p.wkg_1y.toFixed(2)) : null,
    }));
  const profile = profileData
    ? {
        phenotype_primary: profileData.phenotype?.primary ?? null,
        cp_w: profileData.cp_wprime ? Math.round(profileData.cp_wprime.cp_w) : null,
        w_prime_kj: profileData.cp_wprime
          ? Number(profileData.cp_wprime.w_prime_kj.toFixed(1))
          : null,
        weight_kg: profileData.weight_kg,
        power_curve_current,
        power_curve_best_1y,
      }
    : null;

  // --- gap_limiters (dalla colonna separata gap_analysis, NON profile_data) -
  const gapRaw = (row.gap_analysis as { limiters?: unknown[] } | null) ?? null;
  const gap_limiters: GapLimiter[] | null =
    Array.isArray(gapRaw?.limiters) && gapRaw.limiters.length > 0
      ? (gapRaw.limiters as Limiter[]).map((l) => ({
          name: l.name,
          severity: l.severity,
          gap_wkg: l.gap_wkg,
          training_lever: l.training_lever,
          evidence: l.evidence,
        }))
      : null;

  // --- Nessun mirror: degrada (readiness/phase null, stale true) -------------
  if (!mirror) {
    return {
      date: today,
      data_freshness: { fetched_at: null, stale: true, data_quality_warning: null },
      readiness: null,
      state: {
        ctl: null,
        atl: null,
        tsb: null,
        acwr: null,
        hrv: null,
        rhr: null,
        trend_ctl_14d: "−",
        trend_atl_14d: "−",
        trend_hrv_14d: "−",
      },
      phase: null,
      profile,
      gap_limiters,
      dossier,
      injured_today: injuredToday,
    };
  }

  // --- Stato dal mirror (letto, mai ricalcolato) ----------------------------
  const wellness30d = mirror.wellness_30d ?? [];
  const wellness14d = wellness30d.slice(-14);
  const latest = wellness30d[wellness30d.length - 1];
  const ctl = latest?.ctl ?? null;
  const atl = latest?.atl ?? null;
  const tsb = ctl != null && atl != null ? Number((ctl - atl).toFixed(1)) : null;
  const acwr = ctl != null && atl != null && ctl > 0 ? Number((atl / ctl).toFixed(2)) : null;
  const hrv = latest?.hrv ?? null;
  const rhr = latest?.restingHR ?? null;

  // --- Fase via detectPhase (come app/api/planner/generate/route.ts) --------
  const ctlHistory = wellness30d.map((w) => w.ctl);
  const ri = mirror.readiness_today?.signals.find((s) => s.name === "ri")?.value ?? null;
  const daysToEvent = daysUntil(
    today,
    dossier.data_obiettivo ?? dossier.gara_target?.data ?? null
  );
  const phaseResult = detectPhase(ctl, ctlHistory, daysToEvent, acwr, ri);

  const fetchedAt = mirror.fetched_at ?? null;
  const stale =
    !fetchedAt || Date.now() - Date.parse(fetchedAt) > STALE_THRESHOLD_MS;

  return {
    date: today,
    data_freshness: {
      fetched_at: fetchedAt,
      stale,
      data_quality_warning: mirror.data_quality_warning,
    },
    readiness: mirror.readiness_today ?? null,
    state: {
      ctl,
      atl,
      tsb,
      acwr,
      hrv,
      rhr,
      trend_ctl_14d: computeTrend(wellness14d.map((w) => w.ctl)),
      trend_atl_14d: computeTrend(wellness14d.map((w) => w.atl)),
      trend_hrv_14d: computeTrend(wellness14d.map((w) => w.hrv)),
    },
    phase: {
      phase: phaseResult.phase,
      reason: phaseResult.reason,
      days_to_event: daysToEvent,
    },
    profile,
    gap_limiters,
    dossier,
    injured_today: injuredToday,
  };
}

// --- Seduta odierna per il report pre-allenamento -----------------------------

/** Seduta odierna come passata al report (solo etichette già calcolate). */
export interface PlannedSession {
  rest: boolean;
  title: string;
  sport: string;
  is_hard: boolean;
  duration_min: number | null; // estimated_duration_min
  objective: string; // session_objective
  interval_structure: string;
  power_target_zone: string | null;
  hr_target_zone: string | null;
  rpe_target: string | null;
  rationale: string; // session_rationale
}

/** null se nessuna seduta oggi (giorno non nel piano). Mapper puro. */
export function toPlannedSession(s: BuiltSession | null): PlannedSession | null {
  if (!s) return null;
  return {
    rest: s.rest,
    title: s.title,
    sport: s.sport,
    is_hard: s.is_hard,
    duration_min: s.estimated_duration_min,
    objective: s.session_objective,
    interval_structure: s.interval_structure,
    power_target_zone: s.power_target_zone,
    hr_target_zone: s.hr_target_zone,
    rpe_target: s.rpe_target,
    rationale: s.session_rationale,
  };
}
