import { redirect } from "next/navigation";

import type { SavedGapAnalysis } from "@/components/profile/event-analysis";
import { LiminaShell } from "@/components/layout/limina-shell";
import { ProfileTabs } from "@/components/profile/profile-tabs";
import type { AthleteProfileData } from "@/lib/profile/build-profile";
import type { TerrainSummary } from "@/lib/terrain/gpx-parser";
import type { RaceEstimateV2 } from "@/lib/terrain/race-estimator-v2";
import { createClient } from "@/lib/supabase/server";

export default async function ProfilePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: row } = await supabase
    .from("athlete_profiles")
    .select(
      "profile_data, updated_at, ai_comment, ai_comment_at, gap_analysis, gap_analysis_at, event_terrain, race_estimate, race_estimate_at, signature_level, velocity_signature_at"
    )
    .eq("user_id", user.id)
    .maybeSingle();

  const profile = (row?.profile_data ?? null) as AthleteProfileData | null;
  const cpw = profile?.cp_wprime ?? null;
  const gapAnalysis = (row?.gap_analysis ?? null) as SavedGapAnalysis | null;
  const eventTerrain = (row?.event_terrain ?? null) as TerrainSummary | null;
  const signatureLevel = (row?.signature_level ?? null) as 1 | 2 | null;
  const raceEstimate = (row?.race_estimate ?? null) as RaceEstimateV2 | null;

  return (
    <LiminaShell>
      <ProfileTabs
        profile={profile}
        cpw={cpw}
        gapAnalysis={gapAnalysis}
        eventTerrain={eventTerrain}
        signatureLevel={signatureLevel}
        raceEstimate={raceEstimate}
        row={row}
      />

    </LiminaShell>
  );
}
