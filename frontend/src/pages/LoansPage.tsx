import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LoanStatus,
  type CustomerDTO,
  type LoanDTO,
  type LoanProductDTO,
  type LoanSchedulePreviewSummary,
  type RepaymentScheduleInstallmentDTO,
} from '@flotech/shared';
import {
  Landmark,
  PlusCircle,
  RefreshCw,
  CheckCircle2,
  Eye,
  Send,
  ShieldCheck,
  XCircle,
  Banknote,
  Calculator,
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
  approveLoanApplicationApi,
  createLoanApplicationApi,
  disburseLoanApi,
  fetchCustomersApi,
  fetchLoanDetailsApi,
  fetchLoanProductsApi,
  fetchLoansApi,
  requestBackendLoanSchedulePreview,
  rejectLoanApplicationApi,
  reviewLoanApplicationApi,
  submitLoanApplicationApi,
} from '@/services/apiClient';

function getLoanStatusBadgeVariant(
  status: LoanStatus
): 'neutral' | 'primary' | 'teal' | 'success' | 'warning' | 'danger' {
  switch (status) {
    case LoanStatus.DRAFT:
      return 'neutral';
    case LoanStatus.SUBMITTED:
      return 'warning';
    case LoanStatus.UNDER_REVIEW:
      return 'teal';
    case LoanStatus.APPROVED:
      return 'primary';
    case LoanStatus.DISBURSED:
    case LoanStatus.ACTIVE:
      return 'success';
    case LoanStatus.OVERDUE:
    case LoanStatus.DEFAULTED:
    case LoanStatus.REJECTED:
    case LoanStatus.WRITTEN_OFF:
      return 'danger';
    case LoanStatus.RESTRUCTURED:
    case LoanStatus.CLOSED_PAID:
      return 'neutral';
  }
}

