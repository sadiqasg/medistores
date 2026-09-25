/*
# Update ownership_shares to exact 7-member family distribution matrix

## What this migration does
1. Deletes the 5 placeholder shareholders (Dad, Son 1, Son 2, Daughter 1, Daughter 2).
2. Inserts the exact 7-member family distribution matrix:
   - BABA: 25%
   - MUHAMMED: 20%
   - HAMZA: 20%
   - MAMA: 12.5%
   - NANA: 12.5%
   - SMALL MUMMY: 5%
   - BIG MUMMY: 5%
3. Context: MUHAMMED and HAMZA each willingly transferred 5% from their base
   inheritance to SMALL MUMMY and BIG MUMMY respectively for managing the store.

## Tables modified
- `ownership_shares`: rows replaced (old 5 deleted, new 7 inserted)

## Security
- No changes to RLS policies.
*/

DELETE FROM ownership_shares;

INSERT INTO ownership_shares (stakeholder_name, share_percentage, effective_from, effective_to, capital_contribution)
VALUES
  ('BABA',         25.00, CURRENT_DATE, NULL, 0),
  ('MUHAMMED',     20.00, CURRENT_DATE, NULL, 0),
  ('HAMZA',        20.00, CURRENT_DATE, NULL, 0),
  ('MAMA',         12.50, CURRENT_DATE, NULL, 0),
  ('NANA',         12.50, CURRENT_DATE, NULL, 0),
  ('SMALL MUMMY',   5.00, CURRENT_DATE, NULL, 0),
  ('BIG MUMMY',     5.00, CURRENT_DATE, NULL, 0);
