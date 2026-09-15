-- ENUMS
CREATE TYPE public.app_role AS ENUM ('admin','family_viewer','staff');
CREATE TYPE public.unit_type AS ENUM ('crate','case','bottle','pack');
CREATE TYPE public.inv_txn_type AS ENUM ('stock_in','stock_out','sale_deduction','sale_reversal','adjustment');
CREATE TYPE public.payment_method AS ENUM ('cash','transfer','credit');
CREATE TYPE public.payment_status AS ENUM ('paid','partial','owing');
CREATE TYPE public.distribution_status AS ENUM ('pending','sent','confirmed');

-- UPDATED AT HELPER
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- OWNERSHIP SHARES (referenced by profiles)
CREATE TABLE public.ownership_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stakeholder_name TEXT NOT NULL,
  share_percentage NUMERIC(6,3) NOT NULL CHECK (share_percentage >= 0 AND share_percentage <= 100),
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ownership_shares TO authenticated;
GRANT ALL ON public.ownership_shares TO service_role;
ALTER TABLE public.ownership_shares ENABLE ROW LEVEL SECURITY;

-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  linked_stakeholder_id UUID REFERENCES public.ownership_shares(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- USER ROLES
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'admin');
$$;

CREATE OR REPLACE FUNCTION public.my_stakeholder_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT linked_stakeholder_id FROM public.profiles WHERE id = auth.uid();
$$;

-- new user handling: first user becomes admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE has_admin BOOLEAN;
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)), NEW.email);
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') INTO has_admin;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN has_admin THEN 'family_viewer'::public.app_role ELSE 'admin'::public.app_role END);
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- PRODUCTS
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  sku TEXT UNIQUE,
  category TEXT NOT NULL DEFAULT 'Coca-Cola',
  unit_type public.unit_type NOT NULL DEFAULT 'crate',
  cost_price NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
  selling_price NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (selling_price >= 0),
  reorder_threshold INTEGER NOT NULL DEFAULT 10 CHECK (reorder_threshold >= 0),
  quantity_on_hand INTEGER NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- INVENTORY TRANSACTIONS
CREATE TABLE public.inventory_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  type public.inv_txn_type NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_cost NUMERIC(14,2),
  supplier TEXT,
  reference TEXT,
  reason TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.inventory_transactions TO authenticated;
GRANT ALL ON public.inventory_transactions TO service_role;
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;

-- SALES
CREATE TABLE public.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_date DATE NOT NULL DEFAULT CURRENT_DATE,
  customer_name TEXT,
  payment_method public.payment_method NOT NULL DEFAULT 'cash',
  payment_status public.payment_status NOT NULL DEFAULT 'paid',
  amount_paid NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  total_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  total_cost NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_cost >= 0),
  is_voided BOOLEAN NOT NULL DEFAULT false,
  void_reason TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.sales TO authenticated;
GRANT ALL ON public.sales TO service_role;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(14,2) NOT NULL CHECK (unit_price >= 0),
  unit_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.sale_items TO authenticated;
GRANT ALL ON public.sale_items TO service_role;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;

-- EXPENSES
CREATE TABLE public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  category TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
  description TEXT,
  receipt_url TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- PROFIT DISTRIBUTIONS
CREATE TABLE public.profit_distributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stakeholder_id UUID NOT NULL REFERENCES public.ownership_shares(id) ON DELETE RESTRICT,
  amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
  source_period TEXT,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_reference TEXT,
  status public.distribution_status NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profit_distributions TO authenticated;
GRANT ALL ON public.profit_distributions TO service_role;
ALTER TABLE public.profit_distributions ENABLE ROW LEVEL SECURITY;

