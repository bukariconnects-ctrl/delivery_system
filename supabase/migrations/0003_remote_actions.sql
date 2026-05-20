-- ============================================
-- 0003_remote_actions.sql
-- Remote Invocation (RPC) + Indirect Communication
-- (Lecture 5: Remote Invocation — Slide 3, 12, 17)
-- (Lecture 5: Indirect Communication — Slide 24, 30, 37)
-- ============================================

-- ============================================
-- 1. Notifications table (Message Queue)
-- Decouples sender from receiver in Space and Time.
-- ============================================
CREATE TABLE public.notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  message     TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'order_update'
    CHECK (type IN ('order_update', 'new_order', 'driver_assigned', 'system')),
  is_read     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- RLS for notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id);

-- System (triggers/functions) can insert notifications via SECURITY DEFINER
-- No direct INSERT policy for users — only server-side functions insert.

-- Enable Realtime on notifications for Pub-Sub
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- ============================================
-- 2. RPC: place_order — Request-Reply Pattern
-- Client invokes → Server validates → Returns result
-- (Lecture 5, Slide 3: Request-Reply)
-- ============================================
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
  -- Integrity check 1: caller must be authenticated
  IF v_client_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error',   'Authentication required'
    );
  END IF;

  -- Integrity check 2: restaurant must exist and be open
  SELECT * INTO v_restaurant
  FROM public.restaurants
  WHERE id = p_restaurant_id;

  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error',   'Restaurant not found'
    );
  END IF;

  IF NOT v_restaurant.is_open THEN
    RETURN json_build_object(
      'success', false,
      'error',   'Restaurant is currently closed'
    );
  END IF;

  -- Integrity check 3: total must be positive
  IF p_total <= 0 THEN
    RETURN json_build_object(
      'success', false,
      'error',   'Total amount must be positive'
    );
  END IF;

  -- Create the order (atomic operation)
  INSERT INTO public.orders (client_id, restaurant_id, status, total_amount)
  VALUES (v_client_id, p_restaurant_id, 'pending', p_total)
  RETURNING id INTO v_order_id;

  -- Indirect Communication: insert notification for restaurant owner
  INSERT INTO public.notifications (user_id, title, message, type)
  VALUES (
    v_restaurant.owner_id,
    'طلب جديد',
    'تم استلام طلب جديد بقيمة ' || p_total || ' ر.س',
    'new_order'
  );

  -- Reply with success + order ID
  RETURN json_build_object(
    'success',  true,
    'order_id', v_order_id,
    'message',  'Order placed successfully'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 3. RPC: accept_order — Request-Reply Pattern
-- Driver invokes → Server validates → Assigns driver
-- ============================================
CREATE OR REPLACE FUNCTION public.accept_order(
  p_order_id  UUID,
  p_driver_id UUID
)
RETURNS JSON AS $$
DECLARE
  v_order       public.orders%ROWTYPE;
  v_driver_loc  public.driver_locations%ROWTYPE;
BEGIN
  -- Integrity check 1: caller must be authenticated
  IF auth.uid() IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error',   'Authentication required'
    );
  END IF;

  -- Integrity check 2: order must exist and be pending
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE; -- lock the row to prevent race conditions

  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error',   'Order not found'
    );
  END IF;

  IF v_order.status <> 'pending' THEN
    RETURN json_build_object(
      'success', false,
      'error',   'Order is no longer available (status: ' || v_order.status || ')'
    );
  END IF;

  IF v_order.driver_id IS NOT NULL THEN
    RETURN json_build_object(
      'success', false,
      'error',   'Order already assigned to another driver'
    );
  END IF;

  -- Integrity check 3: driver must be online
  SELECT * INTO v_driver_loc
  FROM public.driver_locations
  WHERE driver_id = p_driver_id;

  IF NOT FOUND OR NOT v_driver_loc.is_online THEN
    RETURN json_build_object(
      'success', false,
      'error',   'Driver must be online to accept orders'
    );
  END IF;

  -- Integrity check 4: driver must not have stale heartbeat (>30s)
  IF v_driver_loc.updated_at < (now() - INTERVAL '30 seconds') THEN
    RETURN json_build_object(
      'success', false,
      'error',   'Driver heartbeat is stale — reconnect required'
    );
  END IF;

  -- Assign driver and update status (atomic)
  UPDATE public.orders
  SET driver_id = p_driver_id,
      status    = 'accepted'
  WHERE id = p_order_id;

  -- Indirect Communication: notify client that order was accepted
  INSERT INTO public.notifications (user_id, title, message, type)
  VALUES (
    v_order.client_id,
    'تم قبول طلبك',
    'تم تعيين سائق لطلبك وسيصل قريباً',
    'driver_assigned'
  );

  -- Notify restaurant too
  INSERT INTO public.notifications (user_id, title, message, type)
  SELECT
    r.owner_id,
    'تم تعيين سائق',
    'تم تعيين سائق للطلب — ابدأ التحضير',
    'order_update'
  FROM public.restaurants r
  WHERE r.id = v_order.restaurant_id;

  RETURN json_build_object(
    'success',   true,
    'order_id',  p_order_id,
    'driver_id', p_driver_id,
    'message',   'Order accepted successfully'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 4. Trigger: notify_on_order_change
-- Indirect Communication — Message Queue pattern
-- Automatically enqueues a notification when
-- an order status changes (Lecture 5, Slide 37).
-- ============================================
CREATE OR REPLACE FUNCTION public.notify_on_order_change()
RETURNS TRIGGER AS $$
DECLARE
  v_title   TEXT;
  v_message TEXT;
BEGIN
  -- Only fire on status changes
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Build human-readable message
  CASE NEW.status
    WHEN 'accepted' THEN
      v_title   := 'تم قبول الطلب';
      v_message := 'تم قبول طلبك وسيتم تحضيره قريباً';
    WHEN 'preparing' THEN
      v_title   := 'جاري التحضير';
      v_message := 'المطعم يقوم بتحضير طلبك الآن';
    WHEN 'ready_for_pickup' THEN
      v_title   := 'جاهز للاستلام';
      v_message := 'طلبك جاهز وبانتظار السائق';
    WHEN 'picked_up' THEN
      v_title   := 'تم الاستلام';
      v_message := 'السائق استلم طلبك ويتجه إليك';
    WHEN 'in_transit' THEN
      v_title   := 'في الطريق';
      v_message := 'طلبك في الطريق إليك';
    WHEN 'delivered' THEN
      v_title   := 'تم التوصيل';
      v_message := 'تم توصيل طلبك بنجاح!';
    WHEN 'cancelled' THEN
      v_title   := 'تم الإلغاء';
      v_message := 'تم إلغاء الطلب';
    ELSE
      v_title   := 'تحديث الطلب';
      v_message := 'تم تحديث حالة طلبك إلى ' || NEW.status;
  END CASE;

  -- Enqueue notification for the client (order owner)
  INSERT INTO public.notifications (user_id, title, message, type)
  VALUES (NEW.client_id, v_title, v_message, 'order_update');

  -- If driver is assigned, notify the driver too
  IF NEW.driver_id IS NOT NULL AND NEW.driver_id <> coalesce(OLD.driver_id, '00000000-0000-0000-0000-000000000000'::UUID) THEN
    INSERT INTO public.notifications (user_id, title, message, type)
    VALUES (NEW.driver_id, 'طلب جديد مُعيّن', 'تم تعيينك لتوصيل طلب جديد', 'order_update');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_order_status_change
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_order_change();

-- Grant RPC access
GRANT EXECUTE ON FUNCTION public.place_order(UUID, JSONB, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_order(UUID, UUID) TO authenticated;
