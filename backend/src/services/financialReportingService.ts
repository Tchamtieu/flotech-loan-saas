import {
  BusinessFinancialDashboardDTO,
  InstallmentStatus,
  MonthlyCashflowPointDTO,
  NotificationItemDTO,
  ParAgingBucketDTO,
  PortfolioKpiSummaryDTO,
  ProductPerformanceBreakdownDTO,
  UUID,
} from '@flotech/shared';
import { withTenantTransaction } from '../database/pool.js';
import {
  FinancialDecimal,
  roundCurrencyUnit,
  toStorageMoney,
} from '../financial/decimalEngine.js';
import { AppError } from '../middleware/errorHandler.js';
import { listTenantRepayments } from './repaymentManagementService.js';
import { computeDaysPastDue } from './scheduleEngineService.js';

function toIsoTimestamp(val: Date | string): string {
  return val instanceof Date ? val.toISOString() : String(val);
}

function toNullableIsoTimestamp(val: Date | string | null): string | null {
  if (!val) return null;
  return val instanceof Date ? val.toISOString() : String(val);
}

function toDateOnlyString(val: Date | string): string {
  if (val instanceof Date) {
    return val.toISOString().slice(0, 10);
  }
  return String(val).slice(0, 10);
}

/**
 * Computes real PostgreSQL portfolio analytics, PAR aging buckets (1-29, 30-59, 60-89, 90+ DPD),
 * collection efficiency, monthly cashflows, product performance breakdown, and recent repayments.
 * Never returns fake or hardcoded statistics.
 */
