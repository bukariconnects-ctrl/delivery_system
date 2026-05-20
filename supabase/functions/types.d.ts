// ============================================
// Deno type declarations for Supabase Edge Functions.
// These allow the IDE's TypeScript server to resolve
// Deno-specific APIs (Deno.serve, Deno.env) and
// ESM URL imports used in the Edge runtime.
// ============================================

declare namespace Deno {
  function serve(handler: (req: Request) => Response | Promise<Response>): void;

  const env: {
    get(key: string): string | undefined;
  };
}

declare module "https://esm.sh/@supabase/supabase-js@2" {
  export function createClient(
    supabaseUrl: string,
    supabaseKey: string,
    options?: Record<string, unknown>
  ): import("@supabase/supabase-js").SupabaseClient;
}
