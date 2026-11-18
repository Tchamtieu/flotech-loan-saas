# FloTech Digital — Master 12-Phase Development Roadmap

This document tracks the strict 12-phase engineering lifecycle for the **FloTech Digital Multi-Tenant Loan Management SaaS**.

---

## Phase Progression Overview

| Phase | Title | Status | Key Deliverables |
| :--- | :--- | :--- | :--- |
| **PHASE 1** | **Architecture & Project Foundation** | **APPROVED & COMPLETED** | Monorepo structure, shared contracts, Express/TS backend, Security/RBAC/RLS middleware, `Decimal.js` engine, PostgreSQL schema blueprint, React/Vite/Tailwind design system & dual environment shells, 6 documentation files, unit/integration tests. |
| **PHASE 2** | **Authentication & Personal Profiles** | **APPROVED & COMPLETED** | Local PostgreSQL 15 instance + idempotent migration runner, Firebase Auth + App Check verifier port, `POST /api/v1/auth/session`, `GET /api/v1/auth/me`, `PATCH /api/v1/auth/me`, `audit_logs` integration, `AuthPortalPage`, `PersonalProfilePage`, Firebase Storage avatar upload flow, live PostgreSQL integration tests. |
| **PHASE 3** | **Business Profiles & Memberships** | **APPROVED & COMPLETED** | `002_seed_permissions_and_plans.sql`, `POST /api/v1/businesses` (atomic business + 5 system roles + owner membership + trial subscription), `GET /api/v1/businesses`, `GET/PATCH /api/v1/businesses/:businessId/profile`, `GET/PATCH /api/v1/businesses/:businessId/settings`, `BusinessProfilePage`, `BusinessSettingsPage`, live Business Switcher, cross-tenant & RBAC integration tests. |
| **PHASE 4** | **Roles, Permissions & Employee Management** | **APPROVED & COMPLETED** | `GET /permissions`, `GET/POST/PATCH /roles`, `GET/POST/PATCH /employees`, owner role immutable permission guard, last-active-owner protection (`409 LAST_BUSINESS_OWNER_PROTECTION`), `max_employees` subscription quota enforcement, `RolesPermissionsPage`, `EmployeesPage`, live PostgreSQL integration tests. |
| **PHASE 5** | **Customer Management** | **APPROVED & COMPLETED** | `003_customer_documents_rls.sql`, borrower CRUD (`GET/POST/PATCH /customers`), sequential `customer_number` generation, `NUMERIC(19, 4)` `monthly_income` storage, search & risk-tier filtering, KYC document upload & verification (`POST /customers/:id/documents`, `POST /customers/:id/documents/:docId/verify`), `CustomersPage`, live PostgreSQL integration tests. |
| **PHASE 6** | **Loan Products & Loan Management** | **APPROVED & COMPLETED** | Loan product catalog (`GET/POST/PATCH /loan-products`), loan application origination (`POST /loans`) with backend `Decimal.js` contracted totals, underwriting lifecycle (`submit`, `review`, `approve`, `reject`, `disburse`), dual-control approval guard (`requireDualApprovalForLoans`), atomic `repayment_schedules` generation on disbursement, `LoanProductsPage`, `LoansPage`, live PostgreSQL integration tests. |
| **PHASE 7** | **Financial Calculation Engine & Repayment Schedules** | **APPROVED & COMPLETED** | Master repayment schedule ledger (`GET /repayment-schedules`), grace-period delinquency & deterministic `Decimal.js` late penalty accrual engine (`POST /repayment-schedules/evaluate-overdue`), delinquent loan summary (`GET /overdue-loans`), audited loan restructuring (`POST /loans/:loanId/restructure`), loan write-off (`POST /loans/:loanId/write-off`), `RepaymentSchedulesPage`, `OverdueLoansPage`, live PostgreSQL integration tests. |
| **PHASE 8** | **Repayment Management & Receipts** | **APPROVED & COMPLETED** | `004_repayment_receipts_rls_and_platform_settings.sql`, ACID repayment waterfall allocation (`Penalty -> Fee -> Interest -> Principal`), `allowPartialInstallmentPayments` enforcement, `overpayment_credit` handling, automatic `CLOSED_PAID` transition, audited reversals (`POST /repayments/:id/reverse`), sequential receipt snapshots (`GET /repayments/:id/receipt`), `RepaymentsPage`, live PostgreSQL integration tests. |
| **PHASE 9** | **Financial Dashboards & Reporting** | **APPROVED & COMPLETED** | Real PostgreSQL analytical aggregations (`GET /dashboard`, `GET /reports/portfolio`), Portfolio at Risk aging (`CURRENT`, `PAR_1_29`, `PAR_30_59`, `PAR_60_89`, `PAR_90_PLUS`, `par30RatioPercent`, `par90RatioPercent`), Recharts monthly cashflow analytics, CSV statement export (`GET /reports/export-csv`), in-app notifications (`GET /notifications`, `POST /notifications/:id/read`), `FinancialDashboardAndReportsPage`, `NotificationsPage`, live PostgreSQL integration tests. |
| **PHASE 10** | **FloTech Digital Super Admin** | **APPROVED & COMPLETED** | Global KPI dashboard (`GET /super-admin/dashboard`), tenant business governance (`GET/PATCH /super-admin/businesses`), global user directory (`GET/PATCH /super-admin/users`), subscription plan catalog & assignments (`GET/POST /super-admin/plans`, `GET/POST /super-admin/subscriptions`), SaaS MRR/ARR revenue analytics (`GET /super-admin/revenue-analytics`), platform broadcast notifications (`POST /super-admin/notifications/broadcast`), immutable audit log explorer (`GET /super-admin/audit-logs`), platform settings (`GET/PUT /super-admin/settings`), `SuperAdminSuitePage`, live PostgreSQL integration tests. |
| **PHASE 11** | **Subscription Management** | **COMPLETED & VERIFIED** | Migration 005 (plan catalog FREE/STARTER_TRIAL/BUSINESS/GROWTH_PRO/ENTERPRISE, repayment idempotency, immutability triggers), `GET /subscription`, `POST /subscription/change-plan` (downgrade quota guard), `POST /subscription/cancel`, expiry enforcement, `SubscriptionPage`, `phase11Subscriptions.test.ts`. |
| **PHASE 12** | **Security Testing & Deployment** | **COMPLETED & VERIFIED (local)** | Migration 006 (full RLS coverage), cross-tenant & RBAC audit suite, Cloud Run Dockerfile, Cloudflare `_redirects`/`_headers`, `storage.rules`, `.env.production.example`. Cloud deployment pending. |
| **PHASE 13** | **Production Readiness Audit** | **COMPLETED — launch blocked by open items** | See `docs/PHASE_13_PRODUCTION_READINESS_AUDIT.md` (open: H-4 DB role/RLS, H-5 dependency upgrades, staging verification). |

