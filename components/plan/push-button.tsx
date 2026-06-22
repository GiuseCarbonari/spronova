"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import type { IntervalsWorkoutEvent } from "@/lib/planner/intervals-workout-format";

interface PreviewResponse {
  success: boolean;
  message?: string;
  events?: IntervalsWorkoutEvent[];
}

interface PushError {
  uid: string;
  name: string;
  message: string;
}

interface CommitResponse {
  success: boolean;
  message?: string;
  push_errors?: PushError[];
  reconnect_required?: boolean;
}

function formatEventDate(startDateLocal: string): string {
  return new Date(startDateLocal).toLocaleDateString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function typeLabel(type: IntervalsWorkoutEvent["type"]): string {
  if (type === "MountainBikeRide") return "MTB";
  if (type === "VirtualRide") return "Indoor";
  return "Ciclismo";
}

function IntervalsMark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#e40046] shadow-[0_0_18px_rgba(228,0,70,0.28)] ${className}`}
      aria-hidden
    >
      <svg viewBox="0 0 32 32" className="h-7 w-7">
        <path
          d="M3 17.5 L9.5 16.8 L12.4 8.8 L16 23.5 L20.2 5.5 L23.2 18 L29 17.3"
          fill="none"
          stroke="white"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3.1"
        />
      </svg>
    </span>
  );
}

export function PushButton({
  pushedAt,
  canWriteCalendar,
}: {
  pushedAt: string | null;
  canWriteCalendar: boolean;
}) {
  const router = useRouter();
  const [events, setEvents] = useState<IntervalsWorkoutEvent[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pushErrors, setPushErrors] = useState<PushError[]>([]);
  const [success, setSuccess] = useState(false);

  async function openPreview() {
    setLoadingPreview(true);
    setError(null);
    setPushErrors([]);
    setSuccess(false);
    try {
      const response = await fetch("/api/planner/push?mode=preview", {
        method: "POST",
      });
      const body = (await response.json().catch(() => null)) as PreviewResponse | null;
      if (!response.ok || !body?.events) {
        setError(body?.message ?? "Anteprima non disponibile");
        return;
      }
      setEvents(body.events);
      setModalOpen(true);
    } catch {
      setError("Errore di rete, riprova");
    } finally {
      setLoadingPreview(false);
    }
  }

  async function commitPush() {
    setCommitting(true);
    setError(null);
    setPushErrors([]);
    try {
      const response = await fetch("/api/planner/push?mode=commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmed: true }),
      });
      const body = (await response.json().catch(() => null)) as CommitResponse | null;
      if (!response.ok || !body?.success) {
        setError(body?.message ?? "Invio non riuscito");
        setPushErrors(body?.push_errors ?? []);
        return;
      }
      setModalOpen(false);
      setSuccess(true);
      router.refresh();
    } catch {
      setError("Errore di rete, riprova");
    } finally {
      setCommitting(false);
    }
  }

  if (!canWriteCalendar) {
    return (
      <div className="flex flex-1 flex-col gap-1">
        <a
          href="/api/auth/intervals/login"
          className="flex w-full items-center justify-center gap-3 rounded-[14px] border border-[#e40046]/45 bg-[#e40046]/[0.10] px-3 py-2.5 text-left text-[12px] font-semibold text-[#b0003a] dark:text-[#ff8fb1]"
        >
          <IntervalsMark className="h-7 w-7" />
          <span className="flex min-w-0 flex-col">
            <span>Carica su Intervals</span>
            <span className="text-[9.5px] font-normal text-[#c0004a] dark:text-[#ffb8cc]">riconnetti prima</span>
          </span>
        </a>
      </div>
    );
  }

  return (
    <>
      <div id="tour-push-btn" className="flex flex-1 flex-col gap-1">
        <button
          type="button"
          onClick={() => void openPreview()}
          disabled={loadingPreview || committing}
          className="flex w-full items-center justify-center gap-3 rounded-[14px] border border-[#e40046]/55 bg-gradient-to-r from-[#e40046]/[0.24] to-[#7fc8c0]/[0.08] px-3 py-2.5 text-left text-[13.5px] font-bold text-[#8b0028] shadow-[0_14px_36px_-24px_rgba(228,0,70,0.72)] transition-opacity disabled:opacity-70 dark:text-[#ffd7e2]"
        >
          <IntervalsMark />
          <span className="flex min-w-0 flex-col">
            <span>{loadingPreview ? "Preparo anteprima..." : "Carica settimana su Intervals"}</span>
            <span className="text-[9.5px] font-normal text-[#a0003a] dark:text-[#ffb8cc]">ultimo passo: richiede conferma</span>
          </span>
        </button>
        {success && (
          <span className="text-center text-[11px] text-ready-go">
            ✓ Inviata ·{" "}
            <a
              className="underline"
              href="https://intervals.icu/calendar"
              target="_blank"
              rel="noreferrer"
            >
              Apri calendario
            </a>
          </span>
        )}
        {!modalOpen && error && (
          <span className="text-center text-[11px] text-ready-skip">{error}</span>
        )}
      </div>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-base/90 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="push-modal-title"
        >
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-border bg-surface">
            <div className="border-b p-5">
              <h2 id="push-modal-title" className="text-lg font-semibold">
                Conferma invio a Intervals.icu
              </h2>
              <p className="mt-2 text-sm text-secondary">
                Questi allenamenti verranno aggiunti al tuo calendario Intervals.icu
                e sincronizzati sul tuo dispositivo. Gli allenamenti già inviati
                per questa settimana verranno aggiornati, non duplicati.
              </p>
            </div>

            <div className="space-y-3 overflow-y-auto p-5">
              {events.map((event) => (
                <article key={event.uid} className="rounded-[11px] border border-border bg-surface-2 p-4">
                  <h3 className="font-medium">
                    {formatEventDate(event.start_date_local)} · {event.name}
                  </h3>
                  <p className="mt-1 text-xs text-muted">
                    {Math.round(event.moving_time / 60)} min · {typeLabel(event.type)}
                  </p>
                  <pre className="mt-3 whitespace-pre-wrap font-sans text-xs leading-relaxed">
                    {event.description}
                  </pre>
                </article>
              ))}

              {error && (
                <div className="rounded-[11px] border border-ready-skip-border bg-surface p-3 text-sm text-ready-skip">
                  <p>{error}</p>
                  {pushErrors.length > 0 && (
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      {pushErrors.map((pushError) => (
                        <li key={pushError.uid}>
                          {pushError.name}: {pushError.message}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t p-4">
              <Button
                variant="outline"
                onClick={() => setModalOpen(false)}
                disabled={committing}
              >
                Annulla
              </Button>
              <Button onClick={() => void commitPush()} disabled={committing}>
                {committing ? "Invio..." : "Conferma e invia"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
