import {
  CreateLoanApplicationRequestDTO,
  CreateLoanProductRequestDTO,
  InstallmentStatus,
  InterestCalculationMethod,
  InterestRatePeriod,
  LoanDetailsResponseDTO,
  LoanDTO,
  LoanLifecycleActionRequestDTO,
  LoanProductDTO,
  LoanStatus,
  PlatformRole,
  RepaymentFrequency,
  RepaymentScheduleInstallmentDTO,
  UpdateLoanProductRequestDTO,
  UUID,
} from '@flotech/shared';
import { withTenantTransaction } from '../database/pool.js';
import {
  FinancialDecimal,
  generateLoanSchedulePreview,
  toStorageMoney,
  toStorageRate,
} from '../financial/decimalEngine.js';
import { AppError } from '../middleware/errorHandler.js';

interface LoanProductRow {
  id: UUID;
  business_id: UUID;
  code: string;
  name: string;
  description: string | null;
  currency_code: string;
  interest_method: InterestCalculationMethod;
  repayment_frequency: RepaymentFrequency;
  nominal_interest_rate_percent: string;
  rate_period: InterestRatePeriod;
  min_principal: string;
  max_principal: string;
  min_term_installments: number;
  max_term_installments: number;
  origination_fee_fixed: string;
  origination_fee_percent: string;
  late_penalty_rate_percent: string;
  grace_period_days: number;
  is_active: boolean;
  active_loan_count?: string | number;
  created_by_user_id: UUID;
  created_at: Date | string;
  updated_at: Date | string;
}

