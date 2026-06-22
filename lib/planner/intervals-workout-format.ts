import { createHash } from "node:crypto";

import type { BuiltSession } from "@/lib/planner/build-week";
import type { DayKey } from "@/lib/planner/session-selector";
import { getTemplate } from "@/lib/planner/workout-library";

/**
 * Prefisso degli external_id/uid creati da questa app. Serve a riconoscere i
 * "nostri" eventi sul calendario Intervals (per la riconciliazione/cancellazione
 * degli orfani) senza mai toccare eventi di altre origini.
 */
export const WORKOUT_UID_PREFIX = "curveload-";

export const FTP_ZONE_RANGES = {
  Z1: "50-60%",
  Z2: "60-75%",
  Z3: "88-94%",
  Z4: "95-105%",
  Z5: "106-120%",
} as const;

export type IntervalsRideType =
  | "Ride"
  | "VirtualRide"
  | "MountainBikeRide";

export interface IntervalsWorkoutEvent {
  uid: string;
  external_id: string;
  category: "WORKOUT";
  start_date_local: string;
  name: string;
  type: IntervalsRideType;
  moving_time: number;
  description: string;
}

const DAY_OFFSETS: Record<DayKey, number> = {
  mon: 0,
  tue: 1,
  wed: 2,
  thu: 3,
  fri: 4,
  sat: 5,
  sun: 6,
};

function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function zone(zone: keyof typeof FTP_ZONE_RANGES): string {
  return FTP_ZONE_RANGES[zone];
}

function repeated(
  count: number,
  work: string,
  workZone: keyof typeof FTP_ZONE_RANGES,
  recovery: string,
  recoveryZone: keyof typeof FTP_ZONE_RANGES = "Z1"
): string {
  return `${count}x\n- ${work} ${zone(workZone)}\n- ${recovery} ${zone(recoveryZone)}`;
}

function steadyBlock(durationMin: number, target: keyof typeof FTP_ZONE_RANGES): string {
  return `- ${Math.max(5, durationMin)}m ${zone(target)}`;
}

function mainSet(session: BuiltSession): string {
  const duration = session.estimated_duration_min ?? 60;

  switch (session.library_id) {
    case "AE-1":
    case "AE-2":
      return steadyBlock(duration - 20, "Z2");
    case "AE-3":
      return [
        steadyBlock(duration - 50, "Z2"),
        `- 30m ${zone("Z2")}`,
      ].join("\n");
    case "AE-4":
      return steadyBlock(duration - 10, "Z1");
    case "AE-5":
      return repeated(5, "5m", "Z2", "3m", "Z1");
    case "AE-6":
      return [
        steadyBlock(duration - 55, "Z2"),
        `- 35m ${zone("Z3")}`,
      ].join("\n");
    case "AE-7": {
      const step = Math.max(15, Math.floor((duration - 20) / 3));
      return [
        `- ${step}m ${zone("Z2")}`,
        `- ${step}m ${zone("Z2")}`,
        `- ${step}m ${zone("Z3")}`,
      ].join("\n");
    }
    case "SS-1":
      return repeated(3, "20m", "Z3", "5m", "Z1");
    case "SS-2":
      return [
        `- 12m ${zone("Z3")}`,
        `- 5m ${zone("Z1")}`,
        `- 15m ${zone("Z3")}`,
        `- 5m ${zone("Z1")}`,
        `- 20m ${zone("Z3")}`,
      ].join("\n");
    case "SS-3":
      return [
        "3x",
        `- 2m ${zone("Z4")}`,
        `- 1m ${zone("Z5")}`,
        `- 2m ${zone("Z4")}`,
        `- 1m ${zone("Z5")}`,
        `- 2m ${zone("Z4")}`,
        `- 1m ${zone("Z5")}`,
        `- 5m ${zone("Z1")}`,
      ].join("\n");
    case "SS-4":
      return repeated(2, "25m", "Z3", "5m", "Z1");
    case "SS-5":
      return repeated(4, "10m", "Z3", "5m", "Z1");
    case "TH-1":
      return repeated(2, "20m", "Z4", "6m", "Z1");
    case "TH-2":
      return repeated(4, "8m", "Z4", "2m", "Z1");
    case "VO2-1":
      return repeated(5, "4m", "Z5", "4m", "Z1");
    case "VO2-2":
      return [
        "10x",
        `- 30s ${zone("Z5")}`,
        `- 15s ${zone("Z1")}`,
        `- 5m ${zone("Z1")}`,
        "10x",
        `- 30s ${zone("Z5")}`,
        `- 15s ${zone("Z1")}`,
        `- 5m ${zone("Z1")}`,
        "10x",
        `- 30s ${zone("Z5")}`,
        `- 15s ${zone("Z1")}`,
      ].join("\n");
    case "VO2-3":
      return [
        `- 3m ${zone("Z5")}`,
        `- 3m ${zone("Z1")}`,
        `- 3m ${zone("Z5")}`,
        `- 2m30s ${zone("Z1")}`,
        `- 3m ${zone("Z5")}`,
        `- 2m ${zone("Z1")}`,
        `- 3m ${zone("Z5")}`,
        `- 1m30s ${zone("Z1")}`,
        `- 3m ${zone("Z5")}`,
      ].join("\n");
    case "VO2-4":
      return [
        `- 2m ${zone("Z5")}`,
        `- 3m ${zone("Z1")}`,
        `- 3m ${zone("Z5")}`,
        `- 3m ${zone("Z1")}`,
        `- 4m ${zone("Z5")}`,
        `- 3m ${zone("Z1")}`,
        `- 3m ${zone("Z5")}`,
        `- 3m ${zone("Z1")}`,
        `- 2m ${zone("Z5")}`,
      ].join("\n");
    case "VO2-5":
      return [
        "13x",
        `- 30s ${zone("Z5")}`,
        `- 15s ${zone("Z1")}`,
        `- 5m ${zone("Z1")}`,
        "13x",
        `- 30s ${zone("Z5")}`,
        `- 15s ${zone("Z1")}`,
        `- 5m ${zone("Z1")}`,
        "13x",
        `- 30s ${zone("Z5")}`,
        `- 15s ${zone("Z1")}`,
      ].join("\n");
    case "AN-1":
      return repeated(10, "30s", "Z5", "3m", "Z1");
    case "AN-2":
      return repeated(5, "15s", "Z5", "5m", "Z1");
    case "AN-3":
      return [
        "5x",
        `- 10s ${zone("Z5")}`,
        `- 3m ${zone("Z1")}`,
        `- 5m ${zone("Z1")}`,
        "5x",
        `- 10s ${zone("Z5")}`,
        `- 3m ${zone("Z1")}`,
        `- 5m ${zone("Z1")}`,
        "5x",
        `- 10s ${zone("Z5")}`,
        `- 3m ${zone("Z1")}`,
      ].join("\n");
    case "MIX-1":
      return repeated(7, "3m", "Z5", "12m", "Z2");
    case "MIX-2":
      return [
        `- 15m ${zone("Z2")}`,
        repeated(3, "1m", "Z5", "4m", "Z2"),
        repeated(2, "30s", "Z5", "4m", "Z2"),
      ].join("\n");
    case "SE-1":
      return repeated(5, "8m", "Z3", "4m", "Z1");
    case "SE-2":
      return repeated(3, "12m", "Z3", "6m", "Z1");
    default:
      return steadyBlock(duration - 20, "Z2");
  }
}

