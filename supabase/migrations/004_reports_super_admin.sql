-- Add super_admin role and protected report access.
-- Apply this in Supabase before relying on database-level report protection.

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('super_admin', 'admin', 'staff'));

CREATE OR REPLACE FUNCTION is_super_admin(uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM profiles
    WHERE id = uid
      AND role = 'super_admin'
  );
$$;

REVOKE ALL ON FUNCTION is_super_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_super_admin(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION get_reports_quotes(start_date date, end_date date)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT to_jsonb(q)
  FROM quotes q
  WHERE is_super_admin(auth.uid())
    AND COALESCE(NULLIF(to_jsonb(q)->>'payment_date', '')::date, q.created_at::date) BETWEEN start_date AND end_date
    AND (to_jsonb(q)->>'deleted_at') IS NULL
    AND COALESCE(q.status, '') <> 'cancelled'
    AND (to_jsonb(q)->>'payment_status') IN ('paid', 'partial');
$$;

REVOKE ALL ON FUNCTION get_reports_quotes(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_reports_quotes(date, date) TO authenticated;

-- Notes:
-- 1. Reports in the app are still frontend-gated by role so normal users do not see /reports.
-- 2. This RPC provides a database-level super_admin-only path for report data.
-- 3. Existing quote pages still depend on the app's normal authenticated quote policies.
