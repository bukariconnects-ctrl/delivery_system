"use client";

import React, { useState, useEffect, useCallback } from "react";
import dynamicImport from "next/dynamic";

export const dynamic = "force-dynamic";
import { DashboardShell } from "@/components/shared/DashboardShell";
import {
  Store,
  UtensilsCrossed,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  Loader2,
  Package,
  CheckCircle2,
  Check,
  Clock,
  Truck,
  ChefHat,
  MapPin,
  Search,
} from "lucide-react";
import { useSupabase } from "@/lib/supabase/provider";
import { getRealtimeService } from "@/lib/supabase/realtime-service";
import toast from "react-hot-toast";
import type { Restaurant, MenuItem, Order, OrderItem, OrderStatus } from "@/types";

const LocationPicker = dynamicImport(
  () => import("@/components/shared/LocationPicker").then((mod) => mod.LocationPicker),
  { ssr: false, loading: () => <div className="h-[250px] rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center"><p className="text-sm text-gray-400">جاري تحميل الخريطة...</p></div> }
);

// Live tracking map — shows driver moving in real-time
const LiveTrackingMap = dynamicImport(
  () => import("@/components/shared/LiveTrackingMap").then((mod) => mod.default),
  { ssr: false, loading: () => <div className="h-[250px] rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center"><p className="text-sm text-gray-400">جاري تحميل خريطة التتبع...</p></div> }
);

type View = "restaurants" | "menu" | "cart" | "tracking";

const STATUS_STEPS = [
  { key: "pending",          label: "قيد الانتظار",   icon: Clock,        emoji: "⏳", msg: "طلبك قيد الانتظار، سيتم تأكيده قريباً" },
  { key: "accepted",         label: "تم التأكيد",     icon: CheckCircle2, emoji: "✅", msg: "تم تأكيد طلبك وسيتم تحضيره قريباً" },
  { key: "preparing",        label: "جاري التحضير",   icon: ChefHat,      emoji: "👨‍🍳", msg: "المطعم يحضر طلبك الآن" },
  { key: "ready_for_pickup", label: "جاهز للتوصيل",   icon: Package,      emoji: "📦", msg: "طلبك جاهز وبانتظار السائق" },
  { key: "in_transit",       label: "جاري التوصيل",   icon: Truck,        emoji: "🚚", msg: "طلبك في الطريق إليك" },
  { key: "delivered",        label: "تم التوصيل",     icon: CheckCircle2, emoji: "🎉", msg: "تم توصيل طلبك بنجاح!" },
];

const STATUS_LABELS: Record<string, string> = {
  pending: "قيد الانتظار", accepted: "تم التأكيد", preparing: "جاري التحضير",
  ready_for_pickup: "جاهز للتوصيل", picked_up: "تم الاستلام", in_transit: "جاري التوصيل",
  delivered: "تم التوصيل", cancelled: "ملغي",
};

