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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      order_id,
      restaurant_name,
      items,
      total,
      delivery_lat,
      delivery_lng,
      user_email,
    } = body;

    if (!order_id || !total || total <= 0) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Auto-detect origin from request (works on both localhost and Vercel)
    const origin = req.headers.get("origin") || req.headers.get("referer")?.replace(/\/[^/]*$/, "") || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const appUrl = origin.replace(/\/$/, "");

    // Build Stripe line items from order items
    const lineItems = (items ?? []).map((it: any) => ({
      price_data: {
        currency: "sar",
        product_data: { name: it.name },
        unit_amount: Math.round(it.price * 100), // convert to halala (cents)
      },
      quantity: it.quantity,
    }));

    // If no line items (edge case), add a generic line item
    if (lineItems.length === 0) {
      lineItems.push({
        price_data: {
          currency: "sar",
          product_data: { name: `طلب من ${restaurant_name ?? "مطعم"}` },
          unit_amount: Math.round(total * 100),
        },
        quantity: 1,
      });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: lineItems,
      mode: "payment",
      success_url: `${appUrl}/dashboard/client?view=tracking&paid=success`,
      cancel_url: `${appUrl}/dashboard/client?view=cart&paid=cancelled`,
      customer_email: user_email,
      metadata: {
        order_id,
        restaurant_name: restaurant_name ?? "",
        delivery_lat: String(delivery_lat ?? ""),
        delivery_lng: String(delivery_lng ?? ""),
      },
    });

    // Link stripe session_id to the order in Supabase
    const supabase = getSupabase();
    await supabase
      .from("orders")
      .update({ stripe_session_id: session.id })
      .eq("id", order_id);

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error("Stripe checkout error:", err);
    return NextResponse.json(
      { error: err.message ?? "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
