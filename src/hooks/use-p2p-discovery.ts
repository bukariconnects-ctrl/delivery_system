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
const ANNOUNCE_INTERVAL_MS = 10_000; // every 10s

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
}

export function useP2PDiscovery(opts: UseP2PDiscoveryOptions) {
  const { role, displayName = "Node", autoAnnounce = true } = opts;
  const { supabase, session } = useSupabase();

  const serviceRef = useRef(getRealtimeService(supabase));
  const cacheRef = useRef(getP2PCache());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [peers, setPeers] = useState<PeerNode[]>([]);
  const [meshSize, setMeshSize] = useState(0);

  const userId = session?.user?.id;

  // Subscribe to announcements from other nodes
  useEffect(() => {
    if (!userId) return;

    const svc = serviceRef.current;
    const cache = cacheRef.current;

    svc.subscribeBroadcast<AnnouncePayload>(
      P2P_CHANNEL,
      ANNOUNCE_EVENT,
      (msg: SequencedMessage<AnnouncePayload>) => {
        const payload = msg.payload;

        // Don't cache self
        if (payload.id === userId) return;

        // Store in DHT cache
        cache.put({
          id: payload.id,
          role: payload.role,
          displayName: payload.displayName,
          latitude: payload.latitude,
          longitude: payload.longitude,
          isOnline: payload.isOnline,
          lastSeen: Date.now(),
          meta: {},
        });

        // Update React state
        setPeers(cache.getAll());
        setMeshSize(cache.size);
      }
    );

    return () => {
      svc.removeChannel(P2P_CHANNEL);
    };
  }, [userId]);

  // Announce this node periodically
  useEffect(() => {
    if (!userId || !autoAnnounce) return;

    const svc = serviceRef.current;

    const announce = () => {
      // Use a random position for demo; in production,
      // this would come from the Geolocation API
      const payload: AnnouncePayload = {
        id: userId,
        role,
        displayName,
        latitude: 24.7 + Math.random() * 0.1,
        longitude: 46.6 + Math.random() * 0.1,
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

    // Announce immediately then at intervals
    announce();
    intervalRef.current = setInterval(announce, ANNOUNCE_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [userId, autoAnnounce, role, displayName]);

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
