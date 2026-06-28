import Anthropic from "@anthropic-ai/sdk";
import Groq from "groq-sdk";

/**
 * Astrazione provider AI per i tre commenti (OGGI, PROFILO, PERCORSO).
 *
 * Switch tra Anthropic (default) e Groq (env COACH_AI_PROVIDER=groq).
 * Max tokens: 300/comment (tight budget → ≤150 words output).
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

/** Verifica se AI è configurata (chiave presente). */
export function isAIConfigured(): boolean {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.GROQ_API_KEY;
  return Boolean(apiKey);
}

/**
 * Genera commento per sezione. Switch automatico Anthropic/Groq.
 * Lancia "AI_NOT_CONFIGURED" se nessuna API key.
 */
export async function generateComment(input: AICommentInput): Promise<AICommentOutput> {
  const provider = process.env.COACH_AI_PROVIDER || "anthropic";

  if (provider === "groq") {
    return generateCommentGroq(input);
  }
  return generateCommentAnthropic(input);
}

// --- ANTHROPIC -----------------------------------------------------------------

const MODEL_ANTHROPIC = "claude-sonnet-4-6";
const MAX_TOKENS = 800;

const SYSTEM_PROMPTS: Record<CommentSection, string> = {
  oggi: `Sei un coach ciclismo che conosce l'atleta da anni.
Guarda i dati OGGI (readiness, forma, freschezza, sonno, HRV, RHR, seduta prevista).

ANALIZZA in questo ordine:
1. **Readiness oggi:** Qual è lo stato? È un giorno GO/CAUTION/STOP? Perché (quali metriche lo dicono)?
2. **Forma e freschezza:** CTL vs ATL → che tipo di forma è (acuta, cronaca, equilibrata)?
3. **Segnali biologici:** HRV, RHR, sonno → cosa dicono sul recupero? Sono in linea con i trend 14gg?
4. **Seduta prevista:** Se c'è una seduta, è giusta per questo stato?
5. **Infortunio:** Se attivo, SOLO prescrizioni mediche e prudenza, zero workout.

CONSIGLI CONCRETI (scegli quello rilevante):
- Se readiness=GO: "Seduta hard possibile, vai al massimo in Z4. Monitora cadenza e pedalata."
- Se readiness=CAUTION: "Fai la seduta ma monitora bene, pronto a scendere di intensità se necessario."
- Se readiness=STOP: "Ascolta il corpo, magari aerobica leggera o riposo attivo. Recupera sonno."
- Se HRV in calo: "RHR elevato e HRV basso. Dormi di più stasera, ripresa domani."
- Se sonno <6h: "Priorità: recupera sonno prima di allenarmi di nuovo. Seduta breve oggi."
- Se infortunio: "Attieniti al programma medico. Passeggiata leggera se prescritto, niente allenamento."

TONO: Sei amico e mentore. Concreto, specifico, non ovvio. Max 200 parole. Italiano.`,
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

TONO: Tecnico ma accessibile. Stai raccontando cosa significa il suo profilo e come migliorarlo. Max 180 parole. Italiano.`,
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

TONO: Tattico, specifico, confidente. Stai preparando l'atleta a gareggiare e vincere. Max 220 parole. Italiano.`,
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

  const comment = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  return {
    comment,
    tokens_used: {
      prompt: response.usage?.input_tokens || 0,
      completion: response.usage?.output_tokens || 0,
    },
  };
}

// --- GROQ -----------------------------------------------------------------------

async function generateCommentGroq(input: AICommentInput): Promise<AICommentOutput> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("AI_NOT_CONFIGURED");

  const groq = new Groq({ apiKey });

  const response = await groq.chat.completions.create({
    model: "openai/gpt-oss-120b",
    max_tokens: MAX_TOKENS,
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

  const comment = response.choices[0]?.message?.content || "";

  return {
    comment,
    tokens_used: {
      prompt: response.usage?.prompt_tokens || 0,
      completion: response.usage?.completion_tokens || 0,
    },
  };
}
