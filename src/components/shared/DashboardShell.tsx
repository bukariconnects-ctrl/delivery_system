"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, User, ChevronDown } from "lucide-react";
import type { UserRole, UserProfile } from "@/types";
import { NotificationBell } from "./NotificationBell";
import { ThemeToggle } from "./ThemeToggle";
import { useSupabase } from "@/lib/supabase/provider";

interface DashboardShellProps {
  role: UserRole;
  title: string;
  children: React.ReactNode;
}

const roleColors: Record<UserRole, string> = {
  client: "bg-green-600",
  restaurant: "bg-orange-600",
  driver: "bg-blue-600",
  admin: "bg-purple-700",
};

const roleBg: Record<UserRole, string> = {
  client: "bg-blue-50 dark:bg-gray-900",
  restaurant: "bg-emerald-50 dark:bg-gray-900",
  driver: "bg-slate-100 dark:bg-gray-900",
  admin: "bg-gray-50 dark:bg-gray-900",
};

const roleLabels: Record<UserRole, string> = {
  client: "عميل",
  restaurant: "صاحب مطعم",
  driver: "سائق",
  admin: "مدير النظام",
};

export function DashboardShell({ role, title, children }: DashboardShellProps) {
  const router = useRouter();
  const { supabase, session } = useSupabase();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [showMenu, setShowMenu] = useState(false);

  useEffect(() => {
    if (!session?.user) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .single();
      if (data) setProfile(data);
    })();
  }, [supabase, session?.user]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/auth/login");
    router.refresh();
  };

  const displayName = profile?.full_name || session?.user?.email?.split("@")[0] || "مستخدم";

  return (
    <div className={`flex min-h-screen flex-col ${roleBg[role]}`}>
      <header
        className={`${roleColors[role]} px-6 py-4 text-white shadow-md`}
      >
        <div className="mx-auto flex max-w-5xl items-center gap-4">
          <h1 className="text-lg font-bold">{title}</h1>
          <div className="ml-auto flex items-center gap-3">
            <ThemeToggle />
            <NotificationBell />
            <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-medium uppercase">
              {role} node
            </span>

            {/* User profile dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowMenu((v) => !v)}
                className="flex items-center gap-2 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-white/25"
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white/25">
                  <User size={13} />
                </div>
                <div className="hidden text-right sm:block">
                  <p className="text-xs font-bold leading-tight">{displayName}</p>
                  <p className="text-[10px] opacity-80">{roleLabels[role]}</p>
                </div>
                <ChevronDown size={12} className={`transition-transform ${showMenu ? "rotate-180" : ""}`} />
              </button>

              {showMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                  <div className="absolute left-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800" dir="rtl">
                    {/* User info */}
                    <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-700">
                      <p className="text-sm font-bold text-gray-800 dark:text-gray-100">{displayName}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{session?.user?.email}</p>
                      <span className={`mt-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold text-white ${roleColors[role]}`}>
                        {roleLabels[role]}
                      </span>
                    </div>
                    {/* Actions */}
                    <div className="py-1">
                      <button
                        onClick={() => { setShowMenu(false); router.push("/dashboard/profile"); }}
                        className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
                      >
                        <User size={14} />
                        الملف الشخصي
                      </button>
                      <button
                        onClick={() => { setShowMenu(false); handleLogout(); }}
                        className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                      >
                        <LogOut size={14} />
                        تسجيل خروج
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>
      <main className="flex-1 px-6 py-8">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
