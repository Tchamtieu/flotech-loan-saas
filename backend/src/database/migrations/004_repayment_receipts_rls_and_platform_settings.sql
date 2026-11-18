-- =============================================================================
-- FLOTECH DIGITAL — MULTI-TENANT LOAN MANAGEMENT SAAS
-- PHASE 8–10: RLS POLICIES FOR REPAYMENT ALLOCATIONS & RECEIPTS + PLATFORM SETTINGS SEED
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'repayment_allocations' AND policyname = 'tenant_isolation_repayment_allocations'
  ) THEN
    CREATE POLICY tenant_isolation_repayment_allocations ON repayment_allocations
      USING (
        current_setting('app.is_super_admin', true) = 'true'
        OR business_id = NULLIF(current_setting('app.current_business_id', true), '')::uuid
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'payment_receipts' AND policyname = 'tenant_isolation_payment_receipts'
  ) THEN
    CREATE POLICY tenant_isolation_payment_receipts ON payment_receipts
      USING (
        current_setting('app.is_super_admin', true) = 'true'
        OR business_id = NULLIF(current_setting('app.current_business_id', true), '')::uuid
      );
  END IF;
END
$$;

-- Seed default FloTech Digital platform settings (idempotent)
INSERT INTO platform_settings (key, value_json, description)
VALUES
  (
    'platform.governance',
    '{
      "platformName": "FloTech Digital Loan Management SaaS",
      "supportEmail": "support@flotech.digital",
      "requireBusinessVerificationBeforeDisbursement": false,
      "defaultTrialDays": 14,
      "maintenanceMode": false,
      "enforceAppCheckInProduction": true
    }'::jsonb,
    'Global FloTech Digital platform governance and operational parameters'
  )
ON CONFLICT (key) DO NOTHING;
