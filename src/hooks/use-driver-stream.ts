"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSupabase } from "@/lib/supabase/provider";
import {
  getRealtimeService,
  type SequencedMessage,
} from "@/lib/supabase/realtime-service";
import type { GeoLocation } from "@/types";

// ============================================
// IPC Pattern: Stream Communication
// (Lecture 4, Slide 18-20)
//
// A "stream" is a unidirectional sequence of data items.
// - The Driver process WRITES to the stream (location updates).
// - The Client / Restaurant process READS from the stream.
//
// Implemented via Supabase Realtime Broadcast on a
// per-driver channel, so each driver has its own stream.
// ============================================

/** A single location frame in the stream */
export interface LocationFrame extends GeoLocation {
  driverId: string;
  speed?: number; // km/h (optional)
  heading?: number; // degrees (optional)
  accuracy?: number; // meters
  timestamp: string;
}

// ---- Writer side (Driver) ----

interface UseDriverStreamWriterOptions {
  /** Interval in ms between GPS broadcasts (default 3000) */
  intervalMs?: number;
  /** Whether to start broadcasting automatically */
  autoStart?: boolean;
}

/**
 * Hook for the **Driver** node to WRITE to the location stream.
 *
 * It reads the browser Geolocation API and broadcasts the
 * position to the driver's personal channel at a fixed interval.
 */
export function useDriverStreamWriter(
  opts: UseDriverStreamWriterOptions = {}
) {
  const { intervalMs = 3000, autoStart = false } = opts;
  const { supabase, session } = useSupabase();
  const serviceRef = useRef(getRealtimeService(supabase));

  const [broadcasting, setBroadcasting] = useState(false);
  const [lastFrame, setLastFrame] = useState<LocationFrame | null>(null);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const latestPos = useRef<GeolocationPosition | null>(null);

  const driverId = session?.user?.id;
  const channelName = driverId ? `driver-stream:${driverId}` : null;

  // Start watching GPS
  const startBroadcast = useCallback(() => {
    if (!channelName || !driverId) return;
    if (broadcasting) return;

    if (!navigator.geolocation) {
      setError("Geolocation API not available");
      return;
    }

    // Watch position continuously
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        latestPos.current = pos;
        setError(null);
      },
      (err) => setError(err.message),
      { enableHighAccuracy: true, maximumAge: 2000 }
    );

    // Broadcast at fixed interval
    const svc = serviceRef.current;
    intervalRef.current = setInterval(async () => {
      const pos = latestPos.current;
      if (!pos) return;

      const frame: LocationFrame = {
        driverId,
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        speed: pos.coords.speed ?? undefined,
        heading: pos.coords.heading ?? undefined,
        accuracy: pos.coords.accuracy ?? undefined,
        timestamp: new Date().toISOString(),
      };

      await svc.sendBroadcast(
        channelName,
        "location",
        driverId,
        "location_update",
        frame
      );

      setLastFrame(frame);

      // Also persist to DB for failure recovery
      await supabase
        .from("driver_locations")
        .upsert({
          driver_id: driverId,
          current_latitude: frame.latitude,
          current_longitude: frame.longitude,
          is_online: true,
          updated_at: new Date().toISOString(),
        });
    }, intervalMs);

    setBroadcasting(true);
  }, [channelName, driverId, broadcasting, intervalMs, supabase]);

  // Stop broadcasting
  const stopBroadcast = useCallback(async () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Mark offline in DB
    if (driverId) {
      await supabase
        .from("driver_locations")
        .upsert({
          driver_id: driverId,
          is_online: false,
          updated_at: new Date().toISOString(),
        });
    }

    setBroadcasting(false);
  }, [driverId, supabase]);

  // Auto-start
  useEffect(() => {
    if (autoStart && driverId) startBroadcast();
    return () => {
      stopBroadcast();
    };
  }, [autoStart, driverId]);

  return {
    broadcasting,
    lastFrame,
    error,
    startBroadcast,
    stopBroadcast,
  };
}

// ---- Reader side (Client / Restaurant) ----

interface UseDriverStreamReaderOptions {
  /** Driver ID to follow (null = don't subscribe) */
  driverId: string | null;
  /** Called on each new location frame */
  onFrame?: (frame: LocationFrame) => void;
}

/**
 * Hook for the **Client** node to READ from a driver's location stream.
 *
 * Opens a Realtime subscription on the driver's broadcast channel
 * and accumulates location frames for rendering on a map.
 */
export function useDriverStreamReader({
  driverId,
  onFrame,
}: UseDriverStreamReaderOptions) {
  const { supabase, session } = useSupabase();
  const serviceRef = useRef(getRealtimeService(supabase));

  const [connected, setConnected] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<LocationFrame | null>(null);
  const [trail, setTrail] = useState<LocationFrame[]>([]);

  const channelName = driverId ? `driver-stream:${driverId}` : null;

  useEffect(() => {
    if (!channelName || !session?.user) return;

    const svc = serviceRef.current;

    svc.subscribeBroadcast<LocationFrame>(
      channelName,
      "location",
      (msg: SequencedMessage<LocationFrame>) => {
        const frame = msg.payload;

        setCurrentLocation(frame);
        setTrail((prev) => [...prev.slice(-99), frame]); // keep last 100 frames
        onFrame?.(frame);
      }
    );

    setConnected(true);

    return () => {
      svc.removeChannel(channelName);
      setConnected(false);
    };
  }, [channelName, session?.user, onFrame]);

  // Also listen for DB-level changes as fallback (Failure Model)
  useEffect(() => {
    if (!driverId || !session?.user) return;

    const svc = serviceRef.current;
    const dbChannel = `driver-loc-db:${driverId}`;

    svc.subscribeTable(
      dbChannel,
      "driver_locations",
      "UPDATE",
      (payload) => {
        const row = payload.new as {
          driver_id: string;
          current_latitude: number;
          current_longitude: number;
          updated_at: string;
        };

        const frame: LocationFrame = {
          driverId: row.driver_id,
          latitude: row.current_latitude,
          longitude: row.current_longitude,
          timestamp: row.updated_at,
        };

        setCurrentLocation(frame);
      },
      `driver_id=eq.${driverId}`
    );

    return () => {
      svc.removeChannel(dbChannel);
    };
  }, [driverId, session?.user]);

  return {
    connected,
    currentLocation,
    trail,
  };
}
