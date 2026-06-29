import { NextResponse } from "next/server";

import { decryptToken } from "@/lib/crypto";
import {
  IntervalsApiError,
  IntervalsFetcher,
} from "@/lib/intervals-client";
import type { BuiltSession } from "@/lib/planner/build-week";
import {
  sessionToEvent,
  type IntervalsWorkoutEvent,
} from "@/lib/planner/intervals-workout-format";
import { selectOrphanEvents } from "@/lib/planner/reconcile";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface WeeklyPlanRow {
  id: string;
  week_start: string;
  sessions: BuiltSession[];
  pushed_at: string | null;
}

interface PushError {
  uid: string;
  name: string;
  message: string;
  status?: number;
}

function hasCalendarWriteScope(grantedScopes: string): boolean {
  return grantedScopes
    .split(/[\s,]+/)
    .some((scope) => scope.trim().toUpperCase() === "CALENDAR:WRITE");
}

function eventsFromPlan(
  plan: WeeklyPlanRow,
  userId: string
): IntervalsWorkoutEvent[] {
  return plan.sessions
    .filter((session) => !session.rest && session.library_id != null)
    .map((session) => sessionToEvent(session, userId, plan.week_start));
}

/** Aggiunge giorni a una data ISO (YYYY-MM-DD), in UTC, senza dipendenze. */
function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}

interface ReconcileResult {
  deleted: Array<number | string>;
  failed: Array<number | string>;
  error?: string;
}

/**
 * Rimuove gli eventi orfani: i NOSTRI workout (external_id con prefisso
 * `curveload-`) presenti sul calendario nella settimana del piano ma non più
 * nel set appena inviato — è il caso della settimana ridistribuita, dove una
 * seduta cambia giorno o tipo e l'upsert (per external_id) crea il nuovo
 * evento lasciando orfano il vecchio. Il filtro sul prefisso garantisce che
 * non venga MAI cancellato un evento non creato da questa app.
 *
 * Best-effort: ogni errore è catturato e riportato, ma non fa fallire il push
 * già completato (il piano nuovo è comunque scritto).
 */
async function deleteOrphans(
  fetcher: IntervalsFetcher,
  weekStart: string,
  keepExternalIds: Set<string>
): Promise<ReconcileResult> {
  const deleted: Array<number | string> = [];
  const failed: Array<number | string> = [];
  try {
    const onCalendar = await fetcher.getEvents(
      weekStart,
      addDays(weekStart, 6),
      "WORKOUT"
    );
    const orphans = selectOrphanEvents(onCalendar, keepExternalIds);
    for (const orphan of orphans) {
      try {
        await fetcher.deleteEvent(orphan.id);
        deleted.push(orphan.id);
      } catch {
        failed.push(orphan.id);
      }
    }
    return { deleted, failed };
  } catch (error) {
    return {
      deleted,
      failed,
      error: error instanceof Error ? error.message : "reconcile_failed",
    };
  }
}

