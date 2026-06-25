import Anthropic from "@anthropic-ai/sdk";

/**
 * Astrazione provider AI per il commento della scheda atleta (M3 passo 3).
 *
 * Per ora un solo provider (Anthropic). Regola ferma: l'AI NON calcola né
 * inventa numeri — riceve i valori GIÀ calcolati del profilo e li spiega e
 * basta. Il system prompt (sezione 3 di docs/scheda_atleta_tooltip_e_commento.md)
 * vieta esplicitamente di prescrivere allenamenti.
 *
 * Senza ANTHROPIC_API_KEY l'app funziona identica: generateProfileComment()
 * lancia "AI_NOT_CONFIGURED" e il chiamante degrada con grazia.
 */

/** Modello e budget fissati dalla spec del milestone. */
const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 1000;

const SYSTEM_PROMPT = `Sei un assistente che spiega a un ciclista amatoriale il suo profilo di potenza, già calcolato da Intervals.icu. Non calcoli e non inventi numeri: usi solo quelli forniti. Parli italiano semplice, tono incoraggiante e concreto, senza gergo non spiegato. Non prescrivi allenamenti specifici. Massimo 3 paragrafi brevi. Se nei dati è presente "cp_power_law", significa che un secondo modello (power-law) stima una soglia diversa da quella di Intervals (Morton 3P): in una frase spiega con parole semplici che è normale — i due modelli pesano in modo diverso gli sforzi brevi, e quando l'atleta ha uno sprint molto forte il modello di Intervals tende a dare una soglia più bassa. Cita entrambi i numeri senza dire che uno è "sbagliato".`;

/** Una durata della curva RPP, come passata all'AI (solo valori già calcolati). */
export interface RPPInputPoint {
  label: string;
  watts: number | null;
  wkg?: number | null;
}

/**
 * Input passato all'AI: SOLO valori già calcolati (sezione 3 del file docs).
 * Mai dati grezzi, mai chiedere all'AI di calcolare.
 */
export interface ProfileCommentInput {
  fenotipo: {
    primary: string;
    secondary: string | null;
    confidence: string;
    flatness: number | null;
    punch_ratio: number | null;
    apr_ratio: number | null;
  };
  cp_wprime: {
    cp_w: number;
    cp_wkg: number | null;
    w_prime_kj: number;
  } | null;
  /**
   * CP da modello power-law sugli stessi MMP (alternativo al Morton 3P di
   * cp_wprime). Presente solo quando diverge in modo percepibile: serve a far
   * spiegare al coach perché altri strumenti riportano una soglia più alta.
   */
  cp_power_law: {
    cp_w: number;
    cp_wkg: number | null;
  } | null;
  rpp_current: RPPInputPoint[];
  rpp_best_1y: RPPInputPoint[];
  weight_kg: number | null;
  weight_source: string | null;
}

/** true se è configurata una API key Anthropic (lettura server-side). */
export function isAIConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * Genera il commento (3 paragrafi) dal profilo. Lancia "AI_NOT_CONFIGURED"
 * se manca la key, così il chiamante può rispondere { configured: false }.
 */
export async function generateProfileComment(
  profileData: ProfileCommentInput
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("AI_NOT_CONFIGURED");
  }

  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Ecco i dati già calcolati del mio profilo (in JSON). Spiegali e contestualizzali seguendo la struttura richiesta. Usa solo questi numeri, non aggiungerne altri.\n\n${JSON.stringify(
          profileData,
          null,
          2
        )}`,
      },
    ],
  });

  // Concateno i blocchi di testo della risposta (di norma uno solo).
  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

// --- Narrativa del piano settimanale (M6) ------------------------------------

/** Budget ridotto: la narrativa è breve (≤150 parole). */
const WEEK_NARRATIVE_MAX_TOKENS = 400;

const WEEK_NARRATIVE_SYSTEM = `Sei un coach di endurance che SPIEGA all'atleta una settimana di allenamento GIÀ decisa da un sistema deterministico. Regole assolute: NON prescrivi nuove sedute, NON cambi quelle date, NON inventi numeri (watt, FC, TSS, durate) diversi da quelli forniti. Spieghi solo la logica della settimana: perché questa fase, perché queste sedute dure in questi giorni, come si distribuisce il carico. Italiano semplice e incoraggiante. MASSIMO 150 parole, un solo paragrafo.`;

/** Una seduta come passata all'AI (solo etichette, niente da calcolare). */
export interface WeekNarrativeSession {
  day: string;
  title: string;
  objective: string;
  is_hard: boolean;
  duration_min: number | null;
}

export interface WeekNarrativeInput {
  phase: string;
  phase_reason: string;
  days_to_event: number | null;
  hard_sessions: number;
  volume_hours_estimate: number;
  sessions: WeekNarrativeSession[];
}

/**
 * Genera la narrativa (≤150 parole) della settimana. Lancia "AI_NOT_CONFIGURED"
 * se manca la key, così il chiamante salva narrative=null senza errore.
 */
export async function generateWeekNarrative(
  input: WeekNarrativeInput
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("AI_NOT_CONFIGURED");
  }

  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: WEEK_NARRATIVE_MAX_TOKENS,
    system: WEEK_NARRATIVE_SYSTEM,
    messages: [
      {
        role: "user",
        content: `Ecco la settimana già decisa (in JSON). Spiegala all'atleta seguendo le regole. Usa solo questi dati.\n\n${JSON.stringify(
          input,
          null,
          2
        )}`,
      },
    ],
  });

  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}