-- AUDIT LOG
CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id UUID,
  action TEXT NOT NULL,
  changed_by UUID,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  old_value JSONB,
  new_value JSONB
);
GRANT SELECT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- BUSINESS SETTINGS (single row)
CREATE TABLE public.business_settings (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  business_name TEXT NOT NULL DEFAULT 'Medina Stores',
  logo_url TEXT,
  currency_code TEXT NOT NULL DEFAULT 'NGN',
  currency_symbol TEXT NOT NULL DEFAULT '₦',
  shared_visibility BOOLEAN NOT NULL DEFAULT false,
  categories TEXT[] NOT NULL DEFAULT ARRAY['Coca-Cola','Fanta','Sprite','Water','Energy','Other'],
  expense_categories TEXT[] NOT NULL DEFAULT ARRAY['Rent','Transport','Salaries','Utilities','Maintenance','Other'],
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.business_settings TO authenticated;
GRANT ALL ON public.business_settings TO service_role;
ALTER TABLE public.business_settings ENABLE ROW LEVEL SECURITY;
INSERT INTO public.business_settings (id) VALUES (true);

-- POLICIES
CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.is_admin());
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid() OR public.is_admin()) WITH CHECK (id = auth.uid() OR public.is_admin());
CREATE POLICY "admin delete profile" ON public.profiles FOR DELETE TO authenticated USING (public.is_admin());

CREATE POLICY "read own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "shares read" ON public.ownership_shares FOR SELECT TO authenticated USING (public.is_admin() OR id = public.my_stakeholder_id());
CREATE POLICY "shares admin write" ON public.ownership_shares FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "shares admin update" ON public.ownership_shares FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "shares admin delete" ON public.ownership_shares FOR DELETE TO authenticated USING (public.is_admin());

CREATE POLICY "products read" ON public.products FOR SELECT TO authenticated USING (public.is_admin() OR public.has_role(auth.uid(),'staff'));
CREATE POLICY "products insert" ON public.products FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "products update" ON public.products FOR UPDATE TO authenticated USING (public.is_admin() OR public.has_role(auth.uid(),'staff')) WITH CHECK (public.is_admin() OR public.has_role(auth.uid(),'staff'));
CREATE POLICY "products delete" ON public.products FOR DELETE TO authenticated USING (public.is_admin());

CREATE POLICY "inv read" ON public.inventory_transactions FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "inv insert" ON public.inventory_transactions FOR INSERT TO authenticated WITH CHECK ((public.is_admin() OR public.has_role(auth.uid(),'staff')) AND created_by = auth.uid());

CREATE POLICY "sales read" ON public.sales FOR SELECT TO authenticated USING (public.is_admin() OR public.has_role(auth.uid(),'staff'));
CREATE POLICY "sales insert" ON public.sales FOR INSERT TO authenticated WITH CHECK ((public.is_admin() OR public.has_role(auth.uid(),'staff')) AND created_by = auth.uid());
CREATE POLICY "sales update" ON public.sales FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "sale items read" ON public.sale_items FOR SELECT TO authenticated USING (public.is_admin() OR public.has_role(auth.uid(),'staff'));
CREATE POLICY "sale items insert" ON public.sale_items FOR INSERT TO authenticated WITH CHECK (public.is_admin() OR public.has_role(auth.uid(),'staff'));

CREATE POLICY "expenses admin all" ON public.expenses FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "dist read" ON public.profit_distributions FOR SELECT TO authenticated
  USING (public.is_admin() OR stakeholder_id = public.my_stakeholder_id());
CREATE POLICY "dist admin insert" ON public.profit_distributions FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "dist admin update" ON public.profit_distributions FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "dist admin delete" ON public.profit_distributions FOR DELETE TO authenticated USING (public.is_admin());

CREATE POLICY "audit admin read" ON public.audit_log FOR SELECT TO authenticated USING (public.is_admin());

