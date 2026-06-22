import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

export function MetricCard({
  label,
  acronym,
  value,
  delta,
  deltaClassName,
  deltaDirection = "flat",
  deltaTone = "neutral",
  tooltip,
  open,
  onToggle,
  footer,
}: {
  label: string;
  acronym: string;
  value: React.ReactNode;
  delta?: React.ReactNode;
  deltaClassName?: string;
  deltaDirection?: "up" | "down" | "flat";
  deltaTone?: "positive" | "negative" | "neutral";
  tooltip: string;
  open: boolean;
  onToggle: () => void;
  footer?: React.ReactNode;
}) {
  const DeltaIcon =
    deltaDirection === "up"
      ? ArrowUpRight
      : deltaDirection === "down"
        ? ArrowDownRight
        : Minus;
  const deltaToneClass =
    deltaTone === "positive"
      ? "border-ready-go-border bg-ready-go/[0.12] text-ready-go"
      : deltaTone === "negative"
        ? "border-ready-skip-border bg-ready-skip/[0.12] text-ready-skip"
        : "border-border bg-surface-2 text-secondary";

  return (
    <div
      className={`relative rounded-metric border p-[14px] transition-colors ${
        open ? "border-accent2/40" : "border-border"
      } bg-surface`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[12px] leading-tight text-secondary">{label}</div>
          <div className="mt-0.5 text-[10px] uppercase tracking-[0.12em] text-muted">
            {acronym}
          </div>
        </div>
        <button
          type="button"
          aria-label={`Cos'è ${label}`}
          aria-expanded={open}
          onClick={onToggle}
          className="flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full border border-border font-serif text-[11px] text-secondary transition-colors hover:border-accent2/60 hover:text-accent2-hover"
        >
          i
        </button>
      </div>

      <div className="mt-2.5 flex items-center gap-2">
        <span className="font-serif text-[28px] leading-none tabular-nums text-foreground">
          {value}
        </span>
        {delta != null && (
          <span
            className={`inline-flex min-w-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10.5px] font-semibold leading-none ${deltaClassName ?? ""} ${deltaToneClass}`}
          >
            <DeltaIcon className="h-3 w-3 shrink-0" aria-hidden />
            <span className="truncate">{delta}</span>
          </span>
        )}
      </div>

      {open && (
        <div className="mt-2.5 rounded-xl border border-border bg-base p-[11px]">
          <p className="text-[11.5px] leading-relaxed text-secondary">{tooltip}</p>
          {footer}
        </div>
      )}
    </div>
  );
}
