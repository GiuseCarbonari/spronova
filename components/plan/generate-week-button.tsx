"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

import { cn } from "@/lib/utils";

export function GenerateWeekButton({ hasPlan }: { hasPlan: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setWarning(null);
    try {
      const response = await fetch("/api/planner/generate", { method: "POST" });
      const body = (await response.json().catch(() => null)) as
        | { message?: string; warning?: string | null }
        | null;
      if (!response.ok) {
        setError(body?.message ?? "Generazione fallita");
        return;
      }
      if (body?.warning) setWarning(body.warning);
      router.refresh();
    } catch {
      setError("Errore di rete, riprova");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div id="tour-generate-btn" className="flex flex-1 flex-col gap-1">
      <button
        type="button"
        onClick={() => void handleGenerate()}
        disabled={loading}
        className={cn(
          "flex w-full items-center justify-center gap-2 rounded-[14px] border px-3 py-3 text-[13.5px] font-bold transition-colors",
          "border-brand/50 bg-brand-dim text-brand-hover",
          loading && "cursor-default opacity-70"
        )}
      >
        <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} aria-hidden />
        {loading ? "Genero…" : hasPlan ? "Rigenera" : "Genera settimana"}
      </button>
      {error && (
        <span className="text-[11px] text-ready-skip">{error}</span>
      )}
      {warning && (
        <span className="text-[11px] text-ready-modify">{warning}</span>
      )}
    </div>
  );
}
