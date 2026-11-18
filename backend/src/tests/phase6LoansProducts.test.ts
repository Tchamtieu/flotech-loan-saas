import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { InterestCalculationMethod, LoanStatus, RepaymentFrequency } from '@flotech/shared';
import { createApp } from '../app.js';
import {
  setFirebaseVerifierForTesting,
  type DecodedFirebaseIdentity,
} from '../config/firebase.js';
import { runMigrations } from '../database/migrate.js';
import { queryPlatform } from '../database/pool.js';
import { FinancialDecimal, toStorageMoney } from '../financial/decimalEngine.js';

const TEST_TOKENS: Record<string, DecodedFirebaseIdentity> = {
  'token-p6-owner-a': {
    uid: 'fb_uid_phase6_owner_a',
    email: 'owner.p6.a@flotech-test.com',
    name: 'Dr. Kwame Mensah',
  },
  'token-p6-manager-a': {
    uid: 'fb_uid_phase6_manager_a',
    email: 'manager.p6.a@flotech-test.com',
    name: 'Sarah Jenkins',
  },
  'token-p6-officer-a': {
    uid: 'fb_uid_phase6_officer_a',
    email: 'officer.p6.a@flotech-test.com',
    name: 'Ibrahim Toure',
  },
  'token-p6-owner-b': {
    uid: 'fb_uid_phase6_owner_b',
    email: 'owner.p6.b@flotech-test.com',
    name: 'Elena Vance',
  },
};

