-- =============================================================================
-- FLOTECH DIGITAL — MULTI-TENANT LOAN MANAGEMENT SAAS
-- PHASE 3 MIGRATION: SEED ATOMIC PERMISSIONS & DEFAULT SUBSCRIPTION PLANS
-- =============================================================================

INSERT INTO permissions (code, module, description) VALUES
  ('dashboard:view', 'DASHBOARD', 'View business dashboard and portfolio health indicators'),
  ('reports:view', 'REPORTS', 'View financial reports and portfolio analytics'),
  ('reports:export', 'REPORTS', 'Export financial statements and schedules'),
  ('customers:view', 'CUSTOMERS', 'View borrower profiles and KYC status'),
  ('customers:create', 'CUSTOMERS', 'Create new borrower profiles and upload KYC documents'),
  ('customers:update', 'CUSTOMERS', 'Update existing borrower profiles and KYC verification'),
  ('customers:archive', 'CUSTOMERS', 'Archive or restore borrower records'),
  ('loan_products:view', 'LOAN_PRODUCTS', 'View configured loan products and interest terms'),
  ('loan_products:manage', 'LOAN_PRODUCTS', 'Create, update, or deactivate loan products'),
  ('loans:view', 'LOANS', 'View loan applications, contracts, and repayment schedules'),
  ('loans:create', 'LOANS', 'Create and submit new loan applications'),
  ('loans:review', 'LOANS', 'Perform underwriting review on submitted loan applications'),
  ('loans:approve', 'LOANS', 'Approve or reject reviewed loan applications'),
  ('loans:disburse', 'LOANS', 'Record loan disbursement and activate repayment schedule'),
  ('loans:restructure', 'LOANS', 'Restructure active or overdue loan terms'),
  ('loans:write_off', 'LOANS', 'Write off defaulted loans'),
  ('repayments:view', 'REPAYMENTS', 'View recorded repayments, allocations, and receipts'),
  ('repayments:record', 'REPAYMENTS', 'Record customer loan repayments and issue receipts'),
  ('repayments:reverse', 'REPAYMENTS', 'Reverse erroneous repayments with audit trail'),
  ('employees:view', 'EMPLOYEES', 'View business employees and memberships'),
  ('employees:manage', 'EMPLOYEES', 'Invite, update, or suspend business employees'),
  ('roles:view', 'ROLES', 'View business roles and assigned permissions'),
  ('roles:manage', 'ROLES', 'Create or modify custom business roles and permissions'),
  ('business_settings:view', 'BUSINESS_SETTINGS', 'View business profile and operational settings'),
  ('business_settings:manage', 'BUSINESS_SETTINGS', 'Update business profile, branding, and operational settings'),
  ('subscription:view', 'SUBSCRIPTION', 'View current business SaaS subscription and quotas'),
  ('subscription:manage', 'SUBSCRIPTION', 'Manage business SaaS subscription plan and billing cycle')
ON CONFLICT (code) DO NOTHING;

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
) VALUES
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
ON CONFLICT (code) DO NOTHING;