export async function getBusinessFinancialDashboard(
  businessId: UUID,
  actorUserId: UUID,
  asOfDate?: string
): Promise<BusinessFinancialDashboardDTO> {
  const effectiveAsOfDate = asOfDate ?? new Date().toISOString().slice(0, 10);

  const dashboardCore = await withTenantTransaction(
    { businessId, actorUserId, isSuperAdmin: false },
    async (client) => {
      // 1. Business currency
      const bizRes = await client.query<{ currency_code: string }>(
        `SELECT currency_code FROM businesses WHERE id = $1`,
        [businessId]
      );
      const currencyCode = bizRes.rows[0]?.currency_code ?? 'USD';

      // 2. Customer counts
      const custAggRes = await client.query<{
        total_customers: number;
        active_customers: number;
      }>(
        `SELECT
           COUNT(*)::int AS total_customers,
           COUNT(*) FILTER (WHERE is_archived = FALSE)::int AS active_customers
         FROM customers
         WHERE business_id = $1`,
        [businessId]
      );
      const custAgg = custAggRes.rows[0] ?? { total_customers: 0, active_customers: 0 };

      // 3. Loan portfolio aggregations (for disbursed/active/overdue/restructured/closed/written-off loans)
      const loanAggRes = await client.query<{
        total_loans: number;
        active_loans: number;
        overdue_loans: number;
        closed_paid_loans: number;
        total_disbursed_principal: string;
        total_contracted_interest: string;
        total_contracted_fees: string;
        total_accrued_penalties: string;
        total_principal_outstanding: string;
        total_interest_outstanding: string;
        total_fee_outstanding: string;
        total_penalty_outstanding: string;
        total_portfolio_outstanding: string;
      }>(
        `SELECT
           COUNT(*)::int AS total_loans,
           COUNT(*) FILTER (WHERE status IN ('ACTIVE', 'OVERDUE', 'RESTRUCTURED'))::int AS active_loans,
           COUNT(*) FILTER (WHERE status = 'OVERDUE')::int AS overdue_loans,
           COUNT(*) FILTER (WHERE status = 'CLOSED_PAID')::int AS closed_paid_loans,
           COALESCE(SUM(principal_amount) FILTER (WHERE status IN ('ACTIVE', 'OVERDUE', 'RESTRUCTURED', 'CLOSED_PAID', 'DEFAULTED', 'WRITTEN_OFF')), 0)::text AS total_disbursed_principal,
           COALESCE(SUM(total_interest_amount) FILTER (WHERE status IN ('ACTIVE', 'OVERDUE', 'RESTRUCTURED', 'CLOSED_PAID', 'DEFAULTED', 'WRITTEN_OFF')), 0)::text AS total_contracted_interest,
           COALESCE(SUM(total_fee_amount) FILTER (WHERE status IN ('ACTIVE', 'OVERDUE', 'RESTRUCTURED', 'CLOSED_PAID', 'DEFAULTED', 'WRITTEN_OFF')), 0)::text AS total_contracted_fees,
           COALESCE(SUM(total_penalty_amount) FILTER (WHERE status IN ('ACTIVE', 'OVERDUE', 'RESTRUCTURED', 'CLOSED_PAID', 'DEFAULTED', 'WRITTEN_OFF')), 0)::text AS total_accrued_penalties,
           COALESCE(SUM(principal_outstanding) FILTER (WHERE status IN ('ACTIVE', 'OVERDUE', 'RESTRUCTURED', 'DEFAULTED')), 0)::text AS total_principal_outstanding,
           COALESCE(SUM(interest_outstanding) FILTER (WHERE status IN ('ACTIVE', 'OVERDUE', 'RESTRUCTURED', 'DEFAULTED')), 0)::text AS total_interest_outstanding,
           COALESCE(SUM(fee_outstanding) FILTER (WHERE status IN ('ACTIVE', 'OVERDUE', 'RESTRUCTURED', 'DEFAULTED')), 0)::text AS total_fee_outstanding,
           COALESCE(SUM(penalty_outstanding) FILTER (WHERE status IN ('ACTIVE', 'OVERDUE', 'RESTRUCTURED', 'DEFAULTED')), 0)::text AS total_penalty_outstanding,
           COALESCE(SUM(total_outstanding) FILTER (WHERE status IN ('ACTIVE', 'OVERDUE', 'RESTRUCTURED', 'DEFAULTED')), 0)::text AS total_portfolio_outstanding
         FROM loans
         WHERE business_id = $1`,
        [businessId]
      );
      const loanAgg = loanAggRes.rows[0]!;

      // 4. Repayments collections aggregation (non-reversed)
      const repAggRes = await client.query<{
        total_collected_amount: string;
        total_collected_principal: string;
        total_collected_interest: string;
        total_collected_fees: string;
        total_collected_penalties: string;
      }>(
        `SELECT
           COALESCE(SUM(amount_received), 0)::text AS total_collected_amount,
           COALESCE(SUM(allocated_principal), 0)::text AS total_collected_principal,
           COALESCE(SUM(allocated_interest), 0)::text AS total_collected_interest,
           COALESCE(SUM(allocated_fee), 0)::text AS total_collected_fees,
           COALESCE(SUM(allocated_penalty), 0)::text AS total_collected_penalties
         FROM repayments
         WHERE business_id = $1 AND is_reversed = FALSE`,
        [businessId]
      );
      const repAgg = repAggRes.rows[0]!;

      // 5. Compute Collection Efficiency % (total_paid on schedules due <= asOfDate vs total_due on schedules due <= asOfDate)
      const dueEfficiencyRes = await client.query<{
        matured_total_due: string;
        matured_total_paid: string;
      }>(
        `SELECT
           COALESCE(SUM(total_due) FILTER (WHERE due_date <= $2::date AND status <> 'WAIVED'), 0)::text AS matured_total_due,
           COALESCE(SUM(total_paid) FILTER (WHERE due_date <= $2::date AND status <> 'WAIVED'), 0)::text AS matured_total_paid
         FROM repayment_schedules
         WHERE business_id = $1`,
        [businessId, effectiveAsOfDate]
      );
      const maturedDueDec = new FinancialDecimal(dueEfficiencyRes.rows[0]?.matured_total_due ?? '0');
      const maturedPaidDec = new FinancialDecimal(dueEfficiencyRes.rows[0]?.matured_total_paid ?? '0');
      const totalCollectedDec = new FinancialDecimal(repAgg.total_collected_amount);

      let collectionEfficiencyDec = new FinancialDecimal(100);
      if (maturedDueDec.greaterThan(0)) {
        collectionEfficiencyDec = roundCurrencyUnit(
          FinancialDecimal.min(
            new FinancialDecimal(100),
            maturedPaidDec.mul(100).div(maturedDueDec)
          )
        );
      } else if (totalCollectedDec.isZero()) {
        collectionEfficiencyDec = new FinancialDecimal(0);
      }

      const kpis: PortfolioKpiSummaryDTO = {
        currencyCode,
        totalCustomersCount: Number(custAgg.total_customers),
        activeCustomersCount: Number(custAgg.active_customers),
        totalLoansCount: Number(loanAgg.total_loans),
        activeLoansCount: Number(loanAgg.active_loans),
        overdueLoansCount: Number(loanAgg.overdue_loans),
        closedPaidLoansCount: Number(loanAgg.closed_paid_loans),
        totalDisbursedPrincipal: toStorageMoney(loanAgg.total_disbursed_principal),
        totalContractedInterest: toStorageMoney(loanAgg.total_contracted_interest),
        totalContractedFees: toStorageMoney(loanAgg.total_contracted_fees),
        totalAccruedPenalties: toStorageMoney(loanAgg.total_accrued_penalties),
        totalPrincipalOutstanding: toStorageMoney(loanAgg.total_principal_outstanding),
        totalInterestOutstanding: toStorageMoney(loanAgg.total_interest_outstanding),
        totalFeeOutstanding: toStorageMoney(loanAgg.total_fee_outstanding),
        totalPenaltyOutstanding: toStorageMoney(loanAgg.total_penalty_outstanding),
        totalPortfolioOutstanding: toStorageMoney(loanAgg.total_portfolio_outstanding),
        totalCollectedAmount: toStorageMoney(repAgg.total_collected_amount),
        totalCollectedPrincipal: toStorageMoney(repAgg.total_collected_principal),
        totalCollectedInterest: toStorageMoney(repAgg.total_collected_interest),
        totalCollectedFees: toStorageMoney(repAgg.total_collected_fees),
        totalCollectedPenalties: toStorageMoney(repAgg.total_collected_penalties),
        collectionEfficiencyPercent: toStorageMoney(collectionEfficiencyDec),
      };

      // 6. Compute Portfolio at Risk (PAR) Aging Buckets across active/overdue/restructured/defaulted loans
      const openLoansRes = await client.query<{
        id: UUID;
        principal_outstanding: string;
        total_outstanding: string;
        oldest_unpaid_due_date: Date | string | null;
      }>(
        `SELECT
           l.id,
           l.principal_outstanding,
           l.total_outstanding,
           MIN(rs.due_date) FILTER (
             WHERE rs.status IN ('PENDING', 'PARTIALLY_PAID', 'OVERDUE')
               AND rs.due_date < $2::date
           ) AS oldest_unpaid_due_date
         FROM loans l
         LEFT JOIN repayment_schedules rs
           ON rs.business_id = l.business_id AND rs.loan_id = l.id
         WHERE l.business_id = $1
           AND l.status IN ('ACTIVE', 'OVERDUE', 'RESTRUCTURED', 'DEFAULTED')
           AND l.principal_outstanding > 0
         GROUP BY l.id, l.principal_outstanding, l.total_outstanding`,
        [businessId, effectiveAsOfDate]
      );

      const bucketOrder: Array<ParAgingBucketDTO['bucketLabel']> = [
        'CURRENT',
        'PAR_1_29',
        'PAR_30_59',
        'PAR_60_89',
        'PAR_90_PLUS',
      ];
      const bucketMap = new Map<
        ParAgingBucketDTO['bucketLabel'],
        {
          count: number;
          principalDec: InstanceType<typeof FinancialDecimal>;
          totalOutDec: InstanceType<typeof FinancialDecimal>;
        }
      >();
      for (const label of bucketOrder) {
        bucketMap.set(label, {
          count: 0,
          principalDec: new FinancialDecimal(0),
          totalOutDec: new FinancialDecimal(0),
        });
      }

      const totalPortfolioPrincipalDec = new FinancialDecimal(
        loanAgg.total_principal_outstanding
      );
      let par30PrincipalDec = new FinancialDecimal(0);
      let par90PrincipalDec = new FinancialDecimal(0);

      for (const row of openLoansRes.rows) {
        const pDec = new FinancialDecimal(row.principal_outstanding);
        const tDec = new FinancialDecimal(row.total_outstanding);
        let maxDpd = 0;
        if (row.oldest_unpaid_due_date) {
          maxDpd = computeDaysPastDue(
            toDateOnlyString(row.oldest_unpaid_due_date),
            effectiveAsOfDate,
            InstallmentStatus.OVERDUE
          );
        }

        let targetBucket: ParAgingBucketDTO['bucketLabel'] = 'CURRENT';
        if (maxDpd >= 90) {
          targetBucket = 'PAR_90_PLUS';
          par30PrincipalDec = par30PrincipalDec.plus(pDec);
          par90PrincipalDec = par90PrincipalDec.plus(pDec);
        } else if (maxDpd >= 60) {
          targetBucket = 'PAR_60_89';
          par30PrincipalDec = par30PrincipalDec.plus(pDec);
        } else if (maxDpd >= 30) {
          targetBucket = 'PAR_30_59';
          par30PrincipalDec = par30PrincipalDec.plus(pDec);
        } else if (maxDpd >= 1) {
          targetBucket = 'PAR_1_29';
        }

        const b = bucketMap.get(targetBucket)!;
        b.count += 1;
        b.principalDec = b.principalDec.plus(pDec);
        b.totalOutDec = b.totalOutDec.plus(tDec);
      }

      const parBuckets: ParAgingBucketDTO[] = bucketOrder.map((label) => {
        const b = bucketMap.get(label)!;
        const pctDec = totalPortfolioPrincipalDec.greaterThan(0)
          ? roundCurrencyUnit(b.principalDec.mul(100).div(totalPortfolioPrincipalDec))
          : new FinancialDecimal(0);
        return {
          bucketLabel: label,
          loansCount: b.count,
          principalAtRisk: toStorageMoney(b.principalDec),
          totalOutstandingAtRisk: toStorageMoney(b.totalOutDec),
          percentOfPortfolioPrincipal: toStorageMoney(pctDec),
        };
      });

      const par30RatioDec = totalPortfolioPrincipalDec.greaterThan(0)
        ? roundCurrencyUnit(par30PrincipalDec.mul(100).div(totalPortfolioPrincipalDec))
        : new FinancialDecimal(0);
      const par90RatioDec = totalPortfolioPrincipalDec.greaterThan(0)
        ? roundCurrencyUnit(par90PrincipalDec.mul(100).div(totalPortfolioPrincipalDec))
        : new FinancialDecimal(0);

      // 7. Monthly Cashflow Series (aggregated from real loans, schedules, and repayments)
      const disbMonthRes = await client.query<{ month_key: string; disbursed_sum: string }>(
        `SELECT
           TO_CHAR(COALESCE(disbursed_at::date, application_date), 'YYYY-MM') AS month_key,
           COALESCE(SUM(principal_amount), 0)::text AS disbursed_sum
         FROM loans
         WHERE business_id = $1
           AND status IN ('ACTIVE', 'OVERDUE', 'RESTRUCTURED', 'CLOSED_PAID', 'DEFAULTED', 'WRITTEN_OFF')
         GROUP BY month_key`,
        [businessId]
      );

      const schedMonthRes = await client.query<{ month_key: string; expected_sum: string }>(
        `SELECT
           TO_CHAR(due_date, 'YYYY-MM') AS month_key,
           COALESCE(SUM(total_due), 0)::text AS expected_sum
         FROM repayment_schedules
         WHERE business_id = $1 AND status <> 'WAIVED'
         GROUP BY month_key`,
        [businessId]
      );

      const repMonthRes = await client.query<{ month_key: string; collected_sum: string }>(
        `SELECT
           TO_CHAR(paid_at, 'YYYY-MM') AS month_key,
           COALESCE(SUM(amount_received), 0)::text AS collected_sum
         FROM repayments
         WHERE business_id = $1 AND is_reversed = FALSE
         GROUP BY month_key`,
        [businessId]
      );

      const monthKeysSet = new Set<string>();
      for (const r of disbMonthRes.rows) monthKeysSet.add(r.month_key);
      for (const r of schedMonthRes.rows) monthKeysSet.add(r.month_key);
      for (const r of repMonthRes.rows) monthKeysSet.add(r.month_key);

      const sortedMonthKeys = Array.from(monthKeysSet).sort();
      const disbMap = new Map(disbMonthRes.rows.map((r) => [r.month_key, r.disbursed_sum]));
      const schedMap = new Map(schedMonthRes.rows.map((r) => [r.month_key, r.expected_sum]));
      const repMap = new Map(repMonthRes.rows.map((r) => [r.month_key, r.collected_sum]));

      const monthlyCashflow: MonthlyCashflowPointDTO[] = sortedMonthKeys.map((monthKey) => ({
        monthKey,
        disbursedPrincipal: toStorageMoney(disbMap.get(monthKey) ?? '0.0000'),
        expectedCollections: toStorageMoney(schedMap.get(monthKey) ?? '0.0000'),
        actualCollections: toStorageMoney(repMap.get(monthKey) ?? '0.0000'),
      }));

      // 8. Product Performance Breakdown
      const prodBreakRes = await client.query<{
        loan_product_id: UUID;
        loan_product_code: string;
        loan_product_name: string;
        loans_count: number;
        active_loans_count: number;
        disbursed_principal: string;
        principal_outstanding: string;
        total_collected: string;
      }>(
        `SELECT
           lp.id AS loan_product_id,
           lp.code AS loan_product_code,
           lp.name AS loan_product_name,
           COUNT(l.id)::int AS loans_count,
           COUNT(l.id) FILTER (WHERE l.status IN ('ACTIVE', 'OVERDUE', 'RESTRUCTURED'))::int AS active_loans_count,
           COALESCE(SUM(l.principal_amount) FILTER (WHERE l.status IN ('ACTIVE', 'OVERDUE', 'RESTRUCTURED', 'CLOSED_PAID', 'DEFAULTED', 'WRITTEN_OFF')), 0)::text AS disbursed_principal,
           COALESCE(SUM(l.principal_outstanding) FILTER (WHERE l.status IN ('ACTIVE', 'OVERDUE', 'RESTRUCTURED', 'DEFAULTED')), 0)::text AS principal_outstanding,
           COALESCE((
             SELECT SUM(r.amount_received)
             FROM repayments r
             JOIN loans rl ON rl.business_id = r.business_id AND rl.id = r.loan_id
             WHERE r.business_id = $1
               AND rl.loan_product_id = lp.id
               AND r.is_reversed = FALSE
           ), 0)::text AS total_collected
         FROM loan_products lp
         LEFT JOIN loans l
           ON l.business_id = lp.business_id AND l.loan_product_id = lp.id
         WHERE lp.business_id = $1
         GROUP BY lp.id, lp.code, lp.name
         ORDER BY lp.code ASC`,
        [businessId]
      );

      const productBreakdown: ProductPerformanceBreakdownDTO[] = prodBreakRes.rows.map((r) => ({
        loanProductId: r.loan_product_id,
        loanProductCode: r.loan_product_code,
        loanProductName: r.loan_product_name,
        loansCount: Number(r.loans_count),
        activeLoansCount: Number(r.active_loans_count),
        disbursedPrincipal: toStorageMoney(r.disbursed_principal),
        principalOutstanding: toStorageMoney(r.principal_outstanding),
        totalCollected: toStorageMoney(r.total_collected),
      }));

      return {
        kpis,
        parBuckets,
        par30RatioPercent: toStorageMoney(par30RatioDec),
        par90RatioPercent: toStorageMoney(par90RatioDec),
        monthlyCashflow,
        productBreakdown,
      };
    }
  );

  const recentRepayments = (
    await listTenantRepayments(businessId, actorUserId, { includeReversed: false })
  ).slice(0, 10);

  return {
    asOfDate: effectiveAsOfDate,
    ...dashboardCore,
    recentRepayments,
  };
}

