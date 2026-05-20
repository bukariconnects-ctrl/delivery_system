import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// ============================================
// Security Model: Secure Channels & Identity-Based Access Control
// (Lecture 3, Slide 40-47 | Lecture 9, Slide 3 | Lecture 10, Slide 17)
//
// This middleware:
// 1. Verifies JWT tokens for every dashboard request (Secure Channels)
// 2. Refreshes expired sessions automatically
// 3. Redirects unauthenticated users to login
// 4. Ensures each principal accesses only their authorized node
// 5. Rate Limiting — DoS protection (Lecture 9, Slide 3)
// ============================================

/** Routes that require authentication */
const PROTECTED_ROUTES = ["/dashboard"];

/** Public routes that don't require auth */
const PUBLIC_ROUTES = ["/", "/auth/login", "/auth/register", "/auth/callback"];

// ---- Rate Limiting (DoS Mitigation — Lecture 9) ----
// In-memory sliding window per IP. In production, use Redis/KV.

const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 100;  // max requests per window

interface RateBucket {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateBucket>();

function checkRateLimit(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  let bucket = rateLimitStore.get(ip);

  // Clean up expired entries periodically
  if (rateLimitStore.size > 10_000) {
    for (const [key, b] of rateLimitStore) {
      if (now > b.resetAt) rateLimitStore.delete(key);
    }
  }

  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    rateLimitStore.set(ip, bucket);
  }

  bucket.count++;
  const remaining = Math.max(0, RATE_LIMIT_MAX_REQUESTS - bucket.count);

  return { allowed: bucket.count <= RATE_LIMIT_MAX_REQUESTS, remaining };
}

export async function middleware(request: NextRequest) {
  // ---- Rate Limiting ----
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  const { allowed, remaining } = checkRateLimit(ip);

  if (!allowed) {
    return new NextResponse(
      JSON.stringify({ error: "Too many requests — rate limit exceeded" }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": "60",
          "X-RateLimit-Limit": RATE_LIMIT_MAX_REQUESTS.toString(),
          "X-RateLimit-Remaining": "0",
        },
      }
    );
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  // Attach rate limit headers to every response
  supabaseResponse.headers.set("X-RateLimit-Limit", RATE_LIMIT_MAX_REQUESTS.toString());
  supabaseResponse.headers.set("X-RateLimit-Remaining", remaining.toString());

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh the session token (Secure Channel maintenance)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Check if the route is protected
  const isProtectedRoute = PROTECTED_ROUTES.some((route) =>
    pathname.startsWith(route)
  );

  const isPublicRoute = PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route)
  );

  // Security enforcement: redirect unauthenticated users
  if (isProtectedRoute && !user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/auth/login";
    redirectUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // Fetch profile once for all RBAC checks below
  let profile: { role: string; is_verified: boolean } | null = null;
  if (user && (isProtectedRoute || pathname.startsWith("/auth/"))) {
    const { data } = await supabase
      .from("profiles")
      .select("role, is_verified")
      .eq("id", user.id)
      .single();
    profile = data;
  }

  // RBAC: /dashboard/admin requires admin role (Lecture 9 — Secure Principals)
  if (pathname.startsWith("/dashboard/admin") && user) {
    if (profile?.role !== "admin") {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/auth/login";
      redirectUrl.searchParams.set("error", "unauthorized");
      return NextResponse.redirect(redirectUrl);
    }
  }

  // Verification gate: unverified non-admin users must complete their /setup page
  // (Lecture 9: Identity Verification — Impostor Mitigation)
  if (user && profile && isProtectedRoute && profile.role !== "admin") {
    const isSetupPage = pathname.includes("/setup");
    if (!profile.is_verified && !isSetupPage) {
      const setupPath: Record<string, string> = {
        client: "/dashboard/client/setup",
        restaurant: "/dashboard/restaurant/setup",
        driver: "/dashboard/driver/setup",
      };
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = setupPath[profile.role] ?? "/dashboard/client/setup";
      return NextResponse.redirect(redirectUrl);
    }
  }

  // If user is authenticated and on a public auth page, redirect to their dashboard
  if (user && pathname.startsWith("/auth/") && profile) {
    const roleDashboard: Record<string, string> = {
      client: "/dashboard/client",
      restaurant: "/dashboard/restaurant",
      driver: "/dashboard/driver",
      admin: "/dashboard/admin",
    };

    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = roleDashboard[profile.role ?? "client"] ?? "/dashboard/client";
    return NextResponse.redirect(redirectUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico (favicon file)
     * - public folder assets
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
