"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSupabase } from "@/lib/supabase/provider";
import {
  getRealtimeService,
  type SequencedMessage,
} from "@/lib/supabase/realtime-service";
import { getP2PCache, type PeerNode } from "@/lib/supabase/p2p-cache";

// ============================================
// P2P Discovery: Node Announcement + Mesh Building
// (Lecture 6: P2P — 3rd Generation)
//
// Every node periodically announces its presence on a
// shared Realtime Broadcast channel ("p2p-mesh").
// Other nodes receive the announcement and store the
// peer in their local P2P cache (DHT).
//
// Result: Each node has a local view of the network
// edge and can answer queries like "is driver X online?"
// without hitting the Cloud Hub.
//
// This is a Middleware-based 3rd-gen P2P overlay:
// - Not pure P2P — Supabase Realtime is the middleware.
// - Nodes discover each other via broadcast.
// - Local DHT cache reduces RPC calls (Load Balancing).
// ============================================

const P2P_CHANNEL = "p2p-mesh";
const ANNOUNCE_EVENT = "announce";
const ANNOUNCE_INTERVAL_MS = 5_000; // every 5s for faster testing

/** Payload broadcast when a node announces itself */
export interface AnnouncePayload {
  id: string;
  role: PeerNode["role"];
  displayName: string;
  latitude: number;
  longitude: number;
  isOnline: boolean;
}

interface UseP2PDiscoveryOptions {
  /** This node's role */
  role: PeerNode["role"];
  /** Display name for the node */
  displayName?: string;
  /** Whether to auto-announce (default true) */
  autoAnnounce?: boolean;
  /** Whether discovery is enabled (e.g. tied to isOnline) */
  enabled?: boolean;
}

export function useP2PDiscovery(opts: UseP2PDiscoveryOptions) {
  const { role, displayName = "Node", autoAnnounce = true, enabled = true } = opts;
  const { supabase, session } = useSupabase();

  const serviceRef = useRef(getRealtimeService(supabase));
  const cacheRef = useRef(getP2PCache());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [peers, setPeers] = useState<PeerNode[]>([]);
  const [meshSize, setMeshSize] = useState(0);
  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number }>({ lat: 24.7136, lng: 46.6753 });
  const [connectionStatus, setConnectionStatus] = useState<"pending" | "subscribed" | "error" | "closed">("pending");

  const userId = session?.user?.id;

  // Subscribe to announcements from other nodes + track connection status
  useEffect(() => {
    if (!userId || !enabled) return;

    const svc = serviceRef.current;
    const cache = cacheRef.current;
    let retryCount = 0;
    const MAX_RETRIES = 5;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const subscribe = () => {
      svc.subscribeSharedBroadcast<AnnouncePayload>(
        P2P_CHANNEL,
        ANNOUNCE_EVENT,
        (msg: SequencedMessage<AnnouncePayload>) => {
          const payload = msg.payload;
          console.log("P2P: Received broadcast from", payload);

          // Don't cache self
          if (payload.id === userId) return;

          // Store in DHT cache (TTL 20s — remove if no ping > 20s)
          cache.put(
            {
              id: payload.id,
              role: payload.role,
              displayName: payload.displayName,
              latitude: payload.latitude,
              longitude: payload.longitude,
              isOnline: payload.isOnline,
              lastSeen: Date.now(),
              meta: {},
            },
            20_000
          );

          // Update React state by merging with existing map
          setPeers(cache.getAll());
          setMeshSize(cache.size);
        }
      );

      // Poll status until subscribed (with retry / failure masking)
      const checkStatus = () => {
        const status = svc.status(P2P_CHANNEL);
        setConnectionStatus(status ?? "pending");

        if (status === "subscribed") {
          retryCount = 0;
          return;
        }

        if (status === "error" || status === "closed") {
          if (retryCount < MAX_RETRIES) {
            retryCount++;
            const delay = Math.min(1000 * 2 ** retryCount, 16000); // exp backoff capped at 16s
            console.warn(`[P2P] Connection failed, retry ${retryCount}/${MAX_RETRIES} in ${delay}ms`);
            retryTimer = setTimeout(() => {
              svc.removeChannel(P2P_CHANNEL);
              subscribe();
            }, delay);
            return;
          }
        }

        // Keep polling while pending
        retryTimer = setTimeout(checkStatus, 500);
      };

      // Give subscribe() a moment to start before polling
      retryTimer = setTimeout(checkStatus, 300);
    };

    subscribe();

    return () => {
      if (retryTimer) clearTimeout(retryTimer);
      svc.removeChannel(P2P_CHANNEL);
      setConnectionStatus("pending");
    };
  }, [userId, enabled]);

  // Announce this node periodically — only after channel is SUBSCRIBED
  useEffect(() => {
    if (!userId || !autoAnnounce || !enabled) return;

    const svc = serviceRef.current;

    const announce = () => {
      // Skip if not yet subscribed (connection-aware dispatch)
      if (svc.status(P2P_CHANNEL) !== "subscribed") {
        console.log("[P2P] Skipping announce: channel not yet subscribed");
        return;
      }

      // Use a random position for demo; in production,
      // this would come from the Geolocation API
      const lat = 24.7 + Math.random() * 0.1;
      const lng = 46.6 + Math.random() * 0.1;
      setMyLocation({ lat, lng });

      const payload: AnnouncePayload = {
        id: userId,
        role,
        displayName,
        latitude: lat,
        longitude: lng,
        isOnline: true,
      };

      svc.sendBroadcast(
        P2P_CHANNEL,
        ANNOUNCE_EVENT,
        userId,
        "p2p_announce",
        payload
      );
    };

    // Only start announcing once subscribed; poll briefly until ready
    const startAnnounce = () => {
      if (svc.status(P2P_CHANNEL) === "subscribed") {
        announce();
        intervalRef.current = setInterval(announce, ANNOUNCE_INTERVAL_MS);
      } else {
        // Retry every 500ms until subscribed (max 10s)
        const attempts = (startAnnounce as unknown as { _attempts?: number })._attempts ?? 0;
        if (attempts < 20) {
          (startAnnounce as unknown as { _attempts?: number })._attempts = attempts + 1;
          setTimeout(startAnnounce, 500);
        }
      }
    };

    startAnnounce();

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [userId, autoAnnounce, role, displayName, enabled, connectionStatus]);

  // Check if a specific peer is known locally (no RPC needed)
  const isPeerOnline = useCallback(
    (peerId: string): boolean => {
      return cacheRef.current.has(peerId);
    },
    []
  );

  // Get a peer from local cache (no RPC needed)
  const getPeer = useCallback(
    (peerId: string): PeerNode | null => {
      return cacheRef.current.get(peerId);
    },
    []
  );

  // Get nearby drivers from local cache
  const getNearbyDrivers = useCallback(
    (lat: number, lng: number, limit?: number): PeerNode[] => {
      return cacheRef.current.getNearbyDrivers(lat, lng, limit);
    },
    []
  );

  // Force refresh peers list from cache
  const refreshPeers = useCallback(() => {
    const cache = cacheRef.current;
    setPeers(cache.getAll());
    setMeshSize(cache.size);
  }, []);

  return {
    /** All known peers */
    peers,
    /** Total mesh size */
    meshSize,
    /** This node's current location */
    myLocation,
    /** WebSocket connection status for the P2P channel */
    connectionStatus,
    /** Check if a peer is in the local cache */
    isPeerOnline,
    /** Get a peer from local cache */
    getPeer,
    /** Get nearby drivers sorted by distance */
    getNearbyDrivers,
    /** Refresh the peers list from cache */
    refreshPeers,
  };
}
