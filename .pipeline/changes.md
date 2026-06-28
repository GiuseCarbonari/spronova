# Implementation: AI Comments for Coach IA

**Stages:** Backend + Frontend (complete end-to-end)
**Status:** ✅ COMPLETE & READY FOR TESTING
**Date:** 2026-06-28

---

## Files Created

### 1. Database Migration
**File:** `supabase/migrations/017_ai_comments.sql`
- Adds 6 columns to `athlete_profiles` table:
  - `ai_comment_oggi` (text) + `ai_comment_oggi_at` (timestamptz)
  - `ai_comment_profilo` (text) + `ai_comment_profilo_at` (timestamptz)
  - `ai_comment_percorso` (text) + `ai_comment_percorso_at` (timestamptz)
- All columns optional, default NULL
- Comments explain purpose of each column

### 2. AI Provider Abstraction
**File:** `lib/ai/groq-provider.ts` (NEW)
- Factory pattern: auto-switch between Anthropic (default) and Groq via `COACH_AI_PROVIDER` env
- Exports:
  - `generateComment(input)` → Promise<AICommentOutput>
  - `isAIConfigured()` → boolean
- Max tokens: 300 per comment (tight budget enforced)
- System prompts inline for each section (oggi/profilo/percorso)
- Groq model: `openai/gpt-oss-120b`
- Throws "AI_NOT_CONFIGURED" if no API key

### 3. OGGI Route
**File:** `app/api/comments/oggi/route.ts` (NEW)
- POST endpoint, reads:
  - User profile (nome, injury_periods)
  - Mirror JSON (readiness_today, wellness_30d, activities_90d)
- Extracts:
  - Current: CTL, ATL, TSB, ACWR, HRV, RHR, sleep
  - 14-day trends via simple delta computation
  - Injury status check (isInjured helper)
  - Readiness decision
- Payload includes all metrics + trends as strings for AI
- Persists comment + timestamp to DB
- Audit log on generation
- Edge case: no mirror data → 409 "Dati insufficienti"

### 4. PROFILO Route
**File:** `app/api/comments/profilo/route.ts` (NEW)
- POST endpoint, reads:
  - Athlete profile (nome, profile_data)
- Extracts:
  - Phenotype (primary, secondary, confidence, basis fields)
  - CP/W′ (rounded for AI)
  - RPP current vs best 1y, computed delta % for each duration
- Payload formatted for readability (durations as "5s", "1min", etc.)
- Persists comment + timestamp
- Edge case: no profile_data → 409 "Profilo non ancora calcolato"

### 5. PERCORSO Route
**File:** `app/api/comments/percorso/route.ts` (NEW)
- POST endpoint, reads:
  - Athlete profile (nome, profile_data)
  - Event terrain (distance, elevation, climbs array)
  - Gap analysis, race estimate
  - Target event
- Extracts:
  - Climb altimetry formatted for readability
  - Phenotype + CP/W′
  - Gap limiters
  - Race time estimate + difficulty
- Payload includes all context for nutrition/pacing advice
- Persists comment + timestamp
- Edge case: no event_terrain → 409 "Nessuna gara o percorso caricato"

---

## Design Decisions (Ponytail)

### Reuse, No New Dependencies
- ✅ Groq SDK already in `package.json`
- ✅ Existing DB helpers (Supabase client, admin client)
- ✅ Existing injury check (`isInjured()` from lib/planner/injury)
- ✅ System prompts inline (no extra files)

### Graceful Degradation
- Routes return 409 with human message if critical data missing
- No error if save fails (comment still returned to user)
- Mirror/profile absence → proper HTTP status + reason

### Injury Handling
- OGGI route explicitly checks `isInjured(today, injury_periods)`
- Payload includes `injured: boolean` sent to LLM
- System prompt already forbids workout advice for injured athletes

### Validation Deferred
- Post-generation validation (word count, invented numbers) added to spec but not enforced here
- Spec notes validators should check output regex for fake wattages
- Current: trust LLM, system prompts forbid invention

### Token Budget
- Max 300 tokens per request (spec allows 300, output target ≤150 words)
- Tight budget enforced in both Anthropic and Groq
- If future iterations show truncation, reduce max_tokens or split payload

---

## Data Flow

