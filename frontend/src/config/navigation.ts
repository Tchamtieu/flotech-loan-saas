import type { ComponentType } from 'react';
import {
  LayoutDashboard,
  Users,
  Landmark,
  PackageCheck,
  CalendarClock,
  Receipt,
  AlertTriangle,
  BarChart3,
  UserCheck,
  ShieldCheck,
  Bell,
  UserCircle,
  Building2,
  CreditCard,
  Settings,
  Globe,
  Layers,
  Activity,
  FileSearch,
} from 'lucide-react';

export interface NavItemConfig {
  id: string;
  label: string;
  path: string;
  phaseNumber: number;
  icon: ComponentType<{ className?: string }>;
  description: string;
}

/**
 * Environment A: Business Tenant Navigation (All 15 modules specified in Section 4A)
 */
export const BUSINESS_ENVIRONMENT_NAV_ITEMS: NavItemConfig[] = [
  {
    id: 'biz-dashboard',
    label: 'Dashboard',
    path: '/app/dashboard',
    phaseNumber: 9,
    icon: LayoutDashboard,
    description: 'Portfolio health, disbursement velocity, and collection KPIs.',
  },
  {
    id: 'biz-customers',
    label: 'Customers',
    path: '/app/customers',
    phaseNumber: 5,
    icon: Users,
    description: 'Borrower profiles, KYC verification documents, and credit tiers.',
  },
  {
    id: 'biz-loans',
    label: 'Loans',
    path: '/app/loans',
    phaseNumber: 6,
    icon: Landmark,
    description: 'End-to-end loan origination, underwriting, approval, and disbursement.',
  },
  {
    id: 'biz-loan-products',
    label: 'Loan Products',
    path: '/app/loan-products',
    phaseNumber: 6,
    icon: PackageCheck,
    description: 'Configurable interest methods, repayment frequencies, fees, and limits.',
  },
  {
    id: 'biz-schedules',
    label: 'Repayment Schedules',
    path: '/app/repayment-schedules',
    phaseNumber: 7,
    icon: CalendarClock,
    description: 'Amortization tables powered by PostgreSQL NUMERIC & Decimal.js.',
  },
  {
    id: 'biz-repayments',
    label: 'Repayments',
    path: '/app/repayments',
    phaseNumber: 8,
    icon: Receipt,
    description: 'Repayment recording, waterfall allocation, and official PDF receipts.',
  },
  {
    id: 'biz-overdue',
    label: 'Overdue Loans',
    path: '/app/overdue-loans',
    phaseNumber: 8,
    icon: AlertTriangle,
    description: 'Delinquency tracking, grace periods, and late penalty accruals.',
  },
  {
    id: 'biz-reports',
    label: 'Financial Reports',
    path: '/app/financial-reports',
    phaseNumber: 9,
    icon: BarChart3,
    description: 'Portfolio at Risk (PAR), interest yield, and cash-flow statements.',
  },
  {
    id: 'biz-employees',
    label: 'Employees',
    path: '/app/employees',
    phaseNumber: 4,
    icon: UserCheck,
    description: 'Staff invitations, branch assignments, and membership lifecycle.',
  },
  {
    id: 'biz-roles',
    label: 'Roles & Permissions',
    path: '/app/roles-permissions',
    phaseNumber: 4,
    icon: ShieldCheck,
    description: 'Granular role-based access control (RBAC) matrices per tenant.',
  },
  {
    id: 'biz-notifications',
    label: 'Notifications',
    path: '/app/notifications',
    phaseNumber: 9,
    icon: Bell,
    description: 'In-app alerts for loan approvals, upcoming maturities, and overdue accounts.',
  },
  {
    id: 'biz-personal-profile',
    label: 'Personal Profile',
    path: '/app/personal-profile',
    phaseNumber: 2,
    icon: UserCircle,
    description: 'Authenticated user identity, security settings, and Firebase session.',
  },
  {
    id: 'biz-business-profile',
    label: 'Business Profile',
    path: '/app/business-profile',
    phaseNumber: 3,
    icon: Building2,
    description: 'Legal entity details, registration numbers, currency, and branding.',
  },
  {
    id: 'biz-subscription',
    label: 'Subscription',
    path: '/app/subscription',
    phaseNumber: 11,
    icon: CreditCard,
    description: 'Active SaaS plan quotas, billing cycle, and invoice history.',
  },
  {
    id: 'biz-settings',
    label: 'Settings',
    path: '/app/settings',
    phaseNumber: 3,
    icon: Settings,
    description: 'Tenant operational preferences, numbering prefixes, and workflows.',
  },
];

/**
 * Environment B: FloTech Digital Super Admin Navigation (All 9 modules specified in Section 4B)
 */
export const SUPER_ADMIN_ENVIRONMENT_NAV_ITEMS: NavItemConfig[] = [
  {
    id: 'sa-dashboard',
    label: 'Global Dashboard',
    path: '/super-admin/dashboard',
    phaseNumber: 10,
    icon: Globe,
    description: 'Platform-wide tenant growth, active subscriptions, and system health.',
  },
  {
    id: 'sa-businesses',
    label: 'Businesses',
    path: '/super-admin/businesses',
    phaseNumber: 10,
    icon: Building2,
    description: 'Tenant onboarding verification, status governance, and compliance review.',
  },
  {
    id: 'sa-users',
    label: 'Users',
    path: '/super-admin/users',
    phaseNumber: 10,
    icon: Users,
    description: 'Global user directory and security account status management.',
  },
  {
    id: 'sa-subscriptions',
    label: 'Subscriptions',
    path: '/super-admin/subscriptions',
    phaseNumber: 11,
    icon: CreditCard,
    description: 'Tenant subscription lifecycles, trials, renewals, and past-due accounts.',
  },
  {
    id: 'sa-plans',
    label: 'Plans & Pricing',
    path: '/super-admin/plans-pricing',
    phaseNumber: 11,
    icon: Layers,
    description: 'Commercial tier definitions, loan/employee quotas, and pricing rules.',
  },
  {
    id: 'sa-revenue',
    label: 'Revenue Analytics',
    path: '/super-admin/revenue-analytics',
    phaseNumber: 10,
    icon: Activity,
    description: 'MRR, ARR, churn analytics, and cohort expansion metrics.',
  },
  {
    id: 'sa-notifications',
    label: 'Platform Notifications',
    path: '/super-admin/platform-notifications',
    phaseNumber: 10,
    icon: Bell,
    description: 'System-wide broadcasts and maintenance advisories to business tenants.',
  },
  {
    id: 'sa-audit-logs',
    label: 'Audit Logs',
    path: '/super-admin/audit-logs',
    phaseNumber: 10,
    icon: FileSearch,
    description: 'Immutable security and financial audit trail across the platform.',
  },
  {
    id: 'sa-settings',
    label: 'Platform Settings',
    path: '/super-admin/platform-settings',
    phaseNumber: 10,
    icon: Settings,
    description: 'Global FloTech Digital configuration, feature flags, and security policies.',
  },
];
