-- Completed workflow support for quotes, job cards, retail jobs, reception, and reports.

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'partial', 'paid')),
  ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_method TEXT CHECK (payment_method IN ('cash', 'card', 'eft', 'other')),
  ADD COLUMN IF NOT EXISTS payment_date TIMESTAMPTZ;

ALTER TABLE job_cards
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'partial', 'paid')),
  ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_method TEXT CHECK (payment_method IN ('cash', 'card', 'eft', 'other')),
  ADD COLUMN IF NOT EXISTS payment_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS collection_status TEXT CHECK (collection_status IN ('pending', 'collected')),
  ADD COLUMN IF NOT EXISTS collected_at TIMESTAMPTZ;

UPDATE quotes
SET completed_at = COALESCE(completed_at, updated_at, created_at)
WHERE status = 'completed' AND completed_at IS NULL;

UPDATE job_cards
SET completed_at = COALESCE(completed_at, date_completed::timestamptz, updated_at, created_at)
WHERE status = 'completed' AND completed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_quotes_completed_at ON quotes(completed_at) WHERE status = 'completed';
CREATE INDEX IF NOT EXISTS idx_job_cards_completed_at ON job_cards(completed_at) WHERE status = 'completed';
CREATE INDEX IF NOT EXISTS idx_quotes_payment_status ON quotes(payment_status);
CREATE INDEX IF NOT EXISTS idx_job_cards_payment_status ON job_cards(payment_status);
CREATE OR REPLACE FUNCTION get_reports_quotes(start_date date, end_date date)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT to_jsonb(q) || jsonb_build_object('record_type', 'quote')
  FROM quotes q
  WHERE is_super_admin(auth.uid())
    AND q.status = 'completed'
    AND COALESCE(q.completed_at::date, q.created_at::date) BETWEEN start_date AND end_date

  UNION ALL

  SELECT to_jsonb(j) || jsonb_build_object('record_type', CASE WHEN j.is_retail THEN 'retail' ELSE 'job_card' END)
  FROM job_cards j
  WHERE is_super_admin(auth.uid())
    AND j.status = 'completed'
    AND j.job_number NOT LIKE 'WI-%'
    AND COALESCE(j.completed_at::date, j.date_completed, j.created_at::date) BETWEEN start_date AND end_date;
$$;

REVOKE ALL ON FUNCTION get_reports_quotes(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_reports_quotes(date, date) TO authenticated;
