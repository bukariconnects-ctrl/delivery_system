"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSupabase } from "@/lib/supabase/provider";
import { DashboardShell } from "@/components/shared/DashboardShell";
import {
  User,
  Mail,
  Phone,
  Shield,
  MapPin,
  Car,
  Save,
  Loader2,
  ArrowRight,
  Calendar,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import toast from "react-hot-toast";
import type { UserRole, UserProfile } from "@/types";

const roleLabels: Record<UserRole, string> = {
  client: "عميل",
  restaurant: "صاحب مطعم",
  driver: "سائق",
  admin: "مدير النظام",
};

const roleColors: Record<UserRole, string> = {
  client: "bg-green-100 text-green-700",
  restaurant: "bg-orange-100 text-orange-700",
  driver: "bg-blue-100 text-blue-700",
  admin: "bg-purple-100 text-purple-700",
};

export default function ProfilePage() {
  const { supabase, session } = useSupabase();
  const router = useRouter();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Editable fields
  const [fullName, setFullName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");

  useEffect(() => {
    if (!session?.user) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .single();
      if (data) {
        setProfile(data);
        setFullName(data.full_name || "");
        setPhoneNumber(data.phone_number || "");
      }
      setLoading(false);
    })();
  }, [supabase, session?.user]);

  const handleSave = async () => {
    if (!session?.user) return;
    setSaving(true);

    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName.trim() || null,
        phone_number: phoneNumber.trim() || null,
      })
      .eq("id", session.user.id);

    if (error) {
      toast.error("فشل حفظ البيانات: " + error.message);
    } else {
      toast.success("تم حفظ الملف الشخصي بنجاح");
      setProfile((prev) => prev ? { ...prev, full_name: fullName.trim() || null, phone_number: phoneNumber.trim() || null } : prev);
    }
    setSaving(false);
  };

  const role = (profile?.role ?? "client") as UserRole;

  const dashboardRoutes: Record<UserRole, string> = {
    client: "/dashboard/client",
    restaurant: "/dashboard/restaurant",
    driver: "/dashboard/driver",
    admin: "/dashboard/admin",
  };

  if (loading) {
    return (
      <DashboardShell role={role} title="الملف الشخصي">
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin text-gray-400" />
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell role={role} title="الملف الشخصي">
      <div dir="rtl" className="space-y-6">
        {/* Back button */}
        <button
          onClick={() => router.push(dashboardRoutes[role])}
          className="flex items-center gap-2 text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
        >
          <ArrowRight size={16} />
          العودة إلى لوحة التحكم
        </button>

        {/* Profile header card */}
        <div className="relative overflow-hidden rounded-2xl bg-white shadow-sm dark:bg-gray-800">
          <div className={`h-24 ${
            role === "client" ? "bg-gradient-to-l from-green-500 to-emerald-600" :
            role === "restaurant" ? "bg-gradient-to-l from-orange-500 to-red-500" :
            role === "driver" ? "bg-gradient-to-l from-blue-500 to-indigo-600" :
            "bg-gradient-to-l from-purple-600 to-violet-700"
          }`} />
          <div className="px-6 pb-6">
            <div className="-mt-10 flex items-end gap-4">
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl border-4 border-white bg-gray-100 shadow-lg dark:border-gray-800 dark:bg-gray-700">
                <User size={36} className="text-gray-400 dark:text-gray-300" />
              </div>
              <div className="mb-1 flex-1">
                <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">
                  {profile?.full_name || session?.user?.email?.split("@")[0] || "مستخدم"}
                </h2>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${roleColors[role]}`}>
                    {roleLabels[role]}
                  </span>
                  {profile?.is_verified ? (
                    <span className="flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-bold text-green-700">
                      <CheckCircle2 size={12} /> موثّق
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-bold text-yellow-700">
                      <XCircle size={12} /> غير موثّق
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Info cards grid */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Account info (read-only) */}
          <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800">
            <h3 className="mb-4 flex items-center gap-2 text-base font-bold text-gray-800 dark:text-gray-100">
              <Shield size={18} className="text-blue-500" />
              معلومات الحساب
            </h3>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">البريد الإلكتروني</label>
                <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-4 py-2.5 dark:bg-gray-700">
                  <Mail size={14} className="text-gray-400" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">{session?.user?.email}</span>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">معرّف المستخدم (Node ID)</label>
                <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-4 py-2.5 dark:bg-gray-700">
                  <span className="font-mono text-xs text-gray-500 dark:text-gray-400">{session?.user?.id}</span>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">نوع العقدة</label>
                <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-4 py-2.5 dark:bg-gray-700">
                  <User size={14} className="text-gray-400" />
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{roleLabels[role]}</span>
                  <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-mono uppercase text-gray-500 dark:bg-gray-600 dark:text-gray-400">{role} node</span>
                </div>
              </div>
              {profile?.updated_at && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">آخر تحديث</label>
                  <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-4 py-2.5 dark:bg-gray-700">
                    <Calendar size={14} className="text-gray-400" />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      {new Date(profile.updated_at).toLocaleString("ar-SA")}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Editable personal info */}
          <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800">
            <h3 className="mb-4 flex items-center gap-2 text-base font-bold text-gray-800 dark:text-gray-100">
              <User size={18} className="text-green-500" />
              البيانات الشخصية
            </h3>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">الاسم الكامل</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="أدخل اسمك الكامل"
                  className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:focus:ring-blue-900"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">رقم الهاتف</label>
                <div className="relative">
                  <Phone size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="05xxxxxxxx"
                    dir="ltr"
                    className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 pr-10 text-sm text-gray-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:focus:ring-blue-900"
                  />
                </div>
              </div>

              {/* Driver-specific: vehicle details */}
              {role === "driver" && profile?.vehicle_details && Object.keys(profile.vehicle_details).length > 0 && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">بيانات المركبة</label>
                  <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-700">
                    <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                      <Car size={14} className="text-blue-400" />
                      <span>{(profile.vehicle_details as any).type ?? "—"}</span>
                      <span className="text-gray-400">|</span>
                      <span>{(profile.vehicle_details as any).plate ?? "—"}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Address metadata */}
              {profile?.address_metadata && Object.keys(profile.address_metadata).length > 0 && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">العنوان</label>
                  <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-700">
                    <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                      <MapPin size={14} className="text-red-400" />
                      <span>{(profile.address_metadata as any).city ?? ""} {(profile.address_metadata as any).street ?? ""}</span>
                    </div>
                  </div>
                </div>
              )}

              <button
                onClick={handleSave}
                disabled={saving}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-bold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {saving ? "جاري الحفظ..." : "حفظ التغييرات"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
