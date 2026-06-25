export const PROFILE_METRIC_COPY = {
  cp: {
    label: "Potenza di soglia",
    acronym: "CP",
    tooltip:
      "La potenza che riesci a tenere a lungo senza crollare. È il miglior indicatore della tua capacità di reggere ritmi alti in salita e nelle uscite lunghe.",
  },
  wkg: {
    label: "Potenza per chilo",
    acronym: "W/kg",
    tooltip:
      "I tuoi watt divisi per il peso. È ciò che conta davvero in salita: a parità di watt, chi pesa meno sale più veloce.",
  },
  wprime: {
    label: "Batteria anaerobica",
    acronym: "W′",
    tooltip:
      "L'energia extra che puoi spendere negli scatti e negli sforzi brevi sopra la tua soglia. Come una batteria: si scarica con gli sforzi intensi e si ricarica quando rallenti.",
  },
  apr: {
    label: "Riserva di scatto",
    acronym: "APR",
    tooltip:
      "Quanto la tua punta di sprint supera la tua soglia. Alta = sei esplosivo. È la dote dei velocisti e dei puncheur.",
  },
} as const;
