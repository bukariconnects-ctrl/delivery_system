// ============================================
// P2P Layer: Distributed Hash Table (DHT) Cache
// (Lecture 6: P2P — 3rd Generation, Middleware-based)
//
// Each edge node maintains a local cache of nearby
// active nodes. Before making a costly RPC to the
// Cloud Hub, the node checks its local P2P cache.
//
// Concepts:
// - DHT: Nodes are indexed by ID for O(1) lookup.
// - Edge Caching: Reduces central server load.
// - TTL: Entries expire to handle silent departures.
// - Load Balancing: Shifts read traffic from hub to edge.
// ============================================

/** Metadata about a peer node in the P2P mesh */
export interface PeerNode {
  id: string;
  role: "client" | "restaurant" | "driver";
  displayName: string;
  latitude: number;
  longitude: number;
  isOnline: boolean;
  lastSeen: number; // Unix ms
  meta: Record<string, unknown>;
}

/** Internal cache entry with TTL tracking */
interface CacheEntry {
  node: PeerNode;
  insertedAt: number;
  ttl: number; // ms
}

/** Configuration for the P2P cache */
export interface P2PCacheConfig {
  /** Default TTL for cache entries in ms (default: 30_000) */
  defaultTtl?: number;
  /** Max entries in the cache (default: 200) */
  maxEntries?: number;
  /** Interval for eviction sweep in ms (default: 10_000) */
  evictionInterval?: number;
}

// ---- P2PCache (DHT-style in-memory store) ----

export class P2PCache {
  private store = new Map<string, CacheEntry>();
  private config: Required<P2PCacheConfig>;
  private evictionTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: P2PCacheConfig = {}) {
    this.config = {
      defaultTtl: config.defaultTtl ?? 30_000,
      maxEntries: config.maxEntries ?? 200,
      evictionInterval: config.evictionInterval ?? 10_000,
    };

    // Start background eviction
    this.evictionTimer = setInterval(() => this.evict(), this.config.evictionInterval);
  }

  // ---- Core DHT operations ----

  /** PUT: Announce/update a peer in the cache (O(1)) */
  put(node: PeerNode, ttl?: number): void {
    // Enforce max entries — evict oldest if full
    if (this.store.size >= this.config.maxEntries && !this.store.has(node.id)) {
      this.evictOldest();
    }

    this.store.set(node.id, {
      node: { ...node, lastSeen: Date.now() },
      insertedAt: Date.now(),
      ttl: ttl ?? this.config.defaultTtl,
    });
  }

  /** GET: Lookup a peer by ID (O(1)) — returns null if missing/expired */
  get(id: string): PeerNode | null {
    const entry = this.store.get(id);
    if (!entry) return null;

    // Check TTL
    if (Date.now() - entry.insertedAt > entry.ttl) {
      this.store.delete(id);
      return null;
    }

    return entry.node;
  }

  /** Check if a peer exists and is fresh */
  has(id: string): boolean {
    return this.get(id) !== null;
  }

  /** DELETE: Remove a peer from the cache */
  remove(id: string): void {
    this.store.delete(id);
  }

  // ---- Query helpers ----

  /** Get all cached peers (filters expired) */
  getAll(): PeerNode[] {
    const now = Date.now();
    const result: PeerNode[] = [];

    for (const [id, entry] of this.store) {
      if (now - entry.insertedAt > entry.ttl) {
        this.store.delete(id);
      } else {
        result.push(entry.node);
      }
    }

    return result;
  }

  /** Get all online peers of a specific role */
  getByRole(role: PeerNode["role"]): PeerNode[] {
    return this.getAll().filter((n) => n.role === role && n.isOnline);
  }

  /** Get online drivers sorted by proximity to a point */
  getNearbyDrivers(lat: number, lng: number, limit = 10): PeerNode[] {
    return this.getByRole("driver")
      .map((n) => ({
        node: n,
        distance: haversine(lat, lng, n.latitude, n.longitude),
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, limit)
      .map((x) => x.node);
  }

  /** Number of live entries */
  get size(): number {
    return this.getAll().length;
  }

  // ---- Maintenance ----

  /** Remove all expired entries */
  private evict(): void {
    const now = Date.now();
    for (const [id, entry] of this.store) {
      if (now - entry.insertedAt > entry.ttl) {
        this.store.delete(id);
      }
    }
  }

  /** Remove the oldest entry */
  private evictOldest(): void {
    let oldestId: string | null = null;
    let oldestTime = Infinity;

    for (const [id, entry] of this.store) {
      if (entry.insertedAt < oldestTime) {
        oldestTime = entry.insertedAt;
        oldestId = id;
      }
    }

    if (oldestId) this.store.delete(oldestId);
  }

  /** Destroy the cache and stop eviction */
  destroy(): void {
    if (this.evictionTimer) {
      clearInterval(this.evictionTimer);
      this.evictionTimer = null;
    }
    this.store.clear();
  }
}

// ---- Haversine distance (km) ----

function haversine(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

// ---- Singleton factory ----

let _cache: P2PCache | null = null;

export function getP2PCache(config?: P2PCacheConfig): P2PCache {
  if (!_cache) {
    _cache = new P2PCache(config);
  }
  return _cache;
}
