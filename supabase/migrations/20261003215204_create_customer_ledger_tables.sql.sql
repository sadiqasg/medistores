/*
# Create Customer Ledger & Crate Tracking Tables

1. New Tables
- `customers`: Stores customer profiles with optional balance/empties brought forward from legacy Excel.
  - `id` (uuid PK)
  - `name` (text, defaults to "Walk-in Customer" when one_time is true)
  - `phone` (text, nullable)
  - `address` (text, nullable)
  - `is_one_time` (boolean, default false — flags walk-in customers)
  - `balance_brought_forward` (numeric, default 0 — outstanding financial debt carried from legacy system)
  - `empties_brought_forward` (integer, default 0 — crates held by customer carried from legacy system)
  - `notes` (text, nullable)
  - `is_active` (boolean, default true)
  - `created_at`, `updated_at` (timestamps)

- `customer_transactions`: Records every supply/payment/empties exchange with a customer.
  - `id` (uuid PK)
  - `customer_id` (uuid FK → customers.id ON DELETE CASCADE)
  - `transaction_date` (date, not null)
  - `type` (text: 'supply' | 'payment' | 'crate_out' | 'crate_return' | 'adjustment')
  - `description` (text, nullable)
  - `amount` (numeric, default 0 — invoice/supply amount or payment received)
  - `amount_paid` (numeric, default 0 — portion paid for supplies)
  - `crates_delivered` (integer, default 0 — full crates sent out to customer)
  - `crates_returned` (integer, default 0 — empty crates returned by customer)
  - `reference` (text, nullable — optional reference like sale ID or receipt number)
  - `created_at` (timestamp)

2. Security
- Enable RLS on both tables.
- Policies scoped TO authenticated (app has sign-in screen) with ownership via auth.uid() not needed — this is shared business data accessible to all authenticated staff.
- All authenticated users can read/write customer data (business operational data, not per-user).

3. Important Notes
- `balance_brought_forward` and `empties_brought_forward` allow migration from legacy Excel ledgers.
- The running financial balance for a customer = balance_brought_forward + SUM(amount) - SUM(amount_paid).
- The running crate balance = empties_brought_forward + SUM(crates_delivered) - SUM(crates_returned).
- `is_one_time` customers default name to "Walk-in Customer" and don't clutter recurring customer views.
*/

CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'Walk-in Customer',
  phone text,
  address text,
  is_one_time boolean NOT NULL DEFAULT false,
  balance_brought_forward numeric NOT NULL DEFAULT 0,
  empties_brought_forward integer NOT NULL DEFAULT 0,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_select_customers" ON customers;
CREATE POLICY "authenticated_select_customers"
ON customers FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_insert_customers" ON customers;
CREATE POLICY "authenticated_insert_customers"
ON customers FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_update_customers" ON customers;
CREATE POLICY "authenticated_update_customers"
ON customers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_delete_customers" ON customers;
CREATE POLICY "authenticated_delete_customers"
ON customers FOR DELETE TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS customer_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  transaction_date date NOT NULL DEFAULT CURRENT_DATE,
  type text NOT NULL CHECK (type IN ('supply','payment','crate_out','crate_return','adjustment')),
  description text,
  amount numeric NOT NULL DEFAULT 0,
  amount_paid numeric NOT NULL DEFAULT 0,
  crates_delivered integer NOT NULL DEFAULT 0,
  crates_returned integer NOT NULL DEFAULT 0,
  reference text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE customer_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_select_customer_transactions" ON customer_transactions;
CREATE POLICY "authenticated_select_customer_transactions"
ON customer_transactions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_insert_customer_transactions" ON customer_transactions;
CREATE POLICY "authenticated_insert_customer_transactions"
ON customer_transactions FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_update_customer_transactions" ON customer_transactions;
CREATE POLICY "authenticated_update_customer_transactions"
ON customer_transactions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_delete_customer_transactions" ON customer_transactions;
CREATE POLICY "authenticated_delete_customer_transactions"
ON customer_transactions FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_customer_transactions_customer_id ON customer_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_transactions_date ON customer_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_customers_is_one_time ON customers(is_one_time);
