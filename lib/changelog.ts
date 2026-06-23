export const APP_VERSION = "1.2.0";

export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  items: { type: "new" | "fix" | "improve"; text: string }[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "1.2.0",
    date: "24 giu 2026",
    title: "Profilo corsa: Critical Speed e D′",
    items: [
      { type: "new", text: "Profilo dedicato per i runner: Critical Speed (CS) e D′ letti dalla tua curva pace su Intervals.icu" },
      { type: "new", text: "Predizioni gara da 400 m alla 50 km, con il modello fisiologico giusto per ogni distanza" },
      { type: "new", text: "Zone di passo, domini d'intensità, LT1 stimato e indice di resistenza alla fatica" },
      { type: "improve", text: "La scheda atleta si adatta allo sport: i ciclisti vedono CP/W′, i runner CS/D′" },
    ],
  },
  {
    version: "1.1.0",
    date: "23 giu 2026",
    title: "Tour guidato e sessione persistente",
    items: [
      { type: "new", text: "Tour interattivo al primo accesso: ti guida attraverso dashboard, piano e profilo" },
      { type: "new", text: "Accesso persistente — puoi scegliere «Ricordami» nel login per non inserire la password ogni volta" },
      { type: "new", text: "Pagina di registrazione: avviso sui prerequisiti (account Intervals.icu e dispositivi collegati)" },
      { type: "improve", text: "Il tour viene mostrato una sola volta per account, non per dispositivo" },
    ],
  },
];

export const LATEST = CHANGELOG[0];
