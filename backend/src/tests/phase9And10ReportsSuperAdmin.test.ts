import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import {
  BusinessStatus,
  InterestCalculationMethod,
  RepaymentFrequency,
  RepaymentMethod,
  SubscriptionStatus,
} from '@flotech/shared';
import { createApp } from '../app.js';
import {
  setFirebaseVerifierForTesting,
  type DecodedFirebaseIdentity,
} from '../config/firebase.js';
import { runMigrations } from '../database/migrate.js';
import { queryPlatform, withTenantTransaction } from '../database/pool.js';

const TEST_TOKENS: Record<string, DecodedFirebaseIdentity> = {
  'token-p9-owner-a': {
    uid: 'fb_uid_phase9_owner_a',
    email: 'owner.p9.a@flotech-test.com',
    name: 'Dr. Amina Bello',
  },
  'token-p10-super-admin': {
    uid: 'fb_uid_phase10_super_admin',
    email: 'superadmin.p10@flotech.digital',
    name: 'FloTech Platform Director',
  },
};

async function cleanupPhase9And10TestData(): Promise<void> {
  const userIdsRes = await queryPlatform<{ id: string }>(
    `SELECT id FROM users WHERE firebase_uid IN (
       'fb_uid_phase9_owner_a',
       'fb_uid_phase10_super_admin'
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
  await queryPlatform(
    `UPDATE platform_settings SET updated_by_user_id = NULL WHERE updated_by_user_id = ANY($1::uuid[])`,
    [userIds]
  );
  await queryPlatform(`DELETE FROM subscription_plans WHERE code = 'CUSTOM_P10_TIER'`);
  await queryPlatform(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [userIds]);
}

describe('FloTech Phase 9 & Phase 10 — Financial Dashboards, PAR Analytics, Notifications & Super Admin Suite (Live PostgreSQL)', () => {
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
    await cleanupPhase9And10TestData();

    for (const token of Object.keys(TEST_TOKENS)) {
      await request(app)
        .post('/api/v1/auth/session')
        .set('X-Firebase-AppCheck', 'valid-app-check-token')
        .set('Authorization', `Bearer ${token}`)
        .send({});
    }

    // Elevate 'fb_uid_phase10_super_admin' via a sanctioned Super Admin PostgreSQL transaction
    await withTenantTransaction(
      { businessId: null, actorUserId: null, isSuperAdmin: true },
      async (client) => {
        await client.query(
          `UPDATE users SET platform_role = 'SUPER_ADMIN' WHERE firebase_uid = 'fb_uid_phase10_super_admin'`
        );
      }
    );
  });

  afterAll(async () => {
    await cleanupPhase9And10TestData();
    setFirebaseVerifierForTesting(null);
  });

  it('computes real PostgreSQL portfolio KPIs, PAR aging buckets (PAR 30 / PAR 90), CSV exports, and notifications', async () => {
    const createBizRes = await request(app)
      .post('/api/v1/businesses')
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p9-owner-a')
      .send({
        legalName: 'Kigali Growth Capital',
        businessCategory: 'LENDING_INSTITUTION',
        primaryEmail: 'analytics@kigaligrowth.com',
        primaryPhone: '+250788001122',
        countryCode: 'RW',
        currencyCode: 'USD',
      });
    const businessId = createBizRes.body.data.business.id as string;

    const custRes = await request(app)
      .post(`/api/v1/businesses/${businessId}/customers`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p9-owner-a')
      .send({
        firstName: 'Jean-Paul',
        lastName: 'Habimana',
        phoneNumber: '+250788112233',
      });
    const customerId = custRes.body.data.id as string;

    const prodRes = await request(app)
      .post(`/api/v1/businesses/${businessId}/loan-products`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p9-owner-a')
      .send({
        code: 'PAR_TEST_P9',
        name: 'SME Expansion Facility',
        interestMethod: InterestCalculationMethod.FLAT_RATE,
        repaymentFrequency: RepaymentFrequency.MONTHLY,
        nominalInterestRatePercent: '10.000000',
        ratePeriod: 'PER_PERIOD',
        minPrincipal: '500.0000',
        maxPrincipal: '20000.0000',
        minTermInstallments: 2,
        maxTermInstallments: 12,
      });
    const productId = prodRes.body.data.id as string;

    // Loan 1: 2000.0000 over 2 months starting 2026-03-01 (total payable 2400.0000)
    const loan1Res = await request(app)
      .post(`/api/v1/businesses/${businessId}/loans`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p9-owner-a')
      .send({
        customerId,
        loanProductId: productId,
        principalAmount: '2000.0000',
        termInstallments: 2,
        firstRepaymentDate: '2026-03-01',
        submitImmediately: true,
      });
    const loan1Id = loan1Res.body.data.id as string;

    await request(app)
      .post(`/api/v1/businesses/${businessId}/loans/${loan1Id}/approve`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p9-owner-a')
      .send({});

    await request(app)
      .post(`/api/v1/businesses/${businessId}/loans/${loan1Id}/disburse`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p9-owner-a')
      .send({ firstRepaymentDate: '2026-03-01' });

    // Record repayment of 600.0000 on Loan 1 -> allocates 200 interest + 400 principal (remaining principal_outstanding = 1600.0000)
    await request(app)
      .post(`/api/v1/businesses/${businessId}/repayments`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p9-owner-a')
      .send({
        loanId: loan1Id,
        amountReceived: '600.0000',
        paymentMethod: RepaymentMethod.BANK_TRANSFER,
      });

    // Query Dashboard as of 2026-04-15:
    // Installment #1 (due 2026-03-01) is still PARTIALLY_PAID (paid 600 of 1200) -> 45 days past due -> falls into PAR_30_59!
    const dashRes = await request(app)
      .get(`/api/v1/businesses/${businessId}/dashboard?asOfDate=2026-04-15`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p9-owner-a');
    expect(dashRes.status).toBe(200);

    const dash = dashRes.body.data;
    expect(dash.kpis.totalDisbursedPrincipal).toBe('2000.0000');
    expect(dash.kpis.totalPrincipalOutstanding).toBe('1600.0000');
    expect(dash.kpis.totalCollectedAmount).toBe('600.0000');
    expect(dash.par30RatioPercent).toBe('100.0000');
    expect(dash.par90RatioPercent).toBe('0.0000');

    const par30Bucket = dash.parBuckets.find(
      (b: { bucketLabel: string }) => b.bucketLabel === 'PAR_30_59'
    );
    expect(par30Bucket.loansCount).toBe(1);
    expect(par30Bucket.principalAtRisk).toBe('1600.0000');

    // Verify CSV export endpoint
    const csvRes = await request(app)
      .get(`/api/v1/businesses/${businessId}/reports/export-csv?asOfDate=2026-04-15`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p9-owner-a');
    expect(csvRes.status).toBe(200);
    expect(csvRes.body.data.fileName).toBe('flotech-portfolio-statement-2026-04-15.csv');
    expect(csvRes.body.data.csvContent).toContain('loan_number,customer_number');
    expect(csvRes.body.data.csvContent).toContain('1600.0000');

    // Verify in-app notifications (repayment recorded generated a notification)
    const notifRes = await request(app)
      .get(`/api/v1/businesses/${businessId}/notifications`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p9-owner-a');
    expect(notifRes.status).toBe(200);
    expect(notifRes.body.data.length).toBeGreaterThanOrEqual(1);
    const firstNotifId = notifRes.body.data[0].id as string;

    const markReadRes = await request(app)
      .post(`/api/v1/businesses/${businessId}/notifications/${firstNotifId}/read`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p9-owner-a')
      .send({});
    expect(markReadRes.status).toBe(200);
    expect(markReadRes.body.data.isRead).toBe(true);
  });

  it('blocks ordinary business users from Super Admin routes (403) and enables full Super Admin governance, plans, subscriptions, revenue, broadcasts, audit logs, and settings', async () => {
    // 1. Ordinary business owner attempts to access Super Admin dashboard -> 403 SUPER_ADMIN_REQUIRED
    const forbiddenRes = await request(app)
      .get('/api/v1/super-admin/dashboard')
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p9-owner-a');
    expect(forbiddenRes.status).toBe(403);

    // Create a tenant business as Owner A
    const createBizRes = await request(app)
      .post('/api/v1/businesses')
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p9-owner-a')
      .send({
        legalName: 'Kampala Merchant Finance',
        businessCategory: 'MERCHANT_CREDIT',
        primaryEmail: 'ceo@kampalamerchant.com',
        primaryPhone: '+256772112233',
        countryCode: 'UG',
        currencyCode: 'USD',
      });
    const businessId = createBizRes.body.data.business.id as string;

    // 2. Super Admin inspects global KPIs
    const saDashRes = await request(app)
      .get('/api/v1/super-admin/dashboard')
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p10-super-admin');
    expect(saDashRes.status).toBe(200);
    expect(saDashRes.body.data.totalBusinesses).toBeGreaterThanOrEqual(1);

    // 3. Super Admin verifies/activates business status
    const patchBizRes = await request(app)
      .patch(`/api/v1/super-admin/businesses/${businessId}/status`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p10-super-admin')
      .send({
        status: BusinessStatus.ACTIVE,
        reason: 'Compliance KYB documentation verified by FloTech Super Admin.',
      });
    expect(patchBizRes.status).toBe(200);
    expect(patchBizRes.body.data.status).toBe(BusinessStatus.ACTIVE);

    // 4. Super Admin creates a custom subscription plan tier and assigns it as ACTIVE to the business
    const upsertPlanRes = await request(app)
      .post('/api/v1/super-admin/plans')
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p10-super-admin')
      .send({
        code: 'CUSTOM_P10_TIER',
        name: 'Custom Institutional Plan',
        monthlyPrice: '250.0000',
        annualPrice: '2500.0000',
        maxActiveLoans: 2000,
        maxEmployees: 50,
        maxCustomers: 10000,
      });
    expect(upsertPlanRes.status).toBe(200);
    const customPlanId = upsertPlanRes.body.data.id as string;

    const assignSubRes = await request(app)
      .put(`/api/v1/super-admin/businesses/${businessId}/subscription`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p10-super-admin')
      .send({
        planId: customPlanId,
        status: SubscriptionStatus.ACTIVE,
        billingCycle: 'MONTHLY',
        reason: 'Upgraded to Custom Institutional Plan.',
      });
    expect(assignSubRes.status).toBe(200);
    expect(assignSubRes.body.data.planCode).toBe('CUSTOM_P10_TIER');
    expect(assignSubRes.body.data.unitPrice).toBe('250.0000');

    // 5. Super Admin checks Revenue Analytics (MRR includes the 250.0000 active subscription)
    const revRes = await request(app)
      .get('/api/v1/super-admin/revenue-analytics')
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p10-super-admin');
    expect(revRes.status).toBe(200);
    expect(Number(revRes.body.data.mrrUsd)).toBeGreaterThanOrEqual(250);

    // 6. Super Admin broadcasts a notification to the business
    const broadcastRes = await request(app)
      .post('/api/v1/super-admin/notifications/broadcast')
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p10-super-admin')
      .send({
        category: 'REGULATORY_UPDATE',
        title: 'Annual Audit Schedule Notice',
        body: 'Please export your Q4 portfolio statement by Friday.',
        targetBusinessId: businessId,
      });
    expect(broadcastRes.status).toBe(201);
    expect(broadcastRes.body.data.deliveredCount).toBe(1);

    // 7. Super Admin updates platform settings and inspects audit logs
    const settingRes = await request(app)
      .put('/api/v1/super-admin/settings')
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p10-super-admin')
      .send({
        key: 'platform.governance',
        valueJson: {
          platformName: 'FloTech Digital Loan Management SaaS',
          maintenanceMode: false,
          defaultTrialDays: 14,
        },
      });
    expect(settingRes.status).toBe(200);

    const logsRes = await request(app)
      .get(`/api/v1/super-admin/audit-logs?businessId=${businessId}`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p10-super-admin');
    expect(logsRes.status).toBe(200);
    expect(logsRes.body.data.length).toBeGreaterThanOrEqual(2);
  });
});
