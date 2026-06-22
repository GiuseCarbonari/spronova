"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { WeekGrid } from "@/components/plan/week-grid";
import type { BuiltSession } from "@/lib/planner/build-week";
import type { RedistributeChange } from "@/lib/planner/redistribute";
import type { DayKey } from "@/lib/planner/session-selector";

/**
 * Client component che avvolge WeekGrid con il flusso di ridistribuzione:
 *   1. Click "Non posso questo giorno" → preview API
 *   2. Modale con anteprima cambiamenti → "Applica"
 *   3. Commit API → router.refresh()
 */

interface PreviewResponse {
  success: boolean;
  message?: string;
  blocked_date?: string;
  blocked_day?: DayKey;
  changes?: RedistributeChange[];
  new_week?: BuiltSession[];
  volume_reduced?: boolean;
  explanation?: string;
  pushed_at_before?: string | null;
}

const DAY_LABELS: Record<string, string> = {
  mon: "lunedì",
  tue: "martedì",
  wed: "mercoledì",
  thu: "giovedì",
  fri: "venerdì",
  sat: "sabato",
  sun: "domenica",
};

function changeIcon(
  action: RedistributeChange["action"],
  isHard?: boolean
): string {
  if (action === "moved") return "✓";
  if (action === "dropped" && isHard) return "!";
  return "✓";
}

function changeLabel(
  change: RedistributeChange,
  sessions: BuiltSession[]
): string {
  const session = sessions.find((s) => s.day === change.day);
  const name = session?.library_id ?? "Sessione";
  const isHard = session?.is_hard ?? false;

  if (change.action === "moved" && change.to) {
    return `${name} spostata da ${DAY_LABELS[change.from ?? change.day] ?? change.from} a ${DAY_LABELS[change.to] ?? change.to}.`;
  }
  if (change.action === "dropped") {
    if (isHard) {
      return `Seduta dura (${name}) di ${DAY_LABELS[change.day] ?? change.day} non recuperabile: nessuno spazio con recupero 48h.`;
    }
    return `Recupero di ${DAY_LABELS[change.day] ?? change.day} rimosso (non necessario).`;
  }
  return change.reason;
}

export function RedistributeSection({
  sessions,
  weekStart,
  todayKey,
  todayReadiness,
  pushedAt,
  todayDate,
  completionByDate,
}: {
  sessions: BuiltSession[];
  weekStart: string;
  todayKey: DayKey;
  todayReadiness: string | null;
  pushedAt: string | null;
  todayDate: string;
  completionByDate?: Record<
    string,
    { percent: number; label: string; source: "intervals" | "duration" }
  >;
}) {
  const router = useRouter();

  const [loadingDate, setLoadingDate] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showReconnectNote, setShowReconnectNote] = useState(false);

  async function handleBlockDay(date: string, _day: DayKey) {
    setLoadingDate(date);
    setError(null);
    setPreview(null);
    setShowReconnectNote(false);
    try {
      const res = await fetch("/api/planner/redistribute?mode=preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocked_date: date }),
      });
      const data = (await res.json().catch(() => null)) as PreviewResponse | null;
      if (!res.ok || !data?.success) {
        setError(data?.message ?? "Anteprima non disponibile, riprova.");
        return;
      }
      setPreview(data);
    } catch {
      setError("Errore di rete, riprova.");
    } finally {
      setLoadingDate(null);
    }
  }

  async function handleApply() {
    if (!preview?.blocked_date) return;
    setCommitting(true);
    setError(null);
    try {
      const res = await fetch("/api/planner/redistribute?mode=commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blocked_date: preview.blocked_date,
          confirmed: true,
        }),
      });
      const data = (await res.json().catch(() => null)) as PreviewResponse | null;
      if (!res.ok || !data?.success) {
        setError(data?.message ?? "Salvataggio non riuscito, riprova.");
        return;
      }
      // Se la settimana era già stata pushata, avvisa di aggiornare Intervals.
      if (preview.pushed_at_before) setShowReconnectNote(true);
      setPreview(null);
      router.refresh();
    } catch {
      setError("Errore di rete, riprova.");
    } finally {
      setCommitting(false);
    }
  }

  return (
    <>
      <div id="tour-week-grid">
        <WeekGrid
          sessions={sessions}
          todayKey={todayKey}
          todayReadiness={todayReadiness}
          pushedAt={pushedAt}
          lockedBefore={todayDate}
          completionByDate={completionByDate}
          onBlockDay={(date, day) => {
            if (loadingDate) return; // debounce
            void handleBlockDay(date, day);
          }}
        />
      </div>

      {loadingDate && (
        <p className="text-sm text-muted">
          Calcolo ridistribuzione per {loadingDate}…
        </p>
      )}

      {!preview && error && (
        <p className="rounded-[11px] border border-ready-skip-border bg-surface p-3 text-sm text-ready-skip">
          {error}
        </p>
      )}

      {showReconnectNote && (
        <p className="rounded-[11px] border border-border bg-amber-dim p-3 text-sm text-secondary">
          La settimana è stata aggiornata. Ricorda di aggiornare su Intervals.icu
          con il bottone «Aggiorna su Intervals.icu».
        </p>
      )}

      {/* Modale di anteprima / conferma */}
      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-base/90 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="redistribute-modal-title"
        >
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl border border-border bg-surface">
            <div className="border-b p-5">
              <h2
                id="redistribute-modal-title"
                className="text-lg font-semibold"
              >
                Ecco come cambia la settimana
              </h2>
              <p className="mt-1 text-sm text-secondary">
                Stai bloccando{" "}
                <strong>
                  {DAY_LABELS[preview.blocked_day ?? ""] ??
                    preview.blocked_date}
                </strong>{" "}
                ({preview.blocked_date}).
              </p>
            </div>

            <div className="space-y-2 overflow-y-auto p-5">
              {(preview.changes ?? []).map((c, i) => {
                const origSessions = sessions;
                const isHard =
                  origSessions.find((s) => s.day === c.day)?.is_hard ?? false;
                const icon = changeIcon(c.action, isHard);
                const label = changeLabel(c, origSessions);
                return (
                  <p
                    key={i}
                    className={`text-sm ${c.action === "dropped" && isHard ? "text-amber" : "text-foreground"}`}
                  >
                    {icon} {label}
                  </p>
                );
              })}

              {preview.volume_reduced && (
                <div className="mt-3 rounded-[11px] border border-border bg-amber-dim p-3 text-sm text-secondary">
                  <p className="font-medium">
                    Attenzione: questa settimana avrà meno sedute dure del pianificato.
                  </p>
                  <p className="mt-1">
                    Non c&apos;era spazio per recuperarla rispettando il riposo
                    minimo di 48h. Va bene così — ridurre il carico è la scelta
                    corretta, non un fallimento.
                  </p>
                </div>
              )}

              {error && (
                <p className="rounded-[11px] border border-ready-skip-border bg-surface p-3 text-sm text-ready-skip">
                  {error}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t p-4">
              <Button
                variant="outline"
                onClick={() => {
                  setPreview(null);
                  setError(null);
                }}
                disabled={committing}
              >
                Annulla
              </Button>
              <Button
                onClick={() => void handleApply()}
                disabled={committing}
              >
                {committing ? "Applico…" : "Applica"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
