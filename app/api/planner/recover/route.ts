import { NextResponse } from "next/server";

import type { BuiltSession } from "@/lib/planner/build-week";
import type { MirrorData } from "@/lib/intervals/sync";
import type { Phase } from "@/lib/planner/phase-detector";
import {
  recoverMissedSession,
  type RecoverResult,
  type Readiness,
} from "@/lib/planner/redistribute";
import {
  computeAvailableDays,
  effectiveMinGapDays,
  type DayKey,
} from "@/lib/planner/session-selector";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/planner/recover — recupera una seduta SALTATA (M9 ext.).
 *
 * A differenza di /redistribute ("non posso allenarmi questo giorno"), qui
 * l'utente ha già perso la seduta di un giorno passato e vuole rifarla. Il
 * recupero è READINESS-AWARE: se oggi non sei pronto (MODIFY/SKIP) propone il
 * giorno migliore della settimana invece di forzare la dura su oggi, e avvisa
 * del rischio. L'utente può comunque forzare un giorno (`force_date`), anche in
 * versione facile (`downgrade`). Avviene SOLO se sicuro (48h, cap, readiness).
 */

export const dynamic = "force-dynamic";

/** getDay() (0=Dom..6=Sab) → chiave giorno del planner. */
const JS_DAY_TO_KEY: DayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

interface WeeklyPlanRow {
  id: string;
  week_start: string;
  phase: Phase;
  sessions: BuiltSession[];
  pushed_at: string | null;
  plan_history: unknown[] | null;
}

interface AthleteProfileRow {
  durata_max_weekday_min: number | null;
  durata_max_weekend_min: number | null;
  giorni_preferiti: string[] | null;
  giorni_impossibili: string[] | null;
}

