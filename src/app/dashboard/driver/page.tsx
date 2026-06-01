"use client";

import { useState, useEffect, useCallback } from "react";
import dynamicImport from "next/dynamic";
import { DashboardShell } from "@/components/shared/DashboardShell";
import {
  Package,
  Truck,
  Loader2,
  CheckCircle2,
  UtensilsCrossed,
  MapPin,
} from "lucide-react";
import { useSupabase } from "@/lib/supabase/provider";
import { getRealtimeService } from "@/lib/supabase/realtime-service";
import { useAcceptOrder } from "@/hooks/use-remote-actions";
import { NearbyPeers } from "@/components/driver/NearbyPeers";
import toast from "react-hot-toast";
import type { Order, OrderItem, OrderStatus, Restaurant, OrderBroadcastPayload } from "@/types";

const LocationDisplay = dynamicImport(
  () => import("@/components/shared/LocationPicker").then((mod) => mod.LocationDisplay),
  { ssr: false, loading: () => <div className="h-[200px] rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center"><p className="text-sm text-gray-400">جاري تحميل الخريطة...</p></div> }
);

const STATUS_LABELS: Record<string, string> = {
  ready_for_pickup: "جاهز للاستلام", picked_up: "تم الاستلام",
  in_transit: "في الطريق", delivered: "تم التوصيل",
};

const DRIVER_NEXT: Partial<Record<OrderStatus, { next: OrderStatus; label: string }>> = {
  picked_up: { next: "in_transit", label: "في الطريق للعميل" },
  in_transit: { next: "delivered", label: "تم التوصيل" },
};

