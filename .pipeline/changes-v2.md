# Implementation Report: AI Comments v2 (Enhanced Prompts & Token Budget)

**Date:** 2026-06-28  
**Status:** ✅ COMPLETE — All changes applied locally  
**File Modified:** `lib/ai/groq-provider.ts`

---

## CHANGES APPLIED

### 1. MAX_TOKENS Increase (Line 46)

**Before:**
```typescript
const MAX_TOKENS = 300;
```

**After:**
```typescript
const MAX_TOKENS = 800;
```

**Impact:** Output word budget increased from ~80–100 words to ~200–250 words per comment.

---

### 2. SYSTEM_PROMPTS Rewritten (Lines 48–52)

#### OGGI Section (Daily Readiness & Session)

**Before (36 words):**
```
Sei un coach ciclismo esperto. Analizza lo stato dell'atleta OGGI e dai 3-4 consigli pratici. 
Commenta readiness, forma, fatica, freschezza, HRV, sonno. Se infortunato, consiglia SOLO prudenza 
e programma medico, no allenamenti. Tono incoraggiante, italiano, max 150 parole.
```

**After (Structured, 280+ words):**
- Line 49–76: New prompt with 5-step analysis structure + concrete conditional advice
- Explicit handling of injury flags, HRV trends, sleep deficit, readiness levels
- Mentorship tone, actionable guidance per scenario

---

#### PROFILO Section (Power Profile Analysis)

**Before (35 words):**
```
Sei un coach. Commenta il profilo di potenza dell'atleta (fenotipo, CP/W′, RPP trend). 
Spiega cosa significa il fenotipo, punti forti e limitatori, trend RPP nei 14gg. Non inventi numeri. 
Tono incoraggiante, italiano, max 150 parole.
```

**After (Structured, 260+ words):**
- Lines 77–100: 5-step analysis (phenotype, CP/W′ interpretation, strengths/limiters, RPP trend, trend implications)
- Scenario-based advice for all-rounder, sprinter, climber phenotypes
- Training recommendations tied to profile analysis

---

#### PERCORSO Section (Race Strategy & Altitude)

**Before (31 words):**
```
Sei un coach. Analizza la gara target con altimetria, nutrizione e pacing. Spiega dove sarà impegnativo, 
strategia nutrizionale, come affrontare in base al fenotipo, piano di recupero post-gara. 
Tono motivante, italiano, max 200 parole.
```

**After (Structured, 290+ words):**
- Lines 101–134: 7-step analysis (race type, critical climbs, phenotype fit, gaps, nutrition, pacing, recovery)
- Three concrete examples (flat, mid-climbs, mountain) with specific tactics
- Tactical confidence tone, race-ready framing

---

## BUILD VERIFICATION

### TypeScript Compilation
```
✓ Compiled successfully
✓ All routes generated (28 pages, 0 static fragments failed)
✓ Build traces collected
✓ No type errors in groq-provider.ts or dependents
```

### ESLint Check
```
✔ No ESLint warnings or errors
```

### Imports
- All imports resolved: `@anthropic-ai/sdk`, `groq-sdk`
- No new dependencies added
- Module exports unchanged

---

## TECHNICAL DETAILS

### File State
- **Path:** `lib/ai/groq-provider.ts`
- **Lines changed:** 46 (MAX_TOKENS), 48–52 (SYSTEM_PROMPTS object)
- **Template literal syntax:** Valid backticks, newline-preserved, no variable interpolation
- **Indentation:** Consistent 2-space (Next.js standard)

### API Contract
- `generateComment(input: AICommentInput)` signature unchanged
- Response structure unchanged: `{ comment, tokens_used }`
- Both Anthropic and Groq code paths benefit from new prompts
- No breaking changes to frontend, database, or routes

---

## EXPECTED IMPROVEMENTS

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| **Max tokens** | 300 | 800 | +500 |
| **Output words** | 80–100 | 200–250 | +120–150 |
| **Structure** | Unstructured | 5–7 step analysis | Strategic |
| **Actionability** | Generic ("dai consigli") | Scenario-specific | High |
| **Cost/user/generation** | $0.00003 | $0.00015 | +$0.00012 (negligible) |

---

## MANUAL TESTING PLAN (Next Step)

### On localhost:3004

#### OGGI Comment (Dashboard)
- [ ] Navigate to `/dashboard`
- [ ] Click "Genera commento" (OGGI section)
- [ ] Verify output contains:
  - Readiness state (GO/CAUTION/STOP) with reasoning
  - CTL/ATL analysis (forma type)
  - HRV/RHR/sleep interpretation
  - Concrete advice per readiness level
  - Word count: 150–200

#### PROFILO Comment (Profile Page)
- [ ] Navigate to `/profile`
- [ ] Click "Genera commento" (PROFILO section)
- [ ] Verify output contains:
  - Phenotype explanation (what it means for this athlete)
  - CP/W′ interpretation
  - Strengths + limiters
  - RPP 14-day trend analysis
  - Training recommendations
  - Word count: 150–180

#### PERCORSO Comment (Terrain/Race Page)
- [ ] Navigate to `/terrain` (if available) or race planning screen
- [ ] Click "Genera commento" (PERCORSO section)
- [ ] Verify output contains:
  - Race type (flat/climbs/mountain) + difficulty driver
  - Critical climbs (km position, category)
  - Phenotype fit assessment
  - Nutrition strategy (carbs, hydration)
  - Pacing per fenotipo
  - Recovery timeline post-race
  - Word count: 180–220

### Quality Checks
- [ ] No invented numbers (only reference payload data)
- [ ] All three comments in Italian (no English)
- [ ] Injury flags respected (if active → medico only, no workouts)
- [ ] Token counts: prompt 400–500, completion 100–200, total ≤800
- [ ] No API errors in browser console

---

## ROLLBACK PROCEDURE (If Needed)

1. Undo edits to `lib/ai/groq-provider.ts`:
   - Restore `MAX_TOKENS = 300`
   - Restore original 3 SYSTEM_PROMPTS (from git history)
2. Run `npm run build` (verify old prompts still work)
3. Test on localhost (comments should revert to short/generic)
4. Commit rollback if quality is unacceptable

---

## FILES AFFECTED

- **Modified:** `lib/ai/groq-provider.ts` (lines 46, 48–52)
- **No changes:** API routes, database, frontend components, dependencies

---

## NOTES FOR NEXT PHASE

- **A/B Testing:** Consider labeling v2 comments vs v1 for user feedback collection
- **Per-Phenotype Prompts:** Future enhancement—specialized advice for sprinters vs climbers vs climbers
- **Multi-Language:** Translate prompts to EN/ES/FR if expanding user base
- **Dynamic Token Budget:** Adjust max_tokens based on race profile complexity (900 for alpine races, 700 for flat time trials)

---

**Status:** Ready for manual testing on localhost.  
**Next Step:** Test comment generation on all three sections and verify word count / actionability.  
**Timeline:** 45 minutes coding ✅ + 15 minutes testing (pending) = ~1 hour total.
