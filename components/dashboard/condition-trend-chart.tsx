"use client";

import { useMemo, useState } from "react";

import type { WellnessDay } from "@/lib/intervals-client";

type Point = {
  label: string;
  ctl: number;
  atl: number;
  tsb: number;
};

const CHART_COLORS = {
  ctl: "#6EA2FF",
  atl: "#F58A7C",
  tsb: "#F2C14E",
  grid: "color-mix(in srgb, var(--foreground) 10%, transparent)",
  axis: "color-mix(in srgb, var(--foreground) 16%, transparent)",
};

function formatWeekLabel(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "short",
  });
}

function toY(value: number, min: number, max: number) {
  if (max === min) return 72;
  return 124 - ((value - min) / (max - min)) * 98;
}

function smoothPath(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) return "";
  if (points.length === 1) return `M${points[0].x},${points[0].y}`;

  return points
    .map((point, index) => {
      if (index === 0) return `M${point.x},${point.y}`;
      const previous = points[index - 1];
      const next = points[index + 1] ?? point;
      const beforePrevious = points[index - 2] ?? previous;
      const cp1x = previous.x + (point.x - beforePrevious.x) / 6;
      const cp1y = previous.y + (point.y - beforePrevious.y) / 6;
      const cp2x = point.x - (next.x - previous.x) / 6;
      const cp2y = point.y - (next.y - previous.y) / 6;
      return `C${cp1x},${cp1y} ${cp2x},${cp2y} ${point.x},${point.y}`;
    })
    .join(" ");
}

