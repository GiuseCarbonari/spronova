import { InfoTooltip } from "@/components/profile/info-tooltip";
import type {
  ClimbDemand,
  GapAnalysisResult,
  Limiter,
  Severity,
} from "@/lib/terrain/gap-analysis";
import type { CourseCharacter, TerrainSummary } from "@/lib/terrain/gpx-parser";

export interface SavedGapAnalysis extends GapAnalysisResult {
  event: {
    id: number | string | null;
    name: string | null;
    start_date_local: string | null;
    distance_km: number | null;
  };
}

const COURSE_CHARACTER: Record<CourseCharacter, string> = {
  flat: "Pianeggiante",
  rolling: "Ondulato",
  hilly: "Collinare",
  mountain: "Montagnoso",
};

const SEVERITY_BADGE: Record<Severity, { label: string; classes: string }> = {
  high: { label: "alta", classes: "text-ready-skip" },
  medium: { label: "media", classes: "text-ready-modify" },
  low: { label: "bassa", classes: "text-ready-go" },
};

const SEVERITY_ORDER: Record<Severity, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const LEVER_LABELS: Record<string, string> = {
  durability_fatigued: "Durabilità a fatica",
  threshold_long: "Soglia lunga",
  sweet_spot_long: "Sweet Spot lunghi",
  wprime_reconstitution: "Ricostituzione W′",
  neuromuscular: "Neuromuscolare e sprint",
};

const FATIGUE_LABELS: Record<string, string> = {
  fresh: "fresco",
  moderate: "fatica moderata",
  fatigued: "a fatica",
};

