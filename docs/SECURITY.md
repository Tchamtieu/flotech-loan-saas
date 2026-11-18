# FloTech Digital — Security & Compliance Architecture

Security is engineered into the foundation of the FloTech Digital Loan Management SaaS across authentication, client attestation, authorization, multi-tenant isolation, financial integrity, and secret management.

---

## 1. Authentication & Client Attestation

### A. Firebase Authentication Token Verification
- Implemented in [`authenticateUserMiddleware`](file:///home/antigravity/backend/src/middleware/security.ts).
- Every protected request must supply an `Authorization: Bearer <ID_TOKEN>` header.
- The backend verifies the cryptographic signature, expiration, audience, and revocation status (`verifyIdToken(token, true)`) via the Firebase Admin SDK.
- After token verification, the backend queries PostgreSQL (`users` table) by `firebase_uid` to load the user's canonical account status (`is_active`) and `platform_role`.

### B. Firebase App Check Enforcement
- Implemented in [`verifyAppCheckMiddleware`](file:///home/antigravity/backend/src/middleware/security.ts).
- Protected API routes require the `X-Firebase-AppCheck` header containing an attestation token issued to the official FloTech web application.
- Blocks unauthorized scripts, replay tools, and automated scraping from invoking backend endpoints directly.

---

## 2. Backend Authorization & Role-Based Access Control (RBAC)

- **Zero Client Trust (Rule #6)**: The frontend never dictates what permissions a user has or which business they belong to.
- **Tenant Membership Verification ([`requireTenantMembershipMiddleware`](file:///home/antigravity/backend/src/middleware/security.ts))**:
  - Extracts `:businessId` or `X-Business-Id`, validates UUID format, and queries PostgreSQL `business_memberships` joined with `businesses`, `roles`, and `role_permissions`.
  - Rejects requests immediately (`403 TENANT_ACCESS_DENIED`) if the membership is not `ACTIVE` or if the business is `SUSPENDED` / `ARCHIVED`.
- **Granular Permission Guard ([`requirePermissions`](file:///home/antigravity/backend/src/middleware/security.ts))**:
  - Each endpoint declares required `PermissionCode` constants (e.g., `PermissionCode.LOANS_APPROVE`, `PermissionCode.REPAYMENTS_RECORD`).
  - Only members whose PostgreSQL role grants all required permissions can execute the controller.

---

## 3. Super Admin Privilege Escalation Prevention

Ordinary business users must **never** be able to grant themselves FloTech Digital Super Admin privileges. We enforce this through three independent controls:

1. **No Client-Writable Role Field**: Registration and profile update schemas in Zod never accept `platform_role`.
2. **Backend Super Admin Guard ([`requireSuperAdminMiddleware`](file:///home/antigravity/backend/src/middleware/security.ts))**: All `/api/v1/super-admin/*` routes verify `req.authUser.platformRole === PlatformRole.SUPER_ADMIN` directly from the PostgreSQL `users` record.
3. **PostgreSQL Trigger (`trg_enforce_super_admin_protection`)**: Defined in [`001_initial_schema_blueprint.sql`](file:///home/antigravity/backend/src/database/migrations/001_initial_schema_blueprint.sql#L103-L116). Any `INSERT` or `UPDATE` attempting to set `platform_role = 'SUPER_ADMIN'` raises a `SECURITY_VIOLATION` exception unless the database session variable `app.is_super_admin` is explicitly `'true'`.

---

## 4. Multi-Tenant Data Isolation

1. **Application Query Filtering**: Every repository query binds `business_id` from the verified `req.tenantContext.businessId`.
2. **Composite Foreign Keys**: All child tables reference `(business_id, parent_id)` so cross-tenant foreign key references are rejected by PostgreSQL.
3. **PostgreSQL Row-Level Security (RLS)**: [`withTenantTransaction`](file:///home/antigravity/backend/src/database/pool.ts) executes `SELECT set_config('app.current_business_id', $1, true)` inside every transaction, and RLS policies restrict row visibility and mutation to that `business_id`.

---

## 5. Financial Calculation & Ledger Integrity

- **No Frontend Financial Math (Rule #5 & #7)**: All loan amortization, interest accrual, fee calculation, and repayment allocation run on the backend in [`decimalEngine.ts`](file:///home/antigravity/backend/src/financial/decimalEngine.ts).
- **No Floating-Point Types (Rule #7 & #8)**:
  - Zod schemas ([`PositiveDecimalStringSchema`](file:///home/antigravity/backend/src/validation/schemas.ts)) reject JSON numbers and accept only string-encoded decimals.
  - `toStorageMoney()` throws a runtime error if passed a JavaScript `number`.
  - PostgreSQL stores all money as `NUMERIC(19, 4)` and `node-postgres` parses OID `1700` as strings.
- **No Destructive Financial Deletes**: Repayments and loans cannot be deleted (`ON DELETE RESTRICT`). Erroneous repayments are handled via audited reversals (`is_reversed = TRUE`, `reversed_by_user_id`, `reversal_reason`).

---

## 6. Secret Management & Transport Security

- **Frontend Public-Only Variables**: Only public `VITE_*` configuration identifiers are permitted in `frontend/`. Database URLs and service account credentials are never placed in frontend code.
- **HTTP Security Headers**: `helmet` and strict `cors` origin whitelisting are configured in [`backend/src/app.ts`](file:///home/antigravity/backend/src/app.ts).
