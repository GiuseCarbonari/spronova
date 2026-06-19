"use client";

import {
  CICLOCOMPUTER_OPTIONS,
  FASE_OPTIONS,
  GIORNI,
  hasCycling,
  INDOOR_OUTDOOR_OPTIONS,
  LIVELLO_OPTIONS,
  PIATTAFORMA_OPTIONS,
  SESSO_OPTIONS,
  SPORT_OPTIONS,
  STILE_OPTIONS,
  type DossierForm,
  type GaraTargetForm,
} from "@/lib/onboarding/dossier";

import {
  ChipMultiSelect,
  SelectField,
  TextAreaField,
  TextField,
  YesNoField,
} from "./fields";

/** Updater tipato di un singolo campo del form. */
export type DossierUpdater = <K extends keyof DossierForm>(
  key: K,
  value: DossierForm[K]
) => void;

function toggle(list: string[], value: string): string[] {
  return list.includes(value)
    ? list.filter((v) => v !== value)
    : [...list, value];
}

// --- Step 5: Chi sei ---------------------------------------------------------

export function StepChiSei({
  form,
  update,
}: {
  form: DossierForm;
  update: DossierUpdater;
}) {
  return (
    <div className="flex flex-col gap-4">
      <TextField
        label="Come ti chiami? *"
        value={form.nome}
        onChange={(v) => update("nome", v)}
        placeholder="Nome o nickname"
      />
      <div className="grid grid-cols-2 gap-4">
        <TextField
          label="Età"
          type="number"
          value={form.eta}
          onChange={(v) => update("eta", v)}
          placeholder="es. 34"
        />
        <SelectField
          label="Sesso"
          value={form.sesso}
          onChange={(v) => update("sesso", v)}
          options={SESSO_OPTIONS}
          hint="Opzionale"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <TextField
          label="Altezza (cm)"
          type="number"
          value={form.altezza_cm}
          onChange={(v) => update("altezza_cm", v)}
          placeholder="es. 175"
        />
        <TextField
          label="Peso attuale (kg)"
          type="number"
          value={form.peso_dichiarato_kg}
          onChange={(v) => update("peso_dichiarato_kg", v)}
          placeholder="es. 70"
        />
      </div>
      <TextField
        label="Peso target (kg)"
        type="number"
        value={form.peso_target_kg}
        onChange={(v) => update("peso_target_kg", v)}
        placeholder="Lascia vuoto se non hai un target"
        hint="Opzionale"
      />
      <ChipMultiSelect
        label="Sport principali *"
        values={form.sport_principali}
        options={SPORT_OPTIONS.map((s) => ({ value: s, label: s }))}
        onToggle={(v) => update("sport_principali", toggle(form.sport_principali, v))}
      />
      <SelectField
        label="Livello di esperienza *"
        value={form.livello_esperienza}
        onChange={(v) => update("livello_esperienza", v)}
        options={LIVELLO_OPTIONS}
      />
    </div>
  );
}

// --- Step 6: Obiettivi -------------------------------------------------------

export function StepObiettivi({
  form,
  update,
}: {
  form: DossierForm;
  update: DossierUpdater;
}) {
  function updateGara<K extends keyof GaraTargetForm>(
    key: K,
    value: GaraTargetForm[K]
  ) {
    update("gara", { ...form.gara, [key]: value });
  }

  return (
    <div className="flex flex-col gap-4">
      <TextAreaField
        label="Quali sono i tuoi obiettivi?"
        value={form.obiettivi}
        onChange={(v) => update("obiettivi", v)}
        placeholder="es. Arrivare in forma alla gara di settembre, migliorare la resistenza in salita, perdere qualche chilo mantenendo la potenza…"
        rows={3}
        hint="Opzionale — più sei specifico, più il piano sarà preciso"
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SelectField
          label="Fase di allenamento attuale"
          value={form.fase_corrente}
          onChange={(v) => update("fase_corrente", v)}
          options={FASE_OPTIONS}
          hint="Opzionale"
        />
        <SelectField
          label="Stile di allenamento preferito"
          value={form.stile_allenamento}
          onChange={(v) => update("stile_allenamento", v)}
          options={STILE_OPTIONS}
          hint="Opzionale"
        />
      </div>

      <fieldset className="rounded-[11px] border border-border bg-surface-2 p-4">
        <legend className="px-1 text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
          Gara target principale (opzionale)
        </legend>
        <div className="flex flex-col gap-4 pt-2">
          <TextField
            label="Nome gara"
            value={form.gara.nome}
            onChange={(v) => updateGara("nome", v)}
            placeholder="es. Granfondo delle Dolomiti"
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <TextField
              label="Data"
              type="date"
              value={form.gara.data}
              onChange={(v) => updateGara("data", v)}
            />
            <TextField
              label="Distanza (km)"
              type="number"
              value={form.gara.distanza_km}
              onChange={(v) => updateGara("distanza_km", v)}
            />
            <TextField
              label="Dislivello (m)"
              type="number"
              value={form.gara.dislivello_m}
              onChange={(v) => updateGara("dislivello_m", v)}
            />
          </div>
        </div>
      </fieldset>
    </div>
  );
}

