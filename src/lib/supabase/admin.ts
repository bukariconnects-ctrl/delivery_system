import { createClient } from "@supabase/supabase-js";

/**
 * Admin/Service-Role client for server-side operations
 * that bypass RLS (e.g., Stripe webhooks).
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