export default function ClientDashboard() {
  const { supabase, session } = useSupabase();

  const [view, setView] = useState<View>("restaurants");
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<(OrderItem & { image_ufid?: string | null })[]>([]);
  const [myOrders, setMyOrders] = useState<Order[]>([]);
  const [restaurantMap, setRestaurantMap] = useState<Map<string, Restaurant>>(new Map());
  const [driverLocations, setDriverLocations] = useState<Map<string, { lat: number; lng: number }>>(new Map());
  const [loading, setLoading] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [deliveryLat, setDeliveryLat] = useState(24.7136);
  const [deliveryLng, setDeliveryLng] = useState(46.6753);

  // Fetch open restaurants
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("restaurants")
        .select("*")
        .eq("is_open", true)
        .eq("is_verified", true);
      if (data) setRestaurants(data);
    })();
  }, [supabase]);

  // Fetch my orders
  const fetchMyOrders = useCallback(async () => {
    if (!session?.user) return;
    const { data } = await supabase
      .from("orders")
      .select("*")
      .eq("client_id", session.user.id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (data) {
      setMyOrders(data);
      // Load restaurants for active orders
      const restIds = [...new Set(data.map((o) => o.restaurant_id))];
      if (restIds.length > 0) {
        const { data: rests } = await supabase.from("restaurants").select("*").in("id", restIds);
        if (rests) {
          const map = new Map<string, Restaurant>();
          rests.forEach((r) => map.set(r.id, r));
          setRestaurantMap(map);
        }
      }
      // Load driver locations for orders with drivers
      const driverIds = [...new Set(data.filter((o) => o.driver_id).map((o) => o.driver_id!))];
      if (driverIds.length > 0) {
        const { data: locs } = await supabase.from("driver_locations").select("*").in("driver_id", driverIds);
        if (locs) {
          const map = new Map<string, { lat: number; lng: number }>();
          locs.forEach((l) => map.set(l.driver_id, { lat: l.current_latitude, lng: l.current_longitude }));
          setDriverLocations(map);
        }
      }
    }
  }, [supabase, session?.user]);

  useEffect(() => { fetchMyOrders(); }, [fetchMyOrders]);

  // Detect return from Stripe Checkout & verify payment
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("paid") === "success") {
      toast.success("تم الدفع بنجاح! جاري تحديث حالة الطلب...");
      window.history.replaceState({}, "", window.location.pathname);

      // Verify payment via server (fallback if webhook is delayed)
      (async () => {
        const { data: orders } = await supabase
          .from("orders")
          .select("id, payment_status, stripe_session_id")
          .eq("client_id", session?.user?.id ?? "")
          .eq("payment_status", "pending")
          .order("created_at", { ascending: false })
          .limit(1);

        if (orders && orders.length > 0) {
          const latestOrder = orders[0];
          try {
            const res = await fetch("/api/checkout/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ order_id: latestOrder.id }),
            });
            const result = await res.json();
            if (result.payment_status === "paid") {
              toast.success("تم تأكيد الدفع وجاري تحضير طلبك!");
            }
          } catch {}
        }
        fetchMyOrders();
      })();
    }
    if (params.get("paid") === "cancelled") {
      toast("تم إلغاء الدفع. يمكنك المحاولة مرة أخرى.", { icon: "⚠️" });
      window.history.replaceState({}, "", window.location.pathname);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Real-time order updates
  useEffect(() => {
    if (!session?.user) return;
    const svc = getRealtimeService(supabase);
    const timer = setTimeout(() => {
      svc.subscribeTable(
        `client-orders:${session.user.id}`,
        "orders",
        "*",
        (payload) => {
          const updated = payload.new as Order;
          setMyOrders((prev) => {
            const idx = prev.findIndex((o) => o.id === updated.id);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = updated;
              return next;
            }
            return [updated, ...prev];
          });
        },
        `client_id=eq.${session.user.id}`
      );
      
      // Stream Communication: subscribe to driver_locations for live tracking
      svc.subscribeTable(
        `client-driver-locs:${session.user.id}`,
        "driver_locations",
        "UPDATE",
        (payload) => {
          const loc = payload.new as { driver_id: string; current_latitude: number; current_longitude: number };
          setDriverLocations((prev) => {
            const next = new Map(prev);
            next.set(loc.driver_id, { lat: loc.current_latitude, lng: loc.current_longitude });
            return next;
          });
        }
      );
    }, 100);

    return () => {
      clearTimeout(timer);
      svc.removeChannel(`client-orders:${session.user.id}`);
      svc.removeChannel(`client-driver-locs:${session.user.id}`);
    };
  }, [supabase, session?.user]);

  // Open restaurant menu
  const openMenu = async (rest: Restaurant) => {
    setSelectedRestaurant(rest);
    setLoading(true);
    setCart([]);
    const { data } = await supabase
      .from("menu_items")
      .select("*")
      .eq("restaurant_id", rest.id)
      .order("created_at", { ascending: false });
    if (data) setMenuItems(data);
    setLoading(false);
    setView("menu");
  };

  // Cart operations
  const addToCart = (item: MenuItem) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.menu_item_id === item.id);
      if (existing) {
        return prev.map((c) =>
          c.menu_item_id === item.id ? { ...c, quantity: c.quantity + 1 } : c
        );
      }
      return [...prev, { menu_item_id: item.id, name: item.name, price: Number(item.price), quantity: 1, image_ufid: item.image_ufid }];
    });
    toast.success(`${item.name} أُضيف إلى السلة`);
  };

  const updateQty = (menuItemId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((c) => (c.menu_item_id === menuItemId ? { ...c, quantity: c.quantity + delta } : c))
        .filter((c) => c.quantity > 0)
    );
  };

  const cartTotal = cart.reduce((sum, c) => sum + c.price * c.quantity, 0);
  const cartCount = cart.reduce((sum, c) => sum + c.quantity, 0);

  // Place order via RPC → then redirect to Stripe Checkout
  const handlePlaceOrder = async () => {
    if (!selectedRestaurant || cart.length === 0) return;
    if (!deliveryLat || !deliveryLng) {
      toast.error("حدد موقع التوصيل على الخريطة");
      return;
    }
    setPlacing(true);

    // 1. Create order in our DB (payment_status defaults to 'pending')
    const { data, error } = await supabase.rpc("place_order", {
      p_restaurant_id: selectedRestaurant.id,
      p_items: cart.map((c) => ({ menu_item_id: c.menu_item_id, name: c.name, price: c.price, quantity: c.quantity })),
      p_total: cartTotal,
      p_delivery_lat: deliveryLat,
      p_delivery_lng: deliveryLng,
    });

    if (error) {
      toast.error(error.message);
      setPlacing(false);
      return;
    }

    const result = data as { success: boolean; order_id?: string; error?: string };
    if (!result.success || !result.order_id) {
      toast.error(result.error ?? "فشل إنشاء الطلب");
      setPlacing(false);
      return;
    }

    // 2. Create Stripe Checkout Session
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: result.order_id,
          restaurant_name: selectedRestaurant?.name,
          items: cart.map((c) => ({ name: c.name, price: c.price, quantity: c.quantity })),
          total: cartTotal,
          delivery_lat: deliveryLat,
          delivery_lng: deliveryLng,
          user_email: session?.user?.email,
        }),
      });

      const checkout = await res.json();
      if (!res.ok) {
        throw new Error(checkout.error ?? "فشل إنشاء جلسة الدفع");
      }

      // 3. Redirect to Stripe
      setCart([]);
      window.location.href = checkout.url;
    } catch (err: any) {
      toast.error(err.message ?? "فشل الاتصال ببوابة الدفع");
    }
    setPlacing(false);
  };

  // Confirm delivery
  const handleConfirmDelivery = async (orderId: string) => {
    await supabase.from("orders").update({ status: "delivered" }).eq("id", orderId);
    toast.success("تم تأكيد التوصيل!");
    fetchMyOrders();
  };

  const activeOrders = myOrders.filter((o) => !["delivered", "cancelled"].includes(o.status));
  const pastOrders = myOrders.filter((o) => ["delivered", "cancelled"].includes(o.status));
  const filteredRestaurants = restaurants.filter((r) =>
    !searchQuery || r.name.toLowerCase().includes(searchQuery.toLowerCase()) || (r.cuisine_type ?? "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <DashboardShell role="client" title="لوحة تحكم العميل">
      {/* ═══ VIEW: Restaurants ═══ */}
      {view === "restaurants" && (
        <div dir="rtl">
          <div className="relative mb-6">
            <Search size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث عن مطعم أو نوع مطبخ..."
              className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-4 pr-10 text-sm text-gray-800 shadow-sm outline-none focus:border-blue-400 focus:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-400" />
          </div>

          {filteredRestaurants.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl bg-white py-16 shadow-sm dark:bg-gray-800">
              <Store size={48} className="text-gray-300 dark:text-gray-600" />
              <p className="text-sm font-medium text-gray-400">لا توجد مطاعم متوفرة حالياً</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredRestaurants.map((r) => (
                <button key={r.id} onClick={() => openMenu(r)}
                  className="group rounded-xl bg-white p-5 text-right shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg dark:bg-gray-800">
                  <div className="mb-3 flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
                      <Store size={20} />
                    </div>
                    <div>
                      <p className="text-base font-bold text-gray-800 dark:text-gray-100">{r.name}</p>
                      {r.cuisine_type && <p className="text-xs text-gray-500">{r.cuisine_type}</p>}
                    </div>
                  </div>
                  {r.description && <p className="mb-3 text-xs leading-relaxed text-gray-500 line-clamp-2">{r.description}</p>}
                  <div className="flex items-center justify-between">
                    <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-[11px] font-semibold text-green-700">مفتوح</span>
                    <span className="text-xs font-medium text-blue-600 group-hover:underline">عرض القائمة ←</span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Quick link to orders */}
          {activeOrders.length > 0 && (
            <button onClick={() => setView("tracking")}
              className="mt-6 flex w-full items-center justify-between rounded-xl bg-white p-4 shadow-sm transition-colors hover:bg-blue-50 dark:bg-gray-800 dark:hover:bg-gray-700">
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">تتبع طلباتي ({activeOrders.length})</span>
              <span className="text-xs text-blue-600">عرض ←</span>
            </button>
          )}
        </div>
      )}

      {/* ═══ VIEW: Menu ═══ */}
      {view === "menu" && selectedRestaurant && (
        <div dir="rtl">
          {/* Restaurant header bar */}
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">{selectedRestaurant.name}</h2>
              {selectedRestaurant.cuisine_type && <p className="text-sm text-gray-500">{selectedRestaurant.cuisine_type}</p>}
            </div>
            <button onClick={() => { setView("restaurants"); setCart([]); }}
              className="text-sm font-medium text-blue-600 hover:underline">— العودة</button>
          </div>

          <p className="mb-4 text-lg font-semibold text-gray-700 dark:text-gray-200">عام</p>

          {loading ? (
            <div className="flex flex-col items-center gap-3 rounded-xl bg-white py-16 shadow-sm dark:bg-gray-800">
              <Loader2 size={28} className="animate-spin text-blue-400" />
              <p className="text-sm text-gray-400">جاري تحميل القائمة...</p>
            </div>
          ) : menuItems.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl bg-white py-16 shadow-sm dark:bg-gray-800">
              <UtensilsCrossed size={40} className="text-gray-300 dark:text-gray-600" />
              <p className="text-sm text-gray-400">لا توجد وجبات في هذا المطعم</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {menuItems.map((item) => {
                const inCart = cart.find((c) => c.menu_item_id === item.id);
                return (
                  <div key={item.id} className="flex flex-col justify-between rounded-xl bg-white p-5 shadow-sm dark:bg-gray-800">
                    <div>
                      <div className="mb-4 flex items-start justify-between">
                        <span className="text-base font-bold text-green-600">{Number(item.price).toFixed(2)} ريال</span>
                        <span className="text-base font-bold text-gray-800 dark:text-gray-100">{item.name}</span>
                      </div>
                      {item.description && <p className="mb-4 text-xs text-gray-500">{item.description}</p>}
                    </div>

                    {inCart ? (
                      <div className="flex items-center justify-center gap-4">
                        <button onClick={() => updateQty(item.id, 1)}
                          className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-white transition-colors hover:bg-blue-700">
                          <Plus size={16} />
                        </button>
                        <span className="min-w-[2rem] text-center text-lg font-bold text-gray-800 dark:text-gray-100">{inCart.quantity}</span>
                        <button onClick={() => updateQty(item.id, -1)}
                          className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-gray-300 text-gray-500 transition-colors hover:border-red-400 hover:text-red-500">
                          {inCart.quantity === 1 ? <Trash2 size={14} /> : <Minus size={16} />}
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => addToCart(item)}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-gray-900 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gray-800">
                        <Plus size={16} /> أضف للسلة
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Floating cart bar */}
          {cart.length > 0 && (
            <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white px-6 py-3 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
              <div className="mx-auto flex max-w-5xl items-center justify-between">
                <button onClick={() => setView("cart")}
                  className="rounded-xl bg-green-600 px-6 py-2.5 text-sm font-bold text-white transition-colors hover:bg-green-700">
                  إتمام الطلب
                </button>
                <div className="flex items-center gap-4">
                  <div className="text-left">
                    <p className="text-xs text-gray-500">{cartCount} عنصر</p>
                    <p className="text-base font-bold text-blue-600">{cartTotal.toFixed(2)} ريال</p>
                  </div>
                  <ShoppingCart size={28} className="text-gray-400" />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ VIEW: Cart / Checkout ═══ */}
      {view === "cart" && (
        <div dir="rtl">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-800">إتمام الطلب</h2>
            <button onClick={() => setView("menu")} className="text-sm font-medium text-blue-600 hover:underline">— العودة للقائمة</button>
          </div>

          {cart.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl bg-white py-16 shadow-sm">
              <ShoppingCart size={40} className="text-gray-300" />
              <p className="text-sm text-gray-400">السلة فارغة</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Order summary */}
              <div className="rounded-xl bg-white p-6 shadow-sm">
                <h3 className="mb-1 text-lg font-bold text-gray-800">ملخص الطلب</h3>
                <p className="mb-4 text-sm text-gray-500">{selectedRestaurant?.name}</p>

                <div className="divide-y divide-gray-100">
                  {cart.map((c) => (
                    <div key={c.menu_item_id} className="flex items-start justify-between py-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => updateQty(c.menu_item_id, -1)} className="text-red-400 hover:text-red-600">
                          <Trash2 size={14} />
                        </button>
                        <span className="text-sm font-bold text-green-600">{(c.price * c.quantity).toFixed(2)} ريال</span>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-gray-800">{c.name}</p>
                        <p className="text-xs text-gray-500">{c.price.toFixed(2)} ريال × {c.quantity}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-gray-200 pt-4">
                  <span className="text-lg font-bold text-green-600">{cartTotal.toFixed(2)} ريال</span>
                  <span className="text-sm font-semibold text-gray-700">الإجمالي</span>
                </div>
              </div>

              {/* Delivery Location & Confirm */}
              <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800">
                <h3 className="mb-2 text-lg font-bold text-gray-800 dark:text-gray-100">موقع التوصيل</h3>
                <p className="mb-4 text-sm text-gray-500">حدد موقع التوصيل على الخريطة</p>
                <LocationPicker
                  initialLat={deliveryLat}
                  initialLng={deliveryLng}
                  onLocationChange={(lat, lng) => {
                    setDeliveryLat(lat);
                    setDeliveryLng(lng);
                  }}
                  height="250px"
                />

                <div className="mt-6 border-t border-gray-200 pt-4 dark:border-gray-700">
                  <p className="mb-4 text-sm text-gray-500">سيتم إرسال طلبك إلى {selectedRestaurant?.name} مباشرة</p>
                  <button onClick={handlePlaceOrder} disabled={placing}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-3.5 text-base font-bold text-white transition-colors hover:bg-green-700 disabled:opacity-50">
                    {placing ? <Loader2 size={18} className="animate-spin" /> : <ShoppingCart size={18} />}
                    {placing ? "جاري الإرسال..." : `الدفع والتأكيد — ${cartTotal.toFixed(2)} ريال`}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ VIEW: Tracking ═══ */}
      {view === "tracking" && (
        <div dir="rtl">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-800">تتبع الطلب</h2>
            <button onClick={() => setView("restaurants")} className="text-sm font-medium text-blue-600 hover:underline">— العودة</button>
          </div>

          {activeOrders.length > 0 && (
            <div className="mb-8 space-y-6">
              {activeOrders.map((order) => {
                const items = (order.items ?? []) as OrderItem[];
                const currentIdx = STATUS_STEPS.findIndex((s) => s.key === order.status);
                const currentStep = STATUS_STEPS[currentIdx] ?? STATUS_STEPS[0];

                return (
                  <div key={order.id} className="space-y-4">
                    {/* Order number card */}
                    <div className="flex items-center justify-between rounded-xl bg-white px-6 py-4 shadow-sm">
                      <div className="flex flex-col gap-1">
                        <p className="text-sm text-gray-500">{new Date(order.created_at).toLocaleString("ar-SA")}</p>
                        {/* Payment status badge */}
                        <span className={`inline-block self-start rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                          order.payment_status === "paid"
                            ? "bg-green-100 text-green-700"
                            : order.payment_status === "failed"
                              ? "bg-red-100 text-red-700"
                              : "bg-yellow-100 text-yellow-700"
                        }`}>
                          {order.payment_status === "paid" ? "تم الدفع" : order.payment_status === "failed" ? "فشل الدفع" : "بانتظار الدفع"}
                        </span>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-gray-700">رقم الطلب</p>
                        <p className="font-mono text-lg font-bold text-gray-900">#{order.id.slice(0, 7).toUpperCase()}</p>
                      </div>
                    </div>

                    {/* Status banner */}
                    <div className="rounded-2xl bg-gradient-to-l from-purple-600 via-indigo-600 to-blue-500 px-6 py-8 text-center text-white shadow-lg">
                      <p className="mb-2 text-3xl">{currentStep.emoji}</p>
                      <p className="text-lg font-bold">{currentStep.msg}</p>
                    </div>

                    {/* Step indicators */}
                    <div className="rounded-xl bg-white px-6 py-6 shadow-sm">
                      <h3 className="mb-6 text-center text-base font-bold text-gray-700">مراحل الطلب</h3>
                      <div className="flex items-center justify-between">
                        {STATUS_STEPS.slice().reverse().map((step, i) => {
                          const realIdx = STATUS_STEPS.length - 1 - i;
                          const Icon = step.icon;
                          const isCompleted = realIdx < currentIdx;
                          const isCurrent = realIdx === currentIdx;

                          return (
                            <React.Fragment key={step.key}>
                              {i > 0 && (
                                <div className={`h-0.5 flex-1 ${realIdx < currentIdx ? "bg-green-500" : realIdx === currentIdx ? "bg-blue-500" : "bg-gray-200"}`} />
                              )}
                              <div className="flex flex-col items-center gap-1.5">
                                <div className={`flex items-center justify-center rounded-full transition-all ${
                                  isCurrent
                                    ? "h-14 w-14 bg-blue-600 text-white shadow-lg shadow-blue-500/30"
                                    : isCompleted
                                      ? "h-10 w-10 bg-green-500 text-white"
                                      : "h-10 w-10 bg-gray-200 text-gray-400"
                                }`}>
                                  {isCompleted ? <Check size={18} /> : <Icon size={isCurrent ? 24 : 16} />}
                                </div>
                                <p className={`max-w-[4rem] text-center text-[10px] leading-tight ${
                                  isCurrent ? "font-bold text-blue-600" : isCompleted ? "font-medium text-green-600" : "text-gray-400"
                                }`}>
                                  {step.label}
                                </p>
                              </div>
                            </React.Fragment>
                          );
                        })}
                      </div>
                    </div>

                    {/* Live driver tracking map (Stream Communication) */}
                    {order.driver_id && restaurantMap.get(order.restaurant_id) && order.delivery_lat && order.delivery_lng && (
                      <div className="rounded-xl bg-white px-6 py-5 shadow-sm">
                        <h3 className="mb-3 text-base font-bold text-gray-700">تتبع السائق مباشرة</h3>
                        <LiveTrackingMap
                          pickupLat={restaurantMap.get(order.restaurant_id)!.latitude}
                          pickupLng={restaurantMap.get(order.restaurant_id)!.longitude}
                          deliveryLat={order.delivery_lat}
                          deliveryLng={order.delivery_lng}
                          driverLat={driverLocations.get(order.driver_id)?.lat}
                          driverLng={driverLocations.get(order.driver_id)?.lng}
                          height="220px"
                        />
                      </div>
                    )}

                    {/* Order details */}
                    <div className="rounded-xl bg-white px-6 py-5 shadow-sm">
                      <h3 className="mb-4 text-base font-bold text-gray-700">تفاصيل الطلب</h3>
                      {items.length > 0 && (
                        <div className="mb-4 divide-y divide-gray-100">
                          {items.map((it, i) => (
                            <div key={i} className="flex items-center justify-between py-2">
                              <span className="text-sm text-gray-500">{(it.price * it.quantity).toFixed(2)} ريال</span>
                              <span className="text-sm text-gray-700">{it.name} × {it.quantity}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center justify-between border-t border-gray-200 pt-3">
                        <span className="text-base font-bold text-green-600">{Number(order.total_amount).toFixed(2)} ريال</span>
                        <span className="text-sm font-semibold text-gray-700">الإجمالي</span>
                      </div>

                      {order.status === "in_transit" && (
                        <button onClick={() => handleConfirmDelivery(order.id)}
                          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-3 text-sm font-bold text-white hover:bg-green-700">
                          <CheckCircle2 size={16} /> تأكيد التوصيل
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Past orders */}
          {pastOrders.length > 0 && (
            <div>
              <h3 className="mb-3 text-lg font-bold text-gray-700">طلبات سابقة ({pastOrders.length})</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {pastOrders.slice(0, 12).map((order) => (
                  <div key={order.id} className="rounded-xl bg-white p-4 shadow-sm">
                    <div className="mb-2 flex items-center justify-between">
                      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${order.status === "delivered" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                        {STATUS_LABELS[order.status] ?? order.status}
                      </span>
                      <p className="font-mono text-sm font-bold text-gray-800">#{order.id.slice(0, 7)}</p>
                    </div>
                    <p className="text-xs text-gray-500">{new Date(order.created_at).toLocaleString("ar-SA")}</p>
                    <p className="mt-2 text-sm font-bold text-green-600">{Number(order.total_amount).toFixed(2)} ريال</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {myOrders.length === 0 && (
            <div className="flex flex-col items-center gap-3 rounded-xl bg-white py-16 shadow-sm">
              <Package size={40} className="text-gray-300" />
              <p className="text-sm text-gray-400">لا توجد طلبات بعد</p>
              <button onClick={() => setView("restaurants")} className="rounded-xl bg-green-600 px-6 py-2 text-sm font-semibold text-white">تصفح المطاعم</button>
            </div>
          )}
        </div>
      )}
    </DashboardShell>
  );
}
