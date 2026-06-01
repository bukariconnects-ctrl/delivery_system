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
const HELP_REQUEST_EVENT = "help_request";
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

/** Payload broadcast when a driver needs emergency help */
export interface HelpRequestPayload {
  type: "HELP_REQUEST";
  orderId: string;
  driverId: string;
  driverName: string;
  latitude: number;
  longitude: number;
  timestamp: string;
  priority: "high";
  /** Full order metadata so peers know what they're accepting without DB fetch */
  orderMeta: {
    restaurantName: string;
    totalAmount: number;
    itemCount: number;
    status: string;
  };
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
  const [helpRequests, setHelpRequests] = useState<HelpRequestPayload[]>([]);

  const userId = session?.user?.id;

  // Subscribe to announcements + help requests + track connection status
  useEffect(() => {
    if (!userId || !enabled) return;

    const svc = serviceRef.current;
    const cache = cacheRef.current;
    let retryCount = 0;
    const MAX_RETRIES = 5;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const subscribe = () => {
      // Peer discovery announcements
      svc.subscribeSharedBroadcast<AnnouncePayload>(
        P2P_CHANNEL,
        ANNOUNCE_EVENT,
        (msg: SequencedMessage<AnnouncePayload>) => {
          const payload = msg.payload;
          console.log("P2P: Received broadcast from", payload);
          if (payload.id === userId) return;
          cache.put(
            { id: payload.id, role: payload.role, displayName: payload.displayName,
              latitude: payload.latitude, longitude: payload.longitude, isOnline: payload.isOnline,
              lastSeen: Date.now(), meta: {} },
            20_000
          );
          setPeers(cache.getAll());
          setMeshSize(cache.size);
        }
      );

      // Emergency help requests from other drivers
      svc.subscribeSharedBroadcast<HelpRequestPayload>(
        P2P_CHANNEL,
        HELP_REQUEST_EVENT,
        (msg: SequencedMessage<HelpRequestPayload>) => {
          const payload = msg.payload;
          console.log("P2P: Received HELP_REQUEST", payload);
          if (payload.driverId === userId) return; // ignore self

          // Browser notification for emergency help request
          if (typeof window !== "undefined" && "Notification" in window) {
            if (Notification.permission === "granted") {
              new Notification("طلب مساعدة طارئ!", {
                body: `سائق ${payload.driverName} يحتاج مساعدة — طلب #${payload.orderId.slice(0, 7)} من ${payload.orderMeta.restaurantName}`,
                icon: "/favicon.ico",
                tag: payload.orderId,
              });
            } else if (Notification.permission !== "denied") {
              Notification.requestPermission().then((perm) => {
                if (perm === "granted") {
                  new Notification("طلب مساعدة طارئ!", {
                    body: `سائق ${payload.driverName} يحتاج مساعدة — طلب #${payload.orderId.slice(0, 7)} من ${payload.orderMeta.restaurantName}`,
                    icon: "/favicon.ico",
                    tag: payload.orderId,
                  });
                }
              });
            }
          }

          // Audio alert (soft beep) — high-priority signal should not be silent
          try {
            const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.frequency.value = 880; // A5
            gain.gain.value = 0.15;
            osc.start();
            osc.stop(audioCtx.currentTime + 0.15);
          } catch {
            /* ignore audio errors */
          }

          setHelpRequests((prev) => {
            // deduplicate by orderId, keep latest
            const filtered = prev.filter((r) => r.orderId !== payload.orderId);
            return [...filtered, payload];
          });
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

  // Broadcast a HELP_REQUEST to all peers
  const sendHelpRequest = useCallback(
    async (
      orderId: string,
      lat: number,
      lng: number,
      orderMeta: HelpRequestPayload["orderMeta"]
    ) => {
      if (!userId) return;
      const svc = serviceRef.current;
      const payload: HelpRequestPayload = {
        type: "HELP_REQUEST",
        orderId,
        driverId: userId,
        driverName: displayName,
        latitude: lat,
        longitude: lng,
        timestamp: new Date().toISOString(),
        priority: "high",
        orderMeta,
      };
      await svc.sendBroadcast(
        P2P_CHANNEL,
        HELP_REQUEST_EVENT,
        userId,
        "help_request",
        payload
      );
      console.log("[P2P] Sent HELP_REQUEST for order", orderId);
    },
    [userId, displayName]
  );

  // Remove a help request from the local list
  const dismissHelpRequest = useCallback((orderId: string) => {
    setHelpRequests((prev) => prev.filter((r) => r.orderId !== orderId));
  }, []);

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
    /** Active emergency help requests from peers */
    helpRequests,
    /** Check if a peer is in the local cache */
    isPeerOnline,
    /** Get a peer from local cache */
    getPeer,
    /** Get nearby drivers sorted by distance */
    getNearbyDrivers,
    /** Refresh the peers list from cache */
    refreshPeers,
    /** Broadcast a HELP_REQUEST */
    sendHelpRequest,
    /** Dismiss a received help request */
    dismissHelpRequest,
  };
}