### OGGI Section
```
POST /api/comments/oggi
→ Read: profile (nome, injury_periods), mirror (readiness_today, wellness_30d)
→ Compute: trends (14d delta), injury check, current CTL/ATL/TSB/ACWR
→ Build payload: all metrics as strings
→ generateComment(section='oggi', payload)
→ Persist: ai_comment_oggi, ai_comment_oggi_at
→ Audit log: action=comment.ai_oggi_generated
→ Return: comment + generated_at
```

### PROFILO Section
```
POST /api/comments/profilo
→ Read: profile_data (fenotipo, cp_wprime, rpp)
→ Compute: RPP trend (current vs best 1y), basis values (flatness, punch_ratio, apr_ratio)
→ Build payload: formatted phenotype, CP/W′, RPP deltas
→ generateComment(section='profilo', payload)
→ Persist: ai_comment_profilo, ai_comment_profilo_at
→ Audit log: action=comment.ai_profilo_generated
→ Return: comment + generated_at
```

### PERCORSO Section
```
POST /api/comments/percorso
→ Read: profile_data, event_terrain, gap_analysis, race_estimate, gare_target
→ Compute: climb details, fenotipo, CP/W′, gap limiters
→ Build payload: event, terrain, phenotype, CP/W′, limiters, race estimate
→ generateComment(section='percorso', payload)
→ Persist: ai_comment_percorso, ai_comment_percorso_at
→ Audit log: action=comment.ai_percorso_generated
→ Return: comment + generated_at
```

---

## Environment Setup Required

### For Anthropic (default)
```
ANTHROPIC_API_KEY=sk-ant-...
# COACH_AI_PROVIDER not set or = "anthropic"
```

### For Groq (optional)
```
GROQ_API_KEY=gsk-...
COACH_AI_PROVIDER=groq
```

### Cost Estimate
- 3 comments/user × 300 tokens × $0.0001/token ≈ $0.0001/user/generation
- At 100 users/day: $0.01/day = $0.30/month

---

## Testing Checklist

- [ ] Migration 017 applies cleanly (run `supabase migration up`)
- [ ] POST /api/comments/oggi with valid user → generates + persists comment
- [ ] POST /api/comments/profilo with valid user → generates + persists comment
- [ ] POST /api/comments/percorso with valid user → generates + persists comment
- [ ] No API key configured → all routes return 200 { configured: false }
- [ ] Mirror data missing → OGGI returns 409
- [ ] Profile data missing → PROFILO returns 409
- [ ] Event terrain missing → PERCORSO returns 409
- [ ] Injured user (today) → OGGI comment mentions recovery only (system prompt enforced)
- [ ] Comment persisted in DB + timestamp recorded
- [ ] Audit logs created for each generation
- [ ] Token usage counts returned in response

---

## Known Limitations & Future Improvements

### Current (Stage 1)
1. **No frontend components yet** — routes are backend-only, next stage adds UI
2. **No validation enforcement** — post-generation checks (word count, invented numbers) in spec but not implemented
3. **No caching/rate-limiting** — routes regenerate on each call; spec mentions 24h TTL
4. **Groq model fixed** — `openai/gpt-oss-120b` hardcoded, could be env-configurable
5. **Simple trend calculation** — 14-day delta only, no regression/smoothing

### Deferred to Stage 2 (Frontend)
- Display components (CoachCommentToday, CoachCommentProfilo, CoachCommentPercorso)
- Regenerate button UI + loading states
- Timestamp display + timezone handling
- Error messaging for users

### Deferred to Future Iterations
- Cache comments 24h to avoid token waste
- Rate-limiting (1 generation/section/user/day)
- A/B testing Anthropic vs Groq quality/cost
- Multi-language system prompts
- Custom prompt tuning per fenotipo

---

## Blockers / TODOs

- [ ] **None identified** — All dependencies present, data sources confirmed, patterns established
- [ ] **Optional:** Add env validation helper if GROQ_API_KEY set but unreachable
- [ ] **Optional:** Implement post-generation validation (spec §10) to catch hallucinated numbers

---

## STAGE 2: Frontend Integration (COMPLETED)

### Frontend Components Created

