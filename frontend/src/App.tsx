import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import {
  BUSINESS_ENVIRONMENT_NAV_ITEMS,
  SUPER_ADMIN_ENVIRONMENT_NAV_ITEMS,
} from '@/config/navigation';
import { AuthSessionProvider } from '@/hooks/useAuthSession';
import { AppShellLayout } from '@/layouts/AppShellLayout';
import { AuthPortalPage } from '@/pages/AuthPortalPage';
import { BusinessProfilePage } from '@/pages/BusinessProfilePage';
import { BusinessSettingsPage } from '@/pages/BusinessSettingsPage';
import { CustomersPage } from '@/pages/CustomersPage';
import { EmployeesPage } from '@/pages/EmployeesPage';
import { FinancialDashboardAndReportsPage } from '@/pages/FinancialDashboardAndReportsPage';
import { LoanProductsPage } from '@/pages/LoanProductsPage';
import { LoansPage } from '@/pages/LoansPage';
import { NotificationsPage } from '@/pages/NotificationsPage';
import { OverdueLoansPage } from '@/pages/OverdueLoansPage';
import { PersonalProfilePage } from '@/pages/PersonalProfilePage';
import { Phase1ArchitectureHubPage } from '@/pages/Phase1ArchitectureHubPage';
import { RepaymentSchedulesPage } from '@/pages/RepaymentSchedulesPage';
import { RepaymentsPage } from '@/pages/RepaymentsPage';
import { RolesPermissionsPage } from '@/pages/RolesPermissionsPage';
import { SubscriptionPage } from '@/pages/SubscriptionPage';
import { SuperAdminSuitePage } from '@/pages/SuperAdminSuitePage';