/**
 * Generates a deterministic CSV financial portfolio statement (`reports:export`) for the tenant.
 */
export async function exportBusinessFinancialStatementCsv(
  businessId: UUID,
  actorUserId: UUID,
  asOfDate?: string
): Promise<{ fileName: string; csvContent: string }> {
  return withTenantTransaction(
    { businessId, actorUserId, isSuperAdmin: false },
    async (client) => {
      const loansRes = await client.query<{
        loan_number: string;
        customer_number: string;
        first_name: string;
        last_name: string;
        product_code: string;
        status: string;
        currency_code: string;
        principal_amount: string;
        total_interest_amount: string;
        total_fee_amount: string;
        total_penalty_amount: string;
        total_payable_amount: string;
        principal_outstanding: string;
        interest_outstanding: string;
        fee_outstanding: string;
        penalty_outstanding: string;
        total_outstanding: string;
        application_date: Date | string;
        maturity_date: Date | string | null;
      }>(
        `SELECT
           l.loan_number,
           c.customer_number,
           c.first_name,
           c.last_name,
           lp.code AS product_code,
           l.status,
           l.currency_code,
           l.principal_amount,
           l.total_interest_amount,
           l.total_fee_amount,
           l.total_penalty_amount,
           l.total_payable_amount,
           l.principal_outstanding,
           l.interest_outstanding,
           l.fee_outstanding,
           l.penalty_outstanding,
           l.total_outstanding,
           l.application_date,
           l.maturity_date
         FROM loans l
         JOIN customers c ON c.business_id = l.business_id AND c.id = l.customer_id
         JOIN loan_products lp ON lp.business_id = l.business_id AND lp.id = l.loan_product_id
         WHERE l.business_id = $1
         ORDER BY l.loan_number ASC`,
        [businessId]
      );

      const headers = [
        'loan_number',
        'customer_number',
        'customer_name',
        'product_code',
        'status',
        'currency',
        'principal_amount',
        'total_interest_amount',
        'total_fee_amount',
        'total_penalty_amount',
        'total_payable_amount',
        'principal_outstanding',
        'interest_outstanding',
        'fee_outstanding',
        'penalty_outstanding',
        'total_outstanding',
        'application_date',
        'maturity_date',
      ];

      const lines = [headers.join(',')];
      for (const r of loansRes.rows) {
        const customerName = `"${`${r.first_name} ${r.last_name}`.replace(/"/g, '""')}"`;
        lines.push(
          [
            r.loan_number,
            r.customer_number,
            customerName,
            r.product_code,
            r.status,
            r.currency_code,
            toStorageMoney(r.principal_amount),
            toStorageMoney(r.total_interest_amount),
            toStorageMoney(r.total_fee_amount),
            toStorageMoney(r.total_penalty_amount),
            toStorageMoney(r.total_payable_amount),
            toStorageMoney(r.principal_outstanding),
            toStorageMoney(r.interest_outstanding),
            toStorageMoney(r.fee_outstanding),
            toStorageMoney(r.penalty_outstanding),
            toStorageMoney(r.total_outstanding),
            toDateOnlyString(r.application_date),
            r.maturity_date ? toDateOnlyString(r.maturity_date) : '',
          ].join(',')
        );
      }

      const effectiveDate = asOfDate ?? new Date().toISOString().slice(0, 10);
      return {
        fileName: `flotech-portfolio-statement-${effectiveDate}.csv`,
        csvContent: lines.join('\n'),
      };
    }
  );
}

