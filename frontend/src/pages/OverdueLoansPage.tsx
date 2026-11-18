import React, { useCallback, useEffect, useState } from 'react';
import {
  PermissionCode,
  type OverdueLoanSummaryDTO,
} from '@flotech/shared';
import {
  AlertTriangle,
  CheckCircle2,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  XCircle,
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
import { InputField } from '@/components/ui/FormElements';
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
  fetchOverdueLoansApi,
  restructureLoanApi,
  writeOffLoanApi,
} from '@/services/apiClient';

export function OverdueLoansPage(): React.ReactElement {
  const { firebaseUser, activeBusinessId, activeTenantMembership } = useAuthSession();

  const [overdueLoans, setOverdueLoans] = useState<OverdueLoanSummaryDTO[]>([]);
  const [asOfDate, setAsOfDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  // Restructure Modal state
  const [selectedForRestructure, setSelectedForRestructure] =
    useState<OverdueLoanSummaryDTO | null>(null);
  const [newTermInstallments, setNewTermInstallments] = useState<string>('6');
  const [newNominalRatePercent, setNewNominalRatePercent] = useState<string>('');
  const [newFirstRepaymentDate, setNewFirstRepaymentDate] = useState<string>(
    () => new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  );
  const [waiveUnpaidPenalties, setWaiveUnpaidPenalties] = useState<boolean>(true);
  const [restructureReason, setRestructureReason] = useState<string>('');
  const [isSubmittingRestructure, setIsSubmittingRestructure] = useState<boolean>(false);

  // Write-off Modal state
  const [selectedForWriteOff, setSelectedForWriteOff] =
    useState<OverdueLoanSummaryDTO | null>(null);
  const [writeOffReason, setWriteOffReason] = useState<string>('');
  const [isSubmittingWriteOff, setIsSubmittingWriteOff] = useState<boolean>(false);

  const permissions = activeTenantMembership?.permissions ?? [];
  const canEvaluateOverdue = permissions.includes(PermissionCode.LOANS_REVIEW);
  const canRestructure = permissions.includes(PermissionCode.LOANS_RESTRUCTURE);
  const canWriteOff = permissions.includes(PermissionCode.LOANS_WRITE_OFF);

  const loadOverdueLoans = useCallback(async () => {
    if (!firebaseUser || !activeBusinessId) return;
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const idToken = await firebaseUser.getIdToken();
      const appCheckToken = await getActiveAppCheckToken();

      const res = await fetchOverdueLoansApi(
        idToken,
        appCheckToken,
        activeBusinessId,
        asOfDate || undefined
      );
      if (!res.success) {
        setErrorMessage(`${res.error.code}: ${res.error.message}`);
        return;
      }
      setOverdueLoans(res.data);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to load overdue loans.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [firebaseUser, activeBusinessId, asOfDate]);

  useEffect(() => {
    void loadOverdueLoans();
  }, [loadOverdueLoans]);

  const handleEvaluateDelinquency = async () => {
    if (!firebaseUser || !activeBusinessId) return;
    setIsEvaluating(true);
    setErrorMessage(null);
    setStatusBanner(null);

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

      setStatusBanner(
        `Evaluated as of ${res.data.asOfDate}: ${res.data.installmentsMarkedOverdue} installment(s) and ${res.data.loansMarkedOverdue} loan(s) marked OVERDUE; ${res.data.penaltiesAccruedCount} penalty charge(s) accrued (${res.data.totalPenaltyAccruedAmount}).`
      );
      await loadOverdueLoans();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to evaluate delinquency.'
      );
    } finally {
      setIsEvaluating(false);
    }
  };

  const openRestructureModal = (item: OverdueLoanSummaryDTO) => {
    setSelectedForRestructure(item);
    setNewTermInstallments(String(item.loan.termInstallments));
    setNewNominalRatePercent(item.loan.nominalInterestRatePercent);
    setNewFirstRepaymentDate(
      new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
    );
    setWaiveUnpaidPenalties(true);
    setRestructureReason('');
    setErrorMessage(null);
  };

  const handleRestructureSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !activeBusinessId || !selectedForRestructure) return;

    setIsSubmittingRestructure(true);
    setErrorMessage(null);

    try {
      const idToken = await firebaseUser.getIdToken();
      const appCheckToken = await getActiveAppCheckToken();

      const res = await restructureLoanApi(
        idToken,
        appCheckToken,
        activeBusinessId,
        selectedForRestructure.loan.id,
        {
          newTermInstallments: Number(newTermInstallments),
          newNominalInterestRatePercent:
            newNominalRatePercent.trim().length > 0
              ? newNominalRatePercent.trim()
              : undefined,
          newFirstRepaymentDate,
          waiveUnpaidPenalties,
          reason: restructureReason.trim(),
        }
      );

      if (!res.success) {
        setErrorMessage(`${res.error.code}: ${res.error.message}`);
        return;
      }

      setStatusBanner(
        `Loan ${res.data.loan.loanNumber} restructured into ${res.data.schedules.length} total schedule installments (Status: ${res.data.loan.status}).`
      );
      setSelectedForRestructure(null);
      await loadOverdueLoans();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to restructure loan.'
      );
    } finally {
      setIsSubmittingRestructure(false);
    }
  };

  const handleWriteOffSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !activeBusinessId || !selectedForWriteOff) return;

    setIsSubmittingWriteOff(true);
    setErrorMessage(null);

    try {
      const idToken = await firebaseUser.getIdToken();
      const appCheckToken = await getActiveAppCheckToken();

      const res = await writeOffLoanApi(
        idToken,
        appCheckToken,
        activeBusinessId,
        selectedForWriteOff.loan.id,
        {
          reason: writeOffReason.trim(),
        }
      );

      if (!res.success) {
        setErrorMessage(`${res.error.code}: ${res.error.message}`);
        return;
      }

      setStatusBanner(
        `Loan ${res.data.loanNumber} has been formally marked as WRITTEN_OFF and closed.`
      );
      setSelectedForWriteOff(null);
      setWriteOffReason('');
      await loadOverdueLoans();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to write off loan.'
      );
    } finally {
      setIsSubmittingWriteOff(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="danger">PHASE 7 — DELINQUENCY &amp; WORKOUT</Badge>
            <span className="text-xs font-mono text-slate-500">
              Grace Period &bull; Late Penalty Accrual &bull; Restructuring
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-flotech-navy">
            Overdue Loans &amp; Portfolio Workout
          </h1>
          <p className="text-sm text-slate-600">
            Monitor delinquent borrowers, accrue deterministic product-level late penalties, or execute audited loan restructurings and write-offs.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <InputField
            label="Evaluation Date"
            type="date"
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
          />
          <Button
            variant="outline"
            onClick={() => void loadOverdueLoans()}
            disabled={isLoading}
          >
            <RefreshCw className="mr-1.5 h-4 w-4" />
            Refresh
          </Button>
          {canEvaluateOverdue && (
            <Button
              variant="primary"
              onClick={() => void handleEvaluateDelinquency()}
              disabled={isEvaluating}
            >
              <Play className="mr-1.5 h-4 w-4" />
              {isEvaluating ? 'Running...' : 'Evaluate Grace & Penalties'}
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

      {statusBanner && (
        <div className="rounded-lg border border-teal-200 bg-teal-50/70 px-4 py-3 text-sm text-slate-800 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-flotech-teal shrink-0" />
          <span>{statusBanner}</span>
        </div>
      )}

      {selectedForRestructure && (
        <Card className="border-flotech-primary/40">
          <CardHeader>
            <CardTitle>
              Restructure Delinquent Loan: {selectedForRestructure.loan.loanNumber}
            </CardTitle>
            <CardDescription>
              Remaining Principal:{' '}
              {formatDecimalMoneyDisplay(
                selectedForRestructure.loan.principalOutstanding,
                selectedForRestructure.loan.currencyCode
              )}{' '}
              | Unpaid Penalty:{' '}
              {formatDecimalMoneyDisplay(
                selectedForRestructure.loan.penaltyOutstanding,
                selectedForRestructure.loan.currencyCode
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => void handleRestructureSubmit(e)} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <InputField
                  label="New Remaining Term (Installments)"
                  type="number"
                  min={1}
                  max={360}
                  required
                  value={newTermInstallments}
                  onChange={(e) => setNewTermInstallments(e.target.value)}
                />
                <InputField
                  label="New Nominal Interest Rate (%)"
                  type="text"
                  required
                  value={newNominalRatePercent}
                  onChange={(e) => setNewNominalRatePercent(e.target.value)}
                />
                <InputField
                  label="New First Repayment Date"
                  type="date"
                  required
                  value={newFirstRepaymentDate}
                  onChange={(e) => setNewFirstRepaymentDate(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="waivePenaltiesCheckbox"
                  type="checkbox"
                  checked={waiveUnpaidPenalties}
                  onChange={(e) => setWaiveUnpaidPenalties(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-flotech-primary focus:ring-flotech-primary"
                />
                <label
                  htmlFor="waivePenaltiesCheckbox"
                  className="text-sm font-medium text-slate-700"
                >
                  Waive unpaid late penalties ({selectedForRestructure.loan.penaltyOutstanding}) upon restructuring
                </label>
              </div>

              <InputField
                label="Restructuring Justification (Audited)"
                required
                placeholder="Explain borrower cashflow adjustment and credit committee approval..."
                value={restructureReason}
                onChange={(e) => setRestructureReason(e.target.value)}
              />

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSelectedForRestructure(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={isSubmittingRestructure}
                >
                  {isSubmittingRestructure
                    ? 'Rebuilding Schedule...'
                    : 'Confirm Restructure & Rebuild Schedule'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {selectedForWriteOff && (
        <Card className="border-red-300">
          <CardHeader>
            <CardTitle>
              Write Off Uncollectible Loan: {selectedForWriteOff.loan.loanNumber}
            </CardTitle>
            <CardDescription>
              Total Outstanding Exposure:{' '}
              {formatDecimalMoneyDisplay(
                selectedForWriteOff.loan.totalOutstanding,
                selectedForWriteOff.loan.currencyCode
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => void handleWriteOffSubmit(e)} className="space-y-4">
              <InputField
                label="Write-Off Authorization Reason (Immutable Audit Log)"
                required
                placeholder="Provide formal write-off resolution reference and recovery exhaustion details..."
                value={writeOffReason}
                onChange={(e) => setWriteOffReason(e.target.value)}
              />
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSelectedForWriteOff(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="danger"
                  disabled={isSubmittingWriteOff}
                >
                  {isSubmittingWriteOff ? 'Writing Off...' : 'Confirm Loan Write-Off'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Delinquent &amp; Past-Due Loans Queue</CardTitle>
            <CardDescription>
              Loans in OVERDUE status or with unpaid installments past their due date.
            </CardDescription>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-red-600">
            <AlertTriangle className="h-4 w-4" />
            <span>{overdueLoans.length} Delinquent Account(s)</span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <DataTableContainer>
            <DataTableHead>
              <tr>
                <DataTableHeaderCell>Delinquent Loan</DataTableHeaderCell>
                <DataTableHeaderCell>Customer Contact</DataTableHeaderCell>
                <DataTableHeaderCell>Days Past Due</DataTableHeaderCell>
                <DataTableHeaderCell className="text-right">Overdue Installment Sum</DataTableHeaderCell>
                <DataTableHeaderCell className="text-right">Total Loan Exposure</DataTableHeaderCell>
                <DataTableHeaderCell className="text-right">Resolution Actions</DataTableHeaderCell>
              </tr>
            </DataTableHead>
            <tbody>
              {overdueLoans.length === 0 ? (
                <DataTableRow>
                  <DataTableCell colSpan={6} className="py-8 text-center text-sm text-slate-500">
                    {isLoading
                      ? 'Evaluating delinquent loans from PostgreSQL...'
                      : 'No overdue loans found as of the selected evaluation date.'}
                  </DataTableCell>
                </DataTableRow>
              ) : (
                overdueLoans.map((row) => (
                  <DataTableRow key={row.loan.id}>
                    <DataTableCell>
                      <div className="font-mono text-xs font-semibold text-flotech-navy">
                        {row.loan.loanNumber}
                      </div>
                      <div className="text-xs text-slate-500">
                        {row.loan.loanProductName} ({row.loan.interestMethod})
                      </div>
                    </DataTableCell>
                    <DataTableCell>
                      <div className="font-medium text-flotech-navy">
                        {row.loan.customerFullName}
                      </div>
                      <div className="text-xs text-slate-500">
                        {row.loan.customerNumber} &bull; {row.customerPhoneNumber}
                      </div>
                    </DataTableCell>
                    <DataTableCell>
                      <Badge variant="danger">{row.maxDaysPastDue} DPD</Badge>
                      <div className="mt-1 text-xs text-slate-500">
                        {row.overdueInstallmentsCount} overdue inst. &bull; Since{' '}
                        {row.oldestOverdueDueDate ?? 'N/A'}
                      </div>
                    </DataTableCell>
                    <DataTableCell className="text-right font-mono text-xs">
                      <div className="font-bold text-red-600">
                        {formatDecimalMoneyDisplay(
                          row.totalOverdueAmount,
                          row.loan.currencyCode
                        )}
                      </div>
                      <div className="text-slate-500">
                        Penalty Bal:{' '}
                        {formatDecimalMoneyDisplay(
                          row.loan.penaltyOutstanding,
                          row.loan.currencyCode
                        )}
                      </div>
                    </DataTableCell>
                    <DataTableCell className="text-right font-mono text-xs">
                      <div className="font-semibold text-flotech-navy">
                        {formatDecimalMoneyDisplay(
                          row.loan.totalOutstanding,
                          row.loan.currencyCode
                        )}
                      </div>
                      <div className="text-slate-500">
                        Principal:{' '}
                        {formatDecimalMoneyDisplay(
                          row.loan.principalOutstanding,
                          row.loan.currencyCode
                        )}
                      </div>
                    </DataTableCell>
                    <DataTableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {canRestructure && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openRestructureModal(row)}
                          >
                            <RotateCcw className="mr-1 h-3.5 w-3.5" />
                            Restructure
                          </Button>
                        )}
                        {canWriteOff && (
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => {
                              setSelectedForWriteOff(row);
                              setWriteOffReason('');
                              setErrorMessage(null);
                            }}
                          >
                            <XCircle className="mr-1 h-3.5 w-3.5" />
                            Write Off
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
    </div>
  );
}
