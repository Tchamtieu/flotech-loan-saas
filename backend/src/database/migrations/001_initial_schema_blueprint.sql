-- =============================================================================
-- FLOTECH DIGITAL — MULTI-TENANT LOAN MANAGEMENT SAAS
-- PHASE 1: INITIAL POSTGRESQL SCHEMA BLUEPRINT
-- =============================================================================
-- ARCHITECTURAL RULES ENFORCED:
-- 1. PostgreSQL is the single source of truth for all business & financial data.
-- 2. All monetary amounts use NUMERIC(19, 4) — never REAL or DOUBLE PRECISION.
-- 3. All interest rates and percentages use NUMERIC(10, 6).
-- 4. Multi-tenant tables enforce both composite foreign keys (business_id, id)
--    and PostgreSQL Row-Level Security (RLS) policies.
-- 5. Super Admin status is controlled strictly on the backend `users` table and
--    protected by a trigger preventing unauthorized self-elevation.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. ENUMERATED TYPES
-- -----------------------------------------------------------------------------

CREATE TYPE platform_role_type AS ENUM ('USER', 'SUPER_ADMIN');

CREATE TYPE business_status_type AS ENUM (
  'PENDING_VERIFICATION',
  'ACTIVE',
  'SUSPENDED',
  'ARCHIVED'
);

CREATE TYPE membership_status_type AS ENUM (
  'INVITED',
  'ACTIVE',
  'SUSPENDED',
  'REVOKED'
);

CREATE TYPE subscription_status_type AS ENUM (
  'TRIALING',
  'ACTIVE',
  'PAST_DUE',
  'CANCELED',
  'EXPIRED'
);

CREATE TYPE interest_method_type AS ENUM (
  'FLAT_RATE',
  'DECLINING_BALANCE_EQUAL_INSTALLMENTS',
  'DECLINING_BALANCE_EQUAL_PRINCIPAL',
  'INTEREST_ONLY'
);

CREATE TYPE repayment_frequency_type AS ENUM (
  'DAILY',
  'WEEKLY',
  'BIWEEKLY',
  'MONTHLY',
  'QUARTERLY'
);

CREATE TYPE loan_status_type AS ENUM (
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
  'DISBURSED',
  'ACTIVE',
  'OVERDUE',
  'DEFAULTED',
  'RESTRUCTURED',
  'CLOSED_PAID',
  'WRITTEN_OFF'
);

CREATE TYPE installment_status_type AS ENUM (
  'PENDING',
  'PARTIALLY_PAID',
  'PAID',
  'OVERDUE',
  'WAIVED'
);

CREATE TYPE repayment_method_type AS ENUM (
  'CASH',
  'BANK_TRANSFER',
  'MOBILE_MONEY',
  'CARD',
  'CHEQUE'
);

-- -----------------------------------------------------------------------------
-- 2. PLATFORM & IDENTITY TABLES
-- -----------------------------------------------------------------------------

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_uid VARCHAR(128) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  full_name VARCHAR(180) NOT NULL,
  phone_number VARCHAR(40),
  avatar_storage_path TEXT,
  platform_role platform_role_type NOT NULL DEFAULT 'USER',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_firebase_uid ON users(firebase_uid);

-- Prevent any non-Super-Admin transaction from elevating platform_role to SUPER_ADMIN
CREATE OR REPLACE FUNCTION enforce_super_admin_protection()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.platform_role = 'SUPER_ADMIN' AND (TG_OP = 'INSERT' OR OLD.platform_role <> 'SUPER_ADMIN') THEN
    IF current_setting('app.is_super_admin', true) IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'SECURITY_VIOLATION: Ordinary users cannot grant SUPER_ADMIN privileges.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enforce_super_admin_protection
BEFORE INSERT OR UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION enforce_super_admin_protection();

