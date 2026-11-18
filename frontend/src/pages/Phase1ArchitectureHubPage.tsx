import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  InterestCalculationMethod,
  RepaymentFrequency,
  type LoanSchedulePreviewSummary,
} from '@flotech/shared';
import {
  ShieldCheck,
  Database,
  Calculator,
  Layers,
  Lock,
  ArrowRight,
  CheckCircle2,
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
import { formatDecimalMoneyDisplay } from '@/config/utils';
import { requestBackendLoanSchedulePreview } from '@/services/apiClient';

export function Phase1ArchitectureHubPage() {
  const navigate = useNavigate();

  // Form state for testing Backend Decimal.js Calculation Engine via API
  const [principalAmount, setPrincipalAmount] = useState('15000.00');
  const [nominalRate, setNominalRate] = useState('18.00');
  const [ratePeriod, setRatePeriod] = useState<'PER_PERIOD' | 'PER_MONTH' | 'PER_ANNUM'>(
    'PER_ANNUM'
  );
  const [interestMethod, setInterestMethod] = useState<InterestCalculationMethod>(
    InterestCalculationMethod.DECLINING_BALANCE_EQUAL_INSTALLMENTS
  );
  const [frequency, setFrequency] = useState<RepaymentFrequency>(
    RepaymentFrequency.MONTHLY
  );
  const [termInstallments, setTermInstallments] = useState('6');
  const [firstDate, setFirstDate] = useState('2026-12-01');

  const [scheduleResult, setScheduleResult] = useState<LoanSchedulePreviewSummary | null>(
    null
  );
  const [calcError, setCalcError] = useState<string | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);

  async function handleRunBackendScheduleTest(e: React.FormEvent) {
    e.preventDefault();
    setCalcError(null);
    setIsCalculating(true);

    try {
      const response = await requestBackendLoanSchedulePreview({
        principalAmount,
        nominalInterestRatePercent: nominalRate,
        ratePeriod,
        interestMethod,
        repaymentFrequency: frequency,
        termInstallments: parseInt(termInstallments, 10) || 1,
        firstRepaymentDate: firstDate,
      });

      if (!response.success) {
        setCalcError(`${response.error.code}: ${response.error.message}`);
      } else {
        setScheduleResult(response.data);
      }
    } catch (err) {
      setCalcError(
        err instanceof Error
          ? err.message
          : 'Could not reach backend API. Ensure backend is running on port 8080.'
      );
    } finally {
      setIsCalculating(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Hero Banner */}
      <div className="rounded-2xl bg-flotech-navy p-6 sm:p-8 text-white shadow-elevated border border-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-2 max-w-3xl">
            <div className="flex items-center gap-2">
              <Badge variant="primary">PHASE 1 COMPLETED</Badge>
              <Badge variant="teal">FloTech Digital Owned</Badge>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              FloTech Digital — Multi-Tenant Loan Management SaaS
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed">
              Phase 1 establishes the production-grade foundation: separated React/Vite frontend and
              Node/Express/TypeScript backend, PostgreSQL single-source-of-truth schema with
              Row-Level Security (RLS), Firebase Auth + App Check verification middleware,
              Decimal.js financial calculation engine, and the FloTech Design System.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              id="btn-open-business-env"
              variant="primary"
              onClick={() => navigate('/app/dashboard')}
            >
              Inspect Business Shell (15 Modules)
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button
              id="btn-open-super-admin-env"
              variant="teal"
              onClick={() => navigate('/super-admin/dashboard')}
            >
              Inspect Super Admin Shell (9 Modules)
            </Button>
          </div>
        </div>
      </div>

      {/* Architectural Pillars Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>PostgreSQL Single Source</CardTitle>
              <Database className="h-4 w-4 text-flotech-primary" />
            </div>
            <CardDescription>Zero Firestore Data Split</CardDescription>
          </CardHeader>
          <CardContent className="text-xs text-slate-600 space-y-2">
            <p>
              All business, customer, loan, schedule, repayment, and RBAC records reside in
              PostgreSQL using <code className="font-mono">NUMERIC(19, 4)</code> for monetary values.
            </p>
            <Badge variant="success">16 Core Tables Blueprinted</Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Multi-Tenant Isolation</CardTitle>
              <ShieldCheck className="h-4 w-4 text-flotech-teal" />
            </div>
            <CardDescription>Defense-in-Depth Security</CardDescription>
          </CardHeader>
          <CardContent className="text-xs text-slate-600 space-y-2">
            <p>
              Composite foreign keys <code className="font-mono">(business_id, id)</code> plus
              PostgreSQL Row-Level Security policies bound per transaction via{' '}
              <code className="font-mono">SET LOCAL</code>.
            </p>
            <Badge variant="teal">RLS + Backend RBAC</Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Decimal.js Engine</CardTitle>
              <Calculator className="h-4 w-4 text-flotech-primary" />
            </div>
            <CardDescription>Zero IEEE 754 Float Drift</CardDescription>
          </CardHeader>
          <CardContent className="text-xs text-slate-600 space-y-2">
            <p>
              Financial calculations are strictly forbidden in the frontend. The backend uses{' '}
              <code className="font-mono">Decimal.js</code> with{' '}
              <code className="font-mono">ROUND_HALF_UP</code>.
            </p>
            <Badge variant="primary">Backend Authoritative</Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Super Admin Isolation</CardTitle>
              <Lock className="h-4 w-4 text-flotech-danger" />
            </div>
            <CardDescription>Privilege Escalation Prevention</CardDescription>
          </CardHeader>
          <CardContent className="text-xs text-slate-600 space-y-2">
            <p>
              PostgreSQL trigger <code className="font-mono">trg_enforce_super_admin_protection</code>{' '}
              prevents ordinary business users from ever self-granting{' '}
              <code className="font-mono">SUPER_ADMIN</code>.
            </p>
            <Badge variant="danger">DB Trigger Protected</Badge>
          </CardContent>
        </Card>
      </div>

      {/* Design System Palette & Components Showcase */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Task C — FloTech Digital Design System Tokens & Primitives</CardTitle>
              <CardDescription>
                Official color palette, tabular monetary typography, buttons, badges, and status
                semantics.
              </CardDescription>
            </div>
            <Layers className="h-5 w-5 text-flotech-primary" />
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Approved Color Swatches */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
              Approved Brand & Semantic Color Palette
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 text-xs">
              {[
                { name: 'Primary Blue', hex: '#2563EB', bgClass: 'bg-flotech-primary text-white' },
                { name: 'Dark Navy', hex: '#0F172A', bgClass: 'bg-flotech-navy text-white' },
                { name: 'Background', hex: '#F8FAFC', bgClass: 'bg-flotech-bg text-flotech-navy border border-slate-200' },
                { name: 'Surface White', hex: '#FFFFFF', bgClass: 'bg-white text-flotech-navy border border-slate-200' },
                { name: 'Success', hex: '#16A34A', bgClass: 'bg-flotech-success text-white' },
                { name: 'Warning', hex: '#F59E0B', bgClass: 'bg-flotech-warning text-white' },
                { name: 'Danger', hex: '#DC2626', bgClass: 'bg-flotech-danger text-white' },
                { name: 'Secondary Teal', hex: '#0D9488', bgClass: 'bg-flotech-teal text-white' },
              ].map((swatch) => (
                <div
                  key={swatch.hex}
                  className="rounded-lg border border-slate-200 p-2 bg-white shadow-2xs"
                >
                  <div
                    className={`h-10 w-full rounded-md flex items-center justify-center font-mono text-[11px] font-semibold ${swatch.bgClass}`}
                  >
                    {swatch.hex}
                  </div>
                  <div className="mt-1.5 font-semibold text-flotech-navy truncate">
                    {swatch.name}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Buttons & Status Badges */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2 border-t border-slate-100">
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
                Accessible Button Variants
              </h4>
              <div className="flex flex-wrap gap-2.5">
                <Button variant="primary">Primary Action</Button>
                <Button variant="navy">Dark Navy</Button>
                <Button variant="teal">Secondary Teal</Button>
                <Button variant="outline">Outline Control</Button>
                <Button variant="success">Approve Loan</Button>
                <Button variant="danger">Reject / Write-Off</Button>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
                Loan & Compliance Status Badges
              </h4>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="primary">SUBMITTED</Badge>
                <Badge variant="teal">DISBURSED</Badge>
                <Badge variant="success">ACTIVE • PERFORMING</Badge>
                <Badge variant="warning">GRACE PERIOD (3 DAYS)</Badge>
                <Badge variant="danger">OVERDUE • PAR 30</Badge>
                <Badge variant="navy">SUPER_ADMIN</Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Interactive Backend Decimal.js Verification Workbench */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>
                Backend Financial Calculation Engine Verifier (PostgreSQL NUMERIC + Decimal.js)
              </CardTitle>
              <CardDescription>
                Architectural Rule #5 & #7 Verification: Submit loan parameters to{' '}
                <code className="font-mono">POST /api/v1/financial/schedule-preview</code>. The
                frontend performs zero arithmetic and renders the backend&apos;s exact{' '}
                <code className="font-mono">DecimalString</code> response.
              </CardDescription>
            </div>
            <Badge variant="success">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Zero Fake Statistics
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <form
            onSubmit={handleRunBackendScheduleTest}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
          >
            <InputField
              id="input-principal"
              label="Principal Amount (DecimalString)"
              value={principalAmount}
              onChange={(e) => setPrincipalAmount(e.target.value)}
              helperText="Sent as string, never float"
            />
            <InputField
              id="input-rate"
              label="Nominal Interest Rate (%)"
              value={nominalRate}
              onChange={(e) => setNominalRate(e.target.value)}
              helperText="NUMERIC(10,6) precision"
            />
            <SelectField
              id="select-rate-period"
              label="Rate Period"
              value={ratePeriod}
              onChange={(e) =>
                setRatePeriod(e.target.value as 'PER_PERIOD' | 'PER_MONTH' | 'PER_ANNUM')
              }
            >
              <option value="PER_ANNUM">Per Annum (Annual)</option>
              <option value="PER_MONTH">Per Month</option>
              <option value="PER_PERIOD">Per Installment Period</option>
            </SelectField>
            <SelectField
              id="select-interest-method"
              label="Interest Calculation Method"
              value={interestMethod}
              onChange={(e) =>
                setInterestMethod(e.target.value as InterestCalculationMethod)
              }
            >
              <option value={InterestCalculationMethod.DECLINING_BALANCE_EQUAL_INSTALLMENTS}>
                Declining Balance (Equal Installments)
              </option>
              <option value={InterestCalculationMethod.DECLINING_BALANCE_EQUAL_PRINCIPAL}>
                Declining Balance (Equal Principal)
              </option>
              <option value={InterestCalculationMethod.FLAT_RATE}>Flat Rate</option>
              <option value={InterestCalculationMethod.INTEREST_ONLY}>Interest Only</option>
            </SelectField>

            <SelectField
              id="select-frequency"
              label="Repayment Frequency"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as RepaymentFrequency)}
            >
              <option value={RepaymentFrequency.MONTHLY}>Monthly</option>
              <option value={RepaymentFrequency.BIWEEKLY}>Bi-Weekly</option>
              <option value={RepaymentFrequency.WEEKLY}>Weekly</option>
              <option value={RepaymentFrequency.QUARTERLY}>Quarterly</option>
            </SelectField>
            <InputField
              id="input-installments"
              label="Term (Installments)"
              type="number"
              min={1}
              max={360}
              value={termInstallments}
              onChange={(e) => setTermInstallments(e.target.value)}
            />
            <InputField
              id="input-first-date"
              label="First Repayment Date"
              type="date"
              value={firstDate}
              onChange={(e) => setFirstDate(e.target.value)}
            />
            <div className="flex items-end">
              <Button
                id="btn-compute-backend-schedule"
                type="submit"
                variant="primary"
                className="w-full"
                disabled={isCalculating}
              >
                {isCalculating ? 'Computing on Backend...' : 'Compute Schedule on Backend API'}
              </Button>
            </div>
          </form>

          {calcError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-medium text-flotech-danger">
              {calcError}
            </div>
          )}

          {scheduleResult && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5">
                  <div className="text-xs text-slate-500">Contracted Principal</div>
                  <div className="text-lg font-bold tabular-money text-flotech-navy">
                    {formatDecimalMoneyDisplay(scheduleResult.principalAmount, 'USD')}
                  </div>
                  <div className="text-[11px] font-mono text-slate-400">
                    Raw NUMERIC(19,4): {scheduleResult.principalAmount}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5">
                  <div className="text-xs text-slate-500">Total Scheduled Interest</div>
                  <div className="text-lg font-bold tabular-money text-flotech-primary">
                    {formatDecimalMoneyDisplay(scheduleResult.totalInterestAmount, 'USD')}
                  </div>
                  <div className="text-[11px] font-mono text-slate-400">
                    Raw NUMERIC(19,4): {scheduleResult.totalInterestAmount}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5">
                  <div className="text-xs text-slate-500">Total Payable Amount</div>
                  <div className="text-lg font-bold tabular-money text-flotech-teal">
                    {formatDecimalMoneyDisplay(scheduleResult.totalPayableAmount, 'USD')}
                  </div>
                  <div className="text-[11px] font-mono text-slate-400">
                    Raw NUMERIC(19,4): {scheduleResult.totalPayableAmount}
                  </div>
                </div>
              </div>

              <DataTableContainer>
                <DataTableHead>
                  <tr>
                    <DataTableHeaderCell>#</DataTableHeaderCell>
                    <DataTableHeaderCell>Due Date</DataTableHeaderCell>
                    <DataTableHeaderCell className="text-right">Opening Balance</DataTableHeaderCell>
                    <DataTableHeaderCell className="text-right">Principal Due</DataTableHeaderCell>
                    <DataTableHeaderCell className="text-right">Interest Due</DataTableHeaderCell>
                    <DataTableHeaderCell className="text-right">Total Installment</DataTableHeaderCell>
                    <DataTableHeaderCell className="text-right">Closing Balance</DataTableHeaderCell>
                  </tr>
                </DataTableHead>
                <tbody>
                  {scheduleResult.installments.map((inst) => (
                    <DataTableRow key={inst.installmentNumber}>
                      <DataTableCell className="font-mono font-semibold">
                        {inst.installmentNumber}
                      </DataTableCell>
                      <DataTableCell className="font-mono">{inst.dueDate}</DataTableCell>
                      <DataTableCell className="text-right tabular-money">
                        {inst.openingBalance}
                      </DataTableCell>
                      <DataTableCell className="text-right tabular-money font-medium text-flotech-navy">
                        {inst.principalDue}
                      </DataTableCell>
                      <DataTableCell className="text-right tabular-money text-flotech-primary">
                        {inst.interestDue}
                      </DataTableCell>
                      <DataTableCell className="text-right tabular-money font-semibold text-flotech-teal">
                        {inst.totalDue}
                      </DataTableCell>
                      <DataTableCell className="text-right tabular-money">
                        {inst.closingBalance}
                      </DataTableCell>
                    </DataTableRow>
                  ))}
                </tbody>
              </DataTableContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
