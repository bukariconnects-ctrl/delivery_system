-- ============================================
-- 0009_stripe_payment_status.sql
-- Stripe Payment Integration
-- Web Service Interoperability (Req 7)
-- Indirect Communication via Webhooks (Req 6)
-- ============================================

-- 1. Add payment_status column to orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending';

-- Add constraint to restrict values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_payment_status_check'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_payment_status_check
      CHECK (payment_status IN ('pending', 'paid', 'failed'));
  END IF;
END $$;

-- 2. Add stripe_session_id to link with Stripe Checkout Sessions
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS stripe_session_id TEXT DEFAULT NULL;

-- 3. Add index on stripe_session_id for webhook lookups
CREATE INDEX IF NOT EXISTS idx_orders_stripe_session_id
  ON public.orders(stripe_session_id);

-- 4. RPC to update payment status (used by webhook handler with service role)
CREATE OR REPLACE FUNCTION public.confirm_order_payment(
  p_stripe_session_id TEXT
)
RETURNS JSON AS $$
DECLARE
  v_order public.orders%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM public.orders
  WHERE stripe_session_id = p_stripe_session_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Order not found for session');
  END IF;

  UPDATE public.orders
  SET payment_status = 'paid',
      status = 'accepted'
  WHERE id = v_order.id;

  INSERT INTO public.notifications (user_id, title, message, type)
  VALUES (
    v_order.client_id,
    'تم الدفع',
    'تم تأكيد الدفع بنجاح وجاري تحضير طلبك',
    'payment_confirmed'
  );

  RETURN json_build_object('success', true, 'order_id', v_order.id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. RPC to set stripe session ID on order creation
CREATE OR REPLACE FUNCTION public.set_order_stripe_session(
  p_order_id UUID,
  p_stripe_session_id TEXT
)
RETURNS JSON AS $$
BEGIN
  UPDATE public.orders
  SET stripe_session_id = p_stripe_session_id
  WHERE id = p_order_id AND client_id = auth.uid();

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Order not found or unauthorized');
  END IF;

  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