async function readConfirmation(request: Request): Promise<boolean> {
  try {
    const body = (await request.json()) as { confirmed?: unknown };
    return body.confirmed === true;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const mode = new URL(request.url).searchParams.get("mode") ?? "preview";
  if (mode !== "preview" && mode !== "commit") {
    return NextResponse.json(
      { success: false, error: "invalid_mode", message: "Modalità push non valida" },
      { status: 400 }
    );
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { success: false, error: "unauthorized", message: "Non autenticato" },
      { status: 401 }
    );
  }

  const { data: planRow, error: planError } = await supabase
    .from("weekly_plans")
    .select("id, week_start, sessions, pushed_at")
    .eq("user_id", user.id)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (planError) {
    console.error("Lettura weekly_plan per push fallita:", planError.message);
    return NextResponse.json(
      { success: false, error: "plan_read_failed", message: "Lettura del piano fallita" },
      { status: 500 }
    );
  }
  if (!planRow) {
    return NextResponse.json(
      { success: false, error: "no_plan", message: "Nessun piano settimanale da inviare" },
      { status: 404 }
    );
  }

  const plan = planRow as WeeklyPlanRow;
  let events: IntervalsWorkoutEvent[];
  try {
    events = eventsFromPlan(plan, user.id);
  } catch (error) {
    console.error(
      "Formattazione eventi fallita:",
      error instanceof Error ? error.message : "errore sconosciuto"
    );
    return NextResponse.json(
      {
        success: false,
        error: "event_format_failed",
        message: "Una o più sessioni non possono essere convertite",
      },
      { status: 422 }
    );
  }

  if (events.length === 0) {
    return NextResponse.json(
      { success: false, error: "no_sessions", message: "Il piano non contiene sessioni" },
      { status: 409 }
    );
  }

  // Preview: costruisce l'array esatto, ma non legge il token e non chiama Intervals.
  if (mode === "preview") {
    return NextResponse.json({
      success: true,
      mode: "preview",
      week_start: plan.week_start,
      pushed_at: plan.pushed_at,
      events,
    });
  }

  // Il commit richiede un segnale esplicito emesso solo dal bottone del modale.
  if (!(await readConfirmation(request))) {
    return NextResponse.json(
      {
        success: false,
        error: "confirmation_required",
        message: "Conferma esplicita richiesta prima dell'invio",
      },
      { status: 400 }
    );
  }

  const { data: connection, error: connectionError } = await supabase
    .from("intervals_connections")
    .select("access_token_encrypted, granted_scopes")
    .eq("user_id", user.id)
    .maybeSingle();

  if (connectionError || !connection) {
    return NextResponse.json(
      {
        success: false,
        error: "not_connected",
        message: "Collegamento a Intervals.icu non disponibile",
        reconnect_required: true,
      },
      { status: 409 }
    );
  }

  if (!hasCalendarWriteScope(connection.granted_scopes ?? "")) {
    return NextResponse.json(
      {
        success: false,
        error: "missing_scope",
        message:
          "Devi riautorizzare l'app per abilitare la scrittura sul calendario",
        reconnect_required: true,
      },
      { status: 403 }
    );
  }

  let accessToken: string;
  try {
    accessToken = decryptToken(connection.access_token_encrypted);
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "token_invalid",
        message: "Connessione non valida: riconnetti Intervals.icu",
        reconnect_required: true,
      },
      { status: 409 }
    );
  }

  const admin = createAdminClient();
  const fetcher = new IntervalsFetcher(accessToken);
  try {
    await fetcher.pushWorkoutEvents(events);
  } catch (error) {
    const status = error instanceof IntervalsApiError ? error.status : undefined;
    const pushErrors: PushError[] = events.map((event) => ({
      uid: event.uid,
      name: event.name,
      message:
        status != null
          ? `Intervals.icu ha risposto HTTP ${status}`
          : "Invio a Intervals.icu non riuscito",
      ...(status != null ? { status } : {}),
    }));

    await admin
      .from("weekly_plans")
      .update({ last_push_status: "failed" })
      .eq("id", plan.id)
      .eq("user_id", user.id);
    await admin.from("audit_logs").insert({
      user_id: user.id,
      action: "planner.push",
      source: "planner",
      payload: {
        week_start: plan.week_start,
        status: "failed",
        events,
        push_errors: pushErrors,
      },
    });

    return NextResponse.json(
      {
        success: false,
        error: "intervals_push_failed",
        message: "Invio a Intervals.icu non completato",
        push_errors: pushErrors,
      },
      { status: 502 }
    );
  }

  // Riconciliazione: dopo l'upsert, rimuove i nostri eventi non più nel piano
  // (settimana ridistribuita). Best-effort, non fa fallire il push riuscito.
  const keepExternalIds = new Set(events.map((event) => event.external_id));
  const reconcile = await deleteOrphans(fetcher, plan.week_start, keepExternalIds);

  const pushedAt = new Date().toISOString();
  const eventUids = events.map((event) => event.uid);
  const { error: updateError } = await admin
    .from("weekly_plans")
    .update({
      pushed_at: pushedAt,
      pushed_snapshot: plan.sessions, // snapshot per il diff "cosa è cambiato"
      intervals_event_uids: eventUids,
      last_push_status: "success",
    })
    .eq("id", plan.id)
    .eq("user_id", user.id);

  await admin.from("audit_logs").insert({
    user_id: user.id,
    action: "planner.push",
    source: "planner",
    payload: {
      week_start: plan.week_start,
      status: updateError ? "pushed_metadata_failed" : "success",
      pushed_at: pushedAt,
      reconcile,
      events,
    },
  });

  if (updateError) {
    console.error("Persistenza metadati push fallita:", updateError.message);
    return NextResponse.json(
      {
        success: false,
        error: "push_metadata_failed",
        message:
          "Eventi inviati, ma lo stato locale non è stato aggiornato. Non ripetere subito l'invio.",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    mode: "commit",
    pushed_at: pushedAt,
    intervals_event_uids: eventUids,
    reconciled: reconcile,
    events,
  });
}
