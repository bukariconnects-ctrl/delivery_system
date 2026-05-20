import { SupabaseClient } from "@supabase/supabase-js";

// ============================================
// Failure Model: Masking Failures via Retries
// Handles Omission Failures and Independent Failures
// (Lecture 3, Slide 7, 30, 32)
// ============================================

/** Configuration for the retry mechanism */
export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries: number;
  /** Base delay between retries in ms (default: 1000) */
  baseDelay: number;
  /** Whether to use exponential backoff (default: true) */
  exponentialBackoff: boolean;
  /** Maximum delay cap in ms (default: 10000) */
  maxDelay: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  exponentialBackoff: true,
  maxDelay: 10000,
};

/** Result of a resilient operation */
export interface ResilientResult<T> {
  data: T | null;
  error: string | null;
  attempts: number;
  totalLatency: number;
  wasRetried: boolean;
}

/**
 * Executes a Supabase operation with automatic retry on failure.
 * Implements "Masking Failures" pattern from Lecture 3.
 * Uses exponential backoff to avoid overwhelming the server.
 */
export async function withRetry<T>(
  operation: () => Promise<{ data: T | null; error: { message: string } | null }>,
  config: Partial<RetryConfig> = {}
): Promise<ResilientResult<T>> {
  const { maxRetries, baseDelay, exponentialBackoff, maxDelay } = {
    ...DEFAULT_RETRY_CONFIG,
    ...config,
  };

  let attempts = 0;
  let lastError: string | null = null;
  const startTime = Date.now();

  while (attempts <= maxRetries) {
    attempts++;

    try {
      const { data, error } = await operation();

      if (!error) {
        return {
          data,
          error: null,
          attempts,
          totalLatency: Date.now() - startTime,
          wasRetried: attempts > 1,
        };
      }

      lastError = error.message;

      // Don't retry on auth errors (not transient)
      if (
        lastError.includes("JWT") ||
        lastError.includes("auth") ||
        lastError.includes("permission")
      ) {
        break;
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : "Network error";
    }

    // If we haven't exhausted retries, wait before next attempt
    if (attempts <= maxRetries) {
      const delay = exponentialBackoff
        ? Math.min(baseDelay * Math.pow(2, attempts - 1), maxDelay)
        : baseDelay;

      await sleep(delay);
    }
  }

  return {
    data: null,
    error: lastError ?? "Max retries exceeded",
    attempts,
    totalLatency: Date.now() - startTime,
    wasRetried: attempts > 1,
  };
}

/**
 * Wraps a Supabase query with resilient retry logic.
 * Convenience wrapper for common Supabase operations.
 */
export async function resilientQuery<T>(
  supabase: SupabaseClient,
  queryFn: (client: SupabaseClient) => Promise<{ data: T | null; error: { message: string } | null }>,
  config?: Partial<RetryConfig>
): Promise<ResilientResult<T>> {
  return withRetry(() => queryFn(supabase), config);
}

// ============================================
// Failure Detection: Process Omission (Crash)
// Detects when a driver node has crashed or lost connection
// by checking the freshness of their heartbeat.
// ============================================

/** Threshold in ms after which a driver is considered offline */
const DRIVER_OFFLINE_THRESHOLD_MS = 30_000; // 30 seconds

/** Driver health status based on last_seen */
export type DriverHealthStatus = "online" | "degraded" | "offline";

/**
 * Determines the health status of a driver based on their last_seen timestamp.
 * Implements Failure Detection for Process Omission (Lecture 3, Slide 32).
 *
 * - online: last_seen < 15s ago
 * - degraded: last_seen between 15s and 30s
 * - offline: last_seen > 30s (considered crashed)
 */
export function detectDriverHealth(lastSeenTimestamp: string | Date): DriverHealthStatus {
  const lastSeen =
    typeof lastSeenTimestamp === "string"
      ? new Date(lastSeenTimestamp)
      : lastSeenTimestamp;

  const ageMs = Date.now() - lastSeen.getTime();

  if (ageMs < DRIVER_OFFLINE_THRESHOLD_MS / 2) {
    return "online";
  } else if (ageMs < DRIVER_OFFLINE_THRESHOLD_MS) {
    return "degraded";
  } else {
    return "offline";
  }
}

/**
 * Marks offline drivers in the database.
 * Scans driver_locations for entries where updated_at > 30s
 * and sets is_online = false.
 * This is the "Failure Recovery" step for Process Omission.
 */
export async function markOfflineDrivers(
  supabase: SupabaseClient
): Promise<{ markedOffline: number; error: string | null }> {
  const threshold = new Date(Date.now() - DRIVER_OFFLINE_THRESHOLD_MS).toISOString();

  const { data, error } = await supabase
    .from("driver_locations")
    .update({ is_online: false })
    .eq("is_online", true)
    .lt("updated_at", threshold)
    .select("driver_id");

  if (error) {
    return { markedOffline: 0, error: error.message };
  }

  return { markedOffline: data?.length ?? 0, error: null };
}

/** Simple sleep utility */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
