-- ============================================================================
-- FLOTECH DIGITAL — MULTI-TENANT LOAN MANAGEMENT SAAS
-- MIGRATION 005: PHASE 11 SUBSCRIPTION PLANS, REPAYMENT IDEMPOTENCY &
--                IMMUTABLE FINANCIAL LEDGER PROTECTION
-- ============================================================================

-- 1. Add optional canceled_at timestamp to business_subscriptions
ALTER TABLE business_subscriptions
  ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ;

-- 2. Ensure complete SaaS Subscription Plans catalog (Free, Starter, Business, Growth Pro, Enterprise)
INSERT INTO subscription_plans (
  code,
  name,
  description,
  currency_code,
  monthly_price,
  annual_price,
  max_active_loans,
  max_employees,
  max_customers,
  features_json,
  is_public
)
VALUES
  (
    'FREE',
    'FloTech Free Tier',
    'Entry-level micro-lending workspace for solo entrepreneurs evaluating loan tracking.',
    'USD',
    '0.0000',
    '0.0000',
    10,
    1,
    25,
    '{"csvExport": false, "customRoles": false, "dualControlApproval": false, "prioritySupport": false}'::jsonb,
    TRUE
  ),
  (
    'STARTER_TRIAL',
    'FloTech Starter Plan',
    'Entry commercial tier for small lending businesses, merchants, and associations.',
    'USD',
    '49.0000',
    '490.0000',
    250,
    5,
    1000,
    '{"customRoles": false, "advancedReports": true, "pdfReceipts": true}'::jsonb,
    TRUE
  ),
  (
    'BUSINESS',
    'FloTech Business',
    'Full-featured multi-branch lending operations with custom RBAC roles, dual-control underwriting, and PAR analytics.',
    'USD',
    '79.0000',
    '790.0000',
    500,
    15,
    2500,
    '{"csvExport": true, "customRoles": true, "dualControlApproval": true, "prioritySupport": false}'::jsonb,
    TRUE
  ),
  (
    'GROWTH_PRO',
    'FloTech Growth Professional',
    'Scalable tier for growing microfinance and commercial lending institutions.',
    'USD',
    '149.0000',
    '1490.0000',
    2500,
    25,
    10000,
    '{"customRoles": true, "advancedReports": true, "pdfReceipts": true, "multiBranch": true}'::jsonb,
    TRUE
  ),
  (
    'ENTERPRISE',
    'FloTech Enterprise',
    'High-volume multi-branch lending operations with full RBAC and audit exports.',
    'USD',
    '399.0000',
    '3990.0000',
    25000,
    200,
    100000,
    '{"customRoles": true, "advancedReports": true, "pdfReceipts": true, "multiBranch": true, "dedicatedSupport": true}'::jsonb,
    TRUE
  )
ON CONFLICT (code) DO UPDATE SET
  is_public = EXCLUDED.is_public,
  updated_at = NOW();

-- 3. Add idempotency_key to repayments and partial unique indexes to prevent duplicate payment submissions
ALTER TABLE repayments
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(120);

CREATE UNIQUE INDEX IF NOT EXISTS uq_repayments_business_idempotency_key
  ON repayments (business_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND is_reversed = FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_repayments_business_loan_external_ref
  ON repayments (business_id, loan_id, external_transaction_ref)
  WHERE external_transaction_ref IS NOT NULL AND is_reversed = FALSE;

-- 4. Immutable Financial Ledger Protection Trigger:
--    Prevents physical DELETE of validated repayments, repayment_allocations, payment_receipts,
--    or audit_logs during any authenticated user/tenant transaction.
CREATE OR REPLACE FUNCTION prevent_validated_financial_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_actor_user_id TEXT;
BEGIN
  v_actor_user_id := NULLIF(current_setting('app.current_user_id', true), '');
  IF v_actor_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'FINANCIAL_IMMUTABILITY_VIOLATION: Physical deletion of % rows is prohibited. Use authorized reversal or write-off workflows.', TG_TABLE_NAME
      USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_no_delete_repayments ON repayments;
CREATE TRIGGER trg_no_delete_repayments
  BEFORE DELETE ON repayments
  FOR EACH ROW
  EXECUTE FUNCTION prevent_validated_financial_delete();

DROP TRIGGER IF EXISTS trg_no_delete_repayment_allocations ON repayment_allocations;
CREATE TRIGGER trg_no_delete_repayment_allocations
  BEFORE DELETE ON repayment_allocations
  FOR EACH ROW
  EXECUTE FUNCTION prevent_validated_financial_delete();

DROP TRIGGER IF EXISTS trg_no_delete_payment_receipts ON payment_receipts;
CREATE TRIGGER trg_no_delete_payment_receipts
  BEFORE DELETE ON payment_receipts
  FOR EACH ROW
  EXECUTE FUNCTION prevent_validated_financial_delete();

DROP TRIGGER IF EXISTS trg_no_delete_audit_logs ON audit_logs;
CREATE TRIGGER trg_no_delete_audit_logs
  BEFORE DELETE ON audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION prevent_validated_financial_delete();
