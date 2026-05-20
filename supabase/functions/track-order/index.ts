// ============================================
// Web Service: Track Order — Edge Function
// (Lecture 6: Web Services — Interoperability)
//
// A RESTful Web Service that external third-party
// systems can call to track order status and driver
// location. Implements the Interoperability concept:
// any HTTP client (mobile app, partner API, IoT)
// can consume this service.
//
// Endpoint: GET/POST /functions/v1/track-order
// Input:    { order_id: string }
// Output:   Standardized JSON response
// ============================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

interface TrackOrderResponse {
  success: boolean;
  data?: {
    order_id: string;
    status: string;
    restaurant_id: string;
    driver_id: string | null;
    total_amount: number;
    created_at: string;
    driver_location: {
      latitude: number;
      longitude: number;
      is_online: boolean;
      last_updated: string;
    } | null;
  };
  error?: string;
  service: string;
  version: string;
  timestamp: string;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    // Extract order_id from query params (GET) or body (POST)
    let orderId: string | null = null;

    if (req.method === "GET") {
      const url = new URL(req.url);
      orderId = url.searchParams.get("order_id");
    } else if (req.method === "POST") {
      const body = await req.json();
      orderId = body.order_id ?? null;
    }

    if (!orderId) {
      const response: TrackOrderResponse = {
        success: false,
        error: "Missing required parameter: order_id",
        service: "track-order",
        version: "1.0.0",
        timestamp: new Date().toISOString(),
      };
      return new Response(JSON.stringify(response), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create Supabase client with service role for unrestricted access
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch order details
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, status, restaurant_id, driver_id, total_amount, created_at")
      .eq("id", orderId)
      .single();

    if (orderError || !order) {
      const response: TrackOrderResponse = {
        success: false,
        error: "Order not found",
        service: "track-order",
        version: "1.0.0",
        timestamp: new Date().toISOString(),
      };
      return new Response(JSON.stringify(response), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch driver location if a driver is assigned
    let driverLocation = null;
    if (order.driver_id) {
      const { data: loc } = await supabase
        .from("driver_locations")
        .select("current_latitude, current_longitude, is_online, updated_at")
        .eq("driver_id", order.driver_id)
        .single();

      if (loc) {
        driverLocation = {
          latitude: loc.current_latitude,
          longitude: loc.current_longitude,
          is_online: loc.is_online,
          last_updated: loc.updated_at,
        };
      }
    }

    // Build standardized response
    const response: TrackOrderResponse = {
      success: true,
      data: {
        order_id: order.id,
        status: order.status,
        restaurant_id: order.restaurant_id,
        driver_id: order.driver_id,
        total_amount: order.total_amount,
        created_at: order.created_at,
        driver_location: driverLocation,
      },
      service: "track-order",
      version: "1.0.0",
      timestamp: new Date().toISOString(),
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const response: TrackOrderResponse = {
      success: false,
      error: `Internal server error: ${(err as Error).message}`,
      service: "track-order",
      version: "1.0.0",
      timestamp: new Date().toISOString(),
    };
    return new Response(JSON.stringify(response), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
