import React, { useCallback, useEffect, useState } from 'react';
import {
  InstallmentStatus,
  PermissionCode,
  type InstallmentWithLoanContextDTO,
  type OverdueEvaluationResultDTO,
} from '@flotech/shared';
import {
  CalendarClock,
  CheckCircle2,
  Filter,
  Play,
  RefreshCw,
  ShieldAlert,
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
  evaluateOverdueSchedulesApi,
  fetchRepaymentSchedulesApi,
} from '@/services/apiClient';

function getInstallmentBadgeVariant(
  status: InstallmentStatus
): 'neutral' | 'primary' | 'teal' | 'success' | 'warning' | 'danger' {
  switch (status) {
    case InstallmentStatus.PAID:
      return 'success';
    case InstallmentStatus.OVERDUE:
      return 'danger';
    case InstallmentStatus.PARTIALLY_PAID:
      return 'warning';
    case InstallmentStatus.WAIVED:
      return 'neutral';
    default:
      return 'primary';
  }
}

export function RepaymentSchedulesPage(): React.ReactElement {
  const { firebaseUser, activeBusinessId, activeTenantMembership } = useAuthSession();

  const [schedules, setSchedules] = useState<InstallmentWithLoanContextDTO[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [dueFromFilter, setDueFromFilter] = useState<string>('');
  const [dueToFilter, setDueToFilter] = useState<string>('');
  const [overdueOnlyFilter, setOverdueOnlyFilter] = useState<boolean>(false);
  const [asOfDate, setAsOfDate] = useState<string>(() => new Date().toISOString().slice(0, 10));

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastEvaluation, setLastEvaluation] = useState<OverdueEvaluationResultDTO | null>(null);

  const permissions = activeTenantMembership?.permissions ?? [];
  const canEvaluateOverdue = permissions.includes(PermissionCode.LOANS_REVIEW);

  const loadSchedules = useCallback(async () => {
    if (!firebaseUser || !activeBusinessId) return;
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const idToken = await firebaseUser.getIdToken();
      const appCheckToken = await getActiveAppCheckToken();

      const res = await fetchRepaymentSchedulesApi(idToken, appCheckToken, activeBusinessId, {
        status:
          statusFilter !== 'ALL' ? (statusFilter as InstallmentStatus) : undefined,
        dueFrom: dueFromFilter || undefined,
        dueTo: dueToFilter || undefined,
        overdueOnly: overdueOnlyFilter,
        asOfDate: asOfDate || undefined,
      });

      if (!res.success) {
        setErrorMessage(`${res.error.code}: ${res.error.message}`);
        return;
      }

      setSchedules(res.data);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to load repayment schedules.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [
    firebaseUser,
    activeBusinessId,
    statusFilter,
    dueFromFilter,
    dueToFilter,
    overdueOnlyFilter,
    asOfDate,
  ]);

  useEffect(() => {
    void loadSchedules();
  }, [loadSchedules]);

  const handleEvaluateOverdue = async () => {
    if (!firebaseUser || !activeBusinessId) return;
    setIsEvaluating(true);
    setErrorMessage(null);

    try {
      const idToken = await firebaseUser.getIdToken();
      const appCheckToken = await getActiveAppCheckToken();

      const res = await evaluateOverdueSchedulesApi(idToken, appCheckToken, activeBusinessId, {
        asOfDate: asOfDate || undefined,
        applyLatePenalties: true,
      });

      if (!res.success) {
        setErrorMessage(`${res.error.code}: ${res.error.message}`);
        return;
      }

      setLastEvaluation(res.data);
      await loadSchedules();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to evaluate delinquency and penalties.'
      );
    } finally {
      setIsEvaluating(false);
    }
  };

  const pendingCount = schedules.filter((s) => s.status === InstallmentStatus.PENDING).length;
  const overdueCount = schedules.filter((s) => s.status === InstallmentStatus.OVERDUE).length;
  const paidCount = schedules.filter((s) => s.status === InstallmentStatus.PAID).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="teal">PHASE 7 — FINANCIAL SCHEDULE ENGINE</Badge>
            <span className="text-xs font-mono text-slate-500">
              PostgreSQL NUMERIC(19,4) + Decimal.js
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-flotech-navy">
            Master Repayment Schedules
          </h1>
          <p className="text-sm text-slate-600">
            Inspect amortized installment schedules across all active loans, track grace periods, and run deterministic delinquency &amp; penalty evaluations.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => void loadSchedules()} disabled={isLoading}>
            <RefreshCw className="mr-1.5 h-4 w-4" />
            Refresh Ledger
          </Button>
          {canEvaluateOverdue && (
            <Button
              variant="primary"
              onClick={() => void handleEvaluateOverdue()}
              disabled={isEvaluating}
            >
              <Play className="mr-1.5 h-4 w-4" />
              {isEvaluating ? 'Evaluating...' : 'Run Delinquency & Penalty Engine'}
            </Button>
          )}
        </div>
      </div>

      {errorMessage && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {lastEvaluation && (
        <div className="rounded-lg border border-teal-200 bg-teal-50/70 px-4 py-3 text-sm text-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-flotech-teal shrink-0" />
            <span>
              Delinquency engine evaluated as of <strong>{lastEvaluation.asOfDate}</strong>:
              marked <strong>{lastEvaluation.installmentsMarkedOverdue}</strong> installment(s) and{' '}
              <strong>{lastEvaluation.loansMarkedOverdue}</strong> loan(s) OVERDUE; accrued{' '}
              <strong>{lastEvaluation.penaltiesAccruedCount}</strong> late penalty charge(s) totaling{' '}
              <strong className="font-mono">{lastEvaluation.totalPenaltyAccruedAmount}</strong>.
            </span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Loaded Installments
            </div>
            <div className="mt-1 text-2xl font-bold text-flotech-navy">{schedules.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Pending Scheduled
            </div>
            <div className="mt-1 text-2xl font-bold text-flotech-primary">{pendingCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Overdue Installments
            </div>
            <div className="mt-1 text-2xl font-bold text-red-600">{overdueCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Paid Installments
            </div>
            <div className="mt-1 text-2xl font-bold text-emerald-600">{paidCount}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Schedule Filter &amp; Evaluation Date Controls</CardTitle>
            <CardDescription>
              Filter installments by status, due date window, or evaluate grace-period delinquency as of a target date.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Filter className="h-3.5 w-3.5" />
            <span>Tenant RLS Isolated</span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-5">
            <SelectField
              label="Installment Status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="ALL">All Statuses</option>
              <option value={InstallmentStatus.PENDING}>PENDING</option>
              <option value={InstallmentStatus.PARTIALLY_PAID}>PARTIALLY_PAID</option>
              <option value={InstallmentStatus.OVERDUE}>OVERDUE</option>
              <option value={InstallmentStatus.PAID}>PAID</option>
              <option value={InstallmentStatus.WAIVED}>WAIVED</option>
            </SelectField>

            <InputField
              label="Due Date From"
              type="date"
              value={dueFromFilter}
              onChange={(e) => setDueFromFilter(e.target.value)}
            />

            <InputField
              label="Due Date To"
              type="date"
              value={dueToFilter}
              onChange={(e) => setDueToFilter(e.target.value)}
            />

            <InputField
              label="Evaluation As-Of Date"
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
            />

            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={overdueOnlyFilter}
                  onChange={(e) => setOverdueOnlyFilter(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-flotech-primary focus:ring-flotech-primary"
                />
                <span>Past-Due / Overdue Only</span>
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Installment Schedule Ledger</CardTitle>
            <CardDescription>
              Every row is backed by PostgreSQL NUMERIC(19,4) columns and verified by backend Decimal.js arithmetic.
            </CardDescription>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <CalendarClock className="h-4 w-4 text-flotech-primary" />
            <span>As of {asOfDate}</span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <DataTableContainer>
            <DataTableHead>
              <tr>
                <DataTableHeaderCell>Loan &amp; Installment</DataTableHeaderCell>
                <DataTableHeaderCell>Customer</DataTableHeaderCell>
                <DataTableHeaderCell>Due Date &amp; DPD</DataTableHeaderCell>
                <DataTableHeaderCell>Status</DataTableHeaderCell>
                <DataTableHeaderCell className="text-right">Principal / Interest Due</DataTableHeaderCell>
                <DataTableHeaderCell className="text-right">Fee / Penalty Due</DataTableHeaderCell>
                <DataTableHeaderCell className="text-right">Total Due / Remaining</DataTableHeaderCell>
              </tr>
            </DataTableHead>
            <tbody>
              {schedules.length === 0 ? (
                <DataTableRow>
                  <DataTableCell colSpan={7} className="py-8 text-center text-sm text-slate-500">
                    {isLoading
                      ? 'Loading repayment schedules from PostgreSQL...'
                      : 'No repayment schedule installments match the active filter criteria.'}
                  </DataTableCell>
                </DataTableRow>
              ) : (
                schedules.map((row) => (
                  <DataTableRow key={row.id}>
                    <DataTableCell>
                      <div className="font-mono text-xs font-semibold text-flotech-navy">
                        {row.loanNumber}
                      </div>
                      <div className="text-xs text-slate-500">
                        Installment #{row.installmentNumber} &bull; {row.loanProductName}
                      </div>
                    </DataTableCell>
                    <DataTableCell>
                      <div className="font-medium text-flotech-navy">{row.customerFullName}</div>
                      <div className="text-xs text-slate-500">
                        {row.customerNumber} &bull; {row.customerPhoneNumber}
                      </div>
                    </DataTableCell>
                    <DataTableCell>
                      <div className="font-mono text-xs font-medium text-slate-800">{row.dueDate}</div>
                      {row.daysPastDue > 0 ? (
                        <div className="text-xs font-semibold text-red-600">
                          {row.daysPastDue} days past due (Grace: {row.gracePeriodDays}d)
                        </div>
                      ) : (
                        <div className="text-xs text-slate-500">Grace: {row.gracePeriodDays}d</div>
                      )}
                    </DataTableCell>
                    <DataTableCell>
                      <Badge variant={getInstallmentBadgeVariant(row.status)}>{row.status}</Badge>
                    </DataTableCell>
                    <DataTableCell className="text-right font-mono text-xs">
                      <div className="text-slate-800">
                        P: {formatDecimalMoneyDisplay(row.principalDue, row.currencyCode)}
                      </div>
                      <div className="text-slate-500">
                        I: {formatDecimalMoneyDisplay(row.interestDue, row.currencyCode)}
                      </div>
                    </DataTableCell>
                    <DataTableCell className="text-right font-mono text-xs">
                      <div className="text-slate-600">
                        Fee: {formatDecimalMoneyDisplay(row.feeDue, row.currencyCode)}
                      </div>
                      <div className="font-medium text-red-600">
                        Pen: {formatDecimalMoneyDisplay(row.penaltyDue, row.currencyCode)}
                      </div>
                    </DataTableCell>
                    <DataTableCell className="text-right font-mono text-xs">
                      <div className="font-semibold text-flotech-navy">
                        Due: {formatDecimalMoneyDisplay(row.totalDue, row.currencyCode)}
                      </div>
                      <div className="text-flotech-teal">
                        Bal: {formatDecimalMoneyDisplay(row.unpaidInstallmentBalance, row.currencyCode)}
                      </div>
                    </DataTableCell>
                  </DataTableRow>
                ))
              )}
            </tbody>
          </DataTableContainer>
        </CardContent>
      </Card>
    </div>
  );
}