// --- Step 7: La tua settimana ------------------------------------------------

export function StepSettimana({
  form,
  update,
}: {
  form: DossierForm;
  update: DossierUpdater;
}) {
  return (
    <div className="flex flex-col gap-4">
      <TextField
        label="Ore disponibili a settimana *"
        type="number"
        value={form.disponibilita_ore_sett}
        onChange={(v) => update("disponibilita_ore_sett", v)}
        placeholder="es. 8"
        hint="Indicative — il piano si adatta alla tua settimana reale"
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          label="Durata max seduta infrasettimanale (min)"
          type="number"
          value={form.durata_max_weekday_min}
          onChange={(v) => update("durata_max_weekday_min", v)}
          placeholder="es. 75"
          hint="Opzionale"
        />
        <TextField
          label="Durata max seduta weekend (min)"
          type="number"
          value={form.durata_max_weekend_min}
          onChange={(v) => update("durata_max_weekend_min", v)}
          placeholder="es. 180"
          hint="Opzionale"
        />
      </div>
      <ChipMultiSelect
        label="Giorni preferiti per allenarti"
        values={form.giorni_preferiti}
        options={GIORNI}
        onToggle={(v) => update("giorni_preferiti", toggle(form.giorni_preferiti, v))}
      />
      <ChipMultiSelect
        label="Giorni in cui non puoi allenarti"
        values={form.giorni_impossibili}
        options={GIORNI}
        onToggle={(v) => update("giorni_impossibili", toggle(form.giorni_impossibili, v))}
      />
    </div>
  );
}

// --- Step 8: Parametri fisiologici -------------------------------------------

export function StepFisiologia({
  form,
  update,
}: {
  form: DossierForm;
  update: DossierUpdater;
}) {
  const cycling = hasCycling(form.sport_principali);

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-[11px] border border-l-[3px] border-border border-l-brand bg-surface p-4 text-sm leading-relaxed text-secondary">
        Se hai Intervals.icu questi valori verranno sincronizzati automaticamente.
        Puoi inserirli qui se li conosci già — il piano li userà subito e li
        aggiornerà non appena la sync sarà attiva.
      </div>

      {cycling && (
        <fieldset className="rounded-[11px] border border-border bg-surface-2 p-4">
          <legend className="px-1 text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
            FTP — Functional Threshold Power
          </legend>
          <div className="grid grid-cols-2 gap-4 pt-2">
            <TextField
              label="FTP outdoor (W)"
              type="number"
              value={form.ftp_outdoor_w}
              onChange={(v) => update("ftp_outdoor_w", v)}
              placeholder="es. 260"
            />
            <TextField
              label="FTP indoor (W)"
              type="number"
              value={form.ftp_indoor_w}
              onChange={(v) => update("ftp_indoor_w", v)}
              placeholder="es. 245"
              hint="Di solito ~5% in meno"
            />
          </div>
        </fieldset>
      )}

      <fieldset className="rounded-[11px] border border-border bg-surface-2 p-4">
        <legend className="px-1 text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
          Frequenza cardiaca
        </legend>
        <div className="grid grid-cols-2 gap-4 pt-2">
          <TextField
            label="FC massima (bpm)"
            type="number"
            value={form.max_hr}
            onChange={(v) => update("max_hr", v)}
            placeholder="es. 185"
          />
          <TextField
            label="FC soglia / MLSS (bpm)"
            type="number"
            value={form.threshold_hr}
            onChange={(v) => update("threshold_hr", v)}
            placeholder="es. 168"
          />
        </div>
      </fieldset>

      <fieldset className="rounded-[11px] border border-border bg-surface-2 p-4">
        <legend className="px-1 text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
          LT1 — Prima soglia (soglia aerobica)
        </legend>
        <div className="grid grid-cols-2 gap-4 pt-2">
          {cycling && (
            <TextField
              label="Potenza LT1 (W)"
              type="number"
              value={form.lt1_w}
              onChange={(v) => update("lt1_w", v)}
              placeholder="es. 185"
            />
          )}
          <TextField
            label="FC a LT1 (bpm)"
            type="number"
            value={form.lt1_hr}
            onChange={(v) => update("lt1_hr", v)}
            placeholder="es. 142"
          />
        </div>
      </fieldset>

      <fieldset className="rounded-[11px] border border-border bg-surface-2 p-4">
        <legend className="px-1 text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
          LT2 — Seconda soglia (MLSS / soglia anaerobica)
        </legend>
        <div className="grid grid-cols-2 gap-4 pt-2">
          {cycling && (
            <TextField
              label="Potenza LT2 (W)"
              type="number"
              value={form.lt2_w}
              onChange={(v) => update("lt2_w", v)}
              placeholder="es. 255"
            />
          )}
          <TextField
            label="FC a LT2 (bpm)"
            type="number"
            value={form.lt2_hr}
            onChange={(v) => update("lt2_hr", v)}
            placeholder="es. 165"
          />
        </div>
      </fieldset>
    </div>
  );
}

