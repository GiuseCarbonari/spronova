import { InfoTooltip } from "@/components/profile/info-tooltip";
import type { CourseCharacter, TerrainSummary } from "@/lib/terrain/gpx-parser";
import type { RaceEstimate } from "@/lib/terrain/race-estimator";

const SVG_W = 1000;
const SVG_H = 200;
const MAIN_CATEGORIES = new Set(["HC", "Cat 1", "Cat 2", "Cat 3"]);

const COURSE_LABEL: Record<CourseCharacter, string> = {
  flat: "pianeggiante",
  rolling: "ondulato",
  hilly: "collinare",
  mountain: "montagnoso",
};

function formatHm(seconds: number): string {
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes.toString().padStart(2, "0")}min`;
}

function speedColor(kmh: number): string {
  if (kmh < 8) return "var(--text-primary)";
  if (kmh < 18) return "var(--amber-hover)";
  return "var(--amber)";
}

function PacingChart({
  terrain,
  estimate,
}: {
  terrain: TerrainSummary;
  estimate: RaceEstimate;
}) {
  const polyline = terrain.polyline;
  const segments = estimate.scenarios.realistic.segments;
  if (polyline.length < 2 || segments.length < 2) {
    return (
      <p className="px-3 py-10 text-sm text-muted">
        Grafico pacing non disponibile.
      </p>
    );
  }

  const maxKm =
    polyline[polyline.length - 1][0] || terrain.total_distance_km || 1;
  const elevations = polyline.map((point) => point[3]);
  const minElevation = Math.min(...elevations);
  const elevationRange = Math.max(...elevations) - minElevation || 1;
  const maxSpeed = Math.max(...segments.map((segment) => segment.speed_kmh), 1);
  const x = (km: number) => (km / maxKm) * SVG_W;
  const yElevation = (elevation: number) =>
    SVG_H - ((elevation - minElevation) / elevationRange) * SVG_H;
  const ySpeed = (kmh: number) => SVG_H - (kmh / maxSpeed) * SVG_H;
  const elevationPath = polyline
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"} ${x(point[0]).toFixed(1)} ${yElevation(point[3]).toFixed(1)}`
    )
    .join(" ");
  const elevationArea = `${elevationPath} L ${SVG_W} ${SVG_H} L 0 ${SVG_H} Z`;

  return (
    <svg
      viewBox={`0 0 ${SVG_W} ${SVG_H}`}
      preserveAspectRatio="none"
      className="h-44 w-full sm:h-52"
      role="img"
      aria-label="Profilo altimetrico con velocità stimata nello scenario realistico"
    >
      {[0.25, 0.5, 0.75].map((ratio) => (
        <line
          key={ratio}
          x1={0}
          y1={SVG_H * ratio}
          x2={SVG_W}
          y2={SVG_H * ratio}
          stroke="var(--bg-border)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      <path d={elevationArea} fill="var(--amber)" opacity={0.06} />
      <path
        d={elevationPath}
        fill="none"
        stroke="var(--text-faint)"
        strokeWidth={1}
        opacity={0.75}
        vectorEffect="non-scaling-stroke"
      />
      {segments.slice(0, -1).map((segment, index) => {
        const next = segments[index + 1];
        return (
          <line
            key={index}
            x1={x(segment.km)}
            y1={ySpeed(segment.speed_kmh)}
            x2={x(next.km)}
            y2={ySpeed(next.speed_kmh)}
            stroke={speedColor(segment.speed_kmh)}
            strokeWidth={3}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </svg>
  );
}

export function RaceEstimateView({
  terrain,
  estimate,
  generatedAt,
}: {
  terrain: TerrainSummary;
  estimate: RaceEstimate;
  generatedAt: string | null;
}) {
  const { optimistic, realistic, conservative } = estimate.scenarios;
  const mainSplits = estimate.pacing.key_splits.filter(
    (split) => split.category != null && MAIN_CATEGORIES.has(split.category)
  );

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 sm:p-7">
      <div className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border lg:grid-cols-[1.4fr_0.8fr_0.8fr]">
        <Scenario
          label="Obiettivo realistico"
          subtitle="Il riferimento su cui costruire pacing e alimentazione."
          time={formatHm(realistic.total_seconds)}
          tooltip="obiettivo_realistico"
          highlight
        />
        <Scenario
          label="Giornata perfetta"
          subtitle="Margine superiore se tutto gira al meglio."
          time={formatHm(optimistic.total_seconds)}
          tooltip="giornata_perfetta"
        />
        <Scenario
          label="Con imprevisti"
          subtitle="Margine prudente per soste o calo finale."
          time={formatHm(conservative.total_seconds)}
          tooltip="con_imprevisti"
        />
      </div>

      <p className="mt-3 text-xs leading-5 text-faint">
        La forma attuale alimenta tutti e tre gli scenari. L’obiettivo
        realistico è il dato guida; gli altri definiscono il margine.
      </p>

      {estimate.pacing.warning && (
        <p className="mt-4 rounded-[11px] border border-border bg-amber-dim p-3 text-sm leading-6 text-secondary">
          {estimate.pacing.warning}
        </p>
      )}

      {mainSplits.length > 0 && (
        <div className="mt-8">
          <h3 className="text-base font-medium text-foreground">
            Split sulle salite principali
          </h3>
          <p className="mt-1 text-sm text-secondary">
            Orario di passaggio previsto nello scenario realistico.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-[560px] w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-[0.08em] text-muted">
                  <th className="py-3">Salita</th>
                  <th className="py-3 text-right">Km cima</th>
                  <th className="py-3 text-right">D+ e pendenza</th>
                  <th className="py-3 text-right">Passaggio</th>
                </tr>
              </thead>
              <tbody>
                {mainSplits.map((split, index) => (
                  <tr
                    key={index}
                    className="border-b border-border last:border-0"
                  >
                    <td className="py-3 font-medium text-foreground">
                      {split.category}
                    </td>
                    <td className="py-3 text-right">{split.top_km}</td>
                    <td className="py-3 text-right text-secondary">
                      {split.elevation_m} m · {split.avg_gradient_pct}%
                    </td>
                    <td className="py-3 text-right font-medium text-foreground">
                      {split.eta_formatted}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mt-8">
        <h3 className="text-base font-medium text-foreground">
          Velocità stimata sul percorso
        </h3>
        <div className="mt-3 overflow-hidden rounded-[11px] border border-border bg-base px-2 pt-3">
          <PacingChart terrain={terrain} estimate={estimate} />
          <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-border px-2 py-2 text-xs text-muted">
            <Legend color="bg-amber" label="veloce · oltre 18 km/h" />
            <Legend color="bg-amber-hover" label="intermedia · 8–18 km/h" />
            <Legend color="bg-foreground" label="lenta · sotto 8 km/h" />
          </div>
        </div>
      </div>

      <div className="mt-8">
        <h3 className="text-base font-medium text-foreground">
          Strategia di pacing
        </h3>
        <div className="mt-3 divide-y divide-border border-y border-border">
          {estimate.pacing.pacing_advice.map((advice, index) => (
            <div
              key={index}
              className="grid gap-2 py-4 sm:grid-cols-[1fr_auto] sm:items-center"
            >
              <div>
                <p className="font-medium capitalize text-foreground">
                  {advice.label}
                </p>
                <p className="mt-1 text-xs text-muted">
                  km {advice.from_km}–{advice.to_km}
                </p>
              </div>
              <p className="text-sm text-foreground sm:text-right">
                {advice.target_wkg != null
                  ? `~${advice.target_wkg} W/kg`
                  : "Potenza non disponibile"}
                {advice.avg_speed_kmh != null && (
                  <span className="ml-2 text-secondary">
                    ~{advice.avg_speed_kmh} km/h
                  </span>
                )}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm leading-6 text-secondary">
          Parti sul target del tratto iniziale, accetta la perdita di velocità
          in salita e conserva margine per l’ultima parte del percorso.
        </p>
      </div>

      <details className="mt-6 border-t border-border pt-4 text-xs text-muted">
        <summary className="min-h-10 cursor-pointer py-2 font-medium text-secondary">
          Modello, assunzioni e aggiornamento
        </summary>
        <p className="pb-2 leading-5">
          Stima basata sulla CP attuale di {Math.round(estimate.cp_w)} W{" "}
          <InfoTooltip term="cp_usato" />, su un modello fisico MTB con
          resistenza al rotolamento{" "}
          <InfoTooltip term="rolling_resistance" /> e aerodinamica. Peso usato:{" "}
          {estimate.weight_kg} kg. Non include meteo, soste extra o tratti
          tecnici estremi. Percorso {COURSE_LABEL[terrain.course_character]}.
          {generatedAt &&
            ` Aggiornata il ${new Date(generatedAt).toLocaleDateString("it-IT")}.`}
        </p>
      </details>
    </section>
  );
}

function Scenario({
  label,
  subtitle,
  time,
  tooltip,
  highlight = false,
}: {
  label: string;
  subtitle: string;
  time: string;
  tooltip: string;
  highlight?: boolean;
}) {
  return (
    <div className={`bg-surface-2 p-5 ${highlight ? "sm:p-6" : ""}`}>
      <p className="flex items-center gap-1 text-sm font-medium text-secondary">
        {label}
        <InfoTooltip term={tooltip} />
      </p>
      <p
        className={`mt-2 font-semibold tracking-[-0.04em] ${
          highlight
            ? "text-4xl text-amber sm:text-[42px]"
            : "text-2xl text-foreground"
        }`}
      >
        {time}
      </p>
      <p className="mt-2 max-w-sm text-xs leading-5 text-muted">{subtitle}</p>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`h-1.5 w-4 rounded-full ${color}`} aria-hidden />
      {label}
    </span>
  );
}
