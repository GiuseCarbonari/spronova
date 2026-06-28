import { NextResponse, type NextRequest } from "next/server";

import { generateComment, isAIConfigured } from "@/lib/ai/groq-provider";
import type { AthleteProfileData } from "@/lib/profile/build-profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/comments/percorso
 *
 * ANALISI PERCORSO: altitude profile analysis, nutrition strategy recommendations,
 * pacing based on fenotipo, recovery plan.
 */

interface Climb {
  position_km: number;
  distance_km: number;
  elevation_m: number;
  avg_gradient_pct: number;
  category?: string;
}

interface EventTerrain {
  distance_km: number;
  elevation_m: number;
  climbs?: Climb[];
}

interface GapAnalysis {
  limiters?: Array<{ training_lever?: string }>;
  [key: string]: unknown;
}

interface RaceEstimate {
  time_estimate?: string;
  difficulty?: string;
  [key: string]: unknown;
}

interface TargetEvent {
  name?: string;
  data?: string;
  [key: string]: unknown;
}

interface ProfileRow {
  nome: string | null;
  profile_data: AthleteProfileData | null;
  event_terrain: EventTerrain | null;
  gap_analysis: GapAnalysis | null;
  race_estimate: RaceEstimate | null;
  gare_target: TargetEvent[] | null;
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
    .select(
      "nome, profile_data, event_terrain, gap_analysis, race_estimate, gare_target"
    )
    .eq("user_id", user.id)
    .maybeSingle();

  const profile = (profileRow ?? null) as ProfileRow | null;

  // Graceful degradation: if no terrain data, comment cannot be generated
  if (!profile?.event_terrain) {
    return NextResponse.json(
      {
        success: false,
        error: "no_data",
        message: "Nessuna gara o percorso caricato",
      },
      { status: 409 }
    );
  }

  const profileData = profile.profile_data;
  const phenotype = profileData?.phenotype || null;
  const cpw = profileData?.cp_wprime || null;
  const eventTerrain = profile.event_terrain;
  const gapAnalysis = profile.gap_analysis;
  const raceEstimate = profile.race_estimate;
  const targetEvent = (profile.gare_target || [])[0] || null;

  // Format climbs for readability
  const climbs = (eventTerrain.climbs || []).map((c) => ({
    position_km: c.position_km ? c.position_km.toFixed(1) : "−",
    distance_km: c.distance_km ? c.distance_km.toFixed(1) : "−",
    elevation_m: c.elevation_m ? Math.round(c.elevation_m) : "−",
    avg_gradient_pct: c.avg_gradient_pct ? c.avg_gradient_pct.toFixed(1) : "−",
    category: c.category || "−",
  }));

  const payload = {
    name: profile.nome ?? "Atleta",
    event: targetEvent
      ? {
          name: targetEvent.name || "Gara",
          data: targetEvent.data || null,
        }
      : null,
    event_terrain: {
      distance_km: eventTerrain.distance_km ? eventTerrain.distance_km.toFixed(1) : "−",
      elevation_m: eventTerrain.elevation_m ? Math.round(eventTerrain.elevation_m) : "−",
      climbs: climbs.length > 0 ? climbs : null,
    },
    fenotipo: phenotype
      ? {
          primary: phenotype.primary || "−",
          secondary: phenotype.secondary || null,
          confidence: phenotype.confidence || "−",
        }
      : null,
    cp_wprime: cpw
      ? {
          cp_w: Math.round(cpw.cp_w),
          cp_wkg: cpw.cp_wkg ? Number(cpw.cp_wkg.toFixed(2)) : null,
        }
      : null,
    gap_analysis: gapAnalysis
      ? {
          limiters: (gapAnalysis.limiters || []).map((l: any) => l.training_lever || "−"),
        }
      : null,
    race_estimate: raceEstimate
      ? {
          time_estimate: raceEstimate.time_estimate || null,
          difficulty: raceEstimate.difficulty || null,
        }
      : null,
  };

  // Generate comment
  let comment: string;
  try {
    const result = await generateComment({
      section: "percorso",
      payload,
    });
    comment = result.comment;
  } catch (error) {
    if (error instanceof Error && error.message === "AI_NOT_CONFIGURED") {
      return NextResponse.json({ success: true, configured: false });
    }
    console.error(
      "Generazione commento PERCORSO fallita:",
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
    .update({ ai_comment_percorso: comment, ai_comment_percorso_at: generatedAt })
    .eq("user_id", user.id);

  if (saveError) {
    console.error("Salvataggio commento PERCORSO fallito:", saveError.message);
  }

  // Audit
  const admin = createAdminClient();
  await admin.from("audit_logs").insert({
    user_id: user.id,
    action: "comment.ai_percorso_generated",
    source: "comments_percorso",
    payload: {
      event: targetEvent?.name || null,
      distance_km: eventTerrain.distance_km ? Math.round(eventTerrain.distance_km) : null,
      elevation_m: eventTerrain.elevation_m ? Math.round(eventTerrain.elevation_m) : null,
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
