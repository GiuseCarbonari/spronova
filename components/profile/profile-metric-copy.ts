export const PROFILE_METRIC_COPY = {
  cp: {
    label: "Potenza di soglia",
    acronym: "CP",
    tooltip:
      "La potenza che riesci a tenere a lungo senza crollare. È il miglior indicatore della tua capacità di reggere ritmi alti in salita e nelle uscite lunghe.",
  },
  cpPowerLaw: {
    label: "Soglia (Power-law)",
    acronym: "CP",
    tooltip:
      "La stessa soglia stimata con un modello diverso (power-law), quello usato anche da strumenti come AnalyzeMe. Mentre il modello principale (Morton 3P di Intervals) include anche gli sprint e tende ad abbassare la soglia se la tua punta esplosiva è molto alta, la power-law pesa soprattutto gli sforzi da 5 a 60 minuti. Quando i due numeri divergono, quello più vicino alle tue uscite lunghe reali è di solito la power-law.",
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
