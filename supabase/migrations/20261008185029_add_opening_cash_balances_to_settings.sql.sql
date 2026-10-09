/*
# Add opening cash balances to business_settings

1. Modified Tables
- `business_settings`: Added two new columns:
  - `opening_cash_at_hand` (numeric, default 0) — the starting cash amount kept physically in the store.
  - `opening_cash_in_bank` (numeric, default 0) — the starting cash amount in the business bank account.
2. Security
- No changes to existing RLS policies. business_settings already has policies in place.
3. Notes
- These columns replace the previous 60/40 heuristic split used in the balance sheet.
- Both columns default to 0 so existing rows are not affected.
*/

ALTER TABLE business_settings
  ADD COLUMN IF NOT EXISTS opening_cash_at_hand numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opening_cash_in_bank numeric NOT NULL DEFAULT 0;
