import {
  InstallmentStatus,
  InterestCalculationMethod,
  InterestRatePeriod,
  LoanDTO,
  LoanStatus,
  PaymentReceiptDTO,
  PaymentReceiptSnapshotDTO,
  PlatformRole,
  RecordRepaymentRequestDTO,
  RepaymentAllocationItemDTO,
  RepaymentDetailsResponseDTO,
  RepaymentDTO,
  RepaymentFrequency,
  RepaymentMethod,
  ReverseRepaymentRequestDTO,
  UUID,
} from '@flotech/shared';
import { withTenantTransaction } from '../database/pool.js';
import {
  FinancialDecimal,
  toStorageMoney,
  toStorageRate,
} from '../financial/decimalEngine.js';
import { AppError } from '../middleware/errorHandler.js';

interface RepaymentJoinedRow {
  id: UUID;
  business_id: UUID;
  loan_id: UUID;
  loan_number: string;
  customer_id: UUID;
  customer_number: string;
  customer_first_name: string;
  customer_last_name: string;
  reference_number: string;
  receipt_number: string | null;
  payment_method: RepaymentMethod;
  external_transaction_ref: string | null;
  currency_code: string;
  amount_received: string;
  allocated_penalty: string;
  allocated_fee: string;
  allocated_interest: string;
  allocated_principal: string;
  overpayment_credit: string;
  paid_at: Date | string;
  recorded_by_user_id: UUID;
  recorded_by_full_name: string;
  is_reversed: boolean;
  reversed_at: Date | string | null;
  reversed_by_user_id: UUID | null;
  reversal_reason: string | null;
  notes: string | null;
  created_at: Date | string;
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
  customer_phone_number: string;
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

function mapRepaymentJoinedRowToDTO(row: RepaymentJoinedRow): RepaymentDTO {
  return {
    id: row.id,
    businessId: row.business_id,
    loanId: row.loan_id,
    loanNumber: row.loan_number,
    customerId: row.customer_id,
    customerNumber: row.customer_number,
    customerFullName: `${row.customer_first_name} ${row.customer_last_name}`.trim(),
    referenceNumber: row.reference_number,
    receiptNumber: row.receipt_number,
    paymentMethod: row.payment_method,
    externalTransactionRef: row.external_transaction_ref,
    currencyCode: row.currency_code,
    amountReceived: toStorageMoney(row.amount_received),
    allocatedPenalty: toStorageMoney(row.allocated_penalty),
    allocatedFee: toStorageMoney(row.allocated_fee),
    allocatedInterest: toStorageMoney(row.allocated_interest),
    allocatedPrincipal: toStorageMoney(row.allocated_principal),
    overpaymentCredit: toStorageMoney(row.overpayment_credit),
    paidAt: toIsoTimestamp(row.paid_at),
    recordedByUserId: row.recorded_by_user_id,
    recordedByFullName: row.recorded_by_full_name,
    isReversed: row.is_reversed,
    reversedAt: toNullableIsoTimestamp(row.reversed_at),
    reversedByUserId: row.reversed_by_user_id,
    reversalReason: row.reversal_reason,
    notes: row.notes,
    createdAt: toIsoTimestamp(row.created_at),
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

const SELECT_REPAYMENT_JOINED_SQL = `
  SELECT
    r.*,
    l.loan_number,
    c.customer_number,
    c.first_name AS customer_first_name,
    c.last_name AS customer_last_name,
    u.full_name AS recorded_by_full_name,
    pr.receipt_number
  FROM repayments r
  JOIN loans l
    ON l.business_id = r.business_id AND l.id = r.loan_id
  JOIN customers c
    ON c.business_id = r.business_id AND c.id = r.customer_id
  JOIN users u
    ON u.id = r.recorded_by_user_id
  LEFT JOIN payment_receipts pr
    ON pr.business_id = r.business_id AND pr.repayment_id = r.id
`;

const SELECT_LOAN_JOINED_SQL = `
  SELECT
    l.*,
    c.customer_number,
    c.first_name AS customer_first_name,
    c.last_name AS customer_last_name,
    c.business_name AS customer_business_name,
    c.phone_number AS customer_phone_number,
    lp.code AS loan_product_code,
    lp.name AS loan_product_name
  FROM loans l
  JOIN customers c
    ON c.business_id = l.business_id AND c.id = l.customer_id
  JOIN loan_products lp
    ON lp.business_id = l.business_id AND lp.id = l.loan_product_id
`;

/**
 * Lists tenant repayments with optional filtering by loanId, customerId, paymentMethod, and includeReversed.
 */
export async function listTenantRepayments(
  businessId: UUID,
  actorUserId: UUID,
  filters?: {
    loanId?: UUID;
    customerId?: UUID;
    paymentMethod?: RepaymentMethod;
    includeReversed?: boolean;
  }
): Promise<RepaymentDTO[]> {
  return withTenantTransaction(
    { businessId, actorUserId, isSuperAdmin: false },
    async (client) => {
      const conditions: string[] = ['r.business_id = $1'];
      const params: unknown[] = [businessId];

      if (filters?.loanId) {
        params.push(filters.loanId);
        conditions.push(`r.loan_id = $${params.length}`);
      }

      if (filters?.customerId) {
        params.push(filters.customerId);
        conditions.push(`r.customer_id = $${params.length}`);
      }

      if (filters?.paymentMethod) {
        params.push(filters.paymentMethod);
        conditions.push(`r.payment_method = $${params.length}`);
      }

      if (filters?.includeReversed === false) {
        conditions.push(`r.is_reversed = FALSE`);
      }

      const res = await client.query<RepaymentJoinedRow>(
        `${SELECT_REPAYMENT_JOINED_SQL}
         WHERE ${conditions.join(' AND ')}
         ORDER BY r.paid_at DESC, r.created_at DESC`,
        params
      );

      return res.rows.map(mapRepaymentJoinedRowToDTO);
    }
  );
}

/**
 * Retrieves full repayment details including waterfall schedule allocations, immutable receipt snapshot, and parent loan state.
 */
export async function getTenantRepaymentDetails(
  businessId: UUID,
  repaymentId: UUID,
  actorUserId: UUID
): Promise<RepaymentDetailsResponseDTO> {
  return withTenantTransaction(
    { businessId, actorUserId, isSuperAdmin: false },
    async (client) => {
      const repRes = await client.query<RepaymentJoinedRow>(
        `${SELECT_REPAYMENT_JOINED_SQL}
         WHERE r.business_id = $1 AND r.id = $2`,
        [businessId, repaymentId]
      );
      const repRow = repRes.rows[0];
      if (!repRow) {
        throw new AppError(404, 'REPAYMENT_NOT_FOUND', 'Repayment record was not found in this business.');
      }

      const allocRes = await client.query<{
        id: UUID;
        business_id: UUID;
        repayment_id: UUID;
        schedule_id: UUID;
        installment_number: number;
        due_date: Date | string;
        principal_allocated: string;
        interest_allocated: string;
        fee_allocated: string;
        penalty_allocated: string;
        total_allocated: string;
        created_at: Date | string;
      }>(
        `SELECT
           ra.*,
           rs.installment_number,
           rs.due_date
         FROM repayment_allocations ra
         JOIN repayment_schedules rs
           ON rs.business_id = ra.business_id AND rs.id = ra.schedule_id
         WHERE ra.business_id = $1 AND ra.repayment_id = $2
         ORDER BY rs.installment_number ASC`,
        [businessId, repaymentId]
      );

      const receiptRes = await client.query<{
        id: UUID;
        business_id: UUID;
        repayment_id: UUID;
        receipt_number: string;
        issued_at: Date | string;
        pdf_storage_path: string | null;
        snapshot_json: PaymentReceiptSnapshotDTO;
      }>(
        `SELECT *
         FROM payment_receipts
         WHERE business_id = $1 AND repayment_id = $2`,
        [businessId, repaymentId]
      );

      const loanRes = await client.query<LoanJoinedRow>(
        `${SELECT_LOAN_JOINED_SQL}
         WHERE l.business_id = $1 AND l.id = $2`,
        [businessId, repRow.loan_id]
      );

      const receiptRow = receiptRes.rows[0];
      const receipt: PaymentReceiptDTO | null = receiptRow
        ? {
            id: receiptRow.id,
            businessId: receiptRow.business_id,
            repaymentId: receiptRow.repayment_id,
            receiptNumber: receiptRow.receipt_number,
            issuedAt: toIsoTimestamp(receiptRow.issued_at),
            pdfStoragePath: receiptRow.pdf_storage_path,
            snapshot: receiptRow.snapshot_json,
          }
        : null;

      const allocations: RepaymentAllocationItemDTO[] = allocRes.rows.map((a) => ({
        id: a.id,
        businessId: a.business_id,
        repaymentId: a.repayment_id,
        scheduleId: a.schedule_id,
        installmentNumber: Number(a.installment_number),
        dueDate: toDateOnlyString(a.due_date),
        principalAllocated: toStorageMoney(a.principal_allocated),
        interestAllocated: toStorageMoney(a.interest_allocated),
        feeAllocated: toStorageMoney(a.fee_allocated),
        penaltyAllocated: toStorageMoney(a.penalty_allocated),
        totalAllocated: toStorageMoney(a.total_allocated),
        createdAt: toIsoTimestamp(a.created_at),
      }));

      return {
        repayment: mapRepaymentJoinedRowToDTO(repRow),
        allocations,
        receipt,
        loan: mapLoanJoinedRowToDTO(loanRes.rows[0]!),
      };
    }
  );
}

/**
 * Records a loan repayment (`repayments:record`) using a deterministic `Decimal.js` ACID waterfall:
 *   1. Orders unpaid installments chronologically (`installment_number ASC`).
 *   2. Allocates received funds in strict priority order per installment:
 *      `Penalty Due -> Fee Due -> Interest Due -> Principal Due`.
 *   3. Enforces `allowPartialInstallmentPayments` business operational setting when applicable.
 *   4. Captures any amount exceeding total loan outstanding in `overpayment_credit` so the PostgreSQL
 *      constraint `chk_repayment_allocation_sum` (`allocated_penalty + allocated_fee + allocated_interest + allocated_principal + overpayment_credit = amount_received`) holds with 4-decimal exactness.
 *   5. Updates installment statuses (`PARTIALLY_PAID` / `PAID`), updates loan ledger balances, transitions
 *      loan to `CLOSED_PAID` when `total_outstanding === 0`, and issues a sequential `payment_receipts` record.
 */
export async function recordTenantLoanRepayment(
  businessId: UUID,
  actorUserId: UUID,
  actorPlatformRole: PlatformRole,
  input: RecordRepaymentRequestDTO,
  auditMeta: { ipAddress: string | null; userAgent: string | null }
): Promise<RepaymentDetailsResponseDTO> {
  const repaymentId = await withTenantTransaction(
    { businessId, actorUserId, isSuperAdmin: false },
    async (client) => {
      // 1. Lock business row for sequential reference & receipt numbering + operational settings
      const bizRes = await client.query<{
        legal_name: string;
        business_code: string;
        settings_json: Record<string, unknown>;
      }>(
        `SELECT legal_name, business_code, settings_json
         FROM businesses
         WHERE id = $1
         FOR UPDATE`,
        [businessId]
      );
      const bizRow = bizRes.rows[0];
      if (!bizRow) {
        throw new AppError(404, 'BUSINESS_NOT_FOUND', 'Business tenant was not found.');
      }

      const rawSettings = bizRow.settings_json ?? {};
      const rawPrefix = rawSettings['receiptNumberPrefix'];
      const prefix =
        typeof rawPrefix === 'string' && rawPrefix.trim().length >= 2
          ? rawPrefix.trim().toUpperCase()
          : 'RCPT-';
      const normalizedReceiptPrefix = prefix.endsWith('-') ? prefix : `${prefix}-`;
      const allowPartialPayments =
        typeof rawSettings['allowPartialInstallmentPayments'] === 'boolean'
          ? rawSettings['allowPartialInstallmentPayments']
          : true;
      const statementFooterNote =
        typeof rawSettings['statementFooterNote'] === 'string'
          ? rawSettings['statementFooterNote']
          : 'Thank you for partnering with FloTech Digital.';

      // 2. Lock loan row and verify status allows repayment
      const loanRes = await client.query<LoanJoinedRow>(
        `${SELECT_LOAN_JOINED_SQL}
         WHERE l.business_id = $1 AND l.id = $2
         FOR UPDATE OF l`,
        [businessId, input.loanId]
      );
      const loanRow = loanRes.rows[0];
      if (!loanRow) {
        throw new AppError(404, 'LOAN_NOT_FOUND', 'Loan was not found in this business.');
      }

      if (
        loanRow.status !== LoanStatus.ACTIVE &&
        loanRow.status !== LoanStatus.OVERDUE &&
        loanRow.status !== LoanStatus.RESTRUCTURED &&
        loanRow.status !== LoanStatus.DEFAULTED
      ) {
        throw new AppError(
          409,
          'INVALID_LOAN_STATUS_FOR_REPAYMENT',
          `Repayments can only be recorded on ACTIVE, OVERDUE, RESTRUCTURED, or DEFAULTED loans (current status: ${loanRow.status}).`
        );
      }

      const amountReceivedDec = new FinancialDecimal(input.amountReceived);
      if (amountReceivedDec.lessThanOrEqualTo(0)) {
        throw new AppError(400, 'INVALID_REPAYMENT_AMOUNT', 'Repayment amount must be greater than zero.');
      }

      const normalizedExtRef = input.externalTransactionRef?.trim() || null;
      const normalizedIdempKey = input.idempotencyKey?.trim() || null;

      if (normalizedIdempKey) {
        const dupIdempRes = await client.query<{ reference_number: string }>(
          `SELECT reference_number
           FROM repayments
           WHERE business_id = $1
             AND idempotency_key = $2
             AND is_reversed = FALSE
           LIMIT 1`,
          [businessId, normalizedIdempKey]
        );
        if (dupIdempRes.rowCount && dupIdempRes.rowCount > 0) {
          throw new AppError(
            409,
            'DUPLICATE_REPAYMENT_SUBMISSION',
            `Duplicate payment submission rejected: idempotencyKey "${normalizedIdempKey}" was already processed under reference ${dupIdempRes.rows[0]?.reference_number}.`
          );
        }
      }

      if (normalizedExtRef) {
        const dupExtRes = await client.query<{ reference_number: string }>(
          `SELECT reference_number
           FROM repayments
           WHERE business_id = $1
             AND loan_id = $2
             AND external_transaction_ref = $3
             AND is_reversed = FALSE
           LIMIT 1`,
          [businessId, loanRow.id, normalizedExtRef]
        );
        if (dupExtRes.rowCount && dupExtRes.rowCount > 0) {
          throw new AppError(
            409,
            'DUPLICATE_REPAYMENT_SUBMISSION',
            `Duplicate payment submission rejected: externalTransactionRef "${normalizedExtRef}" was already recorded for this loan under reference ${dupExtRes.rows[0]?.reference_number}.`
          );
        }
      }

      // 3. Lock unpaid schedule rows ordered by installment_number ASC
      const schedulesRes = await client.query<{
        id: UUID;
        installment_number: number;
        due_date: Date | string;
        status: InstallmentStatus;
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
      }>(
        `SELECT
           id,
           installment_number,
           due_date,
           status,
           principal_due,
           interest_due,
           fee_due,
           penalty_due,
           total_due,
           principal_paid,
           interest_paid,
           fee_paid,
           penalty_paid,
           total_paid
         FROM repayment_schedules
         WHERE business_id = $1
           AND loan_id = $2
           AND status IN ('PENDING', 'PARTIALLY_PAID', 'OVERDUE')
         ORDER BY installment_number ASC
         FOR UPDATE`,
        [businessId, input.loanId]
      );

      if (schedulesRes.rows.length === 0) {
        throw new AppError(
          409,
          'NO_UNPAID_INSTALLMENTS',
          'This loan has no remaining unpaid installments to allocate against.'
        );
      }

      // Check allowPartialInstallmentPayments against first unpaid installment if configured false
      const firstUnpaid = schedulesRes.rows[0]!;
      const firstUnpaidRemainingDec = new FinancialDecimal(firstUnpaid.total_due).minus(
        new FinancialDecimal(firstUnpaid.total_paid)
      );
      if (!allowPartialPayments && amountReceivedDec.lessThan(firstUnpaidRemainingDec)) {
        throw new AppError(
          409,
          'PARTIAL_INSTALLMENT_PAYMENT_DISALLOWED',
          `Partial installment payments are disabled for this business. Minimum payment required for Installment #${firstUnpaid.installment_number} is ${toStorageMoney(firstUnpaidRemainingDec)}.`
        );
      }

      // 4. Execute deterministic waterfall allocation across installments:
      //    Priority per installment: Penalty -> Fee -> Interest -> Principal
      let remainingPoolDec = amountReceivedDec;
      let totalPenaltyAllocatedDec = new FinancialDecimal(0);
      let totalFeeAllocatedDec = new FinancialDecimal(0);
      let totalInterestAllocatedDec = new FinancialDecimal(0);
      let totalPrincipalAllocatedDec = new FinancialDecimal(0);

      interface PendingScheduleAllocation {
        scheduleId: UUID;
        installmentNumber: number;
        penaltyAlloc: InstanceType<typeof FinancialDecimal>;
        feeAlloc: InstanceType<typeof FinancialDecimal>;
        interestAlloc: InstanceType<typeof FinancialDecimal>;
        principalAlloc: InstanceType<typeof FinancialDecimal>;
        totalAlloc: InstanceType<typeof FinancialDecimal>;
        newPenaltyPaid: InstanceType<typeof FinancialDecimal>;
        newFeePaid: InstanceType<typeof FinancialDecimal>;
        newInterestPaid: InstanceType<typeof FinancialDecimal>;
        newPrincipalPaid: InstanceType<typeof FinancialDecimal>;
        newTotalPaid: InstanceType<typeof FinancialDecimal>;
        newStatus: InstallmentStatus;
      }

      const scheduleAllocations: PendingScheduleAllocation[] = [];

      for (const sRow of schedulesRes.rows) {
        if (remainingPoolDec.lessThanOrEqualTo(0)) {
          break;
        }

        const penaltyUnpaidDec = FinancialDecimal.max(
          new FinancialDecimal(0),
          new FinancialDecimal(sRow.penalty_due).minus(new FinancialDecimal(sRow.penalty_paid))
        );
        const feeUnpaidDec = FinancialDecimal.max(
          new FinancialDecimal(0),
          new FinancialDecimal(sRow.fee_due).minus(new FinancialDecimal(sRow.fee_paid))
        );
        const interestUnpaidDec = FinancialDecimal.max(
          new FinancialDecimal(0),
          new FinancialDecimal(sRow.interest_due).minus(new FinancialDecimal(sRow.interest_paid))
        );
        const principalUnpaidDec = FinancialDecimal.max(
          new FinancialDecimal(0),
          new FinancialDecimal(sRow.principal_due).minus(new FinancialDecimal(sRow.principal_paid))
        );

        const penaltyAlloc = FinancialDecimal.min(remainingPoolDec, penaltyUnpaidDec);
        remainingPoolDec = remainingPoolDec.minus(penaltyAlloc);

        const feeAlloc = FinancialDecimal.min(remainingPoolDec, feeUnpaidDec);
        remainingPoolDec = remainingPoolDec.minus(feeAlloc);

        const interestAlloc = FinancialDecimal.min(remainingPoolDec, interestUnpaidDec);
        remainingPoolDec = remainingPoolDec.minus(interestAlloc);

        const principalAlloc = FinancialDecimal.min(remainingPoolDec, principalUnpaidDec);
        remainingPoolDec = remainingPoolDec.minus(principalAlloc);

        const totalAlloc = penaltyAlloc
          .plus(feeAlloc)
          .plus(interestAlloc)
          .plus(principalAlloc);

        if (totalAlloc.greaterThan(0)) {
          totalPenaltyAllocatedDec = totalPenaltyAllocatedDec.plus(penaltyAlloc);
          totalFeeAllocatedDec = totalFeeAllocatedDec.plus(feeAlloc);
          totalInterestAllocatedDec = totalInterestAllocatedDec.plus(interestAlloc);
          totalPrincipalAllocatedDec = totalPrincipalAllocatedDec.plus(principalAlloc);

          const newPenaltyPaid = new FinancialDecimal(sRow.penalty_paid).plus(penaltyAlloc);
          const newFeePaid = new FinancialDecimal(sRow.fee_paid).plus(feeAlloc);
          const newInterestPaid = new FinancialDecimal(sRow.interest_paid).plus(interestAlloc);
          const newPrincipalPaid = new FinancialDecimal(sRow.principal_paid).plus(principalAlloc);
          const newTotalPaid = new FinancialDecimal(sRow.total_paid).plus(totalAlloc);
          const totalDueDec = new FinancialDecimal(sRow.total_due);

          const isFullyPaid = newTotalPaid.greaterThanOrEqualTo(totalDueDec);
          const newStatus = isFullyPaid
            ? InstallmentStatus.PAID
            : sRow.status === InstallmentStatus.OVERDUE
              ? InstallmentStatus.OVERDUE
              : InstallmentStatus.PARTIALLY_PAID;

          scheduleAllocations.push({
            scheduleId: sRow.id,
            installmentNumber: Number(sRow.installment_number),
            penaltyAlloc,
            feeAlloc,
            interestAlloc,
            principalAlloc,
            totalAlloc,
            newPenaltyPaid,
            newFeePaid,
            newInterestPaid,
            newPrincipalPaid,
            newTotalPaid,
            newStatus,
          });
        }
      }

      const overpaymentCreditDec = remainingPoolDec;

      // 5. Generate sequential reference_number and receipt_number
      const repCountRes = await client.query<{ total_count: number }>(
        `SELECT COUNT(*)::int AS total_count FROM repayments WHERE business_id = $1`,
        [businessId]
      );
      const nextSeq = (repCountRes.rows[0]?.total_count ?? 0) + 1;
      const paddedSeq = String(nextSeq).padStart(5, '0');
      const referenceNumber = `PAY-${paddedSeq}`;
      const receiptNumber = `${normalizedReceiptPrefix}${paddedSeq}`;

      const effectivePaidAt = input.paidAt ? new Date(input.paidAt).toISOString() : new Date().toISOString();

      // 6. Insert into `repayments`
      const insertRepRes = await client.query<{ id: UUID }>(
        `INSERT INTO repayments (
           business_id,
           loan_id,
           customer_id,
           reference_number,
           payment_method,
           external_transaction_ref,
           idempotency_key,
           currency_code,
           amount_received,
           allocated_penalty,
           allocated_fee,
           allocated_interest,
           allocated_principal,
           overpayment_credit,
           paid_at,
           recorded_by_user_id,
           notes
         )
         VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8,
           $9, $10, $11, $12, $13, $14,
           $15, $16, $17
         )
         RETURNING id`,
        [
          businessId,
          loanRow.id,
          loanRow.customer_id,
          referenceNumber,
          input.paymentMethod,
          normalizedExtRef,
          normalizedIdempKey,
          loanRow.currency_code,
          toStorageMoney(amountReceivedDec),
          toStorageMoney(totalPenaltyAllocatedDec),
          toStorageMoney(totalFeeAllocatedDec),
          toStorageMoney(totalInterestAllocatedDec),
          toStorageMoney(totalPrincipalAllocatedDec),
          toStorageMoney(overpaymentCreditDec),
          effectivePaidAt,
          actorUserId,
          input.notes ?? null,
        ]
      );
      const createdRepaymentId = insertRepRes.rows[0]!.id;

      // 7. Update `repayment_schedules` and insert `repayment_allocations`
      for (const alloc of scheduleAllocations) {
        await client.query(
          `UPDATE repayment_schedules
           SET penalty_paid = $3,
               fee_paid = $4,
               interest_paid = $5,
               principal_paid = $6,
               total_paid = $7,
               status = $8,
               paid_at = CASE WHEN $8 = 'PAID'::installment_status_type THEN $9::timestamptz ELSE paid_at END,
               updated_at = NOW()
           WHERE business_id = $1 AND id = $2`,
          [
            businessId,
            alloc.scheduleId,
            toStorageMoney(alloc.newPenaltyPaid),
            toStorageMoney(alloc.newFeePaid),
            toStorageMoney(alloc.newInterestPaid),
            toStorageMoney(alloc.newPrincipalPaid),
            toStorageMoney(alloc.newTotalPaid),
            alloc.newStatus,
            effectivePaidAt,
          ]
        );

        await client.query(
          `INSERT INTO repayment_allocations (
             business_id,
             repayment_id,
             schedule_id,
             principal_allocated,
             interest_allocated,
             fee_allocated,
             penalty_allocated,
             total_allocated
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            businessId,
            createdRepaymentId,
            alloc.scheduleId,
            toStorageMoney(alloc.principalAlloc),
            toStorageMoney(alloc.interestAlloc),
            toStorageMoney(alloc.feeAlloc),
            toStorageMoney(alloc.penaltyAlloc),
            toStorageMoney(alloc.totalAlloc),
          ]
        );
      }

      // 8. Recompute loan outstanding balances and status
      const newPrincipalOutDec = FinancialDecimal.max(
        new FinancialDecimal(0),
        new FinancialDecimal(loanRow.principal_outstanding).minus(totalPrincipalAllocatedDec)
      );
      const newInterestOutDec = FinancialDecimal.max(
        new FinancialDecimal(0),
        new FinancialDecimal(loanRow.interest_outstanding).minus(totalInterestAllocatedDec)
      );
      const newFeeOutDec = FinancialDecimal.max(
        new FinancialDecimal(0),
        new FinancialDecimal(loanRow.fee_outstanding).minus(totalFeeAllocatedDec)
      );
      const newPenaltyOutDec = FinancialDecimal.max(
        new FinancialDecimal(0),
        new FinancialDecimal(loanRow.penalty_outstanding).minus(totalPenaltyAllocatedDec)
      );
      const newTotalOutDec = newPrincipalOutDec
        .plus(newInterestOutDec)
        .plus(newFeeOutDec)
        .plus(newPenaltyOutDec);

      // Check if any OVERDUE installments remain on this loan
      const remainingOverdueRes = await client.query<{ overdue_count: number }>(
        `SELECT COUNT(*)::int AS overdue_count
         FROM repayment_schedules
         WHERE business_id = $1 AND loan_id = $2 AND status = 'OVERDUE'`,
        [businessId, loanRow.id]
      );
      const remainingOverdueCount = remainingOverdueRes.rows[0]?.overdue_count ?? 0;

      let newLoanStatus: LoanStatus = loanRow.status;
      if (newTotalOutDec.isZero()) {
        newLoanStatus = LoanStatus.CLOSED_PAID;
      } else if (loanRow.status === LoanStatus.OVERDUE && remainingOverdueCount === 0) {
        newLoanStatus = LoanStatus.ACTIVE;
      }

      await client.query(
        `UPDATE loans
         SET principal_outstanding = $3,
             interest_outstanding = $4,
             fee_outstanding = $5,
             penalty_outstanding = $6,
             total_outstanding = $7,
             status = $8,
             closed_at = CASE WHEN $8 = 'CLOSED_PAID'::loan_status_type THEN NOW() ELSE closed_at END,
             updated_at = NOW()
         WHERE business_id = $1 AND id = $2`,
        [
          businessId,
          loanRow.id,
          toStorageMoney(newPrincipalOutDec),
          toStorageMoney(newInterestOutDec),
          toStorageMoney(newFeeOutDec),
          toStorageMoney(newPenaltyOutDec),
          toStorageMoney(newTotalOutDec),
          newLoanStatus,
        ]
      );

      // 9. Lookup actor user full name for immutable receipt snapshot
      const actorRes = await client.query<{ full_name: string }>(
        `SELECT full_name FROM users WHERE id = $1`,
        [actorUserId]
      );
      const recordedByFullName = actorRes.rows[0]?.full_name ?? 'Authorized Cashier';

      const receiptSnapshot: PaymentReceiptSnapshotDTO = {
        receiptNumber,
        referenceNumber,
        issuedAt: effectivePaidAt,
        businessLegalName: bizRow.legal_name,
        businessCode: bizRow.business_code,
        statementFooterNote,
        customerNumber: loanRow.customer_number,
        customerFullName: `${loanRow.customer_first_name} ${loanRow.customer_last_name}`.trim(),
        customerPhoneNumber: loanRow.customer_phone_number,
        loanNumber: loanRow.loan_number,
        loanProductName: loanRow.loan_product_name,
        currencyCode: loanRow.currency_code,
        paymentMethod: input.paymentMethod,
        externalTransactionRef: input.externalTransactionRef ?? null,
        amountReceived: toStorageMoney(amountReceivedDec),
        allocatedPenalty: toStorageMoney(totalPenaltyAllocatedDec),
        allocatedFee: toStorageMoney(totalFeeAllocatedDec),
        allocatedInterest: toStorageMoney(totalInterestAllocatedDec),
        allocatedPrincipal: toStorageMoney(totalPrincipalAllocatedDec),
        overpaymentCredit: toStorageMoney(overpaymentCreditDec),
        remainingLoanTotalOutstanding: toStorageMoney(newTotalOutDec),
        remainingLoanPrincipalOutstanding: toStorageMoney(newPrincipalOutDec),
        recordedByFullName,
      };

      await client.query(
        `INSERT INTO payment_receipts (
           business_id,
           repayment_id,
           receipt_number,
           issued_at,
           snapshot_json
         )
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [
          businessId,
          createdRepaymentId,
          receiptNumber,
          effectivePaidAt,
          JSON.stringify(receiptSnapshot),
        ]
      );

      // 10. Create in-app notification for the business owner / actor and record audit log
      await client.query(
        `INSERT INTO notifications (
           business_id,
           recipient_user_id,
           category,
           title,
           body,
           action_url
         )
         VALUES ($1, $2, 'REPAYMENT_RECORDED', $3, $4, '/app/repayments')`,
        [
          businessId,
          actorUserId,
          `Repayment ${receiptNumber} Recorded (${loanRow.loan_number})`,
          `Received ${toStorageMoney(amountReceivedDec)} ${loanRow.currency_code} from ${receiptSnapshot.customerFullName}. Remaining loan balance: ${toStorageMoney(newTotalOutDec)} ${loanRow.currency_code}.`,
        ]
      );

      await client.query(
        `INSERT INTO audit_logs (
           business_id, actor_user_id, actor_platform_role, action, entity_type, entity_id, before_state, after_state, ip_address, user_agent
         )
         VALUES ($1, $2, $3, 'REPAYMENT_RECORDED', 'repayments', $4, $5::jsonb, $6::jsonb, $7, $8)`,
        [
          businessId,
          actorUserId,
          actorPlatformRole,
          createdRepaymentId,
          JSON.stringify({
            loanId: loanRow.id,
            loanStatus: loanRow.status,
            previousTotalOutstanding: toStorageMoney(loanRow.total_outstanding),
          }),
          JSON.stringify({
            repaymentId: createdRepaymentId,
            referenceNumber,
            receiptNumber,
            amountReceived: toStorageMoney(amountReceivedDec),
            allocatedPenalty: toStorageMoney(totalPenaltyAllocatedDec),
            allocatedFee: toStorageMoney(totalFeeAllocatedDec),
            allocatedInterest: toStorageMoney(totalInterestAllocatedDec),
            allocatedPrincipal: toStorageMoney(totalPrincipalAllocatedDec),
            overpaymentCredit: toStorageMoney(overpaymentCreditDec),
            newLoanStatus,
            newTotalOutstanding: toStorageMoney(newTotalOutDec),
          }),
          auditMeta.ipAddress,
          auditMeta.userAgent,
        ]
      );

      return createdRepaymentId;
    }
  );

  return getTenantRepaymentDetails(businessId, repaymentId, actorUserId);
}

/**
 * Reverses a previously recorded repayment (`repayments:reverse`), restoring each affected
 * `repayment_schedules` installment and the parent `loans` outstanding balances atomically.
 */
export async function reverseTenantLoanRepayment(
  businessId: UUID,
  repaymentId: UUID,
  actorUserId: UUID,
  actorPlatformRole: PlatformRole,
  input: ReverseRepaymentRequestDTO,
  auditMeta: { ipAddress: string | null; userAgent: string | null }
): Promise<RepaymentDetailsResponseDTO> {
  await withTenantTransaction(
    { businessId, actorUserId, isSuperAdmin: false },
    async (client) => {
      const repRes = await client.query<{
        id: UUID;
        loan_id: UUID;
        reference_number: string;
        amount_received: string;
        allocated_penalty: string;
        allocated_fee: string;
        allocated_interest: string;
        allocated_principal: string;
        is_reversed: boolean;
      }>(
        `SELECT
           id,
           loan_id,
           reference_number,
           amount_received,
           allocated_penalty,
           allocated_fee,
           allocated_interest,
           allocated_principal,
           is_reversed
         FROM repayments
         WHERE business_id = $1 AND id = $2
         FOR UPDATE`,
        [businessId, repaymentId]
      );

      const repRow = repRes.rows[0];
      if (!repRow) {
        throw new AppError(404, 'REPAYMENT_NOT_FOUND', 'Repayment record was not found in this business.');
      }

      if (repRow.is_reversed) {
        throw new AppError(409, 'REPAYMENT_ALREADY_REVERSED', 'This repayment has already been reversed.');
      }

      const loanRes = await client.query<{
        id: UUID;
        status: LoanStatus;
        principal_outstanding: string;
        interest_outstanding: string;
        fee_outstanding: string;
        penalty_outstanding: string;
        total_outstanding: string;
      }>(
        `SELECT
           id,
           status,
           principal_outstanding,
           interest_outstanding,
           fee_outstanding,
           penalty_outstanding,
           total_outstanding
         FROM loans
         WHERE business_id = $1 AND id = $2
         FOR UPDATE`,
        [businessId, repRow.loan_id]
      );
      const loanRow = loanRes.rows[0];
      if (!loanRow) {
        throw new AppError(404, 'LOAN_NOT_FOUND', 'Parent loan was not found.');
      }

      // Fetch all schedule allocations for this repayment
      const allocsRes = await client.query<{
        schedule_id: UUID;
        principal_allocated: string;
        interest_allocated: string;
        fee_allocated: string;
        penalty_allocated: string;
        total_allocated: string;
      }>(
        `SELECT
           schedule_id,
           principal_allocated,
           interest_allocated,
           fee_allocated,
           penalty_allocated,
           total_allocated
         FROM repayment_allocations
         WHERE business_id = $1 AND repayment_id = $2`,
        [businessId, repaymentId]
      );

      const todayIso = new Date().toISOString().slice(0, 10);

      for (const alloc of allocsRes.rows) {
        const schedRes = await client.query<{
          id: UUID;
          due_date: Date | string;
          principal_paid: string;
          interest_paid: string;
          fee_paid: string;
          penalty_paid: string;
          total_paid: string;
          total_due: string;
        }>(
          `SELECT
             id,
             due_date,
             principal_paid,
             interest_paid,
             fee_paid,
             penalty_paid,
             total_paid,
             total_due
           FROM repayment_schedules
           WHERE business_id = $1 AND id = $2
           FOR UPDATE`,
          [businessId, alloc.schedule_id]
        );
        const schedRow = schedRes.rows[0];
        if (!schedRow) continue;

        const restoredPrincipalPaid = FinancialDecimal.max(
          new FinancialDecimal(0),
          new FinancialDecimal(schedRow.principal_paid).minus(
            new FinancialDecimal(alloc.principal_allocated)
          )
        );
        const restoredInterestPaid = FinancialDecimal.max(
          new FinancialDecimal(0),
          new FinancialDecimal(schedRow.interest_paid).minus(
            new FinancialDecimal(alloc.interest_allocated)
          )
        );
        const restoredFeePaid = FinancialDecimal.max(
          new FinancialDecimal(0),
          new FinancialDecimal(schedRow.fee_paid).minus(new FinancialDecimal(alloc.fee_allocated))
        );
        const restoredPenaltyPaid = FinancialDecimal.max(
          new FinancialDecimal(0),
          new FinancialDecimal(schedRow.penalty_paid).minus(
            new FinancialDecimal(alloc.penalty_allocated)
          )
        );
        const restoredTotalPaid = FinancialDecimal.max(
          new FinancialDecimal(0),
          new FinancialDecimal(schedRow.total_paid).minus(
            new FinancialDecimal(alloc.total_allocated)
          )
        );

        const dueStr = toDateOnlyString(schedRow.due_date);
        let restoredStatus: InstallmentStatus = InstallmentStatus.PENDING;
        if (restoredTotalPaid.greaterThanOrEqualTo(new FinancialDecimal(schedRow.total_due))) {
          restoredStatus = InstallmentStatus.PAID;
        } else if (dueStr < todayIso) {
          restoredStatus = InstallmentStatus.OVERDUE;
        } else if (restoredTotalPaid.greaterThan(0)) {
          restoredStatus = InstallmentStatus.PARTIALLY_PAID;
        }

        await client.query(
          `UPDATE repayment_schedules
           SET principal_paid = $3,
               interest_paid = $4,
               fee_paid = $5,
               penalty_paid = $6,
               total_paid = $7,
               status = $8,
               paid_at = CASE WHEN $8 = 'PAID'::installment_status_type THEN paid_at ELSE NULL END,
               updated_at = NOW()
           WHERE business_id = $1 AND id = $2`,
          [
            businessId,
            schedRow.id,
            toStorageMoney(restoredPrincipalPaid),
            toStorageMoney(restoredInterestPaid),
            toStorageMoney(restoredFeePaid),
            toStorageMoney(restoredPenaltyPaid),
            toStorageMoney(restoredTotalPaid),
            restoredStatus,
          ]
        );
      }

      // Restore loan outstanding balances
      const restoredLoanPrincipalOut = new FinancialDecimal(loanRow.principal_outstanding).plus(
        new FinancialDecimal(repRow.allocated_principal)
      );
      const restoredLoanInterestOut = new FinancialDecimal(loanRow.interest_outstanding).plus(
        new FinancialDecimal(repRow.allocated_interest)
      );
      const restoredLoanFeeOut = new FinancialDecimal(loanRow.fee_outstanding).plus(
        new FinancialDecimal(repRow.allocated_fee)
      );
      const restoredLoanPenaltyOut = new FinancialDecimal(loanRow.penalty_outstanding).plus(
        new FinancialDecimal(repRow.allocated_penalty)
      );
      const restoredLoanTotalOut = restoredLoanPrincipalOut
        .plus(restoredLoanInterestOut)
        .plus(restoredLoanFeeOut)
        .plus(restoredLoanPenaltyOut);

      const restoredLoanStatus =
        loanRow.status === LoanStatus.CLOSED_PAID && restoredLoanTotalOut.greaterThan(0)
          ? LoanStatus.ACTIVE
          : loanRow.status;

      await client.query(
        `UPDATE loans
         SET principal_outstanding = $3,
             interest_outstanding = $4,
             fee_outstanding = $5,
             penalty_outstanding = $6,
             total_outstanding = $7,
             status = $8,
             closed_at = CASE WHEN $8 = 'CLOSED_PAID'::loan_status_type THEN closed_at ELSE NULL END,
             updated_at = NOW()
         WHERE business_id = $1 AND id = $2`,
        [
          businessId,
          loanRow.id,
          toStorageMoney(restoredLoanPrincipalOut),
          toStorageMoney(restoredLoanInterestOut),
          toStorageMoney(restoredLoanFeeOut),
          toStorageMoney(restoredLoanPenaltyOut),
          toStorageMoney(restoredLoanTotalOut),
          restoredLoanStatus,
        ]
      );

      await client.query(
        `UPDATE repayments
         SET is_reversed = TRUE,
             reversed_at = NOW(),
             reversed_by_user_id = $3,
             reversal_reason = $4
         WHERE business_id = $1 AND id = $2`,
        [businessId, repaymentId, actorUserId, input.reversalReason]
      );

      await client.query(
        `INSERT INTO audit_logs (
           business_id, actor_user_id, actor_platform_role, action, entity_type, entity_id, before_state, after_state, ip_address, user_agent
         )
         VALUES ($1, $2, $3, 'REPAYMENT_REVERSED', 'repayments', $4, $5::jsonb, $6::jsonb, $7, $8)`,
        [
          businessId,
          actorUserId,
          actorPlatformRole,
          repaymentId,
          JSON.stringify({
            isReversed: false,
            previousLoanStatus: loanRow.status,
            previousTotalOutstanding: toStorageMoney(loanRow.total_outstanding),
          }),
          JSON.stringify({
            isReversed: true,
            reversalReason: input.reversalReason,
            restoredLoanStatus,
            restoredTotalOutstanding: toStorageMoney(restoredLoanTotalOut),
          }),
          auditMeta.ipAddress,
          auditMeta.userAgent,
        ]
      );
    }
  );

  return getTenantRepaymentDetails(businessId, repaymentId, actorUserId);
}

/**
 * Retrieves the immutable receipt record for a repayment (`repayments:view`).
 */
export async function getTenantPaymentReceipt(
  businessId: UUID,
  repaymentId: UUID,
  actorUserId: UUID
): Promise<PaymentReceiptDTO> {
  const details = await getTenantRepaymentDetails(businessId, repaymentId, actorUserId);
  if (!details.receipt) {
    throw new AppError(404, 'RECEIPT_NOT_FOUND', 'Receipt was not found for this repayment.');
  }
  return details.receipt;
}
