-- ============================================
-- 0014_fix_transfer_rpc_no_updated_at.sql
-- Fix: orders table does not have updated_at column
-- ============================================

CREATE OR REPLACE FUNCTION public.transfer_order_ownership(
  p_order_id UUID,
  p_new_driver_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_status TEXT;
  v_old_driver_id UUID;
BEGIN
  -- Lock the row and fetch current state
  SELECT status, driver_id
    INTO v_current_status, v_old_driver_id
    FROM public.orders
   WHERE id = p_order_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  -- Validate state: must be picked_up or in_transit
  IF v_current_status NOT IN ('picked_up', 'in_transit') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order is not in an active delivery state');
  END IF;

  -- Prevent self-transfer
  IF v_old_driver_id = p_new_driver_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot transfer to self');
  END IF;

  -- Atomic update (no updated_at — column does not exist on orders)
  UPDATE public.orders
     SET driver_id = p_new_driver_id
   WHERE id = p_order_id;

  -- Log the transfer
  INSERT INTO public.order_transfers (order_id, from_driver_id, to_driver_id, transfer_reason)
  VALUES (p_order_id, v_old_driver_id, p_new_driver_id, 'p2p_help_request');

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'old_driver_id', v_old_driver_id,
    'new_driver_id', p_new_driver_id,
    'previous_status', v_current_status
  );
END;
$$;