function dateToDay(date: string, sessions: BuiltSession[]): DayKey | null {
  const match = sessions.find((s) => s.date === date);
  return match ? (match.day as DayKey) : null;
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") ?? "preview";
  if (mode !== "preview" && mode !== "commit") {
    return NextResponse.json(
      { success: false, error: "invalid_mode", message: "Modalità non valida" },
      { status: 400 }
    );
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { success: false, error: "unauthorized", message: "Non autenticato" },
      { status: 401 }
    );
  }

  let body: {
    source_date?: string;
    force_date?: string;
    downgrade?: boolean;
    confirmed?: boolean;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { success: false, error: "bad_request", message: "Body JSON non valido" },
      { status: 400 }
    );
  }

  const sourceDate = body.source_date;
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!sourceDate || !dateRe.test(sourceDate)) {
    return NextResponse.json(
      {
        success: false,
        error: "missing_source",
        message: "Campo source_date (YYYY-MM-DD) obbligatorio",
      },
      { status: 400 }
    );
  }
  // force_date opzionale: il giorno che l'utente forza (override del suggerimento).
  if (body.force_date != null && !dateRe.test(body.force_date)) {
    return NextResponse.json(
      { success: false, error: "bad_force_date", message: "force_date non valido" },
      { status: 400 }
    );
  }

  if (mode === "commit" && body.confirmed !== true) {
    return NextResponse.json(
      {
        success: false,
        error: "confirmation_required",
        message: "Conferma esplicita richiesta (confirmed: true)",
      },
      { status: 400 }
    );
  }

  const todayIso = new Date().toLocaleDateString("en-CA");

  // La seduta da recuperare deve essere nel passato.
  if (sourceDate >= todayIso) {
    return NextResponse.json(
      {
        success: false,
        error: "source_not_past",
        message: "La seduta da recuperare deve essere di un giorno passato",
      },
      { status: 409 }
    );
  }
  // Il giorno forzato non può essere nel passato.
  if (body.force_date != null && body.force_date < todayIso) {
    return NextResponse.json(
      {
        success: false,
        error: "force_in_past",
        message: "Non puoi forzare il recupero su un giorno passato",
      },
      { status: 409 }
    );
  }

  // Carica il piano più recente.
  const { data: planRow, error: planError } = await supabase
    .from("weekly_plans")
    .select("id, week_start, phase, sessions, pushed_at, plan_history")
    .eq("user_id", user.id)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (planError) {
    return NextResponse.json(
      { success: false, error: "plan_read_failed", message: "Lettura piano fallita" },
      { status: 500 }
    );
  }
  if (!planRow) {
    return NextResponse.json(
      { success: false, error: "no_plan", message: "Nessun piano su cui operare" },
      { status: 404 }
    );
  }

  const plan = planRow as WeeklyPlanRow;

  const sourceDay = dateToDay(sourceDate, plan.sessions);
  if (!sourceDay) {
    return NextResponse.json(
      {
        success: false,
        error: "date_not_in_plan",
        message: "La data indicata non appartiene al piano corrente",
      },
      { status: 409 }
    );
  }
  // Giorno forzato dall'utente (opzionale): deve appartenere al piano.
  let forceDay: DayKey | undefined;
  if (body.force_date != null) {
    const fd = dateToDay(body.force_date, plan.sessions);
    if (!fd) {
      return NextResponse.json(
        {
          success: false,
          error: "force_not_in_plan",
          message: "Il giorno forzato non appartiene al piano corrente",
        },
        { status: 409 }
      );
    }
    forceDay = fd;
  }

  // Dossier per cap di durata + giorni allenabili.
  const { data: profile } = await supabase
    .from("athlete_profiles")
    .select(
      "durata_max_weekday_min, durata_max_weekend_min, giorni_preferiti, giorni_impossibili"
    )
    .eq("user_id", user.id)
    .maybeSingle();
  const profileData = (profile ?? {}) as AthleteProfileRow;
  const dossier = {
    durata_max_weekday_min: profileData.durata_max_weekday_min ?? null,
    durata_max_weekend_min: profileData.durata_max_weekend_min ?? null,
  };
  const availableDays = computeAvailableDays({
    disponibilita_ore_sett: null,
    giorni_preferiti: profileData.giorni_preferiti ?? [],
    giorni_impossibili: profileData.giorni_impossibili ?? [],
    durata_max_weekday_min: null,
    durata_max_weekend_min: null,
    indoor_outdoor: null,
    ha_rulli: null,
  });

  // TSB/RI + readiness odierni (letti, non ricalcolati).
  const { data: snapshot } = await supabase
    .from("athlete_metrics_snapshots")
    .select("mirror_data")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const mirror = (snapshot?.mirror_data ?? null) as MirrorData | null;
  const wellness = mirror?.wellness_30d ?? [];
  const ctlToday = wellness.at(-1)?.ctl ?? null;
  const atlToday = wellness.at(-1)?.atl ?? null;
  const tsb = ctlToday != null && atlToday != null ? Number((ctlToday - atlToday).toFixed(1)) : null;
  const ri = mirror?.readiness_today?.signals.find((s) => s.name === "ri")?.value ?? null;
  const minGapDays = effectiveMinGapDays(tsb, ri);

  const today = JS_DAY_TO_KEY[new Date().getDay()];
  const todayReadiness = (mirror?.readiness_today?.decision ?? "GO") as Readiness;

  let result: RecoverResult;
  try {
    result = recoverMissedSession(
      plan.sessions,
      sourceDay,
      today,
      todayReadiness,
      availableDays,
      dossier,
      minGapDays,
      { forceDay, downgrade: body.downgrade === true }
    );
  } catch (err) {
    console.error("recoverMissedSession fallita:", err);
    return NextResponse.json(
      { success: false, error: "recover_failed", message: "Recupero fallito" },
      { status: 500 }
    );
  }

  if (mode === "preview") {
    return NextResponse.json({
      success: true,
      mode: "preview",
      source_date: sourceDate,
      ...result,
    });
  }

  // Recupero non possibile in sicurezza: non si salva nulla.
  if (!result.recovered) {
    return NextResponse.json(
      {
        success: false,
        error: "recover_unsafe",
        message: result.blocked_reason ?? "Recupero non possibile in sicurezza",
        ...result,
      },
      { status: 409 }
    );
  }

  const targetDay = result.changes.find((c) => c.action === "moved")?.to ?? null;

  // ─── Commit ───────────────────────────────────────────────────────────────
  const admin = createAdminClient();
  const now = new Date().toISOString();

  const previousHistory = Array.isArray(plan.plan_history) ? plan.plan_history : [];
  const newHistory = [
    ...previousHistory,
    {
      sessions: plan.sessions,
      archived_at: now,
      reason: `Recupero seduta: ${sourceDay} → ${targetDay ?? "?"}.`,
    },
  ].slice(-5);

  const { error: updateError } = await admin
    .from("weekly_plans")
    .update({
      sessions: result.new_week,
      plan_history: newHistory,
      last_redistributed_at: now,
    })
    .eq("id", plan.id)
    .eq("user_id", user.id);

  if (updateError) {
    console.error("Salvataggio recupero fallito:", updateError.message);
    return NextResponse.json(
      {
        success: false,
        error: "save_failed",
        message: "Recupero calcolato ma salvataggio fallito",
      },
      { status: 500 }
    );
  }

  await admin.from("audit_logs").insert({
    user_id: user.id,
    action: "planner.recover",
    source: "planner",
    payload: {
      source_date: sourceDate,
      target_day: targetDay,
      downgraded: result.downgraded,
      changes: result.changes,
      explanation: result.explanation,
    },
  });

  return NextResponse.json({
    success: true,
    mode: "commit",
    source_date: sourceDate,
    recovered_at: now,
    pushed_at_before: plan.pushed_at,
    ...result,
  });
}
