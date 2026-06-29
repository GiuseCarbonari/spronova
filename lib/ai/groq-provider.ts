import Anthropic from "@anthropic-ai/sdk";
import Groq from "groq-sdk";

import type { CoachContext, PlannedSession } from "./coach-context";

/**
 * Astrazione provider AI per i tre commenti (OGGI, PROFILO, PERCORSO).
 *
 * Switch tra Anthropic (default) e Groq (env COACH_AI_PROVIDER=groq).
 * Max tokens: Groq 500 / Anthropic 800 → commenti di media lunghezza (~120-150 parole).
 * Nessun numero inventato — solo spiegazione e consigli dai dati forniti.
 */

export type CommentSection = "oggi" | "profilo" | "percorso";

export interface AICommentInput {
  section: CommentSection;
  payload: Record<string, unknown>;
}

export interface AICommentOutput {
  comment: string;
  tokens_used: { prompt: number; completion: number };
}

/** Provider attivo. Default groq: è il provider di produzione (vedi env). */
function activeProvider(): "groq" | "anthropic" {
  return process.env.COACH_AI_PROVIDER === "anthropic" ? "anthropic" : "groq";
}

/**
 * Verifica se AI è configurata: la chiave deve corrispondere al provider
 * SELEZIONATO, non a uno qualsiasi. Altrimenti isAIConfigured() mente (true) e
 * generateComment() fallisce con 502 (bug: errore dal telefono, ok in locale).
 */
export function isAIConfigured(): boolean {
  return activeProvider() === "anthropic"
    ? Boolean(process.env.ANTHROPIC_API_KEY)
    : Boolean(process.env.GROQ_API_KEY);
}

/**
 * Genera commento per sezione. Switch automatico Anthropic/Groq.
 * Lancia "AI_NOT_CONFIGURED" se nessuna API key.
 */
export async function generateComment(input: AICommentInput): Promise<AICommentOutput> {
  if (activeProvider() === "anthropic") {
    return generateCommentAnthropic(input);
  }
  return generateCommentGroq(input);
}

// --- ANTHROPIC -----------------------------------------------------------------

const MODEL_ANTHROPIC = "claude-sonnet-4-6";
const MAX_TOKENS = 800;
// Groq usa un budget più stretto: commenti di media lunghezza, modello economico.
const MAX_TOKENS_GROQ = 500;

