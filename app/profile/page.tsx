import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { AthleteSummary } from "@/components/profile/athlete-summary";
import { BuildProfileButton } from "@/components/profile/build-button";
import { CalibrateButton } from "@/components/profile/calibrate-button";
import { CalibrationHelp } from "@/components/profile/calibration-help";
import {
  EventAnalysis,
  type SavedGapAnalysis,
} from "@/components/profile/event-analysis";
import { GapAnalysisButton } from "@/components/profile/gap-analysis-button";
import { HowToRead } from "@/components/profile/how-to-read";
import { InfoTooltip } from "@/components/profile/info-tooltip";
import { PROFILE_METRIC_COPY } from "@/components/profile/profile-metric-copy";
import { ProfileSectionNav } from "@/components/profile/profile-section-nav";
import { RaceEstimateView } from "@/components/profile/race-estimate";
import { Button } from "@/components/ui/button";
import { MetricStat } from "@/components/ui/metric-stat";
import { MetricStrip } from "@/components/ui/metric-strip";
import { SectionHeader } from "@/components/ui/section-header";
import { Stat } from "@/components/ui/stat";
import { isAIConfigured } from "@/lib/ai/provider";
import type { AthleteProfileData } from "@/lib/profile/build-profile";
import type { TerrainSummary } from "@/lib/terrain/gpx-parser";
import type { RaceEstimateV2 } from "@/lib/terrain/race-estimator-v2";
import { createClient } from "@/lib/supabase/server";

