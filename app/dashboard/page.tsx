import { redirect } from "next/navigation";

import { ConditionTrendChart } from "@/components/dashboard/condition-trend-chart";
import { MetricsGrid } from "@/components/dashboard/metrics-grid";
import { ReadinessRing } from "@/components/dashboard/readiness-ring";
import { RefreshControl } from "@/components/dashboard/refresh-control";
import { TodaySessionCard } from "@/components/dashboard/today-session-card";
import { CurveLoadShell } from "@/components/layout/curveload-shell";
import { latestHrvMeasurement, normalizeHrvProtocol } from "@/lib/hrv";
import type { BuiltSession } from "@/lib/planner/build-week";
import type { MirrorData } from "@/lib/intervals/sync";
import { createClient } from "@/lib/supabase/server";

const JS_DAY_TO_KEY = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;
const DAY_IT = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];
const MONTH_IT = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

function formatTodayIT(): string {
  const d = new Date();
  return `${DAY_IT[d.getDay()]} ${d.getDate()} ${MONTH_IT[d.getMonth()]}`;
}

function fmt(v: number | null, dec = 0, sign = false): string {
  if (v == null) return "—";
  const s = v.toFixed(dec);
  return sign && v > 0 ? `+${s}` : s;
}

function fmtDelta(v: number | null): string | null {
  if (v == null) return null;
  const r = Math.round(v);
  if (Math.abs(r) < 0.5) return "stabile";
  return r > 0 ? `↑ ${r}` : `↓ ${Math.abs(r)}`;
}

function deltaClass(v: number | null, invert = false): string {
  if (v == null || Math.abs(v) < 0.5) return "text-secondary";
  const pos = invert ? v < 0 : v > 0;
  return pos ? "text-ready-go" : "text-ready-modify";
}

function deltaDirection(v: number | null): "up" | "down" | "flat" {
  if (v == null || Math.abs(v) < 0.5) return "flat";
  return v > 0 ? "up" : "down";
}

function deltaTone(
  v: number | null,
  invert = false
): "positive" | "negative" | "neutral" {
  if (v == null || Math.abs(v) < 0.5) return "neutral";
  const positive = invert ? v < 0 : v > 0;
  return positive ? "positive" : "negative";
}

