"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

type Mode = "signin" | "signup" | "reset";

function localizeError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) {
    return "Email o password non corretti";
  }
  if (m.includes("already registered") || m.includes("already been registered")) {
    return "Questa email è già registrata";
  }
  if (m.includes("password should be at least") || m.includes("password")) {
    return "Password troppo corta (min 8 caratteri)";
  }
  if (m.includes("email not confirmed")) {
    return "Conferma prima la tua email prima di accedere";
  }
  if (m.includes("user not found")) {
    return "Nessun account trovato con questa email";
  }
  if (m.includes("too many requests") || m.includes("rate limit")) {
    return "Troppi tentativi: riprova tra qualche minuto";
  }
  return message;
}

interface PasswordStrength {
  score: number; // 0-4
  label: string;
  color: string;
}

function checkPassword(pw: string): PasswordStrength {
  if (!pw) return { score: 0, label: "", color: "" };
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;

  const levels: PasswordStrength[] = [
    { score: 0, label: "", color: "" },
    { score: 1, label: "Debole", color: "#e05252" },
    { score: 2, label: "Sufficiente", color: "#e0a052" },
    { score: 3, label: "Buona", color: "#5b8def" },
    { score: 4, label: "Ottima", color: "#4caf7d" },
  ];
  return levels[score];
}

function validateSignUp(
  email: string,
  password: string,
  confirmPassword: string
): string | null {
  if (!email.includes("@")) return "Inserisci un indirizzo email valido";
  if (password.length < 8) return "La password deve avere almeno 8 caratteri";
  if (!/[A-Z]/.test(password)) return "La password deve contenere almeno una lettera maiuscola";
  if (!/[0-9]/.test(password)) return "La password deve contenere almeno un numero";
  if (!/[^A-Za-z0-9]/.test(password))
    return "La password deve contenere almeno un carattere speciale (es. !@#$)";
  if (password !== confirmPassword) return "Le password non coincidono";
  return null;
}

