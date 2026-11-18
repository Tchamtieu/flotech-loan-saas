import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  CreditCard,
  ShieldAlert,
  Sparkles,
  RefreshCw,
  Users,
  Briefcase,
  FileSpreadsheet,
  XCircle,
  Clock,
} from 'lucide-react';
import {
  PermissionCode,
  SubscriptionStatus,
  type TenantSubscriptionOverviewDTO,
} from '@flotech/shared';
import { getActiveAppCheckToken } from '@/config/firebaseClient';
import { useAuthSession } from '@/hooks/useAuthSession';
import {
  cancelTenantSubscriptionApi,
  changeTenantSubscriptionPlanApi,
  fetchTenantSubscriptionOverviewApi,
} from '@/services/apiClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { InputField } from '@/components/ui/FormElements';
import {
  DataTableContainer,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
  DataTableCell,
} from '@/components/ui/DataTable';

export const SubscriptionPage: React.FC = () => {
  const {
    firebaseUser,
    activeBusinessId,
    activeBusinessProfile,
    activeTenantMembership,
    refreshProfileSession,
  } = useAuthSession();

  const [overview, setOverview] = useState<TenantSubscriptionOverviewDTO | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [selectedBillingInterval, setSelectedBillingInterval] = useState<'MONTHLY' | 'ANNUAL'>(
    'MONTHLY'
  );
  const [submittingPlanCode, setSubmittingPlanCode] = useState<string | null>(null);

  const [cancelReason, setCancelReason] = useState<string>('');
  const [cancelImmediate, setCancelImmediate] = useState<boolean>(false);
  const [canceling, setCanceling] = useState<boolean>(false);

  const canManageSubscription = Boolean(
    activeTenantMembership?.permissions.includes(PermissionCode.SUBSCRIPTION_MANAGE)
  );

  const loadSubscriptionOverview = useCallback(async () => {
    if (!firebaseUser || !activeBusinessId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    try {
      const idToken = await firebaseUser.getIdToken();
      const appCheckToken = await getActiveAppCheckToken();
      const response = await fetchTenantSubscriptionOverviewApi(
        idToken,
        appCheckToken,
        activeBusinessId
      );
      if (response.success) {
        setOverview(response.data);
        setSelectedBillingInterval(response.data.billingInterval);
      } else {
        setErrorMessage(`${response.error.code}: ${response.error.message}`);
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to load business subscription overview.'
      );
    } finally {
      setLoading(false);
    }
  }, [firebaseUser, activeBusinessId]);

  useEffect(() => {
    void loadSubscriptionOverview();
  }, [loadSubscriptionOverview]);

  const handleSelectPlan = async (planCode: string) => {
    if (!firebaseUser || !activeBusinessId) return;
    setSubmittingPlanCode(planCode);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const idToken = await firebaseUser.getIdToken();
      const appCheckToken = await getActiveAppCheckToken();
      const response = await changeTenantSubscriptionPlanApi(
        idToken,
        appCheckToken,
        activeBusinessId,
        {
          planCode,
          billingInterval: selectedBillingInterval,
          autoRenew: true,
        }
      );
      if (response.success) {
        setOverview(response.data);
        setSuccessMessage(
          `Subscription updated to ${response.data.planName} (${response.data.billingInterval}) successfully.`
        );
        await refreshProfileSession();
      } else {
        setErrorMessage(`${response.error.code}: ${response.error.message}`);
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Unable to switch subscription plan.'
      );
    } finally {
      setSubmittingPlanCode(null);
    }
  };

  const handleCancelSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !activeBusinessId) return;
    if (cancelReason.trim().length < 5) {
      setErrorMessage('Please provide a cancellation reason (at least 5 characters).');
      return;
    }
    setCanceling(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const idToken = await firebaseUser.getIdToken();
      const appCheckToken = await getActiveAppCheckToken();
      const response = await cancelTenantSubscriptionApi(
        idToken,
        appCheckToken,
        activeBusinessId,
        {
          immediate: cancelImmediate,
          reason: cancelReason.trim(),
        }
      );
      if (response.success) {
        setOverview(response.data);
        setCancelReason('');
        setSuccessMessage(
          cancelImmediate
            ? 'Subscription canceled immediately.'
            : 'Auto-renewal disabled. Your subscription will remain active until the end of the current billing period.'
        );
        await refreshProfileSession();
      } else {
        setErrorMessage(`${response.error.code}: ${response.error.message}`);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to cancel subscription.');
    } finally {
      setCanceling(false);
    }
  };

  if (!activeBusinessId) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-slate-600">
          Select or create an active business workspace to manage your SaaS subscription.
        </CardContent>
      </Card>
    );
  }

  const getStatusBadgeVariant = (
    status: SubscriptionStatus
  ): 'success' | 'primary' | 'warning' | 'danger' | 'neutral' => {
    switch (status) {
      case SubscriptionStatus.ACTIVE:
        return 'success';
      case SubscriptionStatus.TRIALING:
        return 'primary';
      case SubscriptionStatus.PAST_DUE:
        return 'warning';
      case SubscriptionStatus.CANCELED:
      case SubscriptionStatus.EXPIRED:
        return 'danger';
      default:
        return 'neutral';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Subscription &amp; Plan Quotas
          </h1>
          <p className="text-sm text-slate-600">
            Manage your FloTech Digital SaaS plan, billing cycle, and real-time resource quotas for{' '}
            <span className="font-semibold text-slate-900">
              {activeBusinessProfile?.legalName ?? activeTenantMembership?.businessName ?? 'Tenant'}
            </span>
            .
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void loadSubscriptionOverview()}
          disabled={loading}
        >
          <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh Quotas
        </Button>
      </div>

      {errorMessage && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      {successMessage && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          {successMessage}
        </div>
      )}

      {overview && (
        <>
          {/* Current Plan & Billing Notice */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="flex flex-row items-start justify-between">
                <div>
                  <div className="flex items-center gap-2.5">
                    <CardTitle>{overview.planName}</CardTitle>
                    <Badge variant={getStatusBadgeVariant(overview.status)}>
                      {overview.status}
                    </Badge>
                    <Badge variant="neutral">{overview.billingInterval}</Badge>
                  </div>
                  <CardDescription className="mt-1">
                    {overview.planDescription ?? 'FloTech Digital Commercial Lending Subscription'}
                  </CardDescription>
                </div>
                <div className="text-right">
                  <div className="font-mono text-2xl font-bold text-slate-900">
                    ${Number(overview.unitPriceUsd).toFixed(2)}
                    <span className="text-xs font-normal text-slate-500">
                      /{overview.billingInterval === 'ANNUAL' ? 'year' : 'month'}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500">Plan Code: {overview.planCode}</div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-4 rounded-lg bg-slate-50 p-4 sm:grid-cols-3">
                  <div>
                    <div className="text-xs font-medium uppercase text-slate-500">
                      Current Period Start
                    </div>
                    <div className="mt-1 font-mono text-sm font-semibold text-slate-900">
                      {overview.currentPeriodStart.slice(0, 10)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-medium uppercase text-slate-500">
                      Current Period End
                    </div>
                    <div className="mt-1 font-mono text-sm font-semibold text-slate-900">
                      {overview.currentPeriodEnd.slice(0, 10)} ({overview.daysRemainingInPeriod}d
                      left)
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-medium uppercase text-slate-500">
                      Renewal Policy
                    </div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">
                      {overview.autoRenew ? 'Auto-Renew Enabled' : 'Expires at Period End'}
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50/70 p-3.5 text-xs text-blue-900">
                  <CreditCard className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                  <div>
                    <span className="font-semibold">
                      Billing Mode ({overview.billingProviderMode}):
                    </span>{' '}
                    Plan selections and quota upgrades are enforced immediately in PostgreSQL.
                    Commercial invoicing is managed via FloTech Digital Enterprise Billing or
                    sandbox settlement.
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Quota Utilization Meters */}
            <Card>
              <CardHeader>
                <CardTitle>Real-Time Quota Utilization</CardTitle>
                <CardDescription>
                  Enforced atomically by PostgreSQL before new loans, customers, or staff are added.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Active Loans */}
                <div>
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="flex items-center gap-1.5 text-slate-700">
                      <FileSpreadsheet className="h-3.5 w-3.5 text-blue-600" />
                      Active &amp; Overdue Loans
                    </span>
                    <span className="font-mono font-semibold text-slate-900">
                      {overview.quotas.activeLoansUsed} / {overview.quotas.maxActiveLoans} (
                      {Number(overview.quotas.activeLoansUtilizationPercent).toFixed(1)}%)
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-blue-600 transition-all"
                      style={{
                        width: `${Math.min(
                          100,
                          Number(overview.quotas.activeLoansUtilizationPercent)
                        )}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Active Employees */}
                <div>
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="flex items-center gap-1.5 text-slate-700">
                      <Briefcase className="h-3.5 w-3.5 text-teal-600" />
                      Active &amp; Invited Staff
                    </span>
                    <span className="font-mono font-semibold text-slate-900">
                      {overview.quotas.activeEmployeesUsed} / {overview.quotas.maxEmployees} (
                      {Number(overview.quotas.activeEmployeesUtilizationPercent).toFixed(1)}%)
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-teal-600 transition-all"
                      style={{
                        width: `${Math.min(
                          100,
                          Number(overview.quotas.activeEmployeesUtilizationPercent)
                        )}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Active Customers */}
                <div>
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="flex items-center gap-1.5 text-slate-700">
                      <Users className="h-3.5 w-3.5 text-indigo-600" />
                      Active Borrowers
                    </span>
                    <span className="font-mono font-semibold text-slate-900">
                      {overview.quotas.activeCustomersUsed} / {overview.quotas.maxCustomers} (
                      {Number(overview.quotas.activeCustomersUtilizationPercent).toFixed(1)}%)
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-indigo-600 transition-all"
                      style={{
                        width: `${Math.min(
                          100,
                          Number(overview.quotas.activeCustomersUtilizationPercent)
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Available Plans Catalog */}
          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>FloTech Digital SaaS Plans &amp; Pricing</CardTitle>
                <CardDescription>
                  Compare tiers and switch between Monthly or Annual billing intervals. Downgrades
                  validate current usage against target plan limits.
                </CardDescription>
              </div>
              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setSelectedBillingInterval('MONTHLY')}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                    selectedBillingInterval === 'MONTHLY'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Monthly Billing
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedBillingInterval('ANNUAL')}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                    selectedBillingInterval === 'ANNUAL'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Annual Billing (Save ~17%)
                </button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
                {overview.availablePlans.map((plan) => {
                  const isCurrentPlan =
                    plan.code === overview.planCode &&
                    selectedBillingInterval === overview.billingInterval &&
                    overview.status === SubscriptionStatus.ACTIVE;
                  const price =
                    selectedBillingInterval === 'ANNUAL' ? plan.annualPrice : plan.monthlyPrice;

                  return (
                    <div
                      key={plan.id}
                      className={`flex flex-col justify-between rounded-xl border p-5 transition ${
                        plan.code === overview.planCode
                          ? 'border-blue-600 bg-blue-50/30 ring-1 ring-blue-600'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold uppercase tracking-wider text-blue-600">
                            {plan.code}
                          </span>
                          {plan.code === overview.planCode && (
                            <Badge variant="primary">Current Plan</Badge>
                          )}
                        </div>
                        <h3 className="mt-1 text-base font-bold text-slate-900">{plan.name}</h3>
                        <div className="mt-3 font-mono text-2xl font-bold text-slate-900">
                          ${Number(price).toFixed(2)}
                          <span className="text-xs font-normal text-slate-500">
                            /{selectedBillingInterval === 'ANNUAL' ? 'yr' : 'mo'}
                          </span>
                        </div>
                        <p className="mt-2 text-xs text-slate-600">{plan.description}</p>

                        <ul className="mt-4 space-y-2 border-t border-slate-100 pt-3 text-xs text-slate-700">
                          <li className="flex items-center gap-2">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                            <span>
                              Up to <strong>{plan.maxActiveLoans.toLocaleString()}</strong> active
                              loans
                            </span>
                          </li>
                          <li className="flex items-center gap-2">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                            <span>
                              Up to <strong>{plan.maxEmployees.toLocaleString()}</strong> staff
                              members
                            </span>
                          </li>
                          <li className="flex items-center gap-2">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                            <span>
                              Up to <strong>{plan.maxCustomers.toLocaleString()}</strong> active
                              borrowers
                            </span>
                          </li>
                        </ul>
                      </div>

                      <div className="mt-5 pt-3">
                        <Button
                          variant={isCurrentPlan ? 'outline' : 'primary'}
                          size="sm"
                          className="w-full"
                          disabled={
                            !canManageSubscription ||
                            isCurrentPlan ||
                            submittingPlanCode === plan.code
                          }
                          onClick={() => void handleSelectPlan(plan.code)}
                        >
                          <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                          {isCurrentPlan
                            ? 'Active Selection'
                            : submittingPlanCode === plan.code
                              ? 'Updating...'
                              : `Select ${plan.name}`}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Subscription History & Cancellation Controls */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Subscription Audit Trail</CardTitle>
                <CardDescription>
                  Immutable PostgreSQL audit log of subscription provisioning, plan changes, and
                  renewals.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <DataTableContainer>
                  <DataTableHead>
                    <tr>
                      <DataTableHeaderCell>Timestamp</DataTableHeaderCell>
                      <DataTableHeaderCell>Action</DataTableHeaderCell>
                      <DataTableHeaderCell>Actor</DataTableHeaderCell>
                      <DataTableHeaderCell>Details</DataTableHeaderCell>
                    </tr>
                  </DataTableHead>
                  <tbody>
                    {overview.history.length === 0 ? (
                      <DataTableRow>
                        <DataTableCell colSpan={4} className="text-center text-slate-500">
                          No subscription history events recorded yet.
                        </DataTableCell>
                      </DataTableRow>
                    ) : (
                      overview.history.map((item) => (
                        <DataTableRow key={item.id}>
                          <DataTableCell className="font-mono text-xs text-slate-600">
                            <Clock className="mr-1 inline h-3 w-3 text-slate-400" />
                            {item.createdAt.slice(0, 19).replace('T', ' ')}
                          </DataTableCell>
                          <DataTableCell>
                            <Badge variant="neutral">{item.action}</Badge>
                          </DataTableCell>
                          <DataTableCell className="text-xs font-medium text-slate-800">
                            {item.actorFullName ?? 'System'}
                          </DataTableCell>
                          <DataTableCell className="font-mono text-xs text-slate-600">
                            {JSON.stringify(item.afterState ?? {})}
                          </DataTableCell>
                        </DataTableRow>
                      ))
                    )}
                  </tbody>
                </DataTableContainer>
              </CardContent>
            </Card>

            {canManageSubscription && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-red-700">
                    <ShieldAlert className="h-4 w-4" />
                    Cancel or Pause Renewal
                  </CardTitle>
                  <CardDescription>
                    Disable auto-renewal at period end or immediately cancel the subscription.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={(e) => void handleCancelSubscription(e)} className="space-y-4">
                    <InputField
                      label="Cancellation Reason"
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                      placeholder="e.g., Seasonal lending pause..."
                      required
                    />
                    <label className="flex items-center gap-2 text-xs text-slate-700">
                      <input
                        type="checkbox"
                        checked={cancelImmediate}
                        onChange={(e) => setCancelImmediate(e.target.checked)}
                        className="rounded border-slate-300 text-red-600 focus:ring-red-500"
                      />
                      Cancel immediately (blocks new loans, customers, and employees right away)
                    </label>
                    <Button
                      type="submit"
                      variant="danger"
                      size="sm"
                      className="w-full"
                      disabled={canceling}
                    >
                      <XCircle className="mr-1.5 h-4 w-4" />
                      {canceling
                        ? 'Processing...'
                        : cancelImmediate
                          ? 'Cancel Subscription Immediately'
                          : 'Disable Auto-Renewal'}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  );
};
