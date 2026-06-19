import type { AthleteProfileData } from "@/lib/profile/build-profile";
import { ExplainButton } from "@/components/profile/explain-button";
import { InfoTooltip } from "@/components/profile/info-tooltip";
import { PROFILE_METRIC_COPY } from "@/components/profile/profile-metric-copy";
import { MetricStat } from "@/components/ui/metric-stat";
import { MetricStrip } from "@/components/ui/metric-strip";
import { Stat } from "@/components/ui/stat";

const phenotypeLabels = {
  diesel: "Diesel",
  all_rounder: "All-rounder",
  puncheur: "Puncheur",
  sprinter: "Sprinter",
} as const;

const confidenceLabels = {
  high: "Alta",
  medium: "Media",
  low: "Bassa",
} as const;

function phenotypeDescription(profile: AthleteProfileData) {
  const { phenotype, apr } = profile;

  if (phenotype.primary === "diesel") {
    return "Rendimento stabile sulle durate lunghe, con una firma aerobica resistente.";
  }
  if (phenotype.primary === "puncheur") {
    return "Profilo efficace negli sforzi brevi e ripetuti, dove il cambio di ritmo conta.";
  }
  if (phenotype.primary === "sprinter") {
    return "Picco neuromuscolare marcato e forte capacità di produrre potenza rapidamente.";
  }
  if (apr?.apr_ratio != null && apr.apr_ratio > 2.6) {
    return "Profilo completo, con una componente anaerobica particolarmente presente.";
  }

  return "Profilo completo, senza un unico sistema energetico nettamente dominante.";
}

export function AthleteSummary({
  profile,
  updatedAt,
  aiConfigured,
  aiComment,
  aiCommentAt,
}: {
  profile: AthleteProfileData;
  updatedAt: string;
  aiConfigured: boolean;
  aiComment: string | null;
  aiCommentAt: string | null;
}) {
  const cp = profile.cp_wprime;
  const phenotype = profile.phenotype;
  const secondary = phenotype.secondary
    ? phenotypeLabels[phenotype.secondary]
    : null;
  const date = new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(updatedAt));

  return (
    <section
      id="sintesi"
      className="scroll-mt-20 rounded-2xl border border-border bg-surface p-6 sm:p-8"
    >
      <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
              Firma dominante
            </p>
            <span className="text-xs text-faint">
              Confidenza {confidenceLabels[profile.meta.confidence].toLowerCase()}
            </span>
          </div>
          <h2 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-amber sm:text-5xl">
            {phenotypeLabels[phenotype.primary]}
          </h2>
          <p className="mt-3 max-w-xl text-[15px] leading-7 text-secondary">
            {phenotypeDescription(profile)}
          </p>
          {secondary && (
            <p className="mt-3 text-sm text-muted">
              Tratto secondario:{" "}
              <span className="font-medium text-foreground">{secondary}</span>
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-border pt-4 text-xs text-faint lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <span>
            Aggiornato il{" "}
            <time dateTime={updatedAt} className="text-muted">
              {date}
            </time>
          </span>
          <InfoTooltip term="confidenza" />
        </div>
      </div>

      <MetricStrip columns={4} className="mt-7">
        <MetricStat
          {...PROFILE_METRIC_COPY.cp}
          value={cp ? `${cp.cp_w} W` : "—"}
        />
        <MetricStat
          {...PROFILE_METRIC_COPY.wkg}
          value={cp?.cp_wkg != null ? `${cp.cp_wkg.toFixed(2)} W/kg` : "—"}
        />
        <MetricStat
          {...PROFILE_METRIC_COPY.wprime}
          value={cp ? `${cp.w_prime_kj.toFixed(1)} kJ` : "—"}
        />
        <Stat
          label="Peso"
          value={profile.weight_kg != null ? `${profile.weight_kg.toFixed(1)} kg` : "—"}
          detail={
            profile.weight_source === "power_curve"
              ? "Curva Intervals.icu"
              : profile.weight_source === "icu_weight"
                ? "Profilo Intervals.icu"
                : undefined
          }
        />
      </MetricStrip>

      <ExplainButton
        configured={aiConfigured}
        initialComment={aiComment}
        initialCommentAt={aiCommentAt}
      />
    </section>
  );
}