export function App() {
  return (
    <AuthSessionProvider>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <Routes>
          {/* Architecture & Design System Inspection Hub */}
          <Route
            path="/"
            element={
              <AppShellLayout
                environment="BUSINESS"
                navigationItems={BUSINESS_ENVIRONMENT_NAV_ITEMS}
              >
                <Phase1ArchitectureHubPage />
              </AppShellLayout>
            }
          />

          {/* Phase 2 Authentication Portal Routes */}
          <Route path="/auth/login" element={<AuthPortalPage initialMode="signin" />} />
          <Route path="/auth/register" element={<AuthPortalPage initialMode="register" />} />

          {/* Phase 9 Live Module: Executive Financial Dashboard */}
          <Route
            path="/app/dashboard"
            element={
              <AppShellLayout
                environment="BUSINESS"
                navigationItems={BUSINESS_ENVIRONMENT_NAV_ITEMS}
              >
                <FinancialDashboardAndReportsPage mode="DASHBOARD" />
              </AppShellLayout>
            }
          />

          {/* Phase 2 Live Module: Personal Profile */}
          <Route
            path="/app/personal-profile"
            element={
              <AppShellLayout
                environment="BUSINESS"
                navigationItems={BUSINESS_ENVIRONMENT_NAV_ITEMS}
              >
                <PersonalProfilePage />
              </AppShellLayout>
            }
          />

          {/* Phase 3 Live Modules: Business Profile & Operational Settings */}
          <Route
            path="/app/business-profile"
            element={
              <AppShellLayout
                environment="BUSINESS"
                navigationItems={BUSINESS_ENVIRONMENT_NAV_ITEMS}
              >
                <BusinessProfilePage />
              </AppShellLayout>
            }
          />

          <Route
            path="/app/settings"
            element={
              <AppShellLayout
                environment="BUSINESS"
                navigationItems={BUSINESS_ENVIRONMENT_NAV_ITEMS}
              >
                <BusinessSettingsPage />
              </AppShellLayout>
            }
          />

          {/* Phase 4 Live Modules: Employees & Roles/Permissions */}
          <Route
            path="/app/employees"
            element={
              <AppShellLayout
                environment="BUSINESS"
                navigationItems={BUSINESS_ENVIRONMENT_NAV_ITEMS}
              >
                <EmployeesPage />
              </AppShellLayout>
            }
          />

          <Route
            path="/app/roles-permissions"
            element={
              <AppShellLayout
                environment="BUSINESS"
                navigationItems={BUSINESS_ENVIRONMENT_NAV_ITEMS}
              >
                <RolesPermissionsPage />
              </AppShellLayout>
            }
          />

          {/* Phase 5 Live Module: Customer & KYC Management */}
          <Route
            path="/app/customers"
            element={
              <AppShellLayout
                environment="BUSINESS"
                navigationItems={BUSINESS_ENVIRONMENT_NAV_ITEMS}
              >
                <CustomersPage />
              </AppShellLayout>
            }
          />

          {/* Phase 6 Live Modules: Loan Products & Loan Management */}
          <Route
            path="/app/loan-products"
            element={
              <AppShellLayout
                environment="BUSINESS"
                navigationItems={BUSINESS_ENVIRONMENT_NAV_ITEMS}
              >
                <LoanProductsPage />
              </AppShellLayout>
            }
          />

          <Route
            path="/app/loans"
            element={
              <AppShellLayout
                environment="BUSINESS"
                navigationItems={BUSINESS_ENVIRONMENT_NAV_ITEMS}
              >
                <LoansPage />
              </AppShellLayout>
            }
          />

          {/* Phase 7 Live Modules: Repayment Schedules & Overdue Loans */}
          <Route
            path="/app/repayment-schedules"
            element={
              <AppShellLayout
                environment="BUSINESS"
                navigationItems={BUSINESS_ENVIRONMENT_NAV_ITEMS}
              >
                <RepaymentSchedulesPage />
              </AppShellLayout>
            }
          />

          <Route
            path="/app/overdue-loans"
            element={
              <AppShellLayout
                environment="BUSINESS"
                navigationItems={BUSINESS_ENVIRONMENT_NAV_ITEMS}
              >
                <OverdueLoansPage />
              </AppShellLayout>
            }
          />

          {/* Phase 8 Live Module: Repayments & Receipts */}
          <Route
            path="/app/repayments"
            element={
              <AppShellLayout
                environment="BUSINESS"
                navigationItems={BUSINESS_ENVIRONMENT_NAV_ITEMS}
              >
                <RepaymentsPage />
              </AppShellLayout>
            }
          />

          {/* Phase 9 Live Modules: Financial Reports & In-App Notifications */}
          <Route
            path="/app/financial-reports"
            element={
              <AppShellLayout
                environment="BUSINESS"
                navigationItems={BUSINESS_ENVIRONMENT_NAV_ITEMS}
              >
                <FinancialDashboardAndReportsPage mode="REPORTS" />
              </AppShellLayout>
            }
          />

          <Route
            path="/app/notifications"
            element={
              <AppShellLayout
                environment="BUSINESS"
                navigationItems={BUSINESS_ENVIRONMENT_NAV_ITEMS}
              >
                <NotificationsPage />
              </AppShellLayout>
            }
          />

          {/* Phase 11 Live Module: Tenant Subscription & Plan Quotas */}
          <Route
            path="/app/subscription"
            element={
              <AppShellLayout
                environment="BUSINESS"
                navigationItems={BUSINESS_ENVIRONMENT_NAV_ITEMS}
              >
                <SubscriptionPage />
              </AppShellLayout>
            }
          />

          {/* Phase 10 Live Environment B: FloTech Digital Super Admin Routes (All 9 Modules) */}
          <Route
            path="/super-admin/dashboard"
            element={
              <AppShellLayout
                environment="SUPER_ADMIN"
                navigationItems={SUPER_ADMIN_ENVIRONMENT_NAV_ITEMS}
              >
                <SuperAdminSuitePage section="DASHBOARD" />
              </AppShellLayout>
            }
          />
          <Route
            path="/super-admin/businesses"
            element={
              <AppShellLayout
                environment="SUPER_ADMIN"
                navigationItems={SUPER_ADMIN_ENVIRONMENT_NAV_ITEMS}
              >
                <SuperAdminSuitePage section="BUSINESSES" />
              </AppShellLayout>
            }
          />
          <Route
            path="/super-admin/users"
            element={
              <AppShellLayout
                environment="SUPER_ADMIN"
                navigationItems={SUPER_ADMIN_ENVIRONMENT_NAV_ITEMS}
              >
                <SuperAdminSuitePage section="USERS" />
              </AppShellLayout>
            }
          />
          <Route
            path="/super-admin/subscriptions"
            element={
              <AppShellLayout
                environment="SUPER_ADMIN"
                navigationItems={SUPER_ADMIN_ENVIRONMENT_NAV_ITEMS}
              >
                <SuperAdminSuitePage section="SUBSCRIPTIONS" />
              </AppShellLayout>
            }
          />
          <Route
            path="/super-admin/plans-pricing"
            element={
              <AppShellLayout
                environment="SUPER_ADMIN"
                navigationItems={SUPER_ADMIN_ENVIRONMENT_NAV_ITEMS}
              >
                <SuperAdminSuitePage section="PLANS" />
              </AppShellLayout>
            }
          />
          <Route
            path="/super-admin/revenue-analytics"
            element={
              <AppShellLayout
                environment="SUPER_ADMIN"
                navigationItems={SUPER_ADMIN_ENVIRONMENT_NAV_ITEMS}
              >
                <SuperAdminSuitePage section="REVENUE" />
              </AppShellLayout>
            }
          />
          <Route
            path="/super-admin/platform-notifications"
            element={
              <AppShellLayout
                environment="SUPER_ADMIN"
                navigationItems={SUPER_ADMIN_ENVIRONMENT_NAV_ITEMS}
              >
                <SuperAdminSuitePage section="NOTIFICATIONS" />
              </AppShellLayout>
            }
          />
          <Route
            path="/super-admin/audit-logs"
            element={
              <AppShellLayout
                environment="SUPER_ADMIN"
                navigationItems={SUPER_ADMIN_ENVIRONMENT_NAV_ITEMS}
              >
                <SuperAdminSuitePage section="AUDIT_LOGS" />
              </AppShellLayout>
            }
          />
          <Route
            path="/super-admin/platform-settings"
            element={
              <AppShellLayout
                environment="SUPER_ADMIN"
                navigationItems={SUPER_ADMIN_ENVIRONMENT_NAV_ITEMS}
              >
                <SuperAdminSuitePage section="SETTINGS" />
              </AppShellLayout>
            }
          />

          {/* Fallback Redirect */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthSessionProvider>
  );
}
