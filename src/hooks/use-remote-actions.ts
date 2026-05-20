"use client";

import { useState, useCallback, useRef } from "react";
import { useSupabase } from "@/lib/supabase/provider";
import toast from "react-hot-toast";

// ============================================
// Remote Invocation: RPC Wrappers
// (Lecture 5, Slide 3, 12, 17)
//
// Request-Reply pattern over Supabase .rpc()
// with "At-most-once" invocation semantics:
// — The UI prevents duplicate submissions while
//   a request is in-flight (pending guard).
// ============================================

/** Standard RPC response shape returned by our PG functions */
interface RpcResult {
  success: boolean;
  error?: string;
  message?: string;
  order_id?: string;
  driver_id?: string;
}

// ---- Generic at-most-once guard ----

/**
 * Wraps an async action so it can only run once at a time.
 * Provides `pending` state for UI feedback and prevents
 * duplicate invocations (at-most-once semantics).
 */
function useAtMostOnce<TArgs extends unknown[], TReturn>(
  action: (...args: TArgs) => Promise<TReturn>
) {
  const [pending, setPending] = useState(false);
  const lockRef = useRef(false);

  const execute = useCallback(
    async (...args: TArgs): Promise<TReturn | null> => {
      // At-most-once guard: reject if already in-flight
      if (lockRef.current) {
        toast.error("العملية قيد التنفيذ — انتظر قليلاً");
        return null;
      }

      lockRef.current = true;
      setPending(true);

      try {
        const result = await action(...args);
        return result;
      } finally {
        lockRef.current = false;
        setPending(false);
      }
    },
    [action]
  );

  return { execute, pending };
}

// ---- place_order RPC ----

interface PlaceOrderParams {
  restaurantId: string;
  items: Record<string, unknown>[];
  total: number;
}

export function usePlaceOrder() {
  const { supabase } = useSupabase();

  const placeOrderAction = useCallback(
    async (params: PlaceOrderParams): Promise<RpcResult> => {
      const { data, error } = await supabase.rpc("place_order", {
        p_restaurant_id: params.restaurantId,
        p_items: params.items,
        p_total: params.total,
      });

      if (error) {
        toast.error(`RPC Error: ${error.message}`);
        return { success: false, error: error.message };
      }

      const result = data as RpcResult;
      if (result.success) {
        toast.success(result.message ?? "تم إنشاء الطلب");
      } else {
        toast.error(result.error ?? "فشل إنشاء الطلب");
      }
      return result;
    },
    [supabase]
  );

  const { execute, pending } = useAtMostOnce(placeOrderAction);

  return {
    placeOrder: execute,
    placing: pending,
  };
}

// ---- accept_order RPC ----

export function useAcceptOrder() {
  const { supabase, session } = useSupabase();

  const acceptOrderAction = useCallback(
    async (orderId: string): Promise<RpcResult> => {
      if (!session?.user) {
        toast.error("يجب تسجيل الدخول أولاً");
        return { success: false, error: "Not authenticated" };
      }

      const { data, error } = await supabase.rpc("accept_order", {
        p_order_id: orderId,
        p_driver_id: session.user.id,
      });

      if (error) {
        toast.error(`RPC Error: ${error.message}`);
        return { success: false, error: error.message };
      }

      const result = data as RpcResult;
      if (result.success) {
        toast.success(result.message ?? "تم قبول الطلب");
      } else {
        toast.error(result.error ?? "فشل قبول الطلب");
      }
      return result;
    },
    [supabase, session]
  );

  const { execute, pending } = useAtMostOnce(acceptOrderAction);

  return {
    acceptOrder: execute,
    accepting: pending,
  };
}
