# Improvement Plan: AI Comments - Enhanced Prompts & Token Budget (v2)

**Date:** 2026-06-28  
**Status:** Ready to implement  
**Scope:** Improve comment quality by expanding token budget and restructuring prompts

---

## PROBLEM STATEMENT

Current comments are **too short and generic**:
- **Token budget:** 300/comment (allows only 80–100 words output)
- **Prompts:** Vague ("analizza lo stato, dai 3-4 consigli")
- **Output:** Repeats data, lacks actionable advice
- **User feedback:** "Questo so leggerlo anche io dai dati"

**Example current output:**
> "Ciao Giuse, il profilo di readiness indica decision=GO, priorità e confidenza medium; tutti i segnali (HRV=67.77)..."

**Expected improved output:**
> "La tua readiness è VERDE: forma eccellente (CTL=62), freschezza ottima (TSB=16), HRV in crescita. La seduta di oggi (base aerobica) è perfetta per questo stato. Mantieni Z1-Z2, monitora la cadenza, recupera bene stasera."

---

## SOLUTION: OPZIONE C (Enhanced + Expanded)

### 1. Token Budget Increase: 300 → 800

**Rationale:**
- 300 tokens ≈ 60–90 words actual output (system prompt + payload consume tokens)
- 800 tokens ≈ 200–250 words actual output
- Enables structured response: **Analisi** → **Consigli specifici** → **Warning/Note**

**Cost impact:**
- Additional tokens: 500 per comment
- Per user (3 comments): 1500 tokens × $0.0001/token = $0.00015 per generation
- At 100 active users generating 1×/day: +$0.45/month (negligible)

### 2. Rewritten System Prompts (Detailed & Structured)

#### OGGI (Daily Readiness & Session Approach)

**Current (vague):**
```
Sei un coach ciclismo esperto. Analizza lo stato dell'atleta OGGI e dai 3-4 consigli pratici.
Commenta readiness, forma, fatica, freschezza, HRV, sonno. Se infortunato, consiglia SOLO
prudenza e programma medico, no allenamenti. Tono incoraggiante, italiano, max 150 parole.
```

**New (structured & detailed):**
```
Sei un coach ciclismo che conosce l'atleta da anni.
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

TONO: Sei amico e mentore. Concreto, specifico, non ovvio. Max 200 parole. Italiano.
```

---

#### PROFILO (Phenotype & Power Profile Trends)

**Current (vague):**
```
Sei un coach. Commenta il profilo di potenza dell'atleta (fenotipo, CP/W′, RPP trend).
Spiega cosa significa il fenotipo, punti forti e limitatori, trend RPP nei 14gg.
Non inventi numeri. Tono incoraggiante, italiano, max 150 parole.
```

**New (structured & detailed):**
```
Sei un coach che analizza il profilo di potenza di un atleta.

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

TONO: Tecnico ma accessibile. Stai raccontando cosa significa il suo profilo e come migliorarlo. Max 180 parole. Italiano.
```

---

#### PERCORSO (Race Strategy & Altitude Analysis)

**Current (vague):**
```
Sei un coach. Analizza la gara target con altimetria, nutrizione e pacing.
Spiega dove sarà impegnativo, strategia nutrizionale, come affrontare in base al fenotipo,
piano di recupero post-gara. Tono motivante, italiano, max 200 parole.
```

**New (structured & detailed):**
```
Sei un coach che prepara un atleta per una gara specifica.

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

TONO: Tattico, specifico, confidente. Stai preparando l'atleta a gareggiare e vincere. Max 220 parole. Italiano.
```

---

## IMPLEMENTATION DETAILS

### File Changes

**File: `lib/ai/groq-provider.ts`**

**Line 46 (MAX_TOKENS):**
```typescript
// OLD:
const MAX_TOKENS = 300;

// NEW:
const MAX_TOKENS = 800;
```

