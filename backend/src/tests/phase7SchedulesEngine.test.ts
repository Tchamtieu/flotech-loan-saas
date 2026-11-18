import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import {
  InstallmentStatus,
  InterestCalculationMethod,
  LoanStatus,
  RepaymentFrequency,
} from '@flotech/shared';
import { createApp } from '../app.js';
import {
  setFirebaseVerifierForTesting,
  type DecodedFirebaseIdentity,
} from '../config/firebase.js';
import { runMigrations } from '../database/migrate.js';
import { queryPlatform } from '../database/pool.js';
import { FinancialDecimal, toStorageMoney } from '../financial/decimalEngine.js';

const TEST_TOKENS: Record<string, DecodedFirebaseIdentity> = {
  'token-p7-owner-a': {
    uid: 'fb_uid_phase7_owner_a',
    email: 'owner.p7.a@flotech-test.com',
    name: 'Nadia Ouedraogo',
  },
  'token-p7-officer-a': {
    uid: 'fb_uid_phase7_officer_a',
    email: 'officer.p7.a@flotech-test.com',
    name: 'Moussa Diop',
  },
  'token-p7-owner-b': {
    uid: 'fb_uid_phase7_owner_b',
    email: 'owner.p7.b@flotech-test.com',
    name: 'Claire Fontaine',
  },
};

async function cleanupPhase7TestData(): Promise<void> {
  const userIdsRes = await queryPlatform<{ id: string }>(
    `SELECT id FROM users WHERE firebase_uid IN (
       'fb_uid_phase7_owner_a',
       'fb_uid_phase7_officer_a',
       'fb_uid_phase7_owner_b'
     )`
  );
  const userIds = userIdsRes.rows.map((r) => r.id);
  if (userIds.length === 0) {
    return;
  }

  const bizRes = await queryPlatform<{ id: string }>(
    `SELECT id FROM businesses WHERE owner_user_id = ANY($1::uuid[])`,
    [userIds]
  );
  const bizIds = bizRes.rows.map((b) => b.id);

  if (bizIds.length > 0) {
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
    await queryPlatform(`DELETE FROM audit_logs WHERE business_id = ANY($1::uuid[])`, [bizIds]);
    await queryPlatform(`DELETE FROM business_subscriptions WHERE business_id = ANY($1::uuid[])`, [
      bizIds,
    ]);
    await queryPlatform(`DELETE FROM business_memberships WHERE business_id = ANY($1::uuid[])`, [
      bizIds,
    ]);
    await queryPlatform(`DELETE FROM role_permissions WHERE business_id = ANY($1::uuid[])`, [
      bizIds,
    ]);
    await queryPlatform(`DELETE FROM roles WHERE business_id = ANY($1::uuid[])`, [bizIds]);
    await queryPlatform(`DELETE FROM businesses WHERE id = ANY($1::uuid[])`, [bizIds]);
  }

  await queryPlatform(`DELETE FROM audit_logs WHERE actor_user_id = ANY($1::uuid[])`, [userIds]);
  await queryPlatform(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [userIds]);
}

