# GROQ AI Provider Fix Plan

## Errors Found

### ERROR 1: Invalid GROQ Model Name
**File:** `lib/ai/groq-provider.ts:135`  
**Current:** `model: "openai/gpt-oss-120b"`  
**Root Cause:** This model identifier is incorrect. The GROQ API does not use OpenAI model names. GROQ offers its own model lineup (Mixtral 8x7b, Mixtral 8x22b, etc.) and uses different naming format.  
**Official Docs Reference:** https://console.groq.com/docs/quickstart — valid model IDs are `mixtral-8x7b-32768` (default), `mixtral-8x22b-32768`, `llama3-70b-8192`, etc.

### ERROR 2: Missing Error Handling for GROQ API Responses
**File:** `lib/ai/groq-provider.ts:149`  
**Current:** `const comment = response.choices[0]?.message?.content || ""`  
**Root Cause:** Silent empty string fallback masks API failures. No null/undefined checks before accessing nested response.choices[0]. If GROQ returns error status or empty choices array, the comment becomes empty string with no error signal — the calling routes treat this as success.  
**Official Docs Reference:** https://console.groq.com/docs/message-response — responses must be validated for error status and content presence before extraction.

### ERROR 3: Incorrect Usage of useAIComment Hook in PROFILO/PERCORSO Routes
**File:** `app/api/comments/profilo/route.ts:46-49` and `app/api/comments/percorso/route.ts:56-59`  
**Current:** Both files extract Authorization header but never use it. They call `createClient()` which reads auth from cookies via Supabase context, making the header extraction dead code.  
**Root Cause:** Route tries to support Bearer tokens but provides no fallback mechanism if cookies are missing. The header is parsed but ignored, creating inconsistency with OGGI route (which does not attempt header extraction).  
**Impact:** PROFILO and PERCORSO will fail silently if:
  - Request has no cookies (e.g., mobile app without cookie support)
  - Request has Bearer token but no session cookie
  - OGGI route works because it only relies on cookies

### ERROR 4: Inconsistent Error Reporting Between Routes
**File:** `app/api/comments/profilo/route.ts:56-61` vs `app/api/comments/percorso/route.ts:66-72` vs `app/api/comments/oggi/route.ts:44-49`  
**Current:** PROFILO and PERCORSO log "[PROFILO]" / "[PERCORSO]" prefixes on missing user, OGGI does not log prefix.  
**Root Cause:** Minor inconsistency in logging format makes debugging harder (no issue in logic but affects observability). More importantly, both routes silently return 401 without attempting to use the parsed Authorization header, indicating incomplete implementation.

---

## Root Cause Analysis

**Primary Root Cause:** GROQ provider implementation never tested or validated against actual GROQ API. The model name `"openai/gpt-oss-120b"` was likely a placeholder copied from another project or misunderstanding of GROQ's model naming scheme.

**Secondary Root Cause:** PROFILO/PERCORSO routes parse Authorization header as future-proofing but do not implement fallback logic. Routes assume cookies always present, making them fragile for cross-origin or mobile requests.

**Tertiary Root Cause:** No validation of API response content in GROQ provider. Error responses from GROQ API are silently converted to empty strings, which routes then persist as valid comments.

---

## Fix Plan

### STEP 1: Fix GROQ Model Name (BLOCKING, must fix first)
**File:** `lib/ai/groq-provider.ts`  
**Change (line 135):**  
```diff
- model: "openai/gpt-oss-120b",
+ model: "mixtral-8x7b-32768",
```
**Why First:** GROQ API will reject invalid model names with 400 error. Fix this before testing any route.  
**Duration:** 1 line change.

### STEP 2: Add Response Validation to GROQ Provider
**File:** `lib/ai/groq-provider.ts`  
**Change (lines 148-157):**  
Current:
```typescript
const comment = response.choices[0]?.message?.content || "";

return {
  comment,
  tokens_used: {
    prompt: response.usage?.prompt_tokens || 0,
    completion: response.usage?.completion_tokens || 0,
  },
};
```

New:
```typescript
if (!response.choices || response.choices.length === 0) {
  throw new Error("GROQ_EMPTY_RESPONSE: no choices in response");
}

const comment = response.choices[0].message?.content;
if (!comment) {
  throw new Error("GROQ_EMPTY_CONTENT: message content is empty");
}

return {
  comment,
  tokens_used: {
    prompt: response.usage?.prompt_tokens || 0,
    completion: response.usage?.completion_tokens || 0,
  },
};
```

**Why:** Surfaces GROQ API errors (rate limits, model unavailable, quota exceeded) as proper exceptions. Routes already handle exceptions and return 502 with error message.  
**Duration:** 5 lines added, same exception handling as Anthropic branch.

### STEP 3: Remove Dead Authorization Header Code in PROFILO and PERCORSO
**File:** `app/api/comments/profilo/route.ts:46-49` and `app/api/comments/percorso/route.ts:56-59`  
**Change:**  
```diff
- const authHeader = request.headers.get('Authorization');
- const token = authHeader?.replace('Bearer ', '');
-
  const supabase = createClient();
```

**Why:** Code does nothing with extracted token. If future support for Bearer tokens is needed, implement full fallback logic (check token before cookies). For now, remove the incomplete half.  
**Duration:** 2 lines deleted per file (4 total).  
**Note:** OGGI route does not attempt this, so remove for consistency.

### STEP 4: Align Logging Between Routes (optional but recommended)
**File:** `app/api/comments/profilo/route.ts:56` and `app/api/comments/percorso/route.ts:67`  
**Change:**  
```diff
- console.log('[PROFILO] No user found, returning 401');
+ // No user found, returning 401. Use Supabase context for auth details.
```

**Why:** Log message adds no value (generic 401 response), and including section name is already clear from error context. Aligns with OGGI route (no custom logging).  
**Duration:** 1 line per file (2 total).

---

## Dependency Graph

```
STEP 1 (Model Fix) 
  ↓
STEP 2 (Response Validation) 
  ↓
[Test GROQ Provider]
  ↓
STEP 3 (Remove Dead Code) — independent, can run in parallel with testing
STEP 4 (Logging Alignment) — independent, cosmetic
```

**Critical Path:** 1 → 2 → Test → (3 + 4 in parallel)

### Test After Each Step
- **After Step 1:** `POST /api/comments/profilo` should fail with model error from GROQ (not empty string)
- **After Step 2:** `POST /api/comments/profilo` should fail with "GROQ_EMPTY_CONTENT" if API returns empty, or succeed with comment if API works
- **After Step 3:** Code is cleaner, behavior identical
- **After Step 4:** Logging consistent across three routes

---

## Success Criteria

✓ GROQ API returns valid model ID (confirmed in error response or success)  
✓ PROFILO route generates comment without silent failures  
✓ PERCORSO route generates comment without silent failures  
✓ Both routes fail loudly (502 + error message) if GROQ is down or misconfigured  
✓ No dead code (Authorization header parsing removed)  
✓ Logging is consistent across OGGI, PROFILO, PERCORSO routes

---

## Open Questions for Next Phase

None at fix stage. If after implementation PROFILO/PERCORSO still fail:
1. Check GROQ API key is set in `.env.local` (GROQ_API_KEY)
2. Verify GROQ account has API quota remaining
3. Check GROQ_API_KEY is not an Anthropic key (common mix-up)
4. Run full end-to-end test with athlete profile + real Supabase data