CREATE TABLE platform_settings (
  key VARCHAR(100) PRIMARY KEY,
  value_json JSONB NOT NULL,
  description TEXT,
  updated_by_user_id UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 3. SUBSCRIPTION PLANS & TENANT BUSINESSES
-- -----------------------------------------------------------------------------

CREATE TABLE subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  description TEXT,
  currency_code CHAR(3) NOT NULL DEFAULT 'USD',
  monthly_price NUMERIC(19, 4) NOT NULL CHECK (monthly_price >= 0),
  annual_price NUMERIC(19, 4) NOT NULL CHECK (annual_price >= 0),
  max_active_loans INTEGER NOT NULL CHECK (max_active_loans > 0),
  max_employees INTEGER NOT NULL CHECK (max_employees > 0),
  max_customers INTEGER NOT NULL CHECK (max_customers > 0),
  features_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_public BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_code VARCHAR(32) NOT NULL UNIQUE,
  legal_name VARCHAR(200) NOT NULL,
  trading_name VARCHAR(200),
  business_category VARCHAR(80) NOT NULL,
  registration_number VARCHAR(100),
  tax_id VARCHAR(100),
  primary_email VARCHAR(255) NOT NULL,
  primary_phone VARCHAR(40) NOT NULL,
  country_code CHAR(2) NOT NULL,
  currency_code CHAR(3) NOT NULL DEFAULT 'USD',
  timezone VARCHAR(64) NOT NULL DEFAULT 'UTC',
  address_line_1 VARCHAR(255),
  city VARCHAR(120),
  logo_storage_path TEXT,
  status business_status_type NOT NULL DEFAULT 'PENDING_VERIFICATION',
  owner_user_id UUID NOT NULL REFERENCES users(id),
  settings_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_businesses_owner_user_id ON businesses(owner_user_id);
CREATE INDEX idx_businesses_status ON businesses(status);

CREATE TABLE business_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE RESTRICT,
  plan_id UUID NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
  status subscription_status_type NOT NULL DEFAULT 'TRIALING',
  billing_cycle VARCHAR(16) NOT NULL CHECK (billing_cycle IN ('MONTHLY', 'ANNUAL')),
  unit_price NUMERIC(19, 4) NOT NULL CHECK (unit_price >= 0),
  currency_code CHAR(3) NOT NULL DEFAULT 'USD',
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, id)
);

CREATE INDEX idx_business_subscriptions_business_id ON business_subscriptions(business_id);

-- -----------------------------------------------------------------------------
-- 4. RBAC: PERMISSIONS, ROLES & BUSINESS MEMBERSHIPS (EMPLOYEES)
-- -----------------------------------------------------------------------------

CREATE TABLE permissions (
  code VARCHAR(80) PRIMARY KEY,
  module VARCHAR(60) NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  slug VARCHAR(64) NOT NULL,
  name VARCHAR(120) NOT NULL,
  description TEXT,
  is_system_role BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, slug),
  UNIQUE (business_id, id)
);

CREATE TABLE role_permissions (
  role_id UUID NOT NULL,
  business_id UUID NOT NULL,
  permission_code VARCHAR(80) NOT NULL REFERENCES permissions(code) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (role_id, permission_code),
  FOREIGN KEY (business_id, role_id) REFERENCES roles(business_id, id) ON DELETE CASCADE
);

CREATE TABLE business_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  role_id UUID NOT NULL,
  employee_code VARCHAR(40),
  job_title VARCHAR(120),
  department VARCHAR(120),
  status membership_status_type NOT NULL DEFAULT 'INVITED',
  invited_by_user_id UUID REFERENCES users(id),
  joined_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, user_id),
  UNIQUE (business_id, id),
  FOREIGN KEY (business_id, role_id) REFERENCES roles(business_id, id) ON DELETE RESTRICT
);

CREATE INDEX idx_memberships_user_id ON business_memberships(user_id);
CREATE INDEX idx_memberships_business_status ON business_memberships(business_id, status);

-- -----------------------------------------------------------------------------
-- 5. CUSTOMERS & KYC DOCUMENTS
-- -----------------------------------------------------------------------------

CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE RESTRICT,
  customer_number VARCHAR(40) NOT NULL,
  first_name VARCHAR(120) NOT NULL,
  last_name VARCHAR(120) NOT NULL,
  business_name VARCHAR(200),
  email VARCHAR(255),
  phone_number VARCHAR(40) NOT NULL,
  national_id_number VARCHAR(80),
  date_of_birth DATE,
  address_line_1 VARCHAR(255),
  city VARCHAR(120),
  employment_status VARCHAR(80),
  monthly_income NUMERIC(19, 4) CHECK (monthly_income IS NULL OR monthly_income >= 0),
  credit_score_internal INTEGER CHECK (credit_score_internal IS NULL OR (credit_score_internal BETWEEN 0 AND 1000)),
  risk_tier VARCHAR(32) NOT NULL DEFAULT 'STANDARD',
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_by_user_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, customer_number),
  UNIQUE (business_id, id)
);

