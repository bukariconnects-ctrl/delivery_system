-- ============================================
-- 0006_onboarding_schema.sql
-- Node Onboarding & Identity Verification
-- (Lecture 9: Security — Impostor Mitigation)
-- (Lecture 10: DFS — Hierarchical Identity Storage)
-- ============================================

-- 1. Extend profiles with onboarding & verification fields
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_verified       BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS phone_number      TEXT,
  ADD COLUMN IF NOT EXISTS address_metadata  JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS vehicle_details   JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS id_document_ufid  TEXT;

-- 2. Extend restaurants with additional details & verification
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS cuisine_type  TEXT,
  ADD COLUMN IF NOT EXISTS description   TEXT,
  ADD COLUMN IF NOT EXISTS is_verified   BOOLEAN DEFAULT false;

-- 3. Menu Items table — each restaurant's menu with DFS image UFIDs
CREATE TABLE IF NOT EXISTS public.menu_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  price           NUMERIC(10, 2) NOT NULL DEFAULT 0,
  image_ufid      TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on menu_items
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;

-- Anyone can view menu items (public menu)
CREATE POLICY "Anyone can view menu items"
  ON public.menu_items FOR SELECT
  USING (true);

-- Restaurant owners can manage their own menu items
CREATE POLICY "Restaurant owners can manage menu items"
  ON public.menu_items FOR ALL
  USING (
    auth.uid() IN (
      SELECT owner_id FROM public.restaurants WHERE id = restaurant_id
    )
  );

-- Admin can manage all menu items
CREATE POLICY "Admin can manage all menu items"
  ON public.menu_items FOR ALL
  USING (public.is_admin(auth.uid()));

-- 4. RPC: verify_node — Admin-only function to verify a user/restaurant
--    The admin acts as a "Certificate Authority" (Lecture 9, Slide 6)
CREATE OR REPLACE FUNCTION public.verify_node(target_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  target_role public.user_role;
  restaurant_row public.restaurants%ROWTYPE;
BEGIN
  -- Only admin can call this
  IF NOT public.is_admin(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  -- Get the target user's role
  SELECT role INTO target_role FROM public.profiles WHERE id = target_user_id;

  IF target_role IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;

  -- Verify the profile
  UPDATE public.profiles SET is_verified = true WHERE id = target_user_id;

  -- If restaurant owner, also verify their restaurant
  IF target_role = 'restaurant' THEN
    UPDATE public.restaurants SET is_verified = true WHERE owner_id = target_user_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'verified_role', target_role::text);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Admin is auto-verified
UPDATE public.profiles SET is_verified = true WHERE role = 'admin';

-- 6. Enable realtime for menu_items
ALTER PUBLICATION supabase_realtime ADD TABLE public.menu_items;
