# FloTech Digital — Multi-Tenant Loan Management SaaS

**Owner:** FloTech Digital  
**Current Phase:** Phase 1 — Architecture & Project Foundation (Complete, awaiting approval for Phase 2)

---

## 1. Executive Summary

The **FloTech Digital Loan Management SaaS** is a commercial, multi-tenant financial platform engineered for small businesses, independent entrepreneurs, merchants, lending businesses, associations, and medium-sized companies.

Businesses use the platform to manage customers, KYC documents, loan products, loan originations, amortization schedules, repayments, delinquency/overdue tracking, employees, role-based permissions, and financial reporting. Simultaneously, **FloTech Digital** operates a dedicated **Super Admin** governance environment to oversee tenant businesses, users, subscriptions, plans/pricing, revenue analytics, and immutable audit logs.

---

## 2. Approved Technology Stack

| Layer | Approved Technology |
| :--- | :--- |
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui patterns, Lucide React, Recharts, React Router |
| **Backend** | Node.js, TypeScript, Express.js REST API, Zod validation, `Decimal.js` financial engine |
| **Authentication** | Firebase Authentication (ID Token verification via Firebase Admin SDK) |
| **Primary Database** | PostgreSQL (Single source of truth; Google Cloud SQL in production, Local PostgreSQL in dev) |
| **File Storage** | Firebase Storage (KYC documents, loan contracts, PDF receipts; metadata in PostgreSQL) |
| **Security** | Firebase Auth JWT verification, Firebase App Check, Backend RBAC, PostgreSQL Row-Level Security (RLS) |
| **Deployment Target** | Cloudflare Pages (Frontend), Google Cloud Run (Backend), Google Cloud SQL (PostgreSQL), Cloudflare DNS |

---

## 3. Non-Negotiable Architectural Rules

1. **PostgreSQL is the single source of truth** for all business, user, RBAC, and financial data.
2. **Firestore is never used** as a database.
3. **No unapproved databases** are introduced.
4. **Zero secrets in frontend code** — database credentials and private keys exist strictly in backend environment variables / Secret Manager.
5. **Zero critical financial calculations in the frontend** — all amortization, interest, fee, and penalty calculations execute on the backend.
6. **Zero trust in client-supplied tenant IDs or roles** — every request targeting a business validates active membership and permissions in PostgreSQL.
7. **Zero JavaScript floating-point math for money** — raw `number` types are rejected in monetary functions.
8. **PostgreSQL `NUMERIC(19, 4)` + `Decimal.js`** (`ROUND_HALF_UP`) are used across the entire financial pipeline.
9. **Strict Frontend / Backend separation** within a clean workspace architecture.
10. **Tested increments** — every phase is verified via automated tests and compilation checks before sign-off.

---

## 4. Repository Structure

```text
/home/antigravity
├── package.json                  # Workspace scripts (shared, backend, frontend)
├── tsconfig.base.json            # Strict shared TypeScript compiler baseline
├── packages/
│   └── shared/                   # @flotech/shared — DTOs, enums, permission codes, API contracts
│       └── src/index.ts
├── backend/                      # @flotech/backend — Node.js + Express + TypeScript REST API
│   ├── .env.example
│   └── src/
│       ├── app.ts                # Express app factory (Helmet, CORS, Request ID, Error Handler)
│       ├── server.ts             # HTTP server entrypoint
│       ├── config/               # Zod env validation & Firebase Admin lazy initialization
│       ├── controllers/          # Route controllers
│       ├── database/             # PostgreSQL Pool (OID 1700 string parser, RLS transactions)
│       │   └── migrations/       # 001_initial_schema_blueprint.sql
│       ├── financial/            # Decimal.js financial calculation & schedule engine
│       ├── middleware/           # App Check, Firebase Auth, Tenant Isolation, RBAC, Super Admin guards
│       ├── models/               # Strongly-typed PostgreSQL table row interfaces
│       ├── routes/               # /api/v1 router (public health, tenant routes, super-admin routes)
│       ├── services/             # Domain services layer
│       ├── tests/                # Vitest unit & Supertest API integration suites
│       └── validation/           # Zod request schemas enforcing DecimalString inputs
├── frontend/                     # @flotech/frontend — React + TypeScript + Vite + Tailwind CSS
│   ├── .env.example
│   └── src/
│       ├── components/ui/        # Design system primitives (Button, Badge, Card, DataTable, FormElements)
│       ├── config/               # Navigation registry (15 Business + 9 Super Admin modules) & utilities
│       ├── hooks/                # Sidebar & multi-tenant switcher state hooks
│       ├── layouts/              # Responsive AppShellLayout (collapsible sidebar, top bar, menus)
│       ├── pages/                # Phase 1 Architecture Hub & module route shells
│       └── services/             # Typed REST API client
└── docs/
    ├── ARCHITECTURE.md           # Service communication, auth flow, DB strategy, tenant isolation
    ├── DATABASE_DESIGN.md        # Complete ERD, table specifications, and composite FK rules
    ├── SECURITY.md               # App Check, JWT verification, RBAC, RLS, Super Admin protection
    ├── DESIGN_SYSTEM.md          # Color palette, typography, spacing, and UI component standards
    └── DEVELOPMENT_ROADMAP.md    # 12-Phase master development plan & Phase 1 completion checklist
```

---

## 5. Local Development Commands

```bash
# Install dependencies across all workspaces
npm install

# Typecheck all packages (shared, backend, frontend)
npm run typecheck

# Run backend unit & API integration tests (Vitest + Supertest)
npm run test

# Build all packages for production verification
npm run build

# Start backend development server (Port 8080)
npm run dev:backend

# Start frontend development server (Port 5173)
npm run dev:frontend
```
