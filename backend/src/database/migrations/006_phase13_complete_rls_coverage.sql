-- =============================================================================
-- FLOTECH DIGITAL — MULTI-TENANT LOAN MANAGEMENT SAAS
-- MIGRATION 006 (PHASE 13 AUDIT): COMPLETE ROW-LEVEL SECURITY COVERAGE
-- -----------------------------------------------------------------------------
-- Audit finding: RLS was enabled on role_permissions and business_memberships
-- without any policy, and was not enabled at all on business_subscriptions,
-- notifications and audit_logs. This migration adds explicit tenant policies so
-- every tenant-scoped table is covered.
--
-- NOTE: PostgreSQL does not apply RLS to superusers or table owners (unless
-- FORCE ROW LEVEL SECURITY is set). Production MUST connect with a dedicated
-- non-owner, non-superuser role for these policies to take effect. See
-- docs/PHASE_13_PRODUCTION_READINESS_AUDIT.md (finding H-4).
-- =============================================================================

ALTER TABLE business_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_role_permissions ON role_permissions;
CREATE POLICY tenant_isolation_role_permissions ON role_permissions
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR business_id = NULLIF(current_setting('app.current_business_id', true), '')::uuid
  );

-- A user must be able to list their own memberships across businesses (business switcher).
DROP POLICY IF EXISTS tenant_isolation_business_memberships ON business_memberships;
CREATE POLICY tenant_isolation_business_memberships ON business_memberships
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR business_id = NULLIF(current_setting('app.current_business_id', true), '')::uuid
    OR user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
  );

DROP POLICY IF EXISTS tenant_isolation_business_subscriptions ON business_subscriptions;
CREATE POLICY tenant_isolation_business_subscriptions ON business_subscriptions
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR business_id = NULLIF(current_setting('app.current_business_id', true), '')::uuid
  );

DROP POLICY IF EXISTS tenant_isolation_notifications ON notifications;
CREATE POLICY tenant_isolation_notifications ON notifications
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR business_id = NULLIF(current_setting('app.current_business_id', true), '')::uuid
    OR recipient_user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
  );

DROP POLICY IF EXISTS tenant_isolation_audit_logs ON audit_logs;
CREATE POLICY tenant_isolation_audit_logs ON audit_logs
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR business_id = NULLIF(current_setting('app.current_business_id', true), '')::uuid
    OR actor_user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
  );
