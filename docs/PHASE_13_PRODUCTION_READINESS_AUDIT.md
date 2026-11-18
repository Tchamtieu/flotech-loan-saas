# FloTech Digital — Phase 13 Production Readiness Audit

**Audit date:** 2026-11-18 · **Scope:** full monorepo (`packages/shared`, `backend`, `frontend`), PostgreSQL 15 schema & migrations 001–006, deployment artifacts.

**Evidence base (this run):**

| Check | Command | Result |
|---|---|---|
| Build (shared + backend + frontend) | `npm run build` | ✅ exit 0 (warning: frontend bundle 1.1 MB, see M-1) |
| Typecheck (all workspaces) | `npm run typecheck` | ✅ exit 0 |
| Live PostgreSQL test suite | `npm run test` | ✅ **11/11 files, 45/45 tests passed** |
| Backup → restore drill | `pg_dump -Fc` → `pg_restore` into `flotech_loan_saas_restore_verify` | ✅ identical counts (see Task 7) |
| Dependency audit | `npm audit --omit=dev` | ⚠️ 13 findings (5 high, 8 moderate), see H-5 |

> [!IMPORTANT]
> **Launch verdict: NOT YET READY for real financial transactions.** The backend logic, financial engine and tenant isolation are verified by automated tests. Launch is blocked by open items **H-4** (production DB role must not bypass RLS), **H-5** (dependency upgrades), and **L-0** (items that cannot be verified without a real Firebase project / staging deployment). These are listed in the release checklist at the end.

---

## Task 1 — Prioritized Findings

### Fixed in this audit

