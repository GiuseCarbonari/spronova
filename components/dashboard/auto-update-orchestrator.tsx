"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { RefreshControl } from "@/components/dashboard/refresh-control";

/**
 * Orchestratore auto-aggiornamento (§1+§2+§3). Client Component montato in
 * dashboard al posto del vecchio pulsante manuale.
 *
 * Catena su mount (vedi spec §Sequencing):
 *   1. RefreshControl in auto mode fa il sync dati e riporta via onSyncDone.
 *   2. commento OGGI (gated server-side)            — §1
 *   3. generate piano → legge changed_count          — §2
 *   4. build profilo                                 — §3 (ferma solo questo step)
 *   5. commento PROFILO (gated)                      — §3
 *   6. un solo router.refresh() finale.
 *
 * Anti-loop: ref guard `chainStarted` (StrictMode monta due volte e il refresh
 * finale ri-renderizza, ma il Client Component conserva il ref → la catena gira
 * una sola volta). PERCORSO NON è nella catena (decisione utente).
 */
export function AutoUpdateOrchestrator({
  lastFetchedAt,
  initialStatus,
  hasMirror,
}: {
  lastFetchedAt: string | null;
  initialStatus: "fresh" | "stale";
  hasMirror: boolean;
}) {
  const router = useRouter();
  const chainStarted = useRef(false);
  const [changedCount, setChangedCount] = useState(0);

  /** POST a una route della catena. Errori non propagati (la catena prosegue). */
  async function step(
    path: string
  ): Promise<{ ok: boolean; body: Record<string, unknown> | null }> {
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      const body = (await res.json().catch(() => null)) as Record<
        string,
        unknown
      > | null;
      return { ok: res.ok, body };
    } catch {
      return { ok: false, body: null };
    }
  }

  const onSyncDone = useCallback(
    (syncOk: boolean) => {
      // Ref guard: la catena post-sync gira una sola volta.
      if (chainStarted.current) return;
      chainStarted.current = true;

      // Sync fallito → banner errore già mostrato da RefreshControl, niente catena.
      if (!syncOk) return;

      void (async () => {
        // §1 — commento OGGI (gated server-side). Niente mirror → la route torna
        // 409 e ignoriamo silenziosamente.
        if (hasMirror) {
          await step("/api/comments/oggi");
        }

        // §2 — rigenera piano e leggi changed_count.
        const gen = await step("/api/planner/generate");
        if (gen.ok && typeof gen.body?.changed_count === "number") {
          setChangedCount(gen.body.changed_count as number);
        }

        // §3 — build profilo (ferma solo questo step su 401/409/422) + commento.
        const build = await step("/api/profile/build");
        if (build.ok) {
          await step("/api/comments/profilo");
        }

        // Un unico refresh finale: rilegge metriche + commenti aggiornati.
        router.refresh();
      })();
    },
    [hasMirror, router]
  );

  return (
    <div>
      <RefreshControl
        lastFetchedAt={lastFetchedAt}
        initialStatus={initialStatus}
        auto
        onSyncDone={onSyncDone}
      />

      {changedCount > 0 && (
        <div className="mt-3 rounded-xl border border-l-[3px] border-ready-modify-border border-l-ready-modify bg-surface px-4 py-3 text-sm text-secondary">
          Il piano è cambiato: {changedCount} sedut
          {changedCount === 1 ? "a" : "e"} modificat
          {changedCount === 1 ? "a" : "e"} — rivedi in Piano e invia a Intervals.
        </div>
      )}
    </div>
  );
}
