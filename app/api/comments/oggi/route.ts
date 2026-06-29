import { NextResponse } from "next/server";

import { generateComment, isAIConfigured } from "@/lib/ai/groq-provider";
import type { MirrorData } from "@/lib/intervals/sync";
import { isInjured } from "@/lib/planner/injury";
import type { InjuryPeriod } from "@/lib/onboarding/dossier";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/comments/oggi
 *
 * Scheda OGGI: readiness panorama, how to approach session, metrics reading,
 * 14-day trend interpretation. Special: if injured today, only medical
 * prescriptions, no workout proposals.
 */

/** Local date YYYY-MM-DD. */
function todayISO(): string {
  return new Date().toLocaleDateString("en-CA");
}

/** True se l'ISO timestamp cade nello stesso giorno locale di oggi. */
function sameLocalDay(iso: string | null): boolean {
  return iso != null && new Date(iso).toLocaleDateString("en-CA") === todayISO();
}

/** Simple delta trend for 14-day window: (newest - oldest) / oldest * 100. */
function computeTrend(values: (number | null)[]): string {
  const filtered = values.filter((v) => v != null && Number.isFinite(v)) as number[];
  if (filtered.length < 2) return "−";
  const oldest = filtered[0];
  const newest = filtered[filtered.length - 1];
  if (oldest === 0) return "−";
  const pct = ((newest - oldest) / oldest) * 100;
  return pct > 0 ? `+${pct.toFixed(0)}%` : `${pct.toFixed(0)}%`;
}

interface ProfileRow {
  nome: string | null;
  injury_periods: InjuryPeriod[] | null;
  ai_comment_oggi: string | null;
  ai_comment_oggi_at: string | null;
}

export async function POST(request: Request) {
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

  // Leggi profilo + mirror
  const [profileRes, snapshotRes] = await Promise.all([
    supabase
      .from("athlete_profiles")
      .select("nome, injury_periods, ai_comment_oggi, ai_comment_oggi_at")
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

  const profile = (profileRes?.data ?? null) as ProfileRow | null;
  const mirror = (snapshotRes?.data?.mirror_data ?? null) as MirrorData | null;

  // Gating giornaliero: già generato oggi → non rigenerare, non chiamare Groq.
  if (sameLocalDay(profile?.ai_comment_oggi_at ?? null)) {
    return NextResponse.json({
      success: true,
      configured: true,
      comment: profile?.ai_comment_oggi ?? null,
      generated_at: profile?.ai_comment_oggi_at ?? null,
      gated: true,
    });
  }

  if (!mirror) {
    return NextResponse.json(
      { success: false, error: "no_data", message: "Dati insufficienti" },
      { status: 409 }
    );
  }

  const today = todayISO();
  const injuryPeriods = profile?.injury_periods ?? [];
  const injuredToday = isInjured(today, injuryPeriods);

  // Estrai trend 14gg
  const wellness30d = mirror.wellness_30d || [];
  const wellness14d = wellness30d.slice(-14);
  const ctlTrend = computeTrend(wellness14d.map((w) => w.ctl));
  const atlTrend = computeTrend(wellness14d.map((w) => w.atl));
  const hrvTrend = computeTrend(wellness14d.map((w) => w.hrv));

  const latestWellness = wellness30d[wellness30d.length - 1];
  const ctl = latestWellness?.ctl ?? null;
  const atl = latestWellness?.atl ?? null;
  const tsb = ctl && atl ? ctl - atl : null;
  const acwr = ctl && atl && ctl > 0 ? atl / ctl : null;
  const hrv = latestWellness?.hrv ?? null;
  const rhr = latestWellness?.restingHR ?? null;
  const sleep = latestWellness?.sleepSecs ? latestWellness.sleepSecs / 3600 : null;

  // Build payload
  const payload = {
    name: profile?.nome ?? "Atleta",
    date: today,
    injured: injuredToday,
    readiness: mirror.readiness_today,
    ctl: ctl ? ctl.toFixed(1) : null,
    atl: atl ? atl.toFixed(1) : null,
    tsb: tsb ? tsb.toFixed(1) : null,
    acwr: acwr ? acwr.toFixed(2) : null,
    hrv: hrv ? hrv.toFixed(0) : null,
    rhr: rhr ? rhr.toFixed(0) : null,
    sleep: sleep ? sleep.toFixed(1) : null,
    trend_ctl_14d: ctlTrend,
    trend_atl_14d: atlTrend,
    trend_hrv_14d: hrvTrend,
    data_quality_warning: mirror.data_quality_warning,
  };

  // Generate comment
  let comment: string;
  try {
    const result = await generateComment({
      section: "oggi",
      payload,
    });
    comment = result.comment;
  } catch (error) {
    if (error instanceof Error && error.message === "AI_NOT_CONFIGURED") {
      return NextResponse.json({ success: true, configured: false });
    }
    console.error(
      "Generazione commento OGGI fallita:",
      error instanceof Error ? error.message : "errore sconosciuto"
    );
    return NextResponse.json(
      {
        success: false,
        error: "ai_error",
        message: "Generazione del commento fallita, riprova",
      },
      { status: 502 }
    );
  }

  // Persist
  const generatedAt = new Date().toISOString();
  const { error: saveError } = await supabase
    .from("athlete_profiles")
    .update({ ai_comment_oggi: comment, ai_comment_oggi_at: generatedAt })
    .eq("user_id", user.id);

  if (saveError) {
    console.error("Salvataggio commento OGGI fallito:", saveError.message);
  }

  // Audit
  const admin = createAdminClient();
  await admin.from("audit_logs").insert({
    user_id: user.id,
    action: "comment.ai_oggi_generated",
    source: "comments_oggi",
    payload: {
      injured: injuredToday,
      readiness: mirror.readiness_today.decision,
      saved: !saveError,
    },
  });

  return NextResponse.json({
    success: true,
    configured: true,
    comment,
    generated_at: generatedAt,
  });
}