CREATE INDEX idx_customers_business_id ON customers(business_id);
CREATE INDEX idx_customers_phone ON customers(business_id, phone_number);

CREATE TABLE customer_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL,
  customer_id UUID NOT NULL,
  document_type VARCHAR(64) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  firebase_storage_path TEXT NOT NULL,
  mime_type VARCHAR(120) NOT NULL,
  file_size_bytes BIGINT NOT NULL CHECK (file_size_bytes > 0),
  verified_at TIMESTAMPTZ,
  verified_by_user_id UUID REFERENCES users(id),
  uploaded_by_user_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, id),
  FOREIGN KEY (business_id, customer_id) REFERENCES customers(business_id, id) ON DELETE RESTRICT
);

-- -----------------------------------------------------------------------------
-- 6. LOAN PRODUCTS & LOANS
-- -----------------------------------------------------------------------------

CREATE TABLE loan_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE RESTRICT,
  code VARCHAR(40) NOT NULL,
  name VARCHAR(160) NOT NULL,
  description TEXT,
  currency_code CHAR(3) NOT NULL,
  interest_method interest_method_type NOT NULL,
  repayment_frequency repayment_frequency_type NOT NULL,
  nominal_interest_rate_percent NUMERIC(10, 6) NOT NULL CHECK (nominal_interest_rate_percent >= 0),
  rate_period VARCHAR(16) NOT NULL CHECK (rate_period IN ('PER_PERIOD', 'PER_MONTH', 'PER_ANNUM')),
  min_principal NUMERIC(19, 4) NOT NULL CHECK (min_principal > 0),
  max_principal NUMERIC(19, 4) NOT NULL CHECK (max_principal >= min_principal),
  min_term_installments INTEGER NOT NULL CHECK (min_term_installments >= 1),
  max_term_installments INTEGER NOT NULL CHECK (max_term_installments >= min_term_installments),
  origination_fee_fixed NUMERIC(19, 4) NOT NULL DEFAULT 0.0000 CHECK (origination_fee_fixed >= 0),
  origination_fee_percent NUMERIC(10, 6) NOT NULL DEFAULT 0.000000 CHECK (origination_fee_percent >= 0),
  late_penalty_rate_percent NUMERIC(10, 6) NOT NULL DEFAULT 0.000000 CHECK (late_penalty_rate_percent >= 0),
  grace_period_days INTEGER NOT NULL DEFAULT 0 CHECK (grace_period_days >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, code),
  UNIQUE (business_id, id)
);

CREATE INDEX idx_loan_products_business_id ON loan_products(business_id);

