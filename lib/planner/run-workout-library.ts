/**
 * Run Workout Library — catalogo template per la CORSA.
 *
 * Struttura parallela a workout-library.ts (ciclismo): stessi campi,
 * stessa convenzione id/domain/is_hard_session/work_minutes/est_total_minutes.
 * I domain condivisi (endurance, tempo, sweet_spot, threshold, vo2max,
 * anaerobic, race_specific) hanno la stessa semantica fisiologica; le zone
 * fanno riferimento alle zone Intervals.icu dell'atleta (FC o passo).
 *
 * Note fisiologiche corsa vs ciclismo (WORKOUT_REFERENCE.md §6.2):
 *  - L'impatto genera più stress muscolare per ora rispetto alla bici.
 *  - Le sedute dure richiedono spacing ≥48h (stessa regola §3.1).
 *  - Il lungo accumula fatica muscolare: non precedere con seduta dura.
 *  - WU/CD standard: 10–15′ corsa facile prima e dopo le strutturate.
 */

export type RunWorkoutDomain =
  | "endurance"
  | "tempo"
  | "sweet_spot"
  | "threshold"
  | "vo2max"
  | "anaerobic"
  | "race_specific"
  | "strength_endurance";

export interface RunWorkoutTemplate {
  id: string;
  title: string;
  domain: RunWorkoutDomain;
  is_hard_session: boolean;
  work_minutes: number;
  est_total_minutes: number;
  zones: string;
  power_target_zone: string; // "passo target" per la corsa
  hr_target_zone: string;
  rpe_target: string;
  structure: string;
  duration_label: string;
  coaching_notes: string;
  select_when: string;
  optional?: boolean;
}

