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
  // Recupero seduta saltata:
  kind?: "block" | "recover";
  source_date?: string;
  recovered?: boolean;
  blocked_reason?: string | null;
  suggested_day?: DayKey | null;
  risk_warning?: string | null;
  downgraded?: boolean;
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

  async function handleRecoverDay(sourceDate: string, _day: DayKey) {
    setLoadingDate(sourceDate);
    setError(null);
    setPreview(null);
    setShowReconnectNote(false);
    try {
      const res = await fetch("/api/planner/recover?mode=preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_date: sourceDate }),
      });
      const data = (await res.json().catch(() => null)) as PreviewResponse | null;
      if (!res.ok || !data?.success) {
        setError(data?.message ?? "Anteprima recupero non disponibile, riprova.");
        return;
      }
      setPreview({ ...data, kind: "recover" });
    } catch {
      setError("Errore di rete, riprova.");
    } finally {
      setLoadingDate(null);
    }
  }

  async function commit(body: Record<string, unknown>, url: string) {
    setCommitting(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, confirmed: true }),
      });
      const data = (await res.json().catch(() => null)) as PreviewResponse | null;
      if (!res.ok || !data?.success) {
        setError(data?.message ?? "Salvataggio non riuscito, riprova.");
        return;
      }
      if (preview?.pushed_at_before) setShowReconnectNote(true);
      setPreview(null);
      router.refresh();
    } catch {
      setError("Errore di rete, riprova.");
    } finally {
      setCommitting(false);
    }
  }

  /** Blocco giorno: applica la ridistribuzione. */
  function handleApplyBlock() {
    if (!preview?.blocked_date) return;
    void commit(
      { blocked_date: preview.blocked_date },
      "/api/planner/redistribute?mode=commit"
    );
  }

  /**
   * Recupero. `forceToday` = forza oggi ignorando il suggerimento; `downgrade` =
   * versione facile. Senza force, applica il giorno suggerito dal backend.
   */
  function handleApplyRecover(opts: { forceToday?: boolean; downgrade?: boolean } = {}) {
    if (!preview?.source_date) return;
    void commit(
      {
        source_date: preview.source_date,
        ...(opts.forceToday ? { force_date: todayDate } : {}),
        ...(opts.downgrade ? { downgrade: true } : {}),
      },
      "/api/planner/recover?mode=commit"
    );
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
          onRecoverDay={(date, day) => {
            if (loadingDate) return; // debounce
            void handleRecoverDay(date, day);
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-base/80 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="redistribute-modal-title"
        >
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl border border-border bg-surface shadow-2xl">
            <div className="border-b p-5">
              <h2
                id="redistribute-modal-title"
                className="text-lg font-semibold"
              >
                {preview.kind === "recover"
                  ? "Recupera la seduta saltata"
                  : "Ecco come cambia la settimana"}
              </h2>
              {preview.kind === "recover" ? (
                <p className="mt-1 text-sm text-secondary">
                  Seduta saltata di{" "}
                  <strong>
                    {DAY_LABELS[
                      sessions.find((s) => s.date === preview.source_date)?.day ?? ""
                    ] ?? preview.source_date}
                  </strong>
                  {preview.suggested_day ? (
                    <>
                      . Giorno consigliato:{" "}
                      <strong>{DAY_LABELS[preview.suggested_day]}</strong>.
                    </>
                  ) : (
                    "."
                  )}
                </p>
              ) : (
                <p className="mt-1 text-sm text-secondary">
                  Stai bloccando{" "}
                  <strong>
                    {DAY_LABELS[preview.blocked_day ?? ""] ??
                      preview.blocked_date}
                  </strong>{" "}
                  ({preview.blocked_date}).
                </p>
              )}
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

              {preview.kind === "recover" && preview.risk_warning && (
                <div className="mt-3 rounded-[11px] border border-amber/40 bg-amber-dim p-3 text-sm text-secondary">
                  <p className="font-medium text-amber">⚠ Recuperarla oggi è rischioso</p>
                  <p className="mt-1">{preview.risk_warning}</p>
                </div>
              )}

              {error && (
                <p className="rounded-[11px] border border-ready-skip-border bg-surface p-3 text-sm text-ready-skip">
                  {error}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2 border-t p-4 sm:flex-row sm:flex-wrap sm:justify-end">
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

              {preview.kind === "recover" ? (
                <>
                  {/* Forza oggi (consapevole) — solo se oggi è rischioso */}
                  {preview.risk_warning && (
                    <>
                      <Button
                        variant="outline"
                        onClick={() => handleApplyRecover({ forceToday: true, downgrade: true })}
                        disabled={committing}
                      >
                        Oggi, versione facile
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => handleApplyRecover({ forceToday: true })}
                        disabled={committing}
                      >
                        Oggi comunque
                      </Button>
                    </>
                  )}
                  {/* Azione consigliata: applica il giorno suggerito dal backend */}
                  <Button
                    onClick={() => handleApplyRecover()}
                    disabled={committing}
                  >
                    {committing
                      ? "Applico…"
                      : preview.suggested_day
                        ? `Sposta a ${DAY_LABELS[preview.suggested_day]}`
                        : "Applica"}
                  </Button>
                </>
              ) : (
                <Button onClick={handleApplyBlock} disabled={committing}>
                  {committing ? "Applico…" : "Applica"}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