export default async function DashboardPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [
    { data: userRow },
    { data: preferenceRow },
    { data: snapshot },
    { data: planRow },
  ] = await Promise.all([
    supabase
      .from("users")
      .select("intervals_athlete_name")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("athlete_profiles")
      .select("nome, preferences")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("athlete_metrics_snapshots")
      .select("mirror_data, data_quality_level, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("weekly_plans")
      .select("sessions")
      .eq("user_id", user.id)
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const name =
    (typeof preferenceRow?.nome === "string" && preferenceRow.nome.trim()) ||
    userRow?.intervals_athlete_name ||
    "atleta";

  const mirror = (snapshot?.mirror_data ?? null) as MirrorData | null;
  const readiness = mirror?.readiness_today ?? null;

  const preferences =
    preferenceRow?.preferences != null &&
    typeof preferenceRow.preferences === "object" &&
    !Array.isArray(preferenceRow.preferences)
      ? (preferenceRow.preferences as Record<string, unknown>)
      : {};
  const hrvProtocol = normalizeHrvProtocol(
    preferences.hrv_protocol ?? mirror?.hrv_protocol
  );

  const wellnessToday = mirror?.wellness_30d.at(-1) ?? null;
  const wellnessPrevious = mirror?.wellness_30d.at(-2) ?? null;
  const latestRmssd = mirror
    ? latestHrvMeasurement(mirror.wellness_30d, "rmssd")
    : null;
  const latestSdnn = mirror
    ? latestHrvMeasurement(mirror.wellness_30d, "sdnn")
    : null;

  let latestRhr: { value: number; date: string } | null = null;
  let previousRhr: { value: number; date: string } | null = null;
  if (mirror) {
    for (let i = mirror.wellness_30d.length - 1; i >= 0; i--) {
      const day = mirror.wellness_30d[i];
      if (day.restingHR != null) {
        latestRhr = { value: day.restingHR, date: day.date };
        for (let j = i - 1; j >= 0; j--) {
          const previousDay = mirror.wellness_30d[j];
          if (previousDay.restingHR != null) {
            previousRhr = { value: previousDay.restingHR, date: previousDay.date };
            break;
          }
        }
        break;
      }
    }
  }

  const ctl = wellnessToday?.ctl ?? null;
  const atl = wellnessToday?.atl ?? null;
  const tsb = ctl != null && atl != null ? ctl - atl : null;
  const acwr = ctl != null && atl != null && ctl !== 0 ? atl / ctl : null;
  const ctlDelta = ctl != null && wellnessPrevious?.ctl != null ? ctl - wellnessPrevious.ctl : null;
  const atlDelta = atl != null && wellnessPrevious?.atl != null ? atl - wellnessPrevious.atl : null;
  const previousTsb =
    wellnessPrevious?.ctl != null && wellnessPrevious?.atl != null
      ? wellnessPrevious.ctl - wellnessPrevious.atl
      : null;
  const tsbDelta = tsb != null && previousTsb != null ? tsb - previousTsb : null;
  const rhrDelta =
    latestRhr != null && previousRhr != null
      ? latestRhr.value - previousRhr.value
      : null;

  const lastFetchedAt = mirror?.fetched_at ?? null;
  const initialStatus: "fresh" | "stale" =
    !lastFetchedAt ||
    Date.now() - new Date(lastFetchedAt).getTime() > STALE_THRESHOLD_MS
      ? "stale"
      : "fresh";

  // Today's session from latest plan
  const todayKey = JS_DAY_TO_KEY[new Date().getDay()];
  const sessions = (planRow?.sessions ?? []) as BuiltSession[];
  const todaySession = sessions.find((s) => s.day === todayKey) ?? null;

  const metrics = [
    {
      key: "ctl",
      label: "Forma fisica",
      acronym: "CTL",
      value: fmt(ctl),
      delta: fmtDelta(ctlDelta),
      deltaClassName: deltaClass(ctlDelta),
      deltaDirection: deltaDirection(ctlDelta),
      deltaTone: deltaTone(ctlDelta),
      tooltip:
        "Carico di allenamento a lungo termine: quanto sei allenato. Sale lentamente con la costanza. (Chronic Training Load)",
    },
    {
      key: "atl",
      label: "Fatica recente",
      acronym: "ATL",
      value: fmt(atl),
      delta: fmtDelta(atlDelta),
      deltaClassName: deltaClass(atlDelta, true),
      deltaDirection: deltaDirection(atlDelta),
      deltaTone: deltaTone(atlDelta, true),
      tooltip:
        "Fatica accumulata negli ultimi ~7 giorni. Cresce in fretta dopo i blocchi intensi. (Acute Training Load)",
    },
    {
      key: "tsb",
      label: "Freschezza",
      acronym: "TSB",
      value: fmt(tsb, 0, true),
      delta: fmtDelta(tsbDelta),
      deltaClassName: deltaClass(tsbDelta),
      deltaDirection: deltaDirection(tsbDelta),
      deltaTone: deltaTone(tsbDelta),
      tooltip:
        "Forma meno fatica. Positivo = fresco e pronto. Tra −10 e −30 è normale, non un allarme. (Training Stress Balance)",
    },
    {
      key: "acwr",
      label: "Equilibrio carico",
      acronym: "ACWR",
      value: fmt(acwr, 2),
      delta: acwr != null ? (acwr <= 1.3 ? "ok" : "alto") : null,
      deltaClassName:
        acwr != null && acwr <= 1.3 ? "text-ready-go" : "text-ready-modify",
      deltaDirection: "flat" as const,
      deltaTone: acwr != null && acwr <= 1.3 ? "positive" as const : "negative" as const,
      tooltip:
        "Rapporto carico acuto / cronico. Sotto 1.3 è sostenibile; oltre 1.5 = rischio sovraccarico. (Acute:Chronic Workload Ratio)",
    },
    {
      key: "rhr",
      label: "FC a riposo",
      acronym: "RHR",
      value: latestRhr ? fmt(latestRhr.value, 0) : "—",
      delta: latestRhr ? fmtDelta(rhrDelta) : "collega un sensore",
      deltaClassName: latestRhr ? deltaClass(rhrDelta, true) : "text-muted",
      deltaDirection: latestRhr ? deltaDirection(rhrDelta) : "flat" as const,
      deltaTone: latestRhr ? deltaTone(rhrDelta, true) : "neutral" as const,
      tooltip:
        "Battiti a riposo. In rialzo di ≥5 bpm può segnalare stress o affaticamento. (Resting Heart Rate)",
    },
  ];

  return (
    <CurveLoadShell>
      {/* Header: wordmark + date + name */}
      <div className="flex items-start justify-between pt-2">
        <div>
          <div className="flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 58 58" fill="none" aria-hidden>
              <circle
                cx="29" cy="29" r="22"
                stroke="url(#dashLmk)"
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray="104 34"
                transform="rotate(-90 29 29)"
              />
              <defs>
                <linearGradient id="dashLmk" x1="0" y1="0" x2="58" y2="58">
                  <stop offset="0%" stopColor="#5b8def" />
                  <stop offset="100%" stopColor="#7fc8c0" />
                </linearGradient>
              </defs>
            </svg>
            <span className="font-serif text-[13px] tracking-[0.05em] text-secondary">
              CurveLoad
            </span>
          </div>
          <div className="mt-2 text-[11px] uppercase tracking-[0.16em] text-muted">
            {formatTodayIT()}
          </div>
          <h1 className="mt-1.5 font-serif text-[30px] font-medium leading-none text-foreground">
            Ciao, {name}
          </h1>
        </div>
        {/* Quick profile link */}
        <a
          href="/settings/profile"
          className="mt-1 text-[11px] text-faint hover:text-secondary transition-colors"
        >
          profilo ↗
        </a>
      </div>

      {/* Refresh action — sempre in cima */}
      <RefreshControl
        lastFetchedAt={lastFetchedAt}
        initialStatus={initialStatus}
      />

      {/* No data state */}
      {!mirror && (
        <div className="rounded-[18px] border border-border bg-surface px-6 py-10 text-center">
          <p className="font-serif text-lg text-foreground">
            Nessun dato ancora.
          </p>
          <p className="mt-2 text-sm text-muted">
            Premi «Aggiorna dati» per avviare la prima sincronizzazione.
          </p>
        </div>
      )}

      {/* Strava warning */}
      {mirror?.data_quality_warning === "strava_source_detected" && (
        <div className="rounded-xl border border-l-[3px] border-ready-modify-border border-l-ready-modify bg-surface px-4 py-3 text-sm text-secondary">
          I dati arrivano via Strava: alcuni valori potrebbero essere incompleti.
        </div>
      )}

      {/* Readiness ring */}
      {readiness && <ReadinessRing readiness={readiness} />}

      {/* Seduta di oggi */}
      {todaySession && (
        <TodaySessionCard
          title={todaySession.title}
          isHard={todaySession.is_hard}
          rest={todaySession.rest}
          durationMin={todaySession.estimated_duration_min ?? null}
          zone={todaySession.power_target_zone ?? null}
          structure={todaySession.interval_structure ?? null}
        />
      )}

      {/* Metrics grid */}
      {mirror && (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] uppercase tracking-[0.14em] text-muted">
              Le tue metriche
            </span>
            <span className="text-[11px] text-faint">tocca ⓘ per spiegazione</span>
          </div>
          <MetricsGrid
            metrics={metrics}
            hrv={{
              initialProtocol: hrvProtocol,
              currentDate: wellnessToday?.date ?? null,
              rmssd: latestRmssd,
              sdnn: latestSdnn,
            }}
          />
        </section>
      )}

      {/* Trend chart */}
      {mirror && <ConditionTrendChart days={mirror.wellness_30d} />}

      {/* Footer: disconnect */}
      <div className="border-t border-border pt-4">
        <form action="/api/auth/intervals/disconnect" method="post">
          <button
            type="submit"
            className="text-xs text-faint transition-colors hover:text-ready-skip"
          >
            Scollega Intervals.icu
          </button>
        </form>
      </div>
    </CurveLoadShell>
  );
}
