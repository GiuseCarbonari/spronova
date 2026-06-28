# AI Comments Fix Plan — Applied Changes

## Summary
Applied 4 corrections to GROQ AI provider and comment routes per spec.md. All fixes validated with TypeScript compilation (no syntax errors).

---

## Files Modified

### 1. lib/ai/groq-provider.ts
**STEP 1: Fix GROQ Model Name** (BLOCKING)
- **Line 135:** Changed `model: "openai/gpt-oss-120b"` → `model: "mixtral-8x7b-32768"`
- **Reason:** Invalid GROQ model identifier; correct model is Mixtral 8x7b with 32k context.

**STEP 2: Add Response Validation**
- **Lines 149-162:** Replaced silent empty-string fallback with proper error throwing
- **Change:**
  - Removed: `const comment = response.choices[0]?.message?.content || "";`
  - Added: Validation block checking `!response.choices || response.choices.length === 0` → throw `GROQ_EMPTY_RESPONSE`
  - Added: Check `!comment` after extraction → throw `GROQ_EMPTY_CONTENT`
- **Reason:** Surfaces API failures as exceptions instead of silent empty strings; routes already handle exceptions.

---

### 2. app/api/comments/profilo/route.ts
**STEP 3: Remove Dead Authorization Header Code**
- **Lines 46-48:** Deleted unused Bearer token extraction
  ```typescript
  // REMOVED:
  // const authHeader = request.headers.get('Authorization');
  // const token = authHeader?.replace('Bearer ', '');
  ```
- **Reason:** Token was parsed but never used; routes rely on cookie-based auth via Supabase context.

**STEP 4: Align Logging**
- **Line 52:** Changed logging from `console.log('[PROFILO] No user found, returning 401');` → `// No user found, returning 401. Use Supabase context for auth details.`
- **Reason:** Consistent with OGGI route (no custom prefix); comment explains intent instead.

---

### 3. app/api/comments/percorso/route.ts
**STEP 3: Remove Dead Authorization Header Code**
- **Lines 56-58:** Deleted unused Bearer token extraction
  ```typescript
  // REMOVED:
  // const authHeader = request.headers.get('Authorization');
  // const token = authHeader?.replace('Bearer ', '');
  ```
- **Reason:** Token was parsed but never used; routes rely on cookie-based auth via Supabase context.

**STEP 4: Align Logging**
- **Line 63:** Changed logging from `console.log('[PERCORSO] No user found, returning 401');` → `// No user found, returning 401. Use Supabase context for auth details.`
- **Reason:** Consistent with OGGI route (no custom prefix); comment explains intent instead.

---

## Compilation Status
✅ **TypeScript Validation:** No syntax errors. Project compiles cleanly (`npx tsc --noEmit`).

---

## Line-by-Line Changes Summary

| File | Change | Lines |
|------|--------|-------|
| lib/ai/groq-provider.ts | Fix model name | 135 |
| lib/ai/groq-provider.ts | Add response validation | 149–162 (8 lines) |
| app/api/comments/profilo/route.ts | Remove dead header code | 46–48 |
| app/api/comments/profilo/route.ts | Fix logging | 52 |
| app/api/comments/percorso/route.ts | Remove dead header code | 56–58 |
| app/api/comments/percorso/route.ts | Fix logging | 63 |

---

## Testing Checklist

- [x] All 4 steps applied in correct order (BLOCKING → dependent → optional)
- [x] No new syntax errors introduced
- [x] Dead code removed (Bearer token extraction)
- [x] Logging aligned across OGGI/PROFILO/PERCORSO routes
- [x] Response validation added (will catch GROQ API failures)

## Next Steps

1. **Before deploying:** Test GROQ provider with real API key (GROQ_API_KEY in .env.local)
2. **Route tests:** POST to /api/comments/profilo and /api/comments/percorso should:
   - Return 502 + GROQ_EMPTY_RESPONSE if API returns empty choices
   - Return 502 + GROQ_EMPTY_CONTENT if API returns empty content
   - Return 200 + comment if API works
3. **Cross-origin:** Verify routes work with Bearer tokens if mobile client support is needed (currently not implemented; would require full fallback logic).
