"use client";

import { useState } from "react";

import {
  StepAttrezzatura,
  StepChiSei,
  StepFisiologia,
  StepObiettivi,
  StepSalute,
  StepSettimana,
  type DossierUpdater,
} from "@/components/onboarding/dossier-fields";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  CICLOCOMPUTER_OPTIONS,
  FASE_OPTIONS,
  formToPatch,
  GIORNI,
  hasCycling,
  INDOOR_OUTDOOR_OPTIONS,
  LIVELLO_OPTIONS,
  PIATTAFORMA_OPTIONS,
  SESSO_OPTIONS,
  STILE_OPTIONS,
  type DossierForm,
} from "@/lib/onboarding/dossier";

/**
 * Form del dossier per /settings/profile (design CurveLoad). A riposo ogni gruppo
 * mostra i valori correnti in sola lettura; ✎ Modifica apre un solo gruppo
 * alla volta, riusando gli editor dell'onboarding. Salva con /api/onboarding/save;
 * Annulla ripristina l'ultimo valore salvato.
 */

type GroupKey = "chi_sei" | "obiettivi" | "settimana" | "fisiologia" | "attrezzatura" | "salute";

function optLabel(
  options: ReadonlyArray<{ value: string; label: string }>,
  value: string
): string {
  if (value.trim() === "") return "—";
  return options.find((o) => o.value === value)?.label ?? value;
}

function text(v: string): string {
  return v.trim() === "" ? "—" : v.trim();
}

function num(v: string, unit = ""): string {
  return v.trim() === "" ? "—" : `${v.trim()}${unit}`;
}

function list(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "—";
}

function days(values: string[]): string {
  if (values.length === 0) return "—";
  return values
    .map((v) => GIORNI.find((g) => g.value === v)?.label ?? v)
    .join(", ");
}

function yesNo(v: boolean | null): string {
  if (v === null) return "—";
  return v ? "Sì" : "No";
}

function Row({ label, value }: { label: string; value: string }) {
  const empty = value === "—";
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <span className="shrink-0 text-[13px] text-muted">{label}</span>
      <span className={"text-right text-sm " + (empty ? "text-faint" : "text-foreground")}>
        {value}
      </span>
    </div>
  );
}

