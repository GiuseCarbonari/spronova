/**
 * Probe di riconciliazione — SOLO SVILUPPO.
 *
 * Verifica congiunta (regola ferma n.6) per il fix "settimana cambiata → eventi
 * orfani su Intervals". Per cancellare gli orfani serve l'id NUMERICO dell'evento,
 * ma in DB salviamo solo l'external_id (il nostro hash). Questo probe risponde a
 * due domande in un solo run auto-pulente, usando la STESSA chiamata bulk della
 * produzione (upsert=true&upsertOnUid=true&updatePlanApplied=true):
 *
 *   (b) il BODY di risposta del bulk POST contiene l'id numerico degli eventi?
 *   (a) il GET /events?category=WORKOUT espone external_id e fa round-trip col
 *       valore che abbiamo inviato?
 *
 * Qualunque sia l'esito, la pulizia cancella per id sia gli eventi trovati dal
 * GET (match per prefisso nome) sia quelli con id presente nel body del POST.
 */

const INTERVALS_API_BASE = "https://intervals.icu/api/v1";

/** Identica alla produzione: lib/intervals-client.ts pushWorkoutEvents. */
const BULK_PATH =
  "/athlete/0/events/bulk?upsert=true&upsertOnUid=true&updatePlanApplied=true";

/** Prefisso nome riconoscibile, per il match nel GET e la pulizia. */
const PROBE_NAME_PREFIX = "RECONCILE PROBE";

const MAX_RAW_CHARS = 600;

interface ProbeWorkout {
  uid: string;
  external_id: string;
  category: "WORKOUT";
  start_date_local: string;
  name: string;
  type: "Ride";
  moving_time: number;
  description: string;
}

interface RawEvent {
  id?: number | string;
  uid?: string | null;
  external_id?: string | null;
  name?: string | null;
  start_date_local?: string | null;
}

interface ReturnedEvent {
  keys: string[];
  id: number | string | null;
  uid: string | null;
  external_id: string | null;
}

interface CleanupResult {
  deleted_ids: Array<number | string>;
  failed_ids: Array<number | string>;
}

export interface ReconcileProbeResult {
  date: string;
  sent: Array<{ external_id: string; name: string }>;
  bulk_post: {
    path: string;
    http_status: number;
    body_is_array: boolean;
    returned_count: number | null;
    returned_events: ReturnedEvent[];
    raw_body_first_600_chars: string;
  };
  get_workouts: {
    found_count: number;
    events: ReturnedEvent[];
  };
  /** Risposta diretta alle due domande del probe. */
  conclusions: {
    bulk_returns_numeric_id: boolean;
    get_exposes_external_id: boolean;
    external_id_roundtrips: boolean;
    recommended_lookup: "bulk_response" | "get_events" | "none";
  };
  cleanup: CleanupResult;
  error?: string;
}

/** Domani in Europe/Rome (YYYY-MM-DD): non tocca giorni con sedute reali odierne. */
function tomorrowInRome(): string {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(tomorrow);
}

/** Un solo bulk POST con l'INTERO array (come la produzione). Ritorna status+body grezzo. */
async function bulkPost(
  accessToken: string,
  events: ProbeWorkout[]
): Promise<{ status: number; bodyText: string }> {
  const response = await fetch(`${INTERVALS_API_BASE}${BULK_PATH}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(events),
    cache: "no-store",
  });
  return { status: response.status, bodyText: await response.text() };
}

async function getWorkouts(
  accessToken: string,
  date: string
): Promise<RawEvent[]> {
  const url = new URL(`${INTERVALS_API_BASE}/athlete/0/events`);
  url.searchParams.set("oldest", date);
  url.searchParams.set("newest", date);
  url.searchParams.set("category", "WORKOUT");
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`GET events: HTTP ${response.status}`);
  }
  const body = (await response.json()) as unknown;
  return Array.isArray(body) ? (body as RawEvent[]) : [];
}

async function deleteById(
  accessToken: string,
  id: number | string
): Promise<boolean> {
  const response = await fetch(
    `${INTERVALS_API_BASE}/athlete/0/events/${encodeURIComponent(String(id))}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    }
  );
  return response.ok;
}

function toReturned(event: RawEvent): ReturnedEvent {
  return {
    keys: Object.keys(event ?? {}),
    id: event.id ?? null,
    uid: event.uid ?? null,
    external_id: event.external_id ?? null,
  };
}

