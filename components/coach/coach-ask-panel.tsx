"use client";

import { useState } from "react";
import { RefreshCw, Send } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Pannello "Chiedi al coach" + "Report pre-allenamento" (UI=A, sotto
 * CoachCommentOggi). Stateless: la storia vive solo in stato React.
 *
 * Stile card / stati loading-error-configured copiati da
 * components/coach/coach-comment-card.tsx.
 *
 * // ponytail: storia solo in memoria (stateless per scelta owner); il route
 * // pre-workout ricarica il piano server-side, niente prop-drilling del piano.
 */
export function CoachAskPanel() {
  const [question, setQuestion] = useState("");
  const [askedQuestion, setAskedQuestion] = useState<string | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const [report, setReport] = useState<string | null>(null);
  const [loading, setLoading] = useState<"ask" | "report" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unconfigured, setUnconfigured] = useState(false);

  async function ask() {
    const q = question.trim();
    if (q.length === 0 || loading) return;
    setLoading("ask");
    setError(null);
    try {
      const res = await fetch("/api/coach/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        throw new Error(data?.message ?? "Risposta del coach fallita");
      }
      if (data.configured === false) {
        setUnconfigured(true);
        return;
      }
      setAskedQuestion(q);
      setAnswer(data.answer ?? null);
      setQuestion("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore imprevisto");
    } finally {
      setLoading(null);
    }
  }

  async function preWorkout() {
    if (loading) return;
    setLoading("report");
    setError(null);
    try {
      const res = await fetch("/api/coach/pre-workout", { method: "POST" });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        throw new Error(data?.message ?? "Generazione del report fallita");
      }
      if (data.configured === false) {
        setUnconfigured(true);
        return;
      }
      setReport(data.report ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore imprevisto");
    } finally {
      setLoading(null);
    }
  }

  if (unconfigured) {
    return (
      <section className="space-y-3">
        <div className="text-[11px] uppercase tracking-[0.14em] text-muted">
          Chiedi al coach
        </div>
        <div className="rounded-[16px] border border-border bg-surface px-4 py-4 text-sm text-muted">
          Coach IA non disponibile (provider non configurato)
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div className="text-[11px] uppercase tracking-[0.14em] text-muted">
        Chiedi al coach
      </div>

      <div className="space-y-3">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={500}
          rows={2}
          placeholder="Es. Come affronto la seduta di oggi? Sono pronto per spingere?"
          className="w-full resize-none rounded-[16px] border border-border bg-surface px-4 py-3 text-sm text-foreground placeholder:text-faint focus:outline-none focus:ring-1 focus:ring-border"
        />
        <div className="flex gap-2">
          <Button
            onClick={ask}
            disabled={question.trim().length === 0 || loading != null}
            size="sm"
            className="flex-1"
          >
            {loading === "ask" ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" aria-hidden />
                <span className="ml-1.5">Sto pensando…</span>
              </>
            ) : (
              <>
                <Send className="h-4 w-4" aria-hidden />
                <span className="ml-1.5">Chiedi</span>
              </>
            )}
          </Button>
          <Button
            onClick={preWorkout}
            disabled={loading != null}
            variant="outline"
            size="sm"
            className="flex-1"
          >
            {loading === "report" ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" aria-hidden />
                <span className="ml-1.5">Genero…</span>
              </>
            ) : (
              "Report pre-allenamento"
            )}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-[16px] border border-ready-skip-border bg-surface px-4 py-4">
          <p className="text-sm text-ready-skip">⚠ {error}</p>
        </div>
      )}

      {answer && (
        <div className="space-y-1.5">
          {askedQuestion && (
            <p className="text-xs text-faint">«{askedQuestion}»</p>
          )}
          <div className="rounded-[16px] border border-border bg-surface px-4 py-4">
            <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
              {answer}
            </p>
          </div>
        </div>
      )}

      {report && (
        <div className="space-y-1.5">
          <p className="text-xs text-faint">Report pre-allenamento</p>
          <div className="rounded-[16px] border border-border bg-surface px-4 py-4">
            <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
              {report}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