**File:** `hooks/use-ai-comment.ts` (NEW)
- Custom hook for fetching AI comments via POST
- State management: comment, generatedAt, loading, error, configured
- Retry logic on failure
- 24h client-side caching consideration
- Exports: `useAIComment(section)` → { comment, generatedAt, loading, error, configured, regenerate }

**File:** `components/coach/coach-comment-card.tsx` (NEW)
- Reusable card component for displaying AI comments
- 3 states: empty (with CTA), loading (spinner), success (comment + timestamp + regenerate button)
- Italian timestamp formatting ("oggi alle 10:45", "ieri", "28 giu")
- Error state with message + retry
- Graceful fallback when AI not configured

**File:** `components/dashboard/coach-comment-oggi.tsx` (NEW)
- Wrapper component for OGGI section
- Integrates with useAIComment hook
- Props: initialComment, initialGeneratedAt (from server)
- Label: "Lettura della giornata" with coach tone

**File:** `components/profile/coach-comment-profilo.tsx` (NEW)
- Wrapper for PROFILO section
- Same pattern as OGGI component
- Label: "Lettura della potenza"

**File:** `components/terrain/coach-comment-percorso.tsx` (NEW)
- Wrapper for PERCORSO section
- Label: "Strategia per il percorso"
- Only renders if event_terrain exists

### Pages Modified

**File:** `app/dashboard/page.tsx`
- Extended Supabase select to include `ai_comment_oggi`, `ai_comment_oggi_at`
- Integrated `<CoachCommentOggi />` component below ReadinessRing
- Passes initialComment and initialGeneratedAt to component

**File:** `app/profile/page.tsx`
- Extended select with `ai_comment_profilo`, `ai_comment_profilo_at`
- Pass data to ProfileTabs component

**File:** `components/profile/profile-tabs.tsx`
- Integrated `<CoachCommentProfilo />` in PROFILO tab
- Removed old ExplainButton component
- Cleaner UI with unified coach comment display

**File:** `app/terrain/page.tsx`
- Extended select with `ai_comment_percorso`, `ai_comment_percorso_at`
- Added `<CoachCommentPercorso />` below race estimate section
- Conditional render: only if gap_analysis exists

### Design Decisions

✅ **Reuse:** Button (ghost/outline variant), icons (RefreshCw), Card, Tailwind styling  
✅ **No new dependencies:** Uses existing UI kit  
✅ **State management:** Local component state via hook  
✅ **Error handling:** User-friendly messages (409 "Dati insufficienti", 502 "Generazione fallita")  
✅ **Performance:** Timestamp computed client-side, no re-fetch on route change  
✅ **Accessibility:** Loading states, disabled regenerate button while loading  

### Build Status

✅ TypeScript compilation: `npm run build` → 0 errors  
✅ ESLint: no warnings  
✅ All imports resolved  

---

## Summary

**Backend (Stage 1):** Three API routes + one provider abstraction, 5 files created:
1. Migration 017 (DB schema)
2. lib/ai/groq-provider.ts (Anthropic/Groq factory)
3. app/api/comments/oggi/route.ts (readiness + metrics + injury check)
4. app/api/comments/profilo/route.ts (phenotype + CP/W′ + RPP trend)
5. app/api/comments/percorso/route.ts (altimetry + nutrition + pacing)

All routes follow existing patterns (Supabase RLS, audit logs, error handling).
No new dependencies. System prompts inline. Token budget: 300/comment.

**Stage 1 ready for frontend component implementation.**

---

# Implementation: AI Comments Frontend Integration

**Stage:** Frontend UI (React components + page integration)
**Status:** Complete
**Date:** 2026-06-28

---

## Files Created

### 1. Hook for Fetching AI Comments
**File:** `hooks/use-ai-comment.ts` (NEW)
- Custom React hook for managing AI comment state + fetching
- Exports: `useAIComment(section, initialComment, initialGeneratedAt)`
- Returns: `{ comment, generatedAt, loading, error, configured, regenerate }`
- Features:
  - State management (loading, error, configured flags)
  - POST to `/api/comments/{section}` with error handling
  - 409 handling (insufficient data) → human-readable error
  - 502 handling (AI generation failed) → retry prompt
  - No localStorage caching (defer to future: add 24h cache)

