import {
  EvaluateOverdueSchedulesRequestDTO,
  InstallmentStatus,
  InstallmentWithLoanContextDTO,
  InterestCalculationMethod,
  InterestRatePeriod,
  LoanDetailsResponseDTO,
  LoanDTO,
  LoanStatus,
  OverdueEvaluationResultDTO,
  OverdueLoanSummaryDTO,
  PlatformRole,
  RepaymentFrequency,
  RepaymentScheduleFilterParamsDTO,
  RepaymentScheduleInstallmentDTO,
  RestructureLoanRequestDTO,
  UUID,
  WriteOffLoanRequestDTO,
} from '@flotech/shared';
import { withTenantTransaction } from '../database/pool.js';
import {
  FinancialDecimal,
  generateLoanSchedulePreview,
  roundCurrencyUnit,
  toStorageMoney,
  toStorageRate,
} from '../financial/decimalEngine.js';
import { AppError } from '../middleware/errorHandler.js';

interface ScheduleWithContextRow {
  id: UUID;
  business_id: UUID;
  loan_id: UUID;
  installment_number: number;
  due_date: Date | string;
  status: InstallmentStatus;
  opening_principal_balance: string;
  principal_due: string;
  interest_due: string;
  fee_due: string;
  penalty_due: string;
  total_due: string;
  principal_paid: string;
  interest_paid: string;
  fee_paid: string;
  penalty_paid: string;
  total_paid: string;
  closing_principal_balance: string;
  paid_at: Date | string | null;
  loan_number: string;
  loan_status: LoanStatus;
  customer_id: UUID;
  customer_number: string;
  customer_first_name: string;
  customer_last_name: string;
  customer_phone_number: string;
  loan_product_id: UUID;
  loan_product_name: string;
  currency_code: string;
  grace_period_days: number;
  late_penalty_rate_percent: string;
}

interface LoanWithOverdueMetaRow {
  id: UUID;
  business_id: UUID;
  loan_number: string;
  customer_id: UUID;
  customer_number: string;
  customer_first_name: string;
  customer_last_name: string;
  customer_business_name: string | null;
  customer_phone_number: string;
  customer_email: string | null;
  loan_product_id: UUID;
  loan_product_code: string;
  loan_product_name: string;
  grace_period_days: number;
  late_penalty_rate_percent: string;
  status: LoanStatus;
  currency_code: string;
  interest_method: InterestCalculationMethod;
  repayment_frequency: RepaymentFrequency;
  nominal_interest_rate_percent: string;
  rate_period: InterestRatePeriod;
  term_installments: number;
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
  approved_at: Date | string | null;
  approved_by_user_id: UUID | null;
  disbursed_at: Date | string | null;
  disbursed_by_user_id: UUID | null;
  first_repayment_date: Date | string | null;
  maturity_date: Date | string | null;
  closed_at: Date | string | null;
  loan_officer_membership_id: UUID | null;
  purpose: string | null;
  created_by_user_id: UUID;
  created_at: Date | string;
  updated_at: Date | string;
}

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

function toNullableDateOnlyString(val: Date | string | null): string | null {
  if (!val) return null;
  return toDateOnlyString(val);
}

/**
 * Computes deterministic UTC calendar day difference (`asOfDate - dueDate`) for days-past-due metrics.
 */
