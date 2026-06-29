import { NextResponse } from "next/server";

import { answerCoachQuestion, isAIConfigured } from "@/lib/ai/groq-provider";
import { buildCoachContext, COACH_PROFILE_COLUMNS } from "@/lib/ai/coach-context";
import type { MirrorData } from "@/lib/intervals/sync";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/coach/ask — Q&A coach conversazionale, STATELESS.
 *
 * Forma copiata da app/api/comments/oggi/route.ts (auth, gate AI, lettura
 * profilo+snapshot in parallelo, degrado AI_NOT_CONFIGURED → {configured:false},
 * 502 generico, audit). Differenze: legge `question` dal body e la valida (input
 * validation al trust boundary), nessun gating giornaliero, nessuna persistenza,
 * e se manca il mirror NON fallisce (degrada: il coach segnala l'assenza di dati).
 */

const MAX_QUESTION_LEN = 500;

/** Local date YYYY-MM-DD. */
function todayISO(): string {
  return new Date().toLocaleDateString("en-CA");
}

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { success: false, error: "unauthorized", message: "Non autenticato" },
      { status: 401 }
    );
  }

  // --- Input validation al trust boundary -----------------------------------
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const rawQuestion = (body as { question?: unknown } | null)?.question;
  const question = typeof rawQuestion === "string" ? rawQuestion.trim() : "";
  if (question.length === 0) {
    return NextResponse.json(
      { success: false, error: "invalid_input", message: "Domanda mancante" },
      { status: 400 }
    );
  }
  if (question.length > MAX_QUESTION_LEN) {
    return NextResponse.json(
      {
        success: false,
        error: "invalid_input",
        message: `Domanda troppo lunga (max ${MAX_QUESTION_LEN} caratteri)`,
      },
      { status: 400 }
    );
  }

  if (!isAIConfigured()) {
    return NextResponse.json({ success: true, configured: false });
  }

  // --- Profilo (dossier+CP) + mirror in parallelo ---------------------------
  const [profileRes, snapshotRes] = await Promise.all([
    supabase
      .from("athlete_profiles")
      .select(COACH_PROFILE_COLUMNS)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("athlete_metrics_snapshots")
      .select("mirror_data")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const profileRow = (profileRes?.data ?? null) as Record<string, unknown> | null;
  const mirror = (snapshotRes?.data?.mirror_data ?? null) as MirrorData | null;

  const today = todayISO();
  const ctx = buildCoachContext(profileRow, mirror, today);

  let answer: string;
  try {
    const result = await answerCoachQuestion(ctx, question);
    answer = result.answer;
  } catch (error) {
    if (error instanceof Error && error.message === "AI_NOT_CONFIGURED") {
      return NextResponse.json({ success: true, configured: false });
    }
    console.error(
      "Risposta coach fallita:",
      error instanceof Error ? error.message : "errore sconosciuto"
    );
    return NextResponse.json(
      { success: false, error: "ai_error", message: "Risposta del coach fallita, riprova" },
      { status: 502 }
    );
  }

  // --- Audit (niente testo della domanda: privacy, solo lunghezza) ----------
  const admin = createAdminClient();
  await admin.from("audit_logs").insert({
    user_id: user.id,
    action: "coach.ai_question_asked",
    source: "coach_ask",
    payload: {
      readiness: ctx.readiness?.decision ?? null,
      stale: ctx.data_freshness.stale,
      question_len: question.length,
    },
  });

  return NextResponse.json({ success: true, configured: true, answer });
}
