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
  StepAttrezzatura,
  StepChiSei,
  StepFisiologia,
  StepObiettivi,
  StepSalute,
  StepSettimana,
  type DossierUpdater,
} from "./dossier-fields";

/**
 * Wizard di onboarding (PRD §12.1, step 3→11). Un argomento per step,
 * salvataggio su DB ad ogni avanzamento così chiudere a metà non perde dati.
 * Step 1 (account) e 2 (Intervals) sono già fatti prima di qui.
 */

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

  async function advance(payload: Record<string, unknown>, nextStep: number) {
    setSaving(true);
    const ok = await persist({ ...payload, step: nextStep });
    setSaving(false);
    if (ok) setStep(nextStep);
  }

  // --- Step 11: prima analisi (auto) -----------------------------------------
  const analysisStarted = useRef(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (step !== 11 || analysisStarted.current) return;
    analysisStarted.current = true;

    (async () => {
      await fetch("/api/sync/intervals", { method: "POST" }).catch(() => null);
      await fetch("/api/profile/build", { method: "POST" }).catch(() => null);

      const ok = await persist({ complete: true, step: 11 });
      if (!ok) {
        setAnalysisError("Non sono riuscito a completare l'onboarding, riprova.");
        analysisStarted.current = false;
        return;
      }
      router.push("/dashboard");
      router.refresh();
    })();
  }, [step, attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  const progressPct = Math.round((step / LAST_STEP) * 100);

  const canAdvanceStep5 =
    form.nome.trim() !== "" && form.sport_principali.length > 0 && form.livello_esperienza !== "";
  const canAdvanceStep7 = form.disponibilita_ore_sett.trim() !== "";

  function goBack(prevStep: number) {
    setStep(prevStep);
  }

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

      {/* Step 4 — Come funziona */}
      {step === 4 && (
        <section className="flex flex-col gap-6">
          <h1 className="font-serif text-[28px] font-medium leading-tight text-foreground">
            Come funziona
          </h1>
          <div className="rounded-[18px] border border-l-[3px] border-border border-l-brand bg-surface p-5 text-sm leading-relaxed text-secondary">
            {EDU_MESSAGE}
          </div>
          <div className="rounded-[18px] border border-border bg-surface p-5 text-sm leading-relaxed text-secondary">
            <p className="mb-2 font-medium text-foreground">Nota su DFA a1</p>
            <p>
              L&apos;analisi DFA a1 — usata da Limina per stimare la tua soglia
              aerobica in modo non invasivo — non è una funzione nativa di nessun
              dispositivo. Su <strong>Garmin</strong> si attiva installando
              l&apos;app gratuita <strong>AlphaHRV</strong> (Connect IQ, di Marco
              Altini) e collegando Intervals.icu direttamente (non via Strava, che
              rimuove i dati sviluppatore). Su <strong>Wahoo, Coros, Polar</strong>{" "}
              e la maggior parte degli altri ciclocomputer non esiste ancora un
              percorso supportato. Se non hai Garmin + AlphaHRV, DFA a1 non sarà
              disponibile, ma le analisi HRV da fascia cardio e la readiness
              giornaliera restano pienamente attive.
            </p>
          </div>
          <div className="flex justify-end">
            <Button disabled={saving} onClick={() => void advance({}, 5)}>
              {saving ? "Salvo…" : "Capito, andiamo avanti"}
            </Button>
          </div>
        </section>
      )}

      {/* Step 5 — Chi sei */}
      {step === 5 && (
        <section className="flex flex-col gap-6">
          <div>
            <h1 className="font-serif text-[28px] font-medium leading-tight text-foreground">
              Chi sei?
            </h1>
            <p className="mt-2 text-sm text-muted">
              I campi con * sono obbligatori.
            </p>
          </div>
          <StepChiSei form={form} update={update} />
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => goBack(4)}>Indietro</Button>
            <Button
              disabled={!canAdvanceStep5 || saving}
              onClick={() => void advance({ profile: formToPatch(form) }, 6)}
            >
              {saving ? "Salvo…" : "Avanti"}
            </Button>
          </div>
          {!canAdvanceStep5 && (
            <p className="text-right text-xs text-muted">
              Compila nome, almeno uno sport e il livello di esperienza per continuare.
            </p>
          )}
        </section>
      )}

      {/* Step 6 — Obiettivi */}
      {step === 6 && (
        <section className="flex flex-col gap-6">
          <div>
            <h1 className="font-serif text-[28px] font-medium leading-tight text-foreground">
              I tuoi obiettivi
            </h1>
            <p className="mt-2 text-sm text-muted">
              Tutto opzionale — salta pure se non hai ancora le idee chiare.
            </p>
          </div>
          <StepObiettivi form={form} update={update} />
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => goBack(5)}>Indietro</Button>
            <Button
              disabled={saving}
              onClick={() => void advance({ profile: formToPatch(form) }, 7)}
            >
              {saving ? "Salvo…" : "Avanti"}
            </Button>
          </div>
        </section>
      )}

      {/* Step 7 — La tua settimana */}
      {step === 7 && (
        <section className="flex flex-col gap-6">
          <div>
            <h1 className="font-serif text-[28px] font-medium leading-tight text-foreground">
              La tua settimana
            </h1>
            <p className="mt-2 text-sm text-muted">
              Il piano si costruisce attorno al tempo che hai realmente.
            </p>
          </div>
          <StepSettimana form={form} update={update} />
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => goBack(6)}>Indietro</Button>
            <Button
              disabled={!canAdvanceStep7 || saving}
              onClick={() => void advance({ profile: formToPatch(form) }, 8)}
            >
              {saving ? "Salvo…" : "Avanti"}
            </Button>
          </div>
          {!canAdvanceStep7 && (
            <p className="text-right text-xs text-muted">
              Indica le ore disponibili a settimana per continuare.
            </p>
          )}
        </section>
      )}

      {/* Step 8 — Parametri fisiologici */}
      {step === 8 && (
        <section className="flex flex-col gap-6">
          <div>
            <h1 className="font-serif text-[28px] font-medium leading-tight text-foreground">
              Parametri fisiologici
            </h1>
            <p className="mt-2 text-sm text-muted">
              Tutto opzionale — se hai Intervals.icu verranno sincronizzati automaticamente.
            </p>
          </div>
          <StepFisiologia form={form} update={update} />
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => goBack(7)}>Indietro</Button>
            <Button
              disabled={saving}
              onClick={() => void advance({ profile: formToPatch(form) }, 9)}
            >
              {saving ? "Salvo…" : "Avanti"}
            </Button>
          </div>
        </section>
      )}

      {/* Step 9 — Attrezzatura */}
      {step === 9 && (
        <section className="flex flex-col gap-6">
          <div>
            <h1 className="font-serif text-[28px] font-medium leading-tight text-foreground">
              Attrezzatura
            </h1>
            <p className="mt-2 text-sm text-muted">
              Ci aiuta a capire quali dati possiamo usare e come strutturare il piano.
            </p>
          </div>
          <StepAttrezzatura form={form} update={update} />
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => goBack(8)}>Indietro</Button>
            <Button
              disabled={saving}
              onClick={() => void advance({ profile: formToPatch(form) }, 10)}
            >
              {saving ? "Salvo…" : "Avanti"}
            </Button>
          </div>
        </section>
      )}

      {/* Step 10 — Salute e note */}
      {step === 10 && (
        <section className="flex flex-col gap-6">
          <div>
            <h1 className="font-serif text-[28px] font-medium leading-tight text-foreground">
              Salute e note
            </h1>
            <p className="mt-2 text-sm text-muted">
              Tutto opzionale. Più il coach sa, meglio può adattare il piano.
            </p>
          </div>
          <StepSalute form={form} update={update} />
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => goBack(9)}>Indietro</Button>
            <Button
              disabled={saving}
              onClick={() => void advance({ profile: formToPatch(form) }, 11)}
            >
              {saving ? "Salvo…" : "Inizia l'analisi"}
            </Button>
          </div>
        </section>
      )}

      {/* Step 11 — Prima analisi */}
      {step === 11 && (
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
