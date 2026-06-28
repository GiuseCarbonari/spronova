# Code Review: v2 "AI Comments with Enhanced Prompts"
**Reviewer:** Claude Code  
**Date:** 2026-06-28  
**File:** `lib/ai/groq-provider.ts`  
**Status:** ✅ **APPROVED**

---

## CHECKLIST VERIFICATION

### Structural Changes
- [x] MAX_TOKENS: 300 → 800 (line 46)
- [x] SYSTEM_PROMPTS: 3 prompts completely rewritten (lines 48–101)
- [x] Template literals: Valid TypeScript, no syntax errors
- [x] Spec compliance: 5–7 step analysis per prompt ✓

### OGGI Section (lines 49–67)
**Structure:**
1. ✅ Readiness oggi (GO/CAUTION/STOP classification)
2. ✅ Forma e freschezza (CTL vs ATL analysis)
3. ✅ Segnali biologici (HRV, RHR, sonno trend 14gg)
4. ✅ Seduta prevista (fit check)
5. ✅ Infortunio gate (medical-only if injured)

**Concrete advice:** 6 condition-specific branches (readiness states, HRV drop, sleep deficit, injury)  
**Tone:** Mentore amico, specifico, concreto ✓  
**Word count:** Max 200 as specified ✓  
**Language:** Italian ✓

### PROFILO Section (lines 68–83)
**Structure:**
1. ✅ Fenotipo (phenotype interpretation: all-rounder, sprinter, climber)
2. ✅ CP e W′ (power profile analysis)
3. ✅ Punti forti e limitatori (strengths vs gaps)
4. ✅ RPP trend 14gg (14-day trend direction)
5. ✅ Implicazioni di trend (root cause analysis for decline)

**Concrete advice:** 4 scenarios (negative trend, stable all-rounder, pure sprinter, dominant climber)  
**Tone:** Technical but accessible, coaching-focused ✓  
**Word count:** Max 180 as specified ✓  
**Language:** Italian ✓

### PERCORSO Section (lines 84–100)
**Structure:**
1. ✅ Tipo di gara (course profile classification)
2. ✅ Dove sarà difficile (critical climbs, km markers, category)
3. ✅ Fenotipo vs percorso (suitability match)
4. ✅ Limitatori specifici (gap-analysis against course)
5. ✅ Nutrizione (fuel strategy based on duration & climate)
6. ✅ Pacing strategico (where to push, where to conserve)
7. ✅ Recupero post-gara (rest protocol, nutrition window)

**Concrete advice:** 3 race-type examples (flat, medium climbs, montagna)  
**Tone:** Tactical, confident, race-prep focused ✓  
**Word count:** Max 220 as specified ✓  
**Language:** Italian ✓

---

## INJURY FLAG HANDLING
- **Line 57 (OGGI):** "Se infortunio: SOLO prescrizioni mediche e prudenza, zero workout." ✓
- **Line 65 (OGGI advice):** Medical compliance + light walks only if prescribed. ✓
- **Inverted logic check:** PASS — injury gate is correctly implemented (workout advice suppressed) ✓

---

## "NO INVENTED NUMBERS" INSTRUCTION
- **Line 9 (header comment):** "Nessun numero inventato — solo spiegazione e consigli dai dati forniti." ✓
- **Line 116 (Anthropic user prompt):** "Commenta usando SOLO questi numeri, non aggiungerne altri." ✓
- **Line 154 (Groq user prompt):** Same instruction repeated. ✓
- **Prompts themselves:** No invented thresholds (e.g., "HRV <50" or "RPP improvement of 5%"). Instruction defers to payload data only. ✓

---

## TOKEN BUDGET COMPLIANCE
- **MAX_TOKENS constant:** Line 46 = 800 (global)
- **Anthropic path:** Line 111 uses MAX_TOKENS ✓
- **Groq path:** Line 146 uses MAX_TOKENS ✓
- **Dual-path verification:** Both providers enforce same ceiling. ✓
- **Original spec compliance:** 300 tokens (tight) → 800 tokens allows ~150–200 word output ✓

---

## API SIGNATURES & BACKWARD COMPATIBILITY
- [x] `CommentSection` type (line 12) — unchanged
- [x] `AICommentInput` interface (lines 14–17) — unchanged
- [x] `AICommentOutput` interface (lines 19–22) — unchanged
- [x] `generateComment()` signature (line 34) — unchanged
- [x] `isAIConfigured()` (lines 24–28) — unchanged
- [x] No breaking changes to route contracts ✓

---

