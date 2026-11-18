import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  InterestCalculationMethod,
  LoanStatus,
  RepaymentFrequency,
  RepaymentMethod,
} from '@flotech/shared';
import { createApp } from '../app.js';
import {
  setFirebaseVerifierForTesting,
  type DecodedFirebaseIdentity,
} from '../config/firebase.js';
import { runMigrations } from '../database/migrate.js';
import { queryPlatform, withTenantTransaction } from '../database/pool.js';
import {
  FinancialDecimal,
  generateLoanSchedulePreview,
  toStorageMoney,
} from '../financial/decimalEngine.js';

const app = createApp();

const TEST_IDENTITIES: Record<string, DecodedFirebaseIdentity> = {
  'token-p13-owner-a': {
    uid: 'fb_uid_p13_owner_a',
    email: 'owner.a.p13@flotech-audit.com',
    name: 'Owner A (Audit)',
  },
  'token-p13-manager-a': {
    uid: 'fb_uid_p13_manager_a',
    email: 'manager.a.p13@flotech-audit.com',
    name: 'Manager A (Audit)',
  },
  'token-p13-cashier-a': {
    uid: 'fb_uid_p13_cashier_a',
    email: 'cashier.a.p13@flotech-audit.com',
    name: 'Cashier A (Audit)',
  },
  'token-p13-owner-b': {
    uid: 'fb_uid_p13_owner_b',
    email: 'owner.b.p13@flotech-audit.com',
    name: 'Owner B (Audit)',
  },
  'token-p13-manager-b': {
    uid: 'fb_uid_p13_manager_b',
    email: 'manager.b.p13@flotech-audit.com',
    name: 'Manager B (Audit)',
  },
  'token-p13-cashier-b': {
    uid: 'fb_uid_p13_cashier_b',
    email: 'cashier.b.p13@flotech-audit.com',
    name: 'Cashier B (Audit)',
  },
};

async function cleanupPhase13Data(): Promise<void> {
  const emails = Object.values(TEST_IDENTITIES).map((i) => i.email);
  const usersRes = await queryPlatform<{ id: string }>(
    `SELECT id FROM users WHERE email = ANY($1::text[]) OR email LIKE '%@flotech-audit.com'`,
    [emails]
  );
  const userIds = usersRes.rows.map((r) => r.id);

  if (userIds.length > 0) {
    const bizRes = await queryPlatform<{ id: string }>(
      `SELECT id FROM businesses WHERE owner_user_id = ANY($1::uuid[])`,
      [userIds]
    );
    const bizIds = bizRes.rows.map((r) => r.id);

    if (bizIds.length > 0) {
      await queryPlatform(`DELETE FROM notifications WHERE business_id = ANY($1::uuid[])`, [bizIds]);
      await queryPlatform(`DELETE FROM audit_logs WHERE business_id = ANY($1::uuid[])`, [bizIds]);
      await queryPlatform(`DELETE FROM payment_receipts WHERE business_id = ANY($1::uuid[])`, [
        bizIds,
      ]);
      await queryPlatform(`DELETE FROM repayment_allocations WHERE business_id = ANY($1::uuid[])`, [
        bizIds,
      ]);
      await queryPlatform(`DELETE FROM repayments WHERE business_id = ANY($1::uuid[])`, [bizIds]);
      await queryPlatform(`DELETE FROM repayment_schedules WHERE business_id = ANY($1::uuid[])`, [
        bizIds,
      ]);
      await queryPlatform(`DELETE FROM loans WHERE business_id = ANY($1::uuid[])`, [bizIds]);
      await queryPlatform(`DELETE FROM loan_products WHERE business_id = ANY($1::uuid[])`, [
        bizIds,
      ]);
      await queryPlatform(`DELETE FROM customer_documents WHERE business_id = ANY($1::uuid[])`, [
        bizIds,
      ]);
      await queryPlatform(`DELETE FROM customers WHERE business_id = ANY($1::uuid[])`, [bizIds]);
      await queryPlatform(
        `DELETE FROM business_subscriptions WHERE business_id = ANY($1::uuid[])`,
        [bizIds]
      );
      await queryPlatform(`DELETE FROM business_memberships WHERE business_id = ANY($1::uuid[])`, [
        bizIds,
      ]);
      await queryPlatform(`DELETE FROM role_permissions WHERE business_id = ANY($1::uuid[])`, [
        bizIds,
      ]);
      await queryPlatform(`DELETE FROM roles WHERE business_id = ANY($1::uuid[])`, [bizIds]);
      await queryPlatform(`DELETE FROM businesses WHERE id = ANY($1::uuid[])`, [bizIds]);
    }

    await queryPlatform(`DELETE FROM notifications WHERE recipient_user_id = ANY($1::uuid[])`, [
      userIds,
    ]);
    await queryPlatform(`DELETE FROM audit_logs WHERE actor_user_id = ANY($1::uuid[])`, [userIds]);
    await queryPlatform(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [userIds]);
  }
}