export const RUN_WORKOUT_TEMPLATES: RunWorkoutTemplate[] = [
  // --- RA. Aerobic / Endurance (Z1–Z2) --------------------------------------
  {
    id: "RA-1",
    title: "Corsa facile (breve)",
    domain: "endurance",
    is_hard_session: false,
    work_minutes: 40,
    est_total_minutes: 40,
    zones: "Z2 (passo facile, conversazionale)",
    power_target_zone: "Z2 (passo aerobico)",
    hr_target_zone: "Z2 (aerobico, <75% FCmax)",
    rpe_target: "RPE 3–4",
    structure: "Corsa continua a passo controllato",
    duration_label: "30–50 min",
    coaching_notes:
      "Passo conversazionale: dovresti poter parlare a frasi complete. FC stabile. Non spingere nella seconda metà.",
    select_when: "Mantenimento aerobico infrasettimanale, recupero attivo, o tempo limitato.",
  },
  {
    id: "RA-2",
    title: "Corsa facile (media)",
    domain: "endurance",
    is_hard_session: false,
    work_minutes: 60,
    est_total_minutes: 60,
    zones: "Z2",
    power_target_zone: "Z2 (passo aerobico)",
    hr_target_zone: "Z2 (aerobico)",
    rpe_target: "RPE 3–4",
    structure: "Corsa continua a passo Z2 costante",
    duration_label: "50–75 min",
    coaching_notes:
      "Seduta chiave per il volume aerobico. Monitora il cardiac drift: se la FC sale >8% a passo stabile, segnale di durabilità da monitorare.",
    select_when: "Giornata endurance standard in fase Base o Build.",
  },
  {
    id: "RA-3",
    title: "Lungo di durabilità",
    domain: "endurance",
    is_hard_session: false,
    work_minutes: 100,
    est_total_minutes: 100,
    zones: "Z1–Z2 (prevalentemente Z2, con i primi 10–15′ in Z1)",
    power_target_zone: "Z1–Z2 (passo facile/aerobico)",
    hr_target_zone: "Z1–Z2 (aerobico)",
    rpe_target: "RPE 3–5",
    structure: "Corsa continua con eventuali accelerazioni Z2-alto negli ultimi 15–20′",
    duration_label: "80–130 min",
    coaching_notes:
      "Il lungo settimanale. Lo stress da impatto lo rende più faticoso del lungo in bici: rifornimento idrico critico da 60′ in poi. Non esagerare con il passo: è un allenamento di durabilità, non di resistenza.",
    select_when: "Slot del lungo settimanale (tipicamente weekend). Richiede RI ≥ 0.8.",
  },
  {
    id: "RA-4",
    title: "Recupero attivo (corsa)",
    domain: "endurance",
    is_hard_session: false,
    work_minutes: 30,
    est_total_minutes: 30,
    zones: "Solo Z1 (jogging molto leggero)",
    power_target_zone: "Z1 (jogging leggero)",
    hr_target_zone: "Z1 (<65% FCmax)",
    rpe_target: "RPE 1–2",
    structure: "Jogging molto lento e continuo",
    duration_label: "20–40 min",
    coaching_notes:
      "Davvero facile. Se il passo minimo causa fatica alle gambe, sostituisci con camminata o riposo completo. Il recupero attivo in corsa genera più stress muscolare che in bici.",
    select_when: "Giorno dopo una seduta dura, fatica elevata, o carico cumulativo alto.",
  },
  {
    id: "RA-5",
    title: "Corsa progressiva",
    domain: "endurance",
    is_hard_session: false,
    work_minutes: 55,
    est_total_minutes: 55,
    zones: "Inizio Z2-basso, fine Z2-alto/Z3-basso, step ogni 15–20′",
    power_target_zone: "Z2 progressivo → Z3-basso",
    hr_target_zone: "Z2 → Z3-basso",
    rpe_target: "RPE 4–6",
    structure: "Corsa continua con 2–3 accelerazioni graduali (es. 3 × 18′ a passo crescente)",
    duration_label: "45–70 min",
    coaching_notes:
      "Stimolo di durabilità gentile: la progressione è sottile, la seduta resta aerobica. Monitora FC:passo tra gli step.",
    select_when:
      "Quando vuoi stress di durabilità senza un finale a passo gara: readiness moderata, o come passo prima di RA-6.",
  },
  {
    id: "RA-6",
    title: "Lungo con finale a passo maratona/HM",
    domain: "endurance",
    is_hard_session: true,
    work_minutes: 95,
    est_total_minutes: 95,
    zones: "Z1–Z2 per i primi 60–70′, poi Z3 (passo gara lungo) negli ultimi 20–30′",
    power_target_zone: "Z1–Z2 → Z3 finale (passo maratona/HM)",
    hr_target_zone: "Z2 → Z3",
    rpe_target: "RPE 4 → 6–7 nel finale",
    structure:
      "Lungo continuo con deliberata accelerazione al passo gara nell'ultimo blocco",
    duration_label: "80–120′ totali",
    coaching_notes:
      "Il finale a passo gara colpisce la durabilità sotto fatica: l'atleta deve tenere il ritmo obiettivo con le gambe già affaticate. Conta nel tempo Z3+ settimanale. Rifornimento critico. Occupa uno slot di seduta dura.",
    select_when:
      "Fase Base tardiva e Build per maratona, mezza maratona, trail lungo. Richiede RI ≥ 0.8.",
  },
  // --- RB. Tempo / Sweet Spot / Threshold (Z3–Z4) ---------------------------
  {
    id: "RS-1",
    title: "Tempo run sostenuto",
    domain: "sweet_spot",
    is_hard_session: true,
    work_minutes: 30,
    est_total_minutes: 55,
    zones: "Z3–Z4 (passo soglia lattato, comfortably hard)",
    power_target_zone: "Z3–Z4 (passo soglia)",
    hr_target_zone: "Z3–Z4 (~80–88% FCmax)",
    rpe_target: "RPE 7–8",
    structure: "1 blocco continuo di 20–40′ a passo soglia costante",
    duration_label: "20–40′ di lavoro",
    coaching_notes:
      "Il passo deve essere sostenibile per 45–60′ in gara. RPE 7–8/10: puoi parlare solo in frasi brevi. Costanza di passo più importante della velocità assoluta.",
    select_when: "Slot di seduta strutturata in Build. Formato soglia di default per la corsa.",
  },
  {
    id: "RS-2",
    title: "Cruise intervals",
    domain: "sweet_spot",
    is_hard_session: true,
    work_minutes: 30,
    est_total_minutes: 55,
    zones: "Z3–Z4 (passo soglia)",
    power_target_zone: "Z3–Z4 (passo soglia)",
    hr_target_zone: "Z3–Z4",
    rpe_target: "RPE 7–8",
    structure: "3–4 × 8–10′ a passo soglia, con 2–3′ di recupero jogging tra i blocchi",
    duration_label: "25–35′ di lavoro",
    coaching_notes:
      "I recuperi brevi (2–3′) sono voluti: non arrivi riposato al blocco successivo. Accumula tempo a passo soglia mantenendo la qualità. Se il passo cala >5″/km tra il primo e l'ultimo blocco, il target è troppo alto.",
    select_when: "Alternativa a RS-1 con più varietà, o quando i blocchi continui lunghi abbassano il passo.",
  },
  {
    id: "RS-3",
    title: "Fartlek strutturato",
    domain: "tempo",
    is_hard_session: true,
    work_minutes: 35,
    est_total_minutes: 55,
    zones: "Base Z2 con accelerazioni Z3–Z4",
    power_target_zone: "Z2 base con picchi Z3–Z4",
    hr_target_zone: "Z2 con picchi Z3–Z4",
    rpe_target: "variabile (RPE 4 base, 7–8 nelle accelerazioni)",
    structure:
      "45–60′ di corsa con 6–8 × 1–2′ di accelerazioni a passo soglia/più veloce, a intervalli irregolari. Recupero a Z2 tra le accelerazioni.",
    duration_label: "45–60′ totali",
    coaching_notes:
      "Simula le variazioni di passo di una gara su trail o di gruppo. Le transizioni ripetute da facile a duro sono lo stimolo chiave. I tratti Z2 devono restare davvero comodi.",
    select_when: "Build medio-tardiva. Più adatto a trail e corsa su percorsi variati.",
  },
  {
    id: "RS-4",
    title: "Threshold intervals (variante moderata)",
    domain: "tempo",
    is_hard_session: true,
    work_minutes: 40,
    est_total_minutes: 65,
    zones: "Z3 (passo maratona/lungo, sotto soglia)",
    power_target_zone: "Z3 (passo maratona/lungo)",
    hr_target_zone: "Z3 (~75–82% FCmax)",
    rpe_target: "RPE 5–6",
    structure: "2–3 × 12–15′, con 4–5′ di recupero jogging tra i blocchi",
    duration_label: "30–50′ di lavoro",
    coaching_notes:
      "Per chi costruisce verso RS-1 ma non è pronto al passo soglia sostenuto. Adatto quando la readiness suggerisce una giornata moderata invece che dura.",
    select_when:
      "Transizione Base/Build iniziale, o giornate con readiness MODIFY invece che GO.",
  },
  // --- RC. VO₂max (Z5) -------------------------------------------------------
  {
    id: "RV-1",
    title: "Ripetute VO₂max classiche",
    domain: "vo2max",
    is_hard_session: true,
    work_minutes: 20,
    est_total_minutes: 50,
    zones: "Z5 (passo 3–5 km gara, >90% FCmax)",
    power_target_zone: "Z5 (passo 3–5 km)",
    hr_target_zone: "Z5 (>90% FCmax)",
    rpe_target: "RPE 9",
    structure: "4–6 × 3–4′, con 2–3′ di recupero jogging tra le ripetute (rapporto ~1:1)",
    duration_label: "15–25′ di lavoro",
    coaching_notes:
      "Formato VO₂max gold standard per la corsa. Il recupero deve essere abbastanza facile da permettere il pieno impegno sulla ripetuta successiva. Se il passo cala >5″/km tra la prima e l'ultima ripetuta, ferma la seduta.",
    select_when:
      "Formato VO₂max di default in Build. Servono ≥4 settimane di lavoro a soglia (RS-1/RS-2) prima.",
  },
  {
    id: "RV-2",
    title: "Short-short (30/30 o 1′/1′)",
    domain: "vo2max",
    is_hard_session: true,
    work_minutes: 20,
    est_total_minutes: 45,
    zones: "Z5–Z6 nel lavoro, Z1–Z2 nel recupero",
    power_target_zone: "Z5–Z6 (passo 1 km / più veloce)",
    hr_target_zone: "Z5 (>90% FCmax)",
    rpe_target: "RPE 9",
    structure:
      "2–3 set da 8–10 ripetizioni di 30″ on / 30″ off (o 1′ on / 1′ off). 4–5′ di jogging tra i set.",
    duration_label: "15–25′ di lavoro accumulato",
    coaching_notes:
      "Sfrutta la componente lenta del VO₂max: l'ossigeno resta elevato nei brevi recuperi. Spesso più tollerabile dei lunghi interval. Il passo negli 'on' sarà più veloce di RV-1.",
    select_when:
      "Alternativa a RV-1 se l'atleta fatica sui blocchi lunghi, o per varietà. Efficace con poco tempo disponibile.",
  },
  {
    id: "RV-3",
    title: "Ripetute su salita (hill repeats)",
    domain: "vo2max",
    is_hard_session: true,
    work_minutes: 20,
    est_total_minutes: 50,
    zones: "Z5 (sforzo massimo sulla salita, ~90–95% FCmax)",
    power_target_zone: "Z5 (sforzo massimo in salita)",
    hr_target_zone: "Z5 (>90% FCmax)",
    rpe_target: "RPE 9",
    structure:
      "8–12 × 60–90″ su salita al massimo sforzo sostenibile, discesa jogging come recupero (2–3′). Recupero pieno tra le ripetute.",
    duration_label: "8–18′ di lavoro (in un run più lungo)",
    coaching_notes:
      "Le salite riducono l'impatto per ripetuta rispetto alla pista, reclutano più fibre di tipo II e allenano la forza-resistenza. Focus sulla postura: busto leggermente inclinato in avanti, braccia attive. Sessione totale con riscaldamento Z2: 45–55′.",
    select_when:
      "Build/Peak per atleti con trail o gare collinari in programma. Utile anche come primo approccio al VO₂max con meno impatto.",
  },
  // --- RD. Anaerobic / Neuromuscular (Z6–Z7) --------------------------------
  {
    id: "RN-1",
    title: "Strides / accelerazioni brevi",
    domain: "anaerobic",
    is_hard_session: false,
    work_minutes: 5,
    est_total_minutes: 35,
    zones: "Z6–Z7 (accelerazioni controllate, non sprint massimale)",
    power_target_zone: "Z6 (passo 800m–1 km, controllato)",
    hr_target_zone: "non indicativa (sforzi brevi)",
    rpe_target: "RPE 8–9 (controllato, non massimale)",
    structure:
      "6–8 × 20–30″ di accelerazione progressiva (non sprint full-out), con 60–90″ di camminata/jogging tra le ripetute. Inseriti alla fine di una corsa facile.",
    duration_label: "4–6′ di lavoro (in una corsa più lunga)",
    coaching_notes:
      "Non sono sprint massimali: l'accelerazione è progressiva, arrivando al 90–95% verso la fine dei 20–30″. Migliorano la meccanica di corsa e la reattività neuromuscolare. Nessuna fatica muscolare significativa se eseguiti correttamente.",
    select_when:
      "2–3 volte a settimana, al termine di una corsa facile. Utile in tutte le fasi per mantenere la meccanica.",
  },
  {
    id: "RN-2",
    title: "Sprint intervals",
    domain: "anaerobic",
    is_hard_session: true,
    work_minutes: 5,
    est_total_minutes: 45,
    zones: "Z7 (massimale)",
    power_target_zone: "Z7 (sprint massimale)",
    hr_target_zone: "non indicativa (sprint)",
    rpe_target: "RPE 10",
    structure:
      "4–6 × 8–10″ all-out in pianura o leggera discesa, con 3–4′ di jogging Z1 tra gli sforzi (dentro un run Z1–Z2 di 30–40′).",
    duration_label: "~3–5′ di lavoro",
    coaching_notes:
      "Lavoro neuromuscolare puro: recupero completo, reclutamento massimale. Da fare freschi, dopo il riscaldamento. L'impatto degli sprint è alto: non inserire il giorno prima o dopo un lungo.",
    select_when:
      "Raramente. Gare con volata finale o scatti ripetuti. Max una volta a settimana.",
  },
  // --- RE. Race-Specific ----------------------------------------------------
  {
    id: "RR-1",
    title: "Corsa a ritmo gara (race-pace run)",
    domain: "race_specific",
    is_hard_session: true,
    work_minutes: 25,
    est_total_minutes: 50,
    zones: "Z4 (passo gara obiettivo: 10 km/HM/maratona)",
    power_target_zone: "Z4 (passo gara obiettivo)",
    hr_target_zone: "Z4 (~85–92% FCmax per 10K, ~80–88% per HM)",
    rpe_target: "RPE 7–9 (dipende dalla distanza gara)",
    structure:
      "2–4 × 5–10′ a passo gara obiettivo, con 2–3′ di jogging tra i blocchi. Oppure 1 blocco continuo di 15–20′ a passo gara.",
    duration_label: "15–30′ di lavoro",
    coaching_notes:
      "Seduta di specificità: l'atleta impara il passo gara e la sensazione associata. Il passo deve essere quello della gara target — non più lento, non più veloce. Monitora la FC: a passo gara corretto, la FC si stabilizza entro 2–3′.",
    select_when:
      "Build medio-tardiva e Peak. Inserire quando l'obiettivo di gara è definito e le sedute di soglia sono consolidate.",
  },
  {
    id: "RR-2",
    title: "Opener pre-gara (corsa)",
    domain: "race_specific",
    is_hard_session: false,
    work_minutes: 30,
    est_total_minutes: 30,
    zones: "Z1–Z2 con brevi accelerazioni Z5",
    power_target_zone: "Z2 con opener Z5",
    hr_target_zone: "Z2 con brevi picchi",
    rpe_target: "RPE leggero, sensazioni «sharp»",
    structure:
      "25–35′ di jogging facile Z2 con 4–5 × 20″ a passo gara/più veloce. Recupero pieno (60–90″ jogging) tra le accelerazioni.",
    duration_label: "25–35′ totali",
    coaching_notes:
      "Attivazione pre-gara: primes neuromuscular and cardiovascular systems senza generare fatica. Deve sembrare leggero e reattivo. Non è un allenamento — non aggiungere volume.",
    select_when: "1–2 giorni prima della gara target, secondo il protocollo race-week.",
  },
];

const RUN_BY_ID: Record<string, RunWorkoutTemplate> = Object.fromEntries(
  RUN_WORKOUT_TEMPLATES.map((t) => [t.id, t])
);

export const VALID_RUN_LIBRARY_IDS: ReadonlySet<string> = new Set(
  RUN_WORKOUT_TEMPLATES.map((t) => t.id)
);

export function getRunTemplate(id: string): RunWorkoutTemplate | null {
  return RUN_BY_ID[id] ?? null;
}

export function isValidRunLibraryId(id: string): boolean {
  return VALID_RUN_LIBRARY_IDS.has(id);
}
