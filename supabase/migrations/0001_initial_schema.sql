-- ============================================
-- 0001_initial_schema.sql
-- Distributed Delivery System — Initial Schema
-- ============================================

-- 1. Custom ENUM types
CREATE TYPE public.user_role AS ENUM ('client', 'restaurant', 'driver');
CREATE TYPE public.order_status AS ENUM (
  'pending',
  'accepted',
  'preparing',
  'ready_for_pickup',
  'picked_up',
  'in_transit',
  'delivered',
  'cancelled'
);

-- 2. Profiles table (extends Supabase auth.users)
CREATE TABLE public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role        public.user_role NOT NULL DEFAULT 'client',
  full_name   TEXT,
  avatar_url  TEXT,
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- 3. Restaurants table
CREATE TABLE public.restaurants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  latitude    DOUBLE PRECISION NOT NULL DEFAULT 0,
  longitude   DOUBLE PRECISION NOT NULL DEFAULT 0,
  is_open     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- 4. Orders table
CREATE TABLE public.orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  restaurant_id   UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  driver_id       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status          public.order_status NOT NULL DEFAULT 'pending',
  total_amount    NUMERIC(10, 2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- 5. Driver locations table
CREATE TABLE public.driver_locations (
  driver_id         UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  current_latitude  DOUBLE PRECISION NOT NULL DEFAULT 0,
  current_longitude DOUBLE PRECISION NOT NULL DEFAULT 0,
  is_online         BOOLEAN NOT NULL DEFAULT false,
  updated_at        TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- Row Level Security (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE public.profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurants      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_locations ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read/update only their own profile
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Restaurants: owners can manage their own restaurants, everyone can read open restaurants
CREATE POLICY "Anyone can view open restaurants"
  ON public.restaurants FOR SELECT
  USING (is_open = true);

CREATE POLICY "Owners can manage their own restaurants"
  ON public.restaurants FOR ALL
  USING (auth.uid() = owner_id);

-- Orders: clients see their orders, restaurants see orders to them, drivers see assigned orders
CREATE POLICY "Clients can view their own orders"
  ON public.orders FOR SELECT
  USING (auth.uid() = client_id);

CREATE POLICY "Restaurants can view their orders"
  ON public.orders FOR SELECT
  USING (
    auth.uid() IN (
      SELECT owner_id FROM public.restaurants WHERE id = restaurant_id
    )
  );

CREATE POLICY "Drivers can view their assigned orders"
  ON public.orders FOR SELECT
  USING (auth.uid() = driver_id);

CREATE POLICY "Clients can create orders"
  ON public.orders FOR INSERT
  WITH CHECK (auth.uid() = client_id);

CREATE POLICY "Restaurants can update order status"
  ON public.orders FOR UPDATE
  USING (
    auth.uid() IN (
      SELECT owner_id FROM public.restaurants WHERE id = restaurant_id
    )
  );

CREATE POLICY "Drivers can update their assigned orders"
  ON public.orders FOR UPDATE
  USING (auth.uid() = driver_id);

-- Driver locations: drivers can manage their own location, restaurants/clients can view online drivers
CREATE POLICY "Drivers can manage their own location"
  ON public.driver_locations FOR ALL
  USING (auth.uid() = driver_id);

CREATE POLICY "Anyone can view online driver locations"
  ON public.driver_locations FOR SELECT
  USING (is_online = true);

-- ============================================
-- Realtime — enable for distributed sync
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_locations;

-- ============================================
-- Trigger: auto-create profile on user signup
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
