import { redirect } from "next/navigation";

import { CurveLoadShell } from "@/components/layout/curveload-shell";
import { SettingsDossierForm } from "@/components/settings/dossier-form";
import {
  DOSSIER_COLUMNS,
  rowToForm,
  type DossierRow,
} from "@/lib/onboarding/dossier";
import { createClient } from "@/lib/supabase/server";

/**
 * /settings/profile — modifica del dossier atleta (PRD §12) in qualsiasi
 * momento. Carica la riga e la passa pre-compilata al form client.
 */
export default async function SettingsProfilePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login"); // difesa in profondità oltre il middleware
  }

  const { data: row } = await supabase
    .from("athlete_profiles")
    .select(DOSSIER_COLUMNS.join(", "))
    .eq("user_id", user.id)
    .maybeSingle<DossierRow>();

  return (
    <CurveLoadShell>
      <SettingsDossierForm initialForm={rowToForm(row)} />
    </CurveLoadShell>
  );
}
