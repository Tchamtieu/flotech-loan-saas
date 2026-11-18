import React, { useCallback, useEffect, useState } from 'react';
import {
  PermissionCode,
  type BusinessFinancialDashboardDTO,
} from '@flotech/shared';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Download,
  RefreshCw,
  ShieldAlert,
  TrendingUp,
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
  exportBusinessFinancialStatementCsvApi,
  fetchBusinessFinancialDashboardApi,
  fetchBusinessPortfolioReportApi,
} from '@/services/apiClient';

export interface FinancialDashboardAndReportsPageProps {
  mode: 'DASHBOARD' | 'REPORTS';
}

export function FinancialDashboardAndReportsPage({
  mode,
}: FinancialDashboardAndReportsPageProps): React.ReactElement {
  const { firebaseUser, activeBusinessId, activeTenantMembership } = useAuthSession();

  const [dashboard, setDashboard] = useState<BusinessFinancialDashboardDTO | null>(null);
  const [asOfDate, setAsOfDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const permissions = activeTenantMembership?.permissions ?? [];
  const canExportCsv = permissions.includes(PermissionCode.REPORTS_EXPORT);

  const loadAnalytics = useCallback(async () => {
    if (!firebaseUser || !activeBusinessId) return;
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const idToken = await firebaseUser.getIdToken();
      const appCheckToken = await getActiveAppCheckToken();

      const res =
        mode === 'DASHBOARD'
          ? await fetchBusinessFinancialDashboardApi(
              idToken,
              appCheckToken,
              activeBusinessId,
              asOfDate || undefined
            )
          : await fetchBusinessPortfolioReportApi(
              idToken,
              appCheckToken,
              activeBusinessId,
              asOfDate || undefined
            );

      if (!res.success) {
        setErrorMessage(`${res.error.code}: ${res.error.message}`);
        return;
      }

      setDashboard(res.data);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to load financial analytics.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [firebaseUser, activeBusinessId, asOfDate, mode]);

  useEffect(() => {
    void loadAnalytics();
  }, [loadAnalytics]);

  const handleExportCsv = async () => {
    if (!firebaseUser || !activeBusinessId) return;
    setIsExporting(true);
    setErrorMessage(null);

    try {
      const idToken = await firebaseUser.getIdToken();
      const appCheckToken = await getActiveAppCheckToken();

      const res = await exportBusinessFinancialStatementCsvApi(
        idToken,
        appCheckToken,
        activeBusinessId,
        asOfDate || undefined
      );

      if (!res.success) {
        setErrorMessage(`${res.error.code}: ${res.error.message}`);
        return;
      }

      const blob = new Blob([res.data.csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.data.fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to export CSV statement.'
      );
    } finally {
      setIsExporting(false);
    }
  };

  const kpis = dashboard?.kpis;
  const currency = kpis?.currencyCode ?? 'USD';

  const chartData = (dashboard?.monthlyCashflow ?? []).map((pt) => ({
    month: pt.monthKey,
    Disbursed: Number(pt.disbursedPrincipal),
    Expected: Number(pt.expectedCollections),
    Collected: Number(pt.actualCollections),
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="primary">PHASE 9 — LIVE FINANCIAL ANALYTICS</Badge>
            <span className="text-xs font-mono text-slate-500">
              100% Live PostgreSQL Aggregations (Zero Fake Data)
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-flotech-navy">
            {mode === 'DASHBOARD'
              ? 'Executive Portfolio Dashboard'
              : 'Financial Reports & PAR Statements'}
          </h1>
          <p className="text-sm text-slate-600">
            Real-time portfolio performance, Portfolio at Risk (PAR 30 / PAR 90) aging buckets, collection efficiency, and exportable statements.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <InputField
            label=""
            type="date"
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
          />
          <Button
            variant="outline"
            onClick={() => void loadAnalytics()}
            disabled={isLoading}
          >
            <RefreshCw className="mr-1.5 h-4 w-4" />
            Refresh
          </Button>
          {canExportCsv && (
            <Button
              variant="primary"
              onClick={() => void handleExportCsv()}
              disabled={isExporting}
            >
              <Download className="mr-1.5 h-4 w-4" />
              {isExporting ? 'Exporting...' : 'Export Portfolio CSV'}
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Total Disbursed Principal
            </div>
            <div className="mt-1 font-mono text-2xl font-bold text-flotech-navy">
              {formatDecimalMoneyDisplay(
                kpis?.totalDisbursedPrincipal ?? '0.0000',
                currency
              )}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {kpis?.totalLoansCount ?? 0} total loans ({kpis?.activeLoansCount ?? 0} active)
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Total Portfolio Outstanding
            </div>
            <div className="mt-1 font-mono text-2xl font-bold text-flotech-primary">
              {formatDecimalMoneyDisplay(
                kpis?.totalPortfolioOutstanding ?? '0.0000',
                currency
              )}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Principal Bal:{' '}
              {formatDecimalMoneyDisplay(
                kpis?.totalPrincipalOutstanding ?? '0.0000',
                currency
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Total Repayments Collected
            </div>
            <div className="mt-1 font-mono text-2xl font-bold text-emerald-600">
              {formatDecimalMoneyDisplay(
                kpis?.totalCollectedAmount ?? '0.0000',
                currency
              )}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Collection Efficiency: {kpis?.collectionEfficiencyPercent ?? '0.0000'}%
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Portfolio at Risk (PAR 30 / 90)
            </div>
            <div className="mt-1 font-mono text-2xl font-bold text-red-600">
              {dashboard?.par30RatioPercent ?? '0.0000'}% /{' '}
              {dashboard?.par90RatioPercent ?? '0.0000'}%
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {kpis?.overdueLoansCount ?? 0} overdue loan(s) &bull;{' '}
              {kpis?.activeCustomersCount ?? 0} active borrowers
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Monthly Cashflow &amp; Collections</CardTitle>
                <CardDescription>
                  Disbursed principal vs. scheduled installments due vs. actual collections posted.
                </CardDescription>
              </div>
              <TrendingUp className="h-4 w-4 text-flotech-primary" />
            </div>
          </CardHeader>
          <CardContent>
            {chartData.length === 0 ? (
              <div className="flex h-64 items-center justify-center text-sm text-slate-500">
                No loan disbursements or repayments recorded yet.
              </div>
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="Disbursed" fill="#2563EB" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Expected" fill="#0D9488" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Collected" fill="#16A34A" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Portfolio at Risk (PAR) Aging Matrix</CardTitle>
            <CardDescription>
              Classification of open loan principal exposure by oldest unpaid installment days past due as of {dashboard?.asOfDate ?? asOfDate}.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <DataTableContainer>
              <DataTableHead>
                <tr>
                  <DataTableHeaderCell>Aging Bucket</DataTableHeaderCell>
                  <DataTableHeaderCell className="text-right">Loans</DataTableHeaderCell>
                  <DataTableHeaderCell className="text-right">Principal at Risk</DataTableHeaderCell>
                  <DataTableHeaderCell className="text-right">Total Exposure</DataTableHeaderCell>
                  <DataTableHeaderCell className="text-right">% of Portfolio</DataTableHeaderCell>
                </tr>
              </DataTableHead>
              <tbody>
                {(dashboard?.parBuckets ?? []).map((b) => (
                  <DataTableRow key={b.bucketLabel}>
                    <DataTableCell>
                      <Badge
                        variant={
                          b.bucketLabel === 'CURRENT'
                            ? 'success'
                            : b.bucketLabel === 'PAR_1_29'
                              ? 'warning'
                              : 'danger'
                        }
                      >
                        {b.bucketLabel}
                      </Badge>
                    </DataTableCell>
                    <DataTableCell className="text-right font-mono text-xs">
                      {b.loansCount}
                    </DataTableCell>
                    <DataTableCell className="text-right font-mono text-xs font-medium text-flotech-navy">
                      {formatDecimalMoneyDisplay(b.principalAtRisk, currency)}
                    </DataTableCell>
                    <DataTableCell className="text-right font-mono text-xs">
                      {formatDecimalMoneyDisplay(b.totalOutstandingAtRisk, currency)}
                    </DataTableCell>
                    <DataTableCell className="text-right font-mono text-xs font-semibold">
                      {b.percentOfPortfolioPrincipal}%
                    </DataTableCell>
                  </DataTableRow>
                ))}
              </tbody>
            </DataTableContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Loan Product Performance Breakdown</CardTitle>
          <CardDescription>
            Disbursed volume, active loan count, remaining principal, and cumulative collections per product.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <DataTableContainer>
            <DataTableHead>
              <tr>
                <DataTableHeaderCell>Product Code &amp; Name</DataTableHeaderCell>
                <DataTableHeaderCell className="text-right">Total Loans</DataTableHeaderCell>
                <DataTableHeaderCell className="text-right">Active Loans</DataTableHeaderCell>
                <DataTableHeaderCell className="text-right">Disbursed Principal</DataTableHeaderCell>
                <DataTableHeaderCell className="text-right">Principal Outstanding</DataTableHeaderCell>
                <DataTableHeaderCell className="text-right">Total Collected</DataTableHeaderCell>
              </tr>
            </DataTableHead>
            <tbody>
              {(dashboard?.productBreakdown ?? []).length === 0 ? (
                <DataTableRow>
                  <DataTableCell colSpan={6} className="py-6 text-center text-sm text-slate-500">
                    No loan products configured yet.
                  </DataTableCell>
                </DataTableRow>
              ) : (
                (dashboard?.productBreakdown ?? []).map((p) => (
                  <DataTableRow key={p.loanProductId}>
                    <DataTableCell>
                      <div className="font-mono text-xs font-semibold text-flotech-navy">
                        {p.loanProductCode}
                      </div>
                      <div className="text-xs text-slate-500">{p.loanProductName}</div>
                    </DataTableCell>
                    <DataTableCell className="text-right font-mono text-xs">
                      {p.loansCount}
                    </DataTableCell>
                    <DataTableCell className="text-right font-mono text-xs">
                      {p.activeLoansCount}
                    </DataTableCell>
                    <DataTableCell className="text-right font-mono text-xs">
                      {formatDecimalMoneyDisplay(p.disbursedPrincipal, currency)}
                    </DataTableCell>
                    <DataTableCell className="text-right font-mono text-xs text-flotech-primary">
                      {formatDecimalMoneyDisplay(p.principalOutstanding, currency)}
                    </DataTableCell>
                    <DataTableCell className="text-right font-mono text-xs font-semibold text-emerald-700">
                      {formatDecimalMoneyDisplay(p.totalCollected, currency)}
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