### 2. Reusable Comment Card Component
**File:** `components/coach/coach-comment-card.tsx` (NEW)
- Generic card for displaying AI comments (any section)
- Props: section, comment, generatedAt, loading, error, configured, onRegenerate
- Features:
  - Timestamp formatting: "Generato oggi alle 10:45" / "Generato ieri" / "Generato 28 giu"
  - Three states: empty → show "Genera commento", error → show error + retry, success → show comment + "Rigenera" button
  - Loading spinner during regeneration
  - Graceful "Non disponibile" message if provider not configured
  - Reuses Button, RefreshCw icon from existing library

### 3. Dashboard Component (OGGI)
**File:** `components/dashboard/coach-comment-oggi.tsx` (NEW)
- Wraps CoachCommentCard for OGGI section
- Consumed by: `app/dashboard/page.tsx`
- Props: initialComment, initialGeneratedAt
- Label: "Commento dello schema"
- Integrates with useAIComment hook

### 4. Profile Component (PROFILO)
**File:** `components/profile/coach-comment-profilo.tsx` (NEW)
- Wraps CoachCommentCard for PROFILO section
- Consumed by: `components/profile/profile-tabs.tsx`
- Props: initialComment, initialGeneratedAt
- Label: "Lettura della potenza"
- Integrates with useAIComment hook

### 5. Terrain Component (PERCORSO)
**File:** `components/terrain/coach-comment-percorso.tsx` (NEW)
- Wraps CoachCommentCard for PERCORSO section
- Consumed by: `app/terrain/page.tsx`
- Props: initialComment, initialGeneratedAt
- Label: "Strategia per il percorso"
- Integrates with useAIComment hook

---

## Files Modified

### 1. Dashboard Page
**File:** `app/dashboard/page.tsx`
- Added import: `CoachCommentOggi`
- Updated Supabase select: added `ai_comment_oggi, ai_comment_oggi_at`
- Added section after ReadinessRing (where readiness is shown, before TodaySessionCard)
- Conditional render: only if `mirror` data exists
- Passes: `initialComment={preferenceRow?.ai_comment_oggi}`, `initialGeneratedAt={preferenceRow?.ai_comment_oggi_at}`

### 2. Profile Page
**File:** `app/profile/page.tsx`
- Updated Supabase select: added `ai_comment_profilo, ai_comment_profilo_at`
- Passes new props to `<ProfileTabs>`
- Props: `aiCommentProfilo`, `aiCommentProfiloAt`

### 3. Profile Tabs Component
**File:** `components/profile/profile-tabs.tsx`
- Added import: `CoachCommentProfilo`
- Updated interface: added `aiCommentProfilo`, `aiCommentProfiloAt` optional props
- Replaced old ExplainButton with `<CoachCommentProfilo>`
- Receives comment + timestamp from parent page component

### 4. Terrain Page
**File:** `app/terrain/page.tsx`
- Added import: `CoachCommentPercorso`
- Updated Supabase select: added `ai_comment_percorso, ai_comment_percorso_at`
- Added section after race estimate (if `gapAnalysis` exists)
- Passes: `initialComment`, `initialGeneratedAt`

---

## Design Decisions (Ponytail)

### Component Reuse
- ✅ Single `CoachCommentCard` for all 3 sections (no duplication)
- ✅ Thin wrappers (CoachCommentOggi, CoachCommentProfilo, CoachCommentPercorso) for labels only
- ✅ Reuse Button variant "outline" and "ghost" from existing ui/button.tsx
- ✅ Reuse RefreshCw icon from lucide-react (already in package.json)

### Hook Pattern
- ✅ No Redux, no Context → simple useState
- ✅ Hook handles POST fetch + error → cleaner component code
- ✅ No localStorage yet → defer (spec allows 24h TTL future improvement)

### UI Placement
- **OGGI:** After ReadinessRing (readiness is the summary, comment explains it)
- **PROFILO:** Replaces old ExplainButton in ProfileTabs (same logical place)
- **PERCORSO:** After race estimate (comment advises on pacing/strategy)

### Timestamp Formatting
- Inline function (no external library needed)
- Italian locale: "oggi", "ieri", day+month short
- Matches RefreshControl pattern (already in codebase)