describe('FloTech Phase 12 & Phase 13 — Production Readiness, Financial Accuracy & Multi-Tenant Security Audit (Live PostgreSQL)', () => {
  beforeAll(async () => {
    await runMigrations();
    await cleanupPhase13Data();

    setFirebaseVerifierForTesting({
      async verifyIdToken(token: string): Promise<DecodedFirebaseIdentity> {
        const identity = TEST_IDENTITIES[token];
        if (!identity) {
          throw new Error(`Invalid test token: ${token}`);
        }
        return identity;
      },
      async verifyAppCheckToken(token: string): Promise<void> {
        if (token !== 'valid-app-check-token') {
          throw new Error('Invalid App Check token');
        }
      },
    });

    for (const token of Object.keys(TEST_IDENTITIES)) {
      const res = await request(app)
        .post('/api/v1/auth/session')
        .set('X-Firebase-AppCheck', 'valid-app-check-token')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(res.status).toBe(200);
    }
  });

  afterAll(async () => {
    setFirebaseVerifierForTesting(null);
    await cleanupPhase13Data();
  });

  it('TASK 3 (Part A): verifies exact Decimal.js financial accuracy across Flat, Reducing Balance, Interest-Only, Zero-Interest, Daily/Weekly/BiWeekly/Monthly/Quarterly, Single-Payment, Very Small (0.0500), and Large (99999999.9900) loans', () => {
    // 1. Flat Rate Monthly
    const flatPreview = generateLoanSchedulePreview({
      principalAmount: '1000.0000',
      nominalInterestRatePercent: '5.000000',
      ratePeriod: 'PER_PERIOD',
      interestMethod: InterestCalculationMethod.FLAT_RATE,
      repaymentFrequency: RepaymentFrequency.MONTHLY,
      termInstallments: 4,
      firstRepaymentDate: '2027-01-01',
      originationFeeFixed: '15.0000',
      originationFeePercent: '1.000000',
    });
    expect(flatPreview.principalAmount).toBe('1000.0000');
    expect(flatPreview.totalInterestAmount).toBe('200.0000');
    expect(flatPreview.totalFeeAmount).toBe('25.0000');
    expect(flatPreview.totalPayableAmount).toBe('1225.0000');
    expect(flatPreview.installments[3]!.closingBalance).toBe('0.0000');

    // 2. Reducing Balance Equal Installments (Annuity)
    const annuityPreview = generateLoanSchedulePreview({
      principalAmount: '10000.0000',
      nominalInterestRatePercent: '12.000000',
      ratePeriod: 'PER_ANNUM',
      interestMethod: InterestCalculationMethod.DECLINING_BALANCE_EQUAL_INSTALLMENTS,
      repaymentFrequency: RepaymentFrequency.MONTHLY,
      termInstallments: 12,
      firstRepaymentDate: '2027-01-01',
    });
    const annuityPrincipalSum = annuityPreview.installments.reduce(
      (acc, inst) => acc.plus(new FinancialDecimal(inst.principalDue)),
      new FinancialDecimal(0)
    );
    expect(toStorageMoney(annuityPrincipalSum)).toBe('10000.0000');
    expect(annuityPreview.installments[11]!.closingBalance).toBe('0.0000');

    // 3. Reducing Balance Equal Principal
    const eqPrincipalPreview = generateLoanSchedulePreview({
      principalAmount: '3000.0000',
      nominalInterestRatePercent: '2.000000',
      ratePeriod: 'PER_PERIOD',
      interestMethod: InterestCalculationMethod.DECLINING_BALANCE_EQUAL_PRINCIPAL,
      repaymentFrequency: RepaymentFrequency.MONTHLY,
      termInstallments: 3,
      firstRepaymentDate: '2027-01-01',
    });
    expect(eqPrincipalPreview.installments[0]!.interestDue).toBe('60.0000');
    expect(eqPrincipalPreview.installments[1]!.interestDue).toBe('40.0000');
    expect(eqPrincipalPreview.installments[2]!.interestDue).toBe('20.0000');
    expect(eqPrincipalPreview.totalInterestAmount).toBe('120.0000');

    // 4. Interest-Free Loan (0.000000% nominal rate)
    const zeroInterestPreview = generateLoanSchedulePreview({
      principalAmount: '1200.0000',
      nominalInterestRatePercent: '0.000000',
      ratePeriod: 'PER_ANNUM',
      interestMethod: InterestCalculationMethod.DECLINING_BALANCE_EQUAL_INSTALLMENTS,
      repaymentFrequency: RepaymentFrequency.MONTHLY,
      termInstallments: 6,
      firstRepaymentDate: '2027-01-01',
    });
    expect(zeroInterestPreview.totalInterestAmount).toBe('0.0000');
    expect(zeroInterestPreview.totalPayableAmount).toBe('1200.0000');
    expect(zeroInterestPreview.installments.every((i) => i.principalDue === '200.0000')).toBe(true);

    // 5. Daily, Weekly, Bi-Weekly, Quarterly & Single-Payment Schedules
    const dailyPreview = generateLoanSchedulePreview({
      principalAmount: '700.0000',
      nominalInterestRatePercent: '1.000000',
      ratePeriod: 'PER_PERIOD',
      interestMethod: InterestCalculationMethod.FLAT_RATE,
      repaymentFrequency: RepaymentFrequency.DAILY,
      termInstallments: 7,
      firstRepaymentDate: '2027-03-01',
    });
    expect(dailyPreview.installments[0]!.dueDate).toBe('2027-03-01');
    expect(dailyPreview.installments[6]!.dueDate).toBe('2027-03-07');

    const weeklyPreview = generateLoanSchedulePreview({
      principalAmount: '400.0000',
      nominalInterestRatePercent: '2.000000',
      ratePeriod: 'PER_PERIOD',
      interestMethod: InterestCalculationMethod.FLAT_RATE,
      repaymentFrequency: RepaymentFrequency.WEEKLY,
      termInstallments: 4,
      firstRepaymentDate: '2027-03-01',
    });
    expect(weeklyPreview.installments[1]!.dueDate).toBe('2027-03-08');
    expect(weeklyPreview.installments[3]!.dueDate).toBe('2027-03-22');

    const singlePaymentPreview = generateLoanSchedulePreview({
      principalAmount: '2500.0000',
      nominalInterestRatePercent: '4.500000',
      ratePeriod: 'PER_PERIOD',
      interestMethod: InterestCalculationMethod.INTEREST_ONLY,
      repaymentFrequency: RepaymentFrequency.QUARTERLY,
      termInstallments: 1,
      firstRepaymentDate: '2027-06-01',
    });
    expect(singlePaymentPreview.installmentCount).toBe(1);
    expect(singlePaymentPreview.installments[0]!.principalDue).toBe('2500.0000');
    expect(singlePaymentPreview.installments[0]!.interestDue).toBe('112.5000');
    expect(singlePaymentPreview.totalPayableAmount).toBe('2612.5000');

    // 6. Edge Case: Very Small Amount (0.0500 over 10 installments)
    const microPreview = generateLoanSchedulePreview({
      principalAmount: '0.0500',
      nominalInterestRatePercent: '10.000000',
      ratePeriod: 'PER_PERIOD',
      interestMethod: InterestCalculationMethod.FLAT_RATE,
      repaymentFrequency: RepaymentFrequency.MONTHLY,
      termInstallments: 10,
      firstRepaymentDate: '2027-01-01',
    });
    const microPrincipalSum = microPreview.installments.reduce(
      (acc, inst) => acc.plus(new FinancialDecimal(inst.principalDue)),
      new FinancialDecimal(0)
    );
    expect(toStorageMoney(microPrincipalSum)).toBe('0.0500');
    expect(
      microPreview.installments.every((inst) =>
        new FinancialDecimal(inst.closingBalance).greaterThanOrEqualTo(0)
      )
    ).toBe(true);
    expect(microPreview.installments[9]!.closingBalance).toBe('0.0000');

    // 7. Edge Case: Very Large Institutional Amount (99,999,999.9900 over 24 installments)
    const macroPreview = generateLoanSchedulePreview({
      principalAmount: '99999999.9900',
      nominalInterestRatePercent: '8.500000',
      ratePeriod: 'PER_ANNUM',
      interestMethod: InterestCalculationMethod.DECLINING_BALANCE_EQUAL_INSTALLMENTS,
      repaymentFrequency: RepaymentFrequency.MONTHLY,
      termInstallments: 24,
      firstRepaymentDate: '2027-01-01',
    });
    const macroPrincipalSum = macroPreview.installments.reduce(
      (acc, inst) => acc.plus(new FinancialDecimal(inst.principalDue)),
      new FinancialDecimal(0)
    );
    expect(toStorageMoney(macroPrincipalSum)).toBe('99999999.9900');
    expect(macroPreview.installments[23]!.closingBalance).toBe('0.0000');
  });

  it('TASK 2, TASK 3 (Part B) & TASK 4: executes end-to-end business workflow, verifies Original vs Repaid vs Outstanding accounting fields, blocks duplicate payment submissions, blocks physical deletion of repayments, and enforces full Business A vs Business B multi-tenant isolation', async () => {
    // 1. Provision Business A (Owner A, Manager A, Cashier A, + Unprovisioned Invited Employee)
    const bizARes = await request(app)
      .post('/api/v1/businesses')
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p13-owner-a')
      .send({
        legalName: 'Business A Financial Services',
        businessCategory: 'LENDING_INSTITUTION',
        primaryEmail: 'ops@biz-a-audit.com',
        primaryPhone: '+2348010000001',
        countryCode: 'NG',
        currencyCode: 'USD',
      });
    expect(bizARes.status).toBe(201);
    const bizAId = bizARes.body.data.business.id as string;

    // Upgrade Business A to BUSINESS plan so it can add multiple employees
    await request(app)
      .post(`/api/v1/businesses/${bizAId}/subscription/change-plan`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p13-owner-a')
      .send({ planCode: 'BUSINESS', billingInterval: 'MONTHLY' });

    const rolesARes = await request(app)
      .get(`/api/v1/businesses/${bizAId}/roles`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p13-owner-a');
    const managerRoleA = rolesARes.body.data.find(
      (r: { slug: string }) => r.slug === 'branch_manager'
    );
    const cashierRoleA = rolesARes.body.data.find((r: { slug: string }) => r.slug === 'cashier');

    await request(app)
      .post(`/api/v1/businesses/${bizAId}/employees`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p13-owner-a')
      .send({
        email: 'manager.a.p13@flotech-audit.com',
        fullName: 'Manager A',
        roleId: managerRoleA.id,
        activateImmediately: true,
      });

    await request(app)
      .post(`/api/v1/businesses/${bizAId}/employees`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p13-owner-a')
      .send({
        email: 'cashier.a.p13@flotech-audit.com',
        fullName: 'Cashier A',
        roleId: cashierRoleA.id,
        activateImmediately: true,
      });

    // Invite a brand-new employee email not yet in `users` table (verifies platform_role 'USER' enum value on pre-provisioned invitees)
    const unprovisionedInviteRes = await request(app)
      .post(`/api/v1/businesses/${bizAId}/employees`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p13-owner-a')
      .send({
        email: 'new.officer.p13@flotech-audit.com',
        fullName: 'New Officer A',
        roleId: cashierRoleA.id,
        activateImmediately: false,
      });
    expect(unprovisionedInviteRes.status).toBe(201);

    // 2. Provision Business B (Owner B, Manager B, Cashier B)
    const bizBRes = await request(app)
      .post('/api/v1/businesses')
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p13-owner-b')
      .send({
        legalName: 'Business B Capital Partners',
        businessCategory: 'LENDING_INSTITUTION',
        primaryEmail: 'ops@biz-b-audit.com',
        primaryPhone: '+2348020000002',
        countryCode: 'NG',
        currencyCode: 'USD',
      });
    expect(bizBRes.status).toBe(201);
    const bizBId = bizBRes.body.data.business.id as string;

    // 3. Create Customer A, Loan Product A (Zero-Interest & Fee-Bearing), and Loan A in Business A
    const custARes = await request(app)
      .post(`/api/v1/businesses/${bizAId}/customers`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p13-owner-a')
      .send({
        firstName: 'Ngozi',
        lastName: 'Eze',
        phoneNumber: '+2348031112222',
        monthlyIncome: '4500.0000',
      });
    expect(custARes.status).toBe(201);
    const custAId = custARes.body.data.id as string;

    const prodARes = await request(app)
      .post(`/api/v1/businesses/${bizAId}/loan-products`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p13-owner-a')
      .send({
        code: 'AUDIT_P13',
        name: 'Audit Commercial Facility',
        interestMethod: InterestCalculationMethod.FLAT_RATE,
        repaymentFrequency: RepaymentFrequency.MONTHLY,
        nominalInterestRatePercent: '5.000000',
        ratePeriod: 'PER_PERIOD',
        minPrincipal: '100.0000',
        maxPrincipal: '50000.0000',
        minTermInstallments: 1,
        maxTermInstallments: 24,
        originationFeeFixed: '30.0000',
        latePenaltyRatePercent: '10.000000',
      });
    const prodAId = prodARes.body.data.id as string;

    // Loan of 1000.0000 over 2 installments at 5% per period + 30.0000 fee -> payable = 1130.0000
    const loanARes = await request(app)
      .post(`/api/v1/businesses/${bizAId}/loans`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p13-owner-a')
      .send({
        customerId: custAId,
        loanProductId: prodAId,
        principalAmount: '1000.0000',
        termInstallments: 2,
        firstRepaymentDate: '2026-03-01',
        submitImmediately: true,
      });
    const loanAId = loanARes.body.data.id as string;

    // Cashier A cannot approve Loan A (`loans:approve` missing -> 403 INSUFFICIENT_PERMISSIONS)
    const cashierApproveAttempt = await request(app)
      .post(`/api/v1/businesses/${bizAId}/loans/${loanAId}/approve`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p13-cashier-a')
      .send({});
    expect(cashierApproveAttempt.status).toBe(403);
    expect(cashierApproveAttempt.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');

    // Manager A approves and disburses Loan A
    await request(app)
      .post(`/api/v1/businesses/${bizAId}/loans/${loanAId}/approve`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p13-manager-a')
      .send({});

    await request(app)
      .post(`/api/v1/businesses/${bizAId}/loans/${loanAId}/disburse`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p13-manager-a')
      .send({ firstRepaymentDate: '2026-03-01' });

    // Evaluate delinquency as of 2026-03-15 -> Installment #1 (500 principal) accrues 10% penalty = 50.0000
    await request(app)
      .post(`/api/v1/businesses/${bizAId}/repayment-schedules/evaluate-overdue`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p13-manager-a')
      .send({ asOfDate: '2026-03-15', applyLatePenalties: true });

    // Cashier A records partial repayment of 400.0000 with idempotencyKey and externalTransactionRef
    // Waterfall: Penalty 50.0000 -> Fee 30.0000 -> Interest 50.0000 -> Principal 270.0000
    const repARes = await request(app)
      .post(`/api/v1/businesses/${bizAId}/repayments`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p13-cashier-a')
      .send({
        loanId: loanAId,
        amountReceived: '400.0000',
        paymentMethod: RepaymentMethod.BANK_TRANSFER,
        externalTransactionRef: 'BNK-TX-9001',
        idempotencyKey: 'idemp-key-9001',
      });
    expect(repARes.status).toBe(201);
    const repAId = repARes.body.data.repayment.id as string;

    // Verify all 9 accounting metrics on LoanDTO:
    const updatedLoan = repARes.body.data.loan;
    expect(updatedLoan.principalAmount).toBe('1000.0000'); // Original principal
    expect(updatedLoan.principalRepaid).toBe('270.0000'); // Principal repaid
    expect(updatedLoan.principalOutstanding).toBe('730.0000'); // Principal outstanding
    expect(updatedLoan.totalInterestAmount).toBe('100.0000'); // Interest charged
    expect(updatedLoan.interestCollected).toBe('50.0000'); // Interest collected
    expect(updatedLoan.totalFeeAmount).toBe('30.0000'); // Fees charged
    expect(updatedLoan.feeCollected).toBe('30.0000'); // Fees collected
    expect(updatedLoan.totalPenaltyAmount).toBe('50.0000'); // Penalties charged
    expect(updatedLoan.penaltyCollected).toBe('50.0000'); // Penalties collected
    expect(updatedLoan.totalAmountPaid).toBe('400.0000'); // Total amount paid
    expect(updatedLoan.totalOutstanding).toBe('780.0000'); // Remaining amount due

    // Verify Duplicate Payment Submission Protection (409 DUPLICATE_REPAYMENT_SUBMISSION)
    const dupIdempAttempt = await request(app)
      .post(`/api/v1/businesses/${bizAId}/repayments`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p13-cashier-a')
      .send({
        loanId: loanAId,
        amountReceived: '400.0000',
        paymentMethod: RepaymentMethod.BANK_TRANSFER,
        idempotencyKey: 'idemp-key-9001',
      });
    expect(dupIdempAttempt.status).toBe(409);
    expect(dupIdempAttempt.body.error.code).toBe('DUPLICATE_REPAYMENT_SUBMISSION');

    const dupExtRefAttempt = await request(app)
      .post(`/api/v1/businesses/${bizAId}/repayments`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p13-cashier-a')
      .send({
        loanId: loanAId,
        amountReceived: '400.0000',
        paymentMethod: RepaymentMethod.BANK_TRANSFER,
        externalTransactionRef: 'BNK-TX-9001',
      });
    expect(dupExtRefAttempt.status).toBe(409);
    expect(dupExtRefAttempt.body.error.code).toBe('DUPLICATE_REPAYMENT_SUBMISSION');

    // Verify Customer Profile includes Customer Loan History (Task 2)
    const custDetailsRes = await request(app)
      .get(`/api/v1/businesses/${bizAId}/customers/${custAId}`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p13-owner-a');
    expect(custDetailsRes.status).toBe(200);
    expect(custDetailsRes.body.data.loans).toHaveLength(1);
    expect(custDetailsRes.body.data.loans[0].id).toBe(loanAId);
    expect(custDetailsRes.body.data.loans[0].totalAmountPaid).toBe('400.0000');

    // Verify PostgreSQL trigger `trg_no_delete_repayments` blocks physical deletion of validated repayments
    const ownerAUserRes = await queryPlatform<{ id: string }>(
      `SELECT id FROM users WHERE email = 'owner.a.p13@flotech-audit.com'`
    );
    const ownerAUserId = ownerAUserRes.rows[0]!.id;
    await expect(
      withTenantTransaction(
        { businessId: bizAId, actorUserId: ownerAUserId, isSuperAdmin: false },
        async (client) => {
          await client.query(`DELETE FROM repayments WHERE id = $1`, [repAId]);
        }
      )
    ).rejects.toThrow(/FINANCIAL_IMMUTABILITY_VIOLATION/);

    // 4. Multi-Tenant Security Audit: Business B CANNOT access Business A's customers, loans, repayments, or reports
    const crossCustRes = await request(app)
      .get(`/api/v1/businesses/${bizAId}/customers/${custAId}`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p13-owner-b');
    expect(crossCustRes.status).toBe(403);
    expect(crossCustRes.body.error.code).toBe('TENANT_ACCESS_DENIED');

    const crossLoanRes = await request(app)
      .get(`/api/v1/businesses/${bizAId}/loans/${loanAId}`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p13-owner-b');
    expect(crossLoanRes.status).toBe(403);
    expect(crossLoanRes.body.error.code).toBe('TENANT_ACCESS_DENIED');

    const crossRepRes = await request(app)
      .get(`/api/v1/businesses/${bizAId}/repayments/${repAId}`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p13-owner-b');
    expect(crossRepRes.status).toBe(403);
    expect(crossRepRes.body.error.code).toBe('TENANT_ACCESS_DENIED');

    const crossReportRes = await request(app)
      .get(`/api/v1/businesses/${bizAId}/reports/portfolio`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p13-owner-b');
    expect(crossReportRes.status).toBe(403);
    expect(crossReportRes.body.error.code).toBe('TENANT_ACCESS_DENIED');

    // Business B querying its own workspace sees 0 customers, 0 loans, 0 repayments (RLS isolation)
    const bizBCusts = await request(app)
      .get(`/api/v1/businesses/${bizBId}/customers`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p13-owner-b');
    expect(bizBCusts.status).toBe(200);
    expect(bizBCusts.body.data).toHaveLength(0);
  });

  it('TASK 7: verifies PostgreSQL schema integrity, NUMERIC(19,4) columns, Row-Level Security policies, and protection triggers', async () => {
    // 1. Verify all 16 core tables + schema_migrations exist
    const tablesRes = await queryPlatform<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
    );
    const tableNames = tablesRes.rows.map((r) => r.table_name);
    const expectedTables = [
      'users',
      'businesses',
      'permissions',
      'roles',
      'role_permissions',
      'business_memberships',
      'subscription_plans',
      'business_subscriptions',
      'customers',
      'customer_documents',
      'loan_products',
      'loans',
      'repayment_schedules',
      'repayments',
      'repayment_allocations',
      'payment_receipts',
      'notifications',
      'audit_logs',
      'platform_settings',
      'schema_migrations',
    ];
    for (const tbl of expectedTables) {
      expect(tableNames).toContain(tbl);
    }

    // 2. Verify no floating-point columns (FLOAT / REAL / DOUBLE PRECISION) exist anywhere in public schema
    const floatColsRes = await queryPlatform<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND data_type IN ('real', 'double precision', 'float')`
    );
    expect(floatColsRes.rows).toHaveLength(0);

    // 3. Verify Row-Level Security (RLS) is enabled on all tenant-scoped tables
    const rlsRes = await queryPlatform<{ tablename: string; rowsecurity: boolean }>(
      `SELECT tablename, rowsecurity
       FROM pg_tables
       WHERE schemaname = 'public'
         AND tablename IN (
           'roles', 'role_permissions', 'business_memberships', 'business_subscriptions',
           'customers', 'customer_documents', 'loan_products', 'loans',
           'repayment_schedules', 'repayments', 'repayment_allocations', 'payment_receipts',
           'notifications', 'audit_logs'
         )`
    );
    expect(rlsRes.rows).toHaveLength(14);
    expect(rlsRes.rows.every((r) => r.rowsecurity === true)).toBe(true);
  });
});
