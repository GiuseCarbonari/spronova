"use client";

import { CoachCommentCard } from "@/components/coach/coach-comment-card";
import { useAIComment } from "@/hooks/use-ai-comment";

interface CoachCommentOggiProps {
  initialComment: string | null;
  initialGeneratedAt: string | null;
}

export function CoachCommentOggi({
  initialComment,
  initialGeneratedAt,
}: CoachCommentOggiProps) {
  const {
    comment,
    generatedAt,
    loading,
    error,
    configured,
    gatedToday,
    regenerate,
  } = useAIComment("oggi", initialComment, initialGeneratedAt);

  return (
    <section className="space-y-3">
      <div className="text-[11px] uppercase tracking-[0.14em] text-muted">
        Commento dello schema
      </div>
      <CoachCommentCard
        section="oggi"
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
