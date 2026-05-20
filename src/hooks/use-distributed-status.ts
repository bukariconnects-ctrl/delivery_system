"use client";

import { useState, useCallback, useRef } from "react";

// ============================================
// Interaction Model: Asynchronous Interaction
// Handles UI states for distributed operations
// Addresses Latency and Jitter (Lecture 3, Slide 27)
// ============================================

/** States of a distributed async operation */
export type DistributedStatus =
  | "idle"
  | "loading"
  | "success"
  | "timeout"
  | "error";

interface DistributedStatusState<T> {
  status: DistributedStatus;
  data: T | null;
  error: string | null;
  latency: number | null; // ms taken for the operation
  attempts: number;
}

interface UseDistributedStatusOptions {
  /** Timeout in ms before marking the operation as timed out (default: 10000) */
  timeoutMs?: number;
  /** Callback when timeout occurs */
  onTimeout?: () => void;
  /** Callback on error */
  onError?: (error: string) => void;
}

/**
 * Hook for managing distributed asynchronous operations.
 * Tracks loading state, latency, timeouts, and retry attempts.
 * Models the Asynchronous Interaction pattern from Lecture 3.
 */
export function useDistributedStatus<T = unknown>(
  options: UseDistributedStatusOptions = {}
) {
  const { timeoutMs = 10000, onTimeout, onError } = options;

  const [state, setState] = useState<DistributedStatusState<T>>({
    status: "idle",
    data: null,
    error: null,
    latency: null,
    attempts: 0,
  });

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Execute a distributed operation with timeout and latency tracking.
   */
  const execute = useCallback(
    async (operation: () => Promise<T>): Promise<T | null> => {
      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      const startTime = Date.now();

      setState((prev) => ({
        ...prev,
        status: "loading",
        error: null,
        attempts: prev.attempts + 1,
      }));

      // Set timeout timer
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutRef.current = setTimeout(() => {
          reject(new Error("DISTRIBUTED_TIMEOUT"));
        }, timeoutMs);
      });

      try {
        // Race between the operation and the timeout
        const result = await Promise.race([operation(), timeoutPromise]);
        const latency = Date.now() - startTime;

        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }

        setState({
          status: "success",
          data: result,
          error: null,
          latency,
          attempts: state.attempts + 1,
        });

        return result;
      } catch (err) {
        const latency = Date.now() - startTime;

        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }

        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        const isTimeout = errorMessage === "DISTRIBUTED_TIMEOUT";

        setState({
          status: isTimeout ? "timeout" : "error",
          data: null,
          error: errorMessage,
          latency,
          attempts: state.attempts + 1,
        });

        if (isTimeout) {
          onTimeout?.();
        } else {
          onError?.(errorMessage);
        }

        return null;
      }
    },
    [timeoutMs, onTimeout, onError, state.attempts]
  );

  const reset = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setState({
      status: "idle",
      data: null,
      error: null,
      latency: null,
      attempts: 0,
    });
  }, []);

  return {
    ...state,
    execute,
    reset,
    isLoading: state.status === "loading",
    isSuccess: state.status === "success",
    isError: state.status === "error" || state.status === "timeout",
  };
}
