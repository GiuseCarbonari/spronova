import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Middleware di protezione rotte (Milestone 1, punto 4; onboarding Milestone 4).
 *
 * Per le rotte protette (/dashboard, /profile, /plan, /settings, /onboarding):
 *  - senza sessione Supabase → redirect a /login;
 *  - con sessione ma senza connessione Intervals → redirect a /connect;
 *  - connesso ma onboarding non completato → redirect a /onboarding
 *    (PRD §12). /onboarding stesso è escluso da quest'ultimo check per non
 *    creare un loop di redirect.
 *
 * Perché qui e non nelle pagine: il controllo a livello middleware copre
 * automaticamente ogni futura sotto-rotta protetta senza doverlo ripetere,
 * e gira PRIMA del rendering — nessun contenuto protetto viene mai
 * renderizzato per un utente non autorizzato.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Client Supabase legato ai cookie della richiesta: valida la sessione e
  // propaga il refresh dei cookie (token scaduto → nuovo token in response).
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: { name: string; value: string; options: CookieOptions }[]
        ) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            // Propaga sempre Max-Age lungo sui cookie di sessione Supabase
            // così il refresh token sopravvive alla chiusura dell'app su mobile.
            const isAuthCookie =
              name.startsWith("sb-") && name.includes("-auth-token");
            response.cookies.set(name, value, {
              ...options,
              ...(isAuthCookie && !options.maxAge && options.maxAge !== 0
                ? { maxAge: 400 * 24 * 60 * 60 }
                : {}),
            });
          });
        },
      },
    }
  );

  // getUser() valida il JWT contro Supabase (non si fida del solo cookie).
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // La query passa da RLS con l'identità dell'utente: può vedere solo la
  // propria eventuale connessione.
  const { data: connection } = await supabase
    .from("intervals_connections")
    .select("user_id")
    .maybeSingle();
  if (!connection) {
    return NextResponse.redirect(new URL("/connect", request.url));
  }

  // Onboarding (PRD §12): connesso ma dossier non completato → al wizard.
  // /onboarding è escluso da questo check (altrimenti redirect infinito).
  const path = request.nextUrl.pathname;
  const isOnboarding = path === "/onboarding" || path.startsWith("/onboarding/");
  if (!isOnboarding) {
    const { data: profile } = await supabase
      .from("athlete_profiles")
      .select("onboarding_completed")
      .maybeSingle();
    if (!profile?.onboarding_completed) {
      return NextResponse.redirect(new URL("/onboarding", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/profile/:path*",
    "/plan/:path*",
    "/settings/:path*",
    "/onboarding",
  ],
};
