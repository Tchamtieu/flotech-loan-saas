# FloTech Digital — Design System Specification

The FloTech Digital Design System provides a cohesive, high-trust fintech visual language across both the **Business Environment** and the **FloTech Digital Super Admin Environment**.

---

## 1. Approved Color Palette

Configured in [`frontend/tailwind.config.js`](file:///home/antigravity/frontend/tailwind.config.js) and [`frontend/src/index.css`](file:///home/antigravity/frontend/src/index.css):

| Token Name | Hex Value | Tailwind Class | Primary Usage |
| :--- | :--- | :--- | :--- |
| **Primary Blue** | `#2563EB` | `bg-flotech-primary` / `text-flotech-primary` | Primary CTAs, active navigation in Business Env, focus rings |
| **Dark Navy** | `#0F172A` | `bg-flotech-navy` / `text-flotech-navy` | Collapsible sidebar shell, primary headings, high-contrast text |
| **Background** | `#F8FAFC` | `bg-flotech-bg` | Global application canvas background |
| **Surface White** | `#FFFFFF` | `bg-white` / `bg-flotech-surface` | Cards, data tables, form inputs, top navigation bar |
| **Success** | `#16A34A` | `bg-flotech-success` / `text-flotech-success` | Performing loans, paid installments, verified KYC status |
| **Warning** | `#F59E0B` | `bg-flotech-warning` / `text-flotech-warning` | Grace periods, pending approvals, upcoming maturities |
| **Danger** | `#DC2626` | `bg-flotech-danger` / `text-flotech-danger` | Overdue loans (PAR), defaulted status, destructive actions |
| **Secondary Teal** | `#0D9488` | `bg-flotech-teal` / `text-flotech-teal` | Super Admin environment accents, total payable indicators |

---

## 2. Typography

- **Primary Sans-Serif (`Inter`)**:
  - Loaded via Google Fonts in [`frontend/index.html`](file:///home/antigravity/frontend/index.html) with OpenType features `'cv02', 'cv03', 'cv04', 'cv11'` enabled for maximum legibility at small financial dashboard sizes.
- **Monospace & Tabular Numerals (`JetBrains Mono` + `.tabular-money`)**:
  - Applied to all monetary columns, principal balances, interest rates, loan reference numbers, and installment tables so digits align vertically across rows.

---

## 3. Spacing, Layout & Responsive Behavior

- **Application Shell ([`AppShellLayout.tsx`](file:///home/antigravity/frontend/src/layouts/AppShellLayout.tsx))**:
  - **Desktop (`lg` and above)**: Persistent collapsible Dark Navy (`#0F172A`) sidebar (`w-72` expanded, `w-20` icon-only collapsed) paired with a sticky translucent top bar (`h-16`) and a centered `max-w-7xl` content container (`p-8`).
  - **Tablet & Mobile (`< lg`)**: Off-canvas slide-over drawer with backdrop blur, accessible via the top-left menu trigger (`#btn-open-mobile-drawer`).
- **Top Navigation Controls**:
  - **Business Switcher (`#btn-business-switcher`)**: Displays current business legal name, code, user role, and currency code (`USD`, `EUR`, etc.).
  - **Notification Panel (`#btn-notification-panel`)**: Popover panel displaying real-time database-backed alerts.
  - **User Profile Menu (`#btn-user-profile-menu`)**: Quick access to Personal Profile and session controls.

---

## 4. Reusable UI Components

All UI primitives live in [`frontend/src/components/ui/`](file:///home/antigravity/frontend/src/components/ui/) to eliminate duplicated interface code:

1. **[`Button.tsx`](file:///home/antigravity/frontend/src/components/ui/Button.tsx)**: Variants (`primary`, `navy`, `teal`, `outline`, `ghost`, `danger`, `success`) and sizes (`sm`, `md`, `lg`, `icon`) with keyboard focus rings (`focus-visible:ring-2`).
2. **[`Badge.tsx`](file:///home/antigravity/frontend/src/components/ui/Badge.tsx)**: Semantic status pills (`primary`, `teal`, `success`, `warning`, `danger`, `neutral`, `navy`).
3. **[`Card.tsx`](file:///home/antigravity/frontend/src/components/ui/Card.tsx)**: Structured container (`Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`) with subtle elevation (`shadow-card`).
4. **[`FormElements.tsx`](file:///home/antigravity/frontend/src/components/ui/FormElements.tsx)**: Accessible `InputField` and `SelectField` with uppercase tracking labels, helper text, and validation error states.
5. **[`DataTable.tsx`](file:///home/antigravity/frontend/src/components/ui/DataTable.tsx)**: Horizontally scrollable financial table primitives (`DataTableContainer`, `DataTableHead`, `DataTableHeaderCell`, `DataTableRow`, `DataTableCell`) with right-aligned `.tabular-money` support.