CREATE POLICY "settings read" ON public.business_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "settings admin update" ON public.business_settings FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- TRIGGERS: updated_at
CREATE TRIGGER t_products_upd BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_sales_upd BEFORE UPDATE ON public.sales FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_expenses_upd BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_shares_upd BEFORE UPDATE ON public.ownership_shares FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_dist_upd BEFORE UPDATE ON public.profit_distributions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER t_profiles_upd BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- INVENTORY MOVEMENT: apply stock change + audit
CREATE OR REPLACE FUNCTION public.apply_inventory_txn()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE delta INTEGER;
BEGIN
  delta := CASE NEW.type
    WHEN 'stock_in' THEN NEW.quantity
    WHEN 'sale_reversal' THEN NEW.quantity
    WHEN 'adjustment' THEN NEW.quantity
    ELSE -NEW.quantity END;
  UPDATE public.products SET quantity_on_hand = quantity_on_hand + delta WHERE id = NEW.product_id;
  INSERT INTO public.audit_log(table_name, record_id, action, changed_by, new_value)
  VALUES ('inventory_transactions', NEW.id, NEW.type::text, NEW.created_by, to_jsonb(NEW));
  RETURN NEW;
END; $$;
CREATE TRIGGER t_inv_apply AFTER INSERT ON public.inventory_transactions
  FOR EACH ROW EXECUTE FUNCTION public.apply_inventory_txn();

CREATE OR REPLACE FUNCTION public.audit_distribution()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.audit_log(table_name, record_id, action, changed_by, old_value, new_value)
  VALUES ('profit_distributions', COALESCE(NEW.id, OLD.id), TG_OP, auth.uid(),
          CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,
          CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END);
  RETURN COALESCE(NEW, OLD);
END; $$;
CREATE TRIGGER t_dist_audit AFTER INSERT OR UPDATE OR DELETE ON public.profit_distributions
  FOR EACH ROW EXECUTE FUNCTION public.audit_distribution();

-- RECORD SALE (atomic, stock-safe)
CREATE OR REPLACE FUNCTION public.record_sale(
  p_sale_date DATE,
  p_customer_name TEXT,
  p_payment_method public.payment_method,
  p_payment_status public.payment_status,
  p_amount_paid NUMERIC,
  p_notes TEXT,
  p_items JSONB
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sale_id UUID; item JSONB; v_prod public.products%ROWTYPE;
  v_total NUMERIC := 0; v_cost NUMERIC := 0; v_qty INTEGER; v_price NUMERIC;
BEGIN
  IF NOT (public.is_admin() OR public.has_role(auth.uid(),'staff')) THEN
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
GRANT EXECUTE ON FUNCTION public.record_sale(DATE,TEXT,public.payment_method,public.payment_status,NUMERIC,TEXT,JSONB) TO authenticated;

-- VOID SALE (restores stock)
CREATE OR REPLACE FUNCTION public.void_sale(p_sale_id UUID, p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE it public.sale_items%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only an admin can void a sale'; END IF;
  IF EXISTS (SELECT 1 FROM public.sales WHERE id = p_sale_id AND is_voided) THEN RETURN; END IF;
  FOR it IN SELECT * FROM public.sale_items WHERE sale_id = p_sale_id LOOP
    INSERT INTO public.inventory_transactions (product_id, type, quantity, unit_cost, reference, reason, created_by)
    VALUES (it.product_id, 'sale_reversal', it.quantity, it.unit_cost, p_sale_id::text, p_reason, auth.uid());
  END LOOP;
  UPDATE public.sales SET is_voided = true, void_reason = p_reason WHERE id = p_sale_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.void_sale(UUID,TEXT) TO authenticated;

-- SHARE TOTAL VALIDATION
CREATE OR REPLACE FUNCTION public.validate_share_total()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE total NUMERIC;
BEGIN
  SELECT COALESCE(SUM(share_percentage),0) INTO total FROM public.ownership_shares WHERE effective_to IS NULL;
  IF total > 100.001 THEN
    RAISE EXCEPTION 'Active share percentages total %%%, which exceeds 100%%', total;
  END IF;
  RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER t_share_total AFTER INSERT OR UPDATE ON public.ownership_shares
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.validate_share_total();