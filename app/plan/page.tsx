import { redirect } from "next/navigation";

import { GenerateWeekButton } from "@/components/plan/generate-week-button";
import { PushButton } from "@/components/plan/push-button";
import { RedistributeSection } from "@/components/plan/redistribute-section";
import { CurveLoadShell } from "@/components/layout/curveload-shell";
import type { BuiltSession } from "@/lib/planner/build-week";
import type { Phase } from "@/lib/planner/phase-detector";
import type { DayKey } from "@/lib/planner/session-selector";
import type { MirrorData } from "@/lib/intervals/sync";
import { createClient } from "@/lib/supabase/server";

/**
 * /plan — settimana di allenamento (design CurveLoad).
 * Server Component: legge l'ultimo piano + readiness di oggi.
 * La generazione avviene via POST /api/planner/generate.
 */

export const dynamic = "force-dynamic";

const JS_DAY_TO_KEY: DayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

interface PlanRow {
  week_start: string;
  phase: Phase;
  sessions: BuiltSession[];
  narrative: string | null;
  validation_metadata: {
    days_to_event?: number | null;
    hard_sessions?: number;
    hard_spacing_ok?: boolean;
    volume_hours_estimate?: number;
    phase_reason?: string;
  } | null;
  generated_at: string;
  pushed_at: string | null;
}

function formatWeekRange(weekStart: string): string {
  const d = new Date(`${weekStart}T00:00:00`);
  const end = new Date(d);
  end.setDate(d.getDate() + 6);
  const monthNames = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
  const startLabel = `${d.getDate()} ${monthNames[d.getMonth()]}`;
  const endLabel = `${end.getDate()} ${monthNames[end.getMonth()]}`;
  return `${startLabel}–${endLabel}`;
}

function getWeekNumber(weekStart: string): number {
  const d = new Date(`${weekStart}T00:00:00`);
  const start = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7);
}

/** Stima ore + TSS + sessioni intense dalla lista sessioni. */
function computeWeekStats(sessions: BuiltSession[]): {
  hoursLabel: string;
  tssLabel: string;
  hardCount: number;
} {
  let totalMin = 0;
  let totalTss = 0;
  let hardCount = 0;
  for (const s of sessions) {
    if (s.rest) continue;
    totalMin += s.estimated_duration_min ?? 0;
    if (s.is_hard) hardCount++;
    // TSS approssimato (non disponibile in BuiltSession): uso la durata
    // come proxy (60 min ~= 60 TSS per una seduta media).
    totalTss += Math.round((s.estimated_duration_min ?? 60) * 0.9);
  }
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return {
    hoursLabel: m > 0 ? `${h}h ${m.toString().padStart(2, "0")}′` : `${h}h`,
    tssLabel: totalTss > 0 ? String(totalTss) : "—",
    hardCount,
  };
}