const SYSTEM_PROMPTS: Record<CommentSection, string> = {
  oggi: `Sei un coach ciclismo che conosce l'atleta da anni. Commenta lo stato OGGI in modo naturale e conversazionale, senza asterischi, numeri o elenchi. Parla come un amico esperto.

Guarda i dati: readiness (decision, confidence), forma (CTL), fatica (ATL), freschezza (TSB), HRV, RHR, sonno, trend 14gg di CTL/ATL/HRV, seduta prevista, infortunio.

Analizza il quadro completo: come sta davvero oggi? È un giorno di forma oppure di recupero? Cosa dicono i segnali biologici? L'HRV è stabile o scende? Il sonno è stato buono? La forma è in crescita o stabile? Come si posiziona la seduta di oggi rispetto a questo stato?

Poi dai un consiglio pratico e personale: se readiness è GO, di' che può spingere; se CAUTION, avvertilo di stare attento; se STOP, suggerisci riposo. Se HRV scende o sonno è basso, menzioni il recupero. Se infortunio è attivo, SOLO prescrizioni mediche, zero workout.

TONO: Amico mentore che conosce i dati. Naturale, discorsivo, non tecnico, no elenchi. Max 130 parole: leggi lo stato di oggi e dai un consiglio pratico, senza preamboli inutili. Italiano.`,
  profilo: `Sei un coach che analizza il profilo di potenza di un atleta.

ANALIZZA in questo ordine:
1. **Fenotipo:** Cosa SIGNIFICA il suo tipo? (es: all-rounder=forte su tutti gli sforzi ma non dominante su nulla; sprinter=esplosivo ma debole sui lunghi; climber=resistenza montagna ma scarso su pianura)
2. **CP e W′:** Cosa raccontano questi valori? È forte in potenza ma carente in resistenza? Viceversa?
3. **Punti forti e limitatori:** Basandoti sul fenotipo, cosa dovrebbe allenare prioritariamente?
4. **RPP trend 14gg:** Sta migliorando o crollando? Su quali durate specifiche?
5. **Implicazioni di trend:** Se peggiora, quali cause sono probabili? (troppi gare, non abbastanza base aerobica, sovraccarico, riposo insufficiente)

CONSIGLI CONCRETI (scegli quello rilevante):
- Se trend negativo: "RPP in calo su 1min. Stai facendo troppi intervalli hard? Torna ai lunghi aerobici 3-4x/settimana."
- Se all-rounder stabile: "Profilo completo e stabile. Hai libertà di lavorare su qualsiasi limitatore senza rischiare squilibri."
- Se sprinter puro: "Punti forti sui 30s–1min. Lavora su resistenza aerobica 4–6min per diventare più completo e versatile."
- Se climber dominante: "Forte in montagna ma vulnerabile in pianura veloce. Sviluppa capacità anaerobica, 2x/settimana sprint brevi."

TONO: Tecnico ma accessibile, naturale e discorsivo come un coach che parla all'atleta. Stai raccontando cosa significa il suo profilo e come migliorarlo. NIENTE asterischi, grassetto, titoli o elenchi puntati: solo prosa scorrevole. Max 120 parole: fenotipo, limitatori principali e i consigli più rilevanti, senza preamboli inutili. Italiano.`,
  percorso: `Sei un coach che prepara un atleta per una gara specifica.

ANALIZZA in questo ordine:
1. **Tipo di gara:** Pianeggiante? Salite lunghe? Montagna? Cosa determina la difficoltà?
2. **Dove sarà difficile:** Quali sono le salite critiche? A che km? Categoria (moderata/dura/molto dura)? Lunghe o brevi?
3. **Fenotipo vs percorso:** Il suo tipo è adatto a questo percorso? (Es: all-rounder su salite lunghe va bene; sprinter su montagna fatica)
4. **Limitatori specifici:** Secondo gap-analysis, dove manca (potenza, resistenza, capacità aerobica)?
5. **Nutrizione:** Basandoti su durata totale e clima, quanta energia serve? Tipo di carboidrati?
6. **Pacing strategico:** Dove mantenere, dove risparmiare, dove attaccare in base al fenotipo.
7. **Recupero post-gara:** Quanti giorni riposo? Quando riprendere allenamenti? Cosa mangiare nelle 2h dopo?

CONSIGLI CONCRETI (adatta al percorso):
- Esempio pianura: "Gara veloce 2.5h. Vostro fenotipo all-rounder è ideale. Mantenetevi nel gruppo fino ai 5km finali, poi attacco deciso."
- Esempio salite medie: "Gara di 3h con 1500m D+. Nutrizione: 2 barre energetiche + 2 gels + 500ml isotonica. Attaccate in discesa (vostro punto forte), non in salita."
- Esempio montagna: "Gara di 5h in montagna. Voi siete all-rounder, altri sono specialisti. Gara tattica: stare con i gruppi in salita, attaccare quando loro calano. Recupero: riposo attivo 48h, reidratazione salata nei primi 30min."

TONO: Tattico, specifico, confidente, naturale e discorsivo come un coach che parla all'atleta. Stai preparando l'atleta a gareggiare e vincere. NIENTE asterischi, grassetto, titoli o elenchi puntati: solo prosa scorrevole. Max 150 parole: tipo di gara, punti critici, pacing e nutrizione, senza preamboli inutili. Italiano.`,
};

async function generateCommentAnthropic(input: AICommentInput): Promise<AICommentOutput> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("AI_NOT_CONFIGURED");

  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: MODEL_ANTHROPIC,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPTS[input.section],
    messages: [
      {
        role: "user",
        content: `Ecco i dati già calcolati (in JSON). Commenta usando SOLO questi numeri, non aggiungerne altri.\n\n${JSON.stringify(input.payload, null, 2)}`,
      },
    ],
  });

  const comment = cleanComment(
    response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
  );

  return {
    comment,
    tokens_used: {
      prompt: response.usage?.input_tokens || 0,
      completion: response.usage?.output_tokens || 0,
    },
  };
}

