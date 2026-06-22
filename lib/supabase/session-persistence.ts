import type { CookieOptions } from "@supabase/ssr";

export const REMEMBER_ACCESS_COOKIE = "curveload-remember-access";
export const REMEMBER_ACCESS_MAX_AGE = 400 * 24 * 60 * 60;

export function shouldRememberAccess(value: string | undefined): boolean {
  return value !== "0";
}

export function applyRememberAccessToCookieOptions(
  options: CookieOptions,
  rememberAccess: boolean
): CookieOptions {
  if (rememberAccess || options.maxAge === 0) {
    return options;
  }

  const { expires: _expires, maxAge: _maxAge, ...sessionOptions } = options;
  return sessionOptions;
}

function isSupabaseAuthCookie(name: string): boolean {
  return name.startsWith("sb-") && name.includes("-auth-token");
}

function browserCookieSuffix(rememberAccess: boolean): string {
  const secure =
    typeof window !== "undefined" && window.location.protocol === "https:"
      ? "; Secure"
      : "";
  const maxAge = rememberAccess
    ? `; Max-Age=${REMEMBER_ACCESS_MAX_AGE}`
    : "";

  return `; Path=/; SameSite=Lax${maxAge}${secure}`;
}

export function setBrowserRememberAccess(rememberAccess: boolean): void {
  if (typeof document === "undefined") return;

  const suffix = browserCookieSuffix(rememberAccess);
  document.cookie = `${REMEMBER_ACCESS_COOKIE}=${
    rememberAccess ? "1" : "0"
  }${suffix}`;

  for (const cookie of document.cookie.split(";")) {
    const separator = cookie.indexOf("=");
    if (separator < 0) continue;

    const name = cookie.slice(0, separator).trim();
    if (!isSupabaseAuthCookie(name)) continue;

    const value = cookie.slice(separator + 1).trim();
    document.cookie = `${name}=${value}${suffix}`;
  }
}
