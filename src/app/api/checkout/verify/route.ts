import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const key = serviceKey && serviceKey.length > 20 ? serviceKey : anonKey;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Verify payment status by checking Stripe session.
 * Fallback mechanism when webhook delivery is delayed or fails.
 * Client calls this on return from Stripe to confirm payment.
 */
export async function POST(req: NextRequest) {
  try {
    const { order_id } = await req.json();

    if (!order_id) {
      return NextResponse.json({ error: "Missing order_id" }, { status: 400 });
    }

    const supabase = getSupabase();

    // Get the order's stripe_session_id
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("stripe_session_id, payment_status")
      .eq("id", order_id)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Already paid — no need to check Stripe
    if (order.payment_status === "paid") {
      return NextResponse.json({ payment_status: "paid" });
    }

    // No session ID — can't verify
    if (!order.stripe_session_id) {
      return NextResponse.json({ payment_status: "pending" });
    }

    // Check Stripe session status
    const session = await stripe.checkout.sessions.retrieve(order.stripe_session_id);

    if (session.payment_status === "paid") {
      // Only update payment_status — restaurant must manually accept
      await supabase
        .from("orders")
        .update({ payment_status: "paid", stripe_session_id: session.id })
        .eq("id", order_id);

      return NextResponse.json({ payment_status: "paid", updated: true });
    }

    return NextResponse.json({ payment_status: order.payment_status });
  } catch (err: any) {
    console.error("[Verify] Error:", err);
    return NextResponse.json(
      { error: err.message ?? "Verification failed" },
      { status: 500 }
    );
  }
}
