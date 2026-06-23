"use client";

import { BuildProfileButton } from "./build-button";
import type { RunnerProfileData } from "@/lib/profile/build-runner-profile";
import type { PaceModelUsed } from "@/lib/profile/pace-profile";

const PHENOTYPE_LABEL: Record<string, string> = {
  diesel: "Diesel — resistenza aerobica dominante",
  mixed: "Misto — profilo bilanciato",
  speed: "Velocista — punta veloce marcata",
};

const DOMAIN_COLOR: Record<string, string> = {
  Moderate: "text-ready-go",
  Heavy: "text-ready-modify",
  Severe: "text-destructive",
  Extreme: "text-accent2",
};

const MODEL_LABEL: Record<PaceModelUsed, string> = {
  pl_short: "PL Veloce",
  cs_dprime: "CS-D′",
  pl_long: "PL Fondo",
};

const MODEL_COLOR: Record<PaceModelUsed, string> = {
  pl_short: "text-accent2",
  cs_dprime: "text-ready-modify",
  pl_long: "text-ready-go",
};

/** Distanze "ufficiali" con etichetta leggibile. */
const DISTANCE_LABEL: Record<number, string> = {
  400: "400 m",
  800: "800 m",
  1500: "1500 m",
  2000: "2 km",
  3000: "3 km",
  5000: "5 km",
  10000: "10 km",
  15000: "15 km",
  21097: "Mezza",
  30000: "30 km",
  42195: "Maratona",
  50000: "50 km",
};

