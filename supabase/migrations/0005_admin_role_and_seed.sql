-- ============================================
-- 0005_admin_role_and_seed.sql
-- Admin Role + RBAC Policies
-- (System Orchestrator Node)
--
-- Adds 'admin' to user_role enum, creates
-- is_admin() helper, and grants admin users
-- full READ + UPDATE access to all tables.
-- ============================================

-- 1. Add 'admin' to the user_role enum
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'admin';

-- 2. Helper function: check if a user is admin
CREATE OR REPLACE FUNCTION public.is_admin(check_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = check_user_id AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================
-- 3. Admin RLS Policies — READ + UPDATE all tables
-- ============================================

-- Profiles: admin can read all profiles
CREATE POLICY "Admin can view all profiles"
  ON public.profiles FOR SELECT
  USING (public.is_admin(auth.uid()));

-- Profiles: admin can update any profile
CREATE POLICY "Admin can update any profile"
  ON public.profiles FOR UPDATE
  USING (public.is_admin(auth.uid()));

-- Restaurants: admin can read all restaurants (including closed)
CREATE POLICY "Admin can view all restaurants"
  ON public.restaurants FOR SELECT
  USING (public.is_admin(auth.uid()));

-- Restaurants: admin can update any restaurant
CREATE POLICY "Admin can update any restaurant"
  ON public.restaurants FOR UPDATE
  USING (public.is_admin(auth.uid()));

-- Orders: admin can read all orders
CREATE POLICY "Admin can view all orders"
  ON public.orders FOR SELECT
  USING (public.is_admin(auth.uid()));

-- Orders: admin can update any order
CREATE POLICY "Admin can update any order"
  ON public.orders FOR UPDATE
  USING (public.is_admin(auth.uid()));

-- Driver locations: admin can read all locations
CREATE POLICY "Admin can view all driver locations"
  ON public.driver_locations FOR SELECT
  USING (public.is_admin(auth.uid()));

-- Driver locations: admin can update any location
CREATE POLICY "Admin can update any driver location"
  ON public.driver_locations FOR UPDATE
  USING (public.is_admin(auth.uid()));

-- Notifications: admin can read all notifications
CREATE POLICY "Admin can view all notifications"
  ON public.notifications FOR SELECT
  USING (public.is_admin(auth.uid()));
