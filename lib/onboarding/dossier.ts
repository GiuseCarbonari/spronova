/**
 * Dossier atleta (PRD §12.2) — tipi, costanti e mappatura form ⇄ DB.
 *
 * Modulo puro (no React): usato sia dal wizard di /onboarding sia dal form di
 * /settings/profile, così le due UI restano allineate sugli stessi campi e
 * sulla stessa serializzazione verso athlete_profiles.
 */

/** Gara target principale, salvata in athlete_profiles.gare_target (JSONB). */
export interface GaraTarget {
  nome: string;
  data: string; // YYYY-MM-DD
  distanza_km: number | null;
  dislivello_m: number | null;
}

/**
 * Stato del form: tutti i campi sono stringhe (input controllati) tranne le
 * liste e le tristate sì/no. La conversione ai tipi DB avviene in formToPatch.
 */
export interface DossierForm {
  // Step 5 — Chi sei
  nome: string;
  eta: string;
  sesso: string; // "" | "M" | "F" | "other"
  altezza_cm: string;
  peso_dichiarato_kg: string;
  peso_target_kg: string;
  sport_principali: string[];
  livello_esperienza: string; // "" | "beginner" | "intermediate" | "advanced"
  // Step 6 — Obiettivi
  obiettivi: string;
  fase_corrente: string;
  stile_allenamento: string;
  gara: GaraTargetForm;
  // Step 7 — La tua settimana
  disponibilita_ore_sett: string;
  durata_max_weekday_min: string;
  durata_max_weekend_min: string;
  giorni_preferiti: string[];
  giorni_impossibili: string[];
  // Step 8 — Parametri fisiologici
  ftp_outdoor_w: string;
  ftp_indoor_w: string;
  max_hr: string;
  threshold_hr: string;
  lt1_w: string;
  lt1_hr: string;
  lt2_w: string;
  lt2_hr: string;
  // Step 9 — Attrezzatura
  ciclocomputer: string; // "" | "garmin" | "wahoo" | "karoo" | "coros" | "polar" | "altro"
  ha_misuratore_potenza: boolean | null;
  ha_fascia_cardio: boolean | null;
  ha_smartwatch: boolean | null;
  ha_rulli: boolean | null;
  bici_outdoor: string;
  piattaforma_indoor: string;
  indoor_outdoor: string; // "" | "indoor" | "outdoor" | "both"
  // Step 10 — Salute e note
  infortuni_attuali: string;
  dolore_attuale: string;
  farmaci_integratori: string;
  preferenze_allenamento: string;
  limiti_principali: string;
  note_personali: string;
}

/** Versione "stringhe" della gara target, per gli input controllati. */
export interface GaraTargetForm {
  nome: string;
  data: string;
  distanza_km: string;
  dislivello_m: string;
}

// --- Opzioni di scelta -------------------------------------------------------

export const SPORT_OPTIONS = [
  "Ciclismo",
  "Corsa",
] as const;

/** True se il set di sport selezionati include almeno uno sport in bici. */
export function hasCycling(sports: string[]): boolean {
  return sports.includes("Ciclismo");
}

/** True se il set di sport include la corsa (e nessuno sport in bici). */
export function isRunnerOnly(sports: string[]): boolean {
  return sports.includes("Corsa") && !hasCycling(sports);
}

export const LIVELLO_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "beginner", label: "Principiante" },
  { value: "intermediate", label: "Intermedio" },
  { value: "advanced", label: "Avanzato" },
];

export const SESSO_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "M", label: "Uomo" },
  { value: "F", label: "Donna" },
  { value: "other", label: "Altro / preferisco non dirlo" },
];

export const INDOOR_OUTDOOR_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "outdoor", label: "Soprattutto outdoor" },
  { value: "indoor", label: "Soprattutto indoor" },
  { value: "both", label: "Entrambi" },
];

export const CICLOCOMPUTER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "garmin", label: "Garmin" },
  { value: "wahoo", label: "Wahoo" },
  { value: "karoo", label: "Hammerhead Karoo" },
  { value: "coros", label: "Coros" },
  { value: "polar", label: "Polar" },
  { value: "altro", label: "Altro / nessuno" },
];