export function ConditionTrendChart({ days }: { days: WellnessDay[] }) {
  const points = useMemo<Point[]>(() => {
    const usable = days
      .filter((day) => day.ctl != null && day.atl != null)
      .slice(-42);
    const buckets = usable.filter((_, index) => index % 7 === 0 || index === usable.length - 1);
    return buckets.slice(-6).map((day) => {
      const ctl = day.ctl ?? 0;
      const atl = day.atl ?? 0;
      return {
        label: formatWeekLabel(day.date),
        ctl,
        atl,
        tsb: ctl - atl,
      };
    });
  }, [days]);

  const [selected, setSelected] = useState(Math.max(0, points.length - 1));

  if (points.length < 2) {
    return null;
  }

  const values = points.flatMap((point) => [point.ctl, point.atl, point.tsb]);
  const min = Math.min(...values) - 4;
  const max = Math.max(...values) + 4;
  const xs = points.map((_, index) => 20 + (index * 300) / (points.length - 1));
  const ctlPoints = points.map((point, index) => ({
    x: xs[index],
    y: toY(point.ctl, min, max),
  }));
  const atlPoints = points.map((point, index) => ({
    x: xs[index],
    y: toY(point.atl, min, max),
  }));
  const tsbPoints = points.map((point, index) => ({
    x: xs[index],
    y: toY(point.tsb, min, max),
  }));
  const selectedPoint = points[selected] ?? points.at(-1)!;
  const selectedX = xs[selected] ?? xs.at(-1)!;
  const selectedCtlY = ctlPoints[selected]?.y ?? ctlPoints.at(-1)!.y;
  const selectedAtlY = atlPoints[selected]?.y ?? atlPoints.at(-1)!.y;
  const selectedTsbY = tsbPoints[selected]?.y ?? tsbPoints.at(-1)!.y;

  return (
    <section className="aurora-glass rounded-[28px] border-border bg-surface p-5">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <p className="font-body text-[11px] font-semibold uppercase tracking-[0.14em] text-accent2">
            Andamento · 6 wk
          </p>
          <h2 className="font-display mt-1 text-[21px] font-semibold leading-tight text-foreground">
            Forma, fatica e freschezza
          </h2>
        </div>
        <span className="font-body hidden text-[10px] text-faint sm:inline">
          passa o tocca per esplorare
        </span>
      </div>

      <div className="relative">
        <div
          className="absolute top-2 z-10 -translate-x-1/2 rounded-full border border-border bg-surface/95 px-2.5 py-1 shadow-lg backdrop-blur-xl"
          style={{ left: `${(selectedX / 340) * 100}%` }}
        >
          <div className="font-display flex items-center gap-2 text-[13px] font-semibold leading-none tabular-nums">
            <span style={{ color: CHART_COLORS.ctl }}>{Math.round(selectedPoint.ctl)}</span>
            <span style={{ color: CHART_COLORS.atl }}>
              {Math.round(selectedPoint.atl)}
            </span>
            <span style={{ color: CHART_COLORS.tsb }}>
              {selectedPoint.tsb > 0 ? "+" : ""}
              {Math.round(selectedPoint.tsb)}
            </span>
          </div>
        </div>

        <svg viewBox="0 0 340 150" className="mt-3 block w-full">
          <defs>
            <linearGradient id="auroraCtlArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_COLORS.ctl} stopOpacity="0.26" />
              <stop offset="55%" stopColor={CHART_COLORS.ctl} stopOpacity="0.08" />
              <stop offset="100%" stopColor={CHART_COLORS.ctl} stopOpacity="0" />
            </linearGradient>
          </defs>
          <line x1="20" y1="130" x2="320" y2="130" stroke={CHART_COLORS.axis} />
          {[40, 80, 120].map((y) => (
            <line
              key={y}
              x1="20"
              y1={y}
              x2="320"
              y2={y}
              stroke={CHART_COLORS.grid}
            />
          ))}
          <path
            d={`${smoothPath(ctlPoints)} L320,130 L20,130 Z`}
            fill="url(#auroraCtlArea)"
          />
          <path
            d={smoothPath(tsbPoints)}
            fill="none"
            stroke={CHART_COLORS.tsb}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.2"
          />
          <path
            d={smoothPath(atlPoints)}
            fill="none"
            stroke={CHART_COLORS.atl}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.2"
          />
          <path
            d={smoothPath(ctlPoints)}
            fill="none"
            stroke={CHART_COLORS.ctl}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.8"
          />
          <line
            x1={selectedX}
            y1="18"
            x2={selectedX}
            y2="130"
            stroke="color-mix(in srgb, var(--foreground) 30%, transparent)"
            strokeDasharray="3 3"
          />
          <circle cx={selectedX} cy={selectedCtlY} r="4.2" fill={CHART_COLORS.ctl} stroke="var(--bg-surface)" strokeWidth="2" />
          <circle cx={selectedX} cy={selectedAtlY} r="4.2" fill={CHART_COLORS.atl} stroke="var(--bg-surface)" strokeWidth="2" />
          <circle cx={selectedX} cy={selectedTsbY} r="4.2" fill={CHART_COLORS.tsb} stroke="var(--bg-surface)" strokeWidth="2" />
          {points.map((point, index) => (
            <rect
              key={point.label}
              x={xs[index] - 26}
              y="14"
              width="52"
              height="116"
              fill="transparent"
              className="cursor-pointer"
              onClick={() => setSelected(index)}
              onMouseEnter={() => setSelected(index)}
            />
          ))}
        </svg>
      </div>

      <div className="font-body mt-2 flex justify-between px-3 text-[9.5px] font-medium text-muted">
        {points.map((point) => (
          <span key={point.label}>{point.label}</span>
        ))}
      </div>
      <div className="font-body mt-4 flex flex-wrap gap-4 text-[11px] font-semibold text-secondary">
        <span className="inline-flex items-center gap-2">
          <span className="h-1 w-4 rounded-full" style={{ backgroundColor: CHART_COLORS.ctl }} />
          Forma
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-1 w-4 rounded-full" style={{ backgroundColor: CHART_COLORS.atl }} />
          Fatica
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-1 w-4 rounded-full" style={{ backgroundColor: CHART_COLORS.tsb }} />
          Freschezza
        </span>
      </div>
    </section>
  );
}
