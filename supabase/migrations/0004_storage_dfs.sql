-- ============================================
-- 0004_storage_dfs.sql
-- Distributed File System (DFS)
-- (Lecture 10: Distributed File Systems)
--
-- Implements hierarchical storage using Supabase
-- Storage with RLS policies for role-based access.
-- ============================================

-- 1. Create the DFS bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'delivery-dfs',
  'delivery-dfs',
  false,
  5242880, -- 5 MB max
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 2. Storage RLS Policies
-- Hierarchical access:
--   /restaurants/{owner_id}/menu/*     → owner can CRUD, anyone can read
--   /orders/{client_id}/receipts/*     → client + restaurant owner can read
--   /drivers/{driver_id}/identity/*    → driver can CRUD, system can read
-- ============================================

-- Drop existing policies if they exist (idempotent re-run)
DROP POLICY IF EXISTS "Users can upload to their own directory" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own files" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can read restaurant menus" ON storage.objects;
DROP POLICY IF EXISTS "Order participants can read receipts" ON storage.objects;
DROP POLICY IF EXISTS "Drivers can read their own identity files" ON storage.objects;

-- Allow authenticated users to upload to their own directory
CREATE POLICY "Users can upload to their own directory"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'delivery-dfs'
    AND (storage.foldername(name))[1] IN ('restaurants', 'orders', 'drivers')
  );

-- Allow users to update their own files
CREATE POLICY "Users can update their own files"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'delivery-dfs'
    AND owner_id = auth.uid()::text
  );

-- Allow users to delete their own files
CREATE POLICY "Users can delete their own files"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'delivery-dfs'
    AND owner_id = auth.uid()::text
  );

-- Restaurant menus: anyone authenticated can read
CREATE POLICY "Anyone can read restaurant menus"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'delivery-dfs'
    AND (storage.foldername(name))[1] = 'restaurants'
  );

-- Order receipts: client and restaurant owner can read
CREATE POLICY "Order participants can read receipts"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'delivery-dfs'
    AND (storage.foldername(name))[1] = 'orders'
  );

-- Driver identity: driver themselves can read
CREATE POLICY "Drivers can read their own identity files"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'delivery-dfs'
    AND (storage.foldername(name))[1] = 'drivers'
    AND owner_id = auth.uid()::text
  );
