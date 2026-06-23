/**
 * Client API Intervals.icu — Milestone 2.
 *
 * Chiama SOLO gli endpoint verificati in docs/INTERVALS_API_NOTES.md
 * (regola ferma n. 6). Athlete ID "0" = atleta del token corrente.
 *
 * Regola sicurezza: in caso di errore si propaga solo lo status HTTP e il
 * path — mai il token, mai gli header, mai il body della risposta.
 */

import type { PowerCurvesResponse } from "@/lib/profile/power-profile";
import type { PaceCurvesResponse } from "@/lib/profile/pace-profile";
import type { IntervalsWorkoutEvent } from "@/lib/planner/intervals-workout-format";
import type { ActivityStream } from "@/lib/terrain/velocity-signature";

const INTERVALS_API_BASE = "https://intervals.icu/api/v1";

// Campi richiesti agli endpoint, come da schema OpenAPI ufficiale.
// `hrv` = rMSSD; `hrvSDNN` è una misura distinta e non va usata come
// sostituto silenzioso nei calcoli readiness.
const WELLNESS_FIELDS =
  "id,ctl,atl,rampRate,weight,restingHR,hrv,hrvSDNN,sleepSecs,soreness,fatigue,mood";
const ACTIVITY_FIELDS =
  "id,name,type,start_date_local,moving_time,distance,icu_training_load,icu_weighted_avg_watts,average_heartrate,perceived_exertion,sport_type,paired_event_id,compliance";

/** Errore API con il solo status: il chiamante decide come gestirlo (401 → riconnessione). */
export class IntervalsApiError extends Error {
  constructor(
    public readonly status: number,
    path: string
  ) {
    super(`Intervals API ${path}: HTTP ${status}`);
    this.name = "IntervalsApiError";
  }
}

/** Profilo atleta: tipato loose perché usiamo solo un sottoinsieme di campi. */
export type IntervalsProfileRaw = Record<string, unknown>;

/** Riga wellness come restituita dall'API (id = data YYYY-MM-DD). */
export interface IntervalsWellnessRaw {
  id: string;
  ctl?: number | null;
  atl?: number | null;
  rampRate?: number | null;
  weight?: number | null;
  restingHR?: number | null;
  hrv?: number | null;
  hrvSDNN?: number | null;
  sleepSecs?: number | null;
  soreness?: number | null;
  fatigue?: number | null;
  mood?: number | null;
}

/** Riga wellness normalizzata: HRV unificato, null espliciti. */
export interface WellnessDay {
  date: string;
  ctl: number | null;
  atl: number | null;
  rampRate: number | null;
  weight: number | null;
  restingHR: number | null;
  /** HRV rMSSD, campo `hrv` di Intervals.icu. */
  hrv: number | null;
  /** HRV SDNN, mantenuta separata perché non intercambiabile con rMSSD. */
  hrvSDNN: number | null;
  sleepSecs: number | null;
  soreness: number | null;
  fatigue: number | null;
  mood: number | null;
}

/** Allegato di un evento: il GPX si scarica dal campo `url` (GCS pubblico). */
export interface IntervalsEventAttachment {
  id: string;
  filename: string | null;
  mimetype: string | null;
  url: string | null;
}

/** Evento calendario (gara o workout). Tipato loose: usiamo solo un sottoinsieme. */
export interface IntervalsEvent {
  id: number | string;
  name: string | null;
  start_date_local: string | null;
  category: string | null;
  type: string | null;
  distance: number | null;
  attachments?: IntervalsEventAttachment[] | null;
  /** Presente sui WORKOUT creati da app OAuth; round-trip verificato (M8). */
  external_id?: string | null;
}

export interface IntervalsActivity {
  id: string | number;
  name: string | null;
  type: string | null;
  sport_type?: string | null;
  start_date_local: string;
  moving_time: number | null;
  distance: number | null;
  icu_training_load: number | null;
  icu_weighted_avg_watts: number | null;
  average_heartrate: number | null;
  perceived_exertion: number | null;
  paired_event_id?: number | null;
  compliance?: number | null;
}

/**
 * Normalizza i campi wellness e rende espliciti i null.
 * rMSSD e SDNN restano separati per non mescolare metriche HRV diverse.
 */
export function normalizeWellnessDay(raw: IntervalsWellnessRaw): WellnessDay {
  return {
    date: raw.id,
    ctl: raw.ctl ?? null,
    atl: raw.atl ?? null,
    rampRate: raw.rampRate ?? null,
    weight: raw.weight ?? null,
    restingHR: raw.restingHR ?? null,
    hrv: raw.hrv ?? null,
    hrvSDNN: raw.hrvSDNN ?? null,
    sleepSecs: raw.sleepSecs ?? null,
    soreness: raw.soreness ?? null,
    fatigue: raw.fatigue ?? null,
    mood: raw.mood ?? null,
  };
}

export class IntervalsFetcher {
  // Il token resta privato all'istanza e non viene mai serializzato/loggato.
  constructor(private readonly accessToken: string) {}