function formatDate(iso: string | null): string {
  if (!iso) return "Data non disponibile";
  const date = new Date(iso.slice(0, 10));
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  return date.toLocaleDateString("it-IT", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDuration(secs: number | null): string {
  if (secs == null) return "—";
  if (secs < 60) return `~${secs}s`;
  return `~${Math.round(secs / 60)} min`;
}

function climbRowStyle(avgGradientPct: number) {
  if (avgGradientPct < 5) {
    return {
      rowBg: "bg-blue-950/10",
      dot: "text-blue-300",
      dotColor: "bg-blue-400",
    };
  }
  if (avgGradientPct < 8) {
    return {
      rowBg: "bg-amber-950/10",
      dot: "text-amber-300",
      dotColor: "bg-amber-400",
    };
  }
  return {
    rowBg: "bg-red-950/10",
    dot: "text-red-300",
    dotColor: "bg-red-400",
  };
}

function FatigueChip({ level }: { level: string }) {
  const map: Record<string, { label: string; classes: string }> = {
    fresh: { label: "fresco", classes: "text-ready-go" },
    moderate: { label: "moderata", classes: "text-ready-modify" },
    fatigued: { label: "a fatica", classes: "text-ready-skip" },
  };
  const chip = map[level] ?? { label: level, classes: "text-muted" };
  return <span className={`text-xs font-medium ${chip.classes}`}>{chip.label}</span>;
}

const SVG_W = 1000;
const SVG_H = 200;

function climbVisual(avgGradientPct: number) {
  if (avgGradientPct < 5) {
    // dolce — blu (z2)
    return { fill: "#4fa3e0", rectOpacity: 0.10, strokeOpacity: 0.55, lineW: 2 };
  }
  if (avgGradientPct < 8) {
    // impegnativa — gold (z4)
    return { fill: "#f2b33d", rectOpacity: 0.14, strokeOpacity: 0.80, lineW: 2.5 };
  }
  // ripida — rosso (z5)
  return { fill: "#f2553d", rectOpacity: 0.18, strokeOpacity: 1, lineW: 3 };
}

function ElevationProfile({ terrain }: { terrain: TerrainSummary }) {
  const polyline = terrain.polyline;
  if (polyline.length < 2) {
    return (
      <p className="px-3 py-10 text-sm text-muted">
        Profilo altimetrico non disponibile.
      </p>
    );
  }

  const maxKm =
    polyline[polyline.length - 1][0] || terrain.total_distance_km || 1;
  const elevations = polyline.map((point) => point[3]);
  const minElevation = Math.min(...elevations);
  const elevationRange = Math.max(...elevations) - minElevation || 1;
  const x = (km: number) => (km / maxKm) * SVG_W;
  const y = (elevation: number) =>
    SVG_H - ((elevation - minElevation) / elevationRange) * SVG_H;
  const linePath = polyline
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"} ${x(point[0]).toFixed(1)} ${y(point[3]).toFixed(1)}`
    )
    .join(" ");
  const areaPath = `${linePath} L ${SVG_W} ${SVG_H} L 0 ${SVG_H} Z`;
  const climbPaths = terrain.climbs.map((climb) => {
    const start = climb.position_km;
    const end = climb.position_km + climb.distance_km;
    const points = polyline.filter(
      (point) => point[0] >= start && point[0] <= end
    );
    return points.length >= 2
      ? points
          .map(
            (point, index) =>
              `${index === 0 ? "M" : "L"} ${x(point[0]).toFixed(1)} ${y(point[3]).toFixed(1)}`
          )
          .join(" ")
      : null;
  });

  return (
    <svg
      viewBox={`0 0 ${SVG_W} ${SVG_H}`}
      preserveAspectRatio="none"
      className="h-44 w-full sm:h-52"
      role="img"
      aria-label="Profilo altimetrico del percorso con le salite rilevate"
    >
      <defs>
        <linearGradient id="area-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5b8def" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#5b8def" stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {/* Climb band backgrounds */}
      {terrain.climbs.map((climb, index) => {
        const start = x(climb.position_km);
        const end = x(climb.position_km + climb.distance_km);
        const v = climbVisual(climb.avg_gradient_pct);
        return (
          <rect
            key={`band-${index}`}
            x={start}
            y={0}
            width={Math.max(2, end - start)}
            height={SVG_H}
            fill={v.fill}
            opacity={v.rectOpacity}
          />
        );
      })}

      {/* Terrain area fill */}
      <path d={areaPath} fill="url(#area-fill)" />

      {/* Base elevation line */}
      <path
        d={linePath}
        fill="none"
        stroke="rgba(255,255,255,0.18)"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />

      {/* Climb highlight lines on the curve */}
      {terrain.climbs.map((climb, index) => {
        const path = climbPaths[index];
        if (!path) return null;
        const v = climbVisual(climb.avg_gradient_pct);
        return (
          <path
            key={`line-${index}`}
            d={path}
            fill="none"
            stroke={v.fill}
            strokeWidth={v.lineW}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={v.strokeOpacity}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}

      {/* Climb start tick marks */}
      {terrain.climbs.map((climb, index) => {
        const sx = x(climb.position_km);
        const v = climbVisual(climb.avg_gradient_pct);
        return (
          <line
            key={`tick-${index}`}
            x1={sx} y1={0} x2={sx} y2={SVG_H}
            stroke={v.fill}
            strokeWidth={1}
            strokeDasharray="4 4"
            opacity={0.4}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </svg>
  );
}

export function EventAnalysis({
  terrain,
  analysis,
  generatedAt,
}: {
  terrain: TerrainSummary;
  analysis: SavedGapAnalysis;
  generatedAt: string | null;
}) {
  const demands: Record<number, ClimbDemand | undefined> = {};
  analysis.climb_demands.forEach((demand, index) => {
    demands[index] = demand;
  });
  const limiters = [...analysis.limiters].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
  );

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-xl font-medium tracking-[-0.02em] text-foreground">
            {analysis.event.name ?? "Gara target"}
          </h3>
          <p className="mt-1 text-sm text-secondary">
            {formatDate(analysis.event.start_date_local)} ·{" "}
            {analysis.event.distance_km ?? terrain.total_distance_km} km ·{" "}
            {terrain.total_elevation_m} m D+
          </p>
        </div>
        <span className="rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs font-medium text-secondary">
          {COURSE_CHARACTER[terrain.course_character]} ·{" "}
          {terrain.elevation_per_km} m/km
        </span>
      </div>

      {analysis.note && (
        <p className="mt-3 text-sm leading-6 text-secondary">{analysis.note}</p>
      )}

      <div className="mt-6 overflow-hidden rounded-[11px] border border-border bg-base px-2 pt-3">
        <ElevationProfile terrain={terrain} />
        <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-border px-2 py-2 text-xs text-muted">
          <ClimbLegend hex="#4fa3e0" label="dolce · sotto 5%" />
          <ClimbLegend hex="#f2b33d" label="impegnativa · 5–8%" />
          <ClimbLegend hex="#f2553d" label="ripida · oltre 8%" />
        </div>
      </div>

      {terrain.climbs.length > 0 && (
        <div className="mt-7">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-[0.08em] text-muted">
                <th className="pb-2.5">Pos.</th>
                <th className="pb-2.5 text-right">Lung. · D+</th>
                <th className="pb-2.5 text-right">Pend. · Cat.</th>
                <th className="pb-2.5 text-right">
                  <span className="inline-flex items-center justify-end gap-1">
                    Durata <InfoTooltip term="fatica_stimata" />
                  </span>
                </th>
                <th className="pb-2.5 text-right">Fatica</th>
              </tr>
            </thead>
            <tbody>
              {terrain.climbs.map((climb, index) => {
                const demand = demands[index];
                const { rowBg, dot, dotColor } = climbRowStyle(climb.avg_gradient_pct);
                return (
                  <tr key={index} className={`border-b border-border last:border-0 ${rowBg}`}>
                    <td className="py-2.5 pr-2">
                      <div className="flex items-center gap-1.5">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${dotColor}`} aria-hidden />
                        <span className="tabular-nums text-foreground">{climb.position_km} km</span>
                      </div>
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-foreground">
                      {climb.distance_km} km
                      <span className="ml-1 text-muted">· {climb.elevation_m} m</span>
                    </td>
                    <td className="py-2.5 text-right tabular-nums">
                      <span className={dot}>{climb.avg_gradient_pct}%</span>
                      <span className="ml-1 text-muted">· {climb.category ?? "—"}</span>
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-secondary">
                      {formatDuration(demand?.est_duration_s ?? null)}
                    </td>
                    <td className="py-2.5 text-right">
                      {demand ? (
                        <FatigueChip level={demand.fatigue_level} />
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
      )}

      <div className="mt-7">
        <h3 className="flex items-center gap-1.5 text-base font-medium text-foreground">
          Limitatori per questa gara
          <InfoTooltip term="limitatore" />
        </h3>
        {limiters.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            Nessun limitatore rilevato, oppure dati insufficienti per il
            confronto.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border border-y border-border">
            {limiters.map((limiter, index) => (
              <LimiterRow key={index} limiter={limiter} />
            ))}
          </ul>
        )}
      </div>

      <details className="mt-5 border-t border-border pt-4 text-xs text-muted">
        <summary className="min-h-10 cursor-pointer py-2 font-medium text-secondary">
          Metodo e qualità della stima
        </summary>
        <p className="pb-2 leading-5">
          Durate e fatica sono stime deterministiche costruite da CP, RPP,
          peso e CTL, non misure dirette.
          {generatedAt &&
            ` Analisi aggiornata il ${new Date(generatedAt).toLocaleDateString("it-IT")}.`}
        </p>
      </details>
    </section>
  );
}

function ClimbLegend({ hex, label }: { hex: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className="h-2 w-3.5 rounded-[3px]"
        style={{ backgroundColor: hex, opacity: 0.85 }}
        aria-hidden
      />
      {label}
    </span>
  );
}

function LimiterRow({ limiter }: { limiter: Limiter }) {
  const badge = SEVERITY_BADGE[limiter.severity];
  const lever = LEVER_LABELS[limiter.training_lever] ?? limiter.training_lever;
  const refs = limiter.climb_refs ?? [limiter.climb_ref];
  const reference =
    refs.length > 1 ? `salite ai km ${refs.join(", ")}` : `salita al km ${refs[0]}`;

  return (
    <li className="py-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="flex items-center gap-1.5 font-medium text-foreground">
          {limiter.name}
          {limiter.training_lever === "durability_fatigued" && (
            <InfoTooltip term="durabilita" />
          )}
        </p>
        <span className={`shrink-0 text-xs ${badge.classes}`}>
          severità {badge.label}
        </span>
      </div>
      <p className="mt-1 text-sm leading-6 text-secondary">
        {limiter.evidence} · {reference}
      </p>
      <p className="mt-2 text-sm text-foreground">
        <span className="text-muted">Leva di lavoro:</span> {lever}
        {limiter.workout_library_refs.length > 0 && (
          <span className="ml-1 text-xs text-faint">
            ({limiter.workout_library_refs.join(" · ")})
          </span>
        )}
      </p>
    </li>
  );
}
