import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  InterestCalculationMethod,
  RepaymentFrequency,
  type InterestRatePeriod,
  type LoanProductDTO,
} from '@flotech/shared';
import {
  Briefcase,
  PlusCircle,
  RefreshCw,
  CheckCircle2,
  Power,
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
  createLoanProductApi,
  fetchLoanProductsApi,
  updateLoanProductApi,
} from '@/services/apiClient';

export function LoanProductsPage() {
  const navigate = useNavigate();
  const { firebaseUser, activeBusinessId, activeBusinessProfile } = useAuthSession();

  const [products, setProducts] = useState<LoanProductDTO[]>([]);
  const [isCreatingProduct, setIsCreatingProduct] = useState(false);

  // Create Product Form State
  const [code, setCode] = useState('SME-GROWTH-12M');
  const [name, setName] = useState('SME Working Capital Facility');
  const [description, setDescription] = useState(
    'Short-to-medium term working capital loan for verified SMEs and merchants.'
  );
  const [interestMethod, setInterestMethod] = useState<InterestCalculationMethod>(
    InterestCalculationMethod.DECLINING_BALANCE_EQUAL_INSTALLMENTS
  );
  const [repaymentFrequency, setRepaymentFrequency] = useState<RepaymentFrequency>(
    RepaymentFrequency.MONTHLY
  );
  const [nominalInterestRatePercent, setNominalInterestRatePercent] = useState('18.000000');
  const [ratePeriod, setRatePeriod] = useState<InterestRatePeriod>('PER_ANNUM');
  const [minPrincipal, setMinPrincipal] = useState('500.00');
  const [maxPrincipal, setMaxPrincipal] = useState('50000.00');
  const [minTermInstallments, setMinTermInstallments] = useState('3');
  const [maxTermInstallments, setMaxTermInstallments] = useState('24');
  const [originationFeeFixed, setOriginationFeeFixed] = useState('25.00');
  const [originationFeePercent, setOriginationFeePercent] = useState('1.000000');
  const [latePenaltyRatePercent, setLatePenaltyRatePercent] = useState('2.000000');
  const [gracePeriodDays, setGracePeriodDays] = useState('3');

  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const currencyCode = activeBusinessProfile?.currencyCode ?? 'USD';

  const loadProducts = useCallback(async () => {
    if (!firebaseUser || !activeBusinessId) {
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const idToken = await firebaseUser.getIdToken();
      const appCheckToken = await getActiveAppCheckToken();

      const res = await fetchLoanProductsApi(idToken, appCheckToken, activeBusinessId, true);
      if (res.success) {
        setProducts(res.data);
      } else {
        setErrorMessage(`${res.error.code}: ${res.error.message}`);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load loan products.');
    } finally {
      setIsLoading(false);
    }
  }, [firebaseUser, activeBusinessId]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  async function handleCreateProductSubmit(e: React.FormEvent) {
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

      const res = await createLoanProductApi(idToken, appCheckToken, activeBusinessId, {
        code: code.trim().toUpperCase(),
        name: name.trim(),
        description: description.trim() || null,
        interestMethod,
        repaymentFrequency,
        nominalInterestRatePercent: nominalInterestRatePercent.trim(),
        ratePeriod,
        minPrincipal: minPrincipal.trim(),
        maxPrincipal: maxPrincipal.trim(),
        minTermInstallments: Number(minTermInstallments),
        maxTermInstallments: Number(maxTermInstallments),
        originationFeeFixed: originationFeeFixed.trim() || '0.0000',
        originationFeePercent: originationFeePercent.trim() || '0.000000',
        latePenaltyRatePercent: latePenaltyRatePercent.trim() || '0.000000',
        gracePeriodDays: Number(gracePeriodDays) || 0,
        isActive: true,
      });

      if (!res.success) {
        setErrorMessage(`${res.error.code}: ${res.error.message}`);
        return;
      }

      setFeedbackMessage(
        `Loan product "${res.data.name}" (${res.data.code}) created in PostgreSQL.`
      );
      setIsCreatingProduct(false);
      await loadProducts();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to create loan product.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleToggleProductActive(product: LoanProductDTO) {
    if (!firebaseUser || !activeBusinessId) return;
    setFeedbackMessage(null);
    setErrorMessage(null);

    try {
      const idToken = await firebaseUser.getIdToken();
      const appCheckToken = await getActiveAppCheckToken();

      const res = await updateLoanProductApi(
        idToken,
        appCheckToken,
        activeBusinessId,
        product.id,
        { isActive: !product.isActive }
      );

      if (!res.success) {
        setErrorMessage(`${res.error.code}: ${res.error.message}`);
        return;
      }

      setFeedbackMessage(
        `Loan product ${res.data.code} is now ${res.data.isActive ? 'ACTIVE' : 'INACTIVE'}.`
      );
      await loadProducts();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to update loan product.');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="primary">PHASE 6 — LOAN PRODUCTS CATALOG</Badge>
            {activeBusinessProfile && (
              <Badge variant="neutral">{activeBusinessProfile.businessCode}</Badge>
            )}
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-flotech-navy">
            Loan Products &amp; Credit Terms
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Configure interest calculation methodologies, principal &amp; installment bounds, origination fees, and grace periods enforced during loan origination.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadProducts()}
            disabled={isLoading}
          >
            <RefreshCw className="h-4 w-4" />
            {isLoading ? 'Refreshing...' : 'Refresh'}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsCreatingProduct((prev) => !prev)}
          >
            <PlusCircle className="h-4 w-4" />
            {isCreatingProduct ? 'Close Form' : 'New Loan Product'}
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
              Sign in and select or onboard a business workspace to configure loan products.
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
          {isCreatingProduct && (
            <Card className="border-blue-200 bg-blue-50/20">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <PlusCircle className="h-5 w-5 text-flotech-primary" />
                  <CardTitle>Configure New Loan Product</CardTitle>
                </div>
                <CardDescription>
                  All monetary bounds are stored as <code className="font-mono">NUMERIC(19, 4)</code> and rates as <code className="font-mono">NUMERIC(10, 6)</code> in PostgreSQL.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCreateProductSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <InputField
                      label="Product Code"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      placeholder="SME-GROWTH-12M"
                      required
                    />
                    <div className="sm:col-span-2">
                      <InputField
                        label="Product Name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="SME Working Capital Facility"
                        required
                      />
                    </div>
                    <SelectField
                      label="Interest Calculation Method"
                      value={interestMethod}
                      onChange={(e) =>
                        setInterestMethod(e.target.value as InterestCalculationMethod)
                      }
                    >
                      <option value={InterestCalculationMethod.DECLINING_BALANCE_EQUAL_INSTALLMENTS}>
                        Declining Balance — Equal Installments (Amortized)
                      </option>
                      <option value={InterestCalculationMethod.DECLINING_BALANCE_EQUAL_PRINCIPAL}>
                        Declining Balance — Equal Principal
                      </option>
                      <option value={InterestCalculationMethod.FLAT_RATE}>
                        Flat Rate Interest
                      </option>
                      <option value={InterestCalculationMethod.INTEREST_ONLY}>
                        Interest-Only + Balloon Principal
                      </option>
                    </SelectField>
                    <SelectField
                      label="Repayment Frequency"
                      value={repaymentFrequency}
                      onChange={(e) =>
                        setRepaymentFrequency(e.target.value as RepaymentFrequency)
                      }
                    >
                      <option value={RepaymentFrequency.DAILY}>DAILY</option>
                      <option value={RepaymentFrequency.WEEKLY}>WEEKLY</option>
                      <option value={RepaymentFrequency.BIWEEKLY}>BIWEEKLY</option>
                      <option value={RepaymentFrequency.MONTHLY}>MONTHLY</option>
                      <option value={RepaymentFrequency.QUARTERLY}>QUARTERLY</option>
                    </SelectField>
                    <div className="grid grid-cols-2 gap-2">
                      <InputField
                        label="Nominal Rate (%)"
                        value={nominalInterestRatePercent}
                        onChange={(e) => setNominalInterestRatePercent(e.target.value)}
                        required
                      />
                      <SelectField
                        label="Rate Basis"
                        value={ratePeriod}
                        onChange={(e) => setRatePeriod(e.target.value as InterestRatePeriod)}
                      >
                        <option value="PER_ANNUM">Per Annum</option>
                        <option value="PER_MONTH">Per Month</option>
                        <option value="PER_PERIOD">Per Installment</option>
                      </SelectField>
                    </div>
                    <InputField
                      label={`Minimum Principal (${currencyCode})`}
                      value={minPrincipal}
                      onChange={(e) => setMinPrincipal(e.target.value)}
                      required
                    />
                    <InputField
                      label={`Maximum Principal (${currencyCode})`}
                      value={maxPrincipal}
                      onChange={(e) => setMaxPrincipal(e.target.value)}
                      required
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <InputField
                        label="Min Installments"
                        type="number"
                        min={1}
                        max={360}
                        value={minTermInstallments}
                        onChange={(e) => setMinTermInstallments(e.target.value)}
                        required
                      />
                      <InputField
                        label="Max Installments"
                        type="number"
                        min={1}
                        max={360}
                        value={maxTermInstallments}
                        onChange={(e) => setMaxTermInstallments(e.target.value)}
                        required
                      />
                    </div>
                    <InputField
                      label={`Fixed Origination Fee (${currencyCode})`}
                      value={originationFeeFixed}
                      onChange={(e) => setOriginationFeeFixed(e.target.value)}
                    />
                    <InputField
                      label="Percentage Origination Fee (%)"
                      value={originationFeePercent}
                      onChange={(e) => setOriginationFeePercent(e.target.value)}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <InputField
                        label="Late Penalty (%)"
                        value={latePenaltyRatePercent}
                        onChange={(e) => setLatePenaltyRatePercent(e.target.value)}
                      />
                      <InputField
                        label="Grace Days"
                        type="number"
                        min={0}
                        max={90}
                        value={gracePeriodDays}
                        onChange={(e) => setGracePeriodDays(e.target.value)}
                      />
                    </div>
                  </div>
                  <InputField
                    label="Product Description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setIsCreatingProduct(false)}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" variant="primary" disabled={isSubmitting}>
                      {isSubmitting ? 'Saving...' : 'Create Loan Product'}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Briefcase className="h-5 w-5 text-flotech-primary" />
                  <CardTitle>Configured Loan Products ({products.length})</CardTitle>
                </div>
                <Button
                  size="sm"
                  variant="teal"
                  onClick={() => navigate('/app/loans')}
                >
                  Go to Loan Origination &rarr;
                </Button>
              </div>
              <CardDescription>
                Products enforce strict principal and installment boundaries during loan origination.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DataTableContainer>
                <DataTableHead>
                  <tr>
                    <DataTableHeaderCell>Code &amp; Name</DataTableHeaderCell>
                    <DataTableHeaderCell>Methodology &amp; Frequency</DataTableHeaderCell>
                    <DataTableHeaderCell className="text-right">Interest Rate</DataTableHeaderCell>
                    <DataTableHeaderCell className="text-right">Principal Bounds</DataTableHeaderCell>
                    <DataTableHeaderCell>Term &amp; Fees</DataTableHeaderCell>
                    <DataTableHeaderCell>Status</DataTableHeaderCell>
                    <DataTableHeaderCell className="text-right">Actions</DataTableHeaderCell>
                  </tr>
                </DataTableHead>
                <tbody className="divide-y divide-slate-200">
                  {products.map((prod) => (
                    <DataTableRow key={prod.id}>
                      <DataTableCell>
                        <div className="font-mono text-xs font-bold text-flotech-primary">
                          {prod.code}
                        </div>
                        <div className="font-semibold text-flotech-navy">{prod.name}</div>
                        {prod.description && (
                          <div className="text-xs text-slate-500">{prod.description}</div>
                        )}
                      </DataTableCell>
                      <DataTableCell>
                        <Badge variant="primary">{prod.interestMethod}</Badge>
                        <div className="mt-1 text-xs font-medium text-slate-600">
                          {prod.repaymentFrequency}
                        </div>
                      </DataTableCell>
                      <DataTableCell className="tabular-money text-right font-semibold text-flotech-navy">
                        {Number(prod.nominalInterestRatePercent).toFixed(2)}%
                        <div className="text-[11px] font-normal text-slate-500">
                          {prod.ratePeriod}
                        </div>
                      </DataTableCell>
                      <DataTableCell className="tabular-money text-right text-xs">
                        <div>
                          Min: {formatDecimalMoneyDisplay(prod.minPrincipal, prod.currencyCode)}
                        </div>
                        <div className="font-semibold text-flotech-navy">
                          Max: {formatDecimalMoneyDisplay(prod.maxPrincipal, prod.currencyCode)}
                        </div>
                      </DataTableCell>
                      <DataTableCell className="text-xs text-slate-700">
                        <div className="font-semibold">
                          {prod.minTermInstallments}–{prod.maxTermInstallments} installments
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Fee: {formatDecimalMoneyDisplay(prod.originationFeeFixed, prod.currencyCode)} +{' '}
                          {Number(prod.originationFeePercent).toFixed(2)}%
                        </div>
                      </DataTableCell>
                      <DataTableCell>
                        <div className="flex flex-col gap-1">
                          <Badge variant={prod.isActive ? 'success' : 'neutral'}>
                            {prod.isActive ? 'ACTIVE' : 'INACTIVE'}
                          </Badge>
                          <span className="text-[11px] text-slate-500">
                            {prod.activeLoanCount} active loans
                          </span>
                        </div>
                      </DataTableCell>
                      <DataTableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void handleToggleProductActive(prod)}
                        >
                          <Power className="h-3.5 w-3.5" />
                          {prod.isActive ? 'Deactivate' : 'Activate'}
                        </Button>
                      </DataTableCell>
                    </DataTableRow>
                  ))}
                  {products.length === 0 && (
                    <DataTableRow>
                      <DataTableCell className="py-8 text-center text-slate-500" colSpan={7}>
                        No loan products configured for this business yet. Click &ldquo;New Loan Product&rdquo; above to create your first credit product.
                      </DataTableCell>
                    </DataTableRow>
                  )}
                </tbody>
              </DataTableContainer>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
