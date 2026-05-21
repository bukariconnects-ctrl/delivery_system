import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const secretKey = process.env.STRIPE_SECRET_KEY!;
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!;

if (!secretKey) {
  throw new Error("Missing STRIPE_SECRET_KEY environment variable");
}
if (!endpointSecret) {
  throw new Error("Missing STRIPE_WEBHOOK_SECRET environment variable");
}

const stripe = new Stripe(secretKey);

// Use service_role key if available, otherwise fall back to anon key
function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const key = serviceKey && serviceKey.length > 20 ? serviceKey : anonKey;
  console.log(`[Webhook] Using ${serviceKey && serviceKey.length > 20 ? "service_role" : "anon"} key`);
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Stripe Webhook Handler
 * Implements Indirect Communication (Req 6):
 * Stripe (Publisher) -> Our endpoint (Subscriber)
 * Time-uncoupled: payment happens async on Stripe servers.
 */
export async function POST(req: NextRequest) {
  const payload = await req.text();
  const sig = req.headers.get("stripe-signature") ?? "";

  if (!sig) {
    console.error("[Webhook] Missing stripe-signature header");
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(payload, sig, endpointSecret);
    console.log(`[Webhook] Received verified event: ${event.type}`);
  } catch (err: any) {
    console.error("[Webhook] Signature verification failed:", err.message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = getSupabaseClient();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = session.metadata?.order_id;

      console.log(`[Webhook] checkout.session.completed — orderId: ${orderId}, sessionId: ${session.id}`);

      if (!orderId) {
        console.error("[Webhook] No order_id in session metadata");
        return NextResponse.json({ error: "Missing order_id" }, { status: 400 });
      }

      // Update only payment_status — restaurant must manually accept the order
      const { error } = await supabase
        .from("orders")
        .update({
          payment_status: "paid",
          stripe_session_id: session.id,
        })
        .eq("id", orderId);

      if (error) {
        console.error("[Webhook] Update failed:", JSON.stringify(error));
        return NextResponse.json({ error: "Failed to update order" }, { status: 500 });
      }
      console.log(`[Webhook] Order ${orderId} → payment_status=paid (awaiting restaurant acceptance)`);
      break;
    }

    case "payment_intent.payment_failed": {
      const intent = event.data.object as Stripe.PaymentIntent;
      const orderId = intent.metadata?.order_id;
      console.log(`[Webhook] payment_intent.payment_failed — orderId: ${orderId}`);
      if (orderId) {
        const { error } = await supabase
          .from("orders")
          .update({ payment_status: "failed" })
          .eq("id", orderId);
        if (error) console.error("[Webhook] Failed to mark as failed:", JSON.stringify(error));
        else console.log(`[Webhook] Order ${orderId} → failed`);
      }
      break;
    }

    default:
      console.log(`[Webhook] Unhandled event type: ${event.type}`);
  }

  return NextResponse.json({ received: true });
}
