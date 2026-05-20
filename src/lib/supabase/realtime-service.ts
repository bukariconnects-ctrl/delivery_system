import {
  SupabaseClient,
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from "@supabase/supabase-js";

// ============================================
// Socket & IPC Layer: Supabase Realtime Service
// Abstracts WebSockets as "Communication Endpoints"
// (Lecture 4, Slide 12-14)
//
// Concepts implemented:
// - Channels as Socket Endpoints
// - Broadcast (Multicast to driver group) — Slide 27, 28
// - Sender Order via sequence numbers — Slide 11
// - Acknowledgement for reliable delivery — Slide 10
// ============================================

// ---- Types ----

/** Every message on a channel carries a monotonic sequence number */
export interface SequencedMessage<T = unknown> {
  seq: number;
  senderId: string;
  timestamp: string;
  type: string;
  payload: T;
}

/** Ack payload echoed back to the sender */
export interface AckPayload {
  originalSeq: number;
  receiverId: string;
  status: "received" | "processed";
}

/** Callback invoked when a broadcast message arrives */
type MessageHandler<T = unknown> = (msg: SequencedMessage<T>) => void;

/** Callback invoked when a DB row changes (Postgres Changes) */
type ChangeHandler<T extends { [key: string]: unknown } = Record<string, unknown>> = (
  payload: RealtimePostgresChangesPayload<T>
) => void;

// ---- Sequence tracker (per sender) ----

class SequenceTracker {
  private lastSeq = new Map<string, number>();

  /** Returns true if the message is in order; false if stale / duplicate */
  check(senderId: string, seq: number): boolean {
    const prev = this.lastSeq.get(senderId) ?? -1;
    if (seq <= prev) return false; // duplicate or out-of-order
    this.lastSeq.set(senderId, seq);
    return true;
  }

  reset() {
    this.lastSeq.clear();
  }
}

// ---- RealtimeService (singleton-friendly) ----

export class RealtimeService {
  private channels = new Map<string, RealtimeChannel>();
  private sequenceTracker = new SequenceTracker();
  private localSeq = 0; // monotonic counter for outgoing messages

  constructor(private supabase: SupabaseClient) {}

  // ------------------------------------------------
  // 1. Channel lifecycle
  // ------------------------------------------------

  /**
   * Get or create a named channel (Socket Endpoint).
   * Channels are reused to avoid duplicate subscriptions.
   */
  getChannel(name: string): RealtimeChannel {
    let ch = this.channels.get(name);
    if (!ch) {
      ch = this.supabase.channel(name);
      this.channels.set(name, ch);
    }
    return ch;
  }

  /** Unsubscribe and remove a channel */
  async removeChannel(name: string) {
    const ch = this.channels.get(name);
    if (ch) {
      await this.supabase.removeChannel(ch);
      this.channels.delete(name);
    }
  }

  /** Monotonic counter to guarantee unique internal channel names */
  private channelSeq = 0;

  /**
   * Tear down any existing channel with this name and create a brand-new one.
   * Uses a unique suffix so Supabase's internal registry never returns a
   * stale (already-subscribed) channel object.
   * Prevents the "cannot add callbacks after subscribe" error caused by
   * React Strict Mode / Fast Refresh re-mounts.
   */
  private freshChannel(name: string): RealtimeChannel {
    const existing = this.channels.get(name);
    if (existing) {
      this.supabase.removeChannel(existing); // fire-and-forget
      this.channels.delete(name);
    }
    // Unique internal name avoids Supabase returning the old channel object
    const internalName = `${name}::${++this.channelSeq}`;
    const ch = this.supabase.channel(internalName);
    this.channels.set(name, ch);
    return ch;
  }

  /** Tear down every active channel */
  async removeAll() {
    for (const [name] of this.channels) {
      await this.removeChannel(name);
    }
    this.sequenceTracker.reset();
  }

  // ------------------------------------------------
  // 2. Broadcast — Multicast (Lecture 4, Slide 27-28)
  //    Used to notify a *group* of drivers about a new order.
  // ------------------------------------------------

  /**
   * Subscribe to broadcast messages on a channel.
   * Messages are validated for Sender Order (sequence check).
   */
  subscribeBroadcast<T = unknown>(
    channelName: string,
    event: string,
    handler: MessageHandler<T>
  ): RealtimeChannel {
    const ch = this.freshChannel(channelName);

    ch.on("broadcast", { event }, ({ payload }) => {
      const msg = payload as SequencedMessage<T>;

      // Sender-order check (Lecture 4, Slide 11)
      if (!this.sequenceTracker.check(msg.senderId, msg.seq)) {
        console.warn(
          `[RealtimeService] Out-of-order message dropped: sender=${msg.senderId} seq=${msg.seq}`
        );
        return;
      }

      handler(msg);
    });

    ch.subscribe();
    return ch;
  }

  /**
   * Send a sequenced broadcast message (Multicast).
   * Returns the sequence number assigned to this message.
   */
  async sendBroadcast<T = unknown>(
    channelName: string,
    event: string,
    senderId: string,
    type: string,
    payload: T
  ): Promise<number> {
    const seq = ++this.localSeq;
    const ch = this.getChannel(channelName);

    const message: SequencedMessage<T> = {
      seq,
      senderId,
      timestamp: new Date().toISOString(),
      type,
      payload,
    };

    await ch.send({
      type: "broadcast",
      event,
      payload: message,
    });

    return seq;
  }

  // ------------------------------------------------
  // 3. Acknowledgement — Reliable Communication
  //    (Lecture 4, Slide 10, 16)
  // ------------------------------------------------

  /**
   * Listen for acknowledgement messages on a channel.
   * The sender uses this to confirm a critical message was received.
   */
  onAck(
    channelName: string,
    handler: (ack: AckPayload) => void
  ): RealtimeChannel {
    return this.subscribeBroadcast<AckPayload>(
      channelName,
      "ack",
      (msg) => handler(msg.payload)
    );
  }

  /**
   * Send an acknowledgement for a received message.
   * Simulates reliable communication over an unreliable channel.
   */
  async sendAck(
    channelName: string,
    senderId: string,
    originalSeq: number
  ): Promise<void> {
    await this.sendBroadcast<AckPayload>(
      channelName,
      "ack",
      senderId,
      "acknowledgement",
      {
        originalSeq,
        receiverId: senderId,
        status: "received",
      }
    );
  }

  // ------------------------------------------------
  // 4. Postgres Changes — DB-level IPC
  //    Subscribes to INSERT/UPDATE/DELETE on a table.
  // ------------------------------------------------

  /**
   * Subscribe to Postgres row changes on a table.
   * This is used for "point-to-point" IPC when one node
   * mutates data and another needs to react.
   */
  subscribeTable<T extends Record<string, unknown> = Record<string, unknown>>(
    channelName: string,
    table: string,
    event: "INSERT" | "UPDATE" | "DELETE" | "*",
    handler: ChangeHandler<T>,
    filter?: string
  ): RealtimeChannel {
    const ch = this.freshChannel(channelName);

    const opts: {
      event: "INSERT" | "UPDATE" | "DELETE" | "*";
      schema: string;
      table: string;
      filter?: string;
    } = {
      event,
      schema: "public",
      table,
    };

    if (filter) {
      opts.filter = filter;
    }

    ch.on("postgres_changes", opts, (payload) => {
      handler(payload as RealtimePostgresChangesPayload<T>);
    });

    ch.subscribe();
    return ch;
  }

  // ------------------------------------------------
  // 5. Presence — Track who is online (bonus)
  // ------------------------------------------------

  /**
   * Subscribe to presence on a channel.
   * Useful for knowing which drivers are actively connected.
   */
  trackPresence(
    channelName: string,
    userId: string,
    meta: Record<string, unknown> = {}
  ): RealtimeChannel {
    const ch = this.freshChannel(channelName);

    ch.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await ch.track({ user_id: userId, online_at: new Date().toISOString(), ...meta });
      }
    });

    return ch;
  }
}

// ---- Factory ----

let _instance: RealtimeService | null = null;

/**
 * Returns a singleton RealtimeService for the given Supabase client.
 * Call with a new client to replace the instance.
 */
export function getRealtimeService(supabase: SupabaseClient): RealtimeService {
  if (!_instance) {
    _instance = new RealtimeService(supabase);
  }
  return _instance;
}
