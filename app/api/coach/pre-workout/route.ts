import { NextResponse } from "next/server";

import { generatePreWorkoutReport, isAIConfigured } from "@/lib/ai/groq-provider";
import {
  buildCoachContext,
  COACH_PROFILE_COLUMNS,
  toPlannedSession,
} from "@/lib/ai/coach-context";
import type { MirrorData } from "@/lib/intervals/sync";
import type { BuiltSession } from "@/lib/planner/build-week";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/coach/pre-workout — report pre-allenamento strutturato, STATELESS.
 *
 * Forma copiata da app/api/comments/oggi/route.ts (auth, gate AI, degrado
 * AI_NOT_CONFIGURED → {configured:false}, 502 generico, audit). In più legge il
 * piano settimanale più recente e ne estrae la seduta odierna (stesso day-key
 * della dashboard) per il report. Nessun input atleta, nessun gating, nessuna
 * persistenza; se manca il mirror NON fallisce (degrada come coach/ask).
 */

/** getDay() (0=Dom..6=Sab) → chiave giorno del planner. */
const JS_DAY_TO_KEY = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/** Local date YYYY-MM-DD. */
function todayISO(): string {
  return new Date().toLocaleDateString("en-CA");
}

export async function POST() {
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

  if (!isAIConfigured()) {
    return NextResponse.json({ success: true, configured: false });
  }

  // --- Profilo (dossier+CP) + mirror + piano in parallelo -------------------
  const [profileRes, snapshotRes, planRes] = await Promise.all([
    supabase
      .from("athlete_profiles")
      .select(COACH_PROFILE_COLUMNS)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("athlete_metrics_snapshots")
      .select("mirror_data")
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

  const profileRow = (profileRes?.data ?? null) as Record<string, unknown> | null;
  const mirror = (snapshotRes?.data?.mirror_data ?? null) as MirrorData | null;

  // Seduta odierna dal piano più recente (stesso filtro della dashboard).
  const sessions = (planRes?.data?.sessions ?? []) as BuiltSession[];
  const todayKey = JS_DAY_TO_KEY[new Date().getDay()];
  const todaySession = sessions.find((s) => s.day === todayKey) ?? null;
  const plannedSession = toPlannedSession(todaySession);

  const today = todayISO();
  const ctx = buildCoachContext(profileRow, mirror, today);

  let report: string;
  try {
    const result = await generatePreWorkoutReport(ctx, plannedSession);
    report = result.report;
  } catch (error) {
    if (error instanceof Error && error.message === "AI_NOT_CONFIGURED") {
      return NextResponse.json({ success: true, configured: false });
    }
    console.error(
      "Report pre-allenamento fallito:",
      error instanceof Error ? error.message : "errore sconosciuto"
    );
    return NextResponse.json(
      { success: false, error: "ai_error", message: "Generazione del report fallita, riprova" },
      { status: 502 }
    );
  }

  // --- Audit ----------------------------------------------------------------
  const admin = createAdminClient();
  await admin.from("audit_logs").insert({
    user_id: user.id,
    action: "coach.pre_workout_report",
    source: "coach_pre_workout",
    payload: {
      readiness: ctx.readiness?.decision ?? null,
      stale: ctx.data_freshness.stale,
      has_session: plannedSession != null && !plannedSession.rest,
    },
  });

  return NextResponse.json({ success: true, configured: true, report });
}
