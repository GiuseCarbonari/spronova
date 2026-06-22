import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";

/**
 * Secondo passaggio del setup: l'utente è già autenticato a CurveLoad e
 * autorizza separatamente l'accesso ai propri dati Intervals.icu.
 */
export default function ConnectPage() {
  return (
    <AppShell className="items-center justify-center">
      <section className="panel flex w-full max-w-lg flex-col items-center gap-5 text-center">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
          Passaggio 2 di 2
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Collega Intervals.icu
        </h1>
        <p className="max-w-md text-secondary">
          Hai effettuato l&apos;accesso a CurveLoad. Ora collega Intervals.icu
          per importare attività, carico e profilo di potenza.
        </p>
        <Button asChild size="lg">
          <a href="/api/auth/intervals/login">Collega Intervals.icu</a>
        </Button>
      </section>
    </AppShell>
  );
}