export default async function PlanPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: planRow }, { data: connection }, { data: snapshot }] =
    await Promise.all([
      supabase
        .from("weekly_plans")
        .select(
          "week_start, phase, sessions, narrative, validation_metadata, generated_at, pushed_at"
        )
        .eq("user_id", user.id)
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("intervals_connections")
        .select("granted_scopes")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("athlete_metrics_snapshots")
        .select("mirror_data")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  const plan = (planRow ?? null) as PlanRow | null;
  const canWriteCalendar = (connection?.granted_scopes ?? "")
    .split(/[\s,]+/)
    .some((s: string) => s.trim().toUpperCase() === "CALENDAR:WRITE");
  const mirror = (snapshot?.mirror_data ?? null) as MirrorData | null;
  const todayReadiness = mirror?.readiness_today?.decision ?? null;
  const todayKey = JS_DAY_TO_KEY[new Date().getDay()];
  const todayDate = new Date().toISOString().slice(0, 10);

  const weekStats = plan ? computeWeekStats(plan.sessions) : null;
  const meta = plan?.validation_metadata ?? null;
  const daysToEvent = meta?.days_to_event ?? null;
  const completionByDate = plan
    ? buildCompletionByDate(plan.sessions, mirror?.activities_90d ?? [])
    : {};

  return (
    <CurveLoadShell>
      {/* Header */}
      <div className="flex min-w-0 items-start justify-between pt-2">
        <div className="min-w-0">
          {plan && (
            <div className="break-words text-[11px] uppercase leading-relaxed tracking-[0.16em] text-muted">
              {formatWeekRange(plan.week_start)} · sett.{" "}
              {getWeekNumber(plan.week_start)}
              {daysToEvent != null && ` · ${daysToEvent}gg all'evento`}
            </div>
          )}
          <h1 className="mt-1.5 font-serif text-[30px] font-medium leading-none text-foreground">
            Piano settimana
          </h1>
        </div>
      </div>

      {/* 01 — Rigenera */}
      <div className="space-y-2">
        <StepMarker number="1" title="Aggiorna" subtitle="Rigenera dai dati" />
        <GenerateWeekButton hasPlan={plan != null} />
      </div>

      {/* 02 — Scheda settimanale */}
      <div className="space-y-2">
        <StepMarker number="2" title="Controlla" subtitle="Leggi la scheda" />
        <div className="min-w-0 space-y-3">
          {/* Nessun piano */}
          {!plan && (
            <div className="rounded-[18px] border border-border bg-surface px-6 py-10 text-center">
              <p className="font-serif text-lg text-foreground">
                Nessun piano ancora.
              </p>
              <p className="mt-2 text-sm text-muted">
                Premi «Genera settimana» per costruire la settimana dai tuoi dati.
              </p>
            </div>
          )}

          {plan && (
            <>
              {/* Stats strip: ore / TSS / intense */}
              {weekStats && (
                <div className="grid min-w-0 grid-cols-3 gap-2">
                  <StatPill label="Ore" value={weekStats.hoursLabel} />
                  <StatPill label="TSS ~" value={weekStats.tssLabel} />
                  <StatPill label="Intense" value={String(weekStats.hardCount)} />
                </div>
              )}

              {/* Narrativa — sopra la griglia */}
              {plan.narrative && (
                <div className="min-w-0 rounded-[16px] border border-border bg-gradient-to-br from-[#222b3d]/40 to-[#0e121b]/40 p-4">
                  <div className="mb-2 break-words text-[10px] uppercase tracking-[0.14em] text-accent2">
                    La logica della settimana
                  </div>
                  <p className="whitespace-pre-line break-words text-[13px] leading-relaxed text-secondary">
                    {plan.narrative}
                  </p>
                </div>
              )}

              {/* Fase reason */}
              {meta?.phase_reason && !plan.narrative && (
                <div className="min-w-0 break-words rounded-[16px] border border-border bg-surface px-4 py-3 text-sm text-secondary">
                  {meta.phase_reason}
                </div>
              )}

              {/* Griglia 7 giorni */}
              <RedistributeSection
                sessions={plan.sessions}
                weekStart={plan.week_start}
                todayKey={todayKey}
                todayReadiness={todayReadiness}
                pushedAt={plan.pushed_at}
                todayDate={todayDate}
                completionByDate={completionByDate}
              />

              <p className="break-words text-[11px] text-faint">
                Piano deterministico (Section 11 B). I target sono zone, non watt
                fissi.
              </p>
            </>
          )}
        </div>
      </div>

      {/* 03 — Invia a Intervals */}
      {plan && (
        <div className="space-y-2">
          <StepMarker number="3" title="Carica" subtitle="Settimana su Intervals" />
          <PushButton
            pushedAt={plan.pushed_at}
            canWriteCalendar={canWriteCalendar}
          />
        </div>
      )}
    </CurveLoadShell>
  );
}

function buildCompletionByDate(
  sessions: BuiltSession[],
  activities: MirrorData["activities_90d"]
): Record<string, { percent: number; label: string; source: "intervals" | "duration" }> {
  const plannedByDate = new Map(
    sessions
      .filter((session) => !session.rest && session.estimated_duration_min != null)
      .map((session) => [session.date, session])
  );
  const result: Record<string, { percent: number; label: string; source: "intervals" | "duration" }> = {};

  for (const activity of activities) {
    const date = activity.start_date_local.slice(0, 10);
    const session = plannedByDate.get(date);
    if (!session || activity.moving_time == null || activity.moving_time <= 0) {
      continue;
    }

    const compliance = normalizeCompliance(activity.compliance ?? null);
    const plannedSeconds = (session.estimated_duration_min ?? 0) * 60;
    const percent =
      compliance ??
      (plannedSeconds > 0
        ? Math.max(
            1,
            Math.min(100, Math.round((activity.moving_time / plannedSeconds) * 100))
          )
        : null);
    if (percent == null) continue;

    const previous = result[date];
    if (!previous || percent > previous.percent) {
      result[date] = {
        percent,
        label: `✓ ${percent}%`,
        source: compliance != null ? "intervals" : "duration",
      };
    }
  }

  return result;
}

function normalizeCompliance(value: number | null): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const normalized = value <= 1 ? value * 100 : value;
  return Math.max(0, Math.min(100, Math.round(normalized)));
}

function StepMarker({
  number,
  title,
  subtitle,
}: {
  number: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-brand/45 bg-brand-dim text-[10px] font-bold tabular-nums text-brand-hover">
        {number}
      </span>
      <span className="flex min-w-0 items-baseline gap-1.5">
        <span className="truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-secondary">
          {title}
        </span>
        <span className="truncate text-[10px] text-faint">
          {subtitle}
        </span>
      </span>
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col items-center rounded-[13px] border border-border bg-surface px-1.5 py-3">
      <span className="max-w-full break-words text-center font-serif text-[18px] leading-none text-foreground sm:text-[21px]">
        {value}
      </span>
      <span className="mt-1 max-w-full break-words text-center text-[10px] uppercase tracking-[0.1em] text-muted">
        {label}
      </span>
    </div>
  );
}