/**
 * Pulisce l'output: rimuove il blocco <think> dei reasoning model (qwen) e gli
 * asterischi markdown (**bold**, * elenco) lasciando prosa naturale.
 */
function cleanComment(raw: string): string {
  return raw
    .replace(/<think>[\s\S]*?<\/think>/gi, "") // blocco reasoning
    .replace(/^\s*<think>[\s\S]*/i, "") // <think> aperto senza chiusura
    .replace(/\*+/g, "") // asterischi markdown
    .trim();
}

// --- GROQ -----------------------------------------------------------------------

async function generateCommentGroq(input: AICommentInput): Promise<AICommentOutput> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("AI_NOT_CONFIGURED");

  const groq = new Groq({ apiKey });

  const response = await groq.chat.completions.create({
    model: "llama-3.1-8b-instant",
    max_tokens: MAX_TOKENS_GROQ,
    messages: [
      {
        role: "system",
        content: SYSTEM_PROMPTS[input.section],
      },
      {
        role: "user",
        content: `Ecco i dati già calcolati (in JSON). Commenta usando SOLO questi numeri, non aggiungerne altri.\n\n${JSON.stringify(input.payload, null, 2)}`,
      },
    ],
  });

  if (!response.choices || response.choices.length === 0) {
    throw new Error("GROQ_EMPTY_RESPONSE: no choices in response");
  }

  const raw = response.choices[0].message?.content;
  if (!raw) {
    throw new Error("GROQ_EMPTY_CONTENT: message content is empty");
  }
  if (response.choices[0].finish_reason === "length") {
    console.warn(`Commento ${input.section} troncato da Groq (max_tokens raggiunto)`);
  }
  const comment = cleanComment(raw);

  return {
    comment,
    tokens_used: {
      prompt: response.usage?.prompt_tokens || 0,
      completion: response.usage?.completion_tokens || 0,
    },
  };
}

// --- COACH Q&A + REPORT PRE-ALLENAMENTO ----------------------------------------

export interface CoachAnswerOutput {
  answer: string;
  tokens_used: { prompt: number; completion: number };
}

export interface PreWorkoutReportOutput {
  report: string;
  tokens_used: { prompt: number; completion: number };
}