/**
 * Crea due eventi WORKOUT con il nostro schema external_id, cattura la risposta
 * del bulk, li rilegge col GET e poi cancella tutto per id.
 */
export async function runReconcileProbe(
  accessToken: string
): Promise<ReconcileProbeResult> {
  const date = tomorrowInRome();
  const events: ProbeWorkout[] = [
    {
      uid: "curveload-reconcile-A",
      external_id: "curveload-reconcile-A",
      category: "WORKOUT",
      start_date_local: `${date}T11:00:00`,
      name: `${PROBE_NAME_PREFIX} A`,
      type: "Ride",
      moving_time: 600,
      description: "- 10m 50-60%",
    },
    {
      uid: "curveload-reconcile-B",
      external_id: "curveload-reconcile-B",
      category: "WORKOUT",
      start_date_local: `${date}T12:00:00`,
      name: `${PROBE_NAME_PREFIX} B`,
      type: "Ride",
      moving_time: 600,
      description: "- 10m 50-60%",
    },
  ];

  let error: string | undefined;

  // 1) Bulk POST (verifica b): cattura il body grezzo.
  let bulkStatus = 0;
  let bulkBodyText = "";
  try {
    const result = await bulkPost(accessToken, events);
    bulkStatus = result.status;
    bulkBodyText = result.bodyText;
  } catch (e) {
    error = e instanceof Error ? e.message : "Bulk POST fallito";
  }

  let bulkParsed: unknown = null;
  try {
    bulkParsed = JSON.parse(bulkBodyText);
  } catch {
    /* body non-JSON: lo mostriamo grezzo */
  }
  const bulkArray = Array.isArray(bulkParsed)
    ? (bulkParsed as RawEvent[])
    : [];
  const bulkReturned = bulkArray.map(toReturned);

  // 2) GET WORKOUT (verifica a): rileggi gli eventi del giorno per prefisso nome.
  let getEvents: RawEvent[] = [];
  try {
    const all = await getWorkouts(accessToken, date);
    getEvents = all.filter(
      (e) => typeof e.name === "string" && e.name.startsWith(PROBE_NAME_PREFIX)
    );
  } catch (e) {
    const readError = e instanceof Error ? e.message : "GET fallito";
    error = error ? `${error}; ${readError}` : readError;
  }

  // 3) Conclusioni.
  const sentExternalIds = events.map((e) => e.external_id);
  const getExternalIds = new Set(
    getEvents.map((e) => e.external_id).filter((v): v is string => v != null)
  );
  const bulk_returns_numeric_id = bulkReturned.some(
    (e) => typeof e.id === "number"
  );
  const get_exposes_external_id = getEvents.some((e) => e.external_id != null);
  const external_id_roundtrips =
    sentExternalIds.length > 0 &&
    sentExternalIds.every((id) => getExternalIds.has(id));

  const recommended_lookup: "bulk_response" | "get_events" | "none" =
    bulk_returns_numeric_id
      ? "bulk_response"
      : get_exposes_external_id && external_id_roundtrips
        ? "get_events"
        : "none";

  // 4) Pulizia: id dal GET (match nome) + eventuali id dal body del POST.
  const idSet = new Set<number | string>();
  for (const e of getEvents) if (e.id != null) idSet.add(e.id);
  for (const e of bulkArray) if (e.id != null) idSet.add(e.id);

  const deletedIds: Array<number | string> = [];
  const failedIds: Array<number | string> = [];
  for (const id of Array.from(idSet)) {
    try {
      if (await deleteById(accessToken, id)) deletedIds.push(id);
      else failedIds.push(id);
    } catch {
      failedIds.push(id);
    }
  }

  return {
    date,
    sent: events.map((e) => ({ external_id: e.external_id, name: e.name })),
    bulk_post: {
      path: BULK_PATH,
      http_status: bulkStatus,
      body_is_array: Array.isArray(bulkParsed),
      returned_count: Array.isArray(bulkParsed) ? bulkArray.length : null,
      returned_events: bulkReturned,
      raw_body_first_600_chars: bulkBodyText.slice(0, MAX_RAW_CHARS),
    },
    get_workouts: {
      found_count: getEvents.length,
      events: getEvents.map(toReturned),
    },
    conclusions: {
      bulk_returns_numeric_id,
      get_exposes_external_id,
      external_id_roundtrips,
      recommended_lookup,
    },
    cleanup: { deleted_ids: deletedIds, failed_ids: failedIds },
    ...(error ? { error } : {}),
  };
}
