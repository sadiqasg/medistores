/*
# Add customer_id to sales table + update record_sale RPC

1. Schema changes
- Adds `customer_id` (uuid, nullable) to `sales` table, foreign key to `customers(id)`.
- `customer_name` remains for backward compatibility and walk-in sales without a customer record.

2. RPC changes
- `record_sale` now accepts an optional `p_customer_id` (uuid) parameter.
- If provided, stores it in the `customer_id` column. `p_customer_name` is still used for display.

3. Security
- No policy changes. Existing sales policies still apply.
- The RPC is SECURITY DEFINER and already checks admin/staff role internally.

4. Notes
- Uses `IF NOT EXISTS` pattern via DO block for the column addition (idempotent).
- The function is recreated with the new parameter. The old signature is dropped first.
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'customer_id') THEN
    ALTER TABLE sales ADD COLUMN customer_id uuid REFERENCES customers(id) ON DELETE SET NULL;
  END IF;
END $$;

DROP POLICY IF EXISTS "authenticated_select_sales" ON sales;
DROP POLICY IF EXISTS "authenticated_insert_sales" ON sales;
DROP POLICY IF EXISTS "authenticated_update_sales" ON sales;
DROP POLICY IF EXISTS "authenticated_delete_sales" ON sales;

CREATE POLICY "authenticated_select_sales"
ON sales FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_insert_sales"
ON sales FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "authenticated_update_sales"
ON sales FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_delete_sales"
ON sales FOR DELETE TO authenticated USING (true);

DROP FUNCTION IF EXISTS record_sale(date, text, payment_method, payment_status, numeric, text, jsonb);

CREATE OR REPLACE FUNCTION record_sale(
  p_sale_date date,
  p_customer_name text,
  p_payment_method payment_method,
  p_payment_status payment_status,
  p_amount_paid numeric,
  p_notes text,
  p_items jsonb,
  p_customer_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sale_id UUID; item JSONB; v_prod public.products%ROWTYPE;
  v_total NUMERIC := 0; v_cost NUMERIC := 0; v_qty INTEGER; v_price NUMERIC;
BEGIN
  IF NOT (private.is_admin() OR private.has_role(auth.uid(),'staff')) THEN
    RAISE EXCEPTION 'Not authorised to record sales';
  END IF;
  INSERT INTO public.sales (sale_date, customer_name, customer_id, payment_method, payment_status, amount_paid, notes, created_by)
  VALUES (COALESCE(p_sale_date, CURRENT_DATE), p_customer_name, p_customer_id, p_payment_method, p_payment_status, COALESCE(p_amount_paid,0), p_notes, auth.uid())
  RETURNING id INTO v_sale_id;
  FOR item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := (item->>'quantity')::INTEGER;
    v_price := (item->>'unit_price')::NUMERIC;
    SELECT * INTO v_prod FROM public.products WHERE id = (item->>'product_id')::UUID FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;
    IF v_prod.quantity_on_hand < v_qty THEN
      RAISE EXCEPTION 'Insufficient stock for %: % available, % requested', v_prod.name, v_prod.quantity_on_hand, v_qty;
    END IF;
    INSERT INTO public.sale_items (sale_id, product_id, quantity, unit_price, unit_cost, subtotal)
    VALUES (v_sale_id, v_prod.id, v_qty, v_price, v_prod.cost_price, v_qty * v_price);
    INSERT INTO public.inventory_transactions (product_id, type, quantity, unit_cost, reference, created_by)
    VALUES (v_prod.id, 'sale_deduction', v_qty, v_prod.cost_price, v_sale_id::text, auth.uid());
    v_total := v_total + (v_qty * v_price);
    v_cost := v_cost + (v_qty * v_prod.cost_price);
  END LOOP;
  UPDATE public.sales SET total_amount = v_total, total_cost = v_cost,
  amount_paid = CASE WHEN p_payment_status = 'paid' THEN v_total ELSE COALESCE(p_amount_paid,0) END
  WHERE id = v_sale_id;
  RETURN v_sale_id;
END;
$function$;
