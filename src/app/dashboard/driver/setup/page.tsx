"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { DashboardShell } from "@/components/shared/DashboardShell";
import { useSupabase } from "@/lib/supabase/provider";
import { DFSClient } from "@/lib/supabase/dfs-client";
import {
  Car,
  FileText,
  Upload,
  CheckCircle2,
  Loader2,
  CreditCard,
  Shield,
} from "lucide-react";
import toast from "react-hot-toast";

// ============================================
// Driver Node Onboarding — Setup Page
// (Lecture 10: DFS — Identity document storage)
// (Lecture 9: Identity Provisioning — credential upload)
// ============================================

export default function DriverSetup() {
  const { supabase, session } = useSupabase();
  const router = useRouter();
  const dfs = new DFSClient(supabase);

  // Vehicle info
  const [vehicleModel, setVehicleModel] = useState("");
  const [plateNumber, setPlateNumber] = useState("");

  // Document uploads
  const [licenseFile, setLicenseFile] = useState<File | null>(null);
  const [idFile, setIdFile] = useState<File | null>(null);
  const [licenseUfid, setLicenseUfid] = useState<string | null>(null);
  const [idUfid, setIdUfid] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Load existing profile data
  useEffect(() => {
    if (!session?.user) return;
    (async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("vehicle_details, id_document_ufid")
        .eq("id", session.user.id)
        .single();

      if (profile) {
        const vd = (profile.vehicle_details as Record<string, string>) ?? {};
        setVehicleModel(vd.model ?? "");
        setPlateNumber(vd.plate_number ?? "");
        if (profile.id_document_ufid) setIdUfid(profile.id_document_ufid);

        // Check for license ufid in vehicle_details
        if (vd.license_ufid) setLicenseUfid(vd.license_ufid);
      }
    })();
  }, [supabase, session?.user]);

  // Upload documents to DFS: delivery-dfs/drivers/{id}/identity/
  const handleUploadDocuments = async () => {
    if (!session?.user) return;
    if (!licenseFile && !idFile) {
      toast.error("اختر ملفاً واحداً على الأقل");
      return;
    }

    setUploading(true);

    // Upload license
    if (licenseFile) {
      const result = await dfs.upload("drivers", session.user.id, "identity", licenseFile);
      if ("error" in result) {
        toast.error(`فشل رفع الرخصة: ${result.error}`);
        setUploading(false);
        return;
      }
      setLicenseUfid(result.ufid);
      toast.success("تم رفع رخصة القيادة");
    }

    // Upload ID
    if (idFile) {
      const result = await dfs.upload("drivers", session.user.id, "identity", idFile);
      if ("error" in result) {
        toast.error(`فشل رفع الهوية: ${result.error}`);
        setUploading(false);
        return;
      }
      setIdUfid(result.ufid);
      toast.success("تم رفع الهوية");
    }

    setUploading(false);
  };

  // Save all driver data
  const handleSave = async () => {
    if (!session?.user) return;
    if (!vehicleModel.trim() || !plateNumber.trim()) {
      toast.error("أدخل بيانات المركبة");
      return;
    }

    setSaving(true);

    const vehicleDetails: Record<string, string> = {
      model: vehicleModel.trim(),
      plate_number: plateNumber.trim(),
    };
    if (licenseUfid) vehicleDetails.license_ufid = licenseUfid;

    await supabase
      .from("profiles")
      .update({
        vehicle_details: vehicleDetails,
        id_document_ufid: idUfid,
        updated_at: new Date().toISOString(),
      })
      .eq("id", session.user.id);

    // Also ensure driver_locations row exists
    await supabase
      .from("driver_locations")
      .upsert({
        driver_id: session.user.id,
        current_latitude: 0,
        current_longitude: 0,
        is_online: false,
      });

    toast.success("تم حفظ بيانات السائق");
    setSaving(false);
  };

  // Complete setup
  const handleComplete = () => {
    if (!vehicleModel.trim() || !plateNumber.trim()) {
      toast.error("أكمل بيانات المركبة أولاً");
      return;
    }
    toast.success("تم إعداد السائق — بانتظار التحقق من المدير");
    router.push("/dashboard/driver");
  };

  return (
    <DashboardShell role="driver" title="إعداد السائق — Node Initialization">
      <div className="space-y-8">
        {/* ── Vehicle Information ── */}
        <section className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
          <div className="mb-4 flex items-center gap-2 text-blue-600">
            <Car size={20} />
            <h2 className="text-lg font-semibold">بيانات المركبة</h2>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">موديل المركبة</label>
              <input value={vehicleModel} onChange={(e) => setVehicleModel(e.target.value)} placeholder="مثال: Toyota Camry 2023"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">رقم اللوحة</label>
              <input value={plateNumber} onChange={(e) => setPlateNumber(e.target.value)} placeholder="مثال: ABC 1234"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
            </div>
          </div>

          <button onClick={handleSave} disabled={saving}
            className="mt-4 rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50">
            {saving ? <Loader2 size={16} className="inline animate-spin" /> : null}
            {saving ? " جاري الحفظ..." : "حفظ بيانات المركبة"}
          </button>
        </section>

        {/* ── Identity Documents (DFS Upload) ── */}
        <section className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
          <div className="mb-4 flex items-center gap-2 text-blue-600">
            <Shield size={20} />
            <h2 className="text-lg font-semibold">وثائق الهوية — DFS Upload</h2>
          </div>
          <p className="mb-4 text-xs text-gray-500">
            يتم تخزين الملفات بمعرّفات UFID فريدة في: <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">delivery-dfs/drivers/&#123;id&#125;/identity/</code>
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* License upload */}
            <div className="rounded-lg border border-dashed border-blue-300 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950/20">
              <div className="mb-2 flex items-center gap-2 text-blue-700 dark:text-blue-300">
                <CreditCard size={16} />
                <span className="text-sm font-medium">رخصة القيادة</span>
              </div>
              {licenseUfid ? (
                <div className="rounded bg-green-50 px-3 py-2 text-xs text-green-700 dark:bg-green-900/30 dark:text-green-300">
                  <CheckCircle2 size={12} className="mb-0.5 inline" /> تم الرفع
                  <p className="mt-1 font-mono text-[10px] text-gray-400">UFID: {licenseUfid.slice(0, 28)}...</p>
                </div>
              ) : (
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300">
                  <Upload size={14} />
                  {licenseFile ? licenseFile.name : "اختر ملف الرخصة"}
                  <input type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => setLicenseFile(e.target.files?.[0] ?? null)} />
                </label>
              )}
            </div>

            {/* ID upload */}
            <div className="rounded-lg border border-dashed border-blue-300 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950/20">
              <div className="mb-2 flex items-center gap-2 text-blue-700 dark:text-blue-300">
                <FileText size={16} />
                <span className="text-sm font-medium">بطاقة الهوية</span>
              </div>
              {idUfid ? (
                <div className="rounded bg-green-50 px-3 py-2 text-xs text-green-700 dark:bg-green-900/30 dark:text-green-300">
                  <CheckCircle2 size={12} className="mb-0.5 inline" /> تم الرفع
                  <p className="mt-1 font-mono text-[10px] text-gray-400">UFID: {idUfid.slice(0, 28)}...</p>
                </div>
              ) : (
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300">
                  <Upload size={14} />
                  {idFile ? idFile.name : "اختر ملف الهوية"}
                  <input type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => setIdFile(e.target.files?.[0] ?? null)} />
                </label>
              )}
            </div>
          </div>

          {(!licenseUfid || !idUfid) && (
            <button onClick={handleUploadDocuments} disabled={uploading || (!licenseFile && !idFile)}
              className="mt-4 flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50">
              {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              {uploading ? "جاري الرفع..." : "رفع المستندات إلى DFS"}
            </button>
          )}
        </section>

        {/* Complete Setup */}
        <button onClick={handleComplete}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-green-700">
          <CheckCircle2 size={18} />
          إكمال الإعداد وإرسال للتحقق
        </button>

        <p className="text-center text-[10px] text-gray-400">
          Node Initialization • DFS Identity Storage (delivery-dfs/drivers/&#123;id&#125;/identity/) • UFID • Lecture 9 & 10
        </p>
      </div>
    </DashboardShell>
  );
}
