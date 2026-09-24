/*
# Create Coca-Cola rebates table

## Purpose
Track monthly rebates received from Coca-Cola — a key financial inflow
for a distributor that is distinct from regular sales revenue.

## New table: `rebates`
- `id` (uuid, PK, default gen_random_uuid())
- `rebate_month` (date, not null) — the month the rebate applies to (stored as first-of-month)
- `rebate_type` (enum: cash, stock_credit, discount) — how the rebate was received
- `amount` (numeric(14,2), not null, >= 0) — monetary value of the rebate
- `status` (enum: pending, received) — whether it has been confirmed
- `reference` (text, nullable) — optional reference/invoice number from Coca-Cola
- `notes` (text, nullable) — optional notes
- `created_by` (uuid, FK auth.users, nullable) — who recorded it
- `created_at` (timestamptz, default now())
- `updated_at` (timestamptz, default now())

## New enums
- `rebate_type`: 'cash', 'stock_credit', 'discount'
- `rebate_status`: 'pending', 'received'

## Security
- RLS enabled on `rebates`.
- Admin-only: full CRUD. Staff and family_viewer cannot access.
- Uses `private.is_admin()` helper (established in prior migration).
- Grants: SELECT, INSERT, UPDATE, DELETE to authenticated; ALL to service_role.

## Trigger
- `t_rebates_upd` — auto-updates `updated_at` on row update (reuses existing `update_updated_at_column()`).

## Index
- `idx_rebates_month` on `rebate_month` DESC for period queries.
*/

CREATE TYPE public.rebate_type AS ENUM ('cash', 'stock_credit', 'discount');
CREATE TYPE public.rebate_status AS ENUM ('pending', 'received');

CREATE TABLE IF NOT EXISTS public.rebates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rebate_month DATE NOT NULL,
  rebate_type public.rebate_type NOT NULL DEFAULT 'cash',
  amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  status public.rebate_status NOT NULL DEFAULT 'pending',
  reference TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rebates TO authenticated;
GRANT ALL ON public.rebates TO service_role;
ALTER TABLE public.rebates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rebates admin read" ON public.rebates;
CREATE POLICY "rebates admin read" ON public.rebates FOR SELECT
  TO authenticated USING (private.is_admin());

DROP POLICY IF EXISTS "rebates admin insert" ON public.rebates;
CREATE POLICY "rebates admin insert" ON public.rebates FOR INSERT
  TO authenticated WITH CHECK (private.is_admin());

DROP POLICY IF EXISTS "rebates admin update" ON public.rebates;
CREATE POLICY "rebates admin update" ON public.rebates FOR UPDATE
  TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());

DROP POLICY IF EXISTS "rebates admin delete" ON public.rebates;
CREATE POLICY "rebates admin delete" ON public.rebates FOR DELETE
  TO authenticated USING (private.is_admin());

CREATE INDEX IF NOT EXISTS idx_rebates_month ON public.rebates (rebate_month DESC);

CREATE TRIGGER t_rebates_upd BEFORE UPDATE ON public.rebates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