export const FASE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "aerobic_build", label: "Costruzione aerobica" },
  { value: "threshold", label: "Sviluppo soglia" },
  { value: "peak", label: "Picco / gara imminente" },
  { value: "recovery", label: "Recupero / off-season" },
  { value: "maintenance", label: "Mantenimento" },
];

export const STILE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "polarized", label: "Polarizzato (molto facile + molto intenso)" },
  { value: "pyramidal", label: "Piramidale (prevalenza Z2-Z3)" },
  { value: "threshold", label: "Soglia (sweetspot / threshold)" },
  { value: "mixed", label: "Misto / non lo so ancora" },
];

export const PIATTAFORMA_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "zwift", label: "Zwift" },
  { value: "trainerroad", label: "TrainerRoad" },
  { value: "wahoo_systm", label: "Wahoo SYSTM" },
  { value: "rouvy", label: "Rouvy" },
  { value: "altro", label: "Altra / nessuna" },
];

/** Giorni della settimana (chiave stabile + etichetta). */
export const GIORNI: Array<{ value: string; label: string }> = [
  { value: "mon", label: "Lun" },
  { value: "tue", label: "Mar" },
  { value: "wed", label: "Mer" },
  { value: "thu", label: "Gio" },
  { value: "fri", label: "Ven" },
  { value: "sat", label: "Sab" },
  { value: "sun", label: "Dom" },
];

// --- Step del wizard ---------------------------------------------------------

/** Step coperti dal wizard (1-2 fatti prima: account + Intervals). */
export const FIRST_STEP = 3;
export const LAST_STEP = 12;

export const STEP_LABELS: Record<number, string> = {
  3: "Consenso privacy",
  4: "Come funziona",
  5: "Chi sei",
  6: "Obiettivi",
  7: "La tua settimana",
  8: "Parametri fisiologici",
  9: "Attrezzatura",
  10: "Salute e note",
  11: "Inizia con CurveLoad",
  12: "Prima analisi",
};

// --- Mappatura DB ⇄ form -----------------------------------------------------

/** Colonne di athlete_profiles scrivibili dal dossier (whitelist per la API). */
export const DOSSIER_COLUMNS = [
  "nome",
  "eta",
  "sesso",
  "altezza_cm",
  "peso_dichiarato_kg",
  "peso_target_kg",
  "sport_principali",
  "livello_esperienza",
  "obiettivi",
  "fase_corrente",
  "stile_allenamento",
  "gare_target",
  "data_obiettivo",
  "disponibilita_ore_sett",
  "durata_max_weekday_min",
  "durata_max_weekend_min",
  "giorni_preferiti",
  "giorni_impossibili",
  "ftp_outdoor_w",
  "ftp_indoor_w",
  "max_hr",
  "threshold_hr",
  "lt1_w",
  "lt1_hr",
  "lt2_w",
  "lt2_hr",
  "ciclocomputer",
  "ha_misuratore_potenza",
  "ha_fascia_cardio",
  "ha_smartwatch",
  "ha_rulli",
  "bici_outdoor",
  "piattaforma_indoor",
  "indoor_outdoor",
  "infortuni_attuali",
  "dolore_attuale",
  "farmaci_integratori",
  "preferenze_allenamento",
  "limiti_principali",
  "note_personali",
] as const;

export type DossierColumn = (typeof DOSSIER_COLUMNS)[number];

/** Riga DB (sottoinsieme dossier), come letta da Supabase. */
export type DossierRow = Partial<Record<DossierColumn, unknown>>;

const EMPTY_GARA: GaraTargetForm = {
  nome: "",
  data: "",
  distanza_km: "",
  dislivello_m: "",
};