/**
 * Converte una seduta del planner nella sintassi workout testuale di
 * Intervals.icu. La funzione non legge DB, ambiente o rete.
 */
export function toIntervalsDescription(session: BuiltSession): string {
  const frameworks =
    session.frameworks_cited.length > 0
      ? session.frameworks_cited.join(", ")
      : "Section 11";
  const warmup = session.library_id === "AE-4" ? "5m" : "10m";
  const cooldown = session.library_id === "AE-4" ? "5m" : "10m";

  return [
    `Nota coach: ${session.coach_notes}`,
    `Framework: ${frameworks}`,
    "",
    "Warm-up",
    `- ${warmup} ${zone("Z1")}`,
    "",
    "Main set",
    mainSet(session),
    "",
    "Cool-down",
    `- ${cooldown} ${zone("Z1")}`,
  ].join("\n");
}

function eventType(sport: string): IntervalsRideType {
  const normalized = sport.toLowerCase();
  if (normalized.includes("indoor") || normalized.includes("virtual")) {
    return "VirtualRide";
  }
  if (normalized.includes("mtb") || normalized.includes("mountain")) {
    return "MountainBikeRide";
  }
  return "Ride";
}

/** Hash stabile: stesso utente, data e workout library producono lo stesso uid. */
export function stableWorkoutUid(
  userId: string,
  date: string,
  libraryId: string
): string {
  const digest = createHash("sha256")
    .update(`${userId}\n${date}\n${libraryId}`)
    .digest("hex")
    .slice(0, 32);
  const uid = `${WORKOUT_UID_PREFIX}${digest}`;
  if (process.env.NODE_ENV !== "production") {
    console.log("UID generato:", uid, "per", {
      userId,
      date,
      library_id: libraryId,
    });
  }
  return uid;
}

export function sessionToEvent(
  session: BuiltSession,
  userId: string,
  weekStart: string
): IntervalsWorkoutEvent {
  if (session.rest || !session.library_id) {
    throw new Error("Una sessione di riposo non può diventare un evento");
  }

  const date =
    session.date || addDays(weekStart, DAY_OFFSETS[session.day as DayKey]);
  const template = getTemplate(session.library_id);
  const durationMin =
    session.validation_metadata?.adapted_duration_min ??
    session.estimated_duration_min;

  if (durationMin == null || durationMin <= 0) {
    throw new Error(`Durata non valida per ${session.library_id}`);
  }

  const uid = stableWorkoutUid(userId, date, session.library_id);

  return {
    uid,
    external_id: uid,
    category: "WORKOUT",
    start_date_local: `${date}T00:00:00`,
    name: template?.title ?? session.title,
    type: eventType(session.sport),
    moving_time: Math.round(durationMin * 60),
    description: toIntervalsDescription(session),
  };
}