/** secondi/km → "m:ss/km". */
function fmtPace(sPerKm: number | null): string {
  if (sPerKm == null || !Number.isFinite(sPerKm)) return "—";
  const m = Math.floor(sPerKm / 60);
  const s = Math.round(sPerKm % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** secondi → "h:mm:ss" o "m:ss". */
function fmtTime(s: number | null): string {
  if (s == null || !Number.isFinite(s)) return "—";
  const total = Math.round(s);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

const RPP_DISPLAY: Array<{ m: number; label: string }> = [
  { m: 400, label: "400 m" },
  { m: 1000, label: "1 km" },
  { m: 5000, label: "5 km" },
  { m: 10000, label: "10 km" },
  { m: 21097, label: "Mezza" },
];

export function RunnerProfile({
  profile,
}: {
  profile: RunnerProfileData | null;
}) {
  return (
    <>
      {/* Header */}
      <div className="flex items-start justify-between pt-2">
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] text-muted">
            Profilo corsa
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
            Premi «Aggiorna profilo» per leggere la curva di velocità da
            Intervals.icu e calcolare la tua Critical Speed (CS) e D′.
          </p>
        </div>
      )}

      {profile && (
        <div className="space-y-4 pt-4">
          {/* Quality warning */}
          {profile.meta.confidence === "low" && (
            <div className="rounded-[14px] border border-l-[3px] border-ready-modify-border border-l-ready-modify bg-surface px-4 py-3 text-[13px] text-secondary">
              Confidenza bassa: mancano corse di test a diverse distanze. Il
              profilo è indicativo.
            </div>
          )}

          {/* CS Hero */}
          {profile.cs_dprime ? (
            <div className="rounded-[20px] border border-border bg-gradient-to-br from-brand/[0.10] to-surface-2/60 px-6 py-7">
              <span className="text-[10.5px] uppercase tracking-[0.14em] text-muted">
                Critical Speed
              </span>
              <div className="mt-1.5 flex items-end gap-2.5">
                <span className="font-serif text-[52px] font-medium leading-none tabular-nums text-foreground">
                  {fmtPace(profile.cs_dprime.cs_pace_s_per_km)}
                </span>
                <span className="mb-2 font-serif text-[20px] text-secondary">
                  /km
                </span>
                <span className="mb-2 text-[14px] text-muted">
                  {profile.cs_dprime.cs_ms.toFixed(2)} m/s
                </span>
              </div>
              <p className="mt-2 font-serif text-[14px] italic text-secondary">
                {PHENOTYPE_LABEL[profile.phenotype.primary] ??
                  profile.phenotype.primary}
              </p>
            </div>
          ) : (
            <div className="rounded-[18px] border border-border bg-surface px-5 py-8 text-center text-sm text-muted">
              Critical Speed non disponibile — servono più corse su Intervals.icu.
            </div>
          )}

          {/* D' + utilizzo + LT1 mini-cards */}
          {profile.cs_dprime && (
            <div className="grid grid-cols-3 gap-3">
              <MiniCard
                label="D′"
                sublabel="Riserva anaerobica"
                value={`${Math.round(profile.cs_dprime.d_prime_m)} m`}
              />
              <MiniCard
                label="Utilizzo"
                sublabel="CS / v@5min"
                value={
                  profile.utilization_fraction != null
                    ? `${(profile.utilization_fraction * 100).toFixed(0)}%`
                    : "—"
                }
              />
              <MiniCard
                label="LT1"
                sublabel="≈78% CS"
                value={
                  profile.lt1_pace_s_per_km != null
                    ? `${fmtPace(profile.lt1_pace_s_per_km)}/km`
                    : "—"
                }
              />
            </div>
          )}

          {/* Indice di resistenza alla fatica */}
          {profile.phenotype.decay_per_doubling_pct != null && (
            <div className="rounded-[16px] border border-l-[3px] border-border border-l-ready-modify bg-surface px-4 py-3.5">
              <div className="text-[10.5px] uppercase tracking-[0.14em] text-muted">
                Resistenza alla fatica
              </div>
              <p className="mt-1 font-serif text-[18px] text-foreground">
                {PHENOTYPE_LABEL[profile.phenotype.primary] ??
                  profile.phenotype.primary}
              </p>
              <p className="mt-0.5 text-[12px] text-secondary">
                Calo del{" "}
                {Math.abs(profile.phenotype.decay_per_doubling_pct).toFixed(1)}%
                al raddoppiare della durata.
              </p>
            </div>
          )}

          {/* Record Pace Profile */}
          {profile.rpp.length > 0 && (
            <div>
              <div className="mb-3 text-[10.5px] uppercase tracking-[0.14em] text-muted">
                Record Pace Profile · {profile.meta.window_days}gg
              </div>
              <div className="overflow-hidden rounded-[16px] border border-border">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-surface-2">
                      <th className="px-4 py-2.5 text-left text-[10px] uppercase tracking-[0.1em] text-muted">
                        Distanza
                      </th>
                      <th className="px-4 py-2.5 text-right text-[10px] uppercase tracking-[0.1em] text-muted">
                        Tempo
                      </th>
                      <th className="px-4 py-2.5 text-right text-[10px] uppercase tracking-[0.1em] text-muted">
                        Passo
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {RPP_DISPLAY.map(({ m, label }) => {
                      const point = profile.rpp.find((e) => e.distance_m === m);
                      return (
                        <tr
                          key={m}
                          className="border-b border-border bg-surface last:border-0"
                        >
                          <td className="px-4 py-3 font-medium text-foreground">
                            {label}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-foreground">
                            {fmtTime(point?.time_s ?? null)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-secondary">
                            {fmtPace(point?.pace_s_per_km ?? null)}/km
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Predizioni gara */}
          {profile.race_predictions.length > 0 && (
            <div>
              <div className="mb-3 text-[10.5px] uppercase tracking-[0.14em] text-muted">
                Predizione gara
              </div>
              <div className="overflow-hidden rounded-[16px] border border-border">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-surface-2">
                      <th className="px-4 py-2.5 text-left text-[10px] uppercase tracking-[0.1em] text-muted">
                        Distanza
                      </th>
                      <th className="px-4 py-2.5 text-right text-[10px] uppercase tracking-[0.1em] text-muted">
                        Tempo
                      </th>
                      <th className="px-4 py-2.5 text-right text-[10px] uppercase tracking-[0.1em] text-muted">
                        Passo
                      </th>
                      <th className="px-4 py-2.5 text-right text-[10px] uppercase tracking-[0.1em] text-muted">
                        Modello
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {profile.race_predictions.map((p) => (
                      <tr
                        key={p.distance_m}
                        className="border-b border-border bg-surface last:border-0"
                      >
                        <td className="px-4 py-3 font-medium text-foreground">
                          {DISTANCE_LABEL[p.distance_m] ?? `${p.distance_m} m`}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-foreground">
                          {fmtTime(p.time_s)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-secondary">
                          {fmtPace(p.pace_s_per_km)}/km
                          {p.adjusted && (
                            <span
                              className="ml-0.5 text-faint"
                              title="Tempo corretto per coerenza tra le distanze"
                            >
                              *
                            </span>
                          )}
                        </td>
                        <td
                          className={`px-4 py-3 text-right text-[11px] font-medium ${MODEL_COLOR[p.model]}`}
                        >
                          {MODEL_LABEL[p.model]}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-[11px] text-faint">
                PL Veloce &lt;3 min · CS-D′ 3–15 min · PL Fondo &gt;15 min (Walt
                et al. 2025)
              </p>
            </div>
          )}

          {/* Zone di passo */}
          {profile.zones.length > 0 && profile.cs_dprime && (
            <div>
              <div className="mb-3 text-[10.5px] uppercase tracking-[0.14em] text-muted">
                Zone di passo · % CS
              </div>
              <div className="overflow-hidden rounded-[16px] border border-border">
                <table className="w-full">
                  <tbody>
                    {profile.zones.map((z) => (
                      <tr
                        key={z.zone}
                        className="border-b border-border bg-surface last:border-0"
                      >
                        <td className="px-4 py-2.5 font-medium text-foreground">
                          <span className="text-accent2">{z.zone}</span>{" "}
                          <span className="text-secondary">{z.name}</span>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-secondary">
                          {z.pace_to_s_per_km == null
                            ? `< ${fmtPace(z.pace_from_s_per_km)}/km`
                            : z.pace_from_s_per_km == null
                              ? `${fmtPace(z.pace_to_s_per_km)}/km +`
                              : `${fmtPace(z.pace_to_s_per_km)}–${fmtPace(z.pace_from_s_per_km)}/km`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Domini d'intensità */}
          {profile.cs_dprime && profile.intensity_domains.length > 0 && (
            <div>
              <div className="mb-3 text-[10.5px] uppercase tracking-[0.14em] text-muted">
                Domini d&apos;intensità
              </div>
              <div className="grid grid-cols-2 gap-3">
                {profile.intensity_domains.map((d) => (
                  <div
                    key={d.name}
                    className="rounded-[14px] border border-border bg-surface px-4 py-3"
                  >
                    <div
                      className={`text-[13px] font-medium ${DOMAIN_COLOR[d.name] ?? "text-foreground"}`}
                    >
                      {d.name}
                    </div>
                    <div className="mt-1 text-[12px] tabular-nums text-secondary">
                      {d.pace_fast_s_per_km == null
                        ? `> ${fmtPace(d.pace_slow_s_per_km)}/km`
                        : d.pace_slow_s_per_km == null
                          ? `< ${fmtPace(d.pace_fast_s_per_km)}/km`
                          : `${fmtPace(d.pace_fast_s_per_km)}–${fmtPace(d.pace_slow_s_per_km)}/km`}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function MiniCard({
  label,
  sublabel,
  value,
}: {
  label: string;
  sublabel: string;
  value: string;
}) {
  return (
    <div className="rounded-[16px] border border-border bg-surface px-4 py-4">
      <span className="text-[10.5px] uppercase tracking-[0.12em] text-muted">
        {label}
      </span>
      <div className="mt-2 font-serif text-[24px] font-medium leading-none tabular-nums text-foreground">
        {value}
      </div>
      <div className="mt-1 text-[11px] text-faint">{sublabel}</div>
    </div>
  );
}
