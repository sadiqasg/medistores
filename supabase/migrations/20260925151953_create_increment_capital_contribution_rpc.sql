/*
# Create increment_capital_contribution RPC function

## What this migration does
Creates a SECURITY DEFINER function that atomically increments the `capital_contribution`
column on `ownership_shares` for a given shareholder. This is called when a family
member reinvests their profit share back into the business.

## Security
- SECURITY DEFINER so it can update ownership_shares regardless of RLS.
- Only accepts two parameters: shareholder UUID and amount.
- The function is callable by authenticated users only (existing RLS on ownership_shares
  handles read access; this function handles the atomic increment).
*/

CREATE OR REPLACE FUNCTION increment_capital_contribution(p_shareholder_id uuid, p_amount numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE ownership_shares
  SET capital_contribution = capital_contribution + p_amount,
      updated_at = now()
  WHERE id = p_shareholder_id;
END;
$$;

GRANT EXECUTE ON FUNCTION increment_capital_contribution(uuid, numeric) TO authenticated;