export function SettingsDossierForm({ initialForm }: { initialForm: DossierForm }) {
  const [saved, setSaved] = useState<DossierForm>(initialForm);
  const [form, setForm] = useState<DossierForm>(initialForm);
  const [editing, setEditing] = useState<GroupKey | null>(null);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update: DossierUpdater = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setJustSaved(false);
  };

  function openEdit(group: GroupKey) {
    setForm(saved);
    setEditing(group);
    setError(null);
    setJustSaved(false);
  }

  function cancel() {
    setForm(saved);
    setEditing(null);
    setError(null);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/onboarding/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile: formToPatch(form) }),
    }).catch(() => null);
    setSaving(false);
    if (!res || !res.ok) {
      setError("Salvataggio fallito, riprova");
      return;
    }
    setSaved(form);
    setEditing(null);
    setJustSaved(true);
  }

  const saveBar = editing !== null && (
    <div className="sticky bottom-20 flex items-center justify-end gap-3 rounded-[18px] border border-border bg-base/95 px-4 py-3 backdrop-blur-xl">
      {error && <span className="text-sm text-ready-skip">{error}</span>}
      <Button variant="outline" onClick={cancel} disabled={saving}>Annulla</Button>
      <Button onClick={() => void handleSave()} disabled={saving}>
        {saving ? "Salvo…" : "Salva"}
      </Button>
    </div>
  );

  return (
    <>
      <div className="flex items-start justify-between gap-4 pt-2">
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] text-muted">Impostazioni</div>
          <h1 className="mt-1.5 font-serif text-[30px] font-medium leading-none text-foreground">
            Il tuo profilo
          </h1>
          <p className="mt-2 text-sm text-secondary">Aggiorna il tuo dossier in qualsiasi momento.</p>
        </div>
        <div className="flex items-center gap-2 pt-1">
          <span className="hidden text-[13px] text-muted sm:inline">Tema</span>
          <ThemeToggle />
        </div>
      </div>

      {/* Chi sei */}
      <Group title="Chi sei" editing={editing === "chi_sei"} disabled={editing !== null && editing !== "chi_sei"} onEdit={() => openEdit("chi_sei")}>
        {editing === "chi_sei" ? (
          <StepChiSei form={form} update={update} />
        ) : (
          <div className="divide-y divide-border">
            <Row label="Nome" value={text(saved.nome)} />
            <Row label="Età" value={num(saved.eta)} />
            <Row label="Sesso" value={optLabel(SESSO_OPTIONS, saved.sesso)} />
            <Row label="Altezza" value={num(saved.altezza_cm, " cm")} />
            <Row label="Peso attuale" value={num(saved.peso_dichiarato_kg, " kg")} />
            <Row label="Peso target" value={num(saved.peso_target_kg, " kg")} />
            <Row label="Sport principali" value={list(saved.sport_principali)} />
            <Row label="Livello" value={optLabel(LIVELLO_OPTIONS, saved.livello_esperienza)} />
          </div>
        )}
      </Group>

      {/* Obiettivi */}
      <Group title="Obiettivi" editing={editing === "obiettivi"} disabled={editing !== null && editing !== "obiettivi"} onEdit={() => openEdit("obiettivi")}>
        {editing === "obiettivi" ? (
          <StepObiettivi form={form} update={update} />
        ) : (
          <div className="divide-y divide-border">
            <Row label="Obiettivi" value={text(saved.obiettivi)} />
            <Row label="Fase attuale" value={optLabel(FASE_OPTIONS, saved.fase_corrente)} />
            <Row label="Stile allenamento" value={optLabel(STILE_OPTIONS, saved.stile_allenamento)} />
            <Row label="Gara target" value={text(saved.gara.nome)} />
            <Row label="Data gara" value={text(saved.gara.data)} />
            <Row label="Distanza" value={num(saved.gara.distanza_km, " km")} />
            <Row label="Dislivello" value={num(saved.gara.dislivello_m, " m")} />
          </div>
        )}
      </Group>

      {/* La tua settimana */}
      <Group title="La tua settimana" editing={editing === "settimana"} disabled={editing !== null && editing !== "settimana"} onEdit={() => openEdit("settimana")}>
        {editing === "settimana" ? (
          <StepSettimana form={form} update={update} />
        ) : (
          <div className="divide-y divide-border">
            <Row label="Ore a settimana" value={num(saved.disponibilita_ore_sett, " h")} />
            <Row label="Max infrasettimanale" value={num(saved.durata_max_weekday_min, " min")} />
            <Row label="Max weekend" value={num(saved.durata_max_weekend_min, " min")} />
            <Row label="Giorni preferiti" value={days(saved.giorni_preferiti)} />
            <Row label="Giorni impossibili" value={days(saved.giorni_impossibili)} />
          </div>
        )}
      </Group>

      {/* Parametri fisiologici */}
      <Group title="Parametri fisiologici" editing={editing === "fisiologia"} disabled={editing !== null && editing !== "fisiologia"} onEdit={() => openEdit("fisiologia")}>
        {editing === "fisiologia" ? (
          <StepFisiologia form={form} update={update} />
        ) : (
          <div className="divide-y divide-border">
            {hasCycling(saved.sport_principali) && (
              <>
                <Row label="FTP outdoor" value={num(saved.ftp_outdoor_w, " W")} />
                <Row label="FTP indoor" value={num(saved.ftp_indoor_w, " W")} />
              </>
            )}
            <Row label="FC max" value={num(saved.max_hr, " bpm")} />
            <Row label="FC soglia" value={num(saved.threshold_hr, " bpm")} />
            {hasCycling(saved.sport_principali) && (
              <Row label="LT1 potenza" value={num(saved.lt1_w, " W")} />
            )}
            <Row label="LT1 FC" value={num(saved.lt1_hr, " bpm")} />
            {hasCycling(saved.sport_principali) && (
              <Row label="LT2 potenza" value={num(saved.lt2_w, " W")} />
            )}
            <Row label="LT2 FC" value={num(saved.lt2_hr, " bpm")} />
          </div>
        )}
      </Group>

      {/* Attrezzatura */}
      <Group title="Attrezzatura" editing={editing === "attrezzatura"} disabled={editing !== null && editing !== "attrezzatura"} onEdit={() => openEdit("attrezzatura")}>
        {editing === "attrezzatura" ? (
          <StepAttrezzatura form={form} update={update} />
        ) : (
          <div className="divide-y divide-border">
            {hasCycling(saved.sport_principali) && (
              <>
                <Row label="Ciclocomputer" value={optLabel(CICLOCOMPUTER_OPTIONS, saved.ciclocomputer)} />
                <Row label="Misuratore potenza" value={yesNo(saved.ha_misuratore_potenza)} />
              </>
            )}
            <Row label="Fascia cardio" value={yesNo(saved.ha_fascia_cardio)} />
            <Row label="Smartwatch" value={yesNo(saved.ha_smartwatch)} />
            {hasCycling(saved.sport_principali) && (
              <>
                <Row label="Rulli indoor" value={yesNo(saved.ha_rulli)} />
                <Row label="Bici outdoor" value={text(saved.bici_outdoor)} />
                <Row label="Piattaforma indoor" value={optLabel(PIATTAFORMA_OPTIONS, saved.piattaforma_indoor)} />
              </>
            )}
            <Row label="Indoor / outdoor" value={optLabel(INDOOR_OUTDOOR_OPTIONS, saved.indoor_outdoor)} />
          </div>
        )}
      </Group>

      {/* Salute e note */}
      <Group title="Salute e note" editing={editing === "salute"} disabled={editing !== null && editing !== "salute"} onEdit={() => openEdit("salute")}>
        {editing === "salute" ? (
          <StepSalute form={form} update={update} />
        ) : (
          <div className="divide-y divide-border">
            <Row label="Infortuni attuali" value={text(saved.infortuni_attuali)} />
            <Row label="Dolori ricorrenti" value={text(saved.dolore_attuale)} />
            <Row label="Farmaci / integratori" value={text(saved.farmaci_integratori)} />
            <Row label="Preferenze allenamento" value={text(saved.preferenze_allenamento)} />
            <Row label="Limiti principali" value={text(saved.limiti_principali)} />
            <Row label="Note personali" value={text(saved.note_personali)} />
          </div>
        )}
      </Group>

      {saveBar}

      {justSaved && editing === null && (
        <p className="text-right text-sm text-ready-go">Salvato ✓</p>
      )}
    </>
  );
}

function Group({
  title,
  editing,
  disabled,
  onEdit,
  children,
}: {
  title: string;
  editing: boolean;
  disabled: boolean;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[18px] border border-border bg-surface p-5">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-serif text-lg font-medium text-foreground">{title}</h2>
        {!editing && (
          <button
            type="button"
            onClick={onEdit}
            disabled={disabled}
            aria-label={`Modifica ${title}`}
            className="rounded-full border border-border px-3 py-1 text-[13px] text-secondary transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ✎ Modifica
          </button>
        )}
      </div>
      {children}
    </section>
  );
}
