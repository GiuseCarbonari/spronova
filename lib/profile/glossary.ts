/**
 * Glossario dei termini della scheda atleta (Modulo Profilo §33, passo 3).
 *
 * I testi sono trascritti ESATTAMENTE dalla sezione 1 di
 * docs/scheda_atleta_tooltip_e_commento.md (regola ferma del milestone:
 * non riassumere, non modificare). Le righe spezzate del file docs sono
 * ricongiunte qui in un'unica frase continua; solo le marcature di enfasi
 * markdown (** , *) sono state rimosse perché sono formattazione, non testo.
 *
 * <InfoTooltip term="..." /> legge da questo oggetto: la chiave è il `term`.
 */

export const GLOSSARY: Record<string, string> = {
  fenotipo:
    "Che tipo di atleta sei. Descrive la forma del tuo profilo di potenza: dove sei naturalmente forte. Non dipende dal tuo livello assoluto ma da come si distribuisce la tua potenza tra sforzi brevi e lunghi. I tipi principali: sprinter (esplosivo), puncheur (forte 1–3 min), passista/diesel (tiene a lungo), scalatore (alto W/kg in salita).",

  puncheur:
    "Atleta forte negli sforzi di 1–3 minuti e negli scatti ripetuti. La tua dote sono gli strappi e i cambi di ritmo, più che le salite lunghe a ritmo costante.",

  cp: "La potenza che puoi sostenere a lungo senza affondare. È la soglia sopra la quale la fatica diventa rapidamente insostenibile. Indicatore chiave della tua capacità aerobica. Più è alta (in rapporto al peso), più reggi ritmi alti in salita e nelle lunghe. Calcolata da Intervals.icu col modello Morton 3P.",

  cp_powerlaw:
    "La stessa soglia stimata con un modello diverso, la power-law (quella usata anche da strumenti come AnalyzeMe). Il modello principale (Morton 3P di Intervals) include anche gli sprint e tende ad abbassare la soglia se la tua punta esplosiva è molto alta; la power-law pesa soprattutto gli sforzi da 5 a 60 minuti. Quando i due numeri divergono, quello più vicino alle tue uscite lunghe reali è di solito la power-law.",

  wprime:
    "La tua \"batteria\" anaerobica. L'energia totale che puoi spendere sopra la CP prima di esaurirti — negli scatti, negli sforzi brevi e intensi. Si misura in kilojoule (kJ). Una W′ alta significa che puoi fare più scatti, o scatti più potenti, prima di \"andare in debito\".",

  wkg: "Watt per chilo di peso. La potenza rapportata al tuo peso corporeo. È ciò che conta davvero in salita: due atleti con gli stessi watt ma peso diverso salgono a velocità diverse. Per questo il peso corretto è importante.",

  rpp: "La tua \"carta d'identità\" di potenza. I tuoi massimi sforzi per ogni durata: quanto spingi al massimo per 5 secondi, 1 minuto, 5 minuti, 20 minuti, un'ora. Insieme disegnano la forma del tuo motore.",

  msp: "La tua potenza di picco istantanea, lo sprint massimo. Qui letta dal valore pMax calcolato da Intervals.",

  apr: "Quanto \"stacco\" hai tra il tuo sprint massimo e la tua soglia. Un valore alto = punta esplosiva marcata rispetto alla tua base aerobica. Calcolato come sprint massimo meno CP (versione MPR, più pulita quando la MAP non è affidabile).",

  confidenza:
    "Quanto l'app si fida di questa lettura. Alta = hai sforzi massimali recenti a tutte le durate chiave. Bassa = mancano dati (es. nessuno sforzo massimo recente a certe durate) e il quadro è parziale. Onestà prima di tutto: se è bassa, prendila come indicativa.",

  best1y:
    "Il tuo miglior valore nell'ultimo anno, accanto a quello attuale (90 giorni). Serve a vedere il potenziale: dove sei stato, quindi dove puoi tornare. Se l'attuale è molto sotto il Best 1y a una certa durata, lì hai margine di recupero.",

  soglie_v0:
    "Le soglie che classificano il fenotipo sono una prima versione (euristiche), da affinare con l'esperienza. Indicano la direzione, non una verità assoluta.",

  // --- Analisi evento (gap analysis, §33 C.6) ---
  limitatore:
    "Il punto debole che, per QUESTA gara, rischia di costarti di più: una richiesta del percorso (una salita, uno strappo) dove il tuo profilo è più scoperto. Non è un giudizio sull'atleta, è il margine di miglioramento più utile in vista dell'evento.",

  leva: "Il tipo di lavoro che aggredisce quel limitatore: la direzione di allenamento (es. sweet spot lunghi, soglia, ripetute VO2, sprint). Le sedute concrete arrivano dalla libreria del planner, non da qui.",

  wkg_richiesto:
    "I watt per chilo che la salita ti chiede di sostenere, stimati dalla sua pendenza e lunghezza. Confrontati con quello che il tuo profilo esprime a quella durata: la differenza è il «gap». Sono stime, non misure.",

  durabilita:
    "Quanto tieni la potenza quando sei già stanco. Una salita al km 70 va affrontata a gambe affaticate: non conta solo quanto spingi da fresco, ma quanto ti resta dopo ore di gara. Spesso è il vero limitatore degli eventi lunghi.",

  fatica_stimata:
    "Quanto sarai affaticato quando arrivi a quella salita, stimato dalla posizione nel percorso (una salita a inizio gara la affronti fresco, una a fine gara a fatica). È una stima dalla frazione di percorso percorsa, non una misura.",

  // --- Stima tempi gara ---
  cp_usato:
    "La stima parte dalla tua Critical Power attuale (la potenza che puoi sostenere a lungo): è il motore del calcolo. Dopo ogni nuovo test/FTP la CP cambia e la stima va aggiornata per restare precisa.",

  giornata_perfetta:
    "Il tempo se mantieni la massima potenza dall'inizio alla fine senza mai calare. Difficile da raggiungere nella realtà, ma è il tuo limite teorico migliore.",

  obiettivo_realistico:
    "Il tempo più probabile gestendo bene le energie. Tiene conto del normale calo di potenza con l'accumularsi della fatica. È il numero su cui basare la tua strategia di gara.",

  con_imprevisti:
    "Aggiunge un margine del 15% per soste ai ristori, code nei sentieri stretti, caldo o una giornata difficile. Se finisci entro questo tempo, è comunque andata bene.",

  fatigue_multiplier:
    "Quanto cala la potenza che puoi spingere man mano che la gara avanza. Fresco vali il 100%, a metà gara ~95%, nella parte finale fino a ~82%: lo stesso decadimento usato nei limitatori. Serve a non stimare tempi da «sempre freschi».",

  scenario_conservativo:
    "Lo scenario prudente: parte dal realistico e toglie un altro 15% di potenza, come margine per imprevisti (caldo, soste extra, giornata no, tratti tecnici). Tienilo come «caso peggiore ragionevole», non come fallimento.",

  rolling_resistance:
    "L'attrito di gomme e terreno. Su MTB e sterrato è molto più alto che su strada (qui CRR 0,020 contro ~0,004 da corsa): per questo a parità di watt si va più piano. È un parametro fisso del modello, già tarato per il fuoristrada.",
};

/**
 * Testo del box "Come leggere questa scheda" (sezione 2 del file docs),
 * trascritto esattamente. Il titolo è separato dal corpo per la UI.
 */
export const HOW_TO_READ = {
  title: "Come leggere questa scheda",
  body: "Questi numeri vengono letti direttamente dai tuoi allenamenti su Intervals.icu — non sono inventati né stimati dall'app. Raccontano due cose: che tipo di atleta sei (il fenotipo) e quanto è grande il tuo motore (CP, W/kg, RPP). Il fenotipo ti dice dove sei naturalmente forte. La CP in W/kg ti dice quanto reggi in salita e nelle lunghe. La colonna Best 1y ti mostra il tuo potenziale. Passa il mouse su ogni \"?\" per la spiegazione del singolo valore.",
} as const;
