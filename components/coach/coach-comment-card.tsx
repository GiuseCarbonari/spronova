"use client";

import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CoachCommentCardProps {
  section: "oggi" | "profilo" | "percorso";
  comment: string | null;
  generatedAt: string | null;
  loading: boolean;
  error: string | null;
  configured: boolean;
  /** False quando il commento è già di oggi (gating §4): nasconde Rigenera/Genera. */
  canRegenerate?: boolean;
  onRegenerate: () => Promise<void>;
}

/** Formatta timestamp AI comment: "Generato oggi alle 10:45" o "Generato ieri" */
function formatAITimestamp(iso: string | null): string {
  if (!iso) return "mai generato";
  const date = new Date(iso);
  const now = new Date();
  const isSameDay = date.toDateString() === now.toDateString();
  if (isSameDay) {
    const time = date.toLocaleTimeString("it-IT", {
      hour: "2-digit",
      minute: "2-digit",
    });
    return `Generato oggi alle ${time}`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return "Generato ieri";
  }

  const day = date.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
  return `Generato ${day}`;
}

export function CoachCommentCard({
  section,
  comment,
  generatedAt,
  loading,
  error,
  configured,
  canRegenerate = true,
  onRegenerate,
}: CoachCommentCardProps) {
  if (!configured) {
    return (
      <div className="rounded-[16px] border border-border bg-surface px-4 py-4 text-sm text-muted">
        Commenti IA non disponibili (provider non configurato)
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3">
        <div className="rounded-[16px] border border-ready-skip-border bg-surface px-4 py-4">
          <p className="text-sm text-ready-skip">⚠ {error}</p>
        </div>
        <Button
          onClick={onRegenerate}
          disabled={loading}
          variant="outline"
          size="sm"
          className="w-full"
        >
          {loading ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" aria-hidden />
              Generazione in corso…
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4" aria-hidden />
              Riprova
            </>
          )}
        </Button>
      </div>
    );
  }

  if (!comment) {
    return (
      <div className="space-y-3">
        <div className="rounded-[16px] border border-border bg-surface px-4 py-4 text-center text-sm text-muted">
          Nessun commento ancora
        </div>
        {canRegenerate && (
          <Button
            onClick={onRegenerate}
            disabled={loading}
            variant="outline"
            size="sm"
            className="w-full"
          >
            {loading ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" aria-hidden />
                Generazione in corso…
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" aria-hidden />
                Genera commento
              </>
            )}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-[16px] border border-border bg-surface px-4 py-4">
        <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
          {comment}
        </p>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-faint">{formatAITimestamp(generatedAt)}</span>
        {canRegenerate && (
          <Button
            onClick={onRegenerate}
            disabled={loading}
            variant="ghost"
            size="sm"
          >
            {loading ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" aria-hidden />
                <span className="ml-1.5">Generazione…</span>
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" aria-hidden />
                <span className="ml-1.5">Rigenera</span>
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