**Lines 48–52 (SYSTEM_PROMPTS):**
```typescript
// OLD:
const SYSTEM_PROMPTS: Record<CommentSection, string> = {
  oggi: `Sei un coach ciclismo esperto. Analizza...`,
  profilo: `Sei un coach. Commenta il profilo...`,
  percorso: `Sei un coach. Analizza la gara...`,
};

// NEW:
const SYSTEM_PROMPTS: Record<CommentSection, string> = {
  oggi: `Sei un coach ciclismo che conosce l'atleta da anni. [full new prompt above]`,
  profilo: `Sei un coach che analizza il profilo di potenza... [full new prompt above]`,
  percorso: `Sei un coach che prepara un atleta per una gara... [full new prompt above]`,
};
```

**File: `.pipeline/spec.md` (§7 Groq Integration Checklist)**
- Update token budget line: "Max tokens per comment: **800** (tight budget → ≤200–250 words output)"

---

## TESTING PLAN

### Unit Tests
- [ ] Verify new prompts compile (no syntax errors in template literals)
- [ ] Generate 1 comment for each section (OGGI, PROFILO, PERCORSO)
- [ ] Verify token_used.prompt is ~400–500 (system prompt + payload)
- [ ] Verify token_used.completion is ~100–200 (output)
- [ ] Verify total ≤ 800

### Manual Testing (on localhost:3004)
- [ ] Navigate to `/dashboard` (OGGI section)
- [ ] Click "Genera commento"
- [ ] Verify output is **150–200 words** (not 80–100 as before)
- [ ] Verify output includes: analisi + consigli specifici + tone
- [ ] Check timestamp updated

- [ ] Navigate to `/profile` (PROFILO section)
- [ ] Same flow, verify output is **150–180 words**
- [ ] Verify includes fenotipo explanation + trend analysis + training recommendations

- [ ] Navigate to `/terrain` (PERCORSO section)
- [ ] Same flow, verify output is **180–220 words**
- [ ] Verify includes altitude analysis + nutrition + pacing strategy + recovery

### Quality Checks
- [ ] Comments are **actionable** (not just data repetition)
- [ ] Comments are **specific** (mention actual metrics, give concrete advice)
- [ ] Comments are **Italian** (no English creeping in)
- [ ] Comments respect **injury flags** (if injured, zero workout advice)
- [ ] No **invented numbers** (only reference data given in payload)

---

## EDGE CASES HANDLED

| Scenario | Behavior |
|----------|----------|
| **Readiness GO + good trends** | Encourage hard session, monitor intensity |
| **Readiness STOP + bad trends** | Recommend rest, passive recovery, sleep priority |
| **Injured today** | Prompt explicitly forbids workout advice |
| **HRV declining** | Recommend sleep, reduced intensity |
| **Sonno <6h** | Recommend sleep prioritization |
| **RPP declining 14d** | Suggest overtraining, recommend base aerobica |
| **All-rounder phenotype** | Emphasize versatility, freedom to train any limiter |
| **Sprinter phenotype** | Emphasize aerobica weakness, recommend 4–6min work |
| **Pianura + all-rounder** | Tactical advice (stay in group, late attack) |
| **Montagna + all-rounder** | Tactical advice (group riding, attack on descents) |

---

## EXPECTED OUTCOMES

### Before (v1)
```
Token budget: 300
Output words: 80–100
Structure: Unstructured (repeats data)
Actionability: Low (generic)

Example:
"Ciao Giuse, il profilo di readiness indica decision=GO, priorità e confidenza medium;
tutti i segnali (HRV=67.77) (bla bla)"
```

### After (v2)
```
Token budget: 800
Output words: 200–250
Structure: Analisi → Consigli specifici → Tone
Actionability: High (concrete advice per scenario)

Example:
"La tua readiness è VERDE: forma eccellente (CTL=62), freschezza ottima (TSB=16),
HRV in crescita. La seduta di oggi (base aerobica) è perfetta. Mantieni Z1-Z2,
monitora cadenza, recupera bene stasera. Dormi 8h, la forma è in crescita."
```

---

## COST ANALYSIS

### Token Budget Impact
- **Per comment:** 500 additional tokens
- **Per user (3 comments/generation):** 1500 tokens
- **Cost increment:** 1500 × $0.0001/token = **$0.00015/user/generation**

### Monthly Impact (100 active users, 1 generation/day)
- Daily: 100 users × 1500 tokens × $0.0001 = **$0.015/day**
- Monthly: $0.015 × 30 = **$0.45/month**

**Negligible cost for massively improved user experience.**

---

## ROLLBACK PLAN

If new prompts produce poor results:
1. Revert `lib/ai/groq-provider.ts` to v1 (undo MAX_TOKENS + SYSTEM_PROMPTS changes)
2. Test old prompts still work (should, no API changes)
3. Iterate with refined prompts (v2.1, v2.2, etc.)

---

## FUTURE ENHANCEMENTS

- **Per-phenotype custom prompts:** Different advice for sprinters vs climbers
- **Multi-language support:** Translate new prompts to EN, ES, FR
- **Prompt A/B testing:** Compare v1 vs v2 quality via user ratings
- **Dynamic token budget:** Adjust max_tokens based on payload size (if many climbs, use 900 for PERCORSO)

---

## SUMMARY

**Changes:**
- `lib/ai/groq-provider.ts`: MAX_TOKENS (300→800) + rewrite 3 SYSTEM_PROMPTS
- `.pipeline/spec.md`: Update token budget documentation

**No breaking changes:**
- API route signatures unchanged
- Database schema unchanged
- Frontend components unchanged
- No new dependencies

**Expected improvements:**
- Comments: 80–100 words → 200–250 words
- Actionability: Generic → Specific scenario-based advice
- User satisfaction: "Questo so leggerlo dai dati" → "Wow, che consiglio pratico!"

**Timeline:** 30 minutes coding + 15 minutes testing = 45 minutes total

---

**Status:** Ready for implementation.  
**Open Questions:** None — all details finalized.
