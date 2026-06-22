import { Button } from "@/components/ui/button";

/**
 * Landing pubblica. L'account CurveLoad e il collegamento a Intervals.icu
 * sono due passaggi distinti e vengono descritti come tali.
 */
export default function LandingPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-base px-4 py-10">
      <div className="flex max-w-2xl flex-col items-center gap-4 text-center">
        <svg width="56" height="56" viewBox="0 0 58 58" fill="none" aria-label="CurveLoad logo">
          <circle
            cx="29" cy="29" r="22"
            stroke="url(#lgLmk)"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray="138 0"
          />
          <defs>
            <linearGradient id="lgLmk" x1="0" y1="0" x2="58" y2="58">
              <stop offset="0%" stopColor="#5b8def" />
              <stop offset="100%" stopColor="#7fc8c0" />
            </linearGradient>
          </defs>
        </svg>
        <h1 className="font-serif text-5xl font-medium tracking-tight text-foreground">
          CurveLoad
        </h1>
        <p className="max-w-xl text-lg text-secondary">
          Il tuo coach endurance basato sul protocollo Section 11. Crea il tuo
          account CurveLoad e collega Intervals.icu per ricevere ogni giorno una
          decisione chiara e un programma costruito sui tuoi dati reali.
        </p>
      </div>

      <Button asChild size="lg">
        <a href="/login">Accedi a CurveLoad</a>
      </Button>

      <p className="max-w-md text-center text-sm text-muted">
        Non hai ancora un account? Potrai registrarti nella schermata
        successiva e collegare Intervals.icu subito dopo.
      </p>
    </main>
  );
}