CREATE TABLE loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE RESTRICT,
  loan_number VARCHAR(40) NOT NULL,
  customer_id UUID NOT NULL,
  loan_product_id UUID NOT NULL,
  status loan_status_type NOT NULL DEFAULT 'DRAFT',
  currency_code CHAR(3) NOT NULL,
  interest_method interest_method_type NOT NULL,
  repayment_frequency repayment_frequency_type NOT NULL,
  nominal_interest_rate_percent NUMERIC(10, 6) NOT NULL CHECK (nominal_interest_rate_percent >= 0),
  rate_period VARCHAR(16) NOT NULL CHECK (rate_period IN ('PER_PERIOD', 'PER_MONTH', 'PER_ANNUM')),
  term_installments INTEGER NOT NULL CHECK (term_installments >= 1),

  -- Immutable Contracted Financial Totals (NUMERIC(19, 4))
  principal_amount NUMERIC(19, 4) NOT NULL CHECK (principal_amount > 0),
  total_interest_amount NUMERIC(19, 4) NOT NULL CHECK (total_interest_amount >= 0),
  total_fee_amount NUMERIC(19, 4) NOT NULL DEFAULT 0.0000 CHECK (total_fee_amount >= 0),
  total_penalty_amount NUMERIC(19, 4) NOT NULL DEFAULT 0.0000 CHECK (total_penalty_amount >= 0),
  total_payable_amount NUMERIC(19, 4) NOT NULL CHECK (total_payable_amount >= principal_amount),

  -- Live Ledger Balances (Updated atomically inside PostgreSQL transactions)
  principal_outstanding NUMERIC(19, 4) NOT NULL CHECK (principal_outstanding >= 0),
  interest_outstanding NUMERIC(19, 4) NOT NULL CHECK (interest_outstanding >= 0),
  fee_outstanding NUMERIC(19, 4) NOT NULL DEFAULT 0.0000 CHECK (fee_outstanding >= 0),
  penalty_outstanding NUMERIC(19, 4) NOT NULL DEFAULT 0.0000 CHECK (penalty_outstanding >= 0),
  total_outstanding NUMERIC(19, 4) NOT NULL CHECK (total_outstanding >= 0),

  application_date DATE NOT NULL DEFAULT CURRENT_DATE,
  approved_at TIMESTAMPTZ,
  approved_by_user_id UUID REFERENCES users(id),
  disbursed_at TIMESTAMPTZ,
  disbursed_by_user_id UUID REFERENCES users(id),
  first_repayment_date DATE,
  maturity_date DATE,
  closed_at TIMESTAMPTZ,
  loan_officer_membership_id UUID,
  purpose TEXT,
  created_by_user_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (business_id, loan_number),
  UNIQUE (business_id, id),
  FOREIGN KEY (business_id, customer_id) REFERENCES customers(business_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (business_id, loan_product_id) REFERENCES loan_products(business_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (business_id, loan_officer_membership_id) REFERENCES business_memberships(business_id, id) ON DELETE SET NULL
);

CREATE INDEX idx_loans_business_status ON loans(business_id, status);
CREATE INDEX idx_loans_business_customer ON loans(business_id, customer_id);

-- -----------------------------------------------------------------------------
-- 7. REPAYMENT SCHEDULES, REPAYMENTS, ALLOCATIONS & RECEIPTS
-- -----------------------------------------------------------------------------

CREATE TABLE repayment_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL,
  loan_id UUID NOT NULL,
  installment_number INTEGER NOT NULL CHECK (installment_number >= 1),
  due_date DATE NOT NULL,
  status installment_status_type NOT NULL DEFAULT 'PENDING',

  opening_principal_balance NUMERIC(19, 4) NOT NULL CHECK (opening_principal_balance >= 0),
  principal_due NUMERIC(19, 4) NOT NULL CHECK (principal_due >= 0),
  interest_due NUMERIC(19, 4) NOT NULL CHECK (interest_due >= 0),
  fee_due NUMERIC(19, 4) NOT NULL DEFAULT 0.0000 CHECK (fee_due >= 0),
  penalty_due NUMERIC(19, 4) NOT NULL DEFAULT 0.0000 CHECK (penalty_due >= 0),
  total_due NUMERIC(19, 4) NOT NULL CHECK (total_due >= 0),

  principal_paid NUMERIC(19, 4) NOT NULL DEFAULT 0.0000 CHECK (principal_paid >= 0),
  interest_paid NUMERIC(19, 4) NOT NULL DEFAULT 0.0000 CHECK (interest_paid >= 0),
  fee_paid NUMERIC(19, 4) NOT NULL DEFAULT 0.0000 CHECK (fee_paid >= 0),
  penalty_paid NUMERIC(19, 4) NOT NULL DEFAULT 0.0000 CHECK (penalty_paid >= 0),
  total_paid NUMERIC(19, 4) NOT NULL DEFAULT 0.0000 CHECK (total_paid >= 0),

  closing_principal_balance NUMERIC(19, 4) NOT NULL CHECK (closing_principal_balance >= 0),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (business_id, loan_id, installment_number),
  UNIQUE (business_id, id),
  FOREIGN KEY (business_id, loan_id) REFERENCES loans(business_id, id) ON DELETE RESTRICT
);

CREATE INDEX idx_repayment_schedules_due_date ON repayment_schedules(business_id, status, due_date);

