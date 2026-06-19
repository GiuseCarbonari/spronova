import { NextResponse } from "next/server";

import { decryptToken } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/debug/inspect-power — SOLO SVILUPPO (Milestone 3, passo 1).
 *
 * Strumento di ispezione una-tantum: mostra la STRUTTURA grezza delle
 * risposte di due endpoint Intervals la cui forma non è ancora verificata
 * (power-curves.json e i campi estesi di /athlete/0). Serve a decidere il
 * parser del Modulo Profilo (§33) sui campi REALI, non su supposizioni.
 *
 * Non salva nulla, non parsa nulla. In produzione risponde 404.
 * I valori sensibili (email, nome, ecc.) vengono oscurati; il token non
 * compare mai nell'output.
 */

// La route legge i cookie di sessione: mai prerenderizzarla in build.
export const dynamic = "force-dynamic";

// Chiavi il cui valore non deve comparire nell'output di debug.
const REDACTED_KEY_PATTERN =
  /email|name|phone|address|password|token|secret|city|country/i;

const MAX_DEPTH = 5;
const MAX_ARRAY_SAMPLE = 3;
const MAX_OBJECT_KEYS = 60;
const MAX_STRING_LENGTH = 80;

/**
 * Riduce un JSON arbitrario a una descrizione di struttura: chiavi e tipi
 * reali, array accorciati ai primi 3 elementi, stringhe troncate, valori
 * sensibili oscurati. Abbastanza fedele da progettarci sopra un parser,
 * abbastanza povera da poterla incollare in chat.
 */
function describeStructure(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value ?? null;

  if (typeof value === "string") {
    return value.length > MAX_STRING_LENGTH
      ? `${value.slice(0, MAX_STRING_LENGTH)}… [string, ${value.length} chars]`
      : value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;

  if (depth >= MAX_DEPTH) return `[oltre profondità ${MAX_DEPTH}]`;

  if (Array.isArray(value)) {
    return {
      _type: "array",
      _length: value.length,
      _first_items: value
        .slice(0, MAX_ARRAY_SAMPLE)
        .map((item) => describeStructure(item, depth + 1)),
    };
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    const described: Record<string, unknown> = {};
    for (const [key, val] of entries.slice(0, MAX_OBJECT_KEYS)) {
      described[key] = REDACTED_KEY_PATTERN.test(key)
        ? "[redacted]"
        : describeStructure(val, depth + 1);
    }
    if (entries.length > MAX_OBJECT_KEYS) {
      described._truncated_keys = entries.length - MAX_OBJECT_KEYS;
    }
    return described;
  }

  return `[${typeof value}]`;
}

export async function GET() {
  // Mai esposta fuori dallo sviluppo locale.
  if (process.env.NODE_ENV !== "development") {
    return new NextResponse(null, { status: 404 });
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: connection } = await admin
    .from("intervals_connections")
    .select("access_token_encrypted")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!connection) {
    return NextResponse.json(
      { error: "Nessun account Intervals collegato" },
      { status: 409 }
    );
  }

  const accessToken = decryptToken(connection.access_token_encrypted);
  const headers = { Authorization: `Bearer ${accessToken}` };

  // Endpoint in corso di verifica (docs/INTERVALS_API_NOTES.md).
  // La curva Run è un'aggiunta da verificare (Modulo Corsa): stessa
  // power-curves.json con type=Run. Per i runner senza misuratore contiene
  // la curva pace/GAP; resta da accertare se i powerModels (CS/D′) ci siano.
  const [rideResponse, runResponse, profileResponse] = await Promise.all([
    fetch(
      "https://intervals.icu/api/v1/athlete/0/power-curves.json?type=Ride&curves=42d,90d,1y,all",
      { headers, cache: "no-store" }
    ),
    fetch(
      "https://intervals.icu/api/v1/athlete/0/power-curves.json?type=Run&curves=42d,90d,1y,all",
      { headers, cache: "no-store" }
    ),
    fetch("https://intervals.icu/api/v1/athlete/0", {
      headers,
      cache: "no-store",
    }),
  ]);

  // Anche in caso d'errore si riporta solo lo status, mai il body grezzo
  // (potrebbe echeggiare parametri) né il token.
  const rideCurves = rideResponse.ok
    ? describeStructure(await rideResponse.json())
    : { _error: `HTTP ${rideResponse.status}` };
  const runCurves = runResponse.ok
    ? describeStructure(await runResponse.json())
    : { _error: `HTTP ${runResponse.status}` };
  const profile = profileResponse.ok
    ? describeStructure(await profileResponse.json())
    : { _error: `HTTP ${profileResponse.status}` };

  return NextResponse.json({
    power_curves_ride: rideCurves,
    power_curves_run: runCurves,
    athlete_profile: profile,
  });
}
