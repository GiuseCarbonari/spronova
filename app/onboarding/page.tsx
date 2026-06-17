import { redirect } from "next/navigation";

import { OnboardingWizard } from "@/components/onboarding/wizard";
import {
  DOSSIER_COLUMNS,
  FIRST_STEP,
  LAST_STEP,
  rowToForm,
  type DossierRow,
} from "@/lib/onboarding/dossier";
import { createClient } from "@/lib/supabase/server";

/**
 * /onboarding — wizard guidato (PRD §12). Server Component: carica lo stato
 * salvato (dossier + step + consenso) e lo passa al wizard client, che riparte
 * dal punto giusto. Se l'onboarding è già completo, l'utente non deve stare
 * qui: torna in dashboard.
 */
export default async function OnboardingPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login"); // difesa in profondità oltre il middleware
  }

  const { data: profileRow } = await supabase
    .from("athlete_profiles")
    .select([...DOSSIER_COLUMNS, "onboarding_step", "onboarding_completed"].join(", "))
    .eq("user_id", user.id)
    .maybeSingle<DossierRow & { onboarding_step: number; onboarding_completed: boolean }>();

  if (profileRow?.onboarding_completed) {
    redirect("/dashboard");
  }

  const { data: userRow } = await supabase
    .from("users")
    .select("gdpr_consent")
    .eq("id", user.id)
    .maybeSingle<{ gdpr_consent: boolean }>();

  // Riparti dallo step salvato, mai prima del 3 (1-2 già fatti) né oltre il 7.
  const savedStep = profileRow?.onboarding_step ?? 0;
  const initialStep = Math.min(Math.max(savedStep, FIRST_STEP), LAST_STEP);

  return (
    <div className="min-h-screen bg-base font-body">
      <main
        style={{
          paddingLeft: "max(1.25rem, env(safe-area-inset-left))",
          paddingRight: "max(1.25rem, env(safe-area-inset-right))",
        }}
        className="mx-auto flex w-full max-w-[560px] flex-col px-5 pb-20 pt-10 sm:px-6"
      >
        <OnboardingWizard
          initialForm={rowToForm(profileRow)}
          initialStep={initialStep}
          initialConsent={userRow?.gdpr_consent ?? false}
        />
      </main>
    </div>
  );
}
