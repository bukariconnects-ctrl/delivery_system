"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback } from "react";
import { DashboardShell } from "@/components/shared/DashboardShell";
import { useSupabase } from "@/lib/supabase/provider";
import {
  Activity,
  Users,
  Package,
  MapPin,
  FolderOpen,
  RefreshCw,
  Circle,
  TrendingUp,
  Wifi,
  ShieldCheck,
  FileText,
  CheckCircle2,
  Eye,
  Loader2,
} from "lucide-react";
import { DFSClient } from "@/lib/supabase/dfs-client";
import type { UserProfile, Order, Restaurant, DriverLocation } from "@/types";

// ============================================
// Admin Dashboard — The System Orchestrator
// (Centralized view of the entire distributed network)
//
// Features:
// 1. System Health Monitor — latency + active connections
// 2. Global Node Map — all restaurants + drivers
// 3. User Management — activate/deactivate + role changes
// 4. Transaction Oversight — all orders network-wide
// 5. DFS Explorer — files in delivery-dfs bucket
// ============================================

interface DFSFile {
  name: string;
  id: string | null;
  updated_at: string | null;
  metadata: Record<string, unknown> | null;
}

export default function AdminDashboard() {
  const { supabase } = useSupabase();

  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [drivers, setDrivers] = useState<DriverLocation[]>([]);
  const [dfsFiles, setDfsFiles] = useState<DFSFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [latency, setLatency] = useState<number | null>(null);
  const [tab, setTab] = useState<"health" | "approvals" | "users" | "orders" | "nodes" | "dfs">("health");
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [docPreviewUrl, setDocPreviewUrl] = useState<string | null>(null);
  const [docPreviewUser, setDocPreviewUser] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const start = performance.now();

    const [profilesRes, ordersRes, restaurantsRes, driversRes] = await Promise.all([
      supabase.from("profiles").select("*").order("updated_at", { ascending: false }),
      supabase.from("orders").select("*").order("created_at", { ascending: false }).limit(50),
      supabase.from("restaurants").select("*"),
      supabase.from("driver_locations").select("*"),
    ]);

    setLatency(Math.round(performance.now() - start));

    if (profilesRes.data) setProfiles(profilesRes.data);
    if (ordersRes.data) setOrders(ordersRes.data);
    if (restaurantsRes.data) setRestaurants(restaurantsRes.data);
    if (driversRes.data) setDrivers(driversRes.data);

    // DFS files
    const { data: files } = await supabase.storage
      .from("delivery-dfs")
      .list("", { limit: 100, sortBy: { column: "created_at", order: "desc" } });
    if (files) setDfsFiles(files as DFSFile[]);

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const onlineDrivers = drivers.filter((d) => d.is_online);
  const openRestaurants = restaurants.filter((r) => r.is_open);
  const pendingOrders = orders.filter((o) => o.status === "pending");
  const activeOrders = orders.filter((o) => !["delivered", "cancelled"].includes(o.status));


  // Verify a node via RPC — Admin as Certificate Authority (Lecture 9, Slide 6)
  const handleVerifyNode = async (userId: string) => {
    setVerifyingId(userId);
    const { data, error } = await supabase.rpc("verify_node", { target_user_id: userId });
    if (error) {
      console.error(error);
    } else {
      console.log("Verified:", data);
    }
    await fetchAll();
    setVerifyingId(null);
  };

  // Preview uploaded identity document from DFS
  const handlePreviewDoc = async (userId: string, ufid: string) => {
    const dfs = new DFSClient(supabase);
    const path = `drivers/${userId}/identity/${ufid}`;
    const url = await dfs.getUrl(path, 600);
    setDocPreviewUrl(url);
    setDocPreviewUser(userId);
  };

  const pendingProfiles = profiles.filter((p) => !p.is_verified && p.role !== "admin");
  const unverifiedRestaurants = restaurants.filter((r) => !r.is_verified);

  const statusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
      accepted: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
      preparing: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
      ready_for_pickup: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
      picked_up: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
      in_transit: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
      delivered: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
      cancelled: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    };
    return colors[status] ?? "bg-gray-100 text-gray-800";
  };

  const TABS = [
    { key: "health", label: "System Health", icon: Activity },
    { key: "approvals", label: `Approvals (${pendingProfiles.length})`, icon: ShieldCheck },
    { key: "users", label: "Users", icon: Users },
    { key: "orders", label: "Orders", icon: Package },
    { key: "nodes", label: "Node Map", icon: MapPin },
    { key: "dfs", label: "DFS Explorer", icon: FolderOpen },
  ] as const;

  return (
    <DashboardShell role="admin" title="لوحة تحكم مدير النظام — System Orchestrator">
      {/* Tab Navigation */}
      <div className="mb-6 flex flex-wrap gap-2">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                tab === t.key
                  ? "bg-purple-600 text-white shadow-md"
                  : "bg-white text-gray-600 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              }`}
            >
              <Icon size={16} />
              {t.label}
            </button>
          );
        })}
        <button
          onClick={fetchAll}
          disabled={loading}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-600 transition-all hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          تحديث
        </button>
      </div>

      {/* ═══ TAB: System Health ═══ */}
      {tab === "health" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard icon={TrendingUp} label="Latency" value={latency ? `${latency}ms` : "..."} color="blue" />
            <StatCard icon={Users} label="Total Users" value={profiles.length.toString()} color="green" />
            <StatCard icon={Wifi} label="Online Drivers" value={onlineDrivers.length.toString()} color="emerald" />
            <StatCard icon={Package} label="Active Orders" value={activeOrders.length.toString()} color="orange" />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard icon={MapPin} label="Open Restaurants" value={openRestaurants.length.toString()} color="purple" />
            <StatCard icon={Package} label="Pending Orders" value={pendingOrders.length.toString()} color="yellow" />
            <StatCard icon={FolderOpen} label="DFS Files" value={dfsFiles.length.toString()} color="indigo" />
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
            <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">Architecture Overview</h3>
            <div className="grid grid-cols-2 gap-3 text-xs text-gray-500 sm:grid-cols-3">
              {[
                "Multi-tier Architecture",
                "Centralized Cloud Hub",
                "WebSockets (Realtime)",
                "PostgreSQL RPC",
                "P2P Mesh (DHT)",
                "DFS (UFID)",
                "Digital Signatures",
                "Rate Limiting",
                "RLS + JWT",
              ].map((f) => (
                <div key={f} className="flex items-center gap-1.5 rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-800">
                  <Circle size={6} className="fill-green-500 text-green-500" />
                  {f}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══ TAB: Pending Approvals (Certificate Authority) ═══ */}
      {tab === "approvals" && (
        <div className="space-y-6">
          {/* Document Preview Modal */}
          {docPreviewUrl && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => { setDocPreviewUrl(null); setDocPreviewUser(null); }}>
              <div className="max-h-[80vh] max-w-2xl overflow-auto rounded-xl bg-white p-4 shadow-2xl dark:bg-gray-900" onClick={(e) => e.stopPropagation()}>
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Document Preview</p>
                  <button onClick={() => { setDocPreviewUrl(null); setDocPreviewUser(null); }} className="text-gray-400 hover:text-gray-600">✕</button>
                </div>
                <img src={docPreviewUrl} alt="Identity Document" className="max-w-full rounded-lg" />
                <p className="mt-2 text-center text-[10px] font-mono text-gray-400">User: {docPreviewUser?.slice(0, 16)}...</p>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-yellow-300 bg-yellow-50 p-4 dark:border-yellow-600 dark:bg-yellow-900/40">
            <p className="text-sm font-medium text-yellow-800 dark:text-yellow-100">
              <ShieldCheck size={14} className="mb-0.5 inline" /> أنت تعمل كـ <strong>Certificate Authority</strong> — تحقق من هوية العقد قبل منحها الوصول (Lecture 9, Slide 6)
            </p>
          </div>

          {pendingProfiles.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white p-8 text-center dark:border-gray-600 dark:bg-gray-800">
              <CheckCircle2 size={32} className="mx-auto mb-2 text-green-500" />
              <p className="text-sm text-gray-600 dark:text-gray-300">لا توجد طلبات تحقق معلقة</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase text-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400">
                  <tr>
                    <th className="px-4 py-3 text-left">User</th>
                    <th className="px-4 py-3 text-left">Role</th>
                    <th className="px-4 py-3 text-left">Details</th>
                    <th className="px-4 py-3 text-left">Documents</th>
                    <th className="px-4 py-3 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingProfiles.map((p) => (
                    <tr key={p.id} className="border-b border-gray-100 dark:border-gray-800">
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{p.full_name ?? "—"}</p>
                        <p className="font-mono text-[10px] text-gray-400">{p.id.slice(0, 16)}...</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                          {p.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {p.role === "driver" && p.vehicle_details ? (
                          <div>
                            <p>Model: {(p.vehicle_details as Record<string, string>).model ?? "—"}</p>
                            <p>Plate: {(p.vehicle_details as Record<string, string>).plate_number ?? "—"}</p>
                          </div>
                        ) : p.role === "restaurant" ? (
                          <p>Restaurant Owner</p>
                        ) : (
                          <p>Phone: {p.phone_number ?? "—"}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {p.id_document_ufid ? (
                          <button onClick={() => handlePreviewDoc(p.id, p.id_document_ufid!)}
                            className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                            <Eye size={12} /> View ID
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400">No docs</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => handleVerifyNode(p.id)} disabled={verifyingId === p.id}
                          className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50">
                          {verifyingId === p.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                          تحقق
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══ TAB: Users ═══ */}
      {tab === "users" && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase text-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400">
              <tr>
                <th className="px-4 py-3 text-left">User ID</th>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Role</th>
                <th className="px-4 py-3 text-left">Verified</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => (
                <tr key={p.id} className="border-b border-gray-100 dark:border-gray-800">
                  <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">{p.id.slice(0, 12)}...</td>
                  <td className="px-4 py-3 font-medium text-gray-700 dark:text-gray-200">{p.full_name ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      p.role === "admin"
                        ? "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200"
                        : "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                    }`}>
                      {p.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {p.is_verified ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/40 dark:text-green-300">
                        <CheckCircle2 size={10} /> مفعّل
                      </span>
                    ) : (
                      <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                        غير مفعّل
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══ TAB: Orders ═══ */}
      {tab === "orders" && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase text-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400">
              <tr>
                <th className="px-4 py-3 text-left">Order ID</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Amount</th>
                <th className="px-4 py-3 text-left">Client</th>
                <th className="px-4 py-3 text-left">Driver</th>
                <th className="px-4 py-3 text-left">Created</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-b border-gray-100 dark:border-gray-800">
                  <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">{o.id.slice(0, 12)}...</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColor(o.status)}`}>
                      {o.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-700 dark:text-gray-300">
                    {Number(o.total_amount).toFixed(2)} SAR
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">{o.client_id.slice(0, 8)}...</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">
                    {o.driver_id ? `${o.driver_id.slice(0, 8)}...` : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                    {new Date(o.created_at).toLocaleString("ar-SA")}
                  </td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">لا توجد طلبات</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══ TAB: Node Map ═══ */}
      {tab === "nodes" && (
        <div className="space-y-6">
          {/* Restaurants */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
              <MapPin size={16} className="text-orange-500" />
              Restaurant Nodes ({restaurants.length})
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {restaurants.map((r) => (
                <div key={r.id} className="flex items-start gap-3 rounded-lg border border-gray-100 p-3 dark:border-gray-800">
                  <span className={`mt-1 h-2.5 w-2.5 rounded-full ${r.is_open ? "bg-green-500" : "bg-gray-300"}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-700 dark:text-gray-300">{r.name}</p>
                    <p className="text-[10px] font-mono text-gray-400">
                      {r.latitude.toFixed(4)}, {r.longitude.toFixed(4)} • {r.is_open ? "Open" : "Closed"}
                    </p>
                  </div>
                </div>
              ))}
              {restaurants.length === 0 && <p className="text-sm text-gray-400">لا توجد مطاعم</p>}
            </div>
          </div>

          {/* Drivers */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
              <Wifi size={16} className="text-blue-500" />
              Driver Nodes ({drivers.length} total, {onlineDrivers.length} online)
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {drivers.map((d) => (
                <div key={d.driver_id} className="flex items-start gap-3 rounded-lg border border-gray-100 p-3 dark:border-gray-800">
                  <span className={`mt-1 h-2.5 w-2.5 rounded-full ${d.is_online ? "bg-green-500 animate-pulse" : "bg-gray-300"}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-xs text-gray-600 dark:text-gray-400">{d.driver_id.slice(0, 16)}...</p>
                    <p className="text-[10px] text-gray-400">
                      {d.current_latitude.toFixed(4)}, {d.current_longitude.toFixed(4)} • {d.is_online ? "Online" : "Offline"}
                    </p>
                  </div>
                </div>
              ))}
              {drivers.length === 0 && <p className="text-sm text-gray-400">لا يوجد سائقون</p>}
            </div>
          </div>
        </div>
      )}

      {/* ═══ TAB: DFS Explorer ═══ */}
      {tab === "dfs" && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
            <FolderOpen size={16} className="text-purple-500" />
            delivery-dfs Bucket
          </h3>
          {dfsFiles.length === 0 ? (
            <p className="text-sm text-gray-400">لا توجد ملفات في الـ DFS bucket بعد</p>
          ) : (
            <div className="space-y-2">
              {dfsFiles.map((f) => (
                <div
                  key={f.name}
                  className="flex items-center gap-3 rounded-lg bg-gray-50 px-4 py-2.5 dark:bg-gray-800"
                >
                  <FolderOpen size={14} className="text-gray-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-700 dark:text-gray-300">{f.name}</p>
                    {f.updated_at && (
                      <p className="text-[10px] text-gray-400">
                        {new Date(f.updated_at).toLocaleString("ar-SA")}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="mt-4 text-center text-[10px] text-gray-400">
            Hierarchical DFS • UFID • Supabase Storage • Client-side Caching
          </p>
        </div>
      )}
    </DashboardShell>
  );
}

// ── Stat Card Component ──
function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  color: string;
}) {
  const colorMap: Record<string, string> = {
    blue: "text-blue-600 bg-blue-50 dark:bg-blue-950/40",
    green: "text-green-600 bg-green-50 dark:bg-green-950/40",
    emerald: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40",
    orange: "text-orange-600 bg-orange-50 dark:bg-orange-950/40",
    purple: "text-purple-600 bg-purple-50 dark:bg-purple-950/40",
    yellow: "text-yellow-600 bg-yellow-50 dark:bg-yellow-950/40",
    indigo: "text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40",
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900">
      <div className="flex items-center gap-3">
        <div className={`rounded-lg p-2 ${colorMap[color] ?? colorMap.blue}`}>
          <Icon size={18} />
        </div>
        <div>
          <p className="text-xl font-bold text-gray-900 dark:text-white">{value}</p>
          <p className="text-[11px] text-gray-500">{label}</p>
        </div>
      </div>
    </div>
  );
}