CREATE TABLE repayments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL,
  loan_id UUID NOT NULL,
  customer_id UUID NOT NULL,
  reference_number VARCHAR(64) NOT NULL,
  payment_method repayment_method_type NOT NULL,
  external_transaction_ref VARCHAR(120),
  currency_code CHAR(3) NOT NULL,

  amount_received NUMERIC(19, 4) NOT NULL CHECK (amount_received > 0),
  allocated_penalty NUMERIC(19, 4) NOT NULL DEFAULT 0.0000 CHECK (allocated_penalty >= 0),
  allocated_fee NUMERIC(19, 4) NOT NULL DEFAULT 0.0000 CHECK (allocated_fee >= 0),
  allocated_interest NUMERIC(19, 4) NOT NULL DEFAULT 0.0000 CHECK (allocated_interest >= 0),
  allocated_principal NUMERIC(19, 4) NOT NULL DEFAULT 0.0000 CHECK (allocated_principal >= 0),
  overpayment_credit NUMERIC(19, 4) NOT NULL DEFAULT 0.0000 CHECK (overpayment_credit >= 0),

  paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recorded_by_user_id UUID NOT NULL REFERENCES users(id),
  is_reversed BOOLEAN NOT NULL DEFAULT FALSE,
  reversed_at TIMESTAMPTZ,
  reversed_by_user_id UUID REFERENCES users(id),
  reversal_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_repayment_allocation_sum CHECK (
    allocated_penalty + allocated_fee + allocated_interest + allocated_principal + overpayment_credit = amount_received
  ),
  UNIQUE (business_id, reference_number),
  UNIQUE (business_id, id),
  FOREIGN KEY (business_id, loan_id) REFERENCES loans(business_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (business_id, customer_id) REFERENCES customers(business_id, id) ON DELETE RESTRICT
);

CREATE INDEX idx_repayments_business_loan ON repayments(business_id, loan_id);

CREATE TABLE repayment_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL,
  repayment_id UUID NOT NULL,
  schedule_id UUID NOT NULL,
  principal_allocated NUMERIC(19, 4) NOT NULL DEFAULT 0.0000 CHECK (principal_allocated >= 0),
  interest_allocated NUMERIC(19, 4) NOT NULL DEFAULT 0.0000 CHECK (interest_allocated >= 0),
  fee_allocated NUMERIC(19, 4) NOT NULL DEFAULT 0.0000 CHECK (fee_allocated >= 0),
  penalty_allocated NUMERIC(19, 4) NOT NULL DEFAULT 0.0000 CHECK (penalty_allocated >= 0),
  total_allocated NUMERIC(19, 4) NOT NULL CHECK (total_allocated > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  FOREIGN KEY (business_id, repayment_id) REFERENCES repayments(business_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (business_id, schedule_id) REFERENCES repayment_schedules(business_id, id) ON DELETE RESTRICT
);

CREATE TABLE payment_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL,
  repayment_id UUID NOT NULL,
  receipt_number VARCHAR(64) NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  pdf_storage_path TEXT,
  snapshot_json JSONB NOT NULL,
  UNIQUE (business_id, receipt_number),
  UNIQUE (business_id, repayment_id),
  FOREIGN KEY (business_id, repayment_id) REFERENCES repayments(business_id, id) ON DELETE RESTRICT
);

-- -----------------------------------------------------------------------------
-- 8. NOTIFICATIONS & IMMUTABLE AUDIT LOGS
-- -----------------------------------------------------------------------------

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  recipient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category VARCHAR(64) NOT NULL,
  title VARCHAR(200) NOT NULL,
  body TEXT NOT NULL,
  action_url TEXT,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_recipient ON notifications(recipient_user_id, is_read, created_at DESC);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE RESTRICT,
  actor_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  actor_platform_role platform_role_type NOT NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id UUID,
  request_id VARCHAR(64),
  ip_address VARCHAR(64),
  user_agent TEXT,
  before_state JSONB,
  after_state JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_business_created ON audit_logs(business_id, created_at DESC);
CREATE INDEX idx_audit_logs_actor_created ON audit_logs(actor_user_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- 9. ROW-LEVEL SECURITY (RLS) MULTI-TENANT ISOLATION POLICIES
-- -----------------------------------------------------------------------------

ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE loan_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE repayment_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE repayments ENABLE ROW LEVEL SECURITY;
ALTER TABLE repayment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_roles ON roles
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR business_id = NULLIF(current_setting('app.current_business_id', true), '')::uuid
  );

CREATE POLICY tenant_isolation_customers ON customers
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR business_id = NULLIF(current_setting('app.current_business_id', true), '')::uuid
  );

CREATE POLICY tenant_isolation_loan_products ON loan_products
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR business_id = NULLIF(current_setting('app.current_business_id', true), '')::uuid
  );

CREATE POLICY tenant_isolation_loans ON loans
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR business_id = NULLIF(current_setting('app.current_business_id', true), '')::uuid
  );

CREATE POLICY tenant_isolation_repayment_schedules ON repayment_schedules
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR business_id = NULLIF(current_setting('app.current_business_id', true), '')::uuid
  );

CREATE POLICY tenant_isolation_repayments ON repayments
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR business_id = NULLIF(current_setting('app.current_business_id', true), '')::uuid
  );