const RPP_DISPLAY: Array<{ secs: number; label: string }> = [
  { secs: 5, label: "5s" },
  { secs: 60, label: "1min" },
  { secs: 300, label: "5min" },
  { secs: 1200, label: "20min" },
  { secs: 3600, label: "60min" },
];

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
  const apr = profile?.apr ?? null;
  const gapAnalysis = (row?.gap_analysis ?? null) as SavedGapAnalysis | null;
  const eventTerrain = (row?.event_terrain ?? null) as TerrainSummary | null;
  const signatureLevel = (row?.signature_level ?? null) as 1 | 2 | null;
  const raceEstimate = (row?.race_estimate ?? null) as RaceEstimateV2 | null;

  return (
    <AppShell className="gap-10 py-10 sm:py-12">
      <PageHeader
        eyebrow="Profilo atleta"
        title="La tua firma di prestazione"
        description="Dalla potenza espressa alle richieste del percorso: una lettura unica dei tuoi punti forti, dei limiti e del ritmo gara."
        action={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/settings/profile">Modifica dati atleta</Link>
            </Button>
            <BuildProfileButton />
          </div>
        }
      />

      {!profile && (
        <section className="rounded-2xl border border-border bg-surface px-6 py-12 text-center">
          <p className="text-lg font-medium text-foreground">
            Il profilo non è ancora stato costruito
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-secondary">
            Aggiorna il profilo per leggere la tua curva di potenza da
            Intervals.icu e creare la prima firma atleta.
          </p>
        </section>
      )}

      {profile && (
        <>
          <ProfileSectionNav />

          {profile.weight_source === "STRAVA" && (
            <div className="rounded-[11px] border border-ready-modify-border bg-surface px-4 py-3 text-sm text-secondary">
              Il peso arriva da Strava: i valori in W/kg potrebbero non
              riflettere l’ultimo aggiornamento.
            </div>
          )}

          {profile.meta.confidence === "low" && (
            <div className="rounded-[11px] border border-ready-modify-border bg-surface px-4 py-3 text-sm leading-6 text-secondary">
              La confidenza è bassa perché mancano sforzi massimali recenti su
              alcune durate chiave. Il profilo è indicativo e diventerà più
              affidabile con nuovi test o attività intense.
            </div>
          )}

          <AthleteSummary
            profile={profile}
            updatedAt={row?.updated_at ?? profile.meta.generated_at}
            aiConfigured={isAIConfigured()}
            aiComment={row?.ai_comment ?? null}
            aiCommentAt={row?.ai_comment_at ?? null}
          />

          <HowToRead />

          <section id="potenza" className="scroll-mt-20 space-y-6">
            <SectionHeader
              label="Capitolo 02"
              title="Potenza e capacità"
              description="Il motore aerobico, la riserva sopra soglia e i migliori riferimenti della finestra corrente."
            />

            <MetricStrip columns={4}>
              <MetricStat
                {...PROFILE_METRIC_COPY.cp}
                value={cpw ? `${Math.round(cpw.cp_w)} W` : "—"}
                accent
              />
              <MetricStat
                {...PROFILE_METRIC_COPY.wprime}
                value={cpw ? `${cpw.w_prime_kj.toFixed(1)} kJ` : "—"}
              />
              <Stat
                label="Potenza massima"
                value={
                  cpw?.p_max_w != null ? `${Math.round(cpw.p_max_w)} W` : "—"
                }
                detail={
                  cpw
                    ? cpw.model === "MORTON_3P"
                      ? "Modello Morton 3P"
                      : "Modello MS 2P"
                    : "Dato non disponibile"
                  }
              />
              <MetricStat
                {...PROFILE_METRIC_COPY.apr}
                value={apr ? apr.apr_ratio.toFixed(2) : "—"}
              />
            </MetricStrip>

            {apr && (
              <dl className="grid gap-4 border-y border-border py-5 sm:grid-cols-3">
                <div>
                  <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
                    MSP <InfoTooltip term="msp" />
                  </p>
                  <p className="mt-1 text-xl font-medium text-foreground">
                    {Math.round(apr.msp)} W
                  </p>
                </div>
                <MetricStat
                  {...PROFILE_METRIC_COPY.apr}
                  value={`${Math.round(apr.apr)} W`}
                  className="p-0 sm:p-0"
                />
                <p className="self-end text-xs leading-5 text-faint">
                  Il rapporto usa la CP come denominatore. La MAP restituita da
                  Intervals.icu non viene usata come riferimento.
                </p>
              </dl>
            )}

            <div>
              <SectionHeader
                title={
                  <span className="inline-flex items-center gap-1.5">
                    Record Power Profile
                    <InfoTooltip term="rpp" />
                  </span>
                }
                description="Finestra corrente di 90 giorni, confrontata con il miglior riferimento annuale."
              />

              <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-surface">
                <table className="min-w-[620px] w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface-2 text-left text-[11px] uppercase tracking-[0.08em] text-muted">
                      <th className="sticky left-0 z-10 bg-surface-2 px-4 py-3">
                        Durata
                      </th>
                      <th className="px-4 py-3 text-right">Watt</th>
                      <th className="px-4 py-3 text-right">W/kg</th>
                      <th className="px-4 py-3 text-right">
                        <span className="inline-flex items-center gap-1">
                          Best 1y
                          <InfoTooltip term="best1y" />
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {RPP_DISPLAY.map(({ secs, label }) => {
                      const point = profile.rpp.find(
                        (entry) => entry.duration_s === secs
                      );
                      return (
                        <tr
                          key={secs}
                          className="border-b border-border last:border-0"
                        >
                          <td className="sticky left-0 bg-surface px-4 py-3 font-medium text-foreground">
                            {label}
                            {point && !point.exact && (
                              <span
                                className="cursor-help text-faint"
                                title={`Valore del punto più vicino: ${point.actual_secs ?? "—"}s`}
                              >
                                {" "}
                                *
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-foreground">
                            {point?.watts != null
                              ? Math.round(point.watts)
                              : "—"}
                          </td>
                          <td className="px-4 py-3 text-right text-secondary">
                            {point?.wkg != null
                              ? point.wkg.toFixed(2)
                              : "—"}
                          </td>
                          <td className="px-4 py-3 text-right text-secondary">
                            {point?.watts_1y != null
                              ? Math.round(point.watts_1y)
                              : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-faint">
                Tutti i valori sono letti da Intervals.icu. L’asterisco indica
                una durata approssimata al punto disponibile più vicino.
              </p>
            </div>
          </section>

          <section id="evento" className="scroll-mt-20 space-y-6">
            <SectionHeader
              label="Capitolo 03"
              title="Richieste dell’evento"
              description="Confronta il tuo profilo con dislivello, salite e punti critici della gara target."
              action={<GapAnalysisButton hasAnalysis={gapAnalysis != null} />}
            />

            {gapAnalysis && eventTerrain ? (
              <EventAnalysis
                terrain={eventTerrain}
                analysis={gapAnalysis}
                generatedAt={(row?.gap_analysis_at ?? null) as string | null}
              />
            ) : (
              <div className="border-y border-border py-8 text-sm text-secondary">
                Seleziona una gara da Intervals.icu oppure carica un GPX per
                vedere il profilo altimetrico e i limitatori specifici.
              </div>
            )}
          </section>

          <section id="stima-gara" className="scroll-mt-20 space-y-6">
            <SectionHeader
              label="Capitolo 04"
              title="Stima e strategia gara"
              description="Un obiettivo realistico in primo piano, con margine ottimistico e conservativo come contesto."
            />

            {!eventTerrain && (
              <div className="border-y border-border py-8 text-sm text-secondary">
                Analizza prima un evento per calcolare tempi, split e strategia
                di pacing sul percorso.
              </div>
            )}

            {eventTerrain && (
              <>
                <CalibrationHelp />

                {signatureLevel == null && (
                  <div className="rounded-2xl border border-border bg-surface p-5 sm:flex sm:items-center sm:justify-between sm:gap-6">
                    <div>
                      <p className="font-medium text-foreground">
                        Firma di velocità da calibrare
                      </p>
                      <p className="mt-1 max-w-xl text-sm leading-6 text-secondary">
                        Le ultime attività MTB permettono di adattare il modello
                        alla tua velocità reale sui diversi terreni.
                      </p>
                    </div>
                    <div className="mt-4 shrink-0 sm:mt-0">
                      <CalibrateButton label="Calibra dai dati MTB" />
                    </div>
                  </div>
                )}

                {signatureLevel === 2 && (
                  <div className="rounded-[11px] border border-border bg-surface px-4 py-4 sm:flex sm:items-center sm:justify-between sm:gap-5">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Stima basata su valori medi MTB
                      </p>
                      <p className="mt-1 text-sm text-secondary">
                        {raceEstimate?.activities_used != null
                          ? `${raceEstimate.activities_used} attività analizzate. `
                          : ""}
                        Più uscite registri, più la stima diventa personale.
                      </p>
                    </div>
                    <div className="mt-3 shrink-0 sm:mt-0">
                      <CalibrateButton
                        label="Migliora con i tuoi dati"
                        variant="outline"
                      />
                    </div>
                  </div>
                )}

                {signatureLevel === 1 && (
                  <div className="rounded-[11px] border border-border bg-surface px-4 py-4 sm:flex sm:items-center sm:justify-between sm:gap-5">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Calibrata sui tuoi dati
                      </p>
                      <p className="mt-1 text-sm text-secondary">
                        {raceEstimate?.source_breakdown
                          ? `Il ${raceEstimate.source_breakdown.L1}% della distanza usa direttamente la tua firma personale.`
                          : "La stima usa le tue uscite MTB recenti."}
                      </p>
                    </div>
                    <div className="mt-3 shrink-0 sm:mt-0">
                      <CalibrateButton label="Ricalibra" variant="outline" />
                    </div>
                  </div>
                )}

                {signatureLevel != null && raceEstimate && (
                  <>
                    <RaceEstimateView
                      terrain={eventTerrain}
                      estimate={raceEstimate}
                      generatedAt={(row?.race_estimate_at ?? null) as string | null}
                    />
                    {raceEstimate.source_breakdown && (
                      <p className="text-xs leading-5 text-faint">
                        Copertura modello: L1 dati personali{" "}
                        {raceEstimate.source_breakdown.L1}% · L2 archetipo{" "}
                        {raceEstimate.source_breakdown.L2}% · L3 modello fisico{" "}
                        {raceEstimate.source_breakdown.L3}%.
                      </p>
                    )}
                  </>
                )}

                {signatureLevel != null && !raceEstimate && (
                  <p className="rounded-[11px] border border-border bg-surface p-4 text-sm text-secondary">
                    La firma di velocità è pronta. Rianalizza l’evento per
                    generare la stima aggiornata sul percorso.
                  </p>
                )}
              </>
            )}
          </section>
        </>
      )}
    </AppShell>
  );
}
