import React, { useCallback, useEffect, useState } from 'react';
import {
  BusinessStatus,
  PlatformRole,
  SubscriptionStatus,
  type AuditLogEntryDTO,
  type PlatformSettingItemDTO,
  type SubscriptionPlanCatalogDTO,
  type SuperAdminBusinessSummaryDTO,
  type SuperAdminGlobalKpisDTO,
  type SuperAdminRevenueAnalyticsDTO,
  type SuperAdminSubscriptionRecordDTO,
  type SuperAdminUserDirectoryItemDTO,
} from '@flotech/shared';
import {
  CheckCircle2,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/Card';
import { InputField, SelectField } from '@/components/ui/FormElements';
import {
  DataTableContainer,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
  DataTableCell,
} from '@/components/ui/DataTable';
import { getActiveAppCheckToken } from '@/config/firebaseClient';
import { formatDecimalMoneyDisplay } from '@/config/utils';
import { useAuthSession } from '@/hooks/useAuthSession';
import {
  assignSuperAdminSubscriptionApi,
  broadcastSuperAdminNotificationApi,
  fetchSuperAdminAuditLogsApi,
  fetchSuperAdminBusinessesApi,
  fetchSuperAdminDashboardApi,
  fetchSuperAdminPlansApi,
  fetchSuperAdminPlatformSettingsApi,
  fetchSuperAdminRevenueAnalyticsApi,
  fetchSuperAdminSubscriptionsApi,
  fetchSuperAdminUsersApi,
  updateSuperAdminBusinessStatusApi,
  updateSuperAdminPlatformSettingApi,
  updateSuperAdminUserStatusApi,
  upsertSuperAdminPlanApi,
} from '@/services/apiClient';

export type SuperAdminSection =
  | 'DASHBOARD'
  | 'BUSINESSES'
  | 'USERS'
  | 'SUBSCRIPTIONS'
  | 'PLANS'
  | 'REVENUE'
  | 'NOTIFICATIONS'
  | 'AUDIT_LOGS'
  | 'SETTINGS';

export interface SuperAdminSuitePageProps {
  section: SuperAdminSection;
}

export function SuperAdminSuitePage({
  section,
}: SuperAdminSuitePageProps): React.ReactElement {
  const { firebaseUser, profile } = useAuthSession();

  const [kpis, setKpis] = useState<SuperAdminGlobalKpisDTO | null>(null);
  const [businesses, setBusinesses] = useState<SuperAdminBusinessSummaryDTO[]>([]);
  const [users, setUsers] = useState<SuperAdminUserDirectoryItemDTO[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlanCatalogDTO[]>([]);
  const [subscriptions, setSubscriptions] = useState<SuperAdminSubscriptionRecordDTO[]>([]);
  const [revenue, setRevenue] = useState<SuperAdminRevenueAnalyticsDTO | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntryDTO[]>([]);
  const [platformSettings, setPlatformSettings] = useState<PlatformSettingItemDTO[]>([]);

  // Form states
  const [planCode, setPlanCode] = useState<string>('ENTERPRISE_PLUS');
  const [planName, setPlanName] = useState<string>('Enterprise Plus');
  const [planMonthlyPrice, setPlanMonthlyPrice] = useState<string>('399.00');
  const [planAnnualPrice, setPlanAnnualPrice] = useState<string>('3990.00');
  const [planMaxLoans, setPlanMaxLoans] = useState<string>('5000');
  const [planMaxEmployees, setPlanMaxEmployees] = useState<string>('150');
  const [planMaxCustomers, setPlanMaxCustomers] = useState<string>('25000');

  // Broadcast notification state
  const [broadcastCategory, setBroadcastCategory] = useState<string>('PLATFORM_ANNOUNCEMENT');
  const [broadcastTitle, setBroadcastTitle] = useState<string>('');
  const [broadcastBody, setBroadcastBody] = useState<string>('');

  // Platform settings editor state
  const [settingKey, setSettingKey] = useState<string>('platform.governance');
  const [settingJsonStr, setSettingJsonStr] = useState<string>(
    '{\n  "platformName": "FloTech Digital Loan Management SaaS",\n  "maintenanceMode": false\n}'
  );

  // Subscription assignment state
  const [selectedBizForSub, setSelectedBizForSub] = useState<string>('');
  const [selectedPlanForSub, setSelectedPlanForSub] = useState<string>('');
  const [selectedSubStatus, setSelectedSubStatus] = useState<SubscriptionStatus>(
    SubscriptionStatus.ACTIVE
  );
  const [selectedBillingCycle, setSelectedBillingCycle] = useState<'MONTHLY' | 'ANNUAL'>(
    'MONTHLY'
  );

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  const isSuperAdmin = profile?.platformRole === PlatformRole.SUPER_ADMIN;

  const loadSectionData = useCallback(async () => {
    if (!firebaseUser) return;
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const idToken = await firebaseUser.getIdToken();
      const appCheckToken = await getActiveAppCheckToken();

      if (section === 'DASHBOARD') {
        const res = await fetchSuperAdminDashboardApi(idToken, appCheckToken);
        if (!res.success) {
          setErrorMessage(`${res.error.code}: ${res.error.message}`);
          return;
        }
        setKpis(res.data);
      } else if (section === 'BUSINESSES') {
        const res = await fetchSuperAdminBusinessesApi(idToken, appCheckToken);
        if (!res.success) {
          setErrorMessage(`${res.error.code}: ${res.error.message}`);
          return;
        }
        setBusinesses(res.data);
      } else if (section === 'USERS') {
        const res = await fetchSuperAdminUsersApi(idToken, appCheckToken);
        if (!res.success) {
          setErrorMessage(`${res.error.code}: ${res.error.message}`);
          return;
        }
        setUsers(res.data);
      } else if (section === 'PLANS') {
        const res = await fetchSuperAdminPlansApi(idToken, appCheckToken);
        if (!res.success) {
          setErrorMessage(`${res.error.code}: ${res.error.message}`);
          return;
        }
        setPlans(res.data);
      } else if (section === 'SUBSCRIPTIONS') {
        const [subsRes, plansRes, bizRes] = await Promise.all([
          fetchSuperAdminSubscriptionsApi(idToken, appCheckToken),
          fetchSuperAdminPlansApi(idToken, appCheckToken),
          fetchSuperAdminBusinessesApi(idToken, appCheckToken),
        ]);
        if (subsRes.success) setSubscriptions(subsRes.data);
        if (plansRes.success) {
          setPlans(plansRes.data);
          if (!selectedPlanForSub && plansRes.data[0]) {
            setSelectedPlanForSub(plansRes.data[0].id);
          }
        }
        if (bizRes.success) {
          setBusinesses(bizRes.data);
          if (!selectedBizForSub && bizRes.data[0]) {
            setSelectedBizForSub(bizRes.data[0].id);
          }
        }
      } else if (section === 'REVENUE') {
        const res = await fetchSuperAdminRevenueAnalyticsApi(idToken, appCheckToken);
        if (!res.success) {
          setErrorMessage(`${res.error.code}: ${res.error.message}`);
          return;
        }
        setRevenue(res.data);
      } else if (section === 'AUDIT_LOGS') {
        const res = await fetchSuperAdminAuditLogsApi(idToken, appCheckToken);
        if (!res.success) {
          setErrorMessage(`${res.error.code}: ${res.error.message}`);
          return;
        }
        setAuditLogs(res.data);
      } else if (section === 'SETTINGS') {
        const res = await fetchSuperAdminPlatformSettingsApi(idToken, appCheckToken);
        if (!res.success) {
          setErrorMessage(`${res.error.code}: ${res.error.message}`);
          return;
        }
        setPlatformSettings(res.data);
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to load Super Admin data.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [firebaseUser, section, selectedPlanForSub, selectedBizForSub]);

  useEffect(() => {
    void loadSectionData();
  }, [loadSectionData]);

  const handleToggleBusinessStatus = async (
    businessId: string,
    targetStatus: BusinessStatus
  ) => {
    if (!firebaseUser) return;
    setErrorMessage(null);
    setStatusBanner(null);

    try {
      const idToken = await firebaseUser.getIdToken();
      const appCheckToken = await getActiveAppCheckToken();

      const res = await updateSuperAdminBusinessStatusApi(
        idToken,
        appCheckToken,
        businessId,
        {
          status: targetStatus,
          reason: `Super Admin governance status updated to ${targetStatus}.`,
        }
      );

      if (!res.success) {
        setErrorMessage(`${res.error.code}: ${res.error.message}`);
        return;
      }

      setStatusBanner(
        `Business ${res.data.legalName} (${res.data.businessCode}) status updated to ${res.data.status}.`
      );
      await loadSectionData();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to update business status.'
      );
    }
  };

  const handleToggleUserStatus = async (userId: string, nextActive: boolean) => {
    if (!firebaseUser) return;
    setErrorMessage(null);
    setStatusBanner(null);

    try {
      const idToken = await firebaseUser.getIdToken();
      const appCheckToken = await getActiveAppCheckToken();

      const res = await updateSuperAdminUserStatusApi(idToken, appCheckToken, userId, {
        isActive: nextActive,
        reason: `Super Admin set account active status to ${String(nextActive)}.`,
      });

      if (!res.success) {
        setErrorMessage(`${res.error.code}: ${res.error.message}`);
        return;
      }

      setStatusBanner(`User ${res.data.email} active state updated to ${String(res.data.isActive)}.`);
      await loadSectionData();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to update user status.'
      );
    }
  };

  const handleUpsertPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser) return;
    setErrorMessage(null);
    setStatusBanner(null);

    try {
      const idToken = await firebaseUser.getIdToken();
      const appCheckToken = await getActiveAppCheckToken();

      const res = await upsertSuperAdminPlanApi(idToken, appCheckToken, {
        code: planCode.trim().toUpperCase(),
        name: planName.trim(),
        monthlyPrice: planMonthlyPrice.trim(),
        annualPrice: planAnnualPrice.trim(),
        maxActiveLoans: Number(planMaxLoans),
        maxEmployees: Number(planMaxEmployees),
        maxCustomers: Number(planMaxCustomers),
        isPublic: true,
      });

      if (!res.success) {
        setErrorMessage(`${res.error.code}: ${res.error.message}`);
        return;
      }

      setStatusBanner(`Subscription plan ${res.data.code} (${res.data.name}) saved.`);
      await loadSectionData();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save plan.');
    }
  };

  const handleAssignSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !selectedBizForSub || !selectedPlanForSub) return;
    setErrorMessage(null);
    setStatusBanner(null);

    try {
      const idToken = await firebaseUser.getIdToken();
      const appCheckToken = await getActiveAppCheckToken();

      const res = await assignSuperAdminSubscriptionApi(
        idToken,
        appCheckToken,
        selectedBizForSub,
        {
          planId: selectedPlanForSub,
          status: selectedSubStatus,
          billingCycle: selectedBillingCycle,
          reason: 'Super Admin commercial subscription assignment.',
        }
      );

      if (!res.success) {
        setErrorMessage(`${res.error.code}: ${res.error.message}`);
        return;
      }

      setStatusBanner(
        `Assigned plan ${res.data.planCode} (${res.data.status}) to ${res.data.businessLegalName}.`
      );
      await loadSectionData();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to assign subscription.'
      );
    }
  };

  const handleBroadcastNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser) return;
    setErrorMessage(null);
    setStatusBanner(null);

    try {
      const idToken = await firebaseUser.getIdToken();
      const appCheckToken = await getActiveAppCheckToken();

      const res = await broadcastSuperAdminNotificationApi(idToken, appCheckToken, {
        category: broadcastCategory.trim(),
        title: broadcastTitle.trim(),
        body: broadcastBody.trim(),
      });

      if (!res.success) {
        setErrorMessage(`${res.error.code}: ${res.error.message}`);
        return;
      }

      setStatusBanner(
        `Platform broadcast delivered to ${res.data.deliveredCount} active user(s).`
      );
      setBroadcastTitle('');
      setBroadcastBody('');
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to broadcast notification.'
      );
    }
  };

  const handleSavePlatformSetting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser) return;
    setErrorMessage(null);
    setStatusBanner(null);

    try {
      const parsedJson = JSON.parse(settingJsonStr) as Record<string, unknown>;
      const idToken = await firebaseUser.getIdToken();
      const appCheckToken = await getActiveAppCheckToken();

      const res = await updateSuperAdminPlatformSettingApi(idToken, appCheckToken, {
        key: settingKey.trim(),
        valueJson: parsedJson,
      });

      if (!res.success) {
        setErrorMessage(`${res.error.code}: ${res.error.message}`);
        return;
      }

      setStatusBanner(`Platform setting "${res.data.key}" updated.`);
      await loadSectionData();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Invalid JSON or failed to save setting.'
      );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="teal">PHASE 10 — FLOTECH SUPER ADMIN</Badge>
            <Badge variant={isSuperAdmin ? 'success' : 'warning'}>
              {isSuperAdmin
                ? 'PostgreSQL SUPER_ADMIN Verified'
                : 'Standard User (Protected by Backend Guard)'}
            </Badge>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-flotech-navy">
            FloTech Digital Super Admin — {section.replace('_', ' ')}
          </h1>
          <p className="text-sm text-slate-600">
            Global platform governance, tenant lifecycle control, subscription &amp; revenue analytics, and immutable audit trail inspection.
          </p>
        </div>

        <Button
          variant="outline"
          onClick={() => void loadSectionData()}
          disabled={isLoading}
        >
          <RefreshCw className="mr-1.5 h-4 w-4" />
          Refresh Platform Data
        </Button>
      </div>

      {errorMessage && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {statusBanner && (
        <div className="rounded-lg border border-teal-200 bg-teal-50/70 px-4 py-3 text-sm text-slate-800 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-flotech-teal shrink-0" />
          <span>{statusBanner}</span>
        </div>
      )}

      {section === 'DASHBOARD' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Total Tenant Businesses
              </div>
              <div className="mt-1 text-2xl font-bold text-flotech-navy">
                {kpis?.totalBusinesses ?? 0}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {kpis?.activeBusinesses ?? 0} Active &bull;{' '}
                {kpis?.pendingVerificationBusinesses ?? 0} Pending &bull;{' '}
                {kpis?.suspendedBusinesses ?? 0} Suspended
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Platform Users &amp; Subscriptions
              </div>
              <div className="mt-1 text-2xl font-bold text-flotech-primary">
                {kpis?.totalPlatformUsers ?? 0} Users
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {kpis?.activeSubscriptionsCount ?? 0} Paid &bull;{' '}
                {kpis?.trialSubscriptionsCount ?? 0} Trialing
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="text-xs font-medium uppercase tracking-wider text-slate-500">
                SaaS MRR / ARR (USD)
              </div>
              <div className="mt-1 font-mono text-2xl font-bold text-emerald-600">
                {formatDecimalMoneyDisplay(
                  kpis?.monthlyRecurringRevenueUsd ?? '0.0000',
                  'USD'
                )}
              </div>
              <div className="mt-1 font-mono text-xs text-slate-500">
                ARR:{' '}
                {formatDecimalMoneyDisplay(
                  kpis?.annualizedRunRateUsd ?? '0.0000',
                  'USD'
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Global Loan Volume
              </div>
              <div className="mt-1 font-mono text-2xl font-bold text-flotech-teal">
                {formatDecimalMoneyDisplay(
                  kpis?.globalDisbursedPrincipalVolume ?? '0.0000',
                  'USD'
                )}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {kpis?.globalActiveLoansCount ?? 0} active loans across tenants
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {section === 'BUSINESSES' && (
        <Card>
          <CardHeader>
            <CardTitle>Global Tenant Businesses Directory</CardTitle>
            <CardDescription>
              Verify, activate, or suspend tenant businesses on the FloTech Digital platform.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <DataTableContainer>
              <DataTableHead>
                <tr>
                  <DataTableHeaderCell>Business &amp; Code</DataTableHeaderCell>
                  <DataTableHeaderCell>Owner</DataTableHeaderCell>
                  <DataTableHeaderCell>Status &amp; Plan</DataTableHeaderCell>
                  <DataTableHeaderCell className="text-right">Usage Metrics</DataTableHeaderCell>
                  <DataTableHeaderCell className="text-right">Governance Actions</DataTableHeaderCell>
                </tr>
              </DataTableHead>
              <tbody>
                {businesses.length === 0 ? (
                  <DataTableRow>
                    <DataTableCell colSpan={5} className="py-8 text-center text-sm text-slate-500">
                      No businesses found.
                    </DataTableCell>
                  </DataTableRow>
                ) : (
                  businesses.map((b) => (
                    <DataTableRow key={b.id}>
                      <DataTableCell>
                        <div className="font-semibold text-flotech-navy">{b.legalName}</div>
                        <div className="font-mono text-xs text-slate-500">
                          {b.businessCode} &bull; {b.countryCode} ({b.currencyCode})
                        </div>
                      </DataTableCell>
                      <DataTableCell>
                        <div className="text-xs font-medium text-slate-800">
                          {b.ownerFullName}
                        </div>
                        <div className="text-xs text-slate-500">{b.ownerEmail}</div>
                      </DataTableCell>
                      <DataTableCell>
                        <div className="flex items-center gap-1.5">
                          <Badge
                            variant={
                              b.status === BusinessStatus.ACTIVE
                                ? 'success'
                                : b.status === BusinessStatus.SUSPENDED
                                  ? 'danger'
                                  : 'warning'
                            }
                          >
                            {b.status}
                          </Badge>
                          {b.subscriptionPlanCode && (
                            <Badge variant="teal">{b.subscriptionPlanCode}</Badge>
                          )}
                        </div>
                      </DataTableCell>
                      <DataTableCell className="text-right font-mono text-xs">
                        {b.memberCount} Staff | {b.customerCount} Cust | {b.activeLoanCount}{' '}
                        Loans
                      </DataTableCell>
                      <DataTableCell className="text-right">
                        <div className="flex justify-end gap-1.5">
                          {b.status !== BusinessStatus.ACTIVE && (
                            <Button
                              size="sm"
                              variant="primary"
                              onClick={() =>
                                void handleToggleBusinessStatus(
                                  b.id,
                                  BusinessStatus.ACTIVE
                                )
                              }
                            >
                              <ShieldCheck className="mr-1 h-3.5 w-3.5" />
                              Verify / Activate
                            </Button>
                          )}
                          {b.status !== BusinessStatus.SUSPENDED && (
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() =>
                                void handleToggleBusinessStatus(
                                  b.id,
                                  BusinessStatus.SUSPENDED
                                )
                              }
                            >
                              Suspend
                            </Button>
                          )}
                        </div>
                      </DataTableCell>
                    </DataTableRow>
                  ))
                )}
              </tbody>
            </DataTableContainer>
          </CardContent>
        </Card>
      )}

      {section === 'USERS' && (
        <Card>
          <CardHeader>
            <CardTitle>Global Platform User Directory</CardTitle>
            <CardDescription>
              Inspect user identities, platform roles, and active status across all tenants.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <DataTableContainer>
              <DataTableHead>
                <tr>
                  <DataTableHeaderCell>User</DataTableHeaderCell>
                  <DataTableHeaderCell>Platform Role</DataTableHeaderCell>
                  <DataTableHeaderCell>Status</DataTableHeaderCell>
                  <DataTableHeaderCell className="text-right">Memberships</DataTableHeaderCell>
                  <DataTableHeaderCell className="text-right">Action</DataTableHeaderCell>
                </tr>
              </DataTableHead>
              <tbody>
                {users.map((u) => (
                  <DataTableRow key={u.id}>
                    <DataTableCell>
                      <div className="font-medium text-flotech-navy">{u.fullName}</div>
                      <div className="text-xs text-slate-500">{u.email}</div>
                    </DataTableCell>
                    <DataTableCell>
                      <Badge
                        variant={
                          u.platformRole === PlatformRole.SUPER_ADMIN
                            ? 'teal'
                            : 'neutral'
                        }
                      >
                        {u.platformRole}
                      </Badge>
                    </DataTableCell>
                    <DataTableCell>
                      <Badge variant={u.isActive ? 'success' : 'danger'}>
                        {u.isActive ? 'ACTIVE' : 'DEACTIVATED'}
                      </Badge>
                    </DataTableCell>
                    <DataTableCell className="text-right font-mono text-xs">
                      {u.businessMembershipsCount}
                    </DataTableCell>
                    <DataTableCell className="text-right">
                      <Button
                        size="sm"
                        variant={u.isActive ? 'danger' : 'primary'}
                        onClick={() => void handleToggleUserStatus(u.id, !u.isActive)}
                      >
                        {u.isActive ? 'Deactivate' : 'Activate'}
                      </Button>
                    </DataTableCell>
                  </DataTableRow>
                ))}
              </tbody>
            </DataTableContainer>
          </CardContent>
        </Card>
      )}

      {section === 'PLANS' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Create or Update Subscription Plan Tier</CardTitle>
              <CardDescription>
                Configure SaaS pricing (PostgreSQL NUMERIC(19,4)) and tenant resource quotas.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={(e) => void handleUpsertPlan(e)} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                  <InputField
                    label="Plan Code"
                    value={planCode}
                    onChange={(e) => setPlanCode(e.target.value)}
                    required
                  />
                  <InputField
                    label="Plan Name"
                    value={planName}
                    onChange={(e) => setPlanName(e.target.value)}
                    required
                  />
                  <InputField
                    label="Monthly Price (USD)"
                    value={planMonthlyPrice}
                    onChange={(e) => setPlanMonthlyPrice(e.target.value)}
                    required
                  />
                  <InputField
                    label="Annual Price (USD)"
                    value={planAnnualPrice}
                    onChange={(e) => setPlanAnnualPrice(e.target.value)}
                    required
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <InputField
                    label="Max Active Loans"
                    type="number"
                    value={planMaxLoans}
                    onChange={(e) => setPlanMaxLoans(e.target.value)}
                    required
                  />
                  <InputField
                    label="Max Employees"
                    type="number"
                    value={planMaxEmployees}
                    onChange={(e) => setPlanMaxEmployees(e.target.value)}
                    required
                  />
                  <InputField
                    label="Max Customers"
                    type="number"
                    value={planMaxCustomers}
                    onChange={(e) => setPlanMaxCustomers(e.target.value)}
                    required
                  />
                </div>
                <div className="flex justify-end">
                  <Button type="submit" variant="primary">
                    Save Subscription Plan
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>SaaS Subscription Plan Catalog</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <DataTableContainer>
                <DataTableHead>
                  <tr>
                    <DataTableHeaderCell>Code &amp; Name</DataTableHeaderCell>
                    <DataTableHeaderCell className="text-right">Monthly / Annual</DataTableHeaderCell>
                    <DataTableHeaderCell className="text-right">Quotas (Loans / Staff / Cust)</DataTableHeaderCell>
                    <DataTableHeaderCell className="text-right">Subscribers</DataTableHeaderCell>
                  </tr>
                </DataTableHead>
                <tbody>
                  {plans.map((p) => (
                    <DataTableRow key={p.id}>
                      <DataTableCell>
                        <div className="font-mono text-xs font-bold text-flotech-navy">
                          {p.code}
                        </div>
                        <div className="text-xs text-slate-600">{p.name}</div>
                      </DataTableCell>
                      <DataTableCell className="text-right font-mono text-xs">
                        {formatDecimalMoneyDisplay(p.monthlyPrice, p.currencyCode)} /{' '}
                        {formatDecimalMoneyDisplay(p.annualPrice, p.currencyCode)}
                      </DataTableCell>
                      <DataTableCell className="text-right font-mono text-xs">
                        {p.maxActiveLoans} / {p.maxEmployees} / {p.maxCustomers}
                      </DataTableCell>
                      <DataTableCell className="text-right font-mono text-xs font-semibold text-flotech-teal">
                        {p.activeSubscriberCount}
                      </DataTableCell>
                    </DataTableRow>
                  ))}
                </tbody>
              </DataTableContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {section === 'SUBSCRIPTIONS' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Assign or Upgrade Tenant Subscription</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={(e) => void handleAssignSubscription(e)}
                className="grid grid-cols-1 gap-4 sm:grid-cols-5 items-end"
              >
                <SelectField
                  label="Target Business"
                  value={selectedBizForSub}
                  onChange={(e) => setSelectedBizForSub(e.target.value)}
                >
                  {businesses.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.legalName} ({b.businessCode})
                    </option>
                  ))}
                </SelectField>
                <SelectField
                  label="Subscription Plan"
                  value={selectedPlanForSub}
                  onChange={(e) => setSelectedPlanForSub(e.target.value)}
                >
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.code})
                    </option>
                  ))}
                </SelectField>
                <SelectField
                  label="Status"
                  value={selectedSubStatus}
                  onChange={(e) =>
                    setSelectedSubStatus(e.target.value as SubscriptionStatus)
                  }
                >
                  <option value={SubscriptionStatus.ACTIVE}>ACTIVE</option>
                  <option value={SubscriptionStatus.TRIALING}>TRIALING</option>
                  <option value={SubscriptionStatus.PAST_DUE}>PAST_DUE</option>
                  <option value={SubscriptionStatus.CANCELED}>CANCELED</option>
                </SelectField>
                <SelectField
                  label="Billing Cycle"
                  value={selectedBillingCycle}
                  onChange={(e) =>
                    setSelectedBillingCycle(e.target.value as 'MONTHLY' | 'ANNUAL')
                  }
                >
                  <option value="MONTHLY">MONTHLY</option>
                  <option value="ANNUAL">ANNUAL</option>
                </SelectField>
                <Button type="submit" variant="primary">
                  Assign Subscription
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tenant Subscriptions Ledger</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <DataTableContainer>
                <DataTableHead>
                  <tr>
                    <DataTableHeaderCell>Business</DataTableHeaderCell>
                    <DataTableHeaderCell>Plan</DataTableHeaderCell>
                    <DataTableHeaderCell>Status &amp; Cycle</DataTableHeaderCell>
                    <DataTableHeaderCell className="text-right">Unit Price</DataTableHeaderCell>
                    <DataTableHeaderCell className="text-right">Period End</DataTableHeaderCell>
                  </tr>
                </DataTableHead>
                <tbody>
                  {subscriptions.map((s) => (
                    <DataTableRow key={s.id}>
                      <DataTableCell>
                        <div className="font-medium text-flotech-navy">
                          {s.businessLegalName}
                        </div>
                        <div className="font-mono text-xs text-slate-500">
                          {s.businessCode}
                        </div>
                      </DataTableCell>
                      <DataTableCell>
                        <Badge variant="teal">{s.planCode}</Badge>
                      </DataTableCell>
                      <DataTableCell>
                        <Badge
                          variant={
                            s.status === SubscriptionStatus.ACTIVE
                              ? 'success'
                              : 'warning'
                          }
                        >
                          {s.status} ({s.billingCycle})
                        </Badge>
                      </DataTableCell>
                      <DataTableCell className="text-right font-mono text-xs font-semibold">
                        {formatDecimalMoneyDisplay(s.unitPrice, s.currencyCode)}
                      </DataTableCell>
                      <DataTableCell className="text-right font-mono text-xs text-slate-500">
                        {s.currentPeriodEnd.slice(0, 10)}
                      </DataTableCell>
                    </DataTableRow>
                  ))}
                </tbody>
              </DataTableContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {section === 'REVENUE' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <div className="text-xs font-medium uppercase text-slate-500">
                  Monthly Recurring Revenue (MRR)
                </div>
                <div className="mt-1 font-mono text-2xl font-bold text-emerald-600">
                  {formatDecimalMoneyDisplay(revenue?.mrrUsd ?? '0.0000', 'USD')}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-xs font-medium uppercase text-slate-500">
                  Annualized Run Rate (ARR)
                </div>
                <div className="mt-1 font-mono text-2xl font-bold text-flotech-navy">
                  {formatDecimalMoneyDisplay(revenue?.arrUsd ?? '0.0000', 'USD')}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-xs font-medium uppercase text-slate-500">
                  Active Paid Subscriptions
                </div>
                <div className="mt-1 text-2xl font-bold text-flotech-primary">
                  {revenue?.activePaidSubscriptions ?? 0}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-xs font-medium uppercase text-slate-500">
                  Trialing Subscriptions
                </div>
                <div className="mt-1 text-2xl font-bold text-flotech-teal">
                  {revenue?.trialingSubscriptions ?? 0}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Revenue Contribution by Plan Tier</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <DataTableContainer>
                <DataTableHead>
                  <tr>
                    <DataTableHeaderCell>Plan Tier</DataTableHeaderCell>
                    <DataTableHeaderCell className="text-right">Subscribers</DataTableHeaderCell>
                    <DataTableHeaderCell className="text-right">Monthly MRR Contribution (USD)</DataTableHeaderCell>
                  </tr>
                </DataTableHead>
                <tbody>
                  {(revenue?.planBreakdown ?? []).map((p) => (
                    <DataTableRow key={p.planCode}>
                      <DataTableCell>
                        <div className="font-mono text-xs font-bold text-flotech-navy">
                          {p.planCode}
                        </div>
                        <div className="text-xs text-slate-500">{p.planName}</div>
                      </DataTableCell>
                      <DataTableCell className="text-right font-mono text-xs">
                        {p.subscriberCount}
                      </DataTableCell>
                      <DataTableCell className="text-right font-mono text-xs font-semibold text-emerald-700">
                        {formatDecimalMoneyDisplay(
                          p.monthlyRevenueContributionUsd,
                          'USD'
                        )}
                      </DataTableCell>
                    </DataTableRow>
                  ))}
                </tbody>
              </DataTableContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {section === 'NOTIFICATIONS' && (
        <Card>
          <CardHeader>
            <CardTitle>Platform-Wide Notification Broadcast</CardTitle>
            <CardDescription>
              Dispatch an operational or security announcement to all active users across FloTech Digital.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => void handleBroadcastNotification(e)}
              className="space-y-4"
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <InputField
                  label="Notification Category"
                  value={broadcastCategory}
                  onChange={(e) => setBroadcastCategory(e.target.value)}
                  required
                />
                <InputField
                  label="Announcement Title"
                  placeholder="Scheduled maintenance or regulatory compliance notice..."
                  value={broadcastTitle}
                  onChange={(e) => setBroadcastTitle(e.target.value)}
                  required
                />
              </div>
              <InputField
                label="Broadcast Message Body"
                placeholder="Enter detailed platform announcement..."
                value={broadcastBody}
                onChange={(e) => setBroadcastBody(e.target.value)}
                required
              />
              <div className="flex justify-end">
                <Button type="submit" variant="primary">
                  <Send className="mr-1.5 h-4 w-4" />
                  Broadcast to Platform Users
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {section === 'AUDIT_LOGS' && (
        <Card>
          <CardHeader>
            <CardTitle>Immutable Platform &amp; Tenant Audit Trail</CardTitle>
            <CardDescription>
              Chronological security and financial event log from PostgreSQL audit_logs.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <DataTableContainer>
              <DataTableHead>
                <tr>
                  <DataTableHeaderCell>Timestamp</DataTableHeaderCell>
                  <DataTableHeaderCell>Action &amp; Entity</DataTableHeaderCell>
                  <DataTableHeaderCell>Actor</DataTableHeaderCell>
                  <DataTableHeaderCell>Business</DataTableHeaderCell>
                </tr>
              </DataTableHead>
              <tbody>
                {auditLogs.map((log) => (
                  <DataTableRow key={log.id}>
                    <DataTableCell className="font-mono text-xs text-slate-500">
                      {log.createdAt.slice(0, 19).replace('T', ' ')}
                    </DataTableCell>
                    <DataTableCell>
                      <div className="font-mono text-xs font-bold text-flotech-navy">
                        {log.action}
                      </div>
                      <div className="text-xs text-slate-500">{log.entityType}</div>
                    </DataTableCell>
                    <DataTableCell>
                      <div className="text-xs font-medium text-slate-800">
                        {log.actorFullName ?? 'System'} ({log.actorPlatformRole})
                      </div>
                      <div className="text-xs text-slate-500">{log.actorEmail ?? ''}</div>
                    </DataTableCell>
                    <DataTableCell className="text-xs text-slate-600">
                      {log.businessName ?? 'Global Platform'}
                    </DataTableCell>
                  </DataTableRow>
                ))}
              </tbody>
            </DataTableContainer>
          </CardContent>
        </Card>
      )}

      {section === 'SETTINGS' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Update Platform Governance Setting</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={(e) => void handleSavePlatformSetting(e)}
                className="space-y-4"
              >
                <InputField
                  label="Setting Key"
                  value={settingKey}
                  onChange={(e) => setSettingKey(e.target.value)}
                  required
                />
                <InputField
                  label="JSON Value"
                  value={settingJsonStr}
                  onChange={(e) => setSettingJsonStr(e.target.value)}
                  required
                />
                <div className="flex justify-end">
                  <Button type="submit" variant="primary">
                    Save Platform Setting
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Active Platform Settings (PostgreSQL platform_settings)</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <DataTableContainer>
                <DataTableHead>
                  <tr>
                    <DataTableHeaderCell>Key</DataTableHeaderCell>
                    <DataTableHeaderCell>JSON Configuration</DataTableHeaderCell>
                    <DataTableHeaderCell>Updated At</DataTableHeaderCell>
                  </tr>
                </DataTableHead>
                <tbody>
                  {platformSettings.map((s) => (
                    <DataTableRow key={s.key}>
                      <DataTableCell className="font-mono text-xs font-bold text-flotech-navy">
                        {s.key}
                      </DataTableCell>
                      <DataTableCell className="font-mono text-xs text-slate-700">
                        {JSON.stringify(s.valueJson)}
                      </DataTableCell>
                      <DataTableCell className="font-mono text-xs text-slate-500">
                        {s.updatedAt.slice(0, 19).replace('T', ' ')}
                      </DataTableCell>
                    </DataTableRow>
                  ))}
                </tbody>
              </DataTableContainer>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
