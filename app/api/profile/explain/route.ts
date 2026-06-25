import { NextResponse } from "next/server";

import {
  generateProfileComment,
  isAIConfigured,
  type ProfileCommentInput,
  type RPPInputPoint,
} from "@/lib/ai/provider";
import type { AthleteProfileData } from "@/lib/profile/build-profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/profile/explain — commento AI della scheda atleta (PRD §33, M3 p3).
 *
 * Carica profile_data, costruisce l'input con SOLO valori già calcolati
 * (fenotipo, cp/W′, RPP current e best 1y, peso — mai dati grezzi, mai chiedere
 * all'AI di calcolare), chiama Claude e salva il commento in athlete_profiles
 * così non si rigenera ad ogni visita. Senza API key: 200 { configured: false }.
 */

/** Etichetta leggibile della durata (5s, 1min, …) per la curva RPP. */
function durationLabel(secs: number): string {
  return secs < 60 ? `${secs}s` : `${secs / 60}min`;
}

/** Estrae un indicatore numerico dal `basis` del fenotipo ("apr_ratio=4.05"). */
function basisValue(basis: string[], key: string): number | null {
  const entry = basis.find((b) => b.startsWith(`${key}=`));
  if (!entry) return null;
  const value = Number(entry.split("=")[1]);
  return Number.isFinite(value) ? value : null;
}

/** Compone l'input per l'AI dai soli valori già presenti in profile_data. */
function buildCommentInput(profile: AthleteProfileData): ProfileCommentInput {
  const basis = profile.phenotype.basis ?? [];

  const rppCurrent: RPPInputPoint[] = profile.rpp.map((p) => ({
    label: durationLabel(p.duration_s),
    watts: p.watts != null ? Math.round(p.watts) : null,
    wkg: p.wkg != null ? Number(p.wkg.toFixed(2)) : null,
  }));

  const rppBest1y: RPPInputPoint[] = profile.rpp
    .filter((p) => p.watts_1y != null)
    .map((p) => ({
      label: durationLabel(p.duration_s),
      watts: Math.round(p.watts_1y as number),
    }));

  return {
    fenotipo: {
      primary: profile.phenotype.primary,
      secondary: profile.phenotype.secondary,
      confidence: profile.phenotype.confidence,
      flatness: basisValue(basis, "profile_flatness"),
      punch_ratio: basisValue(basis, "punch_ratio"),
      apr_ratio: basisValue(basis, "apr_ratio"),
    },
    cp_wprime: profile.cp_wprime
      ? {
          cp_w: Math.round(profile.cp_wprime.cp_w),
          cp_wkg:
            profile.cp_wprime.cp_wkg != null
              ? Number(profile.cp_wprime.cp_wkg.toFixed(2))
              : null,
          w_prime_kj: Number(profile.cp_wprime.w_prime_kj.toFixed(1)),
        }
      : null,
    // Power-law solo se diverge ≥3% dal Morton (sotto è rumore): allineato
    // alla soglia di visualizzazione in athlete-summary.tsx.
    cp_power_law:
      profile.cp_power_law &&
      profile.cp_wprime &&
      profile.cp_wprime.cp_w > 0 &&
      Math.abs(profile.cp_power_law.cp_w - profile.cp_wprime.cp_w) /
        profile.cp_wprime.cp_w >=
        0.03
        ? {
            cp_w: Math.round(profile.cp_power_law.cp_w),
            cp_wkg:
              profile.cp_power_law.cp_wkg != null
                ? Number(profile.cp_power_law.cp_wkg.toFixed(2))
                : null,
          }
        : null,
    rpp_current: rppCurrent,
    rpp_best_1y: rppBest1y,
    weight_kg: profile.weight_kg,
    weight_source: profile.weight_source,
  };
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

  // Senza API key l'app funziona identica: nessuna chiamata, 200 esplicito.
  if (!isAIConfigured()) {
    return NextResponse.json({ success: true, configured: false });
  }

  const { data: row } = await supabase
    .from("athlete_profiles")
    .select("profile_data")
    .eq("user_id", user.id)
    .maybeSingle();

  const profile = (row?.profile_data ?? null) as AthleteProfileData | null;
  if (!profile) {
    return NextResponse.json(
      {
        success: false,
        error: "no_profile",
        message: "Nessun profilo da spiegare: costruiscilo prima",
      },
      { status: 409 }
    );
  }

  let comment: string;
  try {
    comment = await generateProfileComment(buildCommentInput(profile));
  } catch (error) {
    if (error instanceof Error && error.message === "AI_NOT_CONFIGURED") {
      // Race difensiva: la key è sparita tra il check e la chiamata.
      return NextResponse.json({ success: true, configured: false });
    }
    console.error(
      "Generazione commento AI fallita:",
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

  const generatedAt = new Date().toISOString();
  // Upsert col client UTENTE: RLS consente la scrittura della propria riga.
  const { error: saveError } = await supabase
    .from("athlete_profiles")
    .update({ ai_comment: comment, ai_comment_at: generatedAt })
    .eq("user_id", user.id);
  if (saveError) {
    console.error("Salvataggio commento AI fallito:", saveError.message);
    // Il commento è valido: restituiscilo comunque, senza bloccare l'utente.
  }

  const admin = createAdminClient();
  await admin.from("audit_logs").insert({
    user_id: user.id,
    action: "profile.ai_comment_generated",
    source: "profile_explain",
    payload: {
      phenotype: profile.phenotype.primary,
      confidence: profile.phenotype.confidence,
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
