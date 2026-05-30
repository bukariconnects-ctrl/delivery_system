-- ============================================
-- 0012_storage_bucket_policies.sql
-- Fix missing Storage Bucket RLS policies
-- delivery-dfs bucket needs SELECT policy so
-- signed URLs (.createSignedUrl) and .list() work
-- ============================================

-- Allow any authenticated user to SELECT (read/list/download/getSignedUrl)
-- objects in the delivery-dfs bucket.
-- Signed URLs provide time-limited access control.
CREATE POLICY "Allow authenticated read on delivery-dfs"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'delivery-dfs' AND auth.role() = 'authenticated');

-- Ensure authenticated users can insert (upload) into delivery-dfs
CREATE POLICY "Allow authenticated insert on delivery-dfs"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'delivery-dfs' AND auth.role() = 'authenticated');