describe('FloTech Phase 7 — Financial Calculation Engine, Repayment Schedules, Delinquency & Restructuring (Live PostgreSQL)', () => {
  const app = createApp();

  beforeAll(async () => {
    await runMigrations();

    setFirebaseVerifierForTesting({
      async verifyIdToken(idToken: string): Promise<DecodedFirebaseIdentity> {
        const identity = TEST_TOKENS[idToken];
        if (!identity) {
          throw new Error('Invalid Firebase ID token');
        }
        return identity;
      },
      async verifyAppCheckToken(appCheckToken: string): Promise<void> {
        if (appCheckToken !== 'valid-app-check-token') {
          throw new Error('Invalid Firebase App Check token');
        }
      },
    });
  });

  beforeEach(async () => {
    await cleanupPhase7TestData();

    for (const token of Object.keys(TEST_TOKENS)) {
      await request(app)
        .post('/api/v1/auth/session')
        .set('X-Firebase-AppCheck', 'valid-app-check-token')
        .set('Authorization', `Bearer ${token}`)
        .send({});
    }
  });

  afterAll(async () => {
    await cleanupPhase7TestData();
    setFirebaseVerifierForTesting(null);
  });

  it('lists master repayment schedules with days-past-due metrics and filters by status and date range', async () => {
    const createBizRes = await request(app)
      .post('/api/v1/businesses')
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p7-owner-a')
      .send({
        legalName: 'Sahel Capital Finance SARL',
        businessCategory: 'LENDING_INSTITUTION',
        primaryEmail: 'ops@sahelcapital.com',
        primaryPhone: '+221770001122',
        countryCode: 'SN',
        currencyCode: 'USD',
      });
    expect(createBizRes.status).toBe(201);
    const businessId = createBizRes.body.data.business.id as string;

    const createCustomerRes = await request(app)
      .post(`/api/v1/businesses/${businessId}/customers`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p7-owner-a')
      .send({
        firstName: 'Aminata',
        lastName: 'Sow',
        phoneNumber: '+221771112233',
        monthlyIncome: '3200.0000',
        riskTier: 'LOW',
      });
    expect(createCustomerRes.status).toBe(201);
    const customerId = createCustomerRes.body.data.id as string;

    const createProductRes = await request(app)
      .post(`/api/v1/businesses/${businessId}/loan-products`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p7-owner-a')
      .send({
        code: 'SME_MONTHLY_P7',
        name: 'SME Monthly Term Loan',
        interestMethod: InterestCalculationMethod.DECLINING_BALANCE_EQUAL_INSTALLMENTS,
        repaymentFrequency: RepaymentFrequency.MONTHLY,
        nominalInterestRatePercent: '12.000000',
        ratePeriod: 'PER_ANNUM',
        minPrincipal: '500.0000',
        maxPrincipal: '25000.0000',
        minTermInstallments: 2,
        maxTermInstallments: 24,
        originationFeeFixed: '0.0000',
        originationFeePercent: '0.000000',
        latePenaltyRatePercent: '5.000000',
        gracePeriodDays: 3,
      });
    expect(createProductRes.status).toBe(201);
    const productId = createProductRes.body.data.id as string;

    const createLoanRes = await request(app)
      .post(`/api/v1/businesses/${businessId}/loans`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p7-owner-a')
      .send({
        customerId,
        loanProductId: productId,
        principalAmount: '3000.0000',
        termInstallments: 3,
        firstRepaymentDate: '2026-06-01',
        submitImmediately: true,
      });
    expect(createLoanRes.status).toBe(201);
    const loanId = createLoanRes.body.data.id as string;

    await request(app)
      .post(`/api/v1/businesses/${businessId}/loans/${loanId}/approve`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p7-owner-a')
      .send({ notes: 'Approved for Phase 7 schedule test' });

    const disburseRes = await request(app)
      .post(`/api/v1/businesses/${businessId}/loans/${loanId}/disburse`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p7-owner-a')
      .send({ firstRepaymentDate: '2026-06-01' });
    expect(disburseRes.status).toBe(200);

    // Query master repayment schedules as of 2026-06-11 (10 days after 1st installment due date 2026-06-01)
    const listRes = await request(app)
      .get(`/api/v1/businesses/${businessId}/repayment-schedules?asOfDate=2026-06-11`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p7-owner-a');
    expect(listRes.status).toBe(200);
    expect(listRes.body.data).toHaveLength(3);

    const firstInst = listRes.body.data[0];
    expect(firstInst.installmentNumber).toBe(1);
    expect(firstInst.dueDate).toBe('2026-06-01');
    expect(firstInst.daysPastDue).toBe(10);
    expect(firstInst.gracePeriodDays).toBe(3);
    expect(firstInst.latePenaltyRatePercent).toBe('5.000000');

    const secondInst = listRes.body.data[1];
    expect(secondInst.installmentNumber).toBe(2);
    expect(secondInst.dueDate).toBe('2026-07-01');
    expect(secondInst.daysPastDue).toBe(0);
  });

  it('evaluates grace periods, marks past-grace installments & loans OVERDUE, and accrues deterministic Decimal.js late penalties idempotently', async () => {
    const createBizRes = await request(app)
      .post('/api/v1/businesses')
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p7-owner-a')
      .send({
        legalName: 'Atlantic Microcredit Ltd',
        businessCategory: 'LENDING_INSTITUTION',
        primaryEmail: 'credit@atlanticmicro.com',
        primaryPhone: '+233240001122',
        countryCode: 'GH',
        currencyCode: 'USD',
      });
    const businessId = createBizRes.body.data.business.id as string;

    const createCustomerRes = await request(app)
      .post(`/api/v1/businesses/${businessId}/customers`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p7-owner-a')
      .send({
        firstName: 'Kofi',
        lastName: 'Boateng',
        phoneNumber: '+233241112233',
        monthlyIncome: '2500.0000',
      });
    const customerId = createCustomerRes.body.data.id as string;

    // Flat rate product: 10% per period, 5% late penalty rate, 3-day grace period
    const createProductRes = await request(app)
      .post(`/api/v1/businesses/${businessId}/loan-products`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p7-owner-a')
      .send({
        code: 'FLAT_GRACE_P7',
        name: 'Flat Rate Working Capital',
        interestMethod: InterestCalculationMethod.FLAT_RATE,
        repaymentFrequency: RepaymentFrequency.MONTHLY,
        nominalInterestRatePercent: '10.000000',
        ratePeriod: 'PER_PERIOD',
        minPrincipal: '500.0000',
        maxPrincipal: '10000.0000',
        minTermInstallments: 2,
        maxTermInstallments: 12,
        originationFeeFixed: '0.0000',
        originationFeePercent: '0.000000',
        latePenaltyRatePercent: '5.000000',
        gracePeriodDays: 3,
      });
    const productId = createProductRes.body.data.id as string;

    // Loan of 1000.0000 over 2 months starting 2026-05-01 -> principal_due per installment = 500.0000, interest_due = 100.0000
    const createLoanRes = await request(app)
      .post(`/api/v1/businesses/${businessId}/loans`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p7-owner-a')
      .send({
        customerId,
        loanProductId: productId,
        principalAmount: '1000.0000',
        termInstallments: 2,
        firstRepaymentDate: '2026-05-01',
        submitImmediately: true,
      });
    const loanId = createLoanRes.body.data.id as string;

    await request(app)
      .post(`/api/v1/businesses/${businessId}/loans/${loanId}/approve`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p7-owner-a')
      .send({});

    await request(app)
      .post(`/api/v1/businesses/${businessId}/loans/${loanId}/disburse`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p7-owner-a')
      .send({ firstRepaymentDate: '2026-05-01' });

    // 1. Evaluate on 2026-05-03 (within 3-day grace period of 2026-05-01): 2026-05-01 + 3 days = 2026-05-04 -> NOT overdue yet
    const evalWithinGraceRes = await request(app)
      .post(`/api/v1/businesses/${businessId}/repayment-schedules/evaluate-overdue`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p7-owner-a')
      .send({ asOfDate: '2026-05-03', applyLatePenalties: true });
    expect(evalWithinGraceRes.status).toBe(200);
    expect(evalWithinGraceRes.body.data.installmentsMarkedOverdue).toBe(0);
    expect(evalWithinGraceRes.body.data.loansMarkedOverdue).toBe(0);
    expect(evalWithinGraceRes.body.data.penaltiesAccruedCount).toBe(0);
    expect(evalWithinGraceRes.body.data.totalPenaltyAccruedAmount).toBe('0.0000');

    // 2. Evaluate on 2026-05-06 (past grace period 2026-05-04 for installment #1; installment #2 is due 2026-06-01)
    // Expected penalty on installment #1 = 5% of unpaid principal (500.0000) = 25.0000
    const evalPastGraceRes = await request(app)
      .post(`/api/v1/businesses/${businessId}/repayment-schedules/evaluate-overdue`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p7-owner-a')
      .send({ asOfDate: '2026-05-06', applyLatePenalties: true });
    expect(evalPastGraceRes.status).toBe(200);
    expect(evalPastGraceRes.body.data.installmentsMarkedOverdue).toBe(1);
    expect(evalPastGraceRes.body.data.loansMarkedOverdue).toBe(1);
    expect(evalPastGraceRes.body.data.penaltiesAccruedCount).toBe(1);
    expect(evalPastGraceRes.body.data.totalPenaltyAccruedAmount).toBe('25.0000');

    // 3. Re-evaluate on 2026-05-07 -> idempotent: should NOT double-accrue penalty on installment #1
    const evalRepeatRes = await request(app)
      .post(`/api/v1/businesses/${businessId}/repayment-schedules/evaluate-overdue`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p7-owner-a')
      .send({ asOfDate: '2026-05-07', applyLatePenalties: true });
    expect(evalRepeatRes.status).toBe(200);
    expect(evalRepeatRes.body.data.installmentsMarkedOverdue).toBe(0);
    expect(evalRepeatRes.body.data.penaltiesAccruedCount).toBe(0);
    expect(evalRepeatRes.body.data.totalPenaltyAccruedAmount).toBe('0.0000');

    // Verify overdue loans endpoint returns exact DecimalString sums
    const overdueLoansRes = await request(app)
      .get(`/api/v1/businesses/${businessId}/overdue-loans?asOfDate=2026-05-07`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p7-owner-a');
    expect(overdueLoansRes.status).toBe(200);
    expect(overdueLoansRes.body.data).toHaveLength(1);

    const overdueEntry = overdueLoansRes.body.data[0];
    expect(overdueEntry.loan.id).toBe(loanId);
    expect(overdueEntry.loan.status).toBe(LoanStatus.OVERDUE);
    expect(overdueEntry.loan.totalPenaltyAmount).toBe('25.0000');
    expect(overdueEntry.loan.penaltyOutstanding).toBe('25.0000');
    expect(overdueEntry.loan.totalOutstanding).toBe('1225.0000'); // 1000 principal + 200 interest + 25 penalty
    expect(overdueEntry.overdueInstallmentsCount).toBe(1);
    expect(overdueEntry.totalOverdueAmount).toBe('625.0000'); // 500 principal + 100 interest + 25 penalty
    expect(overdueEntry.maxDaysPastDue).toBe(6);
  });

  it('restructures an OVERDUE loan from remaining principal_outstanding with exact Decimal.js precision and optional penalty waiver', async () => {
    const createBizRes = await request(app)
      .post('/api/v1/businesses')
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p7-owner-a')
      .send({
        legalName: 'West Coast Lending Group',
        businessCategory: 'LENDING_INSTITUTION',
        primaryEmail: 'workout@westcoastlending.com',
        primaryPhone: '+2348011122333',
        countryCode: 'NG',
        currencyCode: 'USD',
      });
    const businessId = createBizRes.body.data.business.id as string;

    const createCustomerRes = await request(app)
      .post(`/api/v1/businesses/${businessId}/customers`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p7-owner-a')
      .send({
        firstName: 'Chinedu',
        lastName: 'Okafor',
        phoneNumber: '+2348022233444',
        monthlyIncome: '4000.0000',
      });
    const customerId = createCustomerRes.body.data.id as string;

    const createProductRes = await request(app)
      .post(`/api/v1/businesses/${businessId}/loan-products`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p7-owner-a')
      .send({
        code: 'RESTRUCTURE_P7',
        name: 'Merchant Growth Facility',
        interestMethod: InterestCalculationMethod.FLAT_RATE,
        repaymentFrequency: RepaymentFrequency.MONTHLY,
        nominalInterestRatePercent: '8.000000',
        ratePeriod: 'PER_PERIOD',
        minPrincipal: '500.0000',
        maxPrincipal: '20000.0000',
        minTermInstallments: 2,
        maxTermInstallments: 12,
        originationFeeFixed: '0.0000',
        originationFeePercent: '0.000000',
        latePenaltyRatePercent: '4.000000',
        gracePeriodDays: 2,
      });
    const productId = createProductRes.body.data.id as string;

    const createLoanRes = await request(app)
      .post(`/api/v1/businesses/${businessId}/loans`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p7-owner-a')
      .send({
        customerId,
        loanProductId: productId,
        principalAmount: '2000.0000',
        termInstallments: 2,
        firstRepaymentDate: '2026-04-01',
        submitImmediately: true,
      });
    const loanId = createLoanRes.body.data.id as string;

    await request(app)
      .post(`/api/v1/businesses/${businessId}/loans/${loanId}/approve`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p7-owner-a')
      .send({});

    await request(app)
      .post(`/api/v1/businesses/${businessId}/loans/${loanId}/disburse`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p7-owner-a')
      .send({ firstRepaymentDate: '2026-04-01' });

    // Evaluate delinquency on 2026-04-10 so installment #1 accrues a 4% late penalty on 1000.0000 = 40.0000
    await request(app)
      .post(`/api/v1/businesses/${businessId}/repayment-schedules/evaluate-overdue`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p7-owner-a')
      .send({ asOfDate: '2026-04-10', applyLatePenalties: true });

    // Restructure the loan over 4 new monthly installments at 5.000000% per period, waiving the 40.0000 unpaid penalty
    const restructureRes = await request(app)
      .post(`/api/v1/businesses/${businessId}/loans/${loanId}/restructure`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p7-owner-a')
      .send({
        newTermInstallments: 4,
        newNominalInterestRatePercent: '5.000000',
        newFirstRepaymentDate: '2026-08-01',
        waiveUnpaidPenalties: true,
        reason: 'Borrower seasonal cashflow adjustment approved by credit committee.',
      });
    expect(restructureRes.status).toBe(200);

    const restructuredLoan = restructureRes.body.data.loan;
    const restructuredSchedules = restructureRes.body.data.schedules as Array<{
      installmentNumber: number;
      status: InstallmentStatus;
      principalDue: string;
      interestDue: string;
      penaltyDue: string;
      totalDue: string;
    }>;

    expect(restructuredLoan.status).toBe(LoanStatus.RESTRUCTURED);
    expect(restructuredLoan.termInstallments).toBe(4);
    expect(restructuredLoan.nominalInterestRatePercent).toBe('5.000000');
    expect(restructuredLoan.principalOutstanding).toBe('2000.0000');
    expect(restructuredLoan.penaltyOutstanding).toBe('0.0000');
    // 4 periods * (5% of 2000 = 100 per period) = 400.0000 total interest
    expect(restructuredLoan.interestOutstanding).toBe('400.0000');
    expect(restructuredLoan.totalOutstanding).toBe('2400.0000');

    expect(restructuredSchedules).toHaveLength(4);
    const sumPrincipal = restructuredSchedules.reduce(
      (acc, s) => acc.plus(new FinancialDecimal(s.principalDue)),
      new FinancialDecimal(0)
    );
    expect(toStorageMoney(sumPrincipal)).toBe('2000.0000');
    expect(restructuredSchedules.every((s) => s.status === InstallmentStatus.PENDING)).toBe(true);
  });

  it('enforces RBAC permissions on restructure/write-off, executes loan write-offs, and blocks cross-tenant access', async () => {
    const createBizARes = await request(app)
      .post('/api/v1/businesses')
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p7-owner-a')
      .send({
        legalName: 'Tenant A Lending Corp',
        businessCategory: 'LENDING_INSTITUTION',
        primaryEmail: 'a@tenant-a.com',
        primaryPhone: '+254700112233',
        countryCode: 'KE',
        currencyCode: 'USD',
      });
    const businessAId = createBizARes.body.data.business.id as string;

    // Find LOAN_OFFICER role in Business A (does NOT have loans:restructure or loans:write_off)
    const rolesRes = await request(app)
      .get(`/api/v1/businesses/${businessAId}/roles`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p7-owner-a');
    const loanOfficerRole = rolesRes.body.data.find(
      (r: { slug: string }) => r.slug === 'loan_officer'
    );
    expect(loanOfficerRole).toBeDefined();

    // Add officer to Business A
    await request(app)
      .post(`/api/v1/businesses/${businessAId}/employees`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p7-owner-a')
      .send({
        email: 'officer.p7.a@flotech-test.com',
        fullName: 'Moussa Diop',
        roleId: loanOfficerRole.id,
        activateImmediately: true,
      });

    // Create Business B under Owner B
    const createBizBRes = await request(app)
      .post('/api/v1/businesses')
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p7-owner-b')
      .send({
        legalName: 'Tenant B Credit Union',
        businessCategory: 'COOPERATIVE_ASSOCIATION',
        primaryEmail: 'b@tenant-b.com',
        primaryPhone: '+254799112233',
        countryCode: 'KE',
        currencyCode: 'USD',
      });
    const businessBId = createBizBRes.body.data.business.id as string;

    // Create customer, product, and active loan in Business A
    const custRes = await request(app)
      .post(`/api/v1/businesses/${businessAId}/customers`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p7-owner-a')
      .send({
        firstName: 'Wanjiku',
        lastName: 'Kamau',
        phoneNumber: '+254711223344',
      });
    const customerId = custRes.body.data.id as string;

    const prodRes = await request(app)
      .post(`/api/v1/businesses/${businessAId}/loan-products`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p7-owner-a')
      .send({
        code: 'WRITEOFF_P7',
        name: 'Emergency Trade Credit',
        interestMethod: InterestCalculationMethod.FLAT_RATE,
        repaymentFrequency: RepaymentFrequency.MONTHLY,
        nominalInterestRatePercent: '5.000000',
        ratePeriod: 'PER_PERIOD',
        minPrincipal: '200.0000',
        maxPrincipal: '5000.0000',
        minTermInstallments: 1,
        maxTermInstallments: 6,
      });
    const productId = prodRes.body.data.id as string;

    const loanRes = await request(app)
      .post(`/api/v1/businesses/${businessAId}/loans`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p7-owner-a')
      .send({
        customerId,
        loanProductId: productId,
        principalAmount: '800.0000',
        termInstallments: 2,
        firstRepaymentDate: '2026-03-01',
        submitImmediately: true,
      });
    const loanId = loanRes.body.data.id as string;

    await request(app)
      .post(`/api/v1/businesses/${businessAId}/loans/${loanId}/approve`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p7-owner-a')
      .send({});

    await request(app)
      .post(`/api/v1/businesses/${businessAId}/loans/${loanId}/disburse`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p7-owner-a')
      .send({ firstRepaymentDate: '2026-03-01' });

    // 1. Loan Officer without loans:write_off is blocked (403)
    const officerWriteOffRes = await request(app)
      .post(`/api/v1/businesses/${businessAId}/loans/${loanId}/write-off`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p7-officer-a')
      .send({ reason: 'Unauthorized attempt by loan officer.' });
    expect(officerWriteOffRes.status).toBe(403);

    // 2. Owner B cannot view Business A schedules or write off Business A loan (403/404)
    const crossTenantSchedulesRes = await request(app)
      .get(`/api/v1/businesses/${businessBId}/repayment-schedules`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p7-owner-b');
    expect(crossTenantSchedulesRes.status).toBe(200);
    expect(crossTenantSchedulesRes.body.data).toHaveLength(0);

    const crossTenantWriteOffRes = await request(app)
      .post(`/api/v1/businesses/${businessBId}/loans/${loanId}/write-off`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p7-owner-b')
      .send({ reason: 'Cross-tenant write-off attempt.' });
    expect(crossTenantWriteOffRes.status).toBe(404);

    // 3. Owner A (with loans:write_off) writes off the loan -> status becomes WRITTEN_OFF and unpaid installments become WAIVED
    const ownerWriteOffRes = await request(app)
      .post(`/api/v1/businesses/${businessAId}/loans/${loanId}/write-off`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p7-owner-a')
      .send({ reason: 'Board resolution #2026-11: uncollectible balance written off.' });
    expect(ownerWriteOffRes.status).toBe(200);
    expect(ownerWriteOffRes.body.data.status).toBe(LoanStatus.WRITTEN_OFF);
    expect(ownerWriteOffRes.body.data.closedAt).toBeTruthy();

    const schedulesAfterWriteOffRes = await request(app)
      .get(`/api/v1/businesses/${businessAId}/repayment-schedules?loanId=${loanId}`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p7-owner-a');
    expect(schedulesAfterWriteOffRes.status).toBe(200);
    expect(
      schedulesAfterWriteOffRes.body.data.every(
        (s: { status: InstallmentStatus }) => s.status === InstallmentStatus.WAIVED
      )
    ).toBe(true);
  });
});
