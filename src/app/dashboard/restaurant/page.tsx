"use client";

import { useState, useEffect, useCallback } from "react";
import { DashboardShell } from "@/components/shared/DashboardShell";
import {
  Package,
  Loader2,
  X,
  UtensilsCrossed,
  Plus,
  Trash2,
  Upload,
  Image as ImageIcon,
  Store,
  CheckCircle2,
  Edit3,
  Save,
} from "lucide-react";
import { useSupabase } from "@/lib/supabase/provider";
import { getRealtimeService } from "@/lib/supabase/realtime-service";
import { DFSClient } from "@/lib/supabase/dfs-client";
import toast from "react-hot-toast";
import type { Order, OrderItem, OrderStatus, MenuItem, Restaurant, OrderBroadcastPayload } from "@/types";

const STATUS_LABELS: Record<string, string> = {
  pending: "جديد", accepted: "مقبول", preparing: "جاري التحضير",
  ready_for_pickup: "جاهز للاستلام", picked_up: "تم الاستلام",
  in_transit: "في الطريق", delivered: "تم التوصيل", cancelled: "ملغي",
};

const NEXT_STATUS: Partial<Record<OrderStatus, { next: OrderStatus; label: string }>> = {
  pending: { next: "accepted", label: "قبول الطلب" },
  accepted: { next: "preparing", label: "بدء التحضير" },
  preparing: { next: "ready_for_pickup", label: "جاهز للتوصيل" },
};

type Tab = "orders" | "settings";