export function computeDaysPastDue(dueDateIso: string, asOfDateIso: string, status: InstallmentStatus): number {
  if (status === InstallmentStatus.PAID || status === InstallmentStatus.WAIVED) {
    return 0;
  }
  const dueUtc = new Date(`${dueDateIso.slice(0, 10)}T00:00:00.000Z`).getTime();
  const asOfUtc = new Date(`${asOfDateIso.slice(0, 10)}T00:00:00.000Z`).getTime();
  const diffDays = Math.floor((asOfUtc - dueUtc) / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 0;
}

function mapScheduleWithContextRowToDTO(
  row: ScheduleWithContextRow,
  asOfDate: string
): InstallmentWithLoanContextDTO {
  const dueDateStr = toDateOnlyString(row.due_date);
  const totalDueDec = new FinancialDecimal(row.total_due);
  const totalPaidDec = new FinancialDecimal(row.total_paid);
  const unpaidBalanceDec = FinancialDecimal.max(
    new FinancialDecimal(0),
    totalDueDec.minus(totalPaidDec)
  );

  return {
    id: row.id,
    businessId: row.business_id,
    loanId: row.loan_id,
    installmentNumber: Number(row.installment_number),
    dueDate: dueDateStr,
    status: row.status,
    openingPrincipalBalance: toStorageMoney(row.opening_principal_balance),
    principalDue: toStorageMoney(row.principal_due),
    interestDue: toStorageMoney(row.interest_due),
    feeDue: toStorageMoney(row.fee_due),
    penaltyDue: toStorageMoney(row.penalty_due),
    totalDue: toStorageMoney(row.total_due),
    principalPaid: toStorageMoney(row.principal_paid),
    interestPaid: toStorageMoney(row.interest_paid),
    feePaid: toStorageMoney(row.fee_paid),
    penaltyPaid: toStorageMoney(row.penalty_paid),
    totalPaid: toStorageMoney(row.total_paid),
    closingPrincipalBalance: toStorageMoney(row.closing_principal_balance),
    paidAt: toNullableIsoTimestamp(row.paid_at),
    loanNumber: row.loan_number,
    loanStatus: row.loan_status,
    customerId: row.customer_id,
    customerNumber: row.customer_number,
    customerFullName: `${row.customer_first_name} ${row.customer_last_name}`.trim(),
    customerPhoneNumber: row.customer_phone_number,
    loanProductId: row.loan_product_id,
    loanProductName: row.loan_product_name,
    currencyCode: row.currency_code,
    gracePeriodDays: Number(row.grace_period_days),
    latePenaltyRatePercent: toStorageRate(row.late_penalty_rate_percent),
    unpaidInstallmentBalance: toStorageMoney(unpaidBalanceDec),
    daysPastDue: computeDaysPastDue(dueDateStr, asOfDate, row.status),
  };
}

function mapLoanRowToDTO(row: LoanWithOverdueMetaRow): LoanDTO {
  const isPostDisbursement =
    row.status === LoanStatus.ACTIVE ||
    row.status === LoanStatus.OVERDUE ||
    row.status === LoanStatus.CLOSED_PAID ||
    row.status === LoanStatus.RESTRUCTURED ||
    row.status === LoanStatus.DEFAULTED;

  const principalRepaidDec = isPostDisbursement
    ? FinancialDecimal.max(
        new FinancialDecimal(0),
        new FinancialDecimal(row.principal_amount).minus(
          new FinancialDecimal(row.principal_outstanding)
        )
      )
    : new FinancialDecimal(0);
  const interestCollectedDec = isPostDisbursement
    ? FinancialDecimal.max(
        new FinancialDecimal(0),
        new FinancialDecimal(row.total_interest_amount).minus(
          new FinancialDecimal(row.interest_outstanding)
        )
      )
    : new FinancialDecimal(0);
  const feeCollectedDec = isPostDisbursement
    ? FinancialDecimal.max(
        new FinancialDecimal(0),
        new FinancialDecimal(row.total_fee_amount).minus(
          new FinancialDecimal(row.fee_outstanding)
        )
      )
    : new FinancialDecimal(0);
  const penaltyCollectedDec = isPostDisbursement
    ? FinancialDecimal.max(
        new FinancialDecimal(0),
        new FinancialDecimal(row.total_penalty_amount).minus(
          new FinancialDecimal(row.penalty_outstanding)
        )
      )
    : new FinancialDecimal(0);
  const totalAmountPaidDec = principalRepaidDec
    .plus(interestCollectedDec)
    .plus(feeCollectedDec)
    .plus(penaltyCollectedDec);

  return {
    id: row.id,
    businessId: row.business_id,
    loanNumber: row.loan_number,
    customerId: row.customer_id,
    customerNumber: row.customer_number,
    customerFullName: `${row.customer_first_name} ${row.customer_last_name}`.trim(),
    customerBusinessName: row.customer_business_name,
    loanProductId: row.loan_product_id,
    loanProductCode: row.loan_product_code,
    loanProductName: row.loan_product_name,
    status: row.status,
    currencyCode: row.currency_code,
    interestMethod: row.interest_method,
    repaymentFrequency: row.repayment_frequency,
    nominalInterestRatePercent: toStorageRate(row.nominal_interest_rate_percent),
    ratePeriod: row.rate_period,
    termInstallments: Number(row.term_installments),
    principalAmount: toStorageMoney(row.principal_amount),
    totalInterestAmount: toStorageMoney(row.total_interest_amount),
    totalFeeAmount: toStorageMoney(row.total_fee_amount),
    totalPenaltyAmount: toStorageMoney(row.total_penalty_amount),
    totalPayableAmount: toStorageMoney(row.total_payable_amount),
    principalRepaid: toStorageMoney(principalRepaidDec),
    interestCollected: toStorageMoney(interestCollectedDec),
    feeCollected: toStorageMoney(feeCollectedDec),
    penaltyCollected: toStorageMoney(penaltyCollectedDec),
    totalAmountPaid: toStorageMoney(totalAmountPaidDec),
    principalOutstanding: toStorageMoney(row.principal_outstanding),
    interestOutstanding: toStorageMoney(row.interest_outstanding),
    feeOutstanding: toStorageMoney(row.fee_outstanding),
    penaltyOutstanding: toStorageMoney(row.penalty_outstanding),
    totalOutstanding: toStorageMoney(row.total_outstanding),
    applicationDate: toDateOnlyString(row.application_date),
    approvedAt: toNullableIsoTimestamp(row.approved_at),
    approvedByUserId: row.approved_by_user_id,
    disbursedAt: toNullableIsoTimestamp(row.disbursed_at),
    disbursedByUserId: row.disbursed_by_user_id,
    firstRepaymentDate: toNullableDateOnlyString(row.first_repayment_date),
    maturityDate: toNullableDateOnlyString(row.maturity_date),
    closedAt: toNullableIsoTimestamp(row.closed_at),
    loanOfficerMembershipId: row.loan_officer_membership_id,
    purpose: row.purpose,
    createdByUserId: row.created_by_user_id,
    createdAt: toIsoTimestamp(row.created_at),
    updatedAt: toIsoTimestamp(row.updated_at),
  };
}

/**
 * Lists tenant repayment schedule installments joined with loan, customer, and product metadata.
 */
export async function listTenantRepaymentSchedules(
  businessId: UUID,
  actorUserId: UUID,
  filters: RepaymentScheduleFilterParamsDTO
): Promise<InstallmentWithLoanContextDTO[]> {
  const effectiveAsOfDate = filters.asOfDate ?? new Date().toISOString().slice(0, 10);

  return withTenantTransaction(
    { businessId, actorUserId, isSuperAdmin: false },
    async (client) => {
      const conditions: string[] = ['rs.business_id = $1'];
      const params: unknown[] = [businessId];

      if (filters.status) {
        params.push(filters.status);
        conditions.push(`rs.status = $${params.length}`);
      }

      if (filters.loanId) {
        params.push(filters.loanId);
        conditions.push(`rs.loan_id = $${params.length}`);
      }

      if (filters.customerId) {
        params.push(filters.customerId);
        conditions.push(`l.customer_id = $${params.length}`);
      }

      if (filters.dueFrom) {
        params.push(filters.dueFrom);
        conditions.push(`rs.due_date >= $${params.length}::date`);
      }

      if (filters.dueTo) {
        params.push(filters.dueTo);
        conditions.push(`rs.due_date <= $${params.length}::date`);
      }

      if (filters.overdueOnly) {
        params.push(effectiveAsOfDate);
        conditions.push(
          `(rs.status = 'OVERDUE' OR (rs.status IN ('PENDING', 'PARTIALLY_PAID') AND rs.due_date < $${params.length}::date))`
        );
      }

      const res = await client.query<ScheduleWithContextRow>(
        `SELECT
           rs.*,
           l.loan_number,
           l.status AS loan_status,
           l.customer_id,
           c.customer_number,
           c.first_name AS customer_first_name,
           c.last_name AS customer_last_name,
           c.phone_number AS customer_phone_number,
           l.loan_product_id,
           lp.name AS loan_product_name,
           l.currency_code,
           lp.grace_period_days,
           lp.late_penalty_rate_percent
         FROM repayment_schedules rs
         JOIN loans l
           ON l.business_id = rs.business_id AND l.id = rs.loan_id
         JOIN customers c
           ON c.business_id = l.business_id AND c.id = l.customer_id
         JOIN loan_products lp
           ON lp.business_id = l.business_id AND lp.id = l.loan_product_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY rs.due_date ASC, l.loan_number ASC, rs.installment_number ASC`,
        params
      );

      return res.rows.map((row) => mapScheduleWithContextRowToDTO(row, effectiveAsOfDate));
    }
  );
}

/**
 * Evaluates all tenant installments against their product's `grace_period_days` as of `asOfDate`.
 * - Transitions past-grace `PENDING` / `PARTIALLY_PAID` installments to `OVERDUE`.
 * - Transitions parent `ACTIVE` / `RESTRUCTURED` loans to `OVERDUE`.
 * - When `applyLatePenalties === true` and `late_penalty_rate_percent > 0` and `penalty_due == 0`,
 *   computes deterministic late penalty on unpaid installment principal via `Decimal.js` and
 *   atomically updates both `repayment_schedules` and `loans` ledger balances.
 */
export async function evaluateTenantDelinquencyAndPenalties(
  businessId: UUID,
  actorUserId: UUID,
  actorPlatformRole: PlatformRole,
  input: EvaluateOverdueSchedulesRequestDTO,
  auditMeta: { ipAddress: string | null; userAgent: string | null }
): Promise<OverdueEvaluationResultDTO> {
  const effectiveAsOfDate = input.asOfDate ?? new Date().toISOString().slice(0, 10);
  const applyLatePenalties = input.applyLatePenalties ?? true;

  return withTenantTransaction(
    { businessId, actorUserId, isSuperAdmin: false },
    async (client) => {
      // Find all unpaid installments on ACTIVE, OVERDUE, or RESTRUCTURED loans where (due_date + grace_period_days) < asOfDate
      const candidateRes = await client.query<{
        schedule_id: UUID;
        loan_id: UUID;
        installment_number: number;
        due_date: Date | string;
        schedule_status: InstallmentStatus;
        principal_due: string;
        principal_paid: string;
        penalty_due: string;
        total_due: string;
        loan_status: LoanStatus;
        grace_period_days: number;
        late_penalty_rate_percent: string;
      }>(
        `SELECT
           rs.id AS schedule_id,
           rs.loan_id,
           rs.installment_number,
           rs.due_date,
           rs.status AS schedule_status,
           rs.principal_due,
           rs.principal_paid,
           rs.penalty_due,
           rs.total_due,
           l.status AS loan_status,
           lp.grace_period_days,
           lp.late_penalty_rate_percent
         FROM repayment_schedules rs
         JOIN loans l
           ON l.business_id = rs.business_id AND l.id = rs.loan_id
         JOIN loan_products lp
           ON lp.business_id = l.business_id AND lp.id = l.loan_product_id
         WHERE rs.business_id = $1
           AND l.status IN ('ACTIVE', 'OVERDUE', 'RESTRUCTURED')
           AND rs.status IN ('PENDING', 'PARTIALLY_PAID', 'OVERDUE')
           AND (rs.due_date + (lp.grace_period_days || ' days')::interval)::date < $2::date
         ORDER BY rs.due_date ASC, rs.installment_number ASC
         FOR UPDATE OF rs, l`,
        [businessId, effectiveAsOfDate]
      );

      let installmentsMarkedOverdue = 0;
      let penaltiesAccruedCount = 0;
      let totalPenaltyAccruedDec = new FinancialDecimal(0);
      const loansToMarkOverdue = new Set<UUID>();
      const loanPenaltyDeltas = new Map<UUID, InstanceType<typeof FinancialDecimal>>();

      for (const row of candidateRes.rows) {
        const shouldMarkInstallmentOverdue = row.schedule_status !== InstallmentStatus.OVERDUE;
        if (shouldMarkInstallmentOverdue) {
          installmentsMarkedOverdue += 1;
        }

        if (row.loan_status !== LoanStatus.OVERDUE) {
          loansToMarkOverdue.add(row.loan_id);
        }

        const existingPenaltyDueDec = new FinancialDecimal(row.penalty_due);
        const latePenaltyRateDec = new FinancialDecimal(row.late_penalty_rate_percent);
        const unpaidPrincipalDec = FinancialDecimal.max(
          new FinancialDecimal(0),
          new FinancialDecimal(row.principal_due).minus(new FinancialDecimal(row.principal_paid))
        );

        let newlyAccruedPenaltyDec = new FinancialDecimal(0);
        if (
          applyLatePenalties &&
          existingPenaltyDueDec.isZero() &&
          latePenaltyRateDec.greaterThan(0) &&
          unpaidPrincipalDec.greaterThan(0)
        ) {
          newlyAccruedPenaltyDec = roundCurrencyUnit(
            unpaidPrincipalDec.mul(latePenaltyRateDec).div(100)
          );
        }

        if (shouldMarkInstallmentOverdue || newlyAccruedPenaltyDec.greaterThan(0)) {
          const updatedPenaltyDueDec = existingPenaltyDueDec.plus(newlyAccruedPenaltyDec);
          const updatedTotalDueDec = new FinancialDecimal(row.total_due).plus(
            newlyAccruedPenaltyDec
          );

          await client.query(
            `UPDATE repayment_schedules
             SET status = 'OVERDUE',
                 penalty_due = $3,
                 total_due = $4,
                 updated_at = NOW()
             WHERE business_id = $1 AND id = $2`,
            [
              businessId,
              row.schedule_id,
              toStorageMoney(updatedPenaltyDueDec),
              toStorageMoney(updatedTotalDueDec),
            ]
          );
        }

        if (newlyAccruedPenaltyDec.greaterThan(0)) {
          penaltiesAccruedCount += 1;
          totalPenaltyAccruedDec = totalPenaltyAccruedDec.plus(newlyAccruedPenaltyDec);
          const prevLoanDelta = loanPenaltyDeltas.get(row.loan_id) ?? new FinancialDecimal(0);
          loanPenaltyDeltas.set(row.loan_id, prevLoanDelta.plus(newlyAccruedPenaltyDec));
        }
      }

      // Apply loan status transitions to OVERDUE and penalty ledger increments
      const affectedLoanIds = new Set<UUID>([
        ...loansToMarkOverdue,
        ...loanPenaltyDeltas.keys(),
      ]);

      for (const loanId of affectedLoanIds) {
        const loanCurrentRes = await client.query<{
          total_penalty_amount: string;
          total_payable_amount: string;
          penalty_outstanding: string;
          total_outstanding: string;
        }>(
          `SELECT
             total_penalty_amount,
             total_payable_amount,
             penalty_outstanding,
             total_outstanding
           FROM loans
           WHERE business_id = $1 AND id = $2
           FOR UPDATE`,
          [businessId, loanId]
        );
        const loanCurrent = loanCurrentRes.rows[0];
        if (!loanCurrent) continue;

        const deltaDec = loanPenaltyDeltas.get(loanId) ?? new FinancialDecimal(0);
        const newTotalPenalty = new FinancialDecimal(loanCurrent.total_penalty_amount).plus(deltaDec);
        const newTotalPayable = new FinancialDecimal(loanCurrent.total_payable_amount).plus(deltaDec);
        const newPenaltyOutstanding = new FinancialDecimal(loanCurrent.penalty_outstanding).plus(
          deltaDec
        );
        const newTotalOutstanding = new FinancialDecimal(loanCurrent.total_outstanding).plus(
          deltaDec
        );

        await client.query(
          `UPDATE loans
           SET status = 'OVERDUE',
               total_penalty_amount = $3,
               total_payable_amount = $4,
               penalty_outstanding = $5,
               total_outstanding = $6,
               updated_at = NOW()
           WHERE business_id = $1 AND id = $2`,
          [
            businessId,
            loanId,
            toStorageMoney(newTotalPenalty),
            toStorageMoney(newTotalPayable),
            toStorageMoney(newPenaltyOutstanding),
            toStorageMoney(newTotalOutstanding),
          ]
        );
      }

      const result: OverdueEvaluationResultDTO = {
        evaluatedAt: new Date().toISOString(),
        asOfDate: effectiveAsOfDate,
        installmentsMarkedOverdue,
        loansMarkedOverdue: loansToMarkOverdue.size,
        penaltiesAccruedCount,
        totalPenaltyAccruedAmount: toStorageMoney(totalPenaltyAccruedDec),
      };

      await client.query(
        `INSERT INTO audit_logs (
           business_id, actor_user_id, actor_platform_role, action, entity_type, entity_id, before_state, after_state, ip_address, user_agent
         )
         VALUES ($1, $2, $3, 'DELINQUENCY_AND_PENALTIES_EVALUATED', 'repayment_schedules', NULL, $4::jsonb, $5::jsonb, $6, $7)`,
        [
          businessId,
          actorUserId,
          actorPlatformRole,
          JSON.stringify({ asOfDate: effectiveAsOfDate, applyLatePenalties }),
          JSON.stringify(result),
          auditMeta.ipAddress,
          auditMeta.userAgent,
        ]
      );

      return result;
    }
  );
}

/**
 * Lists all delinquent/overdue loans in the business with aggregated overdue installment balances and days past due.
 */
export async function listTenantOverdueLoans(
  businessId: UUID,
  actorUserId: UUID,
  asOfDate?: string
): Promise<OverdueLoanSummaryDTO[]> {
  const effectiveAsOfDate = asOfDate ?? new Date().toISOString().slice(0, 10);

  return withTenantTransaction(
    { businessId, actorUserId, isSuperAdmin: false },
    async (client) => {
      const loansRes = await client.query<LoanWithOverdueMetaRow>(
        `SELECT
           l.*,
           c.customer_number,
           c.first_name AS customer_first_name,
           c.last_name AS customer_last_name,
           c.business_name AS customer_business_name,
           c.phone_number AS customer_phone_number,
           c.email AS customer_email,
           lp.code AS loan_product_code,
           lp.name AS loan_product_name,
           lp.grace_period_days,
           lp.late_penalty_rate_percent
         FROM loans l
         JOIN customers c
           ON c.business_id = l.business_id AND c.id = l.customer_id
         JOIN loan_products lp
           ON lp.business_id = l.business_id AND lp.id = l.loan_product_id
         WHERE l.business_id = $1
           AND (
             l.status = 'OVERDUE'
             OR EXISTS (
               SELECT 1
               FROM repayment_schedules rs
               WHERE rs.business_id = l.business_id
                 AND rs.loan_id = l.id
                 AND (
                   rs.status = 'OVERDUE'
                   OR (rs.status IN ('PENDING', 'PARTIALLY_PAID') AND rs.due_date < $2::date)
                 )
             )
           )
         ORDER BY l.updated_at DESC`,
        [businessId, effectiveAsOfDate]
      );

      if (loansRes.rows.length === 0) {
        return [];
      }

      const loanIds = loansRes.rows.map((r) => r.id);
      const schedulesRes = await client.query<{
        loan_id: UUID;
        due_date: Date | string;
        status: InstallmentStatus;
        total_due: string;
        total_paid: string;
      }>(
        `SELECT
           loan_id,
           due_date,
           status,
           total_due,
           total_paid
         FROM repayment_schedules
         WHERE business_id = $1
           AND loan_id = ANY($2::uuid[])
           AND (
             status = 'OVERDUE'
             OR (status IN ('PENDING', 'PARTIALLY_PAID') AND due_date < $3::date)
           )
         ORDER BY due_date ASC`,
        [businessId, loanIds, effectiveAsOfDate]
      );

      const schedulesByLoan = new Map<
        UUID,
        Array<{ dueDate: string; status: InstallmentStatus; unpaidDec: InstanceType<typeof FinancialDecimal> }>
      >();

      for (const sRow of schedulesRes.rows) {
        const dueStr = toDateOnlyString(sRow.due_date);
        const unpaidDec = FinancialDecimal.max(
          new FinancialDecimal(0),
          new FinancialDecimal(sRow.total_due).minus(new FinancialDecimal(sRow.total_paid))
        );
        const list = schedulesByLoan.get(sRow.loan_id) ?? [];
        list.push({ dueDate: dueStr, status: sRow.status, unpaidDec });
        schedulesByLoan.set(sRow.loan_id, list);
      }

      return loansRes.rows.map((row) => {
        const loanDto = mapLoanRowToDTO(row);
        const overdueItems = schedulesByLoan.get(row.id) ?? [];
        let totalOverdueDec = new FinancialDecimal(0);
        let oldestDueDate: string | null = null;
        let maxDpd = 0;

        for (const item of overdueItems) {
          totalOverdueDec = totalOverdueDec.plus(item.unpaidDec);
          if (!oldestDueDate || item.dueDate < oldestDueDate) {
            oldestDueDate = item.dueDate;
          }
          const dpd = computeDaysPastDue(item.dueDate, effectiveAsOfDate, InstallmentStatus.OVERDUE);
          if (dpd > maxDpd) {
            maxDpd = dpd;
          }
        }

        return {
          loan: loanDto,
          customerPhoneNumber: row.customer_phone_number,
          customerEmail: row.customer_email,
          gracePeriodDays: Number(row.grace_period_days),
          latePenaltyRatePercent: toStorageRate(row.late_penalty_rate_percent),
          overdueInstallmentsCount: overdueItems.length,
          totalOverdueAmount: toStorageMoney(totalOverdueDec),
          oldestOverdueDueDate: oldestDueDate,
          maxDaysPastDue: maxDpd,
        };
      });
    }
  );
}

/**
 * Restructures an `ACTIVE` or `OVERDUE` loan (`loans:restructure`):
 * - Preserves already `PAID` installments (and paid portion of `PARTIALLY_PAID` installments).
 * - Replaces remaining unpaid installments with a newly generated deterministic `Decimal.js` schedule
 *   for the current `principal_outstanding` over `newTermInstallments` starting at `newFirstRepaymentDate`.
 * - Optionally waives unpaid penalties (`waiveUnpaidPenalties === true`).
 * - Updates loan status to `RESTRUCTURED` and records full before/after state in `audit_logs`.
 */
export async function restructureTenantLoan(
  businessId: UUID,
  loanId: UUID,
  actorUserId: UUID,
  actorPlatformRole: PlatformRole,
  input: RestructureLoanRequestDTO,
  auditMeta: { ipAddress: string | null; userAgent: string | null }
): Promise<LoanDetailsResponseDTO> {
  return withTenantTransaction(
    { businessId, actorUserId, isSuperAdmin: false },
    async (client) => {
      const loanRes = await client.query<LoanWithOverdueMetaRow>(
        `SELECT
           l.*,
           c.customer_number,
           c.first_name AS customer_first_name,
           c.last_name AS customer_last_name,
           c.business_name AS customer_business_name,
           c.phone_number AS customer_phone_number,
           c.email AS customer_email,
           lp.code AS loan_product_code,
           lp.name AS loan_product_name,
           lp.grace_period_days,
           lp.late_penalty_rate_percent
         FROM loans l
         JOIN customers c
           ON c.business_id = l.business_id AND c.id = l.customer_id
         JOIN loan_products lp
           ON lp.business_id = l.business_id AND lp.id = l.loan_product_id
         WHERE l.business_id = $1 AND l.id = $2
         FOR UPDATE OF l`,
        [businessId, loanId]
      );

      const loanRow = loanRes.rows[0];
      if (!loanRow) {
        throw new AppError(404, 'LOAN_NOT_FOUND', 'Loan was not found in this business.');
      }

      if (
        loanRow.status !== LoanStatus.ACTIVE &&
        loanRow.status !== LoanStatus.OVERDUE &&
        loanRow.status !== LoanStatus.RESTRUCTURED
      ) {
        throw new AppError(
          409,
          'INVALID_LOAN_STATUS_FOR_RESTRUCTURE',
          `Only ACTIVE, OVERDUE, or RESTRUCTURED loans can be restructured (current status: ${loanRow.status}).`
        );
      }

      const principalOutstandingDec = new FinancialDecimal(loanRow.principal_outstanding);
      if (principalOutstandingDec.lessThanOrEqualTo(0)) {
        throw new AppError(
          409,
          'NO_PRINCIPAL_OUTSTANDING_TO_RESTRUCTURE',
          'Cannot restructure a loan with zero remaining principal outstanding.'
        );
      }

      const effectiveNominalRate = toStorageRate(
        input.newNominalInterestRatePercent ?? loanRow.nominal_interest_rate_percent
      );

      // Inspect existing schedules: keep PAID rows and lock in paid portion of PARTIALLY_PAID rows; delete unpaid rows
      const existingSchedulesRes = await client.query<{
        id: UUID;
        installment_number: number;
        status: InstallmentStatus;
        principal_paid: string;
        interest_paid: string;
        fee_paid: string;
        penalty_paid: string;
        total_paid: string;
      }>(
        `SELECT
           id,
           installment_number,
           status,
           principal_paid,
           interest_paid,
           fee_paid,
           penalty_paid,
           total_paid
         FROM repayment_schedules
         WHERE business_id = $1 AND loan_id = $2
         ORDER BY installment_number ASC
         FOR UPDATE`,
        [businessId, loanId]
      );

      let preservedInstallmentNumber = 0;
      let interestAlreadyPaidDec = new FinancialDecimal(0);
      let penaltyAlreadyPaidDec = new FinancialDecimal(0);

      for (const sRow of existingSchedulesRes.rows) {
        const totalPaidRowDec = new FinancialDecimal(sRow.total_paid);
        interestAlreadyPaidDec = interestAlreadyPaidDec.plus(new FinancialDecimal(sRow.interest_paid));
        penaltyAlreadyPaidDec = penaltyAlreadyPaidDec.plus(new FinancialDecimal(sRow.penalty_paid));

        if (sRow.status === InstallmentStatus.PAID) {
          preservedInstallmentNumber = Math.max(preservedInstallmentNumber, Number(sRow.installment_number));
        } else if (totalPaidRowDec.greaterThan(0)) {
          // Lock the partially paid installment at its paid amounts and mark PAID so history is preserved
          preservedInstallmentNumber = Math.max(preservedInstallmentNumber, Number(sRow.installment_number));
          await client.query(
            `UPDATE repayment_schedules
             SET status = 'PAID',
                 principal_due = principal_paid,
                 interest_due = interest_paid,
                 fee_due = fee_paid,
                 penalty_due = penalty_paid,
                 total_due = total_paid,
                 closing_principal_balance = $3,
                 paid_at = COALESCE(paid_at, NOW()),
                 updated_at = NOW()
             WHERE business_id = $1 AND id = $2`,
            [businessId, sRow.id, toStorageMoney(principalOutstandingDec)]
          );
        } else {
          // Completely unpaid installment — remove so new restructured schedule replaces it cleanly
          await client.query(
            `DELETE FROM repayment_schedules WHERE business_id = $1 AND id = $2`,
            [businessId, sRow.id]
          );
        }
      }

      // Generate deterministic schedule for remaining principal_outstanding
      const restructuredPreview = generateLoanSchedulePreview({
        principalAmount: toStorageMoney(principalOutstandingDec),
        nominalInterestRatePercent: effectiveNominalRate,
        ratePeriod: loanRow.rate_period,
        interestMethod: loanRow.interest_method,
        repaymentFrequency: loanRow.repayment_frequency,
        termInstallments: input.newTermInstallments,
        firstRepaymentDate: input.newFirstRepaymentDate,
        originationFeeFixed: '0.0000',
        originationFeePercent: '0.000000',
      });

      const waivePenalties = input.waiveUnpaidPenalties ?? false;
      const newPenaltyOutstandingDec = waivePenalties
        ? new FinancialDecimal(0)
        : new FinancialDecimal(loanRow.penalty_outstanding);

      for (let i = 0; i < restructuredPreview.installments.length; i += 1) {
        const inst = restructuredPreview.installments[i]!;
        const carryPenaltyDec =
          i === 0 ? newPenaltyOutstandingDec : new FinancialDecimal(0);
        const totalDueWithCarryPenaltyDec = new FinancialDecimal(inst.totalDue).plus(
          carryPenaltyDec
        );

        await client.query(
          `INSERT INTO repayment_schedules (
             business_id,
             loan_id,
             installment_number,
             due_date,
             status,
             opening_principal_balance,
             principal_due,
             interest_due,
             fee_due,
             penalty_due,
             total_due,
             principal_paid,
             interest_paid,
             fee_paid,
             penalty_paid,
             total_paid,
             closing_principal_balance
           )
           VALUES (
             $1, $2, $3, $4, 'PENDING',
             $5, $6, $7, '0.0000', $8, $9,
             '0.0000', '0.0000', '0.0000', '0.0000', '0.0000',
             $10
           )`,
          [
            businessId,
            loanId,
            preservedInstallmentNumber + inst.installmentNumber,
            inst.dueDate,
            inst.openingBalance,
            inst.principalDue,
            inst.interestDue,
            toStorageMoney(carryPenaltyDec),
            toStorageMoney(totalDueWithCarryPenaltyDec),
            inst.closingBalance,
          ]
        );
      }

      const newInterestOutstandingDec = new FinancialDecimal(restructuredPreview.totalInterestAmount);
      const newTotalInterestAmountDec = interestAlreadyPaidDec.plus(newInterestOutstandingDec);
      const feeOutstandingDec = new FinancialDecimal(loanRow.fee_outstanding);
      const newTotalPenaltyAmountDec = penaltyAlreadyPaidDec.plus(newPenaltyOutstandingDec);
      const newTotalOutstandingDec = principalOutstandingDec
        .plus(newInterestOutstandingDec)
        .plus(feeOutstandingDec)
        .plus(newPenaltyOutstandingDec);
      const newTotalPayableAmountDec = new FinancialDecimal(loanRow.principal_amount)
        .plus(newTotalInterestAmountDec)
        .plus(new FinancialDecimal(loanRow.total_fee_amount))
        .plus(newTotalPenaltyAmountDec);

      const lastInst =
        restructuredPreview.installments[restructuredPreview.installments.length - 1];
      const newMaturityDate = lastInst ? lastInst.dueDate : input.newFirstRepaymentDate;
      const totalTermInstallments = preservedInstallmentNumber + input.newTermInstallments;

      await client.query(
        `UPDATE loans
         SET status = 'RESTRUCTURED',
             nominal_interest_rate_percent = $3,
             term_installments = $4,
             total_interest_amount = $5,
             total_penalty_amount = $6,
             total_payable_amount = $7,
             interest_outstanding = $8,
             penalty_outstanding = $9,
             total_outstanding = $10,
             maturity_date = $11,
             updated_at = NOW()
         WHERE business_id = $1 AND id = $2`,
        [
          businessId,
          loanId,
          effectiveNominalRate,
          totalTermInstallments,
          toStorageMoney(newTotalInterestAmountDec),
          toStorageMoney(newTotalPenaltyAmountDec),
          toStorageMoney(newTotalPayableAmountDec),
          toStorageMoney(newInterestOutstandingDec),
          toStorageMoney(newPenaltyOutstandingDec),
          toStorageMoney(newTotalOutstandingDec),
          newMaturityDate,
        ]
      );

      await client.query(
        `INSERT INTO audit_logs (
           business_id, actor_user_id, actor_platform_role, action, entity_type, entity_id, before_state, after_state, ip_address, user_agent
         )
         VALUES ($1, $2, $3, 'LOAN_RESTRUCTURED', 'loans', $4, $5::jsonb, $6::jsonb, $7, $8)`,
        [
          businessId,
          actorUserId,
          actorPlatformRole,
          loanId,
          JSON.stringify({
            status: loanRow.status,
            termInstallments: Number(loanRow.term_installments),
            nominalInterestRatePercent: toStorageRate(loanRow.nominal_interest_rate_percent),
            principalOutstanding: toStorageMoney(loanRow.principal_outstanding),
            interestOutstanding: toStorageMoney(loanRow.interest_outstanding),
            penaltyOutstanding: toStorageMoney(loanRow.penalty_outstanding),
            totalOutstanding: toStorageMoney(loanRow.total_outstanding),
          }),
          JSON.stringify({
            status: LoanStatus.RESTRUCTURED,
            newTermInstallments: input.newTermInstallments,
            totalTermInstallments,
            nominalInterestRatePercent: effectiveNominalRate,
            newFirstRepaymentDate: input.newFirstRepaymentDate,
            newMaturityDate,
            waiveUnpaidPenalties: waivePenalties,
            interestOutstanding: toStorageMoney(newInterestOutstandingDec),
            penaltyOutstanding: toStorageMoney(newPenaltyOutstandingDec),
            totalOutstanding: toStorageMoney(newTotalOutstandingDec),
            reason: input.reason,
          }),
          auditMeta.ipAddress,
          auditMeta.userAgent,
        ]
      );

      const updatedLoanRes = await client.query<LoanWithOverdueMetaRow>(
        `SELECT
           l.*,
           c.customer_number,
           c.first_name AS customer_first_name,
           c.last_name AS customer_last_name,
           c.business_name AS customer_business_name,
           c.phone_number AS customer_phone_number,
           c.email AS customer_email,
           lp.code AS loan_product_code,
           lp.name AS loan_product_name,
           lp.grace_period_days,
           lp.late_penalty_rate_percent
         FROM loans l
         JOIN customers c
           ON c.business_id = l.business_id AND c.id = l.customer_id
         JOIN loan_products lp
           ON lp.business_id = l.business_id AND lp.id = l.loan_product_id
         WHERE l.business_id = $1 AND l.id = $2`,
        [businessId, loanId]
      );

      const schedulesOutRes = await client.query<{
        id: UUID;
        business_id: UUID;
        loan_id: UUID;
        installment_number: number;
        due_date: Date | string;
        status: InstallmentStatus;
        opening_principal_balance: string;
        principal_due: string;
        interest_due: string;
        fee_due: string;
        penalty_due: string;
        total_due: string;
        principal_paid: string;
        interest_paid: string;
        fee_paid: string;
        penalty_paid: string;
        total_paid: string;
        closing_principal_balance: string;
        paid_at: Date | string | null;
      }>(
        `SELECT *
         FROM repayment_schedules
         WHERE business_id = $1 AND loan_id = $2
         ORDER BY installment_number ASC`,
        [businessId, loanId]
      );

      const schedules: RepaymentScheduleInstallmentDTO[] = schedulesOutRes.rows.map((r) => ({
        id: r.id,
        businessId: r.business_id,
        loanId: r.loan_id,
        installmentNumber: Number(r.installment_number),
        dueDate: toDateOnlyString(r.due_date),
        status: r.status,
        openingPrincipalBalance: toStorageMoney(r.opening_principal_balance),
        principalDue: toStorageMoney(r.principal_due),
        interestDue: toStorageMoney(r.interest_due),
        feeDue: toStorageMoney(r.fee_due),
        penaltyDue: toStorageMoney(r.penalty_due),
        totalDue: toStorageMoney(r.total_due),
        principalPaid: toStorageMoney(r.principal_paid),
        interestPaid: toStorageMoney(r.interest_paid),
        feePaid: toStorageMoney(r.fee_paid),
        penaltyPaid: toStorageMoney(r.penalty_paid),
        totalPaid: toStorageMoney(r.total_paid),
        closingPrincipalBalance: toStorageMoney(r.closing_principal_balance),
        paidAt: toNullableIsoTimestamp(r.paid_at),
      }));

      return {
        loan: mapLoanRowToDTO(updatedLoanRes.rows[0]!),
        schedules,
      };
    }
  );
}

/**
 * Writes off an uncollectible `ACTIVE`, `OVERDUE`, `DEFAULTED`, or `RESTRUCTURED` loan (`loans:write_off`).
 * Marks remaining unpaid installments as `WAIVED`, sets loan status to `WRITTEN_OFF`, and records an audit log.
 */
export async function writeOffTenantLoan(
  businessId: UUID,
  loanId: UUID,
  actorUserId: UUID,
  actorPlatformRole: PlatformRole,
  input: WriteOffLoanRequestDTO,
  auditMeta: { ipAddress: string | null; userAgent: string | null }
): Promise<LoanDTO> {
  return withTenantTransaction(
    { businessId, actorUserId, isSuperAdmin: false },
    async (client) => {
      const loanRes = await client.query<LoanWithOverdueMetaRow>(
        `SELECT
           l.*,
           c.customer_number,
           c.first_name AS customer_first_name,
           c.last_name AS customer_last_name,
           c.business_name AS customer_business_name,
           c.phone_number AS customer_phone_number,
           c.email AS customer_email,
           lp.code AS loan_product_code,
           lp.name AS loan_product_name,
           lp.grace_period_days,
           lp.late_penalty_rate_percent
         FROM loans l
         JOIN customers c
           ON c.business_id = l.business_id AND c.id = l.customer_id
         JOIN loan_products lp
           ON lp.business_id = l.business_id AND lp.id = l.loan_product_id
         WHERE l.business_id = $1 AND l.id = $2
         FOR UPDATE OF l`,
        [businessId, loanId]
      );

      const loanRow = loanRes.rows[0];
      if (!loanRow) {
        throw new AppError(404, 'LOAN_NOT_FOUND', 'Loan was not found in this business.');
      }

      if (
        loanRow.status !== LoanStatus.ACTIVE &&
        loanRow.status !== LoanStatus.OVERDUE &&
        loanRow.status !== LoanStatus.DEFAULTED &&
        loanRow.status !== LoanStatus.RESTRUCTURED
      ) {
        throw new AppError(
          409,
          'INVALID_LOAN_STATUS_FOR_WRITE_OFF',
          `Only ACTIVE, OVERDUE, DEFAULTED, or RESTRUCTURED loans can be written off (current status: ${loanRow.status}).`
        );
      }

      await client.query(
        `UPDATE repayment_schedules
         SET status = 'WAIVED',
             updated_at = NOW()
         WHERE business_id = $1
           AND loan_id = $2
           AND status IN ('PENDING', 'PARTIALLY_PAID', 'OVERDUE')`,
        [businessId, loanId]
      );

      await client.query(
        `UPDATE loans
         SET status = 'WRITTEN_OFF',
             closed_at = NOW(),
             updated_at = NOW()
         WHERE business_id = $1 AND id = $2`,
        [businessId, loanId]
      );

      await client.query(
        `INSERT INTO audit_logs (
           business_id, actor_user_id, actor_platform_role, action, entity_type, entity_id, before_state, after_state, ip_address, user_agent
         )
         VALUES ($1, $2, $3, 'LOAN_WRITTEN_OFF', 'loans', $4, $5::jsonb, $6::jsonb, $7, $8)`,
        [
          businessId,
          actorUserId,
          actorPlatformRole,
          loanId,
          JSON.stringify({
            status: loanRow.status,
            principalOutstanding: toStorageMoney(loanRow.principal_outstanding),
            interestOutstanding: toStorageMoney(loanRow.interest_outstanding),
            penaltyOutstanding: toStorageMoney(loanRow.penalty_outstanding),
            totalOutstanding: toStorageMoney(loanRow.total_outstanding),
          }),
          JSON.stringify({
            status: LoanStatus.WRITTEN_OFF,
            writtenOffPrincipal: toStorageMoney(loanRow.principal_outstanding),
            writtenOffTotalOutstanding: toStorageMoney(loanRow.total_outstanding),
            reason: input.reason,
          }),
          auditMeta.ipAddress,
          auditMeta.userAgent,
        ]
      );

      const updatedRes = await client.query<LoanWithOverdueMetaRow>(
        `SELECT
           l.*,
           c.customer_number,
           c.first_name AS customer_first_name,
           c.last_name AS customer_last_name,
           c.business_name AS customer_business_name,
           c.phone_number AS customer_phone_number,
           c.email AS customer_email,
           lp.code AS loan_product_code,
           lp.name AS loan_product_name,
           lp.grace_period_days,
           lp.late_penalty_rate_percent
         FROM loans l
         JOIN customers c
           ON c.business_id = l.business_id AND c.id = l.customer_id
         JOIN loan_products lp
           ON lp.business_id = l.business_id AND lp.id = l.loan_product_id
         WHERE l.business_id = $1 AND l.id = $2`,
        [businessId, loanId]
      );

      return mapLoanRowToDTO(updatedRes.rows[0]!);
    }
  );
}
