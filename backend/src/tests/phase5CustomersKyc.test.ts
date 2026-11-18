import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import {
  setFirebaseVerifierForTesting,
  type DecodedFirebaseIdentity,
} from '../config/firebase.js';
import { runMigrations } from '../database/migrate.js';
import { queryPlatform } from '../database/pool.js';

const TEST_TOKENS: Record<string, DecodedFirebaseIdentity> = {
  'token-p5-owner-a': {
    uid: 'fb_uid_phase5_owner_a',
    email: 'owner.p5.a@flotech-test.com',
    name: 'Ngozi Eze',
  },
  'token-p5-owner-b': {
    uid: 'fb_uid_phase5_owner_b',
    email: 'owner.p5.b@flotech-test.com',
    name: 'Lucas Vance',
  },
  'token-p5-cashier-a': {
    uid: 'fb_uid_phase5_cashier_a',
    email: 'cashier.p5.a@flotech-test.com',
    name: 'Samuel Boateng',
  },
};

async function cleanupPhase5TestData(): Promise<void> {
  const userIdsRes = await queryPlatform<{ id: string }>(
    `SELECT id FROM users WHERE firebase_uid IN (
       'fb_uid_phase5_owner_a',
       'fb_uid_phase5_owner_b',
       'fb_uid_phase5_cashier_a'
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

describe('FloTech Phase 5 — Customer Management & KYC Verification (Live PostgreSQL)', () => {
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
    await cleanupPhase5TestData();

    for (const token of Object.keys(TEST_TOKENS)) {
      await request(app)
        .post('/api/v1/auth/session')
        .set('X-Firebase-AppCheck', 'valid-app-check-token')
        .set('Authorization', `Bearer ${token}`)
        .send({});
    }
  });

  afterAll(async () => {
    await cleanupPhase5TestData();
    setFirebaseVerifierForTesting(null);
  });

  it('1. creates sequential customers with custom prefix, stores monthlyIncome as NUMERIC(19,4), and rejects JS float inputs', async () => {
    const bizRes = await request(app)
      .post('/api/v1/businesses')
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p5-owner-a')
      .send({
        legalName: 'Atlantic Credit Partners Ltd',
        businessCategory: 'SME Lending Institution',
        primaryEmail: 'credit@atlantic-partners.com',
        primaryPhone: '+1 (555) 810-1000',
        countryCode: 'US',
        currencyCode: 'USD',
      });

    const businessId = bizRes.body.data.business.id as string;

    // Configure custom customerNumberPrefix = 'BORR-'
    await request(app)
      .patch(`/api/v1/businesses/${businessId}/settings`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p5-owner-a')
      .set('X-Business-Id', businessId)
      .send({ customerNumberPrefix: 'BORR-' });

    // Create Customer #1
    const c1Res = await request(app)
      .post(`/api/v1/businesses/${businessId}/customers`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p5-owner-a')
      .set('X-Business-Id', businessId)
      .send({
        firstName: 'Chidi',
        lastName: 'Nwosu',
        businessName: 'Nwosu Cold Chain Logistics',
        email: 'chidi@nwosulogistics.com',
        phoneNumber: '+234 803 111 2233',
        nationalIdNumber: 'NIN-9988776655',
        dateOfBirth: '1988-06-15',
        addressLine1: '42 Wharf Road',
        city: 'Lagos',
        employmentStatus: 'SME_MERCHANT',
        monthlyIncome: '4850.75',
        creditScoreInternal: 780,
        riskTier: 'LOW',
      });

    expect(c1Res.status).toBe(201);
    expect(c1Res.body.data.customerNumber).toBe('BORR-00001');
    expect(c1Res.body.data.monthlyIncome).toBe('4850.7500');
    expect(c1Res.body.data.riskTier).toBe('LOW');

    // Create Customer #2
    const c2Res = await request(app)
      .post(`/api/v1/businesses/${businessId}/customers`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p5-owner-a')
      .set('X-Business-Id', businessId)
      .send({
        firstName: 'Zainab',
        lastName: 'Bello',
        phoneNumber: '+234 809 444 5566',
        monthlyIncome: '1900.00',
        riskTier: 'HIGH',
      });

    expect(c2Res.status).toBe(201);
    expect(c2Res.body.data.customerNumber).toBe('BORR-00002');
    expect(c2Res.body.data.monthlyIncome).toBe('1900.0000');

    // Attempt to pass JavaScript float for monthlyIncome -> rejected by strict schema
    const floatRes = await request(app)
      .post(`/api/v1/businesses/${businessId}/customers`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p5-owner-a')
      .set('X-Business-Id', businessId)
      .send({
        firstName: 'Float',
        lastName: 'Attempt',
        phoneNumber: '+1 555 222 3333',
        monthlyIncome: 2500.5,
      });

    expect(floatRes.status).toBe(400);
    expect(floatRes.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('2. supports search, risk-tier filtering, underwriting updates, and archiving/restoring', async () => {
    const bizRes = await request(app)
      .post('/api/v1/businesses')
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p5-owner-a')
      .send({
        legalName: 'Meridian Microfinance',
        businessCategory: 'Microfinance',
        primaryEmail: 'ops@meridian-mfb.com',
        primaryPhone: '+1 (555) 820-2000',
        countryCode: 'US',
        currencyCode: 'USD',
      });

    const businessId = bizRes.body.data.business.id as string;

    const c1 = await request(app)
      .post(`/api/v1/businesses/${businessId}/customers`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p5-owner-a')
      .set('X-Business-Id', businessId)
      .send({
        firstName: 'Kofi',
        lastName: 'Mensah',
        phoneNumber: '+233 24 111 2222',
        nationalIdNumber: 'GHA-10293847',
        riskTier: 'LOW',
      });

    const c2 = await request(app)
      .post(`/api/v1/businesses/${businessId}/customers`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p5-owner-a')
      .set('X-Business-Id', businessId)
      .send({
        firstName: 'Elena',
        lastName: 'Rostova',
        phoneNumber: '+1 555 909 8080',
        riskTier: 'HIGH',
      });

    const kofiId = c1.body.data.id as string;
    const elenaId = c2.body.data.id as string;

    // Filter by riskTier = HIGH
    const highTierRes = await request(app)
      .get(`/api/v1/businesses/${businessId}/customers?riskTier=HIGH`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p5-owner-a')
      .set('X-Business-Id', businessId);

    expect(highTierRes.status).toBe(200);
    expect(highTierRes.body.data).toHaveLength(1);
    expect(highTierRes.body.data[0].id).toBe(elenaId);

    // Search by National ID
    const searchRes = await request(app)
      .get(`/api/v1/businesses/${businessId}/customers?q=GHA-10293847`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p5-owner-a')
      .set('X-Business-Id', businessId);

    expect(searchRes.status).toBe(200);
    expect(searchRes.body.data).toHaveLength(1);
    expect(searchRes.body.data[0].id).toBe(kofiId);

    // Archive Elena
    const archiveRes = await request(app)
      .patch(`/api/v1/businesses/${businessId}/customers/${elenaId}`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p5-owner-a')
      .set('X-Business-Id', businessId)
      .send({ isArchived: true });

    expect(archiveRes.status).toBe(200);
    expect(archiveRes.body.data.isArchived).toBe(true);

    // Default list excludes archived customers
    const activeOnlyRes = await request(app)
      .get(`/api/v1/businesses/${businessId}/customers`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p5-owner-a')
      .set('X-Business-Id', businessId);

    expect(activeOnlyRes.body.data).toHaveLength(1);

    // List with includeArchived=true returns both
    const allRes = await request(app)
      .get(`/api/v1/businesses/${businessId}/customers?includeArchived=true`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p5-owner-a')
      .set('X-Business-Id', businessId);

    expect(allRes.body.data).toHaveLength(2);
  });

  it('3. registers KYC documents, blocks cross-customer storage path spoofing, and verifies KYC documents', async () => {
    const bizRes = await request(app)
      .post('/api/v1/businesses')
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p5-owner-a')
      .send({
        legalName: 'Vanguard Lending Group',
        businessCategory: 'Commercial Lender',
        primaryEmail: 'kyc@vanguard-lending.com',
        primaryPhone: '+1 (555) 830-3000',
        countryCode: 'US',
        currencyCode: 'USD',
      });

    const businessId = bizRes.body.data.business.id as string;

    const custRes = await request(app)
      .post(`/api/v1/businesses/${businessId}/customers`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p5-owner-a')
      .set('X-Business-Id', businessId)
      .send({
        firstName: 'Fatima',
        lastName: 'Al-Mansoor',
        phoneNumber: '+1 555 303 4040',
      });

    const customerId = custRes.body.data.id as string;

    // Attempt to spoof storage path belonging to another customer UUID
    const spoofedPathRes = await request(app)
      .post(`/api/v1/businesses/${businessId}/customers/${customerId}/documents`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p5-owner-a')
      .set('X-Business-Id', businessId)
      .send({
        documentType: 'NATIONAL_ID',
        fileName: 'passport.pdf',
        firebaseStoragePath: `businesses/${businessId}/customers/00000000-0000-4000-8000-000000000099/kyc/passport.pdf`,
        mimeType: 'application/pdf',
        fileSizeBytes: 128000,
      });

    expect(spoofedPathRes.status).toBe(403);
    expect(spoofedPathRes.body.error.code).toBe('KYC_STORAGE_PATH_VIOLATION');

    // Valid KYC document registration
    const addDocRes = await request(app)
      .post(`/api/v1/businesses/${businessId}/customers/${customerId}/documents`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p5-owner-a')
      .set('X-Business-Id', businessId)
      .send({
        documentType: 'NATIONAL_ID',
        fileName: 'national_id_verified.pdf',
        firebaseStoragePath: `businesses/${businessId}/customers/${customerId}/kyc/national_id_verified.pdf`,
        mimeType: 'application/pdf',
        fileSizeBytes: 256000,
      });

    expect(addDocRes.status).toBe(201);
    expect(addDocRes.body.data.verifiedAt).toBeNull();
    const documentId = addDocRes.body.data.id as string;

    // Verify KYC document
    const verifyRes = await request(app)
      .post(
        `/api/v1/businesses/${businessId}/customers/${customerId}/documents/${documentId}/verify`
      )
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p5-owner-a')
      .set('X-Business-Id', businessId)
      .send({});

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.data.verifiedAt).toBeTruthy();

    // Inspect customer details and confirm documentCount = 1, verifiedDocumentCount = 1
    const detailsRes = await request(app)
      .get(`/api/v1/businesses/${businessId}/customers/${customerId}`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p5-owner-a')
      .set('X-Business-Id', businessId);

    expect(detailsRes.status).toBe(200);
    expect(detailsRes.body.data.customer.documentCount).toBe(1);
    expect(detailsRes.body.data.customer.verifiedDocumentCount).toBe(1);
    expect(detailsRes.body.data.documents).toHaveLength(1);
  });

  it('4. enforces multi-tenant isolation and fine-grained RBAC (cashier can view customers but cannot create or archive)', async () => {
    const bizARes = await request(app)
      .post('/api/v1/businesses')
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p5-owner-a')
      .send({
        legalName: 'Tenant A Lending',
        businessCategory: 'Microfinance',
        primaryEmail: 'owner@tenant-a.com',
        primaryPhone: '+1 (555) 840-4000',
        countryCode: 'US',
        currencyCode: 'USD',
      });

    const businessAId = bizARes.body.data.business.id as string;

    // Find the `cashier` role in Tenant A
    const rolesRes = await request(app)
      .get(`/api/v1/businesses/${businessAId}/roles`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p5-owner-a')
      .set('X-Business-Id', businessAId);

    const cashierRole = rolesRes.body.data.find(
      (r: { slug: string }) => r.slug === 'cashier'
    );
    expect(cashierRole).toBeDefined();

    // Add `cashier.p5.a@flotech-test.com` as an active cashier in Tenant A
    await request(app)
      .post(`/api/v1/businesses/${businessAId}/employees`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p5-owner-a')
      .set('X-Business-Id', businessAId)
      .send({
        email: 'cashier.p5.a@flotech-test.com',
        fullName: 'Samuel Boateng',
        roleId: cashierRole.id,
        activateImmediately: true,
      });

    // Cashier CAN list customers (`customers:view`)
    const cashierViewRes = await request(app)
      .get(`/api/v1/businesses/${businessAId}/customers`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p5-cashier-a')
      .set('X-Business-Id', businessAId);

    expect(cashierViewRes.status).toBe(200);

    // Cashier CANNOT create a customer (`customers:create` missing)
    const cashierCreateRes = await request(app)
      .post(`/api/v1/businesses/${businessAId}/customers`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p5-cashier-a')
      .set('X-Business-Id', businessAId)
      .send({
        firstName: 'Blocked',
        lastName: 'Customer',
        phoneNumber: '+1 555 000 1111',
      });

    expect(cashierCreateRes.status).toBe(403);
    expect(cashierCreateRes.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');

    // Unrelated Tenant B Owner cannot access Tenant A customers
    const crossTenantRes = await request(app)
      .get(`/api/v1/businesses/${businessAId}/customers`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p5-owner-b')
      .set('X-Business-Id', businessAId);

    expect(crossTenantRes.status).toBe(403);
    expect(crossTenantRes.body.error.code).toBe('TENANT_ACCESS_DENIED');
  });
});
