"use client";

import { useEffect, useState } from "react";
import { useSupabase } from "@/lib/supabase/provider";
import type { PeerNode } from "@/lib/supabase/p2p-cache";
import type { HelpRequestPayload } from "@/hooks/use-p2p-discovery";
import { Radio, Wifi, WifiOff, RefreshCw, Users, Signal, SignalZero, LifeBuoy, MapPin, AlertTriangle, CheckCircle2, X } from "lucide-react";
import toast from "react-hot-toast";

interface NearbyPeersProps {
  peers: PeerNode[];
  meshSize: number;
  myLocation: { lat: number; lng: number };
  connectionStatus: "pending" | "subscribed" | "error" | "closed";
  helpRequests: HelpRequestPayload[];
  refreshPeers: () => void;
  dismissHelpRequest: (orderId: string) => void;
}

export function NearbyPeers({
  peers, meshSize, myLocation, connectionStatus,
  helpRequests, refreshPeers, dismissHelpRequest,
}: NearbyPeersProps) {
  const { supabase } = useSupabase();
  const [scanning, setScanning] = useState(true);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  // Compute nearby drivers using DHT cache distance logic
  const nearbyDrivers = peers.filter((p) => p.role === "driver").slice(0, 10);

  // Auto-stop scanning animation after a bit
  useEffect(() => {
    const t = setTimeout(() => setScanning(false), 3000);
    return () => clearTimeout(t);
  }, []);

  const handleRefresh = () => {
    setScanning(true);
    refreshPeers();
    setTimeout(() => setScanning(false), 2000);
  };

  const handleTakeOver = async (req: HelpRequestPayload) => {
    if (!supabase) return;
    setAcceptingId(req.orderId);
    const { data, error } = await supabase.rpc("transfer_order_ownership", {
      p_order_id: req.orderId,
      p_new_driver_id: (await supabase.auth.getUser()).data.user?.id,
    });
    if (error) {
      toast.error(`فشل الاستلام: ${error.message}`);
    } else if (data && !data.success) {
      toast.error(`فشل الاستلام: ${data.error}`);
    } else {
      toast.success("تم استلام الطلب بنجاح من الزميل");
      dismissHelpRequest(req.orderId);
    }
    setAcceptingId(null);
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-900/30">
            <Radio size={16} className="text-indigo-600 dark:text-indigo-300" />
            {scanning && (
              <span className="absolute inset-0 animate-ping rounded-lg bg-indigo-400 opacity-40" />
            )}
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100">
              شبكة النظام القريبة
            </h3>
            <p className="text-[10px] text-gray-500 dark:text-gray-400">
              P2P Mesh Discovery — Lecture 8
            </p>
          </div>
          {/* Connection status dot */}
          <div className="flex items-center gap-1 mr-1" title={`P2P: ${connectionStatus}`}>
            {connectionStatus === "subscribed" ? (
              <>
                <span className="h-2 w-2 rounded-full bg-green-500" />
                <Signal size={12} className="text-green-500" />
              </>
            ) : connectionStatus === "pending" ? (
              <>
                <span className="h-2 w-2 rounded-full bg-yellow-400 animate-pulse" />
                <Signal size={12} className="text-yellow-400" />
              </>
            ) : (
              <>
                <span className="h-2 w-2 rounded-full bg-red-500" />
                <SignalZero size={12} className="text-red-500" />
              </>
            )}
          </div>
        </div>
        <button
          onClick={handleRefresh}
          className="flex items-center gap-1 rounded-lg bg-gray-100 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
        >
          <RefreshCw size={12} className={scanning ? "animate-spin" : ""} />
          تحديث
        </button>
      </div>

      {/* Radar Visual */}
      <div className="relative mb-5 flex h-40 items-center justify-center overflow-hidden rounded-xl bg-gray-50 dark:bg-gray-900/50">
        {/* Concentric circles */}
        <div className="absolute h-32 w-32 rounded-full border border-gray-200 dark:border-gray-700" />
        <div className="absolute h-20 w-20 rounded-full border border-gray-200 dark:border-gray-700" />
        <div className="absolute h-8 w-8 rounded-full border border-gray-200 dark:border-gray-700" />

        {/* Center (self) */}
        <div className="absolute z-10 flex h-4 w-4 items-center justify-center rounded-full bg-indigo-500 shadow-lg">
          <div className="h-2 w-2 rounded-full bg-white" />
        </div>

        {/* Scanning beam */}
        {scanning && (
          <div
            className="absolute h-[1px] w-20 origin-left bg-gradient-to-r from-indigo-500/0 via-indigo-500 to-indigo-500/0"
            style={{
              animation: "radar-spin 2s linear infinite",
              left: "50%",
              top: "50%",
            }}
          />
        )}

        {/* Peer dots on radar */}
        {nearbyDrivers.slice(0, 5).map((peer, i) => {
          const angle = ((i * 72 + 30) * Math.PI) / 180;
          const radius = 25 + (i % 3) * 20;
          const x = Math.cos(angle) * radius;
          const y = Math.sin(angle) * radius;
          return (
            <div
              key={peer.id}
              className="absolute z-10 flex h-3 w-3 items-center justify-center rounded-full bg-green-400 shadow"
              style={{ transform: `translate(${x}px, ${y}px)` }}
            >
              <div className="h-1.5 w-1.5 rounded-full bg-white" />
            </div>
          );
        })}

        {/* Mesh size label */}
        <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded-md bg-white/80 px-2 py-0.5 text-[10px] font-medium text-gray-500 backdrop-blur-sm dark:bg-gray-800/80 dark:text-gray-400">
          <Users size={10} />
          {meshSize} node{meshSize !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Peer list */}
      <div className="space-y-2">
        {nearbyDrivers.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <WifiOff size={24} className="text-gray-300 dark:text-gray-600" />
            <p className="text-xs text-gray-400">لم يُكتشف أي سائقين في الجوار</p>
            <p className="text-[10px] text-gray-400">
              افتح نافذة سائق آخر لرؤية الاكتشاف الفوري
            </p>
          </div>
        ) : (
          nearbyDrivers.map((peer) => (
            <div
              key={peer.id}
              className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5 dark:border-gray-800 dark:bg-gray-900/50"
            >
              <div className="flex items-center gap-2.5">
                <div className="relative">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                    <Wifi size={12} className="text-green-600 dark:text-green-400" />
                  </div>
                  <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border-2 border-white bg-green-500 dark:border-gray-800" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                    {peer.displayName}
                  </p>
                  <p className="text-[10px] text-gray-400 font-mono">
                    {peer.id.slice(0, 12)}…
                  </p>
                </div>
              </div>
              <div className="text-right">
                <span className="inline-block rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                  {peer.role === "driver" ? "سائق" : peer.role}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Emergency Help Requests */}
      {helpRequests.length > 0 && (
        <div className="mt-5 space-y-3">
          <div className="flex items-center gap-1.5">
            <AlertTriangle size={14} className="text-red-500" />
            <h4 className="text-xs font-bold text-red-600 dark:text-red-400">
              طلبات مساعدة طارئة ({helpRequests.length})
            </h4>
          </div>
          {helpRequests.map((req) => (
            <div
              key={req.orderId}
              className="relative rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-900/10"
            >
              <button
                onClick={() => dismissHelpRequest(req.orderId)}
                className="absolute left-2 top-2 rounded-md p-1 text-gray-400 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30"
              >
                <X size={12} />
              </button>
              <div className="mb-2 flex items-center gap-2">
                <LifeBuoy size={16} className="text-red-500" />
                <div>
                  <p className="text-xs font-bold text-gray-800 dark:text-gray-200">
                    سائق يحتاج مساعدة!
                  </p>
                  <p className="text-[10px] text-gray-500">
                    {req.driverName} — طلب #{req.orderId.slice(0, 7)}
                  </p>
                </div>
              </div>
              <div className="mb-3 flex items-center gap-1 text-[10px] text-gray-500">
                <MapPin size={10} />
                <span>Lat: {req.latitude.toFixed(4)}, Lng: {req.longitude.toFixed(4)}</span>
              </div>
              <button
                onClick={() => handleTakeOver(req)}
                disabled={acceptingId === req.orderId}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 py-2.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {acceptingId === req.orderId ? (
                  <><RefreshCw size={12} className="animate-spin" /> جاري الاستلام...</>
                ) : (
                  <><CheckCircle2 size={12} /> استلام الشحنة من الزميل</>
                )}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="mt-3 text-center">
        <p className="text-[10px] text-gray-400">
          DHT Cache • TTL 20s • Broadcast every 5s • No DB queries
        </p>
      </div>

      {/* Radar animation keyframes (injected via style tag) */}
      <style>{`
        @keyframes radar-spin {
          from { transform: translate(-50%, -50%) rotate(0deg); }
          to   { transform: translate(-50%, -50%) rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