---

## Phase 1 Completed Tasks Record

- [x] **Task A — Architecture**: Established frontend/backend separation, REST API contract, Firebase Auth + App Check flow, PostgreSQL single-source-of-truth access layer, and 3-layer multi-tenant isolation.
- [x] **Task B — Project Structure**: Created organized directories across `packages/shared`, `backend/src/*`, and `frontend/src/*`.
- [x] **Task C — Design System**: Configured official FloTech color palette (`#2563EB`, `#0F172A`, `#F8FAFC`, `#FFFFFF`, `#16A34A`, `#F59E0B`, `#DC2626`, `#0D9488`), `Inter` + `JetBrains Mono` typography, reusable UI components, and responsive dual-environment `AppShellLayout`.
- [x] **Task D — Database Blueprint**: Designed `001_initial_schema_blueprint.sql` with 16 normalized tables, `NUMERIC(19, 4)` monetary columns, composite tenant foreign keys, Super Admin protection trigger, and RLS policies.
- [x] **Task E — Documentation**: Created `README.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE_DESIGN.md`, `docs/SECURITY.md`, `docs/DESIGN_SYSTEM.md`, and `docs/DEVELOPMENT_ROADMAP.md`.

---

## Phase 2 Completed Tasks Record

- [x] **Local PostgreSQL 15 & Migration Runner**: Initialized local PostgreSQL database (`flotech_loan_saas`), applied `001_initial_schema_blueprint.sql`, and created idempotent runner `backend/src/database/migrate.ts` with `schema_migrations` tracking.
- [x] **Authentication & Profile Backend Services**: Created `backend/src/services/authProfileService.ts` and `backend/src/controllers/authProfileController.ts` with ACID transaction provisioning (`POST /api/v1/auth/session`), profile retrieval (`GET /api/v1/auth/me`), and audited profile updates (`PATCH /api/v1/auth/me`).
- [x] **Privilege & Storage Path Security**: Enforced `.strict()` Zod schemas, verified `trg_enforce_super_admin_protection` trigger against `SUPER_ADMIN` self-elevation, and enforced `avatars/<firebase_uid>/*` prefix ownership.
- [x] **Frontend Identity & Personal Profile UI**: Created `firebaseClient.ts`, `useAuthSession.tsx`, `AuthPortalPage.tsx` (`/auth/login`, `/auth/register`), and `PersonalProfilePage.tsx` (`/app/personal-profile`).
- [x] **Live PostgreSQL Integration Tests**: Created `backend/src/tests/phase2AuthProfiles.test.ts` testing all Phase 2 endpoints and security invariants against live PostgreSQL.

