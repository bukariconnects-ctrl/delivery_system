// ============================================
// Distributed File System (DFS) Client
// (Lecture 10: Distributed File Systems)
//
// Manages files in Supabase Storage with:
// - UFID (Unique File Identifier) — Slide 13
// - Hierarchical namespace — Slide 10
// - Client-side caching — Slide 10 (Efficiency)
// - Role-based access via Storage RLS
//
// Hierarchy:
//   /restaurants/{id}/menu/{ufid}.ext
//   /orders/{id}/receipts/{ufid}.ext
//   /drivers/{id}/identity/{ufid}.ext
// ============================================

import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "delivery-dfs";
const CACHE_PREFIX = "dfs_cache:";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ---- UFID Generation (Lecture 10, Slide 13) ----

/**
 * Generates a Unique File Identifier (UFID).
 * Combines a UUID with a timestamp for global uniqueness
 * across all nodes in the distributed system.
 */
export function generateUFID(extension: string): string {
  const uuid = crypto.randomUUID();
  const timestamp = Date.now().toString(36);
  return `${timestamp}-${uuid}.${extension}`;
}

/** Parse a UFID back to its components */
export function parseUFID(ufid: string): {
  timestamp: number;
  uuid: string;
  extension: string;
} {
  const dotIdx = ufid.lastIndexOf(".");
  const extension = ufid.slice(dotIdx + 1);
  const base = ufid.slice(0, dotIdx);
  const dashIdx = base.indexOf("-");
  const timestamp = parseInt(base.slice(0, dashIdx), 36);
  const uuid = base.slice(dashIdx + 1);
  return { timestamp, uuid, extension };
}

// ---- Path builders (Hierarchical Namespace) ----

export type DFSDirectory = "menu" | "receipts" | "identity";

function buildPath(
  entityType: "restaurants" | "orders" | "drivers",
  entityId: string,
  directory: DFSDirectory,
  filename: string
): string {
  return `${entityType}/${entityId}/${directory}/${filename}`;
}

// ---- Client-side Cache (Lecture 10, Slide 10) ----

interface CacheEntry {
  url: string;
  cachedAt: number;
}

function getCached(key: string): string | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
      localStorage.removeItem(CACHE_PREFIX + key);
      return null;
    }
    return entry.url;
  } catch {
    return null;
  }
}

function setCache(key: string, url: string): void {
  try {
    const entry: CacheEntry = { url, cachedAt: Date.now() };
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
  } catch {
    // localStorage may be full or disabled — silently ignore
  }
}

function invalidateCache(key: string): void {
  try {
    localStorage.removeItem(CACHE_PREFIX + key);
  } catch {
    // ignore
  }
}

// ---- DFS File Metadata ----

export interface DFSFileRef {
  ufid: string;
  path: string;
  entityType: "restaurants" | "orders" | "drivers";
  entityId: string;
  directory: DFSDirectory;
  mimeType: string;
  size: number;
  createdAt: number;
}

// ---- DFS Client ----

export class DFSClient {
  private supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  /**
   * Upload a file to the DFS.
   * Generates a UFID and stores the file in the hierarchical namespace.
   */
  async upload(
    entityType: "restaurants" | "orders" | "drivers",
    entityId: string,
    directory: DFSDirectory,
    file: File
  ): Promise<DFSFileRef | { error: string }> {
    // Generate UFID
    const ext = file.name.split(".").pop() ?? "bin";
    const ufid = generateUFID(ext);
    const path = buildPath(entityType, entityId, directory, ufid);

    // Upload to Supabase Storage
    const { error } = await this.supabase.storage
      .from(BUCKET)
      .upload(path, file, {
        contentType: file.type,
        upsert: false, // No overwrites — append-only for integrity
      });

    if (error) {
      return { error: error.message };
    }

    const ref: DFSFileRef = {
      ufid,
      path,
      entityType,
      entityId,
      directory,
      mimeType: file.type,
      size: file.size,
      createdAt: Date.now(),
    };

    return ref;
  }

  /**
   * Get a signed URL for a file.
   * Uses client-side caching for efficiency.
   */
  async getUrl(path: string, expiresIn = 300): Promise<string | null> {
    // Check client-side cache first (Efficiency — Slide 10)
    const cached = getCached(path);
    if (cached) return cached;

    const { data, error } = await this.supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, expiresIn);

    if (error || !data?.signedUrl) return null;

    // Cache the URL locally
    setCache(path, data.signedUrl);
    return data.signedUrl;
  }

  /**
   * Get a public URL for a file (for menus).
   */
  getPublicUrl(path: string): string {
    const { data } = this.supabase.storage
      .from(BUCKET)
      .getPublicUrl(path);
    return data.publicUrl;
  }

  /**
   * Build menu image signed URL from restaurant_id + image_ufid.
   * Uses signed URLs so images work even if the bucket is private.
   * Returns null if no image_ufid is stored.
   */
  async getMenuImageUrl(
    restaurantId: string,
    imageUfid: string | null
  ): Promise<string | null> {
    if (!imageUfid) return null;
    const path = buildPath("restaurants", restaurantId, "menu", imageUfid);
    return this.getUrl(path, 3600); // 1-hour signed URL
  }

  /**
   * List files in a directory.
   */
  async listFiles(
    entityType: "restaurants" | "orders" | "drivers",
    entityId: string,
    directory: DFSDirectory
  ): Promise<{ name: string; ufid: string; size: number }[]> {
    const folderPath = `${entityType}/${entityId}/${directory}`;

    const { data, error } = await this.supabase.storage
      .from(BUCKET)
      .list(folderPath, { sortBy: { column: "created_at", order: "desc" } });

    if (error || !data) return [];

    return data.map((f) => ({
      name: f.name,
      ufid: f.name, // filename IS the UFID
      size: f.metadata?.size ?? 0,
    }));
  }

  /**
   * Delete a file from the DFS.
   */
  async delete(path: string): Promise<boolean> {
    const { error } = await this.supabase.storage
      .from(BUCKET)
      .remove([path]);

    if (!error) {
      invalidateCache(path);
    }

    return !error;
  }

  /**
   * Download a file from the DFS.
   */
  async download(path: string): Promise<Blob | null> {
    const { data, error } = await this.supabase.storage
      .from(BUCKET)
      .download(path);

    if (error) return null;
    return data;
  }
}
