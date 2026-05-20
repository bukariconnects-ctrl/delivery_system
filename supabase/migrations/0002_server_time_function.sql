-- ============================================
-- 0002_server_time_function.sql
-- Interaction Model: Single Source of Truth for Time
-- Solves "Lack of Global Clock" (Lecture 3)
-- ============================================

-- RPC function to get the database server's current time
-- Used by distributed nodes to synchronize their clocks
CREATE OR REPLACE FUNCTION public.get_server_time()
RETURNS TIMESTAMPTZ AS $$
BEGIN
  RETURN now();
END;
$$ LANGUAGE plpgsql STABLE;

-- Grant access to authenticated and anonymous users
GRANT EXECUTE ON FUNCTION public.get_server_time() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_server_time() TO anon;