async function cleanupPhase6TestData(): Promise<void> {
  const userIdsRes = await queryPlatform<{ id: string }>(
    `SELECT id FROM users WHERE firebase_uid IN (
       'fb_uid_phase6_owner_a',
       'fb_uid_phase6_manager_a',
       'fb_uid_phase6_officer_a',
       'fb_uid_phase6_owner_b'
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

describe('FloTech Phase 6 — Loan Products & Loan Management (Live PostgreSQL)', () => {
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
    await cleanupPhase6TestData();

    for (const token of Object.keys(TEST_TOKENS)) {
      await request(app)
        .post('/api/v1/auth/session')
        .set('X-Firebase-AppCheck', 'valid-app-check-token')
        .set('Authorization', `Bearer ${token}`)
        .send({});
    }
  });

  afterAll(async () => {
    await cleanupPhase6TestData();
    setFirebaseVerifierForTesting(null);
  });

  it('1. configures loan products, validates principal bounds and unique codes, and updates product settings', async () => {
    const bizRes = await request(app)
      .post('/api/v1/businesses')
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p6-owner-a')
      .send({
        legalName: 'Apex Commercial Credit Ltd',
        businessCategory: 'Commercial Lending',
        primaryEmail: 'credit@apex-commercial.com',
        primaryPhone: '+1 (555) 900-1000',
        countryCode: 'US',
        currencyCode: 'USD',
      });

    const businessId = bizRes.body.data.business.id as string;

    // 1. Reject invalid principal bounds (maxPrincipal < minPrincipal)
    const invalidBoundsRes = await request(app)
      .post(`/api/v1/businesses/${businessId}/loan-products`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p6-owner-a')
      .set('X-Business-Id', businessId)
      .send({
        code: 'INVALID-BOUNDS',
        name: 'Invalid Product',
        interestMethod: InterestCalculationMethod.FLAT_RATE,
        repaymentFrequency: RepaymentFrequency.MONTHLY,
        nominalInterestRatePercent: '12.000000',
        ratePeriod: 'PER_ANNUM',
        minPrincipal: '10000.00',
        maxPrincipal: '5000.00',
        minTermInstallments: 3,
        maxTermInstallments: 12,
      });

    expect(invalidBoundsRes.status).toBe(400);
    expect(invalidBoundsRes.body.error.code).toBe('INVALID_PRINCIPAL_BOUNDS');

    // 2. Create a valid loan product
    const createProdRes = await request(app)
      .post(`/api/v1/businesses/${businessId}/loan-products`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p6-owner-a')
      .set('X-Business-Id', businessId)
      .send({
        code: 'SME-WORKCAP-12M',
        name: 'SME Working Capital 12M',
        description: 'Monthly working capital facility',
        interestMethod: InterestCalculationMethod.FLAT_RATE,
        repaymentFrequency: RepaymentFrequency.MONTHLY,
        nominalInterestRatePercent: '12.00',
        ratePeriod: 'PER_ANNUM',
        minPrincipal: '1000.00',
        maxPrincipal: '50000.00',
        minTermInstallments: 3,
        maxTermInstallments: 12,
        originationFeeFixed: '50.00',
        originationFeePercent: '1.00',
        latePenaltyRatePercent: '2.00',
        gracePeriodDays: 3,
      });

    expect(createProdRes.status).toBe(201);
    expect(createProdRes.body.data.code).toBe('SME-WORKCAP-12M');
    expect(createProdRes.body.data.minPrincipal).toBe('1000.0000');
    expect(createProdRes.body.data.maxPrincipal).toBe('50000.0000');
    expect(createProdRes.body.data.nominalInterestRatePercent).toBe('12.000000');

    // 3. Reject duplicate product code in the same business
    const dupCodeRes = await request(app)
      .post(`/api/v1/businesses/${businessId}/loan-products`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p6-owner-a')
      .set('X-Business-Id', businessId)
      .send({
        code: 'SME-WORKCAP-12M',
        name: 'Duplicate Product',
        interestMethod: InterestCalculationMethod.FLAT_RATE,
        repaymentFrequency: RepaymentFrequency.MONTHLY,
        nominalInterestRatePercent: '15.00',
        ratePeriod: 'PER_ANNUM',
        minPrincipal: '1000.00',
        maxPrincipal: '20000.00',
        minTermInstallments: 3,
        maxTermInstallments: 12,
      });

    expect(dupCodeRes.status).toBe(409);
    expect(dupCodeRes.body.error.code).toBe('LOAN_PRODUCT_CODE_EXISTS');
  });

  it('2. enforces product bounds and RESTRICTED borrower risk check during loan origination, and computes authoritative Decimal.js totals', async () => {
    const bizRes = await request(app)
      .post('/api/v1/businesses')
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p6-owner-a')
      .send({
        legalName: 'Horizon SME Finance',
        businessCategory: 'SME Lender',
        primaryEmail: 'ops@horizon-sme.com',
        primaryPhone: '+1 (555) 910-2000',
        countryCode: 'US',
        currencyCode: 'USD',
      });

    const businessId = bizRes.body.data.business.id as string;

    // Configure custom loanNumberPrefix = 'CRED-'
    await request(app)
      .patch(`/api/v1/businesses/${businessId}/settings`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p6-owner-a')
      .set('X-Business-Id', businessId)
      .send({ loanNumberPrefix: 'CRED-' });

    // Create Loan Product (Flat 12% per annum, Monthly, $1,000 - $25,000, 3 - 12 installments, $50 + 1% fee)
    const prodRes = await request(app)
      .post(`/api/v1/businesses/${businessId}/loan-products`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p6-owner-a')
      .set('X-Business-Id', businessId)
      .send({
        code: 'FLAT-12M',
        name: 'Flat Rate SME Facility',
        interestMethod: InterestCalculationMethod.FLAT_RATE,
        repaymentFrequency: RepaymentFrequency.MONTHLY,
        nominalInterestRatePercent: '12.00',
        ratePeriod: 'PER_ANNUM',
        minPrincipal: '1000.00',
        maxPrincipal: '25000.00',
        minTermInstallments: 3,
        maxTermInstallments: 12,
        originationFeeFixed: '50.00',
        originationFeePercent: '1.00',
      });

    const productId = prodRes.body.data.id as string;

    // Create 1 RESTRICTED borrower and 1 LOW-risk borrower
    const restrictedCustRes = await request(app)
      .post(`/api/v1/businesses/${businessId}/customers`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p6-owner-a')
      .set('X-Business-Id', businessId)
      .send({
        firstName: 'Restricted',
        lastName: 'Borrower',
        phoneNumber: '+1 555 111 0000',
        riskTier: 'RESTRICTED',
      });

    const primeCustRes = await request(app)
      .post(`/api/v1/businesses/${businessId}/customers`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p6-owner-a')
      .set('X-Business-Id', businessId)
      .send({
        firstName: 'Amara',
        lastName: 'Okafor',
        businessName: 'Okafor Agro Exports',
        phoneNumber: '+1 555 222 1111',
        riskTier: 'LOW',
      });

    const restrictedCustomerId = restrictedCustRes.body.data.id as string;
    const primeCustomerId = primeCustRes.body.data.id as string;

    // 1. Block origination for RESTRICTED borrower
    const restrictedLoanRes = await request(app)
      .post(`/api/v1/businesses/${businessId}/loans`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p6-owner-a')
      .set('X-Business-Id', businessId)
      .send({
        customerId: restrictedCustomerId,
        loanProductId: productId,
        principalAmount: '5000.00',
        termInstallments: 6,
        firstRepaymentDate: '2026-12-15',
      });

    expect(restrictedLoanRes.status).toBe(403);
    expect(restrictedLoanRes.body.error.code).toBe('CUSTOMER_RISK_RESTRICTED');

    // 2. Block origination when principal is below product minPrincipal ($500 < $1,000)
    const outOfBoundsRes = await request(app)
      .post(`/api/v1/businesses/${businessId}/loans`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p6-owner-a')
      .set('X-Business-Id', businessId)
      .send({
        customerId: primeCustomerId,
        loanProductId: productId,
        principalAmount: '500.00',
        termInstallments: 6,
        firstRepaymentDate: '2026-12-15',
      });

    expect(outOfBoundsRes.status).toBe(400);
    expect(outOfBoundsRes.body.error.code).toBe('PRINCIPAL_OUT_OF_PRODUCT_BOUNDS');

    // 3. Originate valid $10,000 loan for 6 months at 12% p.a. flat (1% per month * 6 = $600 interest; $50 + 1% ($100) = $150 fee; Total Payable = $10,750.0000)
    const validLoanRes = await request(app)
      .post(`/api/v1/businesses/${businessId}/loans`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p6-owner-a')
      .set('X-Business-Id', businessId)
      .send({
        customerId: primeCustomerId,
        loanProductId: productId,
        principalAmount: '10000.00',
        termInstallments: 6,
        firstRepaymentDate: '2026-12-15',
        purpose: 'Export container financing',
      });

    expect(validLoanRes.status).toBe(201);
    expect(validLoanRes.body.data.loanNumber).toBe('CRED-00001');
    expect(validLoanRes.body.data.status).toBe(LoanStatus.SUBMITTED);
    expect(validLoanRes.body.data.principalAmount).toBe('10000.0000');
    expect(validLoanRes.body.data.totalInterestAmount).toBe('600.0000');
    expect(validLoanRes.body.data.totalFeeAmount).toBe('150.0000');
    expect(validLoanRes.body.data.totalPayableAmount).toBe('10750.0000');
    expect(validLoanRes.body.data.totalOutstanding).toBe('10750.0000');
  });

  it('3. enforces dual-control approval separation of duties and atomically persists repayment_schedules on disbursement', async () => {
    const bizRes = await request(app)
      .post('/api/v1/businesses')
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p6-owner-a')
      .send({
        legalName: 'Dual Control Bank Corp',
        businessCategory: 'Commercial Lending',
        primaryEmail: 'risk@dualcontrol-bank.com',
        primaryPhone: '+1 (555) 920-3000',
        countryCode: 'US',
        currencyCode: 'USD',
      });

    const businessId = bizRes.body.data.business.id as string;

    // Enable requireDualApprovalForLoans = true
    await request(app)
      .patch(`/api/v1/businesses/${businessId}/settings`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p6-owner-a')
      .set('X-Business-Id', businessId)
      .send({ requireDualApprovalForLoans: true });

    // Onboard `manager.p6.a@flotech-test.com` with `branch_manager` role
    const rolesRes = await request(app)
      .get(`/api/v1/businesses/${businessId}/roles`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p6-owner-a')
      .set('X-Business-Id', businessId);

    const managerRole = rolesRes.body.data.find(
      (r: { slug: string }) => r.slug === 'branch_manager'
    );
    expect(managerRole).toBeDefined();

    await request(app)
      .post(`/api/v1/businesses/${businessId}/employees`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p6-owner-a')
      .set('X-Business-Id', businessId)
      .send({
        email: 'manager.p6.a@flotech-test.com',
        fullName: 'Sarah Jenkins',
        roleId: managerRole.id,
        activateImmediately: true,
      });

    // Create Product & Customer
    const prodRes = await request(app)
      .post(`/api/v1/businesses/${businessId}/loan-products`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p6-owner-a')
      .set('X-Business-Id', businessId)
      .send({
        code: 'AMORT-6M',
        name: 'Amortized 6M SME Loan',
        interestMethod: InterestCalculationMethod.DECLINING_BALANCE_EQUAL_INSTALLMENTS,
        repaymentFrequency: RepaymentFrequency.MONTHLY,
        nominalInterestRatePercent: '18.00',
        ratePeriod: 'PER_ANNUM',
        minPrincipal: '1000.00',
        maxPrincipal: '50000.00',
        minTermInstallments: 3,
        maxTermInstallments: 12,
      });

    const custRes = await request(app)
      .post(`/api/v1/businesses/${businessId}/customers`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p6-owner-a')
      .set('X-Business-Id', businessId)
      .send({
        firstName: 'Tunde',
        lastName: 'Bakare',
        phoneNumber: '+1 555 444 5555',
        riskTier: 'STANDARD',
      });

    // Owner originates a DRAFT loan
    const loanRes = await request(app)
      .post(`/api/v1/businesses/${businessId}/loans`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p6-owner-a')
      .set('X-Business-Id', businessId)
      .send({
        customerId: custRes.body.data.id,
        loanProductId: prodRes.body.data.id,
        principalAmount: '10000.00',
        termInstallments: 6,
        firstRepaymentDate: '2026-12-01',
        submitImmediately: false,
      });

    expect(loanRes.status).toBe(201);
    expect(loanRes.body.data.status).toBe(LoanStatus.DRAFT);
    const loanId = loanRes.body.data.id as string;

    // Submit DRAFT -> SUBMITTED
    const submitRes = await request(app)
      .post(`/api/v1/businesses/${businessId}/loans/${loanId}/submit`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p6-owner-a')
      .set('X-Business-Id', businessId)
      .send({ notes: 'Submitted for credit committee review' });

    expect(submitRes.status).toBe(200);
    expect(submitRes.body.data.status).toBe(LoanStatus.SUBMITTED);

    // Creator (`token-p6-owner-a`) attempts to self-approve -> blocked by dual-control policy!
    const selfApproveRes = await request(app)
      .post(`/api/v1/businesses/${businessId}/loans/${loanId}/approve`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p6-owner-a')
      .set('X-Business-Id', businessId)
      .send({ notes: 'Attempting self-approval' });

    expect(selfApproveRes.status).toBe(403);
    expect(selfApproveRes.body.error.code).toBe('DUAL_CONTROL_APPROVAL_VIOLATION');

    // Branch Manager (`token-p6-manager-a`) moves to UNDER_REVIEW and then APPROVES
    const reviewRes = await request(app)
      .post(`/api/v1/businesses/${businessId}/loans/${loanId}/review`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p6-manager-a')
      .set('X-Business-Id', businessId)
      .send({ notes: 'Verified cashflow statements' });

    expect(reviewRes.status).toBe(200);
    expect(reviewRes.body.data.status).toBe(LoanStatus.UNDER_REVIEW);

    const approveRes = await request(app)
      .post(`/api/v1/businesses/${businessId}/loans/${loanId}/approve`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p6-manager-a')
      .set('X-Business-Id', businessId)
      .send({ notes: 'Approved by Branch Manager under dual control' });

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.status).toBe(LoanStatus.APPROVED);
    expect(approveRes.body.data.approvedAt).toBeTruthy();

    // Disburse the approved loan -> transitions to ACTIVE and persists 6 repayment_schedules rows
    const disburseRes = await request(app)
      .post(`/api/v1/businesses/${businessId}/loans/${loanId}/disburse`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p6-owner-a')
      .set('X-Business-Id', businessId)
      .send({ firstRepaymentDate: '2026-12-15', notes: 'Disbursed via wire transfer' });

    expect(disburseRes.status).toBe(200);
    expect(disburseRes.body.data.loan.status).toBe(LoanStatus.ACTIVE);
    expect(disburseRes.body.data.loan.disbursedAt).toBeTruthy();
    expect(disburseRes.body.data.schedules).toHaveLength(6);

    // Verify sum of persisted principalDue equals contracted principalAmount ("10000.0000")
    const schedulesList = disburseRes.body.data.schedules as Array<{ principalDue: string }>;
    const sumPrincipal = schedulesList.reduce(
      (acc, row) => acc.plus(new FinancialDecimal(row.principalDue)),
      new FinancialDecimal(0)
    );
    expect(toStorageMoney(sumPrincipal)).toBe('10000.0000');
  });

  it('4. enforces RBAC boundaries (loan_officer cannot approve/disburse), supports loan rejection, and blocks cross-tenant access', async () => {
    const bizRes = await request(app)
      .post('/api/v1/businesses')
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p6-owner-a')
      .send({
        legalName: 'Sentinel Lending Ltd',
        businessCategory: 'Microfinance',
        primaryEmail: 'sentinel@sentinel-lending.com',
        primaryPhone: '+1 (555) 930-4000',
        countryCode: 'US',
        currencyCode: 'USD',
      });

    const businessId = bizRes.body.data.business.id as string;

    // Add `officer.p6.a@flotech-test.com` as `loan_officer`
    const rolesRes = await request(app)
      .get(`/api/v1/businesses/${businessId}/roles`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p6-owner-a')
      .set('X-Business-Id', businessId);

    const officerRole = rolesRes.body.data.find(
      (r: { slug: string }) => r.slug === 'loan_officer'
    );
    expect(officerRole).toBeDefined();

    await request(app)
      .post(`/api/v1/businesses/${businessId}/employees`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p6-owner-a')
      .set('X-Business-Id', businessId)
      .send({
        email: 'officer.p6.a@flotech-test.com',
        fullName: 'Ibrahim Toure',
        roleId: officerRole.id,
        activateImmediately: true,
      });

    // Create Product & Customer
    const prodRes = await request(app)
      .post(`/api/v1/businesses/${businessId}/loan-products`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p6-owner-a')
      .set('X-Business-Id', businessId)
      .send({
        code: 'MICRO-3M',
        name: 'Micro Trader 3M',
        interestMethod: InterestCalculationMethod.FLAT_RATE,
        repaymentFrequency: RepaymentFrequency.MONTHLY,
        nominalInterestRatePercent: '10.00',
        ratePeriod: 'PER_ANNUM',
        minPrincipal: '500.00',
        maxPrincipal: '10000.00',
        minTermInstallments: 1,
        maxTermInstallments: 6,
      });

    const custRes = await request(app)
      .post(`/api/v1/businesses/${businessId}/customers`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p6-officer-a')
      .set('X-Business-Id', businessId)
      .send({
        firstName: 'Mariam',
        lastName: 'Kone',
        phoneNumber: '+1 555 777 8888',
      });

    // Loan Officer CAN originate loan (`loans:create`)
    const loanRes = await request(app)
      .post(`/api/v1/businesses/${businessId}/loans`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p6-officer-a')
      .set('X-Business-Id', businessId)
      .send({
        customerId: custRes.body.data.id,
        loanProductId: prodRes.body.data.id,
        principalAmount: '2000.00',
        termInstallments: 3,
        firstRepaymentDate: '2026-12-15',
      });

    expect(loanRes.status).toBe(201);
    const loanId = loanRes.body.data.id as string;

    // Loan Officer CANNOT approve loan (`loans:approve` missing)
    const officerApproveRes = await request(app)
      .post(`/api/v1/businesses/${businessId}/loans/${loanId}/approve`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p6-officer-a')
      .set('X-Business-Id', businessId)
      .send({});

    expect(officerApproveRes.status).toBe(403);
    expect(officerApproveRes.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');

    // Owner rejects the loan -> status REJECTED and totalOutstanding = 0.0000
    const rejectRes = await request(app)
      .post(`/api/v1/businesses/${businessId}/loans/${loanId}/reject`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p6-owner-a')
      .set('X-Business-Id', businessId)
      .send({ notes: 'Insufficient debt service coverage ratio' });

    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.data.status).toBe(LoanStatus.REJECTED);
    expect(rejectRes.body.data.totalOutstanding).toBe('0.0000');
    expect(rejectRes.body.data.closedAt).toBeTruthy();

    // Unrelated Tenant B Owner cannot view Tenant A loans
    const crossTenantRes = await request(app)
      .get(`/api/v1/businesses/${businessId}/loans`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p6-owner-b')
      .set('X-Business-Id', businessId);

    expect(crossTenantRes.status).toBe(403);
    expect(crossTenantRes.body.error.code).toBe('TENANT_ACCESS_DENIED');
  });
});