// EyeOpen / EyeClosed icon components
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

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const pwStrength = checkPassword(password);

  async function handleSignIn() {
    setLoading(true);
    setError(null);
    setNotice(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(localizeError(error.message));
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  async function handleSignUp() {
    const validationError = validateSignUp(email, password, confirmPassword);
    if (validationError) {
      setError(validationError);
      return;
    }
    setLoading(true);
    setError(null);
    setNotice(null);
    const { data, error } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (error) {
      setError(localizeError(error.message));
      return;
    }
    if (!data.session) {
      setNotice(
        "Registrazione avviata: controlla la tua email per confermare l'account."
      );
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  async function handleResetPassword() {
    if (!email) {
      setError("Inserisci la tua email per ricevere il link di reset");
      return;
    }
    setLoading(true);
    setError(null);
    setNotice(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
    setLoading(false);
    if (error) {
      setError(localizeError(error.message));
      return;
    }
    setNotice("Abbiamo inviato un link per reimpostare la password alla tua email.");
  }

  function switchMode(next: Mode) {
    if (next === mode) return;
    setMode(next);
    setError(null);
    setNotice(null);
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setShowConfirmPassword(false);
  }

  const isSignin = mode === "signin";
  const isSignup = mode === "signup";
  const isReset = mode === "reset";

  const tabClass = (active: boolean) =>
    `rounded-[9px] py-1.5 text-[13px] font-medium transition-colors ${
      active
        ? "bg-surface-2 text-foreground"
        : "text-muted hover:text-foreground"
    }`;

  const inputClass =
    "h-10 w-full rounded-[9px] border-[0.5px] border-border bg-base px-3 text-sm text-foreground placeholder:text-muted outline-none transition-colors focus:ring-2 focus:ring-brand";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-base px-4 py-10">
      <div className="w-full max-w-[420px] rounded-2xl border-[0.5px] border-border bg-surface p-8">
        {/* Logo / nome */}
        <div className="mb-6 flex flex-col items-center text-center">
          <svg width="36" height="36" viewBox="0 0 58 58" fill="none" aria-label="CurveLoad logo" className="mb-3">
            <circle
              cx="29" cy="29" r="22"
              stroke="url(#lgLogin)"
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray="138 0"
            />
            <defs>
              <linearGradient id="lgLogin" x1="0" y1="0" x2="58" y2="58">
                <stop offset="0%" stopColor="#5b8def" />
                <stop offset="100%" stopColor="#7fc8c0" />
              </linearGradient>
            </defs>
          </svg>
          <p className="font-serif text-[20px] font-medium tracking-tight text-foreground">
            CurveLoad
          </p>
          <p className="mt-1 text-[13px] text-muted">
            {isReset ? "Reimposta la tua password" : "Accedi al tuo account CurveLoad"}
          </p>
        </div>

        {/* Tab toggle Accedi / Registrati (nascosto nella modalità reset) */}
        {!isReset && (
          <div className="mb-6 grid grid-cols-2 gap-1 rounded-[11px] bg-base p-1">
            <button type="button" onClick={() => switchMode("signin")} className={tabClass(isSignin)}>
              Accedi
            </button>
            <button type="button" onClick={() => switchMode("signup")} className={tabClass(isSignup)}>
              Registrati
            </button>
          </div>
        )}

        {!isReset && (
          <p className="mb-5 text-center text-[13px] leading-5 text-muted">
            {isSignin
              ? "Usa le credenziali di CurveLoad. Il collegamento a Intervals.icu resta separato."
              : "Crea il tuo account CurveLoad. Collegherai Intervals.icu nel passaggio successivo."}
          </p>
        )}

        {/* Form */}
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (isSignin) void handleSignIn();
            else if (isSignup) void handleSignUp();
            else void handleResetPassword();
          }}
        >
          {/* Email */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-[13px] text-muted">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </div>

          {/* Password (non mostrata in reset) */}
          {!isReset && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-[13px] text-muted">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete={isSignin ? "current-password" : "new-password"}
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

              {/* Indicatore forza password (solo in signup) */}
              {isSignup && password.length > 0 && (
                <div className="mt-1 flex flex-col gap-1">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className="h-1 flex-1 rounded-full transition-colors"
                        style={{
                          backgroundColor:
                            pwStrength.score >= i ? pwStrength.color : "var(--color-border)",
                        }}
                      />
                    ))}
                  </div>
                  {pwStrength.label && (
                    <p className="text-[11px]" style={{ color: pwStrength.color }}>
                      {pwStrength.label}
                      {pwStrength.score < 4 && (
                        <span className="text-muted">
                          {pwStrength.score === 1 && " — aggiungi maiuscole, numeri e simboli"}
                          {pwStrength.score === 2 && " — aggiungi numeri e un simbolo (es. !@#$)"}
                          {pwStrength.score === 3 && " — aggiungi un simbolo speciale (es. !@#$)"}
                        </span>
                      )}
                    </p>
                  )}
                </div>
              )}

              {/* Regole password in signup */}
              {isSignup && (
                <ul className="mt-1 space-y-0.5 text-[11px] text-muted">
                  <li className={password.length >= 8 ? "text-[#4caf7d]" : ""}>
                    {password.length >= 8 ? "✓" : "·"} Almeno 8 caratteri
                  </li>
                  <li className={/[A-Z]/.test(password) ? "text-[#4caf7d]" : ""}>
                    {/[A-Z]/.test(password) ? "✓" : "·"} Una lettera maiuscola
                  </li>
                  <li className={/[0-9]/.test(password) ? "text-[#4caf7d]" : ""}>
                    {/[0-9]/.test(password) ? "✓" : "·"} Un numero
                  </li>
                  <li className={/[^A-Za-z0-9]/.test(password) ? "text-[#4caf7d]" : ""}>
                    {/[^A-Za-z0-9]/.test(password) ? "✓" : "·"} Un carattere speciale (!@#$…)
                  </li>
                </ul>
              )}
            </div>
          )}

          {/* Conferma password (solo in signup) */}
          {isSignup && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="confirm-password" className="text-[13px] text-muted">
                Conferma password
              </label>
              <div className="relative">
                <input
                  id="confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  required
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={`${inputClass} pr-10`}
                  style={{
                    borderColor:
                      confirmPassword.length > 0
                        ? password === confirmPassword
                          ? "#4caf7d"
                          : "#e05252"
                        : undefined,
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-secondary"
                  aria-label={showConfirmPassword ? "Nascondi conferma password" : "Mostra conferma password"}
                >
                  <EyeIcon open={showConfirmPassword} />
                </button>
              </div>
              {confirmPassword.length > 0 && password !== confirmPassword && (
                <p className="text-[11px] text-[#e05252]">Le password non coincidono</p>
              )}
              {confirmPassword.length > 0 && password === confirmPassword && (
                <p className="text-[11px] text-[#4caf7d]">Password confermata</p>
              )}
            </div>
          )}

          {/* Errore */}
          {error && (
            <div className="rounded-[9px] border-[0.5px] border-ready-skip-border bg-surface px-3 py-2 text-[13px] text-ready-skip">
              {error}
            </div>
          )}

          {/* Notice */}
          {notice && (
            <div className="rounded-[9px] border-[0.5px] border-border bg-surface-2 px-3 py-2 text-[13px] text-secondary">
              {notice}
            </div>
          )}

          {/* Bottone primario */}
          <button
            type="submit"
            disabled={loading}
            className="h-10 w-full rounded-[9px] bg-brand text-sm font-medium text-white transition-colors hover:bg-brand-hover disabled:pointer-events-none disabled:opacity-50"
          >
            {loading
              ? "Attendere…"
              : isSignin
                ? "Accedi"
                : isSignup
                  ? "Crea account"
                  : "Invia link di reset"}
          </button>

          {/* Azioni secondarie */}
          {isSignin && (
            <div className="text-center">
              <button
                type="button"
                onClick={() => switchMode("reset")}
                className="text-[12px] text-muted hover:text-secondary"
              >
                Password dimenticata?
              </button>
            </div>
          )}

          {isReset && (
            <div className="text-center">
              <button
                type="button"
                onClick={() => switchMode("signin")}
                className="text-[12px] text-muted hover:text-secondary"
              >
                ← Torna all&apos;accesso
              </button>
            </div>
          )}
        </form>
      </div>

      {/* Privacy / ToS note (solo in signup) */}
      {isSignup && (
        <p className="mt-4 max-w-[420px] text-center text-[11px] text-muted">
          Creando un account accetti i nostri{" "}
          <a href="/legal/terms" className="underline hover:text-secondary">
            Termini di Servizio
          </a>{" "}
          e la nostra{" "}
          <a href="/legal/privacy" className="underline hover:text-secondary">
            Privacy Policy
          </a>
          . Trattiamo i tuoi dati nel rispetto del GDPR.
        </p>
      )}
    </main>
  );
}
