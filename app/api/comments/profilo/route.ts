import { NextResponse, type NextRequest } from "next/server";

import { generateComment, isAIConfigured } from "@/lib/ai/groq-provider";
import type { AthleteProfileData } from "@/lib/profile/build-profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/comments/profilo
 *
 * Scheda PROFILO: phenotype comment, power profile interpretation,
 * 14-day variation trends (RPP current vs best 1y, CP stability).
 */

interface RPPPoint {
  duration_s: number;
  watts: number | null;
  wkg: number | null;
  watts_1y: number | null;
}

interface ProfileRow {
  nome: string | null;
  profile_data: AthleteProfileData | null;
}

/** Compare RPP trend: current vs best 1y across durations. */
function compareRPPTrends(profile: AthleteProfileData) {
  const points = profile.rpp || [];
  return points
    .filter((p) => p.watts != null && p.watts_1y != null)
    .map((p) => {
      const watts = p.watts as number;
      const watts1y = p.watts_1y as number;
      return {
        duration: p.duration_s < 60 ? `${p.duration_s}s` : `${Math.round(p.duration_s / 60)}min`,
        current_w: Math.round(watts),
        best_w: Math.round(watts1y),
        delta_pct: ((watts - watts1y) / watts1y) * 100,
      };
    });
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // No user found, returning 401. Use Supabase context for auth details.
    return NextResponse.json(
      { success: false, error: "unauthorized", message: "Non autenticato" },
      { status: 401 }
    );
  }

  if (!isAIConfigured()) {
    return NextResponse.json({ success: true, configured: false });
  }

  const { data: profileRow } = await supabase
    .from("athlete_profiles")
    .select("nome, profile_data")
    .eq("user_id", user.id)
    .maybeSingle();

  const profile = (profileRow ?? null) as ProfileRow | null;
  if (!profile?.profile_data) {
    return NextResponse.json(
      {
        success: false,
        error: "no_profile",
        message: "Profilo non ancora calcolato",
      },
      { status: 409 }
    );
  }

  const profileData = profile.profile_data;
  const phenotype = profileData.phenotype || {};
  const cpw = profileData.cp_wprime || null;
  const rppTrend = compareRPPTrends(profileData);

  // Estrai basis values per fenotipo
  const basis = phenotype.basis ?? [];
  const basisValue = (key: string): number | null => {
    const entry = basis.find((b: string) => b.startsWith(`${key}=`));
    if (!entry) return null;
    const value = Number(entry.split("=")[1]);
    return Number.isFinite(value) ? value : null;
  };

  const payload = {
    name: profile.nome ?? "Atleta",
    fenotipo: {
      primary: phenotype.primary || "−",
      secondary: phenotype.secondary || null,
      confidence: phenotype.confidence || "−",
      flatness: basisValue("profile_flatness"),
      punch_ratio: basisValue("punch_ratio"),
      apr_ratio: basisValue("apr_ratio"),
    },
    cp_wprime: cpw
      ? {
          cp_w: Math.round(cpw.cp_w),
          cp_wkg: cpw.cp_wkg ? Number(cpw.cp_wkg.toFixed(2)) : null,
          w_prime_kj: Number(cpw.w_prime_kj.toFixed(1)),
        }
      : null,
    rpp_trend_14d: rppTrend,
    weight_kg: profileData.weight_kg,
  };

  // Generate comment
  let comment: string;
  try {
    const result = await generateComment({
      section: "profilo",
      payload,
    });
    comment = result.comment;
  } catch (error) {
    if (error instanceof Error && error.message === "AI_NOT_CONFIGURED") {
      return NextResponse.json({ success: true, configured: false });
    }
    console.error(
      "Generazione commento PROFILO fallita:",
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
    .update({ ai_comment_profilo: comment, ai_comment_profilo_at: generatedAt })
    .eq("user_id", user.id);

  if (saveError) {
    console.error("Salvataggio commento PROFILO fallito:", saveError.message);
  }

  // Audit
  const admin = createAdminClient();
  await admin.from("audit_logs").insert({
    user_id: user.id,
    action: "comment.ai_profilo_generated",
    source: "comments_profilo",
    payload: {
      phenotype: phenotype.primary,
      cp_w: cpw?.cp_w ? Math.round(cpw.cp_w) : null,
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
