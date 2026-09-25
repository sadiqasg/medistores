/*
# Seed family ownership shares and add distribution_type column

## What this migration does
1. Seeds the `ownership_shares` table with 5 family members if it is empty.
   The inheritance formula: Dad 40%, Son 1 15%, Son 2 15%, Daughter 1 15%, Daughter 2 15%.
2. Adds a `distribution_type` column to `profit_distributions` to distinguish
   cash withdrawals from reinvested profits. Values: 'withdrawal' (default) or 'reinvestment'.
3. Adds a `capital_contribution` column to `ownership_shares` to track the rolling
   total capital contributed by each family member through reinvestments.

## Tables modified
- `ownership_shares`: added `capital_contribution` numeric column (default 0)
- `profit_distributions`: added `distribution_type` text column (default 'withdrawal')

## Security
- No changes to RLS policies. Existing policies remain in effect.
*/

-- Add capital_contribution column to ownership_shares if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ownership_shares' AND column_name = 'capital_contribution'
  ) THEN
    ALTER TABLE ownership_shares ADD COLUMN capital_contribution numeric NOT NULL DEFAULT 0;
  END IF;
END $$;

-- Add distribution_type column to profit_distributions if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profit_distributions' AND column_name = 'distribution_type'
  ) THEN
    ALTER TABLE profit_distributions ADD COLUMN distribution_type text NOT NULL DEFAULT 'withdrawal';
  END IF;
END $$;

-- Seed 5 family members if the table is empty
INSERT INTO ownership_shares (stakeholder_name, share_percentage, effective_from, effective_to, capital_contribution)
SELECT * FROM (VALUES
  ('Dad'::text, 40.00::numeric, CURRENT_DATE::date, NULL::date, 0::numeric),
  ('Son 1'::text, 15.00::numeric, CURRENT_DATE::date, NULL::date, 0::numeric),
  ('Son 2'::text, 15.00::numeric, CURRENT_DATE::date, NULL::date, 0::numeric),
  ('Daughter 1'::text, 15.00::numeric, CURRENT_DATE::date, NULL::date, 0::numeric),
  ('Daughter 2'::text, 15.00::numeric, CURRENT_DATE::date, NULL::date, 0::numeric)
) AS t(name, pct, eff_from, eff_to, capital)
WHERE NOT EXISTS (SELECT 1 FROM ownership_shares);
