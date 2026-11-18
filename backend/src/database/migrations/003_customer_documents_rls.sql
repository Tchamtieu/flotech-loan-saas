-- =============================================================================
-- FLOTECH DIGITAL — MULTI-TENANT LOAN MANAGEMENT SAAS
-- PHASE 5 MIGRATION: ENABLE RLS POLICY FOR CUSTOMER KYC DOCUMENTS
-- =============================================================================

DROP POLICY IF EXISTS tenant_isolation_customer_documents ON customer_documents;

CREATE POLICY tenant_isolation_customer_documents ON customer_documents
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR business_id = NULLIF(current_setting('app.current_business_id', true), '')::uuid
  );
