"use client";

import { useState } from "react";

import {
  DossierEquipment,
  DossierPageA,
  DossierPageB,
  type DossierUpdater,
} from "@/components/onboarding/dossier-fields";
import { Button } from "@/components/ui/button";
import {
  formToPatch,
  GIORNI,
  INDOOR_OUTDOOR_OPTIONS,
  LIVELLO_OPTIONS,
  SESSO_OPTIONS,
  type DossierForm,
} from "@/lib/onboarding/dossier";

/**
 * Form del dossier per /settings/profile (design Limina). A riposo ogni gruppo
 * mostra i valori correnti come righe di sola lettura; il tasto matita ✎ apre
 * in modifica un solo gruppo alla volta, riusando gli editor dell'onboarding
 * (DossierPageA/B/Equipment). Salva l'intero patch senza toccare lo stato
 * onboarding; "Annulla" ripristina l'ultimo valore salvato.
 */

type GroupKey = "A" | "B" | "E";

/** Etichetta leggibile di un valore a scelta, "—" se vuoto/sconosciuto. */
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

/** Riga di sola lettura: etichetta a sinistra, valore a destra. */
function Row({ label, value }: { label: string; value: string }) {
  const empty = value === "—";
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <span className="shrink-0 text-[13px] text-muted">{label}</span>
      <span
        className={
          "text-right text-sm " + (empty ? "text-faint" : "text-foreground")
        }
      >
        {value}
      </span>
    </div>
  );
}

export function SettingsDossierForm({ initialForm }: { initialForm: DossierForm }) {
  // Baseline = ultimo stato salvato (per "Annulla").
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
    setForm(saved); // riparti sempre dall'ultimo salvato
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

  return (
    <>
      {/* Header */}
      <div className="flex items-start justify-between pt-2">
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] text-muted">
            Impostazioni
          </div>
          <h1 className="mt-1.5 font-serif text-[30px] font-medium leading-none text-foreground">
            Il tuo profilo
          </h1>
          <p className="mt-2 text-sm text-secondary">
            Aggiorna il tuo dossier in qualsiasi momento.
          </p>
        </div>
      </div>

      {/* Gruppo: Anagrafica e sport */}
      <Group
        title="Anagrafica e sport"
        editing={editing === "A"}
        disabled={editing !== null && editing !== "A"}
        onEdit={() => openEdit("A")}
      >
        {editing === "A" ? (
          <DossierPageA form={form} update={update} />
        ) : (
          <div className="divide-y divide-border">
            <Row label="Nome" value={text(saved.nome)} />
            <Row label="Età" value={num(saved.eta)} />
            <Row label="Sesso" value={optLabel(SESSO_OPTIONS, saved.sesso)} />
            <Row label="Altezza" value={num(saved.altezza_cm, " cm")} />
            <Row label="Peso" value={num(saved.peso_dichiarato_kg, " kg")} />
            <Row label="Sport principali" value={list(saved.sport_principali)} />
            <Row
              label="Livello"
              value={optLabel(LIVELLO_OPTIONS, saved.livello_esperienza)}
            />
          </div>
        )}
      </Group>

      {/* Gruppo: Obiettivi e disponibilità */}
      <Group
        title="Obiettivi e disponibilità"
        editing={editing === "B"}
        disabled={editing !== null && editing !== "B"}
        onEdit={() => openEdit("B")}
      >
        {editing === "B" ? (
          <DossierPageB form={form} update={update} />
        ) : (
          <div className="divide-y divide-border">
            <Row label="Obiettivi" value={text(saved.obiettivi)} />
            <Row label="Gara target" value={text(saved.gara.nome)} />
            <Row label="Data gara" value={text(saved.gara.data)} />
            <Row label="Distanza" value={num(saved.gara.distanza_km, " km")} />
            <Row label="Dislivello" value={num(saved.gara.dislivello_m, " m")} />
            <Row
              label="Ore a settimana"
              value={num(saved.disponibilita_ore_sett)}
            />
            <Row
              label="Max infrasettimanale"
              value={num(saved.durata_max_weekday_min, " min")}
            />
            <Row
              label="Max weekend"
              value={num(saved.durata_max_weekend_min, " min")}
            />
            <Row label="Giorni preferiti" value={days(saved.giorni_preferiti)} />
            <Row label="Giorni impossibili" value={days(saved.giorni_impossibili)} />
          </div>
        )}
      </Group>

      {/* Gruppo: Attrezzatura e limiti */}
      <Group
        title="Attrezzatura e limiti"
        editing={editing === "E"}
        disabled={editing !== null && editing !== "E"}
        onEdit={() => openEdit("E")}
      >
        {editing === "E" ? (
          <DossierEquipment form={form} update={update} />
        ) : (
          <div className="divide-y divide-border">
            <Row label="Rulli indoor" value={yesNo(saved.ha_rulli)} />
            <Row
              label="Misuratore potenza"
              value={yesNo(saved.ha_misuratore_potenza)}
            />
            <Row label="Fascia cardio" value={yesNo(saved.ha_fascia_cardio)} />
            <Row label="Smartwatch" value={yesNo(saved.ha_smartwatch)} />
            <Row
              label="Indoor / outdoor"
              value={optLabel(INDOOR_OUTDOOR_OPTIONS, saved.indoor_outdoor)}
            />
            <Row label="Infortuni attuali" value={text(saved.infortuni_attuali)} />
            <Row label="Dolore attuale" value={text(saved.dolore_attuale)} />
            <Row
              label="Preferenze allenamento"
              value={text(saved.preferenze_allenamento)}
            />
            <Row label="Limiti principali" value={text(saved.limiti_principali)} />
            <Row label="Note personali" value={text(saved.note_personali)} />
          </div>
        )}
      </Group>

      {/* Barra di salvataggio: solo quando un gruppo è in modifica */}
      {editing !== null && (
        <div className="sticky bottom-20 flex items-center justify-end gap-3 rounded-[18px] border border-border bg-base/95 px-4 py-3 backdrop-blur-xl">
          {error && <span className="text-sm text-ready-skip">{error}</span>}
          <Button variant="outline" onClick={cancel} disabled={saving}>
            Annulla
          </Button>
          <Button
            onClick={() => void handleSave()}
            disabled={saving || form.nome.trim() === ""}
          >
            {saving ? "Salvo…" : "Salva"}
          </Button>
        </div>
      )}

      {justSaved && editing === null && (
        <p className="text-right text-sm text-ready-go">Salvato ✓</p>
      )}
    </>
  );
}

/** Card-gruppo con intestazione e tasto matita ✎. */
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