// --- Step 9: Attrezzatura ----------------------------------------------------

export function StepAttrezzatura({
  form,
  update,
}: {
  form: DossierForm;
  update: DossierUpdater;
}) {
  const cycling = hasCycling(form.sport_principali);

  return (
    <div className="flex flex-col gap-4">
      {cycling && (
        <SelectField
          label="Ciclocomputer / dispositivo principale"
          value={form.ciclocomputer}
          onChange={(v) => update("ciclocomputer", v)}
          options={CICLOCOMPUTER_OPTIONS}
          hint="Determina la disponibilità di DFA a1"
        />
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {cycling && (
          <YesNoField
            label="Misuratore di potenza?"
            value={form.ha_misuratore_potenza}
            onChange={(v) => update("ha_misuratore_potenza", v)}
          />
        )}
        <YesNoField
          label="Fascia cardio?"
          value={form.ha_fascia_cardio}
          onChange={(v) => update("ha_fascia_cardio", v)}
        />
        <YesNoField
          label="Smartwatch?"
          value={form.ha_smartwatch}
          onChange={(v) => update("ha_smartwatch", v)}
        />
        {cycling && (
          <YesNoField
            label="Rulli / smart trainer indoor?"
            value={form.ha_rulli}
            onChange={(v) => update("ha_rulli", v)}
          />
        )}
      </div>
      {cycling && (
        <>
          <TextField
            label="Bici outdoor (modello)"
            value={form.bici_outdoor}
            onChange={(v) => update("bici_outdoor", v)}
            placeholder="es. Canyon Endurace CF SL 7"
            hint="Opzionale"
          />
          <SelectField
            label="Piattaforma indoor"
            value={form.piattaforma_indoor}
            onChange={(v) => update("piattaforma_indoor", v)}
            options={PIATTAFORMA_OPTIONS}
            hint="Opzionale"
          />
        </>
      )}
      <SelectField
        label="Preferisci indoor o outdoor?"
        value={form.indoor_outdoor}
        onChange={(v) => update("indoor_outdoor", v)}
        options={INDOOR_OUTDOOR_OPTIONS}
      />
    </div>
  );
}

// --- Step 10: Salute e note --------------------------------------------------

export function StepSalute({
  form,
  update,
}: {
  form: DossierForm;
  update: DossierUpdater;
}) {
  return (
    <div className="flex flex-col gap-4">
      <TextAreaField
        label="Infortuni attuali"
        value={form.infortuni_attuali}
        onChange={(v) => update("infortuni_attuali", v)}
        placeholder="es. Tendinite al ginocchio sinistro, in recupero da 3 settimane"
        hint="Opzionale"
        rows={2}
      />
      <TextAreaField
        label="Dolori o fastidi ricorrenti"
        value={form.dolore_attuale}
        onChange={(v) => update("dolore_attuale", v)}
        placeholder="es. Mal di schiena dopo uscite lunghe"
        hint="Opzionale"
        rows={2}
      />
      <TextAreaField
        label="Farmaci o integratori"
        value={form.farmaci_integratori}
        onChange={(v) => update("farmaci_integratori", v)}
        placeholder="es. Magnesio, vitamina D, ibuprofene al bisogno"
        hint="Opzionale — utile per contestualizzare alcune risposte fisiologiche"
        rows={2}
      />
      <TextAreaField
        label="Preferenze di allenamento"
        value={form.preferenze_allenamento}
        onChange={(v) => update("preferenze_allenamento", v)}
        placeholder="es. Preferisco uscite lunghe a bassa intensità, evito i gruppi"
        hint="Opzionale"
        rows={2}
      />
      <TextAreaField
        label="Limiti o vincoli principali"
        value={form.limiti_principali}
        onChange={(v) => update("limiti_principali", v)}
        placeholder="es. Non posso allenarmi prima delle 7, ho un bambino piccolo"
        hint="Opzionale"
        rows={2}
      />
      <TextAreaField
        label="Note personali"
        value={form.note_personali}
        onChange={(v) => update("note_personali", v)}
        placeholder="Qualsiasi altra cosa vuoi che il coach sappia"
        hint="Opzionale"
        rows={2}
      />
    </div>
  );
}
