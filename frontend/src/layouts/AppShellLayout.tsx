import React, { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Building2,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  Bell,
  ShieldAlert,
  UserCheck,
  Menu,
  X,
  Compass,
} from 'lucide-react';
import { cn } from '@/config/utils';
import type { NavItemConfig } from '@/config/navigation';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  useSidebarAndTenantShell,
  type TenantSwitcherOption,
} from '@/hooks/useSidebarAndTenantShell';
import { useAuthSession } from '@/hooks/useAuthSession';

const ARCHITECTURAL_PREVIEW_TENANTS: TenantSwitcherOption[] = [
  {
    businessId: 'tenant-preview-1',
    businessCode: 'FLT-BIZ-001',
    businessName: 'Tenant Workspace Context (Phase 3)',
    roleName: 'Business Owner',
    currencyCode: 'USD',
  },
  {
    businessId: 'tenant-preview-2',
    businessCode: 'FLT-BIZ-002',
    businessName: 'Secondary Branch Context (Phase 3)',
    roleName: 'Branch Manager',
    currencyCode: 'EUR',
  },
];

export interface AppShellLayoutProps {
  environment: 'BUSINESS' | 'SUPER_ADMIN';
  navigationItems: NavItemConfig[];
  children: React.ReactNode;
}

export function AppShellLayout({
  environment,
  navigationItems,
  children,
}: AppShellLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    memberships,
    activeBusinessProfile,
    activeTenantMembership,
    selectActiveBusiness,
  } = useAuthSession();
  const {
    isSidebarCollapsed,
    isMobileDrawerOpen,
    selectedBusiness,
    setSelectedBusiness,
    toggleSidebar,
    toggleMobileDrawer,
    closeMobileDrawer,
  } = useSidebarAndTenantShell(ARCHITECTURAL_PREVIEW_TENANTS);

  const [isBusinessMenuOpen, setIsBusinessMenuOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  const isSuperAdminEnv = environment === 'SUPER_ADMIN';

  return (
    <div className="min-h-screen flex bg-flotech-bg text-flotech-navy">
      {/* Mobile Sidebar Backdrop */}
      {isMobileDrawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-xs lg:hidden"
          onClick={closeMobileDrawer}
        />
      )}

      {/* Collapsible Dark Navy Sidebar (#0F172A) */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex flex-col bg-flotech-navy text-white transition-all duration-200 ease-in-out lg:static lg:translate-x-0',
          isSidebarCollapsed ? 'w-20' : 'w-72',
          isMobileDrawerOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Brand Header */}
        <div className="flex h-16 items-center justify-between border-b border-slate-800 px-4">
          <div className="flex items-center gap-3 overflow-hidden">
            <div
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-bold text-white shadow-xs',
                isSuperAdminEnv ? 'bg-flotech-teal' : 'bg-flotech-primary'
              )}
            >
              FT
            </div>
            {!isSidebarCollapsed && (
              <div className="flex flex-col truncate">
                <span className="text-sm font-bold tracking-tight text-white">
                  FloTech Digital
                </span>
                <span className="text-[11px] font-medium text-slate-400">
                  {isSuperAdminEnv ? 'Super Admin Governance' : 'Loan Management SaaS'}
                </span>
              </div>
            )}
          </div>

          <button
            type="button"
            id="btn-collapse-sidebar"
            onClick={toggleSidebar}
            className="hidden rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white lg:inline-flex"
            title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isSidebarCollapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>

          <button
            type="button"
            id="btn-close-mobile-drawer"
            onClick={closeMobileDrawer}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Architectural Blueprint Link */}
        <div className="px-3 pt-3 pb-1 border-b border-slate-800/80">
          <NavLink
            to="/"
            onClick={closeMobileDrawer}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-semibold transition-colors',
                isActive
                  ? 'bg-flotech-primary text-white'
                  : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
              )
            }
          >
            <Compass className="h-4 w-4 shrink-0 text-blue-400" />
            {!isSidebarCollapsed && <span>Phase 1 Architecture Hub</span>}
          </NavLink>
        </div>

        {/* Navigation List */}
        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
          {navigationItems.map((item) => {
            const IconComponent = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <NavLink
                key={item.id}
                id={`nav-${item.id}`}
                to={item.path}
                onClick={closeMobileDrawer}
                className={cn(
                  'group flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? isSuperAdminEnv
                      ? 'bg-flotech-teal text-white'
                      : 'bg-flotech-primary text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                )}
                title={isSidebarCollapsed ? item.label : undefined}
              >
                <div className="flex items-center gap-3 truncate">
                  <IconComponent className="h-4 w-4 shrink-0" />
                  {!isSidebarCollapsed && <span className="truncate">{item.label}</span>}
                </div>
                {!isSidebarCollapsed && (
                  <span
                    className={cn(
                      'ml-2 rounded px-1.5 py-0.5 text-[10px] font-mono',
                      isActive
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-800 text-slate-400 group-hover:bg-slate-700'
                    )}
                  >
                    P{item.phaseNumber}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Environment Switcher Footer (Phase 1 Structural Inspection) */}
        <div className="border-t border-slate-800 p-3">
          {!isSidebarCollapsed ? (
            <div className="rounded-lg bg-slate-900/90 p-3 border border-slate-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Environment Shell
                </span>
                <Badge variant={isSuperAdminEnv ? 'teal' : 'primary'}>
                  {isSuperAdminEnv ? 'Env B' : 'Env A'}
                </Badge>
              </div>
              <Button
                id="btn-switch-environment-shell"
                variant={isSuperAdminEnv ? 'primary' : 'teal'}
                size="sm"
                className="w-full text-xs"
                onClick={() =>
                  navigate(isSuperAdminEnv ? '/app/dashboard' : '/super-admin/dashboard')
                }
              >
                {isSuperAdminEnv
                  ? 'Inspect Business Env (A)'
                  : 'Inspect Super Admin Env (B)'}
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() =>
                navigate(isSuperAdminEnv ? '/app/dashboard' : '/super-admin/dashboard')
              }
              className="flex w-full items-center justify-center rounded-lg bg-slate-800 p-2 text-xs font-bold text-white hover:bg-slate-700"
              title="Switch Environment Shell"
            >
              {isSuperAdminEnv ? 'A' : 'B'}
            </button>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Modern Top Navigation Bar */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur-xs sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              id="btn-open-mobile-drawer"
              onClick={toggleMobileDrawer}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>

            {/* Business Switcher (Environment A) or Super Admin Banner (Environment B) */}
            {!isSuperAdminEnv && selectedBusiness ? (
              <div className="relative">
                <button
                  type="button"
                  id="btn-business-switcher"
                  onClick={() => {
                    setIsBusinessMenuOpen((prev) => !prev);
                    setIsNotificationsOpen(false);
                    setIsUserMenuOpen(false);
                  }}
                  className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-1.5 text-left text-xs transition-colors hover:bg-slate-100"
                >
                  <Building2 className="h-4 w-4 text-flotech-primary shrink-0" />
                  <div className="hidden sm:block">
                    <div className="font-semibold text-flotech-navy">
                      {activeBusinessProfile?.legalName ?? selectedBusiness.businessName}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {activeBusinessProfile?.businessCode ?? selectedBusiness.businessCode} •{' '}
                      {activeTenantMembership?.roleName ?? selectedBusiness.roleName} (
                      {activeBusinessProfile?.currencyCode ?? selectedBusiness.currencyCode})
                    </div>
                  </div>
                  <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
                </button>

                {isBusinessMenuOpen && (
                  <div className="absolute left-0 mt-2 w-80 rounded-xl border border-slate-200 bg-white p-2 shadow-elevated z-50">
                    <div className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Multi-Tenant Business Switcher (Phase 3 Live)
                    </div>
                    {(memberships.length > 0
                      ? memberships.map((m) => ({
                          businessId: m.businessId,
                          businessCode: m.businessCode,
                          businessName: m.businessName,
                          roleName: m.roleName,
                          currencyCode: m.currencyCode,
                        }))
                      : ARCHITECTURAL_PREVIEW_TENANTS
                    ).map((tenant) => {
                      const isCurrent =
                        (activeBusinessProfile?.id ?? selectedBusiness.businessId) ===
                        tenant.businessId;
                      return (
                        <button
                          key={tenant.businessId}
                          type="button"
                          onClick={() => {
                            if (memberships.length > 0) {
                              void selectActiveBusiness(tenant.businessId);
                            } else {
                              setSelectedBusiness(tenant);
                            }
                            setIsBusinessMenuOpen(false);
                          }}
                          className={cn(
                            'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs transition-colors',
                            isCurrent
                              ? 'bg-blue-50 text-flotech-primary font-semibold'
                              : 'text-slate-700 hover:bg-slate-50'
                          )}
                        >
                          <div>
                            <div>{tenant.businessName}</div>
                            <div className="text-[11px] text-slate-500">
                              {tenant.businessCode} • Role: {tenant.roleName}
                            </div>
                          </div>
                          <Badge variant="neutral">{tenant.currencyCode}</Badge>
                        </button>
                      );
                    })}
                    <div className="mt-2 border-t border-slate-100 pt-2 px-1">
                      <button
                        type="button"
                        onClick={() => {
                          setIsBusinessMenuOpen(false);
                          navigate('/app/business-profile');
                        }}
                        className="w-full rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-flotech-primary hover:bg-blue-50"
                      >
                        + Manage or Onboard Business Tenant
                      </button>
                    </div>
                    <div className="mt-1 border-t border-slate-100 px-2.5 pt-2 text-[11px] text-slate-500">
                      Security Rule #6: Active <code className="font-mono">X-Business-Id</code> is
                      re-verified against PostgreSQL <code className="font-mono">business_memberships</code> on every API call.
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-flotech-teal" />
                <span className="text-xs font-semibold text-flotech-navy">
                  FloTech Digital Super Admin Environment
                </span>
                <Badge variant="teal">PostgreSQL Guard Enforced</Badge>
              </div>
            )}
          </div>

          {/* Right Top Bar Controls: Phase Status, Notification Panel, User Profile Menu */}
          <div className="flex items-center gap-2.5">
            <Badge variant="primary" className="hidden md:inline-flex">
              Phases 8–10 Repayments, Analytics &amp; Super Admin Active
            </Badge>

            {/* Notification Panel Trigger */}
            <div className="relative">
              <button
                type="button"
                id="btn-notification-panel"
                onClick={() => {
                  setIsNotificationsOpen((prev) => !prev);
                  setIsBusinessMenuOpen(false);
                  setIsUserMenuOpen(false);
                }}
                className="relative rounded-lg border border-slate-200 p-2 text-slate-600 transition-colors hover:bg-slate-100 hover:text-flotech-navy"
                aria-label="Open notifications panel"
              >
                <Bell className="h-4 w-4" />
                <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-flotech-primary" />
              </button>

              {isNotificationsOpen && (
                <div className="absolute right-0 mt-2 w-80 rounded-xl border border-slate-200 bg-white p-4 shadow-elevated z-50">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                    <span className="text-xs font-semibold text-flotech-navy">
                      Notifications Panel
                    </span>
                    <Badge variant="neutral">Phase 9</Badge>
                  </div>
                  <div className="py-4 text-xs text-slate-600 space-y-2">
                    <p>
                      Real-time loan approval, upcoming installment, and delinquency alerts are
                      persisted in the PostgreSQL <code className="font-mono">notifications</code> table.
                    </p>
                    <p className="text-[11px] text-slate-400">
                      No fake financial notifications are displayed.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* User Profile Menu Trigger */}
            <div className="relative">
              <button
                type="button"
                id="btn-user-profile-menu"
                onClick={() => {
                  setIsUserMenuOpen((prev) => !prev);
                  setIsNotificationsOpen(false);
                  setIsBusinessMenuOpen(false);
                }}
                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-flotech-navy hover:bg-slate-50"
              >
                <UserCheck className="h-4 w-4 text-flotech-primary" />
                <span className="hidden sm:inline">Identity Context</span>
                <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              </button>

              {isUserMenuOpen && (
                <div className="absolute right-0 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-elevated z-50">
                  <div className="border-b border-slate-100 pb-2 mb-2">
                    <div className="text-xs font-semibold text-flotech-navy">
                      Firebase Auth + PostgreSQL Profile
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Phase 2 Live Identity & Profile Module
                    </div>
                  </div>
                  <div className="space-y-1 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        navigate('/app/personal-profile');
                      }}
                      className="w-full rounded-lg px-2.5 py-1.5 text-left font-medium text-flotech-primary hover:bg-blue-50"
                    >
                      Personal Profile (Live — Phase 2)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        navigate('/auth/login');
                      }}
                      className="w-full rounded-lg px-2.5 py-1.5 text-left text-slate-700 hover:bg-slate-100"
                    >
                      Authentication Portal (Sign In / Register)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        navigate('/');
                      }}
                      className="w-full rounded-lg px-2.5 py-1.5 text-left text-slate-700 hover:bg-slate-100"
                    >
                      Return to Architecture Hub
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
