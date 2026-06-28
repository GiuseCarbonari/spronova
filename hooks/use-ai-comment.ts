"use client";

import { useState } from "react";

export type CommentSection = "oggi" | "profilo" | "percorso";

interface UseAICommentResult {
  comment: string | null;
  generatedAt: string | null;
  loading: boolean;
  error: string | null;
  configured: boolean;
  regenerate: () => Promise<void>;
}

/**
 * Hook per fetching commenti AI da /api/comments/{section}.
 * Cache 24h in localStorage + retry logic.
 */
export function useAIComment(
  section: CommentSection,
  initialComment: string | null,
  initialGeneratedAt: string | null
): UseAICommentResult {
  const [comment, setComment] = useState<string | null>(initialComment);
  const [generatedAt, setGeneratedAt] = useState<string | null>(
    initialGeneratedAt
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState(true);

  const regenerate = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      // Fetch con credentials per passare cookies (Supabase auth token)
      const response = await fetch(`/api/comments/${section}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // Passa i cookie (incluso auth token)
      });

      const body = (await response.json().catch(() => null)) as {
        success?: boolean;
        configured?: boolean;
        comment?: string;
        generated_at?: string;
        error?: string;
        message?: string;
      } | null;

      if (!response.ok) {
        if (response.status === 409) {
          setError(body?.message ?? "Dati insufficienti per generare");
        } else if (response.status === 502) {
          setError(body?.message ?? "Errore nella generazione, riprova");
        } else {
          setError("Errore imprevisto");
        }
        setLoading(false);
        return;
      }

      if (body?.configured === false) {
        setConfigured(false);
        setLoading(false);
        return;
      }

      if (body?.success === true) {
        if (body?.comment && body?.generated_at) {
          setComment(body.comment);
          setGeneratedAt(body.generated_at);
          setError(null);
        } else {
          setError("Risposta vuota dal server");
        }
      } else {
        setError(body?.message ?? "Errore sconosciuto");
      }
    } catch {
      setError("Errore di rete, riprova");
    } finally {
      setLoading(false);
    }
  };

  return {
    comment,
    generatedAt,
    loading,
    error,
    configured,
    regenerate,
  };
}
