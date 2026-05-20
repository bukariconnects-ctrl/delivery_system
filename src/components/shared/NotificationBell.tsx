"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Bell, X, Check } from "lucide-react";
import { useSupabase } from "@/lib/supabase/provider";
import { getRealtimeService } from "@/lib/supabase/realtime-service";

// ============================================
// Indirect Communication: Pub-Sub Notification
// (Lecture 5, Slide 24, 30, 37)
//
// Subscribers receive messages without any direct
// coupling to the publisher. Space + Time uncoupled.
//
// - Publisher: DB triggers / RPC functions insert
//   rows into the 'notifications' table.
// - Subscriber: This component listens via Supabase
//   Realtime (Postgres Changes) and renders alerts.
// ============================================

interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
}

export function NotificationBell() {
  const { supabase, session } = useSupabase();
  const serviceRef = useRef(getRealtimeService(supabase));

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  // Fetch existing unread notifications on mount
  useEffect(() => {
    if (!session?.user) return;

    const fetchNotifications = async () => {
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false })
        .limit(20);

      if (data) setNotifications(data as Notification[]);
    };

    fetchNotifications();
  }, [supabase, session?.user]);

  // Subscribe to new notifications via Realtime (Pub-Sub)
  useEffect(() => {
    if (!session?.user) return;

    let cancelled = false;
    const svc = serviceRef.current;
    const channelName = `notif:${session.user.id}`;

    // Small delay lets Strict Mode cleanup run before re-subscribe
    const timer = setTimeout(() => {
      if (cancelled) return;
      svc.subscribeTable(
        channelName,
        "notifications",
        "INSERT",
        (payload) => {
          if (cancelled) return;
          const row = payload.new as Notification;
          if (row.user_id === session.user.id) {
            setNotifications((prev) => [row, ...prev.slice(0, 49)]);
          }
        },
        `user_id=eq.${session.user.id}`
      );
    }, 50);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      svc.removeChannel(channelName);
    };
  }, [session?.user]);

  // Mark a single notification as read
  const markAsRead = useCallback(
    async (id: string) => {
      await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", id);

      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
    },
    [supabase]
  );

  // Mark all as read
  const markAllRead = useCallback(async () => {
    if (!session?.user) return;

    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", session.user.id)
      .eq("is_read", false);

    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  }, [supabase, session?.user]);

  // Don't render if not logged in
  if (!session?.user) return null;

  return (
    <div className="relative">
      {/* Bell Button */}
      <button
        onClick={() => setOpen(!open)}
        className="relative rounded-full p-2 text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {open && (
        <div className="absolute right-0 top-12 z-50 w-80 rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-800">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              الإشعارات
            </h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-xs text-blue-600 hover:underline"
                >
                  قراءة الكل
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Notification List */}
          <div className="max-h-72 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-gray-400">
                لا توجد إشعارات
              </p>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`flex items-start gap-3 border-b border-gray-50 px-4 py-3 transition-colors dark:border-gray-800 ${
                    n.is_read
                      ? "bg-white dark:bg-gray-900"
                      : "bg-blue-50 dark:bg-blue-950/30"
                  }`}
                >
                  {/* Type indicator */}
                  <div
                    className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
                      n.is_read ? "bg-gray-300" : "bg-blue-500"
                    }`}
                  />

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {n.title}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {n.message}
                    </p>
                    <p className="mt-1 text-[10px] text-gray-400">
                      {new Date(n.created_at).toLocaleTimeString("ar-SA")}
                      <span className="mx-1">•</span>
                      <span className="font-mono text-gray-300">{n.type}</span>
                    </p>
                  </div>

                  {/* Mark as read */}
                  {!n.is_read && (
                    <button
                      onClick={() => markAsRead(n.id)}
                      className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-green-600 dark:hover:bg-gray-800"
                    >
                      <Check size={14} />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-gray-100 px-4 py-2 dark:border-gray-800">
            <p className="text-center text-[10px] text-gray-400">
              Pub-Sub • Indirect Communication • Message Queue
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