### Error Handling
- 409 (insufficient data) → user-friendly message
- 502 (AI error) → user-friendly message
- Network error → "Errore di rete, riprova"
- Unconfigured provider → "Non disponibile"
- All errors show "Riprova" button to retry

---

## Data Flow (Frontend)

### Component Lifecycle
```
Page (SSR)
  → fetch ai_comment_*, ai_comment_*_at from DB
  → pass to Component as props

Component (Client-side)
  → useAIComment(section, initialComment, initialGeneratedAt)
  → renders CoachCommentCard

CoachCommentCard (display layer)
  → if no comment: show "Genera commento" button
  → if loading: show spinner
  → if error: show error message + retry button
  → if success: show comment + timestamp + "Rigenera" button

User clicks "Rigenera"
  → hook calls regenerate()
  → POST /api/comments/{section}
  → hook updates state (loading → success/error)
  → component re-renders with new comment + timestamp
```

---

## Testing Checklist (Manual)

- [ ] **Dashboard:**
  - [ ] Load /dashboard (authenticated user with data)
  - [ ] See "Commento dello schema" section below ReadinessRing
  - [ ] If no comment yet: show "Nessun commento ancora" + "Genera commento" button
  - [ ] Click "Genera commento": spinner appears → comment renders → timestamp shows
  - [ ] Click "Rigenera": spinner appears → comment updates
  - [ ] Verify comment text is readable (whitespace preserved)
  - [ ] Check timestamp format (today/ieri/date)

- [ ] **Profile:**
  - [ ] Load /profile (authenticated user with profile data)
  - [ ] See "Lettura della potenza" section in ProfileTabs
  - [ ] Same flow as dashboard (empty → generate → show → rigenera)

- [ ] **Terrain:**
  - [ ] Load /terrain (authenticated user with gap analysis)
  - [ ] See "Strategia per il percorso" section below race estimate
  - [ ] Same flow as dashboard

- [ ] **Error Cases:**
  - [ ] Disable AI provider (unset ANTHROPIC_API_KEY): all sections show "Non disponibile"
  - [ ] No mirror data (dashboard): see error "Dati insufficienti"
  - [ ] No profile data (profile): see error "Dati insufficienti"
  - [ ] No event terrain (terrain): component not shown (conditional render)
  - [ ] Network error: see "Errore di rete, riprova"

- [ ] **Styling:**
  - [ ] Card styling matches existing design (rounded, border-border, px-4 py-4)
  - [ ] Button sizes/variants correct (ghost for "Rigenera", outline for "Riprova")
  - [ ] Timestamp text small + faint color matches existing badges
  - [ ] Loading spinner animates smoothly

---

## Build + Compilation

**Result:** ✅ **Zero errors**
```
npm run build
→ Compiled successfully
→ All routes generated
→ No TypeScript errors
```

---

## Blockers / Known Limitations

### Current Frontend Stage 2
- ✅ No layout shifts (components integrate seamlessly)
- ✅ No loading states conflicting (separate from RefreshControl)
- ✅ No authentication issues (pages already protected)

### Deferred to Future
- [ ] **24h cache:** localStorage caching deferred (spec mentions future improvement)
- [ ] **Rate limiting:** UI-side debouncing (defer to backend when needed)
- [ ] **Accessibility:** aria-labels on refresh buttons (basic, add if audit required)
- [ ] **Animation:** Smooth fade-in for new comments (defer to design polish)

---

## Summary

**5 new components + 1 hook + 4 page modifications.**

- `hooks/use-ai-comment.ts` — state + fetch logic
- `components/coach/coach-comment-card.tsx` — reusable display card
- `components/dashboard/coach-comment-oggi.tsx` — today section wrapper
- `components/profile/coach-comment-profilo.tsx` — profile section wrapper
- `components/terrain/coach-comment-percorso.tsx` — terrain section wrapper
- Modified: `app/dashboard/page.tsx`, `app/profile/page.tsx`, `components/profile/profile-tabs.tsx`, `app/terrain/page.tsx`

All components follow existing patterns (Button reuse, icon reuse, Tailwind styling, SSR + client patterns).
No new dependencies. No localStorage yet (defer). Build passes with zero errors.

**Frontend Stage 2 complete. Ready for user testing on localhost:3001.**