/**
 * Lists in-app notifications for the authenticated user within the business context (or platform-wide broadcasts).
 */
export async function listTenantNotifications(
  businessId: UUID,
  actorUserId: UUID,
  unreadOnly = false
): Promise<NotificationItemDTO[]> {
  return withTenantTransaction(
    { businessId, actorUserId, isSuperAdmin: false },
    async (client) => {
      const res = await client.query<{
        id: UUID;
        business_id: UUID | null;
        recipient_user_id: UUID;
        category: string;
        title: string;
        body: string;
        action_url: string | null;
        is_read: boolean;
        read_at: Date | string | null;
        created_at: Date | string;
      }>(
        `SELECT *
         FROM notifications
         WHERE recipient_user_id = $1
           AND (business_id = $2 OR business_id IS NULL)
           AND ($3::boolean = FALSE OR is_read = FALSE)
         ORDER BY created_at DESC
         LIMIT 100`,
        [actorUserId, businessId, unreadOnly]
      );

      return res.rows.map((r) => ({
        id: r.id,
        businessId: r.business_id,
        recipientUserId: r.recipient_user_id,
        category: r.category,
        title: r.title,
        body: r.body,
        actionUrl: r.action_url,
        isRead: r.is_read,
        readAt: toNullableIsoTimestamp(r.read_at),
        createdAt: toIsoTimestamp(r.created_at),
      }));
    }
  );
}