---

## Phase 3 Completed Tasks Record

- [x] **Migration `002_seed_permissions_and_plans.sql`**: Seeded all 27 atomic `PermissionCode` records into `permissions` and the 3 default SaaS plans (`STARTER_TRIAL`, `GROWTH_PRO`, `ENTERPRISE`) into `subscription_plans`.
- [x] **Atomic Business Tenant Onboarding (`POST /api/v1/businesses`)**: Implemented `createTenantBusiness()` in `backend/src/services/businessTenantService.ts` to atomically create the `businesses` row, bind RLS context, seed the 5 system roles (`business_owner`, `branch_manager`, `loan_officer`, `cashier`, `auditor`) and `role_permissions`, create the founder's `ACTIVE` `business_memberships` record, attach a 14-day `TRIALING` subscription, and log `BUSINESS_CREATED` to `audit_logs`.
- [x] **Tenant Context, Profile & Operational Settings Endpoints**: Implemented `GET /api/v1/businesses`, `GET /api/v1/businesses/:businessId/context`, `GET/PATCH /api/v1/businesses/:businessId/profile`, and `GET/PATCH /api/v1/businesses/:businessId/settings` protected by `requireTenantMembershipMiddleware`, `requirePermissions(...)`, and PostgreSQL Row-Level Security (`withTenantTransaction`).
- [x] **Frontend Business Profile, Settings & Live Business Switcher**: Created `BusinessProfilePage.tsx` (`/app/business-profile`) and `BusinessSettingsPage.tsx` (`/app/settings`), and wired the top-bar Business Switcher in `AppShellLayout.tsx` to `useAuthSession.tsx`.
- [x] **Live PostgreSQL Multi-Tenant & RBAC Integration Tests**: Created `backend/src/tests/phase3BusinessMemberships.test.ts` verifying business onboarding, role seeding, cross-tenant access blocking (`403 TENANT_ACCESS_DENIED`), logo path prefix validation, and intra-tenant RBAC permission enforcement (`403 INSUFFICIENT_PERMISSIONS`).

---

## Phase 4 Completed Tasks Record

- [x] **RBAC Role & Permission Services (`backend/src/services/rbacEmployeeService.ts`)**: Implemented `listSystemPermissionsCatalog()`, `listTenantBusinessRoles()`, `createCustomBusinessRole()`, and `updateBusinessRole()` with immutable `business_owner` permission protection (`403 OWNER_ROLE_IMMUTABLE_PERMISSIONS`).
- [x] **Employee Onboarding & Lifecycle Management**: Implemented `listBusinessEmployees()`, `inviteOrAddBusinessEmployee()`, and `updateBusinessEmployeeMembership()` with cross-tenant role validation (`400 ROLE_NOT_IN_BUSINESS`), subscription `max_employees` quota enforcement (`403 SUBSCRIPTION_EMPLOYEE_QUOTA_EXCEEDED`), and sole-owner lockout protection (`409 LAST_BUSINESS_OWNER_PROTECTION`).
- [x] **Frontend Roles & Employees Modules**: Created `RolesPermissionsPage.tsx` (`/app/roles-permissions`) and `EmployeesPage.tsx` (`/app/employees`) and wired them into `App.tsx`.
- [x] **Live PostgreSQL Phase 4 Integration Tests**: Created `backend/src/tests/phase4RbacEmployees.test.ts` verifying all role, permission, employee, quota, and security invariants.

---

## Phase 5 Completed Tasks Record