/** Regole ferme condivise da Q&A e report (verificabilità Section 11). */
const COACH_BASE_RULES = `Sei un coach di endurance esperto. Rispondi in italiano, tono coach professionale, conciso e diretto, in prosa scorrevole (niente markdown, asterischi o elenchi puntati).

GLOSSARIO (cosa sono i dati che ricevi — usa questi significati, non interpretarli a caso):
- CTL = forma/fitness accumulata (un NUMERO puro, NON una percentuale). Più alto = più allenato.
- ATL = fatica recente accumulata (un NUMERO, NON una percentuale). È uno stato, NON qualcosa che "si allena".
- TSB = freschezza (CTL meno ATL): positivo = fresco/riposato, negativo = affaticato.
- ACWR = rapporto carico acuto/cronico: indica se stai aumentando il carico troppo in fretta.
- readiness.decision = il verdetto del giorno (GO = puoi spingere, CAUTION/MODIFY = prudenza, STOP/SKIP = riposo).
- HRV = variabilità cardiaca (recupero del sistema nervoso); RHR = frequenza a riposo.
- phenotype/fenotipo = tipo di atleta (es. puncheur, scalatore, passista): descrive i punti forti, NON è un'area da allenare.
- CP/W′ = soglia di potenza e capacità anaerobica. FTP = soglia funzionale dichiarata nel dossier.
- power_curve_current / power_curve_best_1y = profilo di potenza per durata (la curva RPP). Ogni voce ha una durata (label: "5s", "1min", "20min", "60min"...) e i WATT (e i W/kg) che l'atleta sostiene per quella durata. NON sono percentuali. "current" = forma attuale; "best_1y" = il tuo miglior valore nell'ultimo anno (riferimento/potenziale).
- gap_limiters = punti deboli rilevati dall'ultima analisi di una gara (se presente): name = cosa manca, severity = quanto è grave (high/medium/low), gap_wkg = quanti W/kg mancano, training_lever = la leva di allenamento, evidence = la prova in parole.

REGOLE FERME (non violarle mai):
1. NON calcolare e NON inventare numeri (watt, FC, TSS, ACWR, date, distanze). Usa SOLO i valori presenti nel JSON di contesto. Se un numero non c'è, non inventarlo: dillo.
2. NON nominare MAI all'atleta i nomi tecnici dei campi del JSON (es. "injured_today", "ctl", "atl", "tsb", "data_freshness", "planned_session"). Sono nomi interni di programmazione: traducili sempre in linguaggio umano (es. "sei infortunato", "la tua forma", "la fatica accumulata", "la freschezza"). Parla come un coach a voce, non leggere variabili.
3. NON aggiungere il simbolo "%" a valori che non sono percentuali: CTL, ATL, TSB, FC, watt e TSS sono numeri, non percentuali. Riportali come numeri (es. "la tua forma è a 29", non "29%").
4. VERIFICABILITÀ: ogni raccomandazione deve citare i dati su cui si fonda, ma in parole umane (es. "sei in forma GO con una forma a 62, in fase di build" — NON "readiness GO, ctl 62"). Sii specifico e ancorato ai dati senza esporre i nomi dei campi.
5. CONTEXT INTEGRITY: rispetta obiettivi, gara e soglie del dossier e la fase corrente. Non proporre carichi che li violano. Se il dossier è incompleto (obiettivi/gara/soglie a null), NON inventarli: lavora sui dati presenti e, se serve, chiedi all'atleta di completare il dossier.
6. FRESHNESS: se i dati risultano non aggiornati (stale) oppure manca la readiness (dati non sincronizzati), avvisa che potrebbero non essere aggiornati e suggerisci un refresh ("Aggiorna dati") prima di consigli vincolanti.
7. INFORTUNIO: se l'atleta è infortunato oggi, dai SOLO indicazioni di recupero e gestione dell'infortunio. NON proporre allenamenti, NEMMENO in forma ipotetica ("se dovessi allenare..."): niente workout di alcun tipo finché è infortunato.
8. Non citare "Section 11" né "secondo il protocollo" all'atleta: parla come un coach, non come un documento.
9. CURVA DI POTENZA — come leggerla per dire all'atleta cosa allenare di più:
   - I valori sono WATT (e W/kg), MAI percentuali. Non aggiungere "%".
   - Significato delle durate (usa questo, non interpretare a caso): 5s/15s = sprint / neuromuscolare; 30s/1min = capacità anaerobica; 5min = VO2max / potenza aerobica massima; 20min ≈ soglia (FTP); 60min e oltre = resistenza aerobica / fondo.
   - Per capire un punto DEBOLE: confronta "current" col "best_1y" alla STESSA durata (se current è molto sotto il tuo miglior anno su quella durata, lì sei calato) e tieni conto del fenotipo (es. uno scalatore forte sui lunghi ma con 5s bassi ha un limite neuromuscolare). Se ci sono gap_limiters da un'analisi gara, dai priorità a quelli (severity high prima).
   - NON inventare numeri non presenti nella curva, NON trasformare i watt in percentuali, NON proporre un obiettivo numerico (es. "porta i 5min a 320W") se quel numero non è nei dati: indica la DURATA/zona da allenare e perché, con i valori che hai. Se la curva è assente o vuota, dillo ("non ho ancora il tuo profilo di potenza dettagliato") e dai un consiglio generale, senza inventare la curva.`;

const COACH_ASK_SYSTEM = `${COACH_BASE_RULES}

Rispondi alla domanda dell'atleta usando esclusivamente il contesto fornito. Vai dritto al punto, niente preamboli.`;

const COACH_PRE_WORKOUT_SYSTEM = `${COACH_BASE_RULES}

Genera un REPORT PRE-ALLENAMENTO conciso che dica all'atleta cosa fare oggi e come. Includi SOLO le voci per cui esistono dati nel contesto, in quest'ordine, omettendo del tutto quelle senza dati (niente sezioni vuote, niente placeholder inventati):
1. Contesto di fase — da context.phase (fase + motivo). Ometti se phase è null.
2. Readiness — da context.readiness e context.state (hrv, rhr). Ometti la riga sonno se assente.
3. Carico — da context.state (tsb, acwr). Non aggiungere metriche non presenti.
4. Allenamento di oggi — da planned_session: durata, obiettivo, struttura e target. Se planned_session è rest=true o null, trattalo come giorno di riposo e, se c'è, anticipa la prossima seduta; non inventare un workout.
5. Decisione Go / Modifica / Salta — riporta la decisione GIÀ presente in context.readiness.decision e spiegane il perché coi dati (readiness, TSB, fase). NON deciderla tu.

Meteo, durabilità/TID e altre capability NON sono nel contesto: non includerle.`;

