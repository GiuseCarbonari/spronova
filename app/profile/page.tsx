import { redirect } from "next/navigation";

import { BuildProfileButton } from "@/components/profile/build-button";
import { CalibrateButton } from "@/components/profile/calibrate-button";
import { CalibrationHelp } from "@/components/profile/calibration-help";
import {
  EventAnalysis,
  type SavedGapAnalysis,
} from "@/components/profile/event-analysis";
import { ExplainButton } from "@/components/profile/explain-button";
import { GapAnalysisButton } from "@/components/profile/gap-analysis-button";
import { InfoTooltip } from "@/components/profile/info-tooltip";
import { RaceEstimateView } from "@/components/profile/race-estimate";
import { LiminaShell } from "@/components/layout/limina-shell";
import { isAIConfigured } from "@/lib/ai/provider";
import type { AthleteProfileData } from "@/lib/profile/build-profile";
import type { TerrainSummary } from "@/lib/terrain/gpx-parser";
import type { RaceEstimateV2 } from "@/lib/terrain/race-estimator-v2";
import { createClient } from "@/lib/supabase/server";

const RPP_DISPLAY: Array<{ secs: number; label: string }> = [
  { secs: 5, label: "5s" },
  { secs: 60, label: "1 min" },
  { secs: 300, label: "5 min" },
  { secs: 1200, label: "20 min" },
  { secs: 3600, label: "60 min" },
];

