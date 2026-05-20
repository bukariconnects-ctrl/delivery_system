-- RPC function for webhook to confirm payment (SECURITY DEFINER = bypasses RLS)
CREATE OR REPLACE FUNCTION public.confirm_stripe_payment(
  p_order_id UUID,
  p_session_id TEXT
)
RETURNS JSON AS $$
BEGIN
  UPDATE public.orders
  SET payment_status = 'paid',
      status = 'accepted',
      stripe_session_id = p_session_id
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Order not found');
  END IF;

  RETURN json_build_object('success', true, 'order_id', p_order_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
