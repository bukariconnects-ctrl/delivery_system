"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { DashboardShell } from "@/components/shared/DashboardShell";
import { useSupabase } from "@/lib/supabase/provider";
import {
  Phone,
  MapPin,
  Plus,
  Trash2,
  CheckCircle2,
  Loader2,
  User,
} from "lucide-react";
import toast from "react-hot-toast";

// ============================================
// Client Node Onboarding — Setup Page
// (Lecture 9: Identity Provisioning)
// ============================================

interface SavedAddress {
  label: string;
  latitude: number;
  longitude: number;
}

export default function ClientSetup() {
  const { supabase, session } = useSupabase();
  const router = useRouter();

  const [phone, setPhone] = useState("");
  const [fullName, setFullName] = useState("");
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [newAddr, setNewAddr] = useState({ label: "", latitude: "", longitude: "" });
  const [saving, setSaving] = useState(false);

  // Load existing profile data
  useEffect(() => {
    if (!session?.user) return;
    (async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, phone_number, address_metadata")
        .eq("id", session.user.id)
        .single();

      if (profile) {
        setFullName(profile.full_name ?? "");
        setPhone(profile.phone_number ?? "");
        const meta = (profile.address_metadata as Record<string, unknown>) ?? {};
        if (Array.isArray(meta.addresses)) {
          setAddresses(meta.addresses as SavedAddress[]);
        }
      }
    })();
  }, [supabase, session?.user]);

  const handleAddAddress = () => {
    if (!newAddr.label.trim()) { toast.error("أدخل اسم العنوان"); return; }
    setAddresses((prev) => [
      ...prev,
      {
        label: newAddr.label.trim(),
        latitude: parseFloat(newAddr.latitude) || 0,
        longitude: parseFloat(newAddr.longitude) || 0,
      },
    ]);
    setNewAddr({ label: "", latitude: "", longitude: "" });
  };

  const handleRemoveAddress = (index: number) => {
    setAddresses((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!session?.user) return;
    setSaving(true);

    await supabase
      .from("profiles")
      .update({
        full_name: fullName.trim() || null,
        phone_number: phone.trim() || null,
        address_metadata: { addresses },
        updated_at: new Date().toISOString(),
      })
      .eq("id", session.user.id);

    toast.success("تم حفظ بياناتك");
    setSaving(false);
  };

  const handleComplete = async () => {
    await handleSave();
    toast.success("تم إعداد الحساب");
    router.push("/dashboard/client");
  };

  return (
    <DashboardShell role="client" title="إعداد حساب العميل — Node Initialization">
      <div className="space-y-8">
        {/* ── Basic Info ── */}
        <section className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
          <div className="mb-4 flex items-center gap-2 text-green-600">
            <User size={20} />
            <h2 className="text-lg font-semibold">البيانات الأساسية</h2>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">الاسم الكامل</label>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="الاسم الكامل"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-green-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                <Phone size={12} className="inline" /> رقم الهاتف
              </label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+966 5XX XXX XXXX"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-green-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
            </div>
          </div>

          <button onClick={handleSave} disabled={saving}
            className="mt-4 rounded-lg bg-green-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50">
            {saving ? <Loader2 size={16} className="inline animate-spin" /> : null}
            {saving ? " جاري الحفظ..." : "حفظ البيانات"}
          </button>
        </section>

        {/* ── Saved Addresses ── */}
        <section className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
          <div className="mb-4 flex items-center gap-2 text-green-600">
            <MapPin size={20} />
            <h2 className="text-lg font-semibold">عناوين التوصيل المحفوظة</h2>
            <span className="ml-auto text-xs text-gray-400">{addresses.length} عنوان</span>
          </div>

          {/* Add new address */}
          <div className="mb-4 rounded-lg border border-dashed border-green-300 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950/20">
            <p className="mb-3 text-sm font-medium text-green-700 dark:text-green-300">إضافة عنوان جديد</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <input value={newAddr.label} onChange={(e) => setNewAddr({ ...newAddr, label: e.target.value })} placeholder="اسم العنوان (مثال: المنزل)"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
              <input type="number" step="any" value={newAddr.latitude} onChange={(e) => setNewAddr({ ...newAddr, latitude: e.target.value })} placeholder="خط العرض"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
              <input type="number" step="any" value={newAddr.longitude} onChange={(e) => setNewAddr({ ...newAddr, longitude: e.target.value })} placeholder="خط الطول"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
            </div>
            <button onClick={handleAddAddress}
              className="mt-3 flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700">
              <Plus size={14} />
              إضافة عنوان
            </button>
          </div>

          {/* Existing addresses */}
          {addresses.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-400">لا توجد عناوين محفوظة</p>
          ) : (
            <div className="space-y-2">
              {addresses.map((addr, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg bg-gray-50 px-4 py-3 dark:bg-gray-800">
                  <MapPin size={16} className="shrink-0 text-green-500" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800 dark:text-white">{addr.label}</p>
                    <p className="text-xs font-mono text-gray-400">{addr.latitude.toFixed(4)}, {addr.longitude.toFixed(4)}</p>
                  </div>
                  <button onClick={() => handleRemoveAddress(i)} className="text-red-400 hover:text-red-600">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Complete Setup */}
        <button onClick={handleComplete}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-green-700">
          <CheckCircle2 size={18} />
          إكمال الإعداد
        </button>

        <p className="text-center text-[10px] text-gray-400">
          Client Node Initialization • Identity Provisioning (Lecture 9) • Address Metadata (JSONB)
        </p>
      </div>
    </DashboardShell>
  );
}
