# Spronova vs TrainerRoad - Roadmap per fare meglio

Data: 2026-06-22

## Obiettivo

Costruire Spronova come alternativa TrainerRoad-like, ma con un vantaggio
chiaro: usare i dati Intervals.icu e il protocollo Section 11 per dare piani
adattivi, spiegabili, auditabili e piu specifici per evento reale, soprattutto
MTB, gravel ed endurance outdoor.

La promessa non deve essere solo "ti preparo un piano". Deve essere:

> Spronova impara da come rispondi agli allenamenti, adatta la settimana prima
> che la fatica esploda, collega ogni seduta al tuo evento e ti spiega il
> perche con dati verificabili.

## Fonti benchmark TrainerRoad

Fonti ufficiali e contenuti pubblici usati come benchmark:

- [TrainerRoad AI](https://www.trainerroad.com/blog/introducing-trainerroad-ai/)
- [Custom Training Plans](https://www.trainerroad.com/blog/how-trainerroad-plans-are-built-and-adapt-to-you/)
- [Training Simulation](https://www.trainerroad.com/blog/see-4-weeks-ahead-training-with-trainerroad-ais-new-training-simulation/)
- [Predicted Workout Difficulty](https://www.trainerroad.com/blog/train-prepared-how-predictive-workout-difficulty-helps-you-get-faster/)
- [Fatigue Detection](https://www.trainerroad.com/blog/recover-right-get-faster-updated-fatigue-detection-with-trainerroad-ai/)
- [AI Workout Alternates](https://www.trainerroad.com/blog/new-flexible-training-still-the-right-workout-ai-workout-alternates/)

## Come funziona TrainerRoad, in sintesi

TrainerRoad vince perche non e solo una libreria di workout. E un loop adattivo:

1. Crea un piano a partire da obiettivo, storico, disponibilita e tipo di atleta.
2. Sceglie workout coerenti con fase, FTP, progressione e capacita attuale.
3. Predice la difficolta della prossima seduta per quello specifico atleta.
4. Analizza ogni workout completato o fallito.
5. Aggiorna il piano futuro in base alla risposta dell'atleta.
6. Propone alternative se cambia tempo disponibile, fatica o contesto.
7. Simula le prossime settimane per mostrare cosa succede se il piano cambia.

Il prodotto percepito dall'utente e:

> Il piano capisce se sto migliorando, se sto andando oltre, e cosa devo fare
> domani per diventare piu forte.

## Stato attuale Spronova

Spronova ha gia pezzi importanti:

- Sync Intervals.icu.
- Readiness giornaliera Go / Modify / Skip.
- Planner settimanale deterministico.
- Workout Library Section 11.
- Push del piano su calendario Intervals.icu.
- Profilo atleta: CP, W', APR, fenotipo, RPP.
- Gap analysis su evento/percorso.
- Race estimate e calibrazione MTB.
- AI usata come narrativa vincolata, non come motore libero.
- Audit log tramite `coach_decisions` e `validation_metadata`.

Il gap principale rispetto a TrainerRoad:

- manca un sistema di progression levels per capacita allenante;
- manca l'analisi post-workout strutturata;
- manca una difficolta predetta per ogni seduta;
- manca il ricalcolo automatico del piano dopo ogni workout;
- mancano alternative adattive per la seduta del giorno;
- manca una simulazione 2-4 settimane;
- manca una UX esplicita: "il piano sta imparando da te".

## Strategia per fare meglio

Non copiare TrainerRoad punto per punto. Fare meglio in 5 aree.

### 1. Piu trasparenza

TrainerRoad e forte, ma spesso black-box. Spronova deve essere white-box:

- per ogni seduta: perche questa, perche oggi, perche questa durata;
- per ogni modifica: quale dato l'ha causata;
- per ogni livello atleta: cosa lo ha fatto salire o scendere;
- per ogni piano: quali regole Section 11 sono state applicate.

Output atteso:

> VO2 non aumentato: ultima seduta VO2 completata al 92%, RPE alto, HR drift
> elevato. Mantengo livello 3.2 e propongo una variante piu corta.

### 2. Piu specificita evento

TrainerRoad ottimizza molto bene fitness ciclistica generale. Spronova puo
specializzarsi su evento reale:

- salite lunghe;
- pendenze;
- strappi ripetuti;
- fatica al km X;
- richiesta W' cumulata;
- durabilita nella seconda meta;
- profilo MTB/gravel/trail.

Output atteso:

> Il tuo evento richiede 38-45 minuti cumulati di salita a intensita tempo/soglia
> dopo 2h30 di fatica. Questa settimana alleniamo sweet spot sotto fatica, non
> VO2 generico.

### 3. Piu integrazione con Intervals.icu

Spronova deve diventare il decision layer sopra Intervals.icu:

- legge storico, power curve, wellness e calendario;
- scrive sedute e modifiche;
- usa Intervals come fonte e destinazione;
- non chiede all'utente di migrare ecosistema.

Posizionamento:

> TrainerRoad e una piattaforma chiusa. Spronova e il coach adattivo per chi ha
> gia i propri dati su Intervals.icu.

### 4. Piu prudenza fisiologica

TrainerRoad e performance-first. Spronova puo essere performance + safety:

- readiness;
- HRV/RHR/sonno;
- ACWR/TSB;
- sintomi/dolore/RPE;
- regressione automatica quando segnali multipli peggiorano.

### 5. Piu personalizzazione del fenotipo

TrainerRoad ruota molto intorno a FTP e workout levels. Spronova puo usare:

- CP;
- W';
- APR;
- durabilita;
- RPP;
- HR drift;
- firma velocita/terreno;
- limitatori evento.

## Nuove feature proposte

### Feature 1 - Spronova Progression Levels

Obiettivo: creare livelli 0-10 per domini allenanti, simili a TrainerRoad
Progression Levels ma piu spiegabili e collegati al fenotipo.

Domini iniziali:

- endurance;
- tempo;
- sweet_spot;
- threshold;
- vo2max;
- anaerobic;
- durability;
- climbing;
- mtb_repeatability;
- race_specific.

Ogni livello deve avere:

- valore numerico;
- confidence;
- ultima seduta che lo ha modificato;
- motivo dell'ultimo aggiornamento;
- trend 28 giorni;
- sorgente dati.

Esempio:

```json
{
  "domain": "threshold",
  "level": 4.2,
  "confidence": "medium",
  "trend": "up",
  "last_reason": "TH-1 completato al 97%, RPE 7, HR drift basso",
  "updated_at": "2026-06-22T08:30:00Z"
}
```

### Feature 2 - Workout Outcome Analyzer

Obiettivo: dopo ogni sync Intervals, confrontare seduta pianificata e attivita
reale.

Input:

- seduta pianificata da `weekly_plans.sessions`;
- attivita Intervals dello stesso giorno;
- durata;
- compliance;
- potenza/HR se disponibili;
- RPE se disponibile;
- HR drift;
- eventuali intervalli completati;
- readiness del giorno;
- note o feeling utente.

Classificazione esito:

- completed_easy;
- completed_as_expected;
- completed_hard;
- partial;
- failed;
- skipped;
- replaced;
- unknown.

Output:

- workout outcome;
- modifica proposta ai progression levels;
- impatto sul piano;
- raccomandazione narrativa.

### Feature 3 - Predicted Workout Difficulty

Obiettivo: prima della seduta, dire quanto sara difficile per questo atleta.

Etichette:

- Easy;
- Productive;
- Stretch;
- Breakthrough;
- Risky.

Oppure in italiano:

- Facile;
- Produttiva;
- Impegnativa;
- Sblocco;
- Rischiosa.

Formula iniziale deterministica:

```text
difficulty_score =
  workout_level
  - athlete_domain_level
  + readiness_penalty
  + fatigue_penalty
  + duration_penalty
  + recent_failure_penalty
  - recent_success_bonus
```

Regole esempio:

- se score <= -1.0: Easy;
- tra -1.0 e +0.5: Productive;
- tra +0.5 e +1.5: Stretch;
- tra +1.5 e +2.5: Breakthrough;
- > +2.5: Risky.

Output UI:

> Difficolta prevista: Impegnativa.
> Motivo: livello sweet spot 3.8 vs seduta 4.5, readiness GO ma ATL in salita.

### Feature 4 - Adaptive Alternates

Obiettivo: bottone sulla seduta di oggi per cambiare piano senza rompere il
blocco.

Scelte utente:

- Ho meno tempo.
- Mi sento stanco.
- Voglio spingere.
- Devo allenarmi indoor.
- Ho saltato ieri.
- Dolore / fastidio.

Output:

- alternativa piu corta;
- alternativa piu facile;
- alternativa equivalente;
- alternativa piu dura solo se readiness e storico lo permettono;
- oppure skip protettivo.

Ogni alternativa deve conservare il training intent quando possibile:

- VO2 -> VO2 corto o tempo moderato, non lungo casuale;
- sweet spot -> tempo/sweet spot ridotto;
- lungo durability -> endurance corto o recovery, non sprint.

### Feature 5 - Adaptive Plan Reconciliation

Obiettivo: dopo ogni allenamento, non limitarsi a mostrare completamento.
Riconciliare la settimana.

Casi:

- workout completato meglio del previsto;
- workout completato ma troppo duro;
- workout fallito;
- workout saltato;
- workout sostituito da uscita libera;
- carico reale molto diverso dal previsto.

Azioni:

- mantenere piano;
- ridurre prossima seduta dura;
- spostare seduta;
- sostituire con recovery;
- mantenere lo stimolo ma tagliare durata;
- inserire un giorno facile;
- rigenerare settimana.

### Feature 6 - 4 Week Coach Simulation

Obiettivo: simulare 2-4 settimane con scenari diversi.

Scenari iniziali:

- piano attuale;
- riduci volume 20%;
- aumenta endurance;
- priorita evento;
- recupero conservativo;
- settimana saltata / viaggio;
- gara anticipata.

Output:

- ore previste;
- sedute dure;
- carico stimato;
- rischio fatica;
- domini allenati;
- progressione livelli attesa;
- copertura limitatori evento;
- raccomandazione.

Importante: iniziare deterministico, senza ML.

### Feature 7 - Event Demand Coverage

Obiettivo: mostrare quanto il piano copre le richieste dell'evento.

Metriche:

- long_climb_coverage;
- steep_pitch_coverage;
- repeatability_coverage;
- durability_coverage;
- descending/technical readiness, se dati disponibili;
- fueling/race duration risk, se stimabile.

Output:

> Copertura evento: 62%.
> Manca soprattutto durabilita in salita nella seconda meta. Il piano aggiunge
> AE-6 e SS-1 nelle prossime 3 settimane.

### Feature 8 - Coach Explainability Timeline

Obiettivo: una timeline che racconta perche il piano cambia.

Esempi:

- "Martedi: VO2 completato bene -> vo2max level +0.2"
- "Giovedi: RHR +6 bpm e HRV bassa -> sabato lungo declassato"
- "Domenica: lungo completato con drift basso -> durability +0.3"

Questa e una differenza chiave rispetto a black-box AI.

## Modifiche tecniche proposte

### Nuove tabelle Supabase

#### `athlete_progression_levels`

```sql
create table public.athlete_progression_levels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  domain text not null,
  level numeric not null default 1.0,
  confidence text not null default 'low',
  trend text,
  last_activity_id text,
  last_session_library_id text,
  last_reason text,
  evidence jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(user_id, domain)
);
```

#### `workout_outcomes`

```sql
create table public.workout_outcomes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  planned_date date not null,
  planned_library_id text,
  planned_session jsonb,
  activity_id text,
  outcome text not null,
  completion_pct numeric,
  duration_ratio numeric,
  intensity_match numeric,
  hr_drift numeric,
  rpe numeric,
  readiness_decision jsonb,
  level_delta jsonb not null default '{}'::jsonb,
  plan_impact jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '{}'::jsonb,
  analyzed_at timestamptz not null default now()
);
```

#### `workout_difficulty_predictions`

```sql
create table public.workout_difficulty_predictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  planned_date date not null,
  weekly_plan_id uuid references public.weekly_plans(id) on delete cascade,
  library_id text,
  domain text not null,
  workout_level numeric not null,
  athlete_level numeric,
  score numeric not null,
  label text not null,
  reasons jsonb not null default '[]'::jsonb,
  generated_at timestamptz not null default now()
);
```

#### `plan_simulations`

```sql
create table public.plan_simulations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  base_week_start date not null,
  horizon_weeks integer not null default 4,
  scenario text not null,
  result jsonb not null,
  recommendation text,
  generated_at timestamptz not null default now()
);
```

### Estensione Workout Library

Aggiungere ai template:

```ts
interface WorkoutTemplate {
  // gia presenti
  id: string;
  domain: WorkoutDomain;
  is_hard_session: boolean;
  est_total_minutes: number;

  // nuovi
  level: number;
  progression_domain: ProgressionDomain;
  fatigue_cost: 1 | 2 | 3 | 4 | 5;
  event_demands: string[];
  alternate_group: string;
}
```

Esempio:

```ts
{
  id: "SS-1",
  domain: "sweet_spot",
  level: 4.0,
  progression_domain: "sweet_spot",
  fatigue_cost: 3,
  event_demands: ["long_climb", "threshold_durability"],
  alternate_group: "sweet_spot_sustained"
}
```

### Nuovi moduli `lib/`

```text
lib/adaptation/progression-levels.ts
lib/adaptation/workout-outcome.ts
lib/adaptation/difficulty.ts
lib/adaptation/alternates.ts
lib/adaptation/reconcile-plan.ts
lib/adaptation/simulation.ts
lib/adaptation/event-coverage.ts
```

### Nuovi endpoint API

```text
POST /api/adaptation/analyze-outcomes
POST /api/adaptation/reconcile-week
POST /api/adaptation/alternates
POST /api/adaptation/simulate
GET  /api/adaptation/levels
```

## UX proposta

### Dashboard / Oggi

La dashboard deve diventare il centro decisionale:

- decisione GO / MODIFY / SKIP;
- seduta di oggi;
- difficolta prevista;
- motivo principale;
- alternative immediate;
- impatto sul piano se cambio;
- stato sync.

Layout:

```text
Oggi
GO
Sweet Spot sostenuto - 95 min
Difficolta prevista: Impegnativa

Perche:
- readiness GO;
- sweet spot level 3.8, seduta level 4.2;
- ultima seduta simile completata bene;
- ATL in salita, quindi niente progressione aggressiva.

[Falla] [Meno tempo] [Sono stanco] [Adatta]
```

### Piano

Aggiungere:

- difficulty badge su ogni giorno;
- predicted impact;
- ragione della seduta;
- bottone alternates;
- "cosa succede se salto questa".

### Profilo

Aggiungere tab "Levels":

- radar o lista livelli;
- trend;
- ultima prova;
- aree limitanti;
- suggerimenti collegati all'evento.

### Evento

Aggiungere "copertura piano":

- quali richieste evento sono allenate;
- quali sono scoperte;
- quali sedute le coprono;
- tempo stimato per chiudere i gap.

## Sequenza di implementazione consigliata

### Milestone A - Progression Levels v0

Obiettivo: rendere visibile che Spronova impara.

Implementare:

- migration `athlete_progression_levels`;
- inizializzazione livelli da profilo atleta e storico;
- mapping `library_id -> progression_domain + level`;
- UI base nel profilo.

Deliverable:

> "Threshold 3.8, VO2 2.9, Durability 4.1."

### Milestone B - Outcome Analyzer

Obiettivo: analizzare ogni seduta dopo sync.

Implementare:

- migration `workout_outcomes`;
- funzione `analyzeWorkoutOutcome()`;
- match planned session vs activity;
- classificazione outcome;
- update levels;
- audit in `coach_decisions`.

Deliverable:

> "Seduta completata come previsto. Sweet spot +0.2."

### Milestone C - Predicted Difficulty

Obiettivo: mostrare prima della seduta quanto sara impegnativa.

Implementare:

- funzione `predictWorkoutDifficulty()`;
- tabella opzionale o calcolo on-demand;
- badge UI in dashboard e piano.

Deliverable:

> "Difficolta prevista: Produttiva."

### Milestone D - Adaptive Alternates

Obiettivo: dare controllo pratico all'utente.

Implementare:

- endpoint alternates;
- gruppi alternativi per workout library;
- bottoni "meno tempo", "stanco", "indoor", "voglio spingere";
- preview impatto.

Deliverable:

> "Puoi fare SS-4 60 min invece di SS-1 95 min: stesso focus, minor costo."

### Milestone E - Reconcile Week

Obiettivo: aggiornare il piano quando la realta cambia.

Implementare:

- `reconcileWeekAfterOutcome()`;
- rigenerazione controllata solo dei giorni futuri;
- audit di ogni modifica;
- UI timeline.

Deliverable:

> "Hai saltato martedi: sposto il VO2 a giovedi e riduco sabato."

### Milestone F - 4 Week Simulation

Obiettivo: superare la UX TrainerRoad con una simulazione spiegabile.

Implementare:

- scenari deterministici;
- stima carico;
- stima livelli;
- copertura evento;
- rischio fatica.

Deliverable:

> "Scenario consigliato: riduci volume 15% questa settimana, poi build normale."

## Formula prodotto finale

Spronova deve diventare:

> TrainerRoad-like per adattivita, ma piu aperto, piu spiegabile e piu specifico
> per evento reale.

In una frase:

> Spronova prende i dati Intervals.icu, capisce la tua firma, simula il percorso
> verso l'obiettivo e adatta ogni settimana in base a come rispondi davvero.

## Priorita assoluta

La prima cosa da costruire non e la simulazione. E:

1. Progression Levels.
2. Workout Outcome Analyzer.
3. Predicted Workout Difficulty.

Questi tre pezzi cambiano la percezione del prodotto:

da:

> Spronova genera un piano.

a:

> Spronova impara da me e adatta il piano.

