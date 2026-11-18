import React, { useCallback, useEffect, useState } from 'react';
import {
  LoanStatus,
  PermissionCode,
  RepaymentMethod,
  type LoanDTO,
  type RepaymentDetailsResponseDTO,
  type RepaymentDTO,
} from '@flotech/shared';
import {
  CheckCircle2,
  Eye,
  PlusCircle,
  Printer,
  Receipt,
  RefreshCw,
  RotateCcw,
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
  fetchLoansApi,
  fetchRepaymentDetailsApi,
  fetchRepaymentsApi,
  recordRepaymentApi,
  reverseRepaymentApi,
} from '@/services/apiClient';

export function RepaymentsPage(): React.ReactElement {
  const { firebaseUser, activeBusinessId, activeTenantMembership } = useAuthSession();

  const [repayments, setRepayments] = useState<RepaymentDTO[]>([]);
  const [eligibleLoans, setEligibleLoans] = useState<LoanDTO[]>([]);
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>('ALL');
  const [includeReversed, setIncludeReversed] = useState<boolean>(true);

  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [selectedLoanId, setSelectedLoanId] = useState<string>('');
  const [amountReceived, setAmountReceived] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<RepaymentMethod>(
    RepaymentMethod.BANK_TRANSFER
  );
  const [externalTransactionRef, setExternalTransactionRef] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isSubmittingRepayment, setIsSubmittingRepayment] = useState<boolean>(false);

  const [selectedDetails, setSelectedDetails] =
    useState<RepaymentDetailsResponseDTO | null>(null);
  const [reversalReason, setReversalReason] = useState<string>('');
  const [isReversing, setIsReversing] = useState<boolean>(false);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  const permissions = activeTenantMembership?.permissions ?? [];
  const canRecordRepayment = permissions.includes(PermissionCode.REPAYMENTS_RECORD);
  const canReverseRepayment = permissions.includes(PermissionCode.REPAYMENTS_REVERSE);

  const loadRepaymentsAndLoans = useCallback(async () => {
    if (!firebaseUser || !activeBusinessId) return;
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const idToken = await firebaseUser.getIdToken();
      const appCheckToken = await getActiveAppCheckToken();

      const [repRes, loansRes] = await Promise.all([
        fetchRepaymentsApi(idToken, appCheckToken, activeBusinessId, {
          paymentMethod:
            paymentMethodFilter !== 'ALL'
              ? (paymentMethodFilter as RepaymentMethod)
              : undefined,
          includeReversed,
        }),
        fetchLoansApi(idToken, appCheckToken, activeBusinessId),
      ]);

      if (!repRes.success) {
        setErrorMessage(`${repRes.error.code}: ${repRes.error.message}`);
        return;
      }
      setRepayments(repRes.data);

      if (loansRes.success) {
        const payableLoans = loansRes.data.filter(
          (l) =>
            l.status === LoanStatus.ACTIVE ||
            l.status === LoanStatus.OVERDUE ||
            l.status === LoanStatus.RESTRUCTURED ||
            l.status === LoanStatus.DEFAULTED
        );
        setEligibleLoans(payableLoans);
        if (!selectedLoanId && payableLoans[0]) {
          setSelectedLoanId(payableLoans[0].id);
        }
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to load repayments ledger.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [firebaseUser, activeBusinessId, paymentMethodFilter, includeReversed, selectedLoanId]);

  useEffect(() => {
    void loadRepaymentsAndLoans();
  }, [loadRepaymentsAndLoans]);

  const handleRecordRepayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !activeBusinessId || !selectedLoanId) return;

    setIsSubmittingRepayment(true);
    setErrorMessage(null);
    setStatusBanner(null);

    try {
      const idToken = await firebaseUser.getIdToken();
      const appCheckToken = await getActiveAppCheckToken();

      const res = await recordRepaymentApi(idToken, appCheckToken, activeBusinessId, {
        loanId: selectedLoanId,
        amountReceived: amountReceived.trim(),
        paymentMethod,
        externalTransactionRef: externalTransactionRef.trim() || null,
        notes: notes.trim() || null,
      });

      if (!res.success) {
        setErrorMessage(`${res.error.code}: ${res.error.message}`);
        return;
      }

      setStatusBanner(
        `Repayment ${res.data.repayment.referenceNumber} recorded with Receipt ${res.data.receipt?.receiptNumber ?? ''}. Remaining loan balance: ${formatDecimalMoneyDisplay(res.data.loan.totalOutstanding, res.data.loan.currencyCode)}.`
      );
      setSelectedDetails(res.data);
      setIsRecording(false);
      setAmountReceived('');
      setExternalTransactionRef('');
      setNotes('');
      await loadRepaymentsAndLoans();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to record repayment.'
      );
    } finally {
      setIsSubmittingRepayment(false);
    }
  };

  const handleInspectRepayment = async (repaymentId: string) => {
    if (!firebaseUser || !activeBusinessId) return;
    setErrorMessage(null);

    try {
      const idToken = await firebaseUser.getIdToken();
      const appCheckToken = await getActiveAppCheckToken();

      const res = await fetchRepaymentDetailsApi(
        idToken,
        appCheckToken,
        activeBusinessId,
        repaymentId
      );
      if (!res.success) {
        setErrorMessage(`${res.error.code}: ${res.error.message}`);
        return;
      }
      setSelectedDetails(res.data);
      setReversalReason('');
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to fetch repayment receipt.'
      );
    }
  };

  const handleReverseRepayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !activeBusinessId || !selectedDetails) return;

    setIsReversing(true);
    setErrorMessage(null);

    try {
      const idToken = await firebaseUser.getIdToken();
      const appCheckToken = await getActiveAppCheckToken();

      const res = await reverseRepaymentApi(
        idToken,
        appCheckToken,
        activeBusinessId,
        selectedDetails.repayment.id,
        {
          reversalReason: reversalReason.trim(),
        }
      );

      if (!res.success) {
        setErrorMessage(`${res.error.code}: ${res.error.message}`);
        return;
      }

      setStatusBanner(
        `Repayment ${res.data.repayment.referenceNumber} has been reversed and schedule/loan balances restored.`
      );
      setSelectedDetails(res.data);
      setReversalReason('');
      await loadRepaymentsAndLoans();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to reverse repayment.'
      );
    } finally {
      setIsReversing(false);
    }
  };

  const activeRepayments = repayments.filter((r) => !r.isReversed);
  const reversedRepayments = repayments.filter((r) => r.isReversed);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="success">PHASE 8 — REPAYMENTS &amp; RECEIPTS</Badge>
            <span className="text-xs font-mono text-slate-500">
              Waterfall: Penalty &rarr; Fee &rarr; Interest &rarr; Principal
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-flotech-navy">
            Repayment Ledger &amp; Official Receipts
          </h1>
          <p className="text-sm text-slate-600">
            Record borrower collections with automatic ACID waterfall allocation across installments, inspect official receipts, and execute audited reversals.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => void loadRepaymentsAndLoans()}
            disabled={isLoading}
          >
            <RefreshCw className="mr-1.5 h-4 w-4" />
            Refresh
          </Button>
          {canRecordRepayment && (
            <Button
              variant="primary"
              onClick={() => {
                setIsRecording((prev) => !prev);
                setErrorMessage(null);
              }}
            >
              <PlusCircle className="mr-1.5 h-4 w-4" />
              {isRecording ? 'Close Payment Form' : 'Record Repayment'}
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

      {isRecording && (
        <Card className="border-flotech-primary/40">
          <CardHeader>
            <CardTitle>Record Borrower Repayment (Waterfall Engine)</CardTitle>
            <CardDescription>
              The backend Decimal.js engine automatically allocates payments across unpaid installments in strict order: Penalty &rarr; Fee &rarr; Interest &rarr; Principal.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => void handleRecordRepayment(e)} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                <SelectField
                  label="Select Active / Overdue Loan"
                  value={selectedLoanId}
                  onChange={(e) => setSelectedLoanId(e.target.value)}
                >
                  <option value="">-- Select Loan --</option>
                  {eligibleLoans.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.loanNumber} — {l.customerFullName} (Bal:{' '}
                      {formatDecimalMoneyDisplay(l.totalOutstanding, l.currencyCode)})
                    </option>
                  ))}
                </SelectField>

                <InputField
                  label="Amount Received (Decimal)"
                  type="text"
                  required
                  placeholder="e.g. 550.00"
                  value={amountReceived}
                  onChange={(e) => setAmountReceived(e.target.value)}
                />

                <SelectField
                  label="Payment Method"
                  value={paymentMethod}
                  onChange={(e) =>
                    setPaymentMethod(e.target.value as RepaymentMethod)
                  }
                >
                  <option value={RepaymentMethod.BANK_TRANSFER}>BANK_TRANSFER</option>
                  <option value={RepaymentMethod.MOBILE_MONEY}>MOBILE_MONEY</option>
                  <option value={RepaymentMethod.CASH}>CASH</option>
                  <option value={RepaymentMethod.CARD}>CARD</option>
                  <option value={RepaymentMethod.CHEQUE}>CHEQUE</option>
                </SelectField>

                <InputField
                  label="External Transaction Reference"
                  type="text"
                  placeholder="e.g. TXN-994821"
                  value={externalTransactionRef}
                  onChange={(e) => setExternalTransactionRef(e.target.value)}
                />
              </div>

              <InputField
                label="Collection Notes (Optional)"
                type="text"
                placeholder="Cashier counter or mobile money confirmation note..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsRecording(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={isSubmittingRepayment || !selectedLoanId}
                >
                  {isSubmittingRepayment
                    ? 'Allocating & Issuing Receipt...'
                    : 'Post Repayment & Issue Receipt'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {selectedDetails && (
        <Card className="border-flotech-teal/40">
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Receipt className="h-4 w-4 text-flotech-teal" />
                <CardTitle>
                  Official Payment Receipt:{' '}
                  {selectedDetails.receipt?.receiptNumber ??
                    selectedDetails.repayment.referenceNumber}
                </CardTitle>
                <Badge
                  variant={
                    selectedDetails.repayment.isReversed ? 'danger' : 'success'
                  }
                >
                  {selectedDetails.repayment.isReversed ? 'REVERSED' : 'VALID RECEIPT'}
                </Badge>
              </div>
              <CardDescription>
                Borrower: {selectedDetails.repayment.customerFullName} (
                {selectedDetails.repayment.customerNumber}) &bull; Loan:{' '}
                {selectedDetails.repayment.loanNumber} &bull; Recorded by:{' '}
                {selectedDetails.repayment.recordedByFullName}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => window.print()}
              >
                <Printer className="mr-1.5 h-3.5 w-3.5" />
                Print Receipt
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSelectedDetails(null)}
              >
                Close
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-6 rounded-lg bg-slate-50 p-4 border border-slate-200 font-mono text-xs">
              <div>
                <div className="text-slate-500">Amount Received</div>
                <div className="mt-0.5 font-bold text-flotech-navy">
                  {formatDecimalMoneyDisplay(
                    selectedDetails.repayment.amountReceived,
                    selectedDetails.repayment.currencyCode
                  )}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Allocated Penalty</div>
                <div className="mt-0.5 font-semibold text-red-600">
                  {formatDecimalMoneyDisplay(
                    selectedDetails.repayment.allocatedPenalty,
                    selectedDetails.repayment.currencyCode
                  )}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Allocated Fee</div>
                <div className="mt-0.5 font-semibold text-slate-700">
                  {formatDecimalMoneyDisplay(
                    selectedDetails.repayment.allocatedFee,
                    selectedDetails.repayment.currencyCode
                  )}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Allocated Interest</div>
                <div className="mt-0.5 font-semibold text-flotech-primary">
                  {formatDecimalMoneyDisplay(
                    selectedDetails.repayment.allocatedInterest,
                    selectedDetails.repayment.currencyCode
                  )}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Allocated Principal</div>
                <div className="mt-0.5 font-semibold text-emerald-700">
                  {formatDecimalMoneyDisplay(
                    selectedDetails.repayment.allocatedPrincipal,
                    selectedDetails.repayment.currencyCode
                  )}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Overpayment Credit</div>
                <div className="mt-0.5 font-semibold text-flotech-teal">
                  {formatDecimalMoneyDisplay(
                    selectedDetails.repayment.overpaymentCredit,
                    selectedDetails.repayment.currencyCode
                  )}
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                Installment Waterfall Allocation Breakdown
              </h4>
              <DataTableContainer>
                <DataTableHead>
                  <tr>
                    <DataTableHeaderCell>Installment</DataTableHeaderCell>
                    <DataTableHeaderCell>Due Date</DataTableHeaderCell>
                    <DataTableHeaderCell className="text-right">Penalty</DataTableHeaderCell>
                    <DataTableHeaderCell className="text-right">Fee</DataTableHeaderCell>
                    <DataTableHeaderCell className="text-right">Interest</DataTableHeaderCell>
                    <DataTableHeaderCell className="text-right">Principal</DataTableHeaderCell>
                    <DataTableHeaderCell className="text-right">Total Allocated</DataTableHeaderCell>
                  </tr>
                </DataTableHead>
                <tbody>
                  {selectedDetails.allocations.map((a) => (
                    <DataTableRow key={a.id}>
                      <DataTableCell className="font-mono text-xs">
                        Installment #{a.installmentNumber}
                      </DataTableCell>
                      <DataTableCell className="font-mono text-xs">{a.dueDate}</DataTableCell>
                      <DataTableCell className="text-right font-mono text-xs">
                        {formatDecimalMoneyDisplay(
                          a.penaltyAllocated,
                          selectedDetails.repayment.currencyCode
                        )}
                      </DataTableCell>
                      <DataTableCell className="text-right font-mono text-xs">
                        {formatDecimalMoneyDisplay(
                          a.feeAllocated,
                          selectedDetails.repayment.currencyCode
                        )}
                      </DataTableCell>
                      <DataTableCell className="text-right font-mono text-xs">
                        {formatDecimalMoneyDisplay(
                          a.interestAllocated,
                          selectedDetails.repayment.currencyCode
                        )}
                      </DataTableCell>
                      <DataTableCell className="text-right font-mono text-xs">
                        {formatDecimalMoneyDisplay(
                          a.principalAllocated,
                          selectedDetails.repayment.currencyCode
                        )}
                      </DataTableCell>
                      <DataTableCell className="text-right font-mono text-xs font-semibold text-flotech-navy">
                        {formatDecimalMoneyDisplay(
                          a.totalAllocated,
                          selectedDetails.repayment.currencyCode
                        )}
                      </DataTableCell>
                    </DataTableRow>
                  ))}
                </tbody>
              </DataTableContainer>
            </div>

            {canReverseRepayment && !selectedDetails.repayment.isReversed && (
              <form
                onSubmit={(e) => void handleReverseRepayment(e)}
                className="flex flex-col gap-3 sm:flex-row sm:items-end border-t border-slate-200 pt-4"
              >
                <div className="flex-1">
                  <InputField
                    label="Reverse Repayment (Audited — Restores Installment & Loan Balances)"
                    required
                    placeholder="Enter formal reversal justification (e.g., dishonored cheque or duplicate posting)..."
                    value={reversalReason}
                    onChange={(e) => setReversalReason(e.target.value)}
                  />
                </div>
                <Button type="submit" variant="danger" disabled={isReversing}>
                  <RotateCcw className="mr-1.5 h-4 w-4" />
                  {isReversing ? 'Reversing...' : 'Reverse Repayment'}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Valid Repayments Posted
            </div>
            <div className="mt-1 text-2xl font-bold text-emerald-600">
              {activeRepayments.length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Reversed Transactions
            </div>
            <div className="mt-1 text-2xl font-bold text-red-600">
              {reversedRepayments.length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Payable Active / Overdue Loans
            </div>
            <div className="mt-1 text-2xl font-bold text-flotech-primary">
              {eligibleLoans.length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Repayments &amp; Receipts Ledger</CardTitle>
            <CardDescription>
              All collections are verified by the PostgreSQL constraint chk_repayment_allocation_sum.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <SelectField
              label=""
              value={paymentMethodFilter}
              onChange={(e) => setPaymentMethodFilter(e.target.value)}
            >
              <option value="ALL">All Payment Methods</option>
              <option value={RepaymentMethod.BANK_TRANSFER}>BANK_TRANSFER</option>
              <option value={RepaymentMethod.MOBILE_MONEY}>MOBILE_MONEY</option>
              <option value={RepaymentMethod.CASH}>CASH</option>
              <option value={RepaymentMethod.CARD}>CARD</option>
              <option value={RepaymentMethod.CHEQUE}>CHEQUE</option>
            </SelectField>
            <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={includeReversed}
                onChange={(e) => setIncludeReversed(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-flotech-primary"
              />
              <span>Include Reversed</span>
            </label>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <DataTableContainer>
            <DataTableHead>
              <tr>
                <DataTableHeaderCell>Reference &amp; Receipt</DataTableHeaderCell>
                <DataTableHeaderCell>Loan &amp; Customer</DataTableHeaderCell>
                <DataTableHeaderCell>Method &amp; Date</DataTableHeaderCell>
                <DataTableHeaderCell>Status</DataTableHeaderCell>
                <DataTableHeaderCell className="text-right">Amount Received</DataTableHeaderCell>
                <DataTableHeaderCell className="text-right">Waterfall Breakdown</DataTableHeaderCell>
                <DataTableHeaderCell className="text-right">Actions</DataTableHeaderCell>
              </tr>
            </DataTableHead>
            <tbody>
              {repayments.length === 0 ? (
                <DataTableRow>
                  <DataTableCell colSpan={7} className="py-8 text-center text-sm text-slate-500">
                    {isLoading
                      ? 'Loading repayments from PostgreSQL...'
                      : 'No repayments recorded yet.'}
                  </DataTableCell>
                </DataTableRow>
              ) : (
                repayments.map((r) => (
                  <DataTableRow key={r.id}>
                    <DataTableCell>
                      <div className="font-mono text-xs font-semibold text-flotech-navy">
                        {r.referenceNumber}
                      </div>
                      <div className="font-mono text-xs text-flotech-teal">
                        Receipt: {r.receiptNumber ?? 'N/A'}
                      </div>
                    </DataTableCell>
                    <DataTableCell>
                      <div className="font-medium text-flotech-navy">{r.customerFullName}</div>
                      <div className="text-xs text-slate-500">
                        {r.loanNumber} &bull; {r.customerNumber}
                      </div>
                    </DataTableCell>
                    <DataTableCell>
                      <Badge variant="neutral">{r.paymentMethod}</Badge>
                      <div className="mt-1 text-xs text-slate-500">
                        {r.paidAt.slice(0, 10)}
                      </div>
                    </DataTableCell>
                    <DataTableCell>
                      <Badge variant={r.isReversed ? 'danger' : 'success'}>
                        {r.isReversed ? 'REVERSED' : 'POSTED'}
                      </Badge>
                    </DataTableCell>
                    <DataTableCell className="text-right font-mono text-xs font-bold text-flotech-navy">
                      {formatDecimalMoneyDisplay(r.amountReceived, r.currencyCode)}
                    </DataTableCell>
                    <DataTableCell className="text-right font-mono text-xs">
                      <div className="text-emerald-700">
                        P: {formatDecimalMoneyDisplay(r.allocatedPrincipal, r.currencyCode)} | I:{' '}
                        {formatDecimalMoneyDisplay(r.allocatedInterest, r.currencyCode)}
                      </div>
                      <div className="text-slate-500">
                        Fee: {formatDecimalMoneyDisplay(r.allocatedFee, r.currencyCode)} | Pen:{' '}
                        {formatDecimalMoneyDisplay(r.allocatedPenalty, r.currencyCode)}
                      </div>
                    </DataTableCell>
                    <DataTableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void handleInspectRepayment(r.id)}
                      >
                        <Eye className="mr-1 h-3.5 w-3.5" />
                        Receipt
                      </Button>
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
