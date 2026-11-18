import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import {
  InstallmentStatus,
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
import { queryPlatform } from '../database/pool.js';

const TEST_TOKENS: Record<string, DecodedFirebaseIdentity> = {
  'token-p8-owner-a': {
    uid: 'fb_uid_phase8_owner_a',
    email: 'owner.p8.a@flotech-test.com',
    name: 'Amadou Bamba',
  },
  'token-p8-cashier-a': {
    uid: 'fb_uid_phase8_cashier_a',
    email: 'cashier.p8.a@flotech-test.com',
    name: 'Fatou Ndiaye',
  },
  'token-p8-owner-b': {
    uid: 'fb_uid_phase8_owner_b',
    email: 'owner.p8.b@flotech-test.com',
    name: 'David Mensah',
  },
};

async function cleanupPhase8TestData(): Promise<void> {
  const userIdsRes = await queryPlatform<{ id: string }>(
    `SELECT id FROM users WHERE firebase_uid IN (
       'fb_uid_phase8_owner_a',
       'fb_uid_phase8_cashier_a',
       'fb_uid_phase8_owner_b'
     )`
  );
  const userIds = userIdsRes.rows.map((r) => r.id);
  if (userIds.length === 0) return;

  const bizRes = await queryPlatform<{ id: string }>(
    `SELECT id FROM businesses WHERE owner_user_id = ANY($1::uuid[])`,
    [userIds]
  );
  const bizIds = bizRes.rows.map((b) => b.id);

  if (bizIds.length > 0) {
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
    await queryPlatform(`DELETE FROM notifications WHERE business_id = ANY($1::uuid[])`, [bizIds]);
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

  await queryPlatform(`DELETE FROM notifications WHERE recipient_user_id = ANY($1::uuid[])`, [
    userIds,
  ]);
  await queryPlatform(`DELETE FROM audit_logs WHERE actor_user_id = ANY($1::uuid[])`, [userIds]);
  await queryPlatform(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [userIds]);
}

describe('FloTech Phase 8 — Repayment Management, Waterfall Allocation & Receipts (Live PostgreSQL)', () => {
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
    await cleanupPhase8TestData();

    for (const token of Object.keys(TEST_TOKENS)) {
      await request(app)
        .post('/api/v1/auth/session')
        .set('X-Firebase-AppCheck', 'valid-app-check-token')
        .set('Authorization', `Bearer ${token}`)
        .send({});
    }
  });

  afterAll(async () => {
    await cleanupPhase8TestData();
    setFirebaseVerifierForTesting(null);
  });

  it('allocates repayments strictly via Penalty -> Fee -> Interest -> Principal waterfall and issues sequential receipts', async () => {
    const createBizRes = await request(app)
      .post('/api/v1/businesses')
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p8-owner-a')
      .send({
        legalName: 'Dakar Microfinance SA',
        businessCategory: 'LENDING_INSTITUTION',
        primaryEmail: 'treasury@dakarmfi.com',
        primaryPhone: '+221778889900',
        countryCode: 'SN',
        currencyCode: 'USD',
      });
    const businessId = createBizRes.body.data.business.id as string;

    const custRes = await request(app)
      .post(`/api/v1/businesses/${businessId}/customers`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p8-owner-a')
      .send({
        firstName: 'Seydou',
        lastName: 'Keita',
        phoneNumber: '+221771234567',
      });
    const customerId = custRes.body.data.id as string;

    // Flat rate product: 10% per period, $20 fixed origination fee, 5% late penalty rate, 2-day grace
    const prodRes = await request(app)
      .post(`/api/v1/businesses/${businessId}/loan-products`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p8-owner-a')
      .send({
        code: 'WATERFALL_P8',
        name: 'Waterfall Commercial Loan',
        interestMethod: InterestCalculationMethod.FLAT_RATE,
        repaymentFrequency: RepaymentFrequency.MONTHLY,
        nominalInterestRatePercent: '10.000000',
        ratePeriod: 'PER_PERIOD',
        minPrincipal: '500.0000',
        maxPrincipal: '10000.0000',
        minTermInstallments: 2,
        maxTermInstallments: 12,
        originationFeeFixed: '20.0000',
        originationFeePercent: '0.000000',
        latePenaltyRatePercent: '5.000000',
        gracePeriodDays: 2,
      });
    const productId = prodRes.body.data.id as string;

    // Loan of 1000.0000 over 2 installments starting 2026-04-01:
    // Installment #1: principal_due = 500.0000, interest_due = 100.0000, fee_due = 20.0000 (total 620.0000)
    // Installment #2: principal_due = 500.0000, interest_due = 100.0000, fee_due = 0.0000 (total 600.0000)
    const loanRes = await request(app)
      .post(`/api/v1/businesses/${businessId}/loans`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p8-owner-a')
      .send({
        customerId,
        loanProductId: productId,
        principalAmount: '1000.0000',
        termInstallments: 2,
        firstRepaymentDate: '2026-04-01',
        submitImmediately: true,
      });
    const loanId = loanRes.body.data.id as string;

    await request(app)
      .post(`/api/v1/businesses/${businessId}/loans/${loanId}/approve`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p8-owner-a')
      .send({});

    await request(app)
      .post(`/api/v1/businesses/${businessId}/loans/${loanId}/disburse`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p8-owner-a')
      .send({ firstRepaymentDate: '2026-04-01' });

    // Evaluate delinquency on 2026-04-10 -> Installment #1 accrues 5% penalty on 500.0000 = 25.0000
    // Installment #1 now has: penalty_due = 25.0000, fee_due = 20.0000, interest_due = 100.0000, principal_due = 500.0000 (total 645.0000)
    await request(app)
      .post(`/api/v1/businesses/${businessId}/repayment-schedules/evaluate-overdue`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p8-owner-a')
      .send({ asOfDate: '2026-04-10', applyLatePenalties: true });

    // Post partial payment of 200.0000:
    // Waterfall must allocate:
    //   1. Penalty: 25.0000 (rem 175.0000)
    //   2. Fee:     20.0000 (rem 155.0000)
    //   3. Interest: 100.0000 (rem 55.0000)
    //   4. Principal: 55.0000 (rem 0.0000)
    const pay1Res = await request(app)
      .post(`/api/v1/businesses/${businessId}/repayments`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p8-owner-a')
      .send({
        loanId,
        amountReceived: '200.0000',
        paymentMethod: RepaymentMethod.MOBILE_MONEY,
        externalTransactionRef: 'MM-001',
      });
    expect(pay1Res.status).toBe(201);
    const rep1 = pay1Res.body.data.repayment;
    expect(rep1.referenceNumber).toBe('PAY-00001');
    expect(rep1.receiptNumber).toBe('RCPT-00001');
    expect(rep1.allocatedPenalty).toBe('25.0000');
    expect(rep1.allocatedFee).toBe('20.0000');
    expect(rep1.allocatedInterest).toBe('100.0000');
    expect(rep1.allocatedPrincipal).toBe('55.0000');
    expect(rep1.overpaymentCredit).toBe('0.0000');

    // Verify receipt endpoint
    const receiptRes = await request(app)
      .get(`/api/v1/businesses/${businessId}/repayments/${rep1.id}/receipt`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p8-owner-a');
    expect(receiptRes.status).toBe(200);
    expect(receiptRes.body.data.receiptNumber).toBe('RCPT-00001');
    expect(receiptRes.body.data.snapshot.allocatedPenalty).toBe('25.0000');
    expect(receiptRes.body.data.snapshot.remainingLoanPrincipalOutstanding).toBe('945.0000');
  });

  it('closes a loan as CLOSED_PAID upon full settlement and handles overpayment_credit', async () => {
    const createBizRes = await request(app)
      .post('/api/v1/businesses')
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p8-owner-a')
      .send({
        legalName: 'Abidjan Credit SA',
        businessCategory: 'LENDING_INSTITUTION',
        primaryEmail: 'ops@abidjancredit.com',
        primaryPhone: '+22507001122',
        countryCode: 'CI',
        currencyCode: 'USD',
      });
    const businessId = createBizRes.body.data.business.id as string;

    const custRes = await request(app)
      .post(`/api/v1/businesses/${businessId}/customers`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p8-owner-a')
      .send({
        firstName: 'Awa',
        lastName: 'Kone',
        phoneNumber: '+22507112233',
      });
    const customerId = custRes.body.data.id as string;

    const prodRes = await request(app)
      .post(`/api/v1/businesses/${businessId}/loan-products`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p8-owner-a')
      .send({
        code: 'PAYOFF_P8',
        name: 'Quick Payoff Loan',
        interestMethod: InterestCalculationMethod.FLAT_RATE,
        repaymentFrequency: RepaymentFrequency.MONTHLY,
        nominalInterestRatePercent: '5.000000',
        ratePeriod: 'PER_PERIOD',
        minPrincipal: '100.0000',
        maxPrincipal: '5000.0000',
        minTermInstallments: 1,
        maxTermInstallments: 6,
      });
    const productId = prodRes.body.data.id as string;

    // Loan of 1000.0000 over 2 installments at 5% flat per period -> total payable = 1100.0000
    const loanRes = await request(app)
      .post(`/api/v1/businesses/${businessId}/loans`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p8-owner-a')
      .send({
        customerId,
        loanProductId: productId,
        principalAmount: '1000.0000',
        termInstallments: 2,
        firstRepaymentDate: '2026-07-01',
        submitImmediately: true,
      });
    const loanId = loanRes.body.data.id as string;

    await request(app)
      .post(`/api/v1/businesses/${businessId}/loans/${loanId}/approve`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p8-owner-a')
      .send({});

    await request(app)
      .post(`/api/v1/businesses/${businessId}/loans/${loanId}/disburse`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p8-owner-a')
      .send({ firstRepaymentDate: '2026-07-01' });

    // Pay 1150.0000 (50.0000 overpayment credit)
    const payRes = await request(app)
      .post(`/api/v1/businesses/${businessId}/repayments`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p8-owner-a')
      .send({
        loanId,
        amountReceived: '1150.0000',
        paymentMethod: RepaymentMethod.BANK_TRANSFER,
      });
    expect(payRes.status).toBe(201);
    expect(payRes.body.data.repayment.allocatedPrincipal).toBe('1000.0000');
    expect(payRes.body.data.repayment.allocatedInterest).toBe('100.0000');
    expect(payRes.body.data.repayment.overpaymentCredit).toBe('50.0000');
    expect(payRes.body.data.loan.status).toBe(LoanStatus.CLOSED_PAID);
    expect(payRes.body.data.loan.totalOutstanding).toBe('0.0000');
  });

  it('reverses a posted repayment, restoring schedule & loan balances, and enforces RBAC on repayments:reverse', async () => {
    const createBizRes = await request(app)
      .post('/api/v1/businesses')
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p8-owner-a')
      .send({
        legalName: 'Lome Commercial Finance',
        businessCategory: 'LENDING_INSTITUTION',
        primaryEmail: 'info@lomefinance.com',
        primaryPhone: '+22890112233',
        countryCode: 'TG',
        currencyCode: 'USD',
      });
    const businessId = createBizRes.body.data.business.id as string;

    // Add cashier (has repayments:record & repayments:view, but NOT repayments:reverse)
    const rolesRes = await request(app)
      .get(`/api/v1/businesses/${businessId}/roles`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p8-owner-a');
    const cashierRole = rolesRes.body.data.find((r: { slug: string }) => r.slug === 'cashier');
    expect(cashierRole).toBeDefined();

    await request(app)
      .post(`/api/v1/businesses/${businessId}/employees`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p8-owner-a')
      .send({
        email: 'cashier.p8.a@flotech-test.com',
        fullName: 'Fatou Ndiaye',
        roleId: cashierRole.id,
        activateImmediately: true,
      });

    const custRes = await request(app)
      .post(`/api/v1/businesses/${businessId}/customers`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p8-owner-a')
      .send({
        firstName: 'Koffi',
        lastName: 'Mensah',
        phoneNumber: '+22890223344',
      });
    const customerId = custRes.body.data.id as string;

    const prodRes = await request(app)
      .post(`/api/v1/businesses/${businessId}/loan-products`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p8-owner-a')
      .send({
        code: 'REV_P8',
        name: 'Reversal Test Product',
        interestMethod: InterestCalculationMethod.FLAT_RATE,
        repaymentFrequency: RepaymentFrequency.MONTHLY,
        nominalInterestRatePercent: '10.000000',
        ratePeriod: 'PER_PERIOD',
        minPrincipal: '200.0000',
        maxPrincipal: '5000.0000',
        minTermInstallments: 1,
        maxTermInstallments: 6,
      });
    const productId = prodRes.body.data.id as string;

    const loanRes = await request(app)
      .post(`/api/v1/businesses/${businessId}/loans`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p8-owner-a')
      .send({
        customerId,
        loanProductId: productId,
        principalAmount: '500.0000',
        termInstallments: 1,
        firstRepaymentDate: '2027-09-01',
        submitImmediately: true,
      });
    const loanId = loanRes.body.data.id as string;

    await request(app)
      .post(`/api/v1/businesses/${businessId}/loans/${loanId}/approve`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p8-owner-a')
      .send({});

    await request(app)
      .post(`/api/v1/businesses/${businessId}/loans/${loanId}/disburse`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p8-owner-a')
      .send({ firstRepaymentDate: '2027-09-01' });

    // Cashier records full repayment of 550.0000
    const payRes = await request(app)
      .post(`/api/v1/businesses/${businessId}/repayments`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p8-cashier-a')
      .send({
        loanId,
        amountReceived: '550.0000',
        paymentMethod: RepaymentMethod.CHEQUE,
      });
    expect(payRes.status).toBe(201);
    const repaymentId = payRes.body.data.repayment.id as string;
    expect(payRes.body.data.loan.status).toBe(LoanStatus.CLOSED_PAID);

    // Cashier attempts to reverse repayment -> 403 INSUFFICIENT_PERMISSIONS
    const cashierRevRes = await request(app)
      .post(`/api/v1/businesses/${businessId}/repayments/${repaymentId}/reverse`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p8-cashier-a')
      .send({ reversalReason: 'Cheque dishonored' });
    expect(cashierRevRes.status).toBe(403);

    // Owner reverses repayment -> 200, loan restored to ACTIVE with 550.0000 total_outstanding
    const ownerRevRes = await request(app)
      .post(`/api/v1/businesses/${businessId}/repayments/${repaymentId}/reverse`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p8-owner-a')
      .send({ reversalReason: 'Cheque returned unpaid by clearing bank.' });
    expect(ownerRevRes.status).toBe(200);
    expect(ownerRevRes.body.data.repayment.isReversed).toBe(true);
    expect(ownerRevRes.body.data.loan.status).toBe(LoanStatus.ACTIVE);
    expect(ownerRevRes.body.data.loan.totalOutstanding).toBe('550.0000');
    expect(ownerRevRes.body.data.loan.principalOutstanding).toBe('500.0000');

    const schedRes = await request(app)
      .get(`/api/v1/businesses/${businessId}/repayment-schedules?loanId=${loanId}`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p8-owner-a');
    expect(schedRes.body.data[0].status).toBe(InstallmentStatus.PENDING);
    expect(schedRes.body.data[0].totalPaid).toBe('0.0000');
  });
});
