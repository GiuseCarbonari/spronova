"use client";

import { CoachCommentCard } from "@/components/coach/coach-comment-card";
import { useAIComment } from "@/hooks/use-ai-comment";

interface CoachCommentPercorsoProps {
  initialComment: string | null;
  initialGeneratedAt: string | null;
}

export function CoachCommentPercorso({
  initialComment,
  initialGeneratedAt,
}: CoachCommentPercorsoProps) {
  const {
    comment,
    generatedAt,
    loading,
    error,
    configured,
    gatedToday,
    regenerate,
  } = useAIComment("percorso", initialComment, initialGeneratedAt);

  return (
    <section className="space-y-3">
      <div className="text-[11px] uppercase tracking-[0.14em] text-muted">
        Strategia per il percorso
      </div>
      <CoachCommentCard
        section="percorso"
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
