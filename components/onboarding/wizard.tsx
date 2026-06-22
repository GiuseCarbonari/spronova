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

  // --- Step 12: prima analisi (auto) -----------------------------------------
  const analysisStarted = useRef(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (step !== 12 || analysisStarted.current) return;
    analysisStarted.current = true;

    (async () => {
      await fetch("/api/sync/intervals", { method: "POST" }).catch(() => null);
      await fetch("/api/profile/build", { method: "POST" }).catch(() => null);

      const ok = await persist({ complete: true, step: 12 });
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

  const canAdvanceStep6 =
    form.nome.trim() !== "" && form.sport_principali.length > 0 && form.livello_esperienza !== "";
  const canAdvanceStep8 = form.disponibilita_ore_sett.trim() !== "";

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
            CurveLoad
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

      {/* Step 3 — Come funziona CurveLoad */}
      {step === 3 && (
        <section className="flex flex-col gap-6">
          <h1 className="font-serif text-[28px] font-medium leading-tight text-foreground">
            Ecco come funziona CurveLoad
          </h1>

          <div className="flex flex-col gap-3 rounded-[18px] border border-border bg-surface p-5">
            <p className="text-[13px] font-medium uppercase tracking-[0.12em] text-brand">
              Ogni giorno
            </p>
            <p className="text-sm leading-relaxed text-secondary">
              CurveLoad legge i tuoi dati da Intervals.icu — readiness, HRV, sonno,
              carico — e decide se l&apos;allenamento del giorno è confermato,
              ridotto o rimandato. La dashboard ti mostra sempre cosa fare e perché.
            </p>
          </div>

          <div className="flex flex-col gap-3 rounded-[18px] border border-border bg-surface p-5">
            <p className="text-[13px] font-medium uppercase tracking-[0.12em] text-brand">
              Ogni settimana
            </p>
            <p className="text-sm leading-relaxed text-secondary">
              Genera il piano settimanale in un click: CurveLoad costruisce la
              distribuzione dei carichi in base al tuo dossier e alla fase
              corrente. Il piano si pubblica direttamente su Intervals.icu,
              così lo ritrovi nel tuo calendario.
            </p>
          </div>

          <div className="flex flex-col gap-3 rounded-[18px] border border-l-[3px] border-border border-l-brand bg-surface p-5">
            <p className="text-[13px] font-medium uppercase tracking-[0.12em] text-brand">
              Perché Intervals.icu è fondamentale
            </p>
            <p className="text-sm leading-relaxed text-secondary">
              Intervals.icu è la fonte di tutti i tuoi dati: storico allenamenti,
              readiness giornaliera, HRV, metriche di carico. Senza un account
              Intervals attivo e collegato, CurveLoad non può leggere nulla e il
              coach resta cieco.
            </p>
            <ul className="mt-1 flex flex-col gap-1.5 text-sm text-secondary">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-brand">→</span>
                <span>
                  Se non hai ancora un account, crealo su{" "}
                  <strong>intervals.icu</strong> (gratuito) e collegalo
                  al tuo dispositivo GPS o a Strava.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-brand">→</span>
                <span>
                  Più dati storici hai su Intervals, più il piano sarà
                  preciso fin dal primo giorno.
                </span>
              </li>
            </ul>
          </div>

          <div className="flex justify-end">
            <Button disabled={saving} onClick={() => void advance({}, 4)}>
              {saving ? "Salvo…" : "Capito, andiamo avanti"}
            </Button>
          </div>
        </section>
      )}

      {/* Step 4 — Consenso privacy */}
      {step === 4 && (
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
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => goBack(3)}>Indietro</Button>
            <Button
              disabled={!consent || saving}
              onClick={() => void advance({ consent: true }, 5)}
            >
              {saving ? "Salvo…" : "Avanti"}
            </Button>
          </div>
        </section>
      )}

      {/* Step 5 — Dati e connessioni */}
      {step === 5 && (
        <section className="flex flex-col gap-6">
          <h1 className="font-serif text-[28px] font-medium leading-tight text-foreground">
            Dati e connessioni
          </h1>
          <div className="rounded-[18px] border border-l-[3px] border-border border-l-brand bg-surface p-5 text-sm leading-relaxed text-secondary">
            {EDU_MESSAGE}
          </div>
          <div className="rounded-[18px] border border-l-[3px] border-border border-l-ready-go bg-surface p-5 text-sm leading-relaxed text-secondary">
            <p className="mb-2 font-medium text-foreground">Verifica le connessioni su Intervals.icu</p>
            <p className="mb-3">
              CurveLoad legge i dati direttamente da Intervals.icu. Per far sì che
              arrivino ogni giorno, il tuo dispositivo GPS (Garmin, Wahoo, Polar…)
              o Strava deve essere collegato nelle impostazioni di Intervals.
            </p>
            <a
              href="https://intervals.icu/settings/connections"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-ready-go/[0.12] px-3 py-2 text-[13px] font-semibold text-ready-go transition-opacity hover:opacity-80"
            >
              Apri Connessioni su Intervals.icu ↗
            </a>
          </div>
          <div className="rounded-[18px] border border-border bg-surface p-5 text-sm leading-relaxed text-secondary">
            <p className="mb-2 font-medium text-foreground">Nota su DFA a1</p>
            <p>
              L&apos;analisi DFA a1 — usata da CurveLoad per stimare la tua soglia
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
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => goBack(4)}>Indietro</Button>
            <Button disabled={saving} onClick={() => void advance({}, 6)}>
              {saving ? "Salvo…" : "Tutto pronto, avanti"}
            </Button>
          </div>
        </section>
      )}

      {/* Step 6 — Chi sei */}
      {step === 6 && (
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
            <Button variant="outline" onClick={() => goBack(5)}>Indietro</Button>
            <Button
              disabled={!canAdvanceStep6 || saving}
              onClick={() => void advance({ profile: formToPatch(form) }, 7)}
            >
              {saving ? "Salvo…" : "Avanti"}
            </Button>
          </div>
          {!canAdvanceStep6 && (
            <p className="text-right text-xs text-muted">
              Compila nome, almeno uno sport e il livello di esperienza per continuare.
            </p>
          )}
        </section>
      )}

      {/* Step 7 — Obiettivi */}
      {step === 7 && (
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
            <Button variant="outline" onClick={() => goBack(6)}>Indietro</Button>
            <Button
              disabled={saving}
              onClick={() => void advance({ profile: formToPatch(form) }, 8)}
            >
              {saving ? "Salvo…" : "Avanti"}
            </Button>
          </div>
        </section>
      )}

      {/* Step 8 — La tua settimana */}
      {step === 8 && (
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
            <Button variant="outline" onClick={() => goBack(7)}>Indietro</Button>
            <Button
              disabled={!canAdvanceStep8 || saving}
              onClick={() => void advance({ profile: formToPatch(form) }, 9)}
            >
              {saving ? "Salvo…" : "Avanti"}
            </Button>
          </div>
          {!canAdvanceStep8 && (
            <p className="text-right text-xs text-muted">
              Indica le ore disponibili a settimana per continuare.
            </p>
          )}
        </section>
      )}

      {/* Step 9 — Parametri fisiologici */}
      {step === 9 && (
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

      {/* Step 10 — Attrezzatura */}
      {step === 10 && (
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
            <Button variant="outline" onClick={() => goBack(9)}>Indietro</Button>
            <Button
              disabled={saving}
              onClick={() => void advance({ profile: formToPatch(form) }, 11)}
            >
              {saving ? "Salvo…" : "Avanti"}
            </Button>
          </div>
        </section>
      )}

      {/* Step 11 — Salute e note */}
      {step === 11 && (
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
            <Button variant="outline" onClick={() => goBack(10)}>Indietro</Button>
            <Button
              disabled={saving}
              onClick={() => void advance({ profile: formToPatch(form) }, 12)}
            >
              {saving ? "Salvo…" : "Tutto chiaro, inizia l'analisi"}
            </Button>
          </div>
        </section>
      )}

      {/* Step 12 — Prima analisi */}
      {step === 12 && (
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