export function LoansPage() {
  const navigate = useNavigate();
  const { firebaseUser, activeBusinessId, activeBusinessProfile } = useAuthSession();

  const [loans, setLoans] = useState<LoanDTO[]>([]);
  const [customers, setCustomers] = useState<CustomerDTO[]>([]);
  const [products, setProducts] = useState<LoanProductDTO[]>([]);

  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isOriginatingLoan, setIsOriginatingLoan] = useState(false);

  // Origination Form State
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [principalAmount, setPrincipalAmount] = useState('5000.00');
  const [termInstallments, setTermInstallments] = useState('12');
  const [firstRepaymentDate, setFirstRepaymentDate] = useState('2026-12-15');
  const [purpose, setPurpose] = useState('Inventory expansion and working capital');
  const [submitImmediately, setSubmitImmediately] = useState(true);
  const [schedulePreview, setSchedulePreview] = useState<LoanSchedulePreviewSummary | null>(
    null
  );

  // Selected Loan Details Drawer
  const [selectedLoan, setSelectedLoan] = useState<LoanDTO | null>(null);
  const [selectedLoanSchedules, setSelectedLoanSchedules] = useState<
    RepaymentScheduleInstallmentDTO[]
  >([]);
  const [actionNotes, setActionNotes] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const currencyCode = activeBusinessProfile?.currencyCode ?? 'USD';

  const loadPortfolioData = useCallback(async () => {
    if (!firebaseUser || !activeBusinessId) {
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const idToken = await firebaseUser.getIdToken();
      const appCheckToken = await getActiveAppCheckToken();

      const [loansRes, custRes, prodRes] = await Promise.all([
        fetchLoansApi(idToken, appCheckToken, activeBusinessId, {
          status: statusFilter !== 'ALL' ? (statusFilter as LoanStatus) : undefined,
          q: searchQuery.trim() || undefined,
        }),
        fetchCustomersApi(idToken, appCheckToken, activeBusinessId, {
          includeArchived: false,
        }),
        fetchLoanProductsApi(idToken, appCheckToken, activeBusinessId, false),
      ]);

      if (loansRes.success) {
        setLoans(loansRes.data);
      } else {
        setErrorMessage(`${loansRes.error.code}: ${loansRes.error.message}`);
      }

      if (custRes.success) {
        setCustomers(custRes.data);
        if (!selectedCustomerId && custRes.data[0]) {
          setSelectedCustomerId(custRes.data[0].id);
        }
      }

      if (prodRes.success) {
        setProducts(prodRes.data);
        if (!selectedProductId && prodRes.data[0]) {
          setSelectedProductId(prodRes.data[0].id);
        }
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load loans.');
    } finally {
      setIsLoading(false);
    }
  }, [
    firebaseUser,
    activeBusinessId,
    statusFilter,
    searchQuery,
    selectedCustomerId,
    selectedProductId,
  ]);

  useEffect(() => {
    void loadPortfolioData();
  }, [loadPortfolioData]);

  async function handleCalculateBackendPreview() {
    const prod = products.find((p) => p.id === selectedProductId);
    if (!prod) return;
    setErrorMessage(null);

    const res = await requestBackendLoanSchedulePreview({
      principalAmount: principalAmount.trim(),
      nominalInterestRatePercent: prod.nominalInterestRatePercent,
      ratePeriod: prod.ratePeriod,
      interestMethod: prod.interestMethod,
      repaymentFrequency: prod.repaymentFrequency,
      termInstallments: Number(termInstallments),
      firstRepaymentDate,
    });

    if (res.success) {
      setSchedulePreview(res.data);
    } else {
      setErrorMessage(`${res.error.code}: ${res.error.message}`);
    }
  }

  async function handleCreateLoanSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!firebaseUser || !activeBusinessId) {
      setErrorMessage('Sign in and select an active business tenant first.');
      return;
    }

    setFeedbackMessage(null);
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const idToken = await firebaseUser.getIdToken();
      const appCheckToken = await getActiveAppCheckToken();

      const res = await createLoanApplicationApi(idToken, appCheckToken, activeBusinessId, {
        customerId: selectedCustomerId,
        loanProductId: selectedProductId,
        principalAmount: principalAmount.trim(),
        termInstallments: Number(termInstallments),
        firstRepaymentDate,
        purpose: purpose.trim() || null,
        submitImmediately,
      });

      if (!res.success) {
        setErrorMessage(`${res.error.code}: ${res.error.message}`);
        return;
      }

      setFeedbackMessage(
        `Originated loan ${res.data.loanNumber} (${res.data.status}) with total payable ${formatDecimalMoneyDisplay(res.data.totalPayableAmount, res.data.currencyCode)}.`
      );
      setIsOriginatingLoan(false);
      await loadPortfolioData();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to originate loan.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleInspectLoan(loanId: string) {
    if (!firebaseUser || !activeBusinessId) return;
    setErrorMessage(null);
    try {
      const idToken = await firebaseUser.getIdToken();
      const appCheckToken = await getActiveAppCheckToken();
      const res = await fetchLoanDetailsApi(idToken, appCheckToken, activeBusinessId, loanId);
      if (res.success) {
        setSelectedLoan(res.data.loan);
        setSelectedLoanSchedules(res.data.schedules);
      } else {
        setErrorMessage(`${res.error.code}: ${res.error.message}`);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load loan details.');
    }
  }

  async function handleLifecycleAction(
    action: 'SUBMIT' | 'REVIEW' | 'APPROVE' | 'REJECT' | 'DISBURSE'
  ) {
    if (!firebaseUser || !activeBusinessId || !selectedLoan) return;
    setFeedbackMessage(null);
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const idToken = await firebaseUser.getIdToken();
      const appCheckToken = await getActiveAppCheckToken();
      const payload = { notes: actionNotes.trim() || null };

      if (action === 'DISBURSE') {
        const res = await disburseLoanApi(
          idToken,
          appCheckToken,
          activeBusinessId,
          selectedLoan.id,
          payload
        );
        if (!res.success) {
          setErrorMessage(`${res.error.code}: ${res.error.message}`);
          return;
        }
        setSelectedLoan(res.data.loan);
        setSelectedLoanSchedules(res.data.schedules);
        setFeedbackMessage(
          `Loan ${res.data.loan.loanNumber} DISBURSED and ${res.data.schedules.length} repayment installments persisted in PostgreSQL.`
        );
      } else {
        const apiFn =
          action === 'SUBMIT'
            ? submitLoanApplicationApi
            : action === 'REVIEW'
              ? reviewLoanApplicationApi
              : action === 'APPROVE'
                ? approveLoanApplicationApi
                : rejectLoanApplicationApi;

        const res = await apiFn(
          idToken,
          appCheckToken,
          activeBusinessId,
          selectedLoan.id,
          payload
        );
        if (!res.success) {
          setErrorMessage(`${res.error.code}: ${res.error.message}`);
          return;
        }
        setSelectedLoan(res.data);
        setFeedbackMessage(
          `Loan ${res.data.loanNumber} transitioned to ${res.data.status}.`
        );
      }

      setActionNotes('');
      await loadPortfolioData();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Loan lifecycle action failed.');
    } finally {
      setIsSubmitting(false);
    }
  }

  const activeSelectedProduct = products.find((p) => p.id === selectedProductId);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="primary">PHASE 6 — LOAN ORIGINATION &amp; LIFECYCLE</Badge>
            {activeBusinessProfile && (
              <Badge variant="neutral">{activeBusinessProfile.businessCode}</Badge>
            )}
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-flotech-navy">
            Loans &amp; Underwriting Pipeline
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Originate borrower loans with backend-authoritative <code className="font-mono">Decimal.js</code> contracts, enforce dual-control approval, and disburse into active ledger schedules.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadPortfolioData()}
            disabled={isLoading}
          >
            <RefreshCw className="h-4 w-4" />
            {isLoading ? 'Refreshing...' : 'Refresh'}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsOriginatingLoan((prev) => !prev)}
          >
            <PlusCircle className="h-4 w-4" />
            {isOriginatingLoan ? 'Close Origination Form' : 'New Loan Application'}
          </Button>
        </div>
      </div>

      {feedbackMessage && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-900">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-flotech-success" />
          <span>{feedbackMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-flotech-danger">
          {errorMessage}
        </div>
      )}

      {!activeBusinessId ? (
        <Card>
          <CardHeader>
            <CardTitle>No Active Business Selected</CardTitle>
            <CardDescription>
              Sign in and select or onboard a business workspace to manage loans.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="primary" onClick={() => navigate('/app/business-profile')}>
              Go to Business Profile &amp; Onboarding
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {isOriginatingLoan && (
            <Card className="border-blue-200 bg-blue-50/20">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <PlusCircle className="h-5 w-5 text-flotech-primary" />
                  <CardTitle>Originate New Loan Application</CardTitle>
                </div>
                <CardDescription>
                  Financial totals (<code className="font-mono">total_interest_amount</code>, <code className="font-mono">total_fee_amount</code>, <code className="font-mono">total_payable_amount</code>) are computed exclusively on the backend using <code className="font-mono">Decimal.js</code>.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCreateLoanSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <SelectField
                      label="Borrower (Active Customers)"
                      value={selectedCustomerId}
                      onChange={(e) => setSelectedCustomerId(e.target.value)}
                      required
                    >
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.customerNumber} — {c.firstName} {c.lastName} ({c.riskTier})
                        </option>
                      ))}
                    </SelectField>

                    <SelectField
                      label="Loan Product"
                      value={selectedProductId}
                      onChange={(e) => setSelectedProductId(e.target.value)}
                      required
                    >
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.code} — {p.name} ({Number(p.nominalInterestRatePercent).toFixed(2)}%{' '}
                          {p.ratePeriod})
                        </option>
                      ))}
                    </SelectField>

                    <InputField
                      label={`Principal Amount (${currencyCode})`}
                      value={principalAmount}
                      onChange={(e) => setPrincipalAmount(e.target.value)}
                      helperText={
                        activeSelectedProduct
                          ? `Bounds: ${formatDecimalMoneyDisplay(activeSelectedProduct.minPrincipal, currencyCode)} – ${formatDecimalMoneyDisplay(activeSelectedProduct.maxPrincipal, currencyCode)}`
                          : undefined
                      }
                      required
                    />

                    <InputField
                      label="Term (Installments)"
                      type="number"
                      min={1}
                      max={360}
                      value={termInstallments}
                      onChange={(e) => setTermInstallments(e.target.value)}
                      helperText={
                        activeSelectedProduct
                          ? `Bounds: ${activeSelectedProduct.minTermInstallments}–${activeSelectedProduct.maxTermInstallments} (${activeSelectedProduct.repaymentFrequency})`
                          : undefined
                      }
                      required
                    />

                    <InputField
                      label="First Repayment Date"
                      type="date"
                      value={firstRepaymentDate}
                      onChange={(e) => setFirstRepaymentDate(e.target.value)}
                      required
                    />

                    <InputField
                      label="Loan Purpose"
                      value={purpose}
                      onChange={(e) => setPurpose(e.target.value)}
                      placeholder="Working capital / equipment purchase"
                    />
                  </div>

                  {schedulePreview && (
                    <div className="grid grid-cols-2 gap-3 rounded-lg border border-blue-200 bg-white p-3 sm:grid-cols-4">
                      <div>
                        <div className="text-[11px] font-semibold uppercase text-slate-500">
                          Principal
                        </div>
                        <div className="tabular-money text-sm font-bold text-flotech-navy">
                          {formatDecimalMoneyDisplay(schedulePreview.principalAmount, currencyCode)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] font-semibold uppercase text-slate-500">
                          Contracted Interest
                        </div>
                        <div className="tabular-money text-sm font-bold text-flotech-navy">
                          {formatDecimalMoneyDisplay(
                            schedulePreview.totalInterestAmount,
                            currencyCode
                          )}
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] font-semibold uppercase text-slate-500">
                          Origination Fees
                        </div>
                        <div className="tabular-money text-sm font-bold text-flotech-navy">
                          {formatDecimalMoneyDisplay(schedulePreview.totalFeeAmount, currencyCode)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] font-semibold uppercase text-slate-500">
                          Total Payable
                        </div>
                        <div className="tabular-money text-sm font-bold text-flotech-primary">
                          {formatDecimalMoneyDisplay(
                            schedulePreview.totalPayableAmount,
                            currencyCode
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                      <input
                        type="checkbox"
                        checked={submitImmediately}
                        onChange={(e) => setSubmitImmediately(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-flotech-primary"
                      />
                      Submit immediately for approval (<code className="font-mono">SUBMITTED</code>)
                    </label>

                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void handleCalculateBackendPreview()}
                      >
                        <Calculator className="h-4 w-4" />
                        Preview Backend Schedule
                      </Button>
                      <Button
                        type="submit"
                        variant="primary"
                        size="sm"
                        disabled={isSubmitting}
                      >
                        {isSubmitting ? 'Originating...' : 'Create Loan Application'}
                      </Button>
                    </div>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Filter Toolbar */}
          <Card>
            <CardContent className="pt-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-12 sm:items-end">
                <div className="sm:col-span-7">
                  <InputField
                    label="Search Loan Book"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by loan #, customer #, borrower name, or product code..."
                  />
                </div>
                <div className="sm:col-span-5">
                  <SelectField
                    label="Filter by Lifecycle Status"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    <option value="ALL">All Lifecycle Statuses</option>
                    <option value={LoanStatus.DRAFT}>DRAFT</option>
                    <option value={LoanStatus.SUBMITTED}>SUBMITTED</option>
                    <option value={LoanStatus.UNDER_REVIEW}>UNDER_REVIEW</option>
                    <option value={LoanStatus.APPROVED}>APPROVED</option>
                    <option value={LoanStatus.ACTIVE}>ACTIVE</option>
                    <option value={LoanStatus.OVERDUE}>OVERDUE</option>
                    <option value={LoanStatus.REJECTED}>REJECTED</option>
                    <option value={LoanStatus.CLOSED_PAID}>CLOSED_PAID</option>
                  </SelectField>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Loans Table */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Landmark className="h-5 w-5 text-flotech-primary" />
                  <CardTitle>Tenant Loan Portfolio ({loans.length})</CardTitle>
                </div>
                <Badge variant="neutral">{currencyCode} Ledger</Badge>
              </div>
              <CardDescription>
                Inspect any loan to review underwriting details, approve/reject, or disburse into active repayment schedules.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DataTableContainer>
                <DataTableHead>
                  <tr>
                    <DataTableHeaderCell>Loan #</DataTableHeaderCell>
                    <DataTableHeaderCell>Borrower</DataTableHeaderCell>
                    <DataTableHeaderCell>Product &amp; Term</DataTableHeaderCell>
                    <DataTableHeaderCell className="text-right">Principal</DataTableHeaderCell>
                    <DataTableHeaderCell className="text-right">Total Payable</DataTableHeaderCell>
                    <DataTableHeaderCell className="text-right">Outstanding</DataTableHeaderCell>
                    <DataTableHeaderCell>Status</DataTableHeaderCell>
                    <DataTableHeaderCell className="text-right">Actions</DataTableHeaderCell>
                  </tr>
                </DataTableHead>
                <tbody className="divide-y divide-slate-200">
                  {loans.map((loan) => (
                    <DataTableRow key={loan.id}>
                      <DataTableCell className="tabular-money font-bold text-flotech-navy">
                        {loan.loanNumber}
                        <div className="text-[11px] font-normal text-slate-400">
                          {loan.applicationDate}
                        </div>
                      </DataTableCell>
                      <DataTableCell>
                        <div className="font-semibold text-flotech-navy">
                          {loan.customerFullName}
                        </div>
                        <div className="font-mono text-xs text-slate-500">
                          {loan.customerNumber}
                        </div>
                      </DataTableCell>
                      <DataTableCell>
                        <div className="font-mono text-xs font-semibold text-flotech-primary">
                          {loan.loanProductCode}
                        </div>
                        <div className="text-xs text-slate-600">
                          {loan.termInstallments} × {loan.repaymentFrequency}
                        </div>
                      </DataTableCell>
                      <DataTableCell className="tabular-money text-right font-medium text-slate-800">
                        {formatDecimalMoneyDisplay(loan.principalAmount, loan.currencyCode)}
                      </DataTableCell>
                      <DataTableCell className="tabular-money text-right font-medium text-slate-800">
                        {formatDecimalMoneyDisplay(loan.totalPayableAmount, loan.currencyCode)}
                      </DataTableCell>
                      <DataTableCell className="tabular-money text-right font-bold text-flotech-navy">
                        {formatDecimalMoneyDisplay(loan.totalOutstanding, loan.currencyCode)}
                      </DataTableCell>
                      <DataTableCell>
                        <Badge variant={getLoanStatusBadgeVariant(loan.status)}>
                          {loan.status}
                        </Badge>
                      </DataTableCell>
                      <DataTableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void handleInspectLoan(loan.id)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Manage Loan
                        </Button>
                      </DataTableCell>
                    </DataTableRow>
                  ))}
                  {loans.length === 0 && (
                    <DataTableRow>
                      <DataTableCell className="py-8 text-center text-slate-500" colSpan={8}>
                        No loans match the current filter criteria.
                      </DataTableCell>
                    </DataTableRow>
                  )}
                </tbody>
              </DataTableContainer>
            </CardContent>
          </Card>

          {/* Selected Loan Lifecycle & Schedule Inspector */}
          {selectedLoan && (
            <Card className="border-slate-300">
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle>
                        Loan Contract: {selectedLoan.loanNumber}
                      </CardTitle>
                      <Badge variant={getLoanStatusBadgeVariant(selectedLoan.status)}>
                        {selectedLoan.status}
                      </Badge>
                    </div>
                    <CardDescription>
                      Borrower: {selectedLoan.customerFullName} ({selectedLoan.customerNumber}) • Product:{' '}
                      {selectedLoan.loanProductName} ({selectedLoan.loanProductCode})
                    </CardDescription>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {selectedLoan.status === LoanStatus.DRAFT && (
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={isSubmitting}
                        onClick={() => void handleLifecycleAction('SUBMIT')}
                      >
                        <Send className="h-3.5 w-3.5" />
                        Submit for Approval
                      </Button>
                    )}

                    {selectedLoan.status === LoanStatus.SUBMITTED && (
                      <Button
                        size="sm"
                        variant="teal"
                        disabled={isSubmitting}
                        onClick={() => void handleLifecycleAction('REVIEW')}
                      >
                        Start Underwriting Review
                      </Button>
                    )}

                    {(selectedLoan.status === LoanStatus.SUBMITTED ||
                      selectedLoan.status === LoanStatus.UNDER_REVIEW) && (
                      <>
                        <Button
                          size="sm"
                          variant="success"
                          disabled={isSubmitting}
                          onClick={() => void handleLifecycleAction('APPROVE')}
                        >
                          <ShieldCheck className="h-3.5 w-3.5" />
                          Approve Loan
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={isSubmitting}
                          onClick={() => void handleLifecycleAction('REJECT')}
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Reject Loan
                        </Button>
                      </>
                    )}

                    {selectedLoan.status === LoanStatus.APPROVED && (
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={isSubmitting}
                        onClick={() => void handleLifecycleAction('DISBURSE')}
                      >
                        <Banknote className="h-3.5 w-3.5" />
                        Disburse &amp; Generate Schedule
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div>
                    <div className="text-xs text-slate-500">Contracted Principal</div>
                    <div className="tabular-money font-bold text-flotech-navy">
                      {formatDecimalMoneyDisplay(
                        selectedLoan.principalAmount,
                        selectedLoan.currencyCode
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Contracted Interest</div>
                    <div className="tabular-money font-bold text-flotech-navy">
                      {formatDecimalMoneyDisplay(
                        selectedLoan.totalInterestAmount,
                        selectedLoan.currencyCode
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Origination Fee</div>
                    <div className="tabular-money font-bold text-flotech-navy">
                      {formatDecimalMoneyDisplay(
                        selectedLoan.totalFeeAmount,
                        selectedLoan.currencyCode
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Total Outstanding Balance</div>
                    <div className="tabular-money font-bold text-flotech-primary">
                      {formatDecimalMoneyDisplay(
                        selectedLoan.totalOutstanding,
                        selectedLoan.currencyCode
                      )}
                    </div>
                  </div>
                </div>

                <InputField
                  label="Underwriting / Lifecycle Audit Notes (Optional)"
                  value={actionNotes}
                  onChange={(e) => setActionNotes(e.target.value)}
                  placeholder="Enter decision notes recorded in PostgreSQL audit_logs..."
                />

                {selectedLoanSchedules.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-bold text-flotech-navy">
                      Persisted PostgreSQL Repayment Schedule ({selectedLoanSchedules.length}{' '}
                      Installments)
                    </h3>
                    <DataTableContainer>
                      <DataTableHead>
                        <tr>
                          <DataTableHeaderCell>#</DataTableHeaderCell>
                          <DataTableHeaderCell>Due Date</DataTableHeaderCell>
                          <DataTableHeaderCell className="text-right">
                            Opening Principal
                          </DataTableHeaderCell>
                          <DataTableHeaderCell className="text-right">
                            Principal Due
                          </DataTableHeaderCell>
                          <DataTableHeaderCell className="text-right">
                            Interest Due
                          </DataTableHeaderCell>
                          <DataTableHeaderCell className="text-right">Fee Due</DataTableHeaderCell>
                          <DataTableHeaderCell className="text-right">
                            Total Due
                          </DataTableHeaderCell>
                          <DataTableHeaderCell>Status</DataTableHeaderCell>
                        </tr>
                      </DataTableHead>
                      <tbody className="divide-y divide-slate-200">
                        {selectedLoanSchedules.map((inst) => (
                          <DataTableRow key={inst.id}>
                            <DataTableCell className="tabular-money font-semibold">
                              {inst.installmentNumber}
                            </DataTableCell>
                            <DataTableCell className="font-mono text-xs">
                              {inst.dueDate}
                            </DataTableCell>
                            <DataTableCell className="tabular-money text-right">
                              {formatDecimalMoneyDisplay(
                                inst.openingPrincipalBalance,
                                selectedLoan.currencyCode
                              )}
                            </DataTableCell>
                            <DataTableCell className="tabular-money text-right">
                              {formatDecimalMoneyDisplay(
                                inst.principalDue,
                                selectedLoan.currencyCode
                              )}
                            </DataTableCell>
                            <DataTableCell className="tabular-money text-right">
                              {formatDecimalMoneyDisplay(
                                inst.interestDue,
                                selectedLoan.currencyCode
                              )}
                            </DataTableCell>
                            <DataTableCell className="tabular-money text-right">
                              {formatDecimalMoneyDisplay(inst.feeDue, selectedLoan.currencyCode)}
                            </DataTableCell>
                            <DataTableCell className="tabular-money text-right font-bold text-flotech-navy">
                              {formatDecimalMoneyDisplay(inst.totalDue, selectedLoan.currencyCode)}
                            </DataTableCell>
                            <DataTableCell>
                              <Badge variant="primary">{inst.status}</Badge>
                            </DataTableCell>
                          </DataTableRow>
                        ))}
                      </tbody>
                    </DataTableContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
