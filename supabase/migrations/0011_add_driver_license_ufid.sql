-- ============================================
-- 0011_add_driver_license_ufid.sql
-- Add missing driver_license_ufid to profiles
-- Fix RLS: allow users to update their own profile row
-- ============================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS driver_license_ufid TEXT;

-- Users must be able to update their own profile (vehicle details, documents, etc.)
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);
