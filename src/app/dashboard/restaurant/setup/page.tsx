"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import dynamicImport from "next/dynamic";
import { DashboardShell } from "@/components/shared/DashboardShell";
import { useSupabase } from "@/lib/supabase/provider";
import { DFSClient } from "@/lib/supabase/dfs-client";
import {
  Store,
  MapPin,
  UtensilsCrossed,
  Plus,
  Trash2,
  Upload,
  Image as ImageIcon,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import toast from "react-hot-toast";
import type { MenuItem } from "@/types";

const LocationPicker = dynamicImport(
  () => import("@/components/shared/LocationPicker").then((mod) => mod.LocationPicker),
  { ssr: false, loading: () => <div className="h-[300px] rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center"><p className="text-sm text-gray-400">جاري تحميل الخريطة...</p></div> }
);

// ============================================
// Restaurant Node Onboarding — Setup Page
// (Lecture 10: DFS — Hierarchical namespace for menu images)
// (Lecture 9: Identity Provisioning)
// ============================================

export default function RestaurantSetup() {
  const { supabase, session } = useSupabase();
  const router = useRouter();
  const dfs = new DFSClient(supabase);

  // Restaurant info state
  const [name, setName] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [cuisine, setCuisine] = useState("");
  const [description, setDescription] = useState("");
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Menu state
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [newItem, setNewItem] = useState({ name: "", description: "", price: "" });
  const [menuImage, setMenuImage] = useState<File | null>(null);
  const [addingItem, setAddingItem] = useState(false);

  // Load existing restaurant data
  useEffect(() => {
    if (!session?.user) return;
    (async () => {
      const { data: rest } = await supabase
        .from("restaurants")
        .select("*")
        .eq("owner_id", session.user.id)
        .single();

      if (rest) {
        setRestaurantId(rest.id);
        setName(rest.name);
        setLatitude(rest.latitude?.toString() ?? "");
        setLongitude(rest.longitude?.toString() ?? "");
        setCuisine(rest.cuisine_type ?? "");
        setDescription(rest.description ?? "");

        // Load menu items
        const { data: items } = await supabase
          .from("menu_items")
          .select("*")
          .eq("restaurant_id", rest.id)
          .order("created_at", { ascending: false });
        if (items) setMenuItems(items);
      }
    })();
  }, [supabase, session?.user]);

  // Save restaurant info
  const handleSaveRestaurant = async () => {
    if (!session?.user) return;
    if (!name.trim()) { toast.error("أدخل اسم المطعم"); return; }

    setSaving(true);
    const payload = {
      owner_id: session.user.id,
      name: name.trim(),
      latitude: parseFloat(latitude) || 0,
      longitude: parseFloat(longitude) || 0,
      cuisine_type: cuisine.trim() || null,
      description: description.trim() || null,
    };

    if (restaurantId) {
      await supabase.from("restaurants").update(payload).eq("id", restaurantId);
    } else {
      const { data } = await supabase.from("restaurants").insert(payload).select("id").single();
      if (data) setRestaurantId(data.id);
    }

    // Update profile phone/address if needed
    await supabase.from("profiles").update({ updated_at: new Date().toISOString() }).eq("id", session.user.id);

    toast.success("تم حفظ بيانات المطعم");
    setSaving(false);
  };

  // Add menu item with DFS image upload
  const handleAddMenuItem = async () => {
    if (!restaurantId) { toast.error("احفظ بيانات المطعم أولاً"); return; }
    if (!newItem.name.trim()) { toast.error("أدخل اسم الوجبة"); return; }

    setAddingItem(true);
    let imageUfid: string | null = null;

    // Upload image to DFS: delivery-dfs/restaurants/{id}/menu/{ufid}
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

    if (error) {
      toast.error(error.message);
    } else if (data) {
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

  // Complete setup
  const handleCompleteSetup = () => {
    if (!restaurantId) { toast.error("احفظ بيانات المطعم أولاً"); return; }
    toast.success("تم إعداد المطعم — بانتظار التحقق من المدير");
    router.push("/dashboard/restaurant");
  };

  return (
    <DashboardShell role="restaurant" title="إعداد المطعم — Node Initialization">
      <div className="space-y-8">
        {/* ── Restaurant Info ── */}
        <section className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
          <div className="mb-4 flex items-center gap-2 text-orange-600">
            <Store size={20} />
            <h2 className="text-lg font-semibold">بيانات المطعم</h2>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">اسم المطعم</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="اسم المطعم"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-orange-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">نوع المطبخ</label>
              <input value={cuisine} onChange={(e) => setCuisine(e.target.value)} placeholder="مثال: عربي، إيطالي، هندي"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-orange-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-2 flex items-center gap-1 text-sm font-medium text-gray-700 dark:text-gray-300">
                <MapPin size={14} /> موقع المطعم على الخريطة
              </label>
              <LocationPicker
                initialLat={parseFloat(latitude) || 24.7136}
                initialLng={parseFloat(longitude) || 46.6753}
                onLocationChange={(lat, lng) => {
                  setLatitude(lat.toString());
                  setLongitude(lng.toString());
                }}
                height="300px"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">وصف المطعم</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="وصف قصير للمطعم..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-orange-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
            </div>
          </div>

          <button onClick={handleSaveRestaurant} disabled={saving}
            className="mt-4 rounded-lg bg-orange-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-orange-700 disabled:opacity-50">
            {saving ? <Loader2 size={16} className="inline animate-spin" /> : null}
            {saving ? " جاري الحفظ..." : "حفظ البيانات"}
          </button>
        </section>

        {/* ── Menu Manager ── */}
        <section className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
          <div className="mb-4 flex items-center gap-2 text-orange-600">
            <UtensilsCrossed size={20} />
            <h2 className="text-lg font-semibold">إدارة القائمة (Menu)</h2>
            <span className="ml-auto text-xs text-gray-400">{menuItems.length} وجبة</span>
          </div>

          {/* Add new item form */}
          <div className="mb-4 rounded-lg border border-dashed border-orange-300 bg-orange-50 p-4 dark:border-orange-800 dark:bg-orange-950/20">
            <p className="mb-3 text-sm font-medium text-orange-700 dark:text-orange-300">إضافة وجبة جديدة</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <input value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} placeholder="اسم الوجبة"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
              <input value={newItem.description} onChange={(e) => setNewItem({ ...newItem, description: e.target.value })} placeholder="وصف (اختياري)"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
              <input type="number" step="0.01" value={newItem.price} onChange={(e) => setNewItem({ ...newItem, price: e.target.value })} placeholder="السعر (SAR)"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
            </div>
            <div className="mt-3 flex items-center gap-3">
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300">
                <Upload size={14} />
                {menuImage ? menuImage.name : "رفع صورة (DFS)"}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => setMenuImage(e.target.files?.[0] ?? null)} />
              </label>
              <button onClick={handleAddMenuItem} disabled={addingItem}
                className="flex items-center gap-1.5 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50">
                {addingItem ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                إضافة
              </button>
            </div>
          </div>

          {/* Existing menu items */}
          {menuItems.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">لا توجد وجبات بعد — أضف وجبتك الأولى</p>
          ) : (
            <div className="space-y-2">
              {menuItems.map((item) => (
                <div key={item.id} className="flex items-center gap-3 rounded-lg bg-gray-50 px-4 py-3 dark:bg-gray-800">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-100 text-orange-600 dark:bg-orange-900 dark:text-orange-300">
                    {item.image_ufid ? <ImageIcon size={16} /> : <UtensilsCrossed size={16} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800 dark:text-white">{item.name}</p>
                    {item.description && <p className="text-xs text-gray-500">{item.description}</p>}
                    {item.image_ufid && <p className="text-[10px] font-mono text-gray-400">UFID: {item.image_ufid.slice(0, 24)}...</p>}
                  </div>
                  <span className="text-sm font-bold text-gray-700 dark:text-gray-300">{Number(item.price).toFixed(2)} SAR</span>
                  <button onClick={() => handleDeleteItem(item.id)} className="text-red-400 hover:text-red-600">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Complete Setup */}
        <button onClick={handleCompleteSetup}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-green-700">
          <CheckCircle2 size={18} />
          إكمال الإعداد وإرسال للتحقق
        </button>

        <p className="text-center text-[10px] text-gray-400">
          Node Initialization • DFS Hierarchical Storage (delivery-dfs/restaurants/&#123;id&#125;/menu/) • Identity Provisioning (Lecture 9)
        </p>
      </div>
    </DashboardShell>
  );
}