/**
 * Marks a notification as read (`is_read = TRUE`, `read_at = NOW()`).
 */
export async function markTenantNotificationRead(
  businessId: UUID,
  notificationId: UUID,
  actorUserId: UUID
): Promise<NotificationItemDTO> {
  return withTenantTransaction(
    { businessId, actorUserId, isSuperAdmin: false },
    async (client) => {
      const res = await client.query<{
        id: UUID;
        business_id: UUID | null;
        recipient_user_id: UUID;
        category: string;
        title: string;
        body: string;
        action_url: string | null;
        is_read: boolean;
        read_at: Date | string | null;
        created_at: Date | string;
      }>(
        `UPDATE notifications
         SET is_read = TRUE,
             read_at = COALESCE(read_at, NOW())
         WHERE id = $1
           AND recipient_user_id = $2
           AND (business_id = $3 OR business_id IS NULL)
         RETURNING *`,
        [notificationId, actorUserId, businessId]
      );

      const row = res.rows[0];
      if (!row) {
        throw new AppError(404, 'NOTIFICATION_NOT_FOUND', 'Notification was not found.');
      }

      return {
        id: row.id,
        businessId: row.business_id,
        recipientUserId: row.recipient_user_id,
        category: row.category,
        title: row.title,
        body: row.body,
        actionUrl: row.action_url,
        isRead: row.is_read,
        readAt: toNullableIsoTimestamp(row.read_at),
        createdAt: toIsoTimestamp(row.created_at),
      };
    }
  );
}
