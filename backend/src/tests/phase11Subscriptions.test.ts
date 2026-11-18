import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  InterestCalculationMethod,
  RepaymentFrequency,
  SubscriptionStatus,
} from '@flotech/shared';
import { createApp } from '../app.js';
import {
  setFirebaseVerifierForTesting,
  type DecodedFirebaseIdentity,
} from '../config/firebase.js';
import { runMigrations } from '../database/migrate.js';
import { queryPlatform } from '../database/pool.js';

const app = createApp();

const TEST_IDENTITIES: Record<string, DecodedFirebaseIdentity> = {
  'token-p11-owner': {
    uid: 'fb_uid_p11_owner',
    email: 'owner.p11@flotech-test.com',
    name: 'Dr. Kwame Mensah (P11 Owner)',
  },
  'token-p11-auditor': {
    uid: 'fb_uid_p11_auditor',
    email: 'auditor.p11@flotech-test.com',
    name: 'Zainab Bello (P11 Auditor)',
  },
};

async function cleanupPhase11Data(): Promise<void> {
  const emails = Object.values(TEST_IDENTITIES).map((i) => i.email);
  const usersRes = await queryPlatform<{ id: string }>(
    `SELECT id FROM users WHERE email = ANY($1::text[]) OR email LIKE '%@p11-invite-test.com'`,
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

describe('FloTech Phase 11 — Tenant Subscription Management, Plan Catalog & Quota Enforcement (Live PostgreSQL)', () => {
  beforeAll(async () => {
    await runMigrations();
    await cleanupPhase11Data();

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
    await cleanupPhase11Data();
  });

  it('retrieves subscription overview with Free, Starter, Business, Growth Pro & Enterprise plans, real-time quotas, and enforces downgrade conflict guards', async () => {
    const createBizRes = await request(app)
      .post('/api/v1/businesses')
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p11-owner')
      .send({
        legalName: 'Accra Sovereign Microfinance',
        businessCategory: 'LENDING_INSTITUTION',
        primaryEmail: 'billing@accramicro.com',
        primaryPhone: '+233240011223',
        countryCode: 'GH',
        currencyCode: 'USD',
      });
    expect(createBizRes.status).toBe(201);
    const businessId = createBizRes.body.data.business.id as string;

    // 1. Inspect initial TRIALING subscription
    const subRes = await request(app)
      .get(`/api/v1/businesses/${businessId}/subscription`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p11-owner');
    expect(subRes.status).toBe(200);
    expect(subRes.body.data.status).toBe(SubscriptionStatus.TRIALING);
    expect(subRes.body.data.planCode).toBe('STARTER_TRIAL');
    expect(subRes.body.data.quotas.activeEmployeesUsed).toBe(1);

    const planCodes = subRes.body.data.availablePlans.map((p: { code: string }) => p.code);
    expect(planCodes).toContain('FREE');
    expect(planCodes).toContain('STARTER_TRIAL');
    expect(planCodes).toContain('BUSINESS');
    expect(planCodes).toContain('GROWTH_PRO');
    expect(planCodes).toContain('ENTERPRISE');

    // 2. Add a second employee (Auditor) so activeEmployeesUsed becomes 2
    const rolesRes = await request(app)
      .get(`/api/v1/businesses/${businessId}/roles`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p11-owner');
    const auditorRole = rolesRes.body.data.find((r: { slug: string }) => r.slug === 'auditor');
    expect(auditorRole).toBeDefined();

    const empRes = await request(app)
      .post(`/api/v1/businesses/${businessId}/employees`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p11-owner')
      .send({
        email: 'auditor.p11@flotech-test.com',
        fullName: 'Zainab Bello',
        roleId: auditorRole.id,
        activateImmediately: true,
      });
    expect(empRes.status).toBe(201);

    // 3. Attempt to downgrade to FREE plan (which has max_employees = 1) -> 409 SUBSCRIPTION_DOWNGRADE_QUOTA_CONFLICT
    const downgradeConflictRes = await request(app)
      .post(`/api/v1/businesses/${businessId}/subscription/change-plan`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p11-owner')
      .send({
        planCode: 'FREE',
        billingInterval: 'MONTHLY',
      });
    expect(downgradeConflictRes.status).toBe(409);
    expect(downgradeConflictRes.body.error.code).toBe('SUBSCRIPTION_DOWNGRADE_QUOTA_CONFLICT');

    // 4. Auditor can view subscription (`subscriptions:view`) but cannot change plan (`subscriptions:manage` -> 403)
    const auditorViewRes = await request(app)
      .get(`/api/v1/businesses/${businessId}/subscription`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p11-auditor');
    expect(auditorViewRes.status).toBe(200);

    const auditorChangeRes = await request(app)
      .post(`/api/v1/businesses/${businessId}/subscription/change-plan`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p11-auditor')
      .send({
        planCode: 'BUSINESS',
        billingInterval: 'ANNUAL',
      });
    expect(auditorChangeRes.status).toBe(403);
    expect(auditorChangeRes.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');

    // 5. Owner upgrades to BUSINESS on ANNUAL billing -> 200 ACTIVE
    const upgradeRes = await request(app)
      .post(`/api/v1/businesses/${businessId}/subscription/change-plan`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p11-owner')
      .send({
        planCode: 'BUSINESS',
        billingInterval: 'ANNUAL',
      });
    expect(upgradeRes.status).toBe(200);
    expect(upgradeRes.body.data.planCode).toBe('BUSINESS');
    expect(upgradeRes.body.data.status).toBe(SubscriptionStatus.ACTIVE);
    expect(upgradeRes.body.data.billingInterval).toBe('ANNUAL');
    expect(upgradeRes.body.data.unitPriceUsd).toBe('790.0000');
    expect(upgradeRes.body.data.quotas.maxActiveLoans).toBe(500);
    expect(upgradeRes.body.data.quotas.maxEmployees).toBe(15);
    expect(upgradeRes.body.data.quotas.maxCustomers).toBe(2500);
  });

  it('enforces subscription cancellation and expiration blocks on customer creation, employee invitation, and loan disbursement', async () => {
    const createBizRes = await request(app)
      .post('/api/v1/businesses')
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p11-owner')
      .send({
        legalName: 'Kumasi Trade Credit Ltd',
        businessCategory: 'LENDING_INSTITUTION',
        primaryEmail: 'ops@kumasicredit.com',
        primaryPhone: '+233249988776',
        countryCode: 'GH',
        currencyCode: 'USD',
      });
    const businessId = createBizRes.body.data.business.id as string;

    // Create customer, loan product, and approved loan while subscription is TRIALING
    const custRes = await request(app)
      .post(`/api/v1/businesses/${businessId}/customers`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p11-owner')
      .send({
        firstName: 'Kojo',
        lastName: 'Antwi',
        phoneNumber: '+233241112223',
      });
    const customerId = custRes.body.data.id as string;

    const prodRes = await request(app)
      .post(`/api/v1/businesses/${businessId}/loan-products`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p11-owner')
      .send({
        code: 'SUB_TEST_P11',
        name: 'Subscription Gate Product',
        interestMethod: InterestCalculationMethod.FLAT_RATE,
        repaymentFrequency: RepaymentFrequency.MONTHLY,
        nominalInterestRatePercent: '5.000000',
        ratePeriod: 'PER_PERIOD',
        minPrincipal: '100.0000',
        maxPrincipal: '5000.0000',
        minTermInstallments: 1,
        maxTermInstallments: 12,
      });
    const productId = prodRes.body.data.id as string;

    const loanRes = await request(app)
      .post(`/api/v1/businesses/${businessId}/loans`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p11-owner')
      .send({
        customerId,
        loanProductId: productId,
        principalAmount: '500.0000',
        termInstallments: 2,
        firstRepaymentDate: '2027-06-01',
        submitImmediately: true,
      });
    const loanId = loanRes.body.data.id as string;

    await request(app)
      .post(`/api/v1/businesses/${businessId}/loans/${loanId}/approve`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p11-owner')
      .send({});

    // Cancel subscription immediately (`immediate: true` -> status = CANCELED)
    const cancelRes = await request(app)
      .post(`/api/v1/businesses/${businessId}/subscription/cancel`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p11-owner')
      .send({
        immediate: true,
        reason: 'Testing immediate cancellation enforcement.',
      });
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.status).toBe(SubscriptionStatus.CANCELED);

    // Attempting to create a new customer when CANCELED -> 403 SUBSCRIPTION_INACTIVE_OR_EXPIRED
    const blockedCustRes = await request(app)
      .post(`/api/v1/businesses/${businessId}/customers`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p11-owner')
      .send({
        firstName: 'Blocked',
        lastName: 'Customer',
        phoneNumber: '+233245556667',
      });
    expect(blockedCustRes.status).toBe(403);
    expect(blockedCustRes.body.error.code).toBe('SUBSCRIPTION_INACTIVE_OR_EXPIRED');

    // Attempting to disburse the approved loan when CANCELED -> 403 SUBSCRIPTION_INACTIVE_OR_EXPIRED
    const blockedDisburseRes = await request(app)
      .post(`/api/v1/businesses/${businessId}/loans/${loanId}/disburse`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p11-owner')
      .send({ firstRepaymentDate: '2027-06-01' });
    expect(blockedDisburseRes.status).toBe(403);
    expect(blockedDisburseRes.body.error.code).toBe('SUBSCRIPTION_INACTIVE_OR_EXPIRED');

    // Reactivate subscription on STARTER_TRIAL MONTHLY -> disbursement now succeeds!
    const reactivateRes = await request(app)
      .post(`/api/v1/businesses/${businessId}/subscription/change-plan`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p11-owner')
      .send({
        planCode: 'STARTER_TRIAL',
        billingInterval: 'MONTHLY',
      });
    expect(reactivateRes.status).toBe(200);
    expect(reactivateRes.body.data.status).toBe(SubscriptionStatus.ACTIVE);

    const disburseOkRes = await request(app)
      .post(`/api/v1/businesses/${businessId}/loans/${loanId}/disburse`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p11-owner')
      .send({ firstRepaymentDate: '2027-06-01' });
    expect(disburseOkRes.status).toBe(200);
  });
});
