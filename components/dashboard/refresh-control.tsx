"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Undo2 } from "lucide-react";

import { cn } from "@/lib/utils";

export type DataStatus = "fresh" | "stale" | "syncing" | "error";

type ErrorKind = "reconnect" | "retry";

const STATUS_DOT: Record<DataStatus, string> = {
  fresh: "bg-ready-go",
  stale: "bg-ready-modify",
  syncing: "bg-brand",
  error: "bg-ready-skip",
};

const STATUS_TEXT: Record<DataStatus, string> = {
  fresh: "text-ready-go",
  stale: "text-ready-modify",
  syncing: "text-brand",
  error: "text-ready-skip",
};

const BUTTON_CLASSES: Record<DataStatus, string> = {
  fresh:
    "border-transparent bg-gradient-to-r from-brand to-brand-hover text-white shadow-[0_10px_26px_rgba(91,141,239,0.3)]",
  stale:
    "border-transparent bg-gradient-to-r from-ready-modify to-[#ecb957] text-[#1a1206] shadow-[0_10px_26px_rgba(224,168,62,0.3)]",
  syncing: "border-brand/45 bg-brand-dim text-brand cursor-default",
  error:
    "border-transparent bg-gradient-to-r from-ready-skip to-[#e07c72] text-white shadow-[0_10px_26px_rgba(217,102,91,0.32)]",
};

/** "1 g fa · ieri 09:10", "oggi 14:32", "adesso"… — solo lato client (fuso/locale). */
function formatTimestamp(iso: string | null): string {
  if (!iso) return "mai sincronizzato";
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const time = date.toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (diffMs < 2 * 60 * 1000) return "adesso";

  const isSameDay = date.toDateString() === now.toDateString();
  if (isSameDay) return `oggi ${time}`;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return `ieri ${time}`;
  }

  const day = date.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
  return `${day} · ${time}`;
}

export function RefreshControl({
  lastFetchedAt,
  initialStatus,
}: {
  lastFetchedAt: string | null;
  initialStatus: "fresh" | "stale";
}) {
  const router = useRouter();
  const [status, setStatus] = useState<DataStatus>(initialStatus);
  const [errorKind, setErrorKind] = useState<ErrorKind | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [timestamp, setTimestamp] = useState<string | null>(null);

  // Riallinea allo stato calcolato dal server dopo un router.refresh(),
  // ma non durante una sincronizzazione in corso.
  useEffect(() => {
    setStatus((current) => (current === "syncing" ? current : initialStatus));
  }, [initialStatus]);

  useEffect(() => {
    setTimestamp(
      status === "syncing"
        ? "in corso…"
        : status === "error"
          ? "sync fallita"
          : formatTimestamp(lastFetchedAt)
    );
  }, [status, lastFetchedAt]);

  async function handleRefresh() {
    if (status === "syncing") return;
    setStatus("syncing");
    setErrorKind(null);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/sync/intervals", { method: "POST" });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
        message?: string;
      } | null;

      if (!response.ok) {
        setStatus("error");
        setErrorMessage(body?.message ?? "Sincronizzazione fallita, riprova");
        setErrorKind(
          body?.error === "intervals_unauthorized" || body?.error === "not_connected"
            ? "reconnect"
            : "retry"
        );
        return;
      }

      setStatus("fresh");
      router.refresh();
    } catch {
      setStatus("error");
      setErrorKind("retry");
      setErrorMessage("Errore di rete, riprova");
    }
  }

  function handleClick() {
    if (status === "error" && errorKind === "reconnect") {
      router.push("/connect");
      return;
    }
    void handleRefresh();
  }

  const label =
    status === "syncing"
      ? "Sincronizzo…"
      : status === "error"
        ? errorKind === "reconnect"
          ? "Riconnetti Intervals.icu"
          : "Riprova"
        : "Aggiorna dati";

  return (
    <div id="tour-refresh">
      <div className="flex items-center justify-end gap-1.5 text-[11.5px]">
        <span className={cn("h-[7px] w-[7px] rounded-full", STATUS_DOT[status])} />
        <span className={STATUS_TEXT[status]}>{timestamp ?? " "}</span>
      </div>

      <button
        type="button"
        onClick={handleClick}
        disabled={status === "syncing"}
        className={cn(
          "mt-2.5 flex w-full items-center justify-center gap-2.5 rounded-[15px] border px-4 py-3.5 text-[14.5px] font-bold transition-opacity",
          BUTTON_CLASSES[status]
        )}
      >
        {status === "syncing" ? (
          <RefreshCw className="h-4 w-4 animate-spin" aria-hidden />
        ) : status === "error" && errorKind === "reconnect" ? (
          <Undo2 className="h-4 w-4" aria-hidden />
        ) : (
          <RefreshCw className="h-4 w-4" aria-hidden />
        )}
        {label}
      </button>

      {status === "error" && errorMessage && (
        <p className="mt-2 flex items-center gap-2 text-xs text-ready-skip">
          ⚠ {errorMessage}
        </p>
      )}
    </div>
  );
}