- [x] **Database RLS Hardening (`003_customer_documents_rls.sql`)**: Added the `tenant_isolation_customer_documents` Row-Level Security policy on `customer_documents` matching `customers`.
- [x] **Customer & KYC Backend Services (`backend/src/services/customerKycService.ts`)**: Implemented `listTenantCustomers()`, `getTenantCustomerDetails()`, `createTenantCustomer()` (enforcing subscription `max_customers` quota, sequential `customerNumberPrefix` numbering, and `NUMERIC(19, 4)` `monthly_income` storage via `toStorageMoney()`), `updateTenantCustomer()` (enforcing `customers:update` vs `customers:archive`), `addCustomerKycDocument()` (enforcing `businesses/<businessId>/customers/<customerId>/kyc/` prefix ownership), and `verifyCustomerKycDocument()`.
- [x] **Frontend Borrowers & KYC Registry (`frontend/src/pages/CustomersPage.tsx`)**: Built `/app/customers` with borrower onboarding, search & risk-tier filtering, underwriting profile editing, and KYC document registration/verification.
- [x] **Live PostgreSQL Phase 5 Integration Tests**: Created `backend/src/tests/phase5CustomersKyc.test.ts` testing sequential customer numbering, `NUMERIC(19, 4)` decimal storage, float rejection, search/filtering, archiving, KYC path spoofing protection, KYC verification, cross-tenant isolation, and RBAC enforcement.

---

## Phase 6 Completed Tasks Record

- [x] **Loan Product Catalog Services (`backend/src/services/loanManagementService.ts`)**: Implemented `listTenantLoanProducts()`, `createTenantLoanProduct()`, and `updateTenantLoanProduct()` enforcing `FinancialDecimal` principal bounds (`maxPrincipal >= minPrincipal`), installment bounds, unique product codes (`409 LOAN_PRODUCT_CODE_EXISTS`), and `NUMERIC(10, 6)` rate precision (`toStorageRate()`).
- [x] **Loan Origination & Lifecycle State Machine**: Implemented `createLoanApplication()`, `submitDraftLoanApplication()`, `reviewLoanApplication()`, `approveLoanApplication()`, `rejectLoanApplication()`, and `disburseApprovedLoan()` enforcing `RESTRICTED` borrower risk blocks (`403 CUSTOMER_RISK_RESTRICTED`), dual-control separation of duties (`403 DUAL_CONTROL_APPROVAL_VIOLATION`), subscription `max_active_loans` quota (`403 SUBSCRIPTION_ACTIVE_LOAN_QUOTA_EXCEEDED`), and atomic persistence of `repayment_schedules` on disbursement.
- [x] **Frontend Loan Products & Loans Modules**: Created `LoanProductsPage.tsx` (`/app/loan-products`) and `LoansPage.tsx` (`/app/loans`) and wired them into `App.tsx`.
- [x] **Live PostgreSQL Phase 6 Integration Tests**: Created `backend/src/tests/phase6LoansProducts.test.ts` verifying product creation/validation, origination bounds, `Decimal.js` contracted financial totals, dual-control approval, disbursement schedule persistence, rejection balance zeroing, cross-tenant isolation, and RBAC enforcement.

---

## Phase 7 Completed Tasks Record

- [x] **Schedule, Delinquency, Penalty & Workout Engine (`backend/src/services/scheduleEngineService.ts`)**: Implemented `listTenantRepaymentSchedules()` with deterministic UTC days-past-due (`computeDaysPastDue`), `evaluateTenantDelinquencyAndPenalties()` enforcing product-level `grace_period_days` and idempotent `Decimal.js` late penalty accrual (`roundCurrencyUnit(unpaidPrincipal * latePenaltyRatePercent / 100)`) across `repayment_schedules` and `loans`, `listTenantOverdueLoans()`, `restructureTenantLoan()` (`loans:restructure`), and `writeOffTenantLoan()` (`loans:write_off`).
- [x] **Frontend Repayment Schedules & Overdue Workout Modules**: Created `RepaymentSchedulesPage.tsx` (`/app/repayment-schedules`) and `OverdueLoansPage.tsx` (`/app/overdue-loans`) and wired them into `App.tsx`.
- [x] **Live PostgreSQL Phase 7 Integration Tests**: Created `backend/src/tests/phase7SchedulesEngine.test.ts` verifying master schedule queries, grace-period evaluation, idempotent `Decimal.js` late penalty accrual, loan restructuring with penalty waiver, loan write-off, RBAC enforcement, and cross-tenant RLS isolation.

---

## Phase 8 Completed Tasks Record