export function emptyDossierForm(): DossierForm {
  return {
    nome: "",
    eta: "",
    sesso: "",
    altezza_cm: "",
    peso_dichiarato_kg: "",
    peso_target_kg: "",
    sport_principali: [],
    livello_esperienza: "",
    obiettivi: "",
    fase_corrente: "",
    stile_allenamento: "",
    gara: { ...EMPTY_GARA },
    disponibilita_ore_sett: "",
    durata_max_weekday_min: "",
    durata_max_weekend_min: "",
    giorni_preferiti: [],
    giorni_impossibili: [],
    ftp_outdoor_w: "",
    ftp_indoor_w: "",
    max_hr: "",
    threshold_hr: "",
    lt1_w: "",
    lt1_hr: "",
    lt2_w: "",
    lt2_hr: "",
    ciclocomputer: "",
    ha_misuratore_potenza: null,
    ha_fascia_cardio: null,
    ha_smartwatch: null,
    ha_rulli: null,
    bici_outdoor: "",
    piattaforma_indoor: "",
    indoor_outdoor: "",
    infortuni_attuali: "",
    dolore_attuale: "",
    farmaci_integratori: "",
    preferenze_allenamento: "",
    limiti_principali: "",
    note_personali: "",
  };
}

/** Coercizioni di lettura: valore DB → stringa/array/boolean per il form. */
function str(v: unknown): string {
  return v == null ? "" : String(v);
}
function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String) : [];
}
function triBool(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

/** Costruisce lo stato del form da una riga DB (per il pre-compilato). */
export function rowToForm(row: DossierRow | null | undefined): DossierForm {
  const form = emptyDossierForm();
  if (!row) return form;

  form.nome = str(row.nome);
  form.eta = str(row.eta);
  form.sesso = str(row.sesso);
  form.altezza_cm = str(row.altezza_cm);
  form.peso_dichiarato_kg = str(row.peso_dichiarato_kg);
  form.peso_target_kg = str(row.peso_target_kg);
  form.sport_principali = strArray(row.sport_principali);
  form.livello_esperienza = str(row.livello_esperienza);
  form.obiettivi = str(row.obiettivi);
  form.fase_corrente = str(row.fase_corrente);
  form.stile_allenamento = str(row.stile_allenamento);

  const gara = (row.gare_target ?? null) as Partial<GaraTarget> | null;
  if (gara) {
    form.gara = {
      nome: str(gara.nome),
      data: str(gara.data),
      distanza_km: gara.distanza_km == null ? "" : String(gara.distanza_km),
      dislivello_m: gara.dislivello_m == null ? "" : String(gara.dislivello_m),
    };
  }

  form.disponibilita_ore_sett = str(row.disponibilita_ore_sett);
  form.durata_max_weekday_min = str(row.durata_max_weekday_min);
  form.durata_max_weekend_min = str(row.durata_max_weekend_min);
  form.giorni_preferiti = strArray(row.giorni_preferiti);
  form.giorni_impossibili = strArray(row.giorni_impossibili);

  form.ftp_outdoor_w = str(row.ftp_outdoor_w);
  form.ftp_indoor_w = str(row.ftp_indoor_w);
  form.max_hr = str(row.max_hr);
  form.threshold_hr = str(row.threshold_hr);
  form.lt1_w = str(row.lt1_w);
  form.lt1_hr = str(row.lt1_hr);
  form.lt2_w = str(row.lt2_w);
  form.lt2_hr = str(row.lt2_hr);

  form.ciclocomputer = str(row.ciclocomputer);
  form.ha_misuratore_potenza = triBool(row.ha_misuratore_potenza);
  form.ha_fascia_cardio = triBool(row.ha_fascia_cardio);
  form.ha_smartwatch = triBool(row.ha_smartwatch);
  form.ha_rulli = triBool(row.ha_rulli);
  form.bici_outdoor = str(row.bici_outdoor);
  form.piattaforma_indoor = str(row.piattaforma_indoor);
  form.indoor_outdoor = str(row.indoor_outdoor);

  form.infortuni_attuali = str(row.infortuni_attuali);
  form.dolore_attuale = str(row.dolore_attuale);
  form.farmaci_integratori = str(row.farmaci_integratori);
  form.preferenze_allenamento = str(row.preferenze_allenamento);
  form.limiti_principali = str(row.limiti_principali);
  form.note_personali = str(row.note_personali);

  return form;
}

/** "" → null; altrimenti il testo trimmato. */
function nullableText(s: string): string | null {
  const t = s.trim();
  return t === "" ? null : t;
}
/** "" / non numerico → null; intero altrimenti. */
function nullableInt(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = Number.parseInt(t, 10);
  return Number.isFinite(n) ? n : null;
}
/** "" / non numerico → null; numero (anche decimale) altrimenti. */
function nullableNum(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * Converte il form nel patch da inviare alla API (solo colonne whitelisted,
 * tipi DB). Le liste vuote diventano null per non sovrascrivere con []
 * involontariamente; le tristate non risposte restano null.
 */
export function formToPatch(form: DossierForm): Record<DossierColumn, unknown> {
  const garaCompilata =
    form.gara.nome.trim() !== "" ||
    form.gara.data.trim() !== "" ||
    form.gara.distanza_km.trim() !== "" ||
    form.gara.dislivello_m.trim() !== "";

  const gara: GaraTarget | null = garaCompilata
    ? {
        nome: form.gara.nome.trim(),
        data: form.gara.data.trim(),
        distanza_km: nullableNum(form.gara.distanza_km),
        dislivello_m: nullableInt(form.gara.dislivello_m),
      }
    : null;

  return {
    nome: nullableText(form.nome),
    eta: nullableInt(form.eta),
    sesso: nullableText(form.sesso),
    altezza_cm: nullableInt(form.altezza_cm),
    peso_dichiarato_kg: nullableNum(form.peso_dichiarato_kg),
    peso_target_kg: nullableNum(form.peso_target_kg),
    sport_principali: form.sport_principali.length > 0 ? form.sport_principali : null,
    livello_esperienza: nullableText(form.livello_esperienza),
    obiettivi: nullableText(form.obiettivi),
    fase_corrente: nullableText(form.fase_corrente),
    stile_allenamento: nullableText(form.stile_allenamento),
    gare_target: gara,
    data_obiettivo: gara && gara.data !== "" ? gara.data : null,
    disponibilita_ore_sett: nullableNum(form.disponibilita_ore_sett),
    durata_max_weekday_min: nullableInt(form.durata_max_weekday_min),
    durata_max_weekend_min: nullableInt(form.durata_max_weekend_min),
    giorni_preferiti: form.giorni_preferiti.length > 0 ? form.giorni_preferiti : null,
    giorni_impossibili: form.giorni_impossibili.length > 0 ? form.giorni_impossibili : null,
    ftp_outdoor_w: nullableInt(form.ftp_outdoor_w),
    ftp_indoor_w: nullableInt(form.ftp_indoor_w),
    max_hr: nullableInt(form.max_hr),
    threshold_hr: nullableInt(form.threshold_hr),
    lt1_w: nullableInt(form.lt1_w),
    lt1_hr: nullableInt(form.lt1_hr),
    lt2_w: nullableInt(form.lt2_w),
    lt2_hr: nullableInt(form.lt2_hr),
    ciclocomputer: nullableText(form.ciclocomputer),
    ha_misuratore_potenza: form.ha_misuratore_potenza,
    ha_fascia_cardio: form.ha_fascia_cardio,
    ha_smartwatch: form.ha_smartwatch,
    ha_rulli: form.ha_rulli,
    bici_outdoor: nullableText(form.bici_outdoor),
    piattaforma_indoor: nullableText(form.piattaforma_indoor),
    indoor_outdoor: nullableText(form.indoor_outdoor),
    infortuni_attuali: nullableText(form.infortuni_attuali),
    dolore_attuale: nullableText(form.dolore_attuale),
    farmaci_integratori: nullableText(form.farmaci_integratori),
    preferenze_allenamento: nullableText(form.preferenze_allenamento),
    limiti_principali: nullableText(form.limiti_principali),
    note_personali: nullableText(form.note_personali),
  };
}