| ID | Severity | Finding | Fix | Evidence |
|---|---|---|---|---|
| C-1 | CRITICAL | Migration 005 and `subscriptionManagementService` referenced non-existent columns (`monthly_price_usd`, `billing_interval`, `auto_renew`, `is_active`, `trial_ends_at`). Migration aborted, so **every** test suite and the subscription page failed. | Rewrote [005_phase11_plans_and_idempotency.sql](file:///home/antigravity/backend/src/database/migrations/005_phase11_plans_and_idempotency.sql) and [subscriptionManagementService.ts](file:///home/antigravity/backend/src/services/subscriptionManagementService.ts) against the canonical schema (`monthly_price`, `billing_cycle`, `cancel_at_period_end`, `is_public`, `unit_price`); added `canceled_at`. Plan changes now also update `unit_price` so Super Admin MRR is correct. | phase11 (2/2), all suites pass |
| C-2 | CRITICAL | Quota/expiry guards in customer, loan-disbursement and employee services queried `bs.auto_renew` (non-existent) → 500 on every create. | Switched to `cancel_at_period_end` in [customerKycService.ts](file:///home/antigravity/backend/src/services/customerKycService.ts), [loanManagementService.ts](file:///home/antigravity/backend/src/services/loanManagementService.ts), [rbacEmployeeService.ts](file:///home/antigravity/backend/src/services/rbacEmployeeService.ts). | phase4/5/6/11 pass |
| H-1 | HIGH | An earlier "fix" changed invited-user `platform_role` to `'STANDARD_USER'`, but the enum is `('USER','SUPER_ADMIN')` → inviting an unregistered email returned 500. | Reverted to `'USER'` in [rbacEmployeeService.ts](file:///home/antigravity/backend/src/services/rbacEmployeeService.ts). | phase4 test 4, phase13 Task 2 |
| H-2 | HIGH | Expired/canceled subscriptions fell back to default quotas instead of blocking. | Explicit `403 SUBSCRIPTION_INACTIVE_OR_EXPIRED` for `EXPIRED`/`CANCELED`/`PAST_DUE` or past period end with cancel-at-period-end. | phase11 test 2 |
| H-3 | HIGH | No duplicate-payment protection. | `idempotency_key` + partial unique indexes on `repayments`; service returns `409 DUPLICATE_REPAYMENT_SUBMISSION`. | phase13 Task 3B |
| H-6 | HIGH | RLS enabled on `role_permissions`/`business_memberships` **without policies**; RLS not enabled on `business_subscriptions`, `notifications`, `audit_logs`. | New [006_phase13_complete_rls_coverage.sql](file:///home/antigravity/backend/src/database/migrations/006_phase13_complete_rls_coverage.sql) — 14 tables covered, 14 policies. | phase13 Task 7 |
| H-7 | HIGH | Password reset and email verification were not implemented in the frontend. | Added `sendPasswordReset` / `resendEmailVerification` + verification on registration in [useAuthSession.tsx](file:///home/antigravity/frontend/src/hooks/useAuthSession.tsx); "Forgot password?" in [AuthPortalPage.tsx](file:///home/antigravity/frontend/src/pages/AuthPortalPage.tsx). | Typecheck/build only — see L-0 |
| H-8 | HIGH | No Firebase Storage security rules existed in the repo. | Added [storage.rules](file:///home/antigravity/storage.rules) + [firebase.json](file:///home/antigravity/firebase.json): owner-only avatars, create-only tenant files, no client reads of KYC, size/type limits. | Not deployed — see L-0 |
| M-2 | MEDIUM | Sub-cent schedules (`0.0500` × 10) could overshoot remaining principal. | Clamped `principalDue`/`interestDue` in `decimalEngine.ts`. | phase13 Task 3A |
| M-4 | MEDIUM | `LoanDTO` lacked repaid/collected fields; customer profile lacked loan history. | Added the 9 accounting fields and `loans[]` on customer detail. | phase13 Task 3B |
| M-5 | MEDIUM | Physical deletion of financial records possible. | `prevent_validated_financial_delete()` triggers on repayments, allocations, receipts, audit_logs. | phase13 Task 3B |

### Open (must be addressed before launch)

| ID | Severity | Finding | Required action |
|---|---|---|---|
| **H-4** | HIGH | Local app connects as `flotech_app`, which is **superuser and table owner** — PostgreSQL bypasses RLS for both. Tenant isolation today is enforced by application-level `business_id` filters (fully tested), but RLS defense-in-depth is inactive. Some platform queries (`queryPlatform`) run without tenant settings and would need adjusting under a restricted role. | In Cloud SQL create a migration-owner role and a separate **non-owner, non-superuser** runtime role with only DML grants; route auth-time lookups through `withTenantTransaction` with `app.current_user_id`; rerun the suite under the restricted role. |
| **H-5** | HIGH | `npm audit`: `@grpc/grpc-js` ≤1.13.5 (transitive via `firebase-admin`), `zod` <4.6.6, `uuid` <11.1.1 (5 high, 8 moderate). Fixes require major-version upgrades. | Upgrade `firebase-admin` and `zod` (v4 migration of env/request schemas), rerun tests. Needs your approval because changes are breaking. |
| M-1 | MEDIUM | Frontend single bundle 1.1 MB (282 KB gzip). | Route-level `React.lazy` code splitting. |
| M-3 | MEDIUM | Storage rules cannot verify business membership (memberships live in PostgreSQL); an authenticated user could create (not read/overwrite) a file under another tenant's prefix. Backend rejects linking such paths. | Backend-issued signed upload URLs or custom claims. |
| M-6 | MEDIUM | Billing is `MANUAL_INVOICE_OR_SANDBOX` — no payment processor; plan changes take effect without payment. | Integrate a payment provider (requires your approval) or restrict plan changes to Super Admin. |
| L-1 | LOW | Plan prices in migration 002 (Starter $49, Growth $149, Enterprise $399) are retained; confirm commercial pricing. | Business decision. |
| L-2 | LOW | Rate limiting is per-instance (in memory) on Cloud Run. | Add Cloudflare rate-limit rules in front of the API. |
| **L-0** | — | **Not verifiable in this environment:** real Firebase registration/email verification/password reset/avatar & logo upload (no Firebase project keys), Storage rules deployment, Cloud Run/Cloud SQL/Cloudflare deployment, browser-based responsiveness. | Execute on a staging project (checklist below). |

---

## Task 2 — End-to-End Business Testing

Executed through the real Express app (supertest) against live PostgreSQL, with Firebase token verification replaced by a test verifier.

| Area | Scenario | Result | Test |
|---|---|---|---|
| Auth | Session provisioning, `GET/PATCH /auth/me`, invalid token → 401, missing App Check → 401 | ✅ | phase2 |
| Auth | Register / verify email / reset password / logout in Firebase | ⚠️ Code implemented; not executable without Firebase project | L-0 |
| Profile | Update profile, avatar path ownership (`avatars/{uid}/` enforced) | ✅ (path validation); real upload L-0 | phase2 |
| Business | Create, update profile/settings, currency, logo path validation, switch businesses | ✅ | phase3 |
| Employees | Invite existing & unregistered email, assign/change role, custom role permissions, last-owner protection | ✅ | phase4, phase13 |
| Customers | Create, edit, search, archive, profile + loan history | ✅ | phase5, phase13 |
| Loans | Products, origination, interest config, submit → review → approve → disburse, reject, schedules, status transitions, dual control | ✅ | phase6, phase7 |
| Repayments | Full, partial, early, overpayment credit, external reference, receipts, history, reversal | ✅ | phase8, phase13 |

## Task 3 — Financial Accuracy Report

All values computed by the backend `Decimal.js` engine (`ROUND_HALF_UP`, 4 dp storage, `NUMERIC(19,4)`); no float columns exist in the schema (verified by query).

| Case | Expected | Actual | Status |
|---|---|---|---|
| Flat 1,000 @5%/period × 4, fee 15 + 1% | interest 200.0000, fee 25.0000, payable 1,225.0000, final balance 0 | identical | ✅ |
| Reducing (annuity) 10,000 @12% p.a. × 12 monthly | Σ principal = 10,000.0000, final balance 0 | identical | ✅ |
| Reducing equal principal 3,000 @2%/period × 3 | interest 60 / 40 / 20, total 120.0000 | identical | ✅ |
| Interest-free 1,200 @0% × 6 | interest 0, each principal 200.0000 | identical | ✅ |
| Daily × 7 from 2027-03-01 | last due 2027-03-07 | identical | ✅ |
| Weekly × 4 from 2027-03-01 | 03-08 … 03-22 | identical | ✅ |
| Single payment (interest-only, quarterly × 1) | 1 installment, principal 2,500.0000 | identical | ✅ |
| Very small 0.0500 × 10 | Σ principal 0.0500, no negative balance | identical | ✅ |
| Large 99,999,999.9900 × 24 | Σ principal exact, final balance 0 | identical | ✅ |
| Waterfall | Penalty → Fee → Interest → Principal | verified per allocation row | ✅ (phase8) |
| Late penalty accrual | deterministic, idempotent re-evaluation | verified | ✅ (phase7) |
| 9 accounting fields after partial payment | original, repaid, outstanding, interest charged/collected, fees, penalties, total paid, remaining due reconcile | reconcile exactly | ✅ (phase13) |
| Duplicate submission (same idempotency key / reference) | 409 | 409 `DUPLICATE_REPAYMENT_SUBMISSION` | ✅ |
| Reversal | balances restored, audit row written | verified | ✅ (phase8) |
| Physical DELETE of repayment in user transaction | rejected | `FINANCIAL_IMMUTABILITY_VIOLATION` | ✅ |
| Float money input (`number` JSON) | rejected | 400 | ✅ (phase5/6) |

## Task 4 — Multi-Tenant Security Report

Business A (Owner/Manager/Cashier, Customer, Loan, Repayment) vs Business B — phase13 Task 4, plus phase3–8 isolation tests.

| Attack | Expected | Result |
|---|---|---|
| A reads B customers / loans / repayments / reports via B's URL ID | 403/404 | ✅ blocked |
| URL business ID tampering (member of A, path of B) | 403 `TENANT_ACCESS_DENIED` | ✅ |
| Cashier creating products / approving loans / managing employees | 403 `INSUFFICIENT_PERMISSIONS` | ✅ |
| Role spoofing via request body / headers | ignored, backend-resolved role | ✅ |
| Self-elevation to `SUPER_ADMIN` | blocked by DB trigger `enforce_super_admin_protection` + API | ✅ |
| Business owner calling `/super-admin/*` | 403 `SUPER_ADMIN_REQUIRED` | ✅ |
| Storage path of another tenant/user saved to profile/KYC | 400 rejected | ✅ |
| DB-level RLS | policies on 14 tables | ⚠️ present, inactive for owner role (H-4) |

## Task 5 — Super Admin Audit

Verified in phase9And10: global KPIs, business activate/suspend/reactivate, user activation, plan upsert, subscription assignment, MRR/ARR, broadcast notifications, audit log explorer, platform settings, and `403 SUPER_ADMIN_REQUIRED` for non-admins. All ✅. Super Admin promotion is only possible via direct DB operation by the platform operator.

## Task 6 — Subscription & Billing

| Check | Result |
|---|---|
| Catalog FREE / STARTER_TRIAL / BUSINESS / GROWTH_PRO / ENTERPRISE | ✅ |
| New business → STARTER_TRIAL `TRIALING` | ✅ |
| Monthly vs annual pricing (BUSINESS annual = 790.0000) | ✅ |
| Downgrade with usage above limits → 409 `SUBSCRIPTION_DOWNGRADE_QUOTA_CONFLICT` | ✅ |
| Canceled → customer creation and disbursement blocked (403) → reactivate → allowed | ✅ |
| Employee / customer / active-loan quotas | ✅ |
| Viewer without `subscription:manage` cannot change plan | ✅ |
| Billing mode disclosed as `MANUAL_INVOICE_OR_SANDBOX` | ✅ (no real payments — M-6) |

## Task 7 — Database & Backup Audit

- 20 tables, UUID primary keys, composite `(business_id, id)` foreign keys preventing cross-tenant references, `CHECK` constraints on money ≥ 0, indexes on tenant/status/date columns, 6 ordered idempotent migrations tracked in `schema_migrations`, every mutation in a single ACID transaction.
- **Restore drill (executed 2026-11-18):** `pg_dump -Fc` (90,938 bytes) → `pg_restore` into isolated `flotech_loan_saas_restore_verify` in ~1 s. Source vs restored: tables 20/20, migrations 6/6, policies 14/14, immutability triggers 4/4, permissions 27/27, plan catalog identical. Restore DB and dump deleted afterward.

**Production backup policy (Cloud SQL):**

| Item | Policy |
|---|---|
| Automated backups | Daily, 7-day minimum (recommend 30) retention |
| Point-in-time recovery | Enabled (WAL retention 7 days) |
| Logical export | Weekly `gcloud sql export sql` to a locked, versioned GCS bucket, 90-day retention |
| RPO | ≤ 5 minutes (PITR) |
| RTO | ≤ 1 hour (clone to new instance, repoint Cloud Run `DATABASE_URL`) |
| Drill | Quarterly restore to a scratch instance, compare row counts as above |

## Task 8 — UX & Responsiveness

Code inspection: all 15 `/app/*` and 9 `/super-admin/*` routes resolve to real pages backed by API calls (no placeholders); Tailwind responsive breakpoints, collapsible sidebar, business switcher, notification panel, tables with search/filter, Recharts charts. Production build succeeds. **Not yet verified in a real browser across device sizes** — part of the staging checklist.

---

## Release Checklist (before real customers)

1. Cloud SQL: create restricted runtime role, apply migrations with owner role, rerun the suite as the runtime role (H-4).
2. Approve and perform dependency upgrades (`firebase-admin`, `zod` v4, `uuid`), rerun tests (H-5).
3. Create Firebase project: enable Email/Password, App Check (reCAPTCHA Enterprise), set `VITE_FIREBASE_*`; `firebase deploy --only storage`.
4. Staging deploy (Cloud Run + Cloudflare Pages), then manually execute: register → verify email → login → reset password → avatar/logo/KYC upload → full loan cycle, on desktop, tablet and mobile.
5. Configure Cloud SQL backups/PITR as above; run one restore drill on staging.
6. Point `loans.flotechdigital.com` / `api.loans.flotechdigital.com` DNS in Cloudflare; confirm CORS and security headers.