  private async get<T>(
    path: string,
    params?: Record<string, string>
  ): Promise<T> {
    const url = new URL(INTERVALS_API_BASE + path);
    for (const [key, value] of Object.entries(params ?? {})) {
      url.searchParams.set(key, value);
    }
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
      // I dati di allenamento cambiano di continuo: mai servire cache.
      cache: "no-store",
    });
    if (!response.ok) {
      // Solo status e path nell'errore: niente token, niente body.
      throw new IntervalsApiError(response.status, path);
    }
    return response.json() as Promise<T>;
  }

  private async post(path: string, body: unknown): Promise<void> {
    const response = await fetch(INTERVALS_API_BASE + path, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!response.ok) {
      throw new IntervalsApiError(response.status, path);
    }
  }

  /** DELETE: 404 = già assente (non è un errore per la riconciliazione). */
  private async del(path: string): Promise<boolean> {
    const response = await fetch(INTERVALS_API_BASE + path, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${this.accessToken}` },
      cache: "no-store",
    });
    if (response.status === 404) return false;
    if (!response.ok) {
      throw new IntervalsApiError(response.status, path);
    }
    return true;
  }

  /** GET /api/v1/athlete/0 — profilo (weight, resting_hr, zones, ftp). */
  getProfile(): Promise<IntervalsProfileRaw> {
    return this.get<IntervalsProfileRaw>("/athlete/0");
  }

  /** GET /api/v1/athlete/0/wellness — ctl/atl pre-calcolati da Intervals. */
  async getWellness(oldest: string, newest: string): Promise<WellnessDay[]> {
    const rows = await this.get<IntervalsWellnessRaw[]>(
      "/athlete/0/wellness",
      { oldest, newest, fields: WELLNESS_FIELDS }
    );
    return rows.map(normalizeWellnessDay);
  }

  /** GET /api/v1/athlete/0/activities — attività dal giorno `oldest`. */
  getActivities(oldest: string): Promise<IntervalsActivity[]> {
    return this.get<IntervalsActivity[]>("/athlete/0/activities", {
      oldest,
      fields: ACTIVITY_FIELDS,
    });
  }

  /**
   * GET /api/v1/activity/{id}/streams.json — stream a 1 Hz dell'attività.
   * PATH SINGOLARE senza athlete/0 (il plurale /athlete/0/activities/{id}/streams
   * dà 404 — verificato M7, docs/INTERVALS_API_NOTES.md). Risposta = array di
   * { type, name, data[], data2? }. Per la calibrazione si chiedono solo
   * altitude+velocity_smooth (no watts: non universale).
   */
  getActivityStreams(
    id: string,
    types = "altitude,velocity_smooth"
  ): Promise<ActivityStream[]> {
    return this.get<ActivityStream[]>(`/activity/${id}/streams.json`, { types });
  }

  /**
   * GET /api/v1/athlete/0/events — eventi calendario (gare). Verificato M5:
   * risposta = array; gli allegati GPX stanno in `attachments[].url` (GCS
   * pubblico, scaricabile senza auth). Vedi docs/INTERVALS_API_NOTES.md.
   */
  getEvents(
    oldest: string,
    newest: string,
    category?: string
  ): Promise<IntervalsEvent[]> {
    const params: Record<string, string> = { oldest, newest };
    if (category) params.category = category;
    return this.get<IntervalsEvent[]>("/athlete/0/events", params);
  }

  /**
   * POST bulk workout calendario, verificato nel Milestone 8.
   * `upsert=true` usa external_id e prevale su upsertOnUid, che resta come
   * identificatore compatibile. updatePlanApplied aggiorna il piano applicato.
   */
  pushWorkoutEvents(
    events: IntervalsWorkoutEvent[]
  ): Promise<void> {
    return this.post(
      "/athlete/0/events/bulk?upsert=true&upsertOnUid=true&updatePlanApplied=true",
      events
    );
  }

  /**
   * DELETE /api/v1/athlete/0/events/{id} — cancella un evento per id numerico
   * (verificato M8). Ritorna false se era già assente (404). Usato dalla
   * riconciliazione del push per rimuovere gli eventi orfani di una settimana
   * ridistribuita.
   */
  deleteEvent(eventId: number | string): Promise<boolean> {
    return this.del(`/athlete/0/events/${encodeURIComponent(String(eventId))}`);
  }

  /**
   * GET /api/v1/athlete/0/power-curves.json — MMP e powerModels (CP/W′)
   * per finestra (42d/90d/1y). Struttura verificata in Milestone 3 passo 1.
   */
  getPowerCurves(): Promise<PowerCurvesResponse> {
    return this.get<PowerCurvesResponse>("/athlete/0/power-curves.json", {
      type: "Ride",
      curves: "42d,90d,1y,all",
    });
  }

  /**
   * GET /api/v1/athlete/0/pace-curves.json — curva pace-durata (corsa).
   *
   * ENDPOINT DIVERSO da power-curves: per i runner power-curves?type=Run è
   * vuoto (verificato 2026-06-24). La risposta ha l'asse DISTANZA→TEMPO:
   * `distance[]` (metri) e `values[]` (secondi), con `paceModels[]` che
   * contengono CS/D′ già calcolati da Intervals (type "CS", campi
   * criticalSpeed m/s e dPrime m, con r2). pmType=CS è il default ma lo si
   * passa esplicito per chiarezza.
   */
  getPaceCurves(): Promise<PaceCurvesResponse> {
    return this.get<PaceCurvesResponse>("/athlete/0/pace-curves.json", {
      type: "Run",
      pmType: "CS",
      curves: "42d,90d,1y,all",
    });
  }
}
