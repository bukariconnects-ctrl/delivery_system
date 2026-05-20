-- ============================================
-- 0008_order_geo_location.sql
-- Add delivery location coordinates to orders
-- Required for Geo-spatial Location Transparency
-- ============================================

-- 1. Add delivery_lat and delivery_lng columns to orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_lat NUMERIC DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS delivery_lng NUMERIC DEFAULT NULL;

-- 2. Update place_order to accept and store delivery coordinates
CREATE OR REPLACE FUNCTION public.place_order(
  p_restaurant_id UUID,
  p_items         JSONB,
  p_total         NUMERIC,
  p_delivery_lat  NUMERIC DEFAULT NULL,
  p_delivery_lng  NUMERIC DEFAULT NULL
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

  INSERT INTO public.orders (client_id, restaurant_id, status, total_amount, items, delivery_lat, delivery_lng)
  VALUES (v_client_id, p_restaurant_id, 'pending', p_total, p_items, p_delivery_lat, p_delivery_lng)
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

-- 3. RPC to manually update delivery location (for admin fixes)
CREATE OR REPLACE FUNCTION public.update_order_delivery_location(
  p_order_id      UUID,
  p_delivery_lat  NUMERIC,
  p_delivery_lng  NUMERIC
)
RETURNS JSON AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Authentication required');
  END IF;

  UPDATE public.orders
  SET delivery_lat = p_delivery_lat,
      delivery_lng = p_delivery_lng
  WHERE id = p_order_id AND client_id = auth.uid();

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Order not found or unauthorized');
  END IF;

  RETURN json_build_object('success', true, 'message', 'Delivery location updated');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