const PHENOTYPE_LABEL: Record<string, string> = {
  diesel: "Diesel — resistenza aerobica dominante",
  all_rounder: "All-rounder — profilo completo",
  puncheur: "Puncheur — efficace nei cambi di ritmo",
  sprinter: "Sprinter — picco neuromuscolare marcato",
};

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
      {/* Header */}
      <div className="flex items-start justify-between pt-2">
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] text-muted">
            Profilo atleta
          </div>
          <h1 className="mt-1.5 font-serif text-[30px] font-medium leading-none text-foreground">
            La tua firma
          </h1>
        </div>
        <div className="mt-1 shrink-0">
          <BuildProfileButton />
        </div>
      </div>

      {!profile && (
        <div className="mt-6 rounded-[18px] border border-border bg-surface px-6 py-10 text-center">
          <p className="font-serif text-lg text-foreground">
            Profilo non ancora costruito.
          </p>
          <p className="mt-2 text-sm text-muted">
            Premi «Aggiorna profilo» per leggere la curva di potenza da
            Intervals.icu e creare la prima firma atleta.
          </p>
        </div>
      )}

      {profile && (
        <>
          {/* Quality warnings */}
          {profile.meta.confidence === "low" && (
            <div className="rounded-[14px] border border-l-[3px] border-ready-modify-border border-l-ready-modify bg-surface px-4 py-3 text-[13px] text-secondary">
              Confidenza bassa: mancano sforzi massimali recenti. Il profilo è
              indicativo.
            </div>
          )}
          {profile.weight_source === "STRAVA" && (
            <div className="rounded-[14px] border border-l-[3px] border-ready-modify-border border-l-ready-modify bg-surface px-4 py-3 text-[13px] text-secondary">
              Il peso arriva da Strava: i valori W/kg potrebbero non essere
              aggiornati.
            </div>
          )}

          {/* Calibration banner — only when event is set */}
          {eventTerrain && <CalibrationBanner signatureLevel={signatureLevel} />}

          {/* CP Hero */}
          {cpw ? (
            <div className="rounded-[20px] border border-border bg-gradient-to-br from-[#222b3d]/40 to-[#0e121b]/40 px-6 py-7">
              <div className="flex items-center gap-2">
                <span className="text-[10.5px] uppercase tracking-[0.14em] text-muted">
                  Potenza critica
                </span>
                <InfoTooltip term="cp" />
              </div>
              <div className="mt-1.5 flex items-end gap-2.5">
                <span className="font-serif text-[58px] font-medium leading-none tabular-nums text-foreground">
                  {Math.round(cpw.cp_w)}
                </span>
                <span className="mb-2 font-serif text-[22px] text-secondary">W</span>
                {cpw.cp_wkg != null && (
                  <span className="mb-2 text-[14px] text-muted">
                    {cpw.cp_wkg.toFixed(2)} W/kg
                  </span>
                )}
              </div>
              <p className="mt-2 font-serif text-[14px] italic text-secondary">
                {PHENOTYPE_LABEL[profile.phenotype.primary] ??
                  profile.phenotype.primary}
              </p>
            </div>
          ) : (
            <div className="rounded-[18px] border border-border bg-surface px-5 py-8 text-center text-sm text-muted">
              Dati CP non disponibili — aggiorna il profilo.
            </div>
          )}

          {/* W' + Pmax mini-cards */}
          {cpw && (
            <div className="grid grid-cols-2 gap-3">
              <MiniCard
                label="W′"
                sublabel="Riserva anaerobica"
                value={`${cpw.w_prime_kj.toFixed(1)} kJ`}
                term="wprime"
              />
              <MiniCard
                label="Pmax"
                sublabel="Potenza massima"
                value={cpw.p_max_w != null ? `${Math.round(cpw.p_max_w)} W` : "—"}
              />
            </div>
          )}

          {/* RPP table */}
          {profile.rpp.length > 0 && (
            <div>
              <div className="mb-3 text-[10.5px] uppercase tracking-[0.14em] text-muted">
                Record Power Profile · 90gg
              </div>
              <div className="overflow-hidden rounded-[16px] border border-border">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-surface-2">
                      <th className="px-4 py-2.5 text-left text-[10px] uppercase tracking-[0.1em] text-muted">
                        Durata
                      </th>
                      <th className="px-4 py-2.5 text-right text-[10px] uppercase tracking-[0.1em] text-muted">
                        Watt
                      </th>
                      <th className="px-4 py-2.5 text-right text-[10px] uppercase tracking-[0.1em] text-muted">
                        W/kg
                      </th>
                      <th className="px-4 py-2.5 text-right text-[10px] uppercase tracking-[0.1em] text-muted">
                        Aff.
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {RPP_DISPLAY.map(({ secs, label }) => {
                      const point = profile.rpp.find(
                        (e) => e.duration_s === secs
                      );
                      return (
                        <tr
                          key={secs}
                          className="border-b border-border bg-surface last:border-0"
                        >
                          <td className="px-4 py-3 font-medium text-foreground">
                            {label}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-foreground">
                            {point?.watts != null
                              ? Math.round(point.watts)
                              : "—"}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-secondary">
                            {point?.wkg != null ? point.wkg.toFixed(2) : "—"}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {point ? (
                              point.exact ? (
                                <span
                                  className="text-ready-go"
                                  title="Sforzo massimale registrato"
                                >
                                  ●
                                </span>
                              ) : (
                                <span
                                  className="text-ready-modify"
                                  title="Valore approssimato"
                                >
                                  ◐
                                </span>
                              )
                            ) : (
                              <span className="text-faint">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-[11px] text-faint">
                ● sforzo massimale · ◐ valore approssimato
              </p>
            </div>
          )}

          {/* AI comment */}
          <ExplainButton
            configured={isAIConfigured()}
            initialComment={row?.ai_comment ?? null}
            initialCommentAt={row?.ai_comment_at ?? null}
          />

          {/* Event analysis */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10.5px] uppercase tracking-[0.14em] text-accent2">
                  Analisi evento
                </div>
                <h2 className="mt-1 font-serif text-[22px] text-foreground">
                  Richieste del percorso
                </h2>
              </div>
              <div className="shrink-0">
                <GapAnalysisButton hasAnalysis={gapAnalysis != null} />
              </div>
            </div>

            {gapAnalysis && eventTerrain ? (
              <EventAnalysis
                terrain={eventTerrain}
                analysis={gapAnalysis}
                generatedAt={(row?.gap_analysis_at ?? null) as string | null}
              />
            ) : (
              <div className="rounded-[16px] border border-border bg-surface px-4 py-8 text-center text-sm text-muted">
                Seleziona una gara da Intervals.icu o carica un GPX per vedere
                il profilo altimetrico e i limitatori specifici.
              </div>
            )}
          </section>

          {/* Race estimate */}
          {eventTerrain && (
            <section className="space-y-4">
              <div>
                <div className="text-[10.5px] uppercase tracking-[0.14em] text-accent2">
                  Stima gara
                </div>
                <h2 className="mt-1 font-serif text-[22px] text-foreground">
                  Tempo e strategia
                </h2>
              </div>

              <CalibrationHelp />

              {signatureLevel == null && (
                <div className="flex items-center justify-between gap-3 rounded-[14px] border border-ready-skip-border bg-surface px-4 py-3.5">
                  <div>
                    <p className="text-[13px] font-medium text-foreground">
                      Calibrazione assente
                    </p>
                    <p className="mt-0.5 text-[11.5px] text-muted">
                      Adatta il modello alle tue uscite MTB recenti.
                    </p>
                  </div>
                  <div className="shrink-0">
                    <CalibrateButton label="Calibra" />
                  </div>
                </div>
              )}

              {signatureLevel === 2 && (
                <div className="flex items-center justify-between gap-3 rounded-[14px] border border-ready-modify-border bg-surface px-4 py-3.5">
                  <div>
                    <p className="text-[13px] font-medium text-foreground">
                      Stima su valori medi MTB
                    </p>
                    <p className="mt-0.5 text-[11.5px] text-muted">
                      {raceEstimate?.activities_used != null
                        ? `${raceEstimate.activities_used} attività analizzate.`
                        : "Calibra per rendere la stima personale."}
                    </p>
                  </div>
                  <div className="shrink-0">
                    <CalibrateButton label="Migliora" variant="outline" />
                  </div>
                </div>
              )}

              {signatureLevel === 1 && (
                <div className="flex items-center justify-between gap-3 rounded-[14px] border border-ready-go-border bg-surface px-4 py-3.5">
                  <div>
                    <p className="text-[13px] font-medium text-foreground">
                      Calibrata sui tuoi dati
                    </p>
                    <p className="mt-0.5 text-[11.5px] text-muted">
                      {raceEstimate?.source_breakdown
                        ? `${raceEstimate.source_breakdown.L1}% dati personali.`
                        : "Stima basata sulle tue uscite MTB."}
                    </p>
                  </div>
                  <div className="shrink-0">
                    <CalibrateButton label="Ricalibra" variant="outline" />
                  </div>
                </div>
              )}

              {signatureLevel != null && raceEstimate && (
                <>
                  <RaceEstimateView
                    terrain={eventTerrain}
                    estimate={raceEstimate}
                    generatedAt={
                      (row?.race_estimate_at ?? null) as string | null
                    }
                  />
                  {raceEstimate.source_breakdown && (
                    <p className="text-[11px] text-faint">
                      Copertura: L1 {raceEstimate.source_breakdown.L1}%
                      personale · L2 {raceEstimate.source_breakdown.L2}%
                      archetipo · L3 {raceEstimate.source_breakdown.L3}%
                      modello fisico.
                    </p>
                  )}
                </>
              )}

              {signatureLevel != null && !raceEstimate && (
                <p className="rounded-[14px] border border-border bg-surface px-4 py-4 text-sm text-secondary">
                  Firma pronta. Rianalizza l&apos;evento per generare la stima.
                </p>
              )}
            </section>
          )}
        </>
      )}
    </LiminaShell>
  );
}

function MiniCard({
  label,
  sublabel,
  value,
  term,
}: {
  label: string;
  sublabel: string;
  value: string;
  term?: string;
}) {
  return (
    <div className="rounded-[16px] border border-border bg-white/[0.025] px-4 py-4">
      <div className="flex items-center gap-1.5">
        <span className="text-[10.5px] uppercase tracking-[0.12em] text-muted">
          {label}
        </span>
        {term && <InfoTooltip term={term} />}
      </div>
      <div className="mt-2 font-serif text-[24px] font-medium leading-none tabular-nums text-foreground">
        {value}
      </div>
      <div className="mt-1 text-[11px] text-faint">{sublabel}</div>
    </div>
  );
}

function CalibrationBanner({
  signatureLevel,
}: {
  signatureLevel: 1 | 2 | null;
}) {
  if (signatureLevel === 1) {
    return (
      <div className="flex items-center gap-2 rounded-[14px] border border-ready-go-border bg-surface px-4 py-2.5">
        <span className="text-[10px] text-ready-go">●</span>
        <span className="text-[13px] font-medium text-foreground">
          Calibrata sui tuoi dati
        </span>
      </div>
    );
  }
  if (signatureLevel === 2) {
    return (
      <div className="flex items-center gap-2 rounded-[14px] border border-ready-modify-border bg-surface px-4 py-2.5">
        <span className="text-[10px] text-ready-modify">◐</span>
        <span className="text-[13px] font-medium text-foreground">
          Stima su valori medi MTB
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-[14px] border border-ready-skip-border bg-surface px-4 py-2.5">
      <span className="text-[10px] text-ready-skip">○</span>
      <span className="text-[13px] font-medium text-foreground">
        Firma non calibrata
      </span>
    </div>
  );
}
