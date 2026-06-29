"use client";

import { CoachCommentCard } from "@/components/coach/coach-comment-card";
import { useAIComment } from "@/hooks/use-ai-comment";

interface CoachCommentProfiloProps {
  initialComment: string | null;
  initialGeneratedAt: string | null;
}

export function CoachCommentProfilo({
  initialComment,
  initialGeneratedAt,
}: CoachCommentProfiloProps) {
  const {
    comment,
    generatedAt,
    loading,
    error,
    configured,
    gatedToday,
    regenerate,
  } = useAIComment("profilo", initialComment, initialGeneratedAt);

  return (
    <section className="space-y-3">
      <div className="text-[11px] uppercase tracking-[0.14em] text-muted">
        Lettura della potenza
      </div>
      <CoachCommentCard
        section="profilo"
        comment={comment}
        generatedAt={generatedAt}
        loading={loading}
        error={error}
        configured={configured}
        canRegenerate={!gatedToday}
        onRegenerate={regenerate}
      />
    </section>
  );
}
