/*
# Add admin CRUD policies for user_roles

1. Purpose
Currently `user_roles` only has a SELECT policy (read own or admin). Admins need to
INSERT, UPDATE, and DELETE role assignments to manage team members from the Settings page.

2. Security
- All three new policies are scoped `TO authenticated` with `private.is_admin()` guard.
- Only admins can assign, change, or revoke roles.
- Non-admin users get no access to these operations.

3. Notes
- Re-uses the existing `private.is_admin()` helper function.
- Uses DROP POLICY IF EXISTS first for idempotency.
*/

DROP POLICY IF EXISTS "admin_insert_user_roles" ON user_roles;
CREATE POLICY "admin_insert_user_roles"
ON user_roles FOR INSERT TO authenticated
WITH CHECK (private.is_admin());

DROP POLICY IF EXISTS "admin_update_user_roles" ON user_roles;
CREATE POLICY "admin_update_user_roles"
ON user_roles FOR UPDATE TO authenticated
USING (private.is_admin()) WITH CHECK (private.is_admin());

DROP POLICY IF EXISTS "admin_delete_user_roles" ON user_roles;
CREATE POLICY "admin_delete_user_roles"
ON user_roles FOR DELETE TO authenticated
USING (private.is_admin());