- [x] **Database RLS Hardening (`004_repayment_receipts_rls_and_platform_settings.sql`)**: Added Row-Level Security policies `tenant_isolation_repayment_allocations` and `tenant_isolation_payment_receipts` enforcing tenant isolation and Super Admin read/write rules.
- [x] **Deterministic Repayment Waterfall & Receipts Engine (`backend/src/services/repaymentManagementService.ts`)**: Implemented `listTenantRepayments()`, `getTenantRepaymentDetails()`, `recordTenantLoanRepayment()` (allocating payments in strict `Penalty -> Fee -> Interest -> Principal` priority across chronologically ordered unpaid installments, enforcing `allowPartialInstallmentPayments`, capturing `overpayment_credit`, transitioning loans to `CLOSED_PAID` when `total_outstanding === 0`, issuing immutable `payment_receipts` snapshots, and writing notifications + audit logs), `reverseTenantLoanRepayment()` (`repayments:reverse`), and `getTenantPaymentReceipt()`.
- [x] **Frontend Repayments & Receipts Workspace (`frontend/src/pages/RepaymentsPage.tsx`)**: Built `/app/repayments` with repayment posting, installment waterfall allocation inspection, printable official receipts, and audited repayment reversal.
- [x] **Live PostgreSQL Phase 8 Integration Tests**: Created `backend/src/tests/phase8RepaymentsReceipts.test.ts` verifying the 4-tier waterfall allocation, sequential `PAY-00001` / `RCPT-00001` numbering, `CLOSED_PAID` payoff & `overpayment_credit`, and audited repayment reversal with RBAC enforcement.

---

## Phase 9 Completed Tasks Record

- [x] **Real PostgreSQL Financial Aggregations & PAR Engine (`backend/src/services/financialReportingService.ts`)**: Implemented `getBusinessFinancialDashboard()` computing live portfolio KPIs, collection efficiency %, 5-bucket Portfolio at Risk (`CURRENT`, `PAR_1_29`, `PAR_30_59`, `PAR_60_89`, `PAR_90_PLUS`), `par30RatioPercent`, `par90RatioPercent`, monthly cashflow series, and product performance breakdown directly from PostgreSQL `NUMERIC` columns + `Decimal.js`.
- [x] **CSV Statement Export & Operational Notifications**: Implemented `exportBusinessFinancialStatementCsv()` (`reports:export`) and `listTenantNotifications()` / `markTenantNotificationRead()`.
- [x] **Frontend Executive Dashboard, Financial Reports & Notifications Pages**: Created `FinancialDashboardAndReportsPage.tsx` (`/app/dashboard` and `/app/financial-reports`) with Recharts monthly cashflow charts, PAR aging table, product breakdown, and CSV export, plus `NotificationsPage.tsx` (`/app/notifications`).

---

## Phase 10 Completed Tasks Record

- [x] **FloTech Digital Super Admin Service & Controllers (`backend/src/services/superAdminService.ts`, `backend/src/controllers/superAdminController.ts`)**: Implemented all 9 Super Admin capabilities (`getSuperAdminGlobalKpis`, `listSuperAdminBusinesses`, `updateSuperAdminBusinessStatus`, `listSuperAdminUsers`, `updateSuperAdminUserStatus` with self-lockout guard, `listSuperAdminSubscriptionPlans`, `upsertSuperAdminSubscriptionPlan`, `listSuperAdminSubscriptions`, `assignSuperAdminBusinessSubscription`, `getSuperAdminRevenueAnalytics` with MRR/ARR calculation, `broadcastSuperAdminNotification`, `listSuperAdminAuditLogs`, and `listSuperAdminPlatformSettings` / `upsertSuperAdminPlatformSetting`).
- [x] **Frontend Super Admin Environment (`frontend/src/pages/SuperAdminSuitePage.tsx`)**: Built all 9 Environment B routes (`/super-admin/dashboard`, `/super-admin/businesses`, `/super-admin/users`, `/super-admin/subscriptions`, `/super-admin/plans-pricing`, `/super-admin/revenue-analytics`, `/super-admin/platform-notifications`, `/super-admin/audit-logs`, `/super-admin/platform-settings`).
- [x] **Live PostgreSQL Phase 9 & 10 Integration Tests**: Created `backend/src/tests/phase9And10ReportsSuperAdmin.test.ts` verifying live PAR ratios, CSV financial statement export, notification read state, `403 SUPER_ADMIN_REQUIRED` enforcement against ordinary business owners, and full Super Admin operations.

