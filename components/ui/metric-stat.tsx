"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

type MetricTone = "positive" | "neutral" | "warning" | "danger";
type MetricDirection = "up" | "down";

const toneClasses: Record<MetricTone, string> = {
  positive: "text-ready-go",
  neutral: "text-muted",
  warning: "text-ready-modify",
  danger: "text-ready-skip",
};

export function MetricStat({
  label,
  acronym,
  value,
  tooltip,
  status,
  tone = "neutral",
  direction,
  accent = false,
  footer,
  className,
}: {
  label: string;
  acronym: string;
  value: React.ReactNode;
  tooltip: string;
  status?: string;
  tone?: MetricTone;
  direction?: MetricDirection;
  accent?: boolean;
  footer?: React.ReactNode;
  className?: string;
}) {
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <div className={cn("min-w-0 px-4 py-4 sm:px-5", className)}>
      <dt className="flex items-center gap-1.5 text-xs font-semibold text-muted">
        <span>
          {label} <span className="whitespace-nowrap">({acronym})</span>
        </span>
        <button
          type="button"
          aria-label={`Cos'è ${label}`}
          aria-expanded={helpOpen}
          onClick={() => setHelpOpen((open) => !open)}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border bg-surface-2 text-[10px] font-semibold leading-none text-muted transition-colors hover:border-amber hover:text-amber focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
        >
          ?
        </button>
      </dt>

      <dd
        className={cn(
          "font-data mt-2 text-[28px] font-semibold leading-none tracking-[-0.04em]",
          accent ? "text-amber" : "text-foreground"
        )}
      >
        {value}
      </dd>

      {status && (
        <p className={cn("font-data mt-2 text-xs leading-5", toneClasses[tone])}>
          {direction === "up" && <span aria-hidden>↗ </span>}
          {direction === "down" && <span aria-hidden>↘ </span>}
          {status}
        </p>
      )}

      {helpOpen && (
        <p className="mt-3 border-t border-border pt-3 text-xs font-normal leading-relaxed text-secondary">
          {tooltip}
        </p>
      )}

      {footer}
    </div>
  );
}
