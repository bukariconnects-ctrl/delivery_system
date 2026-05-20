import { SupabaseClient } from "@supabase/supabase-js";

// ============================================
// Interaction Model: Database Server Time
// Solves "Lack of Global Clock" (Lecture 3, Slide 6, 26)
// Uses the Database Server as the Single Source of Truth
// to avoid Clock Drift between distributed nodes.
// ============================================

/** Result of a server time fetch */
export interface ServerTimeResult {
  serverTime: Date;
  localTime: Date;
  clockDrift: number; // ms difference between local and server
  latency: number; // round-trip time in ms
}

/**
 * Fetches the current database server time.
 * This is the authoritative timestamp for all distributed operations.
 * Avoids reliance on client-side clocks which may drift.
 */
export async function getServerTime(
  supabase: SupabaseClient
): Promise<ServerTimeResult> {
  const localBefore = Date.now();

  const { data, error } = await supabase.rpc("get_server_time");

  const localAfter = Date.now();
  const latency = localAfter - localBefore;
  const localTime = new Date();

  if (error || !data) {
    // Fallback to local time if server is unreachable (Omission Failure)
    return {
      serverTime: localTime,
      localTime,
      clockDrift: 0,
      latency: -1, // indicates failure
    };
  }

  const serverTime = new Date(data);
  const clockDrift = serverTime.getTime() - localTime.getTime() + latency / 2;

  return { serverTime, localTime, clockDrift, latency };
}

/**
 * Converts a local timestamp to an estimated server timestamp
 * using a previously measured clock drift.
 */
export function toServerTime(localDate: Date, clockDrift: number): Date {
  return new Date(localDate.getTime() + clockDrift);
}

/**
 * Checks if a timestamp is stale (older than maxAge ms).
 * Used for Failure Detection — detecting Process Omission.
 */
export function isTimestampStale(
  timestamp: string | Date,
  maxAgeMs: number
): boolean {
  const ts = typeof timestamp === "string" ? new Date(timestamp) : timestamp;
  return Date.now() - ts.getTime() > maxAgeMs;
}

/**
 * Calculates the age of a timestamp in seconds.
 */
export function timestampAge(timestamp: string | Date): number {
  const ts = typeof timestamp === "string" ? new Date(timestamp) : timestamp;
  return Math.floor((Date.now() - ts.getTime()) / 1000);
}