export default function DriverDashboard() {
  const { supabase, session } = useSupabase();

  const [isOnline, setIsOnline] = useState(false);
  const [availableOrders, setAvailableOrders] = useState<Order[]>([]);
  const [myOrders, setMyOrders] = useState<Order[]>([]);
  const [restaurants, setRestaurants] = useState<Map<string, Restaurant>>(new Map());
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [expandedMap, setExpandedMap] = useState<string | null>(null);
  const [trackingOrderId, setTrackingOrderId] = useState<string | null>(null);

  const { acceptOrder, accepting } = useAcceptOrder();

  // Fetch data
  const fetchData = useCallback(async () => {
    if (!session?.user) return;
    setLoading(true);

    const { data: loc } = await supabase
      .from("driver_locations")
      .select("is_online")
      .eq("driver_id", session.user.id)
      .single();
    if (loc) setIsOnline(loc.is_online);

    const { data: available } = await supabase
      .from("orders")
      .select("*")
      .eq("status", "ready_for_pickup")
      .is("driver_id", null)
      .order("created_at", { ascending: false });
    if (available) setAvailableOrders(available);

    const { data: mine } = await supabase
      .from("orders")
      .select("*")
      .eq("driver_id", session.user.id)
      .not("status", "eq", "delivered")
      .order("created_at", { ascending: false });
    if (mine) setMyOrders(mine);

    // Fetch restaurant data for all orders
    const allOrders = [...(available ?? []), ...(mine ?? [])];
    const restIds = [...new Set(allOrders.map((o) => o.restaurant_id))];
    if (restIds.length > 0) {
      const { data: rests } = await supabase
        .from("restaurants")
        .select("*")
        .in("id", restIds);
      if (rests) {
        const map = new Map<string, Restaurant>();
        rests.forEach((r) => map.set(r.id, r));
        setRestaurants(map);
      }
    }

    setLoading(false);
  }, [supabase, session?.user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Real-time: listen for order changes
  useEffect(() => {
    if (!session?.user) return;
    const svc = getRealtimeService(supabase);
    const timer = setTimeout(() => {
      // Subscribe to DB changes
      svc.subscribeTable(
        `driver-available:${session.user.id}`,
        "orders",
        "*",
        () => { fetchData(); }
      );
      
      // Subscribe to enriched broadcasts (Lecture 4, Slide 27)
      svc.subscribeSharedBroadcast<OrderBroadcastPayload>(
        "drivers:available-orders",
        "new_order",
        (msg) => {
          toast.success(`طلب جديد من ${msg.payload.order_details.restaurant_name}`);
          fetchData();
        }
      );
    }, 100);

    return () => {
      clearTimeout(timer);
      svc.removeChannel(`driver-available:${session.user.id}`);
      svc.removeChannel("drivers:available-orders");
    };
  }, [supabase, session?.user, fetchData]);

  // Toggle online/offline
  const toggleOnline = async () => {
    if (!session?.user) return;
    const newState = !isOnline;
    await supabase
      .from("driver_locations")
      .upsert({
        driver_id: session.user.id,
        is_online: newState,
        current_latitude: 0,
        current_longitude: 0,
        updated_at: new Date().toISOString(),
      });
    setIsOnline(newState);
    toast.success(newState ? "أنت الآن متصل" : "أنت الآن غير متصل");
    if (newState) fetchData();
  };

  // Accept an order (RPC)
  const handleAcceptOrder = async (orderId: string) => {
    const result = await acceptOrder(orderId);
    if (result?.success) {
      setAvailableOrders((prev) => prev.filter((o) => o.id !== orderId));
      fetchData();
    }
  };

  // Stream driver location (Lecture 4, Slide 5: Stream Communication)
  useEffect(() => {
    if (!trackingOrderId || !session?.user) return;

    const interval = setInterval(() => {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude, longitude } = pos.coords;
          await supabase
            .from("driver_locations")
            .upsert({
              driver_id: session.user.id,
              current_latitude: latitude,
              current_longitude: longitude,
              is_online: true,
              updated_at: new Date().toISOString(),
            });
        },
        (err) => console.error("Geolocation error:", err),
        { enableHighAccuracy: true, timeout: 5000 }
      );
    }, 3000);

    return () => clearInterval(interval);
  }, [trackingOrderId, session?.user, supabase]);

  const toggleTracking = (orderId: string) => {
    if (trackingOrderId === orderId) {
      setTrackingOrderId(null);
      toast("تم إيقاف التتبع", { icon: "⏹️" });
    } else {
      setTrackingOrderId(orderId);
      toast.success("تم بدء تتبع الموقع — يتم الإرسال كل 3 ثوانٍ");
    }
  };

  // Update order status
  const handleUpdateStatus = async (orderId: string, newStatus: OrderStatus) => {
    setUpdatingId(orderId);
    await supabase.from("orders").update({ status: newStatus }).eq("id", orderId);
    toast.success(`تم تحديث الحالة → ${STATUS_LABELS[newStatus] ?? newStatus}`);
    setUpdatingId(null);
    if (newStatus === "delivered") {
      setMyOrders((prev) => prev.filter((o) => o.id !== orderId));
    }
    fetchData();
  };

  return (
    <DashboardShell role="driver" title="لوحة تحكم السائق">
      <div dir="rtl">
        {/* Header: online toggle */}
        <div className="mb-6 flex items-center justify-between rounded-xl bg-white p-5 shadow-sm dark:bg-gray-800">
          <button onClick={toggleOnline}
            className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors ${
              isOnline ? "bg-red-100 text-red-700 hover:bg-red-200" : "bg-blue-600 text-white hover:bg-blue-700"
            }`}>
            {isOnline ? "قطع الاتصال" : "الاتصال الآن"}
          </button>
          <div className="flex items-center gap-3">
            <div>
              <p className="text-right font-bold text-gray-800 dark:text-gray-100">حالة الاتصال</p>
              <p className={`text-right text-xs font-medium ${isOnline ? "text-green-600" : "text-gray-500"}`}>
                {isOnline ? "متصل — يستقبل الطلبات" : "غير متصل"}
              </p>
            </div>
            <div className={`flex h-11 w-11 items-center justify-center rounded-xl text-white ${isOnline ? "bg-green-500" : "bg-gray-400"}`}>
              <Truck size={20} />
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="mb-6 grid grid-cols-2 gap-4">
          <div className="rounded-xl bg-white p-4 text-center shadow-sm dark:bg-gray-800">
            <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">{availableOrders.length}</p>
            <p className="text-xs text-gray-500">طلبات متاحة</p>
          </div>
          <div className="rounded-xl bg-white p-4 text-center shadow-sm dark:bg-gray-800">
            <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">{myOrders.length}</p>
            <p className="text-xs text-gray-500">طلبات نشطة</p>
          </div>
        </div>

        {/* P2P Mesh Discovery — Nearby Peers */}
        {isOnline && (
          <div className="mb-6">
            <NearbyPeers displayName={session?.user?.email?.split("@")[0] ?? "Driver"} isOnline={isOnline} />
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center gap-3 rounded-xl bg-white py-16 shadow-sm dark:bg-gray-800">
            <Loader2 size={28} className="animate-spin text-blue-400" />
            <p className="text-sm text-gray-400">جاري التحميل...</p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Available Orders */}
            <div>
              <h3 className="mb-4 text-lg font-bold text-gray-800 dark:text-gray-100">طلبات جاهزة للاستلام ({availableOrders.length})</h3>

              {!isOnline ? (
                <div className="flex flex-col items-center gap-3 rounded-xl bg-white py-12 shadow-sm dark:bg-gray-800">
                  <Truck size={40} className="text-gray-300 dark:text-gray-600" />
                  <p className="text-sm text-gray-400">فعّل الاتصال لرؤية الطلبات المتاحة</p>
                  <button onClick={toggleOnline} className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-semibold text-white hover:bg-blue-700">
                    الاتصال الآن
                  </button>
                </div>
              ) : availableOrders.length === 0 ? (
                <div className="flex flex-col items-center gap-3 rounded-xl bg-white py-12 shadow-sm dark:bg-gray-800">
                  <Package size={40} className="text-gray-300 dark:text-gray-600" />
                  <p className="text-sm text-gray-400">لا توجد طلبات متاحة حالياً</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {availableOrders.map((order) => {
                    const items = (order.items ?? []) as OrderItem[];
                    return (
                      <div key={order.id} className="rounded-xl bg-white p-5 shadow-sm dark:bg-gray-800">
                        <div className="mb-3 flex items-start justify-between">
                          <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-semibold text-purple-700">جاهز للاستلام</span>
                          <div className="text-right">
                            <p className="font-mono text-base font-bold text-gray-800 dark:text-gray-100">طلب #{order.id.slice(0, 7)}</p>
                            <p className="text-xs text-gray-500">{new Date(order.created_at).toLocaleString("ar-SA")}</p>
                          </div>
                        </div>
                        {items.length > 0 && (
                          <div className="mb-3 divide-y divide-gray-100">
                            {items.map((it, i) => (
                              <div key={i} className="flex items-center justify-between py-1.5 text-sm">
                                <span className="text-gray-500">{(it.price * it.quantity).toFixed(2)} ريال</span>
                                <span className="text-gray-700">{it.name} × {it.quantity}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="mb-4 text-right">
                          <p className="text-xs text-gray-500">المبلغ:</p>
                          <p className="text-lg font-bold text-green-600">{Number(order.total_amount).toFixed(2)} ريال</p>
                        </div>
                        
                        {/* Map toggle */}
                        {restaurants.get(order.restaurant_id) && order.delivery_lat && order.delivery_lng && (
                          <button
                            onClick={() => setExpandedMap(expandedMap === order.id ? null : order.id)}
                            className="mb-3 flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
                          >
                            <MapPin size={14} />
                            {expandedMap === order.id ? "إخفاء الخريطة" : "عرض موقع الاستلام والتوصيل"}
                          </button>
                        )}
                        {expandedMap === order.id && restaurants.get(order.restaurant_id) && order.delivery_lat && order.delivery_lng && (
                          <div className="mb-4">
                            <LocationDisplay
                              pickupLat={restaurants.get(order.restaurant_id)!.latitude}
                              pickupLng={restaurants.get(order.restaurant_id)!.longitude}
                              deliveryLat={order.delivery_lat}
                              deliveryLng={order.delivery_lng}
                              height="200px"
                            />
                          </div>
                        )}
                        
                        <button onClick={() => handleAcceptOrder(order.id)} disabled={accepting}
                          className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">
                          {accepting ? <Loader2 size={14} className="animate-spin" /> : null}
                          قبول الطلب
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* My Active Orders */}
            {myOrders.length > 0 && (
              <div>
                <h3 className="mb-4 text-lg font-bold text-gray-800 dark:text-gray-100">طلباتي النشطة ({myOrders.length})</h3>
                <div className="space-y-4">
                  {myOrders.map((order) => {
                    const statusLabel = STATUS_LABELS[order.status] ?? order.status;
                    const nextAction = DRIVER_NEXT[order.status as keyof typeof DRIVER_NEXT];
                    const items = (order.items ?? []) as OrderItem[];
                    const statusColor = order.status === "picked_up"
                      ? "bg-cyan-100 text-cyan-700"
                      : order.status === "in_transit"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-gray-100 text-gray-700";

                    return (
                      <div key={order.id} className="rounded-xl bg-white p-5 shadow-sm dark:bg-gray-800">
                        <div className="mb-3 flex items-start justify-between">
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusColor}`}>{statusLabel}</span>
                          <div className="text-right">
                            <p className="font-mono text-base font-bold text-gray-800 dark:text-gray-100">طلب #{order.id.slice(0, 7)}</p>
                            <p className="text-xs text-gray-500">{new Date(order.created_at).toLocaleString("ar-SA")}</p>
                          </div>
                        </div>
                        {items.length > 0 && (
                          <div className="mb-3 divide-y divide-gray-100">
                            {items.map((it, i) => (
                              <div key={i} className="flex items-center justify-between py-1.5 text-sm">
                                <span className="text-gray-500">{(it.price * it.quantity).toFixed(2)} ريال</span>
                                <span className="text-gray-700">{it.name} × {it.quantity}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="mb-4 text-right">
                          <p className="text-xs text-gray-500">المبلغ:</p>
                          <p className="text-lg font-bold text-green-600">{Number(order.total_amount).toFixed(2)} ريال</p>
                        </div>
                        
                        {/* Map for active orders */}
                        {restaurants.get(order.restaurant_id) && order.delivery_lat && order.delivery_lng && (
                          <div className="mb-4">
                            <LocationDisplay
                              pickupLat={restaurants.get(order.restaurant_id)!.latitude}
                              pickupLng={restaurants.get(order.restaurant_id)!.longitude}
                              deliveryLat={order.delivery_lat}
                              deliveryLng={order.delivery_lng}
                              height="200px"
                            />
                          </div>
                        )}
                        
                        {order.status === "in_transit" && (
                          <button
                            onClick={() => toggleTracking(order.id)}
                            className={`mb-3 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white transition-colors ${
                              trackingOrderId === order.id
                                ? "bg-red-600 hover:bg-red-700"
                                : "bg-orange-500 hover:bg-orange-600"
                            }`}
                          >
                            {trackingOrderId === order.id ? (
                              <><Loader2 size={14} className="animate-spin" /> إيقاف التتبع</>
                            ) : (
                              <><Truck size={14} /> بدء التتبع المباشر</>
                            )}
                          </button>
                        )}
                        {nextAction && (
                          <button onClick={() => handleUpdateStatus(order.id, nextAction.next)} disabled={updatingId === order.id}
                            className={`flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white disabled:opacity-50 ${
                              nextAction.next === "delivered" ? "bg-green-600 hover:bg-green-700" : "bg-blue-600 hover:bg-blue-700"
                            }`}>
                            {updatingId === order.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                            تحديث إلى: {nextAction.label}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