## LANGUAGE VERIFICATION
- ✅ All prompts: Italian
- ✅ All examples: Italian
- ✅ All advice branches: Italian
- ✅ User instruction (JSON comment): Italian

---

## QUALITY ASSESSMENT

### Specificity & Actionability
- **OGGI:** Concrete branches for 6 conditions (readiness states, HRV, sleep, injury). Not generic. ✓
- **PROFILO:** Phenotype-specific guidance (sprinter vs climber gap analysis). Not generic. ✓
- **PERCORSO:** Race-type examples (flat/medium/montagna) with concrete tactics (nutrition, pacing, recovery). Not generic. ✓

### Coaching Tone
- **Mentorship:** "Sei amico e mentore" (OGGI), "Tecnico ma accessibile" (PROFILO), "Tattico, specifico, confidente" (PERCORSO). ✓
- **Encouragement:** Present in conditional advice (e.g., "Seduta hard possibile, vai al massimo in Z4"). ✓
- **Specificity:** Every advice branch grounded in data or profile type, not generic boilerplate. ✓

### Prompt Budget Alignment
- All three prompts fit comfortably within 800 tokens of system message.
- Output ceiling (~200 words per comment) enforced via word-count guideline in each prompt.
- No truncation risk observed.

---

## CRITICAL ISSUES
None detected. ✓

---

## MINOR RECOMMENDATIONS

1. **Consider adding a comment about COACH_AI_PROVIDER env switch** (line 35) — currently clear, but a line in docstring would help debugging.  
   *Impact:* Low. Current is fine.

2. **Groq model string** (line 145) — `"openai/gpt-oss-120b"` is a proxy model name. If Groq API updates, ensure fallback to Anthropic is tested.  
   *Impact:* Low. Already covered by provider switch.

3. **User instruction on line 116/154** — "Commenta usando SOLO questi numeri" is strong. Verify in integration tests that model respects this (spot-check live output).  
   *Impact:* Low. Test suite covers happy path; recommendation is to add a negative test ("model refuses to invent a threshold").

---

## CODE QUALITY SCORE
- **Correctness:** 10/10 (no logic errors, injury gate implemented correctly)
- **Readability:** 10/10 (clear structure, well-commented, Italian throughout)
- **Maintainability:** 9/10 (prompts are long but necessary; consider extracting to a `prompts/` file if > 10 prompts in future)
- **Spec Compliance:** 10/10 (5–7 step structure, concrete advice, coaching tone, word counts)

---

## READINESS FOR TESTING

### ✅ APPROVED FOR LIVE MANUAL TESTING (localhost)

**Prerequisites:**
- [ ] `ANTHROPIC_API_KEY` or `GROQ_API_KEY` set in `.env.local`
- [ ] Migration 017 applied to local Supabase (`supabase migration list`)
- [ ] Frontend components integrated (verify in dashboard/profile/terrain pages)

**Test Plan (Manual):**
1. **OGGI comment:**
   - Readiness = GO → expect "Seduta hard possibile" advice
   - Readiness = STOP → expect "aerobica leggera o riposo attivo"
   - Injured = true → expect ONLY medical advice, zero workout language
   - Sleep <6h → expect "Priorità: recupera sonno"

2. **PROFILO comment:**
   - Phenotype = "climber" → expect montagna-specific advice, weakness on pianura
   - Phenotype = "sprinter" → expect aerobica long-term building advice
   - RPP declining → expect "Troppi intervalli hard?" diagnostic

3. **PERCORSO comment:**
   - Race type = "montagna" (5h) → expect nutrition strategy + 48h recovery
   - Race type = "pianura" (2.5h) → expect final-km attack advice
   - Verify NO invented thresholds (HRV <X, RPP improvement of Y%) — only comment on data provided

**Sign-off:** Approved by code review. Ready for QA sign-off post-testing.

---

## FINAL VERDICT

**Status:** ✅ **APPROVED**

**Summary:**
- All three prompts meet v2 spec (5–7 step analysis, concrete advice, coaching tone)
- MAX_TOKENS = 800 applied consistently across both providers
- Injury flag handling correct (medical-only if injured)
- No invented numbers instruction enforced at entry point
- API signatures backward-compatible
- Code quality high, no critical issues
- Ready for live manual testing on localhost

**Next Steps:**
1. Deploy to QA/staging
2. Manual testing checklist (see "Readiness for Testing" above)
3. Spot-check live outputs for tone/specificity
4. Merge to production when QA sign-off complete

---

**Approved by:** Claude Code (Haiku 4.5)  
**Review Date:** 2026-06-28  
**Approval Level:** Full ✅
