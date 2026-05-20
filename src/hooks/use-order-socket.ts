"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSupabase } from "@/lib/supabase/provider";
import {
  getRealtimeService,
  type SequencedMessage,
} from "@/lib/supabase/realtime-service";
import type { Order, OrderStatus } from "@/types";

// ============================================
// IPC Pattern: Point-to-Point Message Passing
// (Lecture 4, Slide 3, 5)
//
// Each order gets its own "socket channel" so that
// the Client, Restaurant, and Driver nodes involved
// in that order can exchange status updates privately.
// ============================================

/** Payload broadcast when an order status changes */
export interface OrderStatusMessage {
  orderId: string;
  oldStatus: OrderStatus;
  newStatus: OrderStatus;
  updatedBy: string;
}

interface UseOrderSocketOptions {
  /** The order ID to subscribe to (null = don't subscribe) */
  orderId: string | null;
  /** Called when a status update message arrives */
  onStatusChange?: (msg: OrderStatusMessage) => void;
  /** Called when the peer acknowledges receipt */
  onAck?: (originalSeq: number) => void;
}

/**
 * Hook that opens a dedicated "order socket" for a single order.
 *
 * - **Client** subscribes to receive status updates.
 * - **Restaurant / Driver** publishes status transitions.
 * - Every critical message is acknowledged (Reliable Communication).
 */
export function useOrderSocket({
  orderId,
  onStatusChange,
  onAck,
}: UseOrderSocketOptions) {
  const { supabase, session } = useSupabase();
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<OrderStatusMessage | null>(null);
  const serviceRef = useRef(getRealtimeService(supabase));

  const channelName = orderId ? `order:${orderId}` : null;

  // Subscribe to the order channel
  useEffect(() => {
    if (!channelName || !session?.user) return;

    const svc = serviceRef.current;

    // 1. Listen for status-change broadcasts (Message Passing)
    svc.subscribeBroadcast<OrderStatusMessage>(
      channelName,
      "status_change",
      (msg: SequencedMessage<OrderStatusMessage>) => {
        setLastMessage(msg.payload);
        onStatusChange?.(msg.payload);

        // Send acknowledgement back (Reliable Communication — Lecture 4, Slide 10)
        svc.sendAck(channelName, session.user.id, msg.seq);
      }
    );

    // 2. Listen for acks
    svc.onAck(channelName, (ack) => {
      onAck?.(ack.originalSeq);
    });

    setConnected(true);

    return () => {
      svc.removeChannel(channelName);
      setConnected(false);
    };
  }, [channelName, session?.user, onStatusChange, onAck]);

  // Publish a status transition on this order's socket
  const publishStatusChange = useCallback(
    async (
      oldStatus: OrderStatus,
      newStatus: OrderStatus
    ): Promise<number | null> => {
      if (!channelName || !session?.user) return null;

      const svc = serviceRef.current;

      const seq = await svc.sendBroadcast<OrderStatusMessage>(
        channelName,
        "status_change",
        session.user.id,
        "order_status_update",
        {
          orderId: orderId!,
          oldStatus,
          newStatus,
          updatedBy: session.user.id,
        }
      );

      return seq;
    },
    [channelName, session?.user, orderId]
  );

  // Also subscribe to DB changes on this order (belt-and-suspenders)
  useEffect(() => {
    if (!orderId || !session?.user) return;

    const svc = serviceRef.current;
    const dbChannel = `order-db:${orderId}`;

    svc.subscribeTable(
      dbChannel,
      "orders",
      "UPDATE",
      (payload) => {
        const updated = payload.new as Order;
        const old = payload.old as Partial<Order>;
        if (updated.status !== old.status) {
          const msg: OrderStatusMessage = {
            orderId: updated.id,
            oldStatus: (old.status as OrderStatus) ?? "pending",
            newStatus: updated.status,
            updatedBy: "database",
          };
          setLastMessage(msg);
          onStatusChange?.(msg);
        }
      },
      `id=eq.${orderId}`
    );

    return () => {
      svc.removeChannel(dbChannel);
    };
  }, [orderId, session?.user, onStatusChange]);

  return {
    connected,
    lastMessage,
    publishStatusChange,
  };
}

// ============================================
// Broadcast: Multicast new-order to drivers
// (Lecture 4, Slide 27-28)
// ============================================

/**
 * Hook for restaurants to broadcast a new order to all online drivers.
 * Drivers subscribe to the shared "new-orders" channel.
 */
export function useNewOrderBroadcast() {
  const { supabase, session } = useSupabase();
  const serviceRef = useRef(getRealtimeService(supabase));

  const broadcastNewOrder = useCallback(
    async (order: Order) => {
      if (!session?.user) return null;

      return serviceRef.current.sendBroadcast(
        "new-orders",
        "new_order",
        session.user.id,
        "new_order_available",
        {
          orderId: order.id,
          restaurantId: order.restaurant_id,
          totalAmount: order.total_amount,
          createdAt: order.created_at,
        }
      );
    },
    [session?.user]
  );

  return { broadcastNewOrder };
}

/** Payload for a new-order multicast */
export interface NewOrderBroadcast {
  orderId: string;
  restaurantId: string;
  totalAmount: number;
  createdAt: string;
}

/**
 * Hook for drivers to subscribe to multicast new-order notifications.
 */
export function useNewOrderListener(
  onNewOrder?: (order: NewOrderBroadcast) => void
) {
  const { supabase, session } = useSupabase();
  const [latestOrder, setLatestOrder] = useState<NewOrderBroadcast | null>(null);
  const serviceRef = useRef(getRealtimeService(supabase));

  useEffect(() => {
    if (!session?.user) return;

    const svc = serviceRef.current;

    svc.subscribeBroadcast<NewOrderBroadcast>(
      "new-orders",
      "new_order",
      (msg) => {
        setLatestOrder(msg.payload);
        onNewOrder?.(msg.payload);
      }
    );

    return () => {
      svc.removeChannel("new-orders");
    };
  }, [session?.user, onNewOrder]);

  return { latestOrder };
}
