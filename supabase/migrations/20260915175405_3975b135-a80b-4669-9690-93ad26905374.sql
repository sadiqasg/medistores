CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;
CREATE OR REPLACE FUNCTION private.is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin');
$$;
CREATE OR REPLACE FUNCTION private.my_stakeholder_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT linked_stakeholder_id FROM public.profiles WHERE id = auth.uid();
$$;
GRANT EXECUTE ON FUNCTION private.has_role(UUID, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION private.my_stakeholder_id() TO authenticated;

DROP POLICY "own profile read" ON public.profiles;
DROP POLICY "own profile update" ON public.profiles;
DROP POLICY "admin delete profile" ON public.profiles;
DROP POLICY "read own roles" ON public.user_roles;
DROP POLICY "shares read" ON public.ownership_shares;
DROP POLICY "shares admin write" ON public.ownership_shares;
DROP POLICY "shares admin update" ON public.ownership_shares;
DROP POLICY "shares admin delete" ON public.ownership_shares;
DROP POLICY "products read" ON public.products;
DROP POLICY "products insert" ON public.products;
DROP POLICY "products update" ON public.products;
DROP POLICY "products delete" ON public.products;
DROP POLICY "inv read" ON public.inventory_transactions;
DROP POLICY "inv insert" ON public.inventory_transactions;
DROP POLICY "sales read" ON public.sales;
DROP POLICY "sales insert" ON public.sales;
DROP POLICY "sales update" ON public.sales;
DROP POLICY "sale items read" ON public.sale_items;
DROP POLICY "sale items insert" ON public.sale_items;
DROP POLICY "expenses admin all" ON public.expenses;
DROP POLICY "dist read" ON public.profit_distributions;
DROP POLICY "dist admin insert" ON public.profit_distributions;
DROP POLICY "dist admin update" ON public.profit_distributions;
DROP POLICY "dist admin delete" ON public.profit_distributions;
DROP POLICY "audit admin read" ON public.audit_log;
DROP POLICY "settings admin update" ON public.business_settings;

CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR private.is_admin());
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid() OR private.is_admin()) WITH CHECK (id = auth.uid() OR private.is_admin());
CREATE POLICY "admin delete profile" ON public.profiles FOR DELETE TO authenticated USING (private.is_admin());

CREATE POLICY "read own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR private.is_admin());

CREATE POLICY "shares read" ON public.ownership_shares FOR SELECT TO authenticated USING (private.is_admin() OR id = private.my_stakeholder_id());
CREATE POLICY "shares admin write" ON public.ownership_shares FOR INSERT TO authenticated WITH CHECK (private.is_admin());
CREATE POLICY "shares admin update" ON public.ownership_shares FOR UPDATE TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());
CREATE POLICY "shares admin delete" ON public.ownership_shares FOR DELETE TO authenticated USING (private.is_admin());

CREATE POLICY "products read" ON public.products FOR SELECT TO authenticated USING (private.is_admin() OR private.has_role(auth.uid(),'staff'));
CREATE POLICY "products insert" ON public.products FOR INSERT TO authenticated WITH CHECK (private.is_admin());
CREATE POLICY "products update" ON public.products FOR UPDATE TO authenticated USING (private.is_admin() OR private.has_role(auth.uid(),'staff')) WITH CHECK (private.is_admin() OR private.has_role(auth.uid(),'staff'));
CREATE POLICY "products delete" ON public.products FOR DELETE TO authenticated USING (private.is_admin());

CREATE POLICY "inv read" ON public.inventory_transactions FOR SELECT TO authenticated USING (private.is_admin());
CREATE POLICY "inv insert" ON public.inventory_transactions FOR INSERT TO authenticated WITH CHECK ((private.is_admin() OR private.has_role(auth.uid(),'staff')) AND created_by = auth.uid());

CREATE POLICY "sales read" ON public.sales FOR SELECT TO authenticated USING (private.is_admin() OR private.has_role(auth.uid(),'staff'));
CREATE POLICY "sales insert" ON public.sales FOR INSERT TO authenticated WITH CHECK ((private.is_admin() OR private.has_role(auth.uid(),'staff')) AND created_by = auth.uid());
CREATE POLICY "sales update" ON public.sales FOR UPDATE TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());

CREATE POLICY "sale items read" ON public.sale_items FOR SELECT TO authenticated USING (private.is_admin() OR private.has_role(auth.uid(),'staff'));
CREATE POLICY "sale items insert" ON public.sale_items FOR INSERT TO authenticated WITH CHECK (private.is_admin() OR private.has_role(auth.uid(),'staff'));

CREATE POLICY "expenses admin all" ON public.expenses FOR ALL TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());

CREATE POLICY "dist read" ON public.profit_distributions FOR SELECT TO authenticated USING (private.is_admin() OR stakeholder_id = private.my_stakeholder_id());
CREATE POLICY "dist admin insert" ON public.profit_distributions FOR INSERT TO authenticated WITH CHECK (private.is_admin());
CREATE POLICY "dist admin update" ON public.profit_distributions FOR UPDATE TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());
CREATE POLICY "dist admin delete" ON public.profit_distributions FOR DELETE TO authenticated USING (private.is_admin());

CREATE POLICY "audit admin read" ON public.audit_log FOR SELECT TO authenticated USING (private.is_admin());
CREATE POLICY "settings admin update" ON public.business_settings FOR UPDATE TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());

CREATE OR REPLACE FUNCTION public.record_sale(
  p_sale_date DATE, p_customer_name TEXT, p_payment_method public.payment_method,
  p_payment_status public.payment_status, p_amount_paid NUMERIC, p_notes TEXT, p_items JSONB
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sale_id UUID; item JSONB; v_prod public.products%ROWTYPE;
  v_total NUMERIC := 0; v_cost NUMERIC := 0; v_qty INTEGER; v_price NUMERIC;
BEGIN
  IF NOT (private.is_admin() OR private.has_role(auth.uid(),'staff')) THEN
    RAISE EXCEPTION 'Not authorised to record sales';
  END IF;
  INSERT INTO public.sales (sale_date, customer_name, payment_method, payment_status, amount_paid, notes, created_by)
  VALUES (COALESCE(p_sale_date, CURRENT_DATE), p_customer_name, p_payment_method, p_payment_status, COALESCE(p_amount_paid,0), p_notes, auth.uid())
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
END; $$;

CREATE OR REPLACE FUNCTION public.void_sale(p_sale_id UUID, p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE it public.sale_items%ROWTYPE;
BEGIN
  IF NOT private.is_admin() THEN RAISE EXCEPTION 'Only an admin can void a sale'; END IF;
  IF EXISTS (SELECT 1 FROM public.sales WHERE id = p_sale_id AND is_voided) THEN RETURN; END IF;
  FOR it IN SELECT * FROM public.sale_items WHERE sale_id = p_sale_id LOOP
    INSERT INTO public.inventory_transactions (product_id, type, quantity, unit_cost, reference, reason, created_by)
    VALUES (it.product_id, 'sale_reversal', it.quantity, it.unit_cost, p_sale_id::text, p_reason, auth.uid());
  END LOOP;
  UPDATE public.sales SET is_voided = true, void_reason = p_reason WHERE id = p_sale_id;
END; $$;

DROP FUNCTION public.has_role(UUID, public.app_role);
DROP FUNCTION public.is_admin();
DROP FUNCTION public.my_stakeholder_id();