interface LoanJoinedRow {
  id: UUID;
  business_id: UUID;
  loan_number: string;
  customer_id: UUID;
  customer_number: string;
  customer_first_name: string;
  customer_last_name: string;
  customer_business_name: string | null;
  loan_product_id: UUID;
  loan_product_code: string;
  loan_product_name: string;
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

interface RepaymentScheduleRow {
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
}

export interface ListTenantLoansFilters {
  status?: LoanStatus;
  customerId?: UUID;
  loanProductId?: UUID;
  q?: string;
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

function mapLoanProductRowToDTO(row: LoanProductRow): LoanProductDTO {
  return {
    id: row.id,
    businessId: row.business_id,
    code: row.code,
    name: row.name,
    description: row.description,
    currencyCode: row.currency_code,
    interestMethod: row.interest_method,
    repaymentFrequency: row.repayment_frequency,
    nominalInterestRatePercent: toStorageRate(row.nominal_interest_rate_percent),
    ratePeriod: row.rate_period,
    minPrincipal: toStorageMoney(row.min_principal),
    maxPrincipal: toStorageMoney(row.max_principal),
    minTermInstallments: Number(row.min_term_installments),
    maxTermInstallments: Number(row.max_term_installments),
    originationFeeFixed: toStorageMoney(row.origination_fee_fixed),
    originationFeePercent: toStorageRate(row.origination_fee_percent),
    latePenaltyRatePercent: toStorageRate(row.late_penalty_rate_percent),
    gracePeriodDays: Number(row.grace_period_days),
    isActive: row.is_active,
    activeLoanCount: Number(row.active_loan_count ?? 0),
    createdByUserId: row.created_by_user_id,
    createdAt: toIsoTimestamp(row.created_at),
    updatedAt: toIsoTimestamp(row.updated_at),
  };
}

function mapLoanJoinedRowToDTO(row: LoanJoinedRow): LoanDTO {
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

function mapScheduleRowToDTO(row: RepaymentScheduleRow): RepaymentScheduleInstallmentDTO {
  return {
    id: row.id,
    businessId: row.business_id,
    loanId: row.loan_id,
    installmentNumber: Number(row.installment_number),
    dueDate: toDateOnlyString(row.due_date),
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
  };
}

const SELECT_LOAN_JOINED_SQL = `
  SELECT
    l.*,
    c.customer_number,
    c.first_name AS customer_first_name,
    c.last_name AS customer_last_name,
    c.business_name AS customer_business_name,
    lp.code AS loan_product_code,
    lp.name AS loan_product_name
  FROM loans l
  JOIN customers c
    ON c.business_id = l.business_id AND c.id = l.customer_id
  JOIN loan_products lp
    ON lp.business_id = l.business_id AND lp.id = l.loan_product_id
`;

/**
 * Lists loan products for a tenant business.
 */
export async function listTenantLoanProducts(
  businessId: UUID,
  actorUserId: UUID,
  includeInactive = true
): Promise<LoanProductDTO[]> {
  return withTenantTransaction(
    { businessId, actorUserId, isSuperAdmin: false },
    async (client) => {
      const conditions = ['lp.business_id = $1'];
      if (!includeInactive) {
        conditions.push('lp.is_active = TRUE');
      }

      const res = await client.query<LoanProductRow>(
        `SELECT
           lp.*,
           COUNT(l.id) FILTER (WHERE l.status IN ('ACTIVE', 'OVERDUE'))::int AS active_loan_count
         FROM loan_products lp
         LEFT JOIN loans l
           ON l.business_id = lp.business_id AND l.loan_product_id = lp.id
         WHERE ${conditions.join(' AND ')}
         GROUP BY lp.id
         ORDER BY lp.is_active DESC, lp.created_at DESC`,
        [businessId]
      );

      return res.rows.map(mapLoanProductRowToDTO);
    }
  );
}

/**
 * Creates a new loan product in the tenant business.
 */
export async function createTenantLoanProduct(
  businessId: UUID,
  actorUserId: UUID,
  actorPlatformRole: PlatformRole,
  input: CreateLoanProductRequestDTO,
  auditMeta: { ipAddress: string | null; userAgent: string | null }
): Promise<LoanProductDTO> {
  const minPrincipalDec = new FinancialDecimal(input.minPrincipal);
  const maxPrincipalDec = new FinancialDecimal(input.maxPrincipal);
  if (maxPrincipalDec.lt(minPrincipalDec)) {
    throw new AppError(
      400,
      'INVALID_PRINCIPAL_BOUNDS',
      'maxPrincipal must be greater than or equal to minPrincipal.'
    );
  }

  return withTenantTransaction(
    { businessId, actorUserId, isSuperAdmin: false },
    async (client) => {
      const bizRes = await client.query<{ currency_code: string }>(
        `SELECT currency_code FROM businesses WHERE id = $1`,
        [businessId]
      );
      const bizRow = bizRes.rows[0];
      if (!bizRow) {
        throw new AppError(404, 'BUSINESS_NOT_FOUND', 'Business tenant was not found.');
      }

      const codeNormalized = input.code.trim().toUpperCase();
      const dupRes = await client.query(
        `SELECT 1 FROM loan_products WHERE business_id = $1 AND code = $2`,
        [businessId, codeNormalized]
      );
      if ((dupRes.rowCount ?? 0) > 0) {
        throw new AppError(
          409,
          'LOAN_PRODUCT_CODE_EXISTS',
          `A loan product with code "${codeNormalized}" already exists in this business.`
        );
      }

      const insertRes = await client.query<LoanProductRow>(
        `INSERT INTO loan_products (
           business_id,
           code,
           name,
           description,
           currency_code,
           interest_method,
           repayment_frequency,
           nominal_interest_rate_percent,
           rate_period,
           min_principal,
           max_principal,
           min_term_installments,
           max_term_installments,
           origination_fee_fixed,
           origination_fee_percent,
           late_penalty_rate_percent,
           grace_period_days,
           is_active,
           created_by_user_id
         )
         VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
         )
         RETURNING *, 0 AS active_loan_count`,
        [
          businessId,
          codeNormalized,
          input.name.trim(),
          input.description ?? null,
          bizRow.currency_code,
          input.interestMethod,
          input.repaymentFrequency,
          toStorageRate(input.nominalInterestRatePercent),
          input.ratePeriod,
          toStorageMoney(input.minPrincipal),
          toStorageMoney(input.maxPrincipal),
          input.minTermInstallments,
          input.maxTermInstallments,
          toStorageMoney(input.originationFeeFixed ?? '0.0000'),
          toStorageRate(input.originationFeePercent ?? '0.000000'),
          toStorageRate(input.latePenaltyRatePercent ?? '0.000000'),
          input.gracePeriodDays ?? 0,
          input.isActive ?? true,
          actorUserId,
        ]
      );

      const created = insertRes.rows[0]!;

      await client.query(
        `INSERT INTO audit_logs (
           business_id, actor_user_id, actor_platform_role, action, entity_type, entity_id, after_state, ip_address, user_agent
         )
         VALUES ($1, $2, $3, 'LOAN_PRODUCT_CREATED', 'loan_products', $4, $5::jsonb, $6, $7)`,
        [
          businessId,
          actorUserId,
          actorPlatformRole,
          created.id,
          JSON.stringify({
            code: created.code,
            name: created.name,
            interestMethod: created.interest_method,
            nominalInterestRatePercent: created.nominal_interest_rate_percent,
          }),
          auditMeta.ipAddress,
          auditMeta.userAgent,
        ]
      );

      return mapLoanProductRowToDTO(created);
    }
  );
}

/**
 * Updates an existing loan product in the tenant business.
 */
export async function updateTenantLoanProduct(
  businessId: UUID,
  productId: UUID,
  actorUserId: UUID,
  actorPlatformRole: PlatformRole,
  updates: UpdateLoanProductRequestDTO,
  auditMeta: { ipAddress: string | null; userAgent: string | null }
): Promise<LoanProductDTO> {
  return withTenantTransaction(
    { businessId, actorUserId, isSuperAdmin: false },
    async (client) => {
      const existingRes = await client.query<LoanProductRow>(
        `SELECT * FROM loan_products WHERE business_id = $1 AND id = $2 FOR UPDATE`,
        [businessId, productId]
      );
      const existing = existingRes.rows[0];
      if (!existing) {
        throw new AppError(404, 'LOAN_PRODUCT_NOT_FOUND', 'Loan product was not found.');
      }

      const nextMinPrincipal =
        updates.minPrincipal !== undefined
          ? toStorageMoney(updates.minPrincipal)
          : toStorageMoney(existing.min_principal);
      const nextMaxPrincipal =
        updates.maxPrincipal !== undefined
          ? toStorageMoney(updates.maxPrincipal)
          : toStorageMoney(existing.max_principal);

      if (new FinancialDecimal(nextMaxPrincipal).lt(new FinancialDecimal(nextMinPrincipal))) {
        throw new AppError(
          400,
          'INVALID_PRINCIPAL_BOUNDS',
          'maxPrincipal must be greater than or equal to minPrincipal.'
        );
      }

      const nextMinTerm =
        updates.minTermInstallments !== undefined
          ? updates.minTermInstallments
          : existing.min_term_installments;
      const nextMaxTerm =
        updates.maxTermInstallments !== undefined
          ? updates.maxTermInstallments
          : existing.max_term_installments;

      if (nextMaxTerm < nextMinTerm) {
        throw new AppError(
          400,
          'INVALID_TERM_BOUNDS',
          'maxTermInstallments must be greater than or equal to minTermInstallments.'
        );
      }

      const nextName = updates.name !== undefined ? updates.name.trim() : existing.name;
      const nextDescription =
        updates.description !== undefined ? updates.description : existing.description;
      const nextRate =
        updates.nominalInterestRatePercent !== undefined
          ? toStorageRate(updates.nominalInterestRatePercent)
          : toStorageRate(existing.nominal_interest_rate_percent);
      const nextRatePeriod =
        updates.ratePeriod !== undefined ? updates.ratePeriod : existing.rate_period;
      const nextFeeFixed =
        updates.originationFeeFixed !== undefined
          ? toStorageMoney(updates.originationFeeFixed)
          : toStorageMoney(existing.origination_fee_fixed);
      const nextFeePercent =
        updates.originationFeePercent !== undefined
          ? toStorageRate(updates.originationFeePercent)
          : toStorageRate(existing.origination_fee_percent);
      const nextPenaltyPercent =
        updates.latePenaltyRatePercent !== undefined
          ? toStorageRate(updates.latePenaltyRatePercent)
          : toStorageRate(existing.late_penalty_rate_percent);
      const nextGraceDays =
        updates.gracePeriodDays !== undefined
          ? updates.gracePeriodDays
          : existing.grace_period_days;
      const nextIsActive =
        updates.isActive !== undefined ? updates.isActive : existing.is_active;

      await client.query(
        `UPDATE loan_products
         SET name = $3,
             description = $4,
             nominal_interest_rate_percent = $5,
             rate_period = $6,
             min_principal = $7,
             max_principal = $8,
             min_term_installments = $9,
             max_term_installments = $10,
             origination_fee_fixed = $11,
             origination_fee_percent = $12,
             late_penalty_rate_percent = $13,
             grace_period_days = $14,
             is_active = $15,
             updated_at = NOW()
         WHERE business_id = $1 AND id = $2`,
        [
          businessId,
          productId,
          nextName,
          nextDescription,
          nextRate,
          nextRatePeriod,
          nextMinPrincipal,
          nextMaxPrincipal,
          nextMinTerm,
          nextMaxTerm,
          nextFeeFixed,
          nextFeePercent,
          nextPenaltyPercent,
          nextGraceDays,
          nextIsActive,
        ]
      );

      await client.query(
        `INSERT INTO audit_logs (
           business_id, actor_user_id, actor_platform_role, action, entity_type, entity_id, before_state, after_state, ip_address, user_agent
         )
         VALUES ($1, $2, $3, 'LOAN_PRODUCT_UPDATED', 'loan_products', $4, $5::jsonb, $6::jsonb, $7, $8)`,
        [
          businessId,
          actorUserId,
          actorPlatformRole,
          productId,
          JSON.stringify({
            isActive: existing.is_active,
            nominalInterestRatePercent: existing.nominal_interest_rate_percent,
          }),
          JSON.stringify({
            code: existing.code,
            updatedFields: Object.keys(updates),
            isActive: nextIsActive,
            nominalInterestRatePercent: nextRate,
          }),
          auditMeta.ipAddress,
          auditMeta.userAgent,
        ]
      );

      const refreshedRes = await client.query<LoanProductRow>(
        `SELECT
           lp.*,
           COUNT(l.id) FILTER (WHERE l.status IN ('ACTIVE', 'OVERDUE'))::int AS active_loan_count
         FROM loan_products lp
         LEFT JOIN loans l
           ON l.business_id = lp.business_id AND l.loan_product_id = lp.id
         WHERE lp.business_id = $1 AND lp.id = $2
         GROUP BY lp.id`,
        [businessId, productId]
      );

      return mapLoanProductRowToDTO(refreshedRes.rows[0]!);
    }
  );
}

/**
 * Lists loans for a tenant business with optional filters.
 */
export async function listTenantLoans(
  businessId: UUID,
  actorUserId: UUID,
  filters: ListTenantLoansFilters = {}
): Promise<LoanDTO[]> {
  return withTenantTransaction(
    { businessId, actorUserId, isSuperAdmin: false },
    async (client) => {
      const params: unknown[] = [businessId];
      const conditions: string[] = ['l.business_id = $1'];

      if (filters.status) {
        params.push(filters.status);
        conditions.push(`l.status = $${params.length}`);
      }

      if (filters.customerId) {
        params.push(filters.customerId);
        conditions.push(`l.customer_id = $${params.length}`);
      }

      if (filters.loanProductId) {
        params.push(filters.loanProductId);
        conditions.push(`l.loan_product_id = $${params.length}`);
      }

      if (filters.q && filters.q.trim().length > 0) {
        params.push(`%${filters.q.trim()}%`);
        const idx = params.length;
        conditions.push(
          `(
            l.loan_number ILIKE $${idx}
            OR c.customer_number ILIKE $${idx}
            OR (c.first_name || ' ' || c.last_name) ILIKE $${idx}
            OR COALESCE(c.business_name, '') ILIKE $${idx}
            OR lp.code ILIKE $${idx}
            OR lp.name ILIKE $${idx}
          )`
        );
      }

      const res = await client.query<LoanJoinedRow>(
        `${SELECT_LOAN_JOINED_SQL}
         WHERE ${conditions.join(' AND ')}
         ORDER BY l.created_at DESC`,
        params
      );

      return res.rows.map(mapLoanJoinedRowToDTO);
    }
  );
}

/**
 * Fetches a single tenant loan and its repayment schedule installments.
 */
export async function getTenantLoanDetails(
  businessId: UUID,
  loanId: UUID,
  actorUserId: UUID
): Promise<LoanDetailsResponseDTO> {
  return withTenantTransaction(
    { businessId, actorUserId, isSuperAdmin: false },
    async (client) => {
      const loanRes = await client.query<LoanJoinedRow>(
        `${SELECT_LOAN_JOINED_SQL}
         WHERE l.business_id = $1 AND l.id = $2`,
        [businessId, loanId]
      );
      const loanRow = loanRes.rows[0];
      if (!loanRow) {
        throw new AppError(404, 'LOAN_NOT_FOUND', 'Loan was not found in this business.');
      }

      const schedulesRes = await client.query<RepaymentScheduleRow>(
        `SELECT *
         FROM repayment_schedules
         WHERE business_id = $1 AND loan_id = $2
         ORDER BY installment_number ASC`,
        [businessId, loanId]
      );

      return {
        loan: mapLoanJoinedRowToDTO(loanRow),
        schedules: schedulesRes.rows.map(mapScheduleRowToDTO),
      };
    }
  );
}

/**
 * Creates a new loan application in the tenant business.
 * Enforces borrower eligibility, product bounds, and backend-authoritative Decimal.js financial totals.
 */
export async function createLoanApplication(
  businessId: UUID,
  actorUserId: UUID,
  actorPlatformRole: PlatformRole,
  input: CreateLoanApplicationRequestDTO,
  auditMeta: { ipAddress: string | null; userAgent: string | null }
): Promise<LoanDTO> {
  return withTenantTransaction(
    { businessId, actorUserId, isSuperAdmin: false },
    async (client) => {
      // 1. Lock the business row to serialize sequential loan_number generation
      const bizRes = await client.query<{
        currency_code: string;
        settings_json: Record<string, unknown>;
      }>(`SELECT currency_code, settings_json FROM businesses WHERE id = $1 FOR UPDATE`, [
        businessId,
      ]);
      const bizRow = bizRes.rows[0];
      if (!bizRow) {
        throw new AppError(404, 'BUSINESS_NOT_FOUND', 'Business tenant was not found.');
      }

      // 2. Verify customer eligibility
      const custRes = await client.query<{
        id: UUID;
        customer_number: string;
        is_archived: boolean;
        risk_tier: string;
      }>(
        `SELECT id, customer_number, is_archived, risk_tier
         FROM customers
         WHERE business_id = $1 AND id = $2`,
        [businessId, input.customerId]
      );
      const custRow = custRes.rows[0];
      if (!custRow) {
        throw new AppError(404, 'CUSTOMER_NOT_FOUND', 'Selected customer was not found in this business.');
      }
      if (custRow.is_archived) {
        throw new AppError(
          409,
          'CUSTOMER_IS_ARCHIVED',
          'Cannot originate a loan for an archived customer.'
        );
      }
      if (custRow.risk_tier === 'RESTRICTED') {
        throw new AppError(
          403,
          'CUSTOMER_RISK_RESTRICTED',
          'Borrowers in the RESTRICTED risk tier are blocked from new loan originations.'
        );
      }

      // 3. Verify loan product eligibility and bounds
      const prodRes = await client.query<LoanProductRow>(
        `SELECT * FROM loan_products WHERE business_id = $1 AND id = $2`,
        [businessId, input.loanProductId]
      );
      const prodRow = prodRes.rows[0];
      if (!prodRow) {
        throw new AppError(
          404,
          'LOAN_PRODUCT_NOT_FOUND',
          'Selected loan product was not found in this business.'
        );
      }
      if (!prodRow.is_active) {
        throw new AppError(
          409,
          'LOAN_PRODUCT_INACTIVE',
          'Cannot originate a loan under an inactive loan product.'
        );
      }

      const requestedPrincipal = new FinancialDecimal(input.principalAmount);
      const minPrincipal = new FinancialDecimal(prodRow.min_principal);
      const maxPrincipal = new FinancialDecimal(prodRow.max_principal);

      if (requestedPrincipal.lt(minPrincipal) || requestedPrincipal.gt(maxPrincipal)) {
        throw new AppError(
          400,
          'PRINCIPAL_OUT_OF_PRODUCT_BOUNDS',
          `Principal amount must be between ${toStorageMoney(minPrincipal)} and ${toStorageMoney(maxPrincipal)} ${prodRow.currency_code} for product ${prodRow.code}.`
        );
      }

      if (
        input.termInstallments < prodRow.min_term_installments ||
        input.termInstallments > prodRow.max_term_installments
      ) {
        throw new AppError(
          400,
          'TERM_OUT_OF_PRODUCT_BOUNDS',
          `Term installments must be between ${prodRow.min_term_installments} and ${prodRow.max_term_installments} for product ${prodRow.code}.`
        );
      }

      if (input.loanOfficerMembershipId) {
        const officerRes = await client.query(
          `SELECT 1 FROM business_memberships WHERE business_id = $1 AND id = $2 AND status = 'ACTIVE'`,
          [businessId, input.loanOfficerMembershipId]
        );
        if ((officerRes.rowCount ?? 0) === 0) {
          throw new AppError(
            400,
            'INVALID_LOAN_OFFICER_MEMBERSHIP',
            'Assigned loan officer membership is not active in this business.'
          );
        }
      }

      // 4. Authoritative Backend Financial Calculation (Rule #5 & #7)
      const scheduleSummary = generateLoanSchedulePreview({
        principalAmount: input.principalAmount,
        nominalInterestRatePercent: prodRow.nominal_interest_rate_percent,
        ratePeriod: prodRow.rate_period,
        interestMethod: prodRow.interest_method,
        repaymentFrequency: prodRow.repayment_frequency,
        termInstallments: input.termInstallments,
        firstRepaymentDate: input.firstRepaymentDate,
        originationFeeFixed: prodRow.origination_fee_fixed,
        originationFeePercent: prodRow.origination_fee_percent,
      });

      const lastInstallment =
        scheduleSummary.installments[scheduleSummary.installments.length - 1];
      const maturityDate = lastInstallment
        ? lastInstallment.dueDate
        : input.firstRepaymentDate;

      // 5. Generate sequential loan_number
      const rawPrefix = bizRow.settings_json?.loanNumberPrefix;
      const prefix =
        typeof rawPrefix === 'string' && rawPrefix.trim().length >= 2
          ? rawPrefix.trim().toUpperCase()
          : 'LN-';
      const normalizedPrefix = prefix.endsWith('-') ? prefix : `${prefix}-`;

      const countRes = await client.query<{ total_count: number }>(
        `SELECT COUNT(*)::int AS total_count FROM loans WHERE business_id = $1`,
        [businessId]
      );
      let nextSeq = (countRes.rows[0]?.total_count ?? 0) + 1;
      let loanNumber = `${normalizedPrefix}${String(nextSeq).padStart(5, '0')}`;

      while (true) {
        const collisionRes = await client.query(
          `SELECT 1 FROM loans WHERE business_id = $1 AND loan_number = $2`,
          [businessId, loanNumber]
        );
        if (collisionRes.rowCount === 0) break;
        nextSeq += 1;
        loanNumber = `${normalizedPrefix}${String(nextSeq).padStart(5, '0')}`;
      }

      const initialStatus =
        input.submitImmediately === false
          ? LoanStatus.DRAFT
          : LoanStatus.SUBMITTED;

      const insertRes = await client.query<{ id: UUID }>(
        `INSERT INTO loans (
           business_id,
           loan_number,
           customer_id,
           loan_product_id,
           status,
           currency_code,
           interest_method,
           repayment_frequency,
           nominal_interest_rate_percent,
           rate_period,
           term_installments,
           principal_amount,
           total_interest_amount,
           total_fee_amount,
           total_penalty_amount,
           total_payable_amount,
           principal_outstanding,
           interest_outstanding,
           fee_outstanding,
           penalty_outstanding,
           total_outstanding,
           first_repayment_date,
           maturity_date,
           loan_officer_membership_id,
           purpose,
           created_by_user_id
         )
         VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
           $11, $12, $13, $14, '0.0000', $15,
           $12, $13, $14, '0.0000', $15,
           $16, $17, $18, $19, $20
         )
         RETURNING id`,
        [
          businessId,
          loanNumber,
          input.customerId,
          input.loanProductId,
          initialStatus,
          prodRow.currency_code,
          prodRow.interest_method,
          prodRow.repayment_frequency,
          toStorageRate(prodRow.nominal_interest_rate_percent),
          prodRow.rate_period,
          input.termInstallments,
          scheduleSummary.principalAmount,
          scheduleSummary.totalInterestAmount,
          scheduleSummary.totalFeeAmount,
          scheduleSummary.totalPayableAmount,
          input.firstRepaymentDate,
          maturityDate,
          input.loanOfficerMembershipId ?? null,
          input.purpose ?? null,
          actorUserId,
        ]
      );

      const loanId = insertRes.rows[0]!.id;

      await client.query(
        `INSERT INTO audit_logs (
           business_id, actor_user_id, actor_platform_role, action, entity_type, entity_id, after_state, ip_address, user_agent
         )
         VALUES ($1, $2, $3, 'LOAN_APPLICATION_CREATED', 'loans', $4, $5::jsonb, $6, $7)`,
        [
          businessId,
          actorUserId,
          actorPlatformRole,
          loanId,
          JSON.stringify({
            loanNumber,
            customerId: input.customerId,
            loanProductId: input.loanProductId,
            status: initialStatus,
            principalAmount: scheduleSummary.principalAmount,
            totalInterestAmount: scheduleSummary.totalInterestAmount,
            totalFeeAmount: scheduleSummary.totalFeeAmount,
            totalPayableAmount: scheduleSummary.totalPayableAmount,
          }),
          auditMeta.ipAddress,
          auditMeta.userAgent,
        ]
      );

      const joinedRes = await client.query<LoanJoinedRow>(
        `${SELECT_LOAN_JOINED_SQL}
         WHERE l.business_id = $1 AND l.id = $2`,
        [businessId, loanId]
      );

      return mapLoanJoinedRowToDTO(joinedRes.rows[0]!);
    }
  );
}

/**
 * Transitions a `DRAFT` loan to `SUBMITTED`.
 */
export async function submitDraftLoanApplication(
  businessId: UUID,
  loanId: UUID,
  actorUserId: UUID,
  actorPlatformRole: PlatformRole,
  input: LoanLifecycleActionRequestDTO,
  auditMeta: { ipAddress: string | null; userAgent: string | null }
): Promise<LoanDTO> {
  return withTenantTransaction(
    { businessId, actorUserId, isSuperAdmin: false },
    async (client) => {
      const existingRes = await client.query<{ status: LoanStatus; loan_number: string }>(
        `SELECT status, loan_number FROM loans WHERE business_id = $1 AND id = $2 FOR UPDATE`,
        [businessId, loanId]
      );
      const existing = existingRes.rows[0];
      if (!existing) {
        throw new AppError(404, 'LOAN_NOT_FOUND', 'Loan was not found in this business.');
      }
      if (existing.status !== LoanStatus.DRAFT) {
        throw new AppError(
          409,
          'INVALID_LOAN_STATUS_TRANSITION',
          `Only DRAFT loans can be submitted for approval (current status: ${existing.status}).`
        );
      }

      await client.query(
        `UPDATE loans
         SET status = 'SUBMITTED',
             updated_at = NOW()
         WHERE business_id = $1 AND id = $2`,
        [businessId, loanId]
      );

      await client.query(
        `INSERT INTO audit_logs (
           business_id, actor_user_id, actor_platform_role, action, entity_type, entity_id, before_state, after_state, ip_address, user_agent
         )
         VALUES ($1, $2, $3, 'LOAN_APPLICATION_SUBMITTED', 'loans', $4, $5::jsonb, $6::jsonb, $7, $8)`,
        [
          businessId,
          actorUserId,
          actorPlatformRole,
          loanId,
          JSON.stringify({ status: existing.status }),
          JSON.stringify({ status: LoanStatus.SUBMITTED, notes: input.notes ?? null }),
          auditMeta.ipAddress,
          auditMeta.userAgent,
        ]
      );

      const joinedRes = await client.query<LoanJoinedRow>(
        `${SELECT_LOAN_JOINED_SQL}
         WHERE l.business_id = $1 AND l.id = $2`,
        [businessId, loanId]
      );
      return mapLoanJoinedRowToDTO(joinedRes.rows[0]!);
    }
  );
}

/**
 * Transitions a `SUBMITTED` loan to `UNDER_REVIEW`.
 */
export async function reviewLoanApplication(
  businessId: UUID,
  loanId: UUID,
  actorUserId: UUID,
  actorPlatformRole: PlatformRole,
  input: LoanLifecycleActionRequestDTO,
  auditMeta: { ipAddress: string | null; userAgent: string | null }
): Promise<LoanDTO> {
  return withTenantTransaction(
    { businessId, actorUserId, isSuperAdmin: false },
    async (client) => {
      const existingRes = await client.query<{ status: LoanStatus; loan_number: string }>(
        `SELECT status, loan_number FROM loans WHERE business_id = $1 AND id = $2 FOR UPDATE`,
        [businessId, loanId]
      );
      const existing = existingRes.rows[0];
      if (!existing) {
        throw new AppError(404, 'LOAN_NOT_FOUND', 'Loan was not found in this business.');
      }
      if (existing.status !== LoanStatus.SUBMITTED) {
        throw new AppError(
          409,
          'INVALID_LOAN_STATUS_TRANSITION',
          `Only SUBMITTED loans can be moved to UNDER_REVIEW (current status: ${existing.status}).`
        );
      }

      await client.query(
        `UPDATE loans
         SET status = 'UNDER_REVIEW',
             updated_at = NOW()
         WHERE business_id = $1 AND id = $2`,
        [businessId, loanId]
      );

      await client.query(
        `INSERT INTO audit_logs (
           business_id, actor_user_id, actor_platform_role, action, entity_type, entity_id, before_state, after_state, ip_address, user_agent
         )
         VALUES ($1, $2, $3, 'LOAN_UNDER_REVIEW', 'loans', $4, $5::jsonb, $6::jsonb, $7, $8)`,
        [
          businessId,
          actorUserId,
          actorPlatformRole,
          loanId,
          JSON.stringify({ status: existing.status }),
          JSON.stringify({ status: LoanStatus.UNDER_REVIEW, notes: input.notes ?? null }),
          auditMeta.ipAddress,
          auditMeta.userAgent,
        ]
      );

      const joinedRes = await client.query<LoanJoinedRow>(
        `${SELECT_LOAN_JOINED_SQL}
         WHERE l.business_id = $1 AND l.id = $2`,
        [businessId, loanId]
      );
      return mapLoanJoinedRowToDTO(joinedRes.rows[0]!);
    }
  );
}

/**
 * Approves a `SUBMITTED` or `UNDER_REVIEW` loan (`loans:approve`).
 * Enforces `requireDualApprovalForLoans` separation of duties if enabled in business settings.
 */
export async function approveLoanApplication(
  businessId: UUID,
  loanId: UUID,
  actorUserId: UUID,
  actorPlatformRole: PlatformRole,
  input: LoanLifecycleActionRequestDTO,
  auditMeta: { ipAddress: string | null; userAgent: string | null }
): Promise<LoanDTO> {
  return withTenantTransaction(
    { businessId, actorUserId, isSuperAdmin: false },
    async (client) => {
      const bizRes = await client.query<{ settings_json: Record<string, unknown> }>(
        `SELECT settings_json FROM businesses WHERE id = $1`,
        [businessId]
      );
      const requireDualApproval =
        bizRes.rows[0]?.settings_json?.requireDualApprovalForLoans === true;

      const existingRes = await client.query<{
        status: LoanStatus;
        loan_number: string;
        created_by_user_id: UUID;
      }>(
        `SELECT status, loan_number, created_by_user_id
         FROM loans
         WHERE business_id = $1 AND id = $2
         FOR UPDATE`,
        [businessId, loanId]
      );
      const existing = existingRes.rows[0];
      if (!existing) {
        throw new AppError(404, 'LOAN_NOT_FOUND', 'Loan was not found in this business.');
      }

      if (
        existing.status !== LoanStatus.SUBMITTED &&
        existing.status !== LoanStatus.UNDER_REVIEW
      ) {
        throw new AppError(
          409,
          'INVALID_LOAN_STATUS_TRANSITION',
          `Only SUBMITTED or UNDER_REVIEW loans can be approved (current status: ${existing.status}).`
        );
      }

      if (requireDualApproval && existing.created_by_user_id === actorUserId) {
        throw new AppError(
          403,
          'DUAL_CONTROL_APPROVAL_VIOLATION',
          'Dual-control policy is active for this business: a loan cannot be approved by the same user who originated it.'
        );
      }

      await client.query(
        `UPDATE loans
         SET status = 'APPROVED',
             approved_at = NOW(),
             approved_by_user_id = $3,
             updated_at = NOW()
         WHERE business_id = $1 AND id = $2`,
        [businessId, loanId, actorUserId]
      );

      await client.query(
        `INSERT INTO audit_logs (
           business_id, actor_user_id, actor_platform_role, action, entity_type, entity_id, before_state, after_state, ip_address, user_agent
         )
         VALUES ($1, $2, $3, 'LOAN_APPROVED', 'loans', $4, $5::jsonb, $6::jsonb, $7, $8)`,
        [
          businessId,
          actorUserId,
          actorPlatformRole,
          loanId,
          JSON.stringify({ status: existing.status }),
          JSON.stringify({
            status: LoanStatus.APPROVED,
            approvedByUserId: actorUserId,
            notes: input.notes ?? null,
          }),
          auditMeta.ipAddress,
          auditMeta.userAgent,
        ]
      );

      const joinedRes = await client.query<LoanJoinedRow>(
        `${SELECT_LOAN_JOINED_SQL}
         WHERE l.business_id = $1 AND l.id = $2`,
        [businessId, loanId]
      );
      return mapLoanJoinedRowToDTO(joinedRes.rows[0]!);
    }
  );
}

/**
 * Rejects a `DRAFT`, `SUBMITTED`, or `UNDER_REVIEW` loan (`loans:reject`),
 * zeroing out outstanding balances and closing the application.
 */
export async function rejectLoanApplication(
  businessId: UUID,
  loanId: UUID,
  actorUserId: UUID,
  actorPlatformRole: PlatformRole,
  input: LoanLifecycleActionRequestDTO,
  auditMeta: { ipAddress: string | null; userAgent: string | null }
): Promise<LoanDTO> {
  return withTenantTransaction(
    { businessId, actorUserId, isSuperAdmin: false },
    async (client) => {
      const existingRes = await client.query<{ status: LoanStatus; loan_number: string }>(
        `SELECT status, loan_number FROM loans WHERE business_id = $1 AND id = $2 FOR UPDATE`,
        [businessId, loanId]
      );
      const existing = existingRes.rows[0];
      if (!existing) {
        throw new AppError(404, 'LOAN_NOT_FOUND', 'Loan was not found in this business.');
      }

      if (
        existing.status !== LoanStatus.DRAFT &&
        existing.status !== LoanStatus.SUBMITTED &&
        existing.status !== LoanStatus.UNDER_REVIEW
      ) {
        throw new AppError(
          409,
          'INVALID_LOAN_STATUS_TRANSITION',
          `Cannot reject a loan in ${existing.status} status.`
        );
      }

      await client.query(
        `UPDATE loans
         SET status = 'REJECTED',
             principal_outstanding = '0.0000',
             interest_outstanding = '0.0000',
             fee_outstanding = '0.0000',
             penalty_outstanding = '0.0000',
             total_outstanding = '0.0000',
             closed_at = NOW(),
             updated_at = NOW()
         WHERE business_id = $1 AND id = $2`,
        [businessId, loanId]
      );

      await client.query(
        `INSERT INTO audit_logs (
           business_id, actor_user_id, actor_platform_role, action, entity_type, entity_id, before_state, after_state, ip_address, user_agent
         )
         VALUES ($1, $2, $3, 'LOAN_REJECTED', 'loans', $4, $5::jsonb, $6::jsonb, $7, $8)`,
        [
          businessId,
          actorUserId,
          actorPlatformRole,
          loanId,
          JSON.stringify({ status: existing.status }),
          JSON.stringify({ status: LoanStatus.REJECTED, notes: input.notes ?? null }),
          auditMeta.ipAddress,
          auditMeta.userAgent,
        ]
      );

      const joinedRes = await client.query<LoanJoinedRow>(
        `${SELECT_LOAN_JOINED_SQL}
         WHERE l.business_id = $1 AND l.id = $2`,
        [businessId, loanId]
      );
      return mapLoanJoinedRowToDTO(joinedRes.rows[0]!);
    }
  );
}

/**
 * Disburses an `APPROVED` loan (`loans:disburse`), enforcing the subscription `max_active_loans` quota,
 * transitioning the loan to `ACTIVE`, and atomically persisting the repayment schedule in `repayment_schedules`.
 */
export async function disburseApprovedLoan(
  businessId: UUID,
  loanId: UUID,
  actorUserId: UUID,
  actorPlatformRole: PlatformRole,
  input: LoanLifecycleActionRequestDTO,
  auditMeta: { ipAddress: string | null; userAgent: string | null }
): Promise<LoanDetailsResponseDTO> {
  return withTenantTransaction(
    { businessId, actorUserId, isSuperAdmin: false },
    async (client) => {
      // 1. Lock business to serialize active loan quota check
      await client.query(`SELECT id FROM businesses WHERE id = $1 FOR UPDATE`, [businessId]);

      const subRes = await client.query<{
        status: string;
        current_period_end: Date | string;
        cancel_at_period_end: boolean;
        max_active_loans: number;
      }>(
        `SELECT bs.status, bs.current_period_end, bs.cancel_at_period_end, sp.max_active_loans
         FROM business_subscriptions bs
         JOIN subscription_plans sp ON sp.id = bs.plan_id
         WHERE bs.business_id = $1
         ORDER BY bs.created_at DESC
         LIMIT 1`,
        [businessId]
      );
      const subRow = subRes.rows[0];
      if (subRow) {
        const periodEndMs = new Date(subRow.current_period_end).getTime();
        const isExpiredByDate =
          Number.isFinite(periodEndMs) && periodEndMs < Date.now() && subRow.cancel_at_period_end;
        if (
          subRow.status === 'EXPIRED' ||
          subRow.status === 'CANCELED' ||
          subRow.status === 'PAST_DUE' ||
          isExpiredByDate
        ) {
          throw new AppError(
            403,
            'SUBSCRIPTION_INACTIVE_OR_EXPIRED',
            `Your business subscription is currently ${isExpiredByDate ? 'EXPIRED' : subRow.status}. Please renew or upgrade your plan to disburse new loans.`
          );
        }
      }
      const maxActiveLoans = subRow?.max_active_loans ?? 100;

      const activeCountRes = await client.query<{ active_count: number }>(
        `SELECT COUNT(*)::int AS active_count
         FROM loans
         WHERE business_id = $1 AND status IN ('ACTIVE', 'OVERDUE')`,
        [businessId]
      );
      const currentActiveCount = activeCountRes.rows[0]?.active_count ?? 0;

      if (currentActiveCount >= maxActiveLoans) {
        throw new AppError(
          403,
          'SUBSCRIPTION_ACTIVE_LOAN_QUOTA_EXCEEDED',
          `Your current subscription plan allows up to ${maxActiveLoans} active loans.`
        );
      }

      // 2. Lock loan row and verify status = APPROVED
      const loanRes = await client.query<{
        id: UUID;
        loan_number: string;
        loan_product_id: UUID;
        status: LoanStatus;
        interest_method: InterestCalculationMethod;
        repayment_frequency: RepaymentFrequency;
        nominal_interest_rate_percent: string;
        rate_period: InterestRatePeriod;
        term_installments: number;
        principal_amount: string;
        total_fee_amount: string;
        first_repayment_date: Date | string | null;
      }>(
        `SELECT
           id,
           loan_number,
           loan_product_id,
           status,
           interest_method,
           repayment_frequency,
           nominal_interest_rate_percent,
           rate_period,
           term_installments,
           principal_amount,
           total_fee_amount,
           first_repayment_date
         FROM loans
         WHERE business_id = $1 AND id = $2
         FOR UPDATE`,
        [businessId, loanId]
      );

      const loanRow = loanRes.rows[0];
      if (!loanRow) {
        throw new AppError(404, 'LOAN_NOT_FOUND', 'Loan was not found in this business.');
      }

      if (loanRow.status !== LoanStatus.APPROVED) {
        throw new AppError(
          409,
          'INVALID_LOAN_STATUS_TRANSITION',
          `Only APPROVED loans can be disbursed (current status: ${loanRow.status}).`
        );
      }

      const effectiveFirstRepaymentDate =
        input.firstRepaymentDate ??
        toNullableDateOnlyString(loanRow.first_repayment_date) ??
        new Date().toISOString().slice(0, 10);

      // 3. Generate deterministic schedule installments via Decimal.js
      const scheduleSummary = generateLoanSchedulePreview({
        principalAmount: loanRow.principal_amount,
        nominalInterestRatePercent: loanRow.nominal_interest_rate_percent,
        ratePeriod: loanRow.rate_period,
        interestMethod: loanRow.interest_method,
        repaymentFrequency: loanRow.repayment_frequency,
        termInstallments: Number(loanRow.term_installments),
        firstRepaymentDate: effectiveFirstRepaymentDate,
        originationFeeFixed: loanRow.total_fee_amount,
        originationFeePercent: '0',
      });

      const lastInstallment =
        scheduleSummary.installments[scheduleSummary.installments.length - 1];
      const maturityDate = lastInstallment
        ? lastInstallment.dueDate
        : effectiveFirstRepaymentDate;

      // 4. Persist schedule installments into `repayment_schedules`
      await client.query(
        `DELETE FROM repayment_schedules WHERE business_id = $1 AND loan_id = $2`,
        [businessId, loanId]
      );

      for (const inst of scheduleSummary.installments) {
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
             $5, $6, $7, $8, '0.0000', $9,
             '0.0000', '0.0000', '0.0000', '0.0000', '0.0000',
             $10
           )`,
          [
            businessId,
            loanId,
            inst.installmentNumber,
            inst.dueDate,
            inst.openingBalance,
            inst.principalDue,
            inst.interestDue,
            inst.feeDue,
            inst.totalDue,
            inst.closingBalance,
          ]
        );
      }

      // 5. Update loan status to ACTIVE
      await client.query(
        `UPDATE loans
         SET status = 'ACTIVE',
             disbursed_at = NOW(),
             disbursed_by_user_id = $3,
             first_repayment_date = $4,
             maturity_date = $5,
             updated_at = NOW()
         WHERE business_id = $1 AND id = $2`,
        [businessId, loanId, actorUserId, effectiveFirstRepaymentDate, maturityDate]
      );

      await client.query(
        `INSERT INTO audit_logs (
           business_id, actor_user_id, actor_platform_role, action, entity_type, entity_id, before_state, after_state, ip_address, user_agent
         )
         VALUES ($1, $2, $3, 'LOAN_DISBURSED', 'loans', $4, $5::jsonb, $6::jsonb, $7, $8)`,
        [
          businessId,
          actorUserId,
          actorPlatformRole,
          loanId,
          JSON.stringify({ status: LoanStatus.APPROVED }),
          JSON.stringify({
            status: LoanStatus.ACTIVE,
            disbursedByUserId: actorUserId,
            firstRepaymentDate: effectiveFirstRepaymentDate,
            maturityDate,
            installmentCount: scheduleSummary.installments.length,
            notes: input.notes ?? null,
          }),
          auditMeta.ipAddress,
          auditMeta.userAgent,
        ]
      );

      const joinedRes = await client.query<LoanJoinedRow>(
        `${SELECT_LOAN_JOINED_SQL}
         WHERE l.business_id = $1 AND l.id = $2`,
        [businessId, loanId]
      );

      const schedulesRes = await client.query<RepaymentScheduleRow>(
        `SELECT *
         FROM repayment_schedules
         WHERE business_id = $1 AND loan_id = $2
         ORDER BY installment_number ASC`,
        [businessId, loanId]
      );

      return {
        loan: mapLoanJoinedRowToDTO(joinedRes.rows[0]!),
        schedules: schedulesRes.rows.map(mapScheduleRowToDTO),
      };
    }
  );
}
