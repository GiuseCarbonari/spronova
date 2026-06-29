import Anthropic from "@anthropic-ai/sdk";
import Groq from "groq-sdk";

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
