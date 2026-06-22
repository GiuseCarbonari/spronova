"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function checkPassword(pw: string): { score: number; label: string; color: string } {
  if (!pw) return { score: 0, label: "", color: "" };
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const levels = [
    { score: 0, label: "", color: "" },
    { score: 1, label: "Debole", color: "#e05252" },
    { score: 2, label: "Sufficiente", color: "#e0a052" },
    { score: 3, label: "Buona", color: "#5b8def" },
    { score: 4, label: "Ottima", color: "#4caf7d" },
  ];
  return levels[score];
}

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = createClient();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  // Supabase invia il token nell'hash URL (#access_token=...&type=recovery).
  // Il client Supabase lo intercetta automaticamente all'evento PASSWORD_RECOVERY.
  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setSessionReady(true);
      }
    });
    return () => listener.subscription.unsubscribe();
  }, [supabase]);

  const pwStrength = checkPassword(password);

  async function handleUpdate() {
    if (password.length < 8) {
      setError("La password deve avere almeno 8 caratteri");
      return;
    }
    if (!/[A-Z]/.test(password)) {
      setError("La password deve contenere almeno una lettera maiuscola");
      return;
    }
    if (!/[0-9]/.test(password)) {
      setError("La password deve contenere almeno un numero");
      return;
    }
    if (!/[^A-Za-z0-9]/.test(password)) {
      setError("La password deve contenere almeno un carattere speciale (es. !@#$)");
      return;
    }
    if (password !== confirmPassword) {
      setError("Le password non coincidono");
      return;
    }

    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }
    setNotice("Password aggiornata. Reindirizzo al login…");
    setTimeout(() => router.push("/login"), 2000);
  }

  const inputClass =
    "h-10 w-full rounded-[9px] border-[0.5px] border-border bg-base px-3 text-sm text-foreground placeholder:text-muted outline-none transition-colors focus:ring-2 focus:ring-brand";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-base px-4 py-10">
      <div className="w-full max-w-[420px] rounded-2xl border-[0.5px] border-border bg-surface p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <svg width="36" height="36" viewBox="0 0 58 58" fill="none" aria-label="CurveLoad logo" className="mb-3">
            <circle cx="29" cy="29" r="22" stroke="url(#lgReset)" strokeWidth="5" strokeLinecap="round" strokeDasharray="138 0" />
            <defs>
              <linearGradient id="lgReset" x1="0" y1="0" x2="58" y2="58">
                <stop offset="0%" stopColor="#5b8def" />
                <stop offset="100%" stopColor="#7fc8c0" />
              </linearGradient>
            </defs>
          </svg>
          <p className="font-serif text-[20px] font-medium tracking-tight text-foreground">CurveLoad</p>
          <p className="mt-1 text-[13px] text-muted">Imposta una nuova password</p>
        </div>

        {!sessionReady ? (
          <p className="text-center text-[13px] text-muted">
            Verifica del link in corso…
          </p>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void handleUpdate();
            }}
          >
            <div className="flex flex-col gap-1.5">
              <label htmlFor="new-password" className="text-[13px] text-muted">Nuova password</label>
              <div className="relative">
                <input
                  id="new-password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${inputClass} pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-secondary"
                  aria-label={showPassword ? "Nascondi password" : "Mostra password"}
                >
                  <EyeIcon open={showPassword} />
                </button>
              </div>

              {password.length > 0 && (
                <div className="mt-1 flex flex-col gap-1">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className="h-1 flex-1 rounded-full transition-colors"
                        style={{ backgroundColor: pwStrength.score >= i ? pwStrength.color : "var(--color-border)" }}
                      />
                    ))}
                  </div>
                  {pwStrength.label && (
                    <p className="text-[11px]" style={{ color: pwStrength.color }}>{pwStrength.label}</p>
                  )}
                </div>
              )}

              <ul className="mt-1 space-y-0.5 text-[11px] text-muted">
                <li className={password.length >= 8 ? "text-[#4caf7d]" : ""}>{password.length >= 8 ? "✓" : "·"} Almeno 8 caratteri</li>
                <li className={/[A-Z]/.test(password) ? "text-[#4caf7d]" : ""}>{/[A-Z]/.test(password) ? "✓" : "·"} Una lettera maiuscola</li>
                <li className={/[0-9]/.test(password) ? "text-[#4caf7d]" : ""}>{/[0-9]/.test(password) ? "✓" : "·"} Un numero</li>
                <li className={/[^A-Za-z0-9]/.test(password) ? "text-[#4caf7d]" : ""}>{/[^A-Za-z0-9]/.test(password) ? "✓" : "·"} Un carattere speciale</li>
              </ul>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="confirm-new-password" className="text-[13px] text-muted">Conferma password</label>
              <div className="relative">
                <input
                  id="confirm-new-password"
                  type={showConfirm ? "text" : "password"}
                  required
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={`${inputClass} pr-10`}
                  style={{
                    borderColor:
                      confirmPassword.length > 0
                        ? password === confirmPassword ? "#4caf7d" : "#e05252"
                        : undefined,
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-secondary"
                  aria-label={showConfirm ? "Nascondi conferma" : "Mostra conferma"}
                >
                  <EyeIcon open={showConfirm} />
                </button>
              </div>
              {confirmPassword.length > 0 && password !== confirmPassword && (
                <p className="text-[11px] text-[#e05252]">Le password non coincidono</p>
              )}
              {confirmPassword.length > 0 && password === confirmPassword && (
                <p className="text-[11px] text-[#4caf7d]">Password confermata</p>
              )}
            </div>

            {error && (
              <div className="rounded-[9px] border-[0.5px] border-ready-skip-border bg-surface px-3 py-2 text-[13px] text-ready-skip">
                {error}
              </div>
            )}
            {notice && (
              <div className="rounded-[9px] border-[0.5px] border-border bg-surface-2 px-3 py-2 text-[13px] text-secondary">
                {notice}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="h-10 w-full rounded-[9px] bg-brand text-sm font-medium text-white transition-colors hover:bg-brand-hover disabled:pointer-events-none disabled:opacity-50"
            >
              {loading ? "Attendere…" : "Salva nuova password"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