export default function RestaurantDashboard() {
  const { supabase, session } = useSupabase();
  const dfs = new DFSClient(supabase);

  const [tab, setTab] = useState<Tab>("orders");
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Settings state
  const [restName, setRestName] = useState("");
  const [restCuisine, setRestCuisine] = useState("");
  const [restDesc, setRestDesc] = useState("");
  const [restLat, setRestLat] = useState("");
  const [restLng, setRestLng] = useState("");
  const [savingInfo, setSavingInfo] = useState(false);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [newItem, setNewItem] = useState({ name: "", description: "", price: "" });
  const [menuImage, setMenuImage] = useState<File | null>(null);
  const [addingItem, setAddingItem] = useState(false);
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState("");

  // Load restaurant + orders
  const fetchData = useCallback(async () => {
    if (!session?.user) return;
    setLoading(true);

    const { data: rest } = await supabase
      .from("restaurants")
      .select("*")
      .eq("owner_id", session.user.id)
      .single();

    if (rest) {
      setRestaurantId(rest.id);
      setRestaurant(rest);
      setIsOpen(rest.is_open);
      setRestName(rest.name);
      setRestCuisine(rest.cuisine_type ?? "");
      setRestDesc(rest.description ?? "");
      setRestLat(rest.latitude?.toString() ?? "");
      setRestLng(rest.longitude?.toString() ?? "");

      const { data: orderData } = await supabase
        .from("orders")
        .select("*")
        .eq("restaurant_id", rest.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (orderData) setOrders(orderData);

      const { data: items } = await supabase
        .from("menu_items")
        .select("*")
        .eq("restaurant_id", rest.id)
        .order("created_at", { ascending: false });
      if (items) setMenuItems(items);
    }
    setLoading(false);
  }, [supabase, session?.user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Real-time order updates
  useEffect(() => {
    if (!restaurantId) return;
    const svc = getRealtimeService(supabase);
    const timer = setTimeout(() => {
      svc.subscribeTable(
        `rest-orders:${restaurantId}`,
        "orders",
        "*",
        (payload) => {
          const updated = payload.new as Order;
          setOrders((prev) => {
            const idx = prev.findIndex((o) => o.id === updated.id);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = updated;
              return next;
            }
            return [updated, ...prev];
          });
          if (payload.eventType === "INSERT") {
            toast("طلب جديد!", { icon: "🔔" });
          }
        },
        `restaurant_id=eq.${restaurantId}`
      );
    }, 100);

    return () => {
      clearTimeout(timer);
      svc.removeChannel(`rest-orders:${restaurantId}`);
    };
  }, [supabase, restaurantId]);

  // Toggle open/closed
  const toggleOpen = async () => {
    if (!restaurantId) return;
    const newState = !isOpen;
    await supabase.from("restaurants").update({ is_open: newState }).eq("id", restaurantId);
    setIsOpen(newState);
    toast.success(newState ? "المطعم مفتوح الآن" : "المطعم مغلق الآن");
  };

  // Update order status
  const handleUpdateStatus = async (orderId: string, newStatus: OrderStatus) => {
    setUpdatingId(orderId);
    await supabase.from("orders").update({ status: newStatus }).eq("id", orderId);
    
    // Enriched broadcast for drivers when order is ready (Lecture 4, Slide 27)
    if (newStatus === "ready_for_pickup" && restaurant) {
      const order = orders.find((o) => o.id === orderId);
      if (order) {
        const svc = getRealtimeService(supabase);
        const payload: OrderBroadcastPayload = {
          order_id: orderId,
          status: newStatus,
          pickup_location: {
            lat: restaurant.latitude,
            lng: restaurant.longitude,
          },
          delivery_location: {
            lat: order.delivery_lat ?? 0,
            lng: order.delivery_lng ?? 0,
          },
          order_details: {
            total: Number(order.total_amount),
            items: (order.items ?? []) as OrderItem[],
            restaurant_name: restaurant.name,
          },
        };
        await svc.sendBroadcast(
          "drivers:available-orders",
          "new_order",
          restaurant.id,
          "order_ready",
          payload
        );
      }
    }
    
    toast.success(`تم تحديث الحالة → ${STATUS_LABELS[newStatus] ?? newStatus}`);
    setUpdatingId(null);
  };

  // Save restaurant info
  const handleSaveInfo = async () => {
    if (!restaurantId || !session?.user) return;
    if (!restName.trim()) { toast.error("أدخل اسم المطعم"); return; }
    setSavingInfo(true);
    await supabase.from("restaurants").update({
      name: restName.trim(),
      cuisine_type: restCuisine.trim() || null,
      description: restDesc.trim() || null,
      latitude: parseFloat(restLat) || 0,
      longitude: parseFloat(restLng) || 0,
    }).eq("id", restaurantId);
    toast.success("تم حفظ بيانات المطعم");
    setSavingInfo(false);
  };

  // Add menu item
  const handleAddMenuItem = async () => {
    if (!restaurantId) { toast.error("لا يوجد مطعم"); return; }
    if (!newItem.name.trim()) { toast.error("أدخل اسم الوجبة"); return; }

    setAddingItem(true);
    let imageUfid: string | null = null;
    if (menuImage) {
      const result = await dfs.upload("restaurants", restaurantId, "menu", menuImage);
      if ("error" in result) {
        toast.error(`فشل رفع الصورة: ${result.error}`);
        setAddingItem(false);
        return;
      }
      imageUfid = result.ufid;
    }

    const { data, error } = await supabase
      .from("menu_items")
      .insert({
        restaurant_id: restaurantId,
        name: newItem.name.trim(),
        description: newItem.description.trim() || null,
        price: parseFloat(newItem.price) || 0,
        image_ufid: imageUfid,
      })
      .select("*")
      .single();

    if (error) toast.error(error.message);
    else if (data) {
      setMenuItems((prev) => [data, ...prev]);
      setNewItem({ name: "", description: "", price: "" });
      setMenuImage(null);
      toast.success("تم إضافة الوجبة");
    }
    setAddingItem(false);
  };

  // Delete menu item
  const handleDeleteItem = async (id: string) => {
    await supabase.from("menu_items").delete().eq("id", id);
    setMenuItems((prev) => prev.filter((i) => i.id !== id));
    toast.success("تم حذف الوجبة");
  };

  // Update menu item price
  const handleUpdatePrice = async (id: string) => {
    const newPrice = parseFloat(editPrice);
    if (isNaN(newPrice) || newPrice <= 0) { toast.error("أدخل سعراً صحيحاً"); return; }
    await supabase.from("menu_items").update({ price: newPrice }).eq("id", id);
    setMenuItems((prev) => prev.map((i) => i.id === id ? { ...i, price: newPrice } : i));
    setEditingItem(null);
    toast.success("تم تحديث السعر");
  };

  const activeOrders = orders.filter((o) => !["delivered", "cancelled"].includes(o.status));
  const completedOrders = orders.filter((o) => ["delivered", "cancelled"].includes(o.status));

  const newOrders = activeOrders.filter((o) => o.status === "pending");
  const inProgressOrders = activeOrders.filter((o) => o.status !== "pending");

  return (
    <DashboardShell role="restaurant" title="لوحة تحكم المطعم">
      <div dir="rtl">
        {/* Header nav */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-bold text-gray-800">لوحة التحكم</h2>
            <button onClick={() => setTab("settings")} className="text-sm font-medium text-blue-600 hover:underline">إدارة القائمة</button>
          </div>
          <button onClick={toggleOpen}
            className={`rounded-xl px-5 py-2 text-sm font-semibold transition-colors ${
              isOpen ? "bg-red-100 text-red-700 hover:bg-red-200" : "bg-green-600 text-white hover:bg-green-700"
            }`}>
            {isOpen ? "إغلاق المطعم" : "فتح المطعم"}
          </button>
        </div>

        {loading ? (
          <div className="flex flex-col items-center gap-3 rounded-xl bg-white py-16 shadow-sm dark:bg-gray-800">
            <Loader2 size={28} className="animate-spin text-green-500" />
            <p className="text-sm text-gray-400">جاري التحميل...</p>
          </div>
        ) : (
          <>
            {tab === "orders" && (
              <div className="space-y-8">
                {/* New Orders */}
                <div>
                  <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-gray-800 dark:text-gray-100">
                    <span className="h-3 w-3 rounded-full bg-yellow-400" />
                    طلبات جديدة ({newOrders.length})
                  </h3>
                  {newOrders.length === 0 ? (
                    <div className="rounded-xl bg-white py-8 text-center shadow-sm dark:bg-gray-800">
                      <p className="text-sm text-gray-400">لا توجد طلبات جديدة حالياً</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {newOrders.map((order) => {
                        const items = (order.items ?? []) as OrderItem[];
                        return (
                          <div key={order.id} className="rounded-xl bg-white p-5 shadow-sm dark:bg-gray-800">
                            <div className="mb-3 flex items-start justify-between">
                              <span className="rounded-full bg-yellow-100 px-3 py-1 text-xs font-semibold text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300">قيد الانتظار</span>
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
                                    <span className="text-gray-700 dark:text-gray-200">{it.name} × {it.quantity}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            <div className="mb-4 text-right">
                              <p className="text-xs text-gray-500">المبلغ:</p>
                              <p className="text-lg font-bold text-green-600">{Number(order.total_amount).toFixed(2)} ريال</p>
                            </div>
                            <button onClick={() => handleUpdateStatus(order.id, "accepted")} disabled={updatingId === order.id}
                              className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-3 text-sm font-bold text-white transition-colors hover:bg-green-700 disabled:opacity-50">
                              {updatingId === order.id ? <Loader2 size={14} className="animate-spin" /> : null}
                              قبول الطلب
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* In-Progress Orders */}
                <div>
                  <h3 className="mb-4 text-lg font-bold text-gray-800 dark:text-gray-100">طلبات قيد التنفيذ ({inProgressOrders.length})</h3>
                  {inProgressOrders.length === 0 ? (
                    <div className="rounded-xl bg-white py-8 text-center shadow-sm dark:bg-gray-800">
                      <p className="text-sm text-gray-400">لا توجد طلبات قيد التنفيذ</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {inProgressOrders.map((order) => {
                        const nextAction = NEXT_STATUS[order.status as keyof typeof NEXT_STATUS];
                        const items = (order.items ?? []) as OrderItem[];
                        const statusLabel = STATUS_LABELS[order.status] ?? order.status;
                        const statusColor = order.status === "preparing"
                          ? "bg-yellow-100 text-yellow-700"
                          : order.status === "ready_for_pickup"
                            ? "bg-purple-100 text-purple-700"
                            : "bg-blue-100 text-blue-700";

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
                                    <span className="text-gray-700 dark:text-gray-200">{it.name} × {it.quantity}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            <div className="mb-4 text-right">
                              <p className="text-xs text-gray-500">المبلغ:</p>
                              <p className="text-lg font-bold text-green-600">{Number(order.total_amount).toFixed(2)} ريال</p>
                            </div>
                            {nextAction && (
                              <button onClick={() => handleUpdateStatus(order.id, nextAction.next)} disabled={updatingId === order.id}
                                className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-gray-300 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700">
                                {updatingId === order.id ? <Loader2 size={14} className="animate-spin" /> : null}
                                تحديث إلى: {nextAction.label}
                              </button>
                            )}
                            {order.status === "ready_for_pickup" && !order.driver_id && (
                              <p className="mt-2 text-center text-xs text-purple-600">بانتظار سائق لاستلام الطلب...</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Completed Orders */}
                {completedOrders.length > 0 && (
                  <div>
                    <h3 className="mb-4 text-lg font-bold text-gray-800 dark:text-gray-100">طلبات مكتملة ({completedOrders.length})</h3>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {completedOrders.slice(0, 12).map((order) => {
                        const statusLabel = STATUS_LABELS[order.status] ?? order.status;
                        const statusColor = order.status === "delivered" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700";
                        return (
                          <div key={order.id} className="rounded-xl bg-white p-4 shadow-sm dark:bg-gray-800">
                            <div className="mb-2 flex items-center justify-between">
                              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${statusColor}`}>{statusLabel}</span>
                              <p className="font-mono text-sm font-bold text-gray-800 dark:text-gray-100">#{order.id.slice(0, 7)}</p>
                            </div>
                            <p className="text-xs text-gray-500">{new Date(order.created_at).toLocaleString("ar-SA")}</p>
                            <p className="mt-2 text-sm font-bold text-green-600">{Number(order.total_amount).toFixed(2)} ريال</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {tab === "settings" && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <button onClick={() => setTab("orders")} className="text-sm font-medium text-blue-600 hover:underline">— العودة للطلبات</button>
                  <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">إعدادات المطعم</h2>
                </div>

                {/* Restaurant Info */}
                <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800">
                  <h3 className="mb-4 text-base font-bold text-gray-800 dark:text-gray-100">بيانات المطعم</h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-gray-600">اسم المطعم</label>
                      <input value={restName} onChange={(e) => setRestName(e.target.value)}
                        className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-800 outline-none focus:border-green-400 focus:bg-white" />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-gray-600">نوع المطبخ</label>
                      <input value={restCuisine} onChange={(e) => setRestCuisine(e.target.value)} placeholder="عربي، إيطالي..."
                        className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-800 outline-none focus:border-green-400 focus:bg-white" />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-gray-600">خط العرض</label>
                      <input type="number" step="any" value={restLat} onChange={(e) => setRestLat(e.target.value)}
                        className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-800 outline-none focus:border-green-400 focus:bg-white" />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-gray-600">خط الطول</label>
                      <input type="number" step="any" value={restLng} onChange={(e) => setRestLng(e.target.value)}
                        className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-800 outline-none focus:border-green-400 focus:bg-white" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="mb-1.5 block text-xs font-semibold text-gray-600">وصف المطعم</label>
                      <textarea value={restDesc} onChange={(e) => setRestDesc(e.target.value)} rows={2}
                        className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-800 outline-none focus:border-green-400 focus:bg-white" />
                    </div>
                  </div>
                  <button onClick={handleSaveInfo} disabled={savingInfo}
                    className="mt-4 flex items-center gap-2 rounded-xl bg-green-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50">
                    {savingInfo ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    حفظ البيانات
                  </button>
                </div>

                {/* Menu Manager */}
                <div className="rounded-xl bg-white p-6 shadow-sm">
                  <div className="mb-4 flex items-center justify-between">
                    <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-bold text-green-700">{menuItems.length} وجبة</span>
                    <h3 className="text-base font-bold text-gray-800">إدارة القائمة</h3>
                  </div>

                  {/* Add new item */}
                  <div className="mb-6 rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <p className="mb-3 text-sm font-semibold text-gray-700">إضافة وجبة جديدة</p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <input value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} placeholder="اسم الوجبة"
                        className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 outline-none focus:border-green-400" />
                      <input value={newItem.description} onChange={(e) => setNewItem({ ...newItem, description: e.target.value })} placeholder="وصف (اختياري)"
                        className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 outline-none focus:border-green-400" />
                      <input type="number" step="0.01" value={newItem.price} onChange={(e) => setNewItem({ ...newItem, price: e.target.value })} placeholder="السعر (ريال)"
                        className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 outline-none focus:border-green-400" />
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
                        <Upload size={13} />
                        {menuImage ? menuImage.name : "رفع صورة"}
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => setMenuImage(e.target.files?.[0] ?? null)} />
                      </label>
                      <button onClick={handleAddMenuItem} disabled={addingItem}
                        className="flex items-center gap-1.5 rounded-xl bg-green-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50">
                        {addingItem ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                        إضافة
                      </button>
                    </div>
                  </div>

                  {/* Menu items list */}
                  {menuItems.length === 0 ? (
                    <div className="py-8 text-center">
                      <UtensilsCrossed size={36} className="mx-auto mb-2 text-gray-300" />
                      <p className="text-sm text-gray-400">لا توجد وجبات — أضف وجبتك الأولى</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {menuItems.map((item) => (
                        <div key={item.id} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50/50 px-4 py-3 hover:bg-gray-50">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-green-100 text-green-600">
                            {item.image_ufid ? <ImageIcon size={16} /> : <UtensilsCrossed size={16} />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-gray-800">{item.name}</p>
                            {item.description && <p className="text-xs text-gray-500">{item.description}</p>}
                          </div>

                          {editingItem === item.id ? (
                            <div className="flex items-center gap-1.5">
                              <input type="number" step="0.01" value={editPrice} onChange={(e) => setEditPrice(e.target.value)}
                                className="w-20 rounded-lg border border-green-300 px-2 py-1 text-sm text-gray-800 outline-none"
                                autoFocus onKeyDown={(e) => e.key === "Enter" && handleUpdatePrice(item.id)} />
                              <button onClick={() => handleUpdatePrice(item.id)} className="text-green-600 hover:text-green-700"><CheckCircle2 size={16} /></button>
                              <button onClick={() => setEditingItem(null)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
                            </div>
                          ) : (
                            <button onClick={() => { setEditingItem(item.id); setEditPrice(Number(item.price).toString()); }}
                              className="flex items-center gap-1 text-sm font-bold text-green-600 hover:text-green-700">
                              {Number(item.price).toFixed(2)} ريال <Edit3 size={12} />
                            </button>
                          )}

                          <button onClick={() => handleDeleteItem(item.id)} className="rounded-lg p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </DashboardShell>
  );
}
