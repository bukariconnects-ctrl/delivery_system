-- ============================================
-- 0007_order_lifecycle.sql
-- Full Order Lifecycle Support
-- Client → Restaurant → Driver → Delivery
-- ============================================

-- 1. Add items JSONB column to orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS items JSONB DEFAULT '[]';

-- 2. Update place_order to store items in the order
CREATE OR REPLACE FUNCTION public.place_order(
  p_restaurant_id UUID,
  p_items         JSONB,
  p_total         NUMERIC
)
RETURNS JSON AS $$
DECLARE
  v_restaurant  public.restaurants%ROWTYPE;
  v_order_id    UUID;
  v_client_id   UUID := auth.uid();
BEGIN
  IF v_client_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Authentication required');
  END IF;

  SELECT * INTO v_restaurant FROM public.restaurants WHERE id = p_restaurant_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Restaurant not found');
  END IF;

  IF NOT v_restaurant.is_open THEN
    RETURN json_build_object('success', false, 'error', 'Restaurant is currently closed');
  END IF;

  IF p_total <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Total amount must be positive');
  END IF;

  INSERT INTO public.orders (client_id, restaurant_id, status, total_amount, items)
  VALUES (v_client_id, p_restaurant_id, 'pending', p_total, p_items)
  RETURNING id INTO v_order_id;

  INSERT INTO public.notifications (user_id, title, message, type)
  VALUES (
    v_restaurant.owner_id,
    'طلب جديد',
    'تم استلام طلب جديد بقيمة ' || p_total || ' ر.س',
    'new_order'
  );

  RETURN json_build_object(
    'success', true,
    'order_id', v_order_id,
    'message', 'Order placed successfully'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Update accept_order to work with ready_for_pickup status
CREATE OR REPLACE FUNCTION public.accept_order(
  p_order_id  UUID,
  p_driver_id UUID
)
RETURNS JSON AS $$
DECLARE
  v_order       public.orders%ROWTYPE;
  v_driver_loc  public.driver_locations%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Authentication required');
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Order not found');
  END IF;

  -- Accept orders that are ready_for_pickup and not yet assigned to a driver
  IF v_order.status <> 'ready_for_pickup' THEN
    RETURN json_build_object('success', false, 'error', 'Order is not ready for pickup (status: ' || v_order.status || ')');
  END IF;

  IF v_order.driver_id IS NOT NULL THEN
    RETURN json_build_object('success', false, 'error', 'Order already assigned to another driver');
  END IF;

  SELECT * INTO v_driver_loc FROM public.driver_locations WHERE driver_id = p_driver_id;
  IF NOT FOUND OR NOT v_driver_loc.is_online THEN
    RETURN json_build_object('success', false, 'error', 'Driver must be online to accept orders');
  END IF;

  -- Assign driver and set picked_up status
  UPDATE public.orders
  SET driver_id = p_driver_id,
      status    = 'picked_up'
  WHERE id = p_order_id;

  INSERT INTO public.notifications (user_id, title, message, type)
  VALUES (
    v_order.client_id,
    'تم استلام طلبك',
    'سائق قبل طلبك ويتجه إليك',
    'driver_assigned'
  );

  RETURN json_build_object(
    'success', true,
    'order_id', p_order_id,
    'driver_id', p_driver_id,
    'message', 'Order accepted successfully'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Drivers need to see orders that are ready_for_pickup (no driver yet)
CREATE POLICY "Drivers can view ready_for_pickup orders"
  ON public.orders FOR SELECT
  USING (
    status = 'ready_for_pickup'
    AND driver_id IS NULL
    AND auth.uid() IN (
      SELECT id FROM public.profiles WHERE role = 'driver'
    )
  );

-- 5. Allow restaurants to view all their restaurants (even closed) for dashboard
CREATE POLICY "Owners can view their own restaurants including closed"
  ON public.restaurants FOR SELECT
  USING (auth.uid() = owner_id);