/**
 * Risponde a una domanda dell'atleta usando SOLO il contesto fornito.
 * Switch automatico Anthropic/Groq. Lancia "AI_NOT_CONFIGURED" se manca la key.
 */
export async function answerCoachQuestion(
  context: CoachContext,
  question: string
): Promise<CoachAnswerOutput> {
  const userMsg = `Ecco i dati già calcolati dell'atleta (in JSON). Usa SOLO questi valori, non aggiungerne altri.\n\n${JSON.stringify(
    context,
    null,
    2
  )}\n\nDomanda dell'atleta: ${question}`;
  const out = await runCoachCompletion(COACH_ASK_SYSTEM, userMsg, "Q&A coach");
  return { answer: out.text, tokens_used: out.tokens_used };
}

/**
 * Genera il report pre-allenamento dal contesto + seduta odierna.
 * Switch automatico Anthropic/Groq. Lancia "AI_NOT_CONFIGURED" se manca la key.
 */
export async function generatePreWorkoutReport(
  context: CoachContext,
  plannedSession: PlannedSession | null
): Promise<PreWorkoutReportOutput> {
  const userMsg = `Ecco i dati già calcolati dell'atleta (in JSON). Usa SOLO questi valori, non aggiungerne altri.\n\n${JSON.stringify(
    { context, planned_session: plannedSession },
    null,
    2
  )}`;
  const out = await runCoachCompletion(
    COACH_PRE_WORKOUT_SYSTEM,
    userMsg,
    "report pre-allenamento"
  );
  return { report: out.text, tokens_used: out.tokens_used };
}

// Il coach usa un modello Groq più capace dei commenti (8b): legge la curva di
// potenza e i limitatori e deve ragionare, non solo descrivere. 70b resta
// economico e veloce. I commenti OGGI/PROFILO/PERCORSO restano sull'8b.
const COACH_MODEL_GROQ = "llama-3.3-70b-versatile";
// Più respiro dei 500 dei commenti: una risposta da coach con un piano concreto.
const COACH_MAX_TOKENS_GROQ = 800;

interface CoachCompletion {
  text: string;
  tokens_used: { prompt: number; completion: number };
}

/** Esegue una completion coach con lo switch provider e il degrado esistenti. */
async function runCoachCompletion(
  system: string,
  userMsg: string,
  label: string
): Promise<CoachCompletion> {
  if (activeProvider() === "anthropic") {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("AI_NOT_CONFIGURED");
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: MODEL_ANTHROPIC,
      max_tokens: MAX_TOKENS,
      system,
      messages: [{ role: "user", content: userMsg }],
    });
    const text = cleanComment(
      response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n")
    );
    return {
      text,
      tokens_used: {
        prompt: response.usage?.input_tokens || 0,
        completion: response.usage?.output_tokens || 0,
      },
    };
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("AI_NOT_CONFIGURED");
  const groq = new Groq({ apiKey });
  const response = await groq.chat.completions.create({
    model: COACH_MODEL_GROQ,
    max_tokens: COACH_MAX_TOKENS_GROQ,
    messages: [
      { role: "system", content: system },
      { role: "user", content: userMsg },
    ],
  });
  if (!response.choices || response.choices.length === 0) {
    throw new Error("GROQ_EMPTY_RESPONSE: no choices in response");
  }
  const raw = response.choices[0].message?.content;
  if (!raw) {
    throw new Error("GROQ_EMPTY_CONTENT: message content is empty");
  }
  if (response.choices[0].finish_reason === "length") {
    console.warn(`${label} troncato da Groq (max_tokens raggiunto)`);
  }
  return {
    text: cleanComment(raw),
    tokens_used: {
      prompt: response.usage?.prompt_tokens || 0,
      completion: response.usage?.completion_tokens || 0,
    },
  };
}
