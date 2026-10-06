/*
# Fix RLS policies for expenses, inventory_transactions, and products

## Problems
1. `expenses` has a single `FOR ALL` policy scoped to `private.is_admin()` only — staff cannot read or write expenses, so they don't appear for staff users and aren't factored into P&L.
2. `inventory_transactions` INSERT policy requires `created_by = auth.uid()` but the `record_sale` RPC (SECURITY DEFINER) inserts with `auth.uid()` as created_by — this works for direct user inserts but the read policy is admin-only, so staff can't see movement history.
3. `products` INSERT is admin-only — staff can't add products.

## Changes
1. **expenses**: Split into 4 separate CRUD policies. SELECT/INSERT/UPDATE for admin+staff, DELETE for admin only.
2. **inventory_transactions**: Split into 4 separate CRUD policies. SELECT for admin+staff, INSERT for admin+staff (drop the `created_by = auth.uid()` check since RPCs set it), UPDATE/DELETE for admin only.
3. **products**: Change INSERT to allow admin+staff.

## Security
- All policies use `private.is_admin()` or `private.has_role()` for proper access control.
- No `USING (true)` shortcuts.
*/

-- ===== EXPENSES =====
DROP POLICY IF EXISTS "expenses admin all" ON expenses;
DROP POLICY IF EXISTS "expenses_select" ON expenses;
DROP POLICY IF EXISTS "expenses_insert" ON expenses;
DROP POLICY IF EXISTS "expenses_update" ON expenses;
DROP POLICY IF EXISTS "expenses_delete" ON expenses;

CREATE POLICY "expenses_select"
ON expenses FOR SELECT TO authenticated
USING (private.is_admin() OR private.has_role(auth.uid(), 'staff'::app_role));

CREATE POLICY "expenses_insert"
ON expenses FOR INSERT TO authenticated
WITH CHECK (private.is_admin() OR private.has_role(auth.uid(), 'staff'::app_role));

CREATE POLICY "expenses_update"
ON expenses FOR UPDATE TO authenticated
USING (private.is_admin() OR private.has_role(auth.uid(), 'staff'::app_role))
WITH CHECK (private.is_admin() OR private.has_role(auth.uid(), 'staff'::app_role));

CREATE POLICY "expenses_delete"
ON expenses FOR DELETE TO authenticated
USING (private.is_admin());

-- ===== INVENTORY_TRANSACTIONS =====
DROP POLICY IF EXISTS "inv insert" ON inventory_transactions;
DROP POLICY IF EXISTS "inv read" ON inventory_transactions;
DROP POLICY IF EXISTS "inv_select" ON inventory_transactions;
DROP POLICY IF EXISTS "inv_insert" ON inventory_transactions;
DROP POLICY IF EXISTS "inv_update" ON inventory_transactions;
DROP POLICY IF EXISTS "inv_delete" ON inventory_transactions;

CREATE POLICY "inv_select"
ON inventory_transactions FOR SELECT TO authenticated
USING (private.is_admin() OR private.has_role(auth.uid(), 'staff'::app_role));

CREATE POLICY "inv_insert"
ON inventory_transactions FOR INSERT TO authenticated
WITH CHECK (private.is_admin() OR private.has_role(auth.uid(), 'staff'::app_role));

CREATE POLICY "inv_update"
ON inventory_transactions FOR UPDATE TO authenticated
USING (private.is_admin())
WITH CHECK (private.is_admin());

CREATE POLICY "inv_delete"
ON inventory_transactions FOR DELETE TO authenticated
USING (private.is_admin());

-- ===== PRODUCTS =====
DROP POLICY IF EXISTS "products insert" ON products;
CREATE POLICY "products insert"
ON products FOR INSERT TO authenticated
WITH CHECK (private.is_admin() OR private.has_role(auth.uid(), 'staff'::app_role));
