// ============================================
// Distributed Delivery System — Shared Types
// Strictly enforced to match database schema
// ============================================

/** User roles matching the database enum `public.user_role` */
export type UserRole = "client" | "restaurant" | "driver" | "admin";

/** Order status matching the database enum `public.order_status` */
export type OrderStatus =
  | "pending"
  | "accepted"
  | "preparing"
  | "ready_for_pickup"
  | "picked_up"
  | "in_transit"
  | "delivered"
  | "cancelled";

/** Geographic coordinates used across all location-aware entities */
export interface GeoLocation {
  latitude: number;
  longitude: number;
}

/** User profile — maps to `public.profiles` table */
export interface UserProfile {
  id: string;
  role: UserRole;
  full_name: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  phone_number: string | null;
  address_metadata: Record<string, unknown>;
  vehicle_details: Record<string, unknown>;
  id_document_ufid: string | null;
  driver_license_ufid: string | null;
  updated_at: string;
}

/** Restaurant entity — maps to `public.restaurants` table */
export interface Restaurant {
  id: string;
  owner_id: string;
  name: string;
  latitude: number;
  longitude: number;
  is_open: boolean;
  cuisine_type: string | null;
  description: string | null;
  is_verified: boolean;
  created_at: string;
}

/** Menu item — maps to `public.menu_items` table */
export interface MenuItem {
  id: string;
  restaurant_id: string;
  name: string;
  description: string | null;
  price: number;
  image_ufid: string | null;
  created_at: string;
}

/** Order entity — maps to `public.orders` table */
export interface Order {
  id: string;
  client_id: string;
  restaurant_id: string;
  driver_id: string | null;
  status: OrderStatus;
  total_amount: number;
  items: OrderItem[];
  delivery_lat: number | null;
  delivery_lng: number | null;
  payment_status: "pending" | "paid" | "failed";
  stripe_session_id: string | null;
  created_at: string;
}

/** Enriched broadcast payload for drivers (Lecture 4, Slide 27) */
export interface OrderBroadcastPayload {
  order_id: string;
  status: OrderStatus;
  pickup_location: { lat: number; lng: number };
  delivery_location: { lat: number; lng: number };
  order_details: {
    total: number;
    items: OrderItem[];
    restaurant_name: string;
  };
}

/** Single item in an order */
export interface OrderItem {
  menu_item_id: string;
  name: string;
  price: number;
  quantity: number;
}

/** Driver location — maps to `public.driver_locations` table */
export interface DriverLocation {
  driver_id: string;
  current_latitude: number;
  current_longitude: number;
  is_online: boolean;
  updated_at: string;
}

// ============================================
// Distributed System Node Metadata
// ============================================

/** Represents a node in the distributed architecture */
export interface DistributedNode {
  role: UserRole;
  label: string;
  description: string;
  route: string;
}

/** System-wide node definitions */
export const SYSTEM_NODES: DistributedNode[] = [
  {
    role: "client",
    label: "Client Node",
    description: "طلب الطعام وتتبع التوصيل",
    route: "/dashboard/client",
  },
  {
    role: "restaurant",
    label: "Restaurant Node",
    description: "إدارة الطلبات وتحضيرها",
    route: "/dashboard/restaurant",
  },
  {
    role: "driver",
    label: "Driver Node",
    description: "استلام وتوصيل الطلبات",
    route: "/dashboard/driver",
  },
  {
    role: "admin",
    label: "System Admin",
    description: "إدارة ومراقبة النظام الموزّع",
    route: "/dashboard/admin",
  },
];
