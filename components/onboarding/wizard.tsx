"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  emptyDossierForm,
  formToPatch,
  LAST_STEP,
  STEP_LABELS,
  type DossierForm,
} from "@/lib/onboarding/dossier";

import {
  DossierEquipment,
  DossierPageA,
  DossierPageB,
  type DossierUpdater,
} from "./dossier-fields";

/**
 * Wizard di onboarding (PRD §12.1, step 3→7). Una schermata per step, progress
 * bar in cima, salvataggio su DB ad ogni avanzamento (chiudere a metà non
 * perde dati). Step 1 (account) e 2 (Intervals) sono già fatti prima di qui.
 */

/** Messaggio educativo §12.3 — trascritto ESATTO dal PRD. */
const EDU_MESSAGE =
  "Più dati hai su Intervals.icu, più il coach sarà preciso. Con soli dati base possiamo creare un piano prudente. Con potenza, frequenza cardiaca, HRV, sonno e storico possiamo adattare meglio carico, recupero e intensità.";

export function OnboardingWizard({
  initialForm,
  initialStep,
  initialConsent,
}: {
  initialForm: DossierForm;
  initialStep: number;
  initialConsent: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState(initialStep);
  const [form, setForm] = useState<DossierForm>(initialForm ?? emptyDossierForm());
  const [consent, setConsent] = useState(initialConsent);
  const [dossierPage, setDossierPage] = useState<"A" | "B">("A");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update: DossierUpdater = (key, value) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function persist(payload: Record<string, unknown>): Promise<boolean> {
    setError(null);
    const res = await fetch("/api/onboarding/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => null);
    if (!res || !res.ok) {
      setError("Salvataggio fallito, riprova");
      return false;
    }
    return true;
  }

  /** Salva e passa allo step successivo. */
  async function advance(payload: Record<string, unknown>, nextStep: number) {
    setSaving(true);
    const ok = await persist({ ...payload, step: nextStep });
    setSaving(false);
    if (ok) setStep(nextStep);
  }

  // --- Step 7: prima analisi (auto) ------------------------------------------
  const analysisStarted = useRef(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (step !== 7 || analysisStarted.current) return;
    analysisStarted.current = true;

    (async () => {
      // Best-effort: sync + build profilo. Se falliscono, l'utente entra
      // comunque in dashboard (dove ha "Aggiorna dati" / "Aggiorna profilo").
      await fetch("/api/sync/intervals", { method: "POST" }).catch(() => null);
      await fetch("/api/profile/build", { method: "POST" }).catch(() => null);

      const ok = await persist({ complete: true, step: 7 });
      if (!ok) {
        setAnalysisError(
          "Non sono riuscito a completare l'onboarding, riprova."
        );
        analysisStarted.current = false; // consente un retry manuale
        return;
      }
      router.push("/dashboard");
      router.refresh();
    })();
  }, [step, attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  const progressPct = Math.round((step / LAST_STEP) * 100);

  return (
    <div className="flex w-full flex-col gap-8">
      {/* Intestazione + progress bar */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-1.5">
          <svg width="14" height="14" viewBox="0 0 58 58" fill="none" aria-hidden>
            <circle
              cx="29" cy="29" r="22"
              stroke="url(#obLmk)"
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray="104 34"
              transform="rotate(-90 29 29)"
            />
            <defs>
              <linearGradient id="obLmk" x1="0" y1="0" x2="58" y2="58">
                <stop offset="0%" stopColor="#5b8def" />
                <stop offset="100%" stopColor="#7fc8c0" />
              </linearGradient>
            </defs>
          </svg>
          <span className="font-serif text-[13px] tracking-[0.05em] text-secondary">
            Limina
          </span>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-[0.16em] text-muted">
            <span>{STEP_LABELS[step]}</span>
            <span>Passo {step} di {LAST_STEP}</span>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-brand transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-ready-skip">{error}</p>}

      {/* Step 3 — Consenso privacy */}
      {step === 3 && (
        <section className="flex flex-col gap-6">
          <h1 className="font-serif text-[28px] font-medium leading-tight text-foreground">
            Consenso privacy
          </h1>
          <p className="text-sm leading-relaxed text-secondary">
            Tratteremo i tuoi dati di allenamento e benessere per generare piani
            personalizzati. Vedi la privacy policy.
          </p>
          <label className="flex items-start gap-3 rounded-[18px] border border-border bg-surface p-4 text-sm text-secondary">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-brand"
            />
            <span>
              Acconsento al trattamento dei miei dati di allenamento e benessere
              per generare piani personalizzati.
            </span>
          </label>
          <div className="flex justify-end">
            <Button
              disabled={!consent || saving}
              onClick={() => void advance({ consent: true }, 4)}
            >
              {saving ? "Salvo…" : "Avanti"}
            </Button>
          </div>
        </section>
      )}

      {/* Step 4 — Messaggio educativo (§12.3) */}
      {step === 4 && (
        <section className="flex flex-col gap-6">
          <h1 className="font-serif text-[28px] font-medium leading-tight text-foreground">
            Come funziona
          </h1>
          <div className="rounded-[18px] border border-l-[3px] border-border border-l-brand bg-surface p-5 text-sm leading-relaxed text-secondary">
            {EDU_MESSAGE}
          </div>
          <div className="flex justify-end">
            <Button disabled={saving} onClick={() => void advance({}, 5)}>
              {saving ? "Salvo…" : "Capito, andiamo avanti"}
            </Button>
          </div>
        </section>
      )}

      {/* Step 5 — Dossier (pagina A e B) */}
      {step === 5 && (
        <section className="flex flex-col gap-6">
          <h1 className="font-serif text-[28px] font-medium leading-tight text-foreground">
            Dossier atleta
          </h1>
          {dossierPage === "A" ? (
            <>
              <DossierPageA form={form} update={update} />
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(4)}>
                  Indietro
                </Button>
                <Button
                  disabled={form.nome.trim() === ""}
                  onClick={() => setDossierPage("B")}
                >
                  Avanti
                </Button>
              </div>
              {form.nome.trim() === "" && (
                <p className="text-right text-xs text-muted">
                  Il nome è l&apos;unico campo obbligatorio.
                </p>
              )}
            </>
          ) : (
            <>
              <DossierPageB form={form} update={update} />
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setDossierPage("A")}>
                  Indietro
                </Button>
                <Button
                  disabled={saving}
                  onClick={() =>
                    void advance({ profile: formToPatch(form) }, 6)
                  }
                >
                  {saving ? "Salvo…" : "Avanti"}
                </Button>
              </div>
            </>
          )}
        </section>
      )}

      {/* Step 6 — Attrezzatura e limiti */}
      {step === 6 && (
        <section className="flex flex-col gap-6">
          <h1 className="font-serif text-[28px] font-medium leading-tight text-foreground">
            Attrezzatura e limiti
          </h1>
          <DossierEquipment form={form} update={update} />
          <div className="flex justify-between">
            <Button
              variant="outline"
              onClick={() => {
                setDossierPage("B");
                setStep(5);
              }}
            >
              Indietro
            </Button>
            <Button
              disabled={saving}
              onClick={() => void advance({ profile: formToPatch(form) }, 7)}
            >
              {saving ? "Salvo…" : "Avanti"}
            </Button>
          </div>
        </section>
      )}

      {/* Step 7 — Prima analisi */}
      {step === 7 && (
        <section className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
          {analysisError ? (
            <>
              <p className="text-sm text-ready-skip">{analysisError}</p>
              <Button
                onClick={() => {
                  setAnalysisError(null);
                  setAttempt((a) => a + 1);
                }}
              >
                Riprova
              </Button>
            </>
          ) : (
            <>
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-surface-2 border-t-brand" />
              <p className="font-serif text-xl font-medium text-foreground">
                Sto leggendo i tuoi dati…
              </p>
              <p className="text-sm text-muted">
                Sincronizzo Intervals.icu e costruisco la tua scheda atleta.
              </p>
            </>
          )}
        </section>
      )}
    </div>
  );
}
