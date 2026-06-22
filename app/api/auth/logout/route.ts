import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Chiude la sessione CurveLoad senza rimuovere il collegamento a Intervals.icu.
 */
export async function POST(request: Request) {
  const supabase = createClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error("Logout CurveLoad fallito:", error.message);
    return new NextResponse("Logout non riuscito", { status: 500 });
  }

  return NextResponse.redirect(new URL("/login", request.url), 303);
}
