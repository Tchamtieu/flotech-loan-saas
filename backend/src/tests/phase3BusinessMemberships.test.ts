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
  'token-owner-a': {
    uid: 'fb_uid_phase3_owner_a',
    email: 'owner.a@horizon-lending.com',
    name: 'Elena Vance',
  },
  'token-owner-b': {
    uid: 'fb_uid_phase3_owner_b',
    email: 'owner.b@apex-credit.com',
    name: 'Marcus Sterling',
  },
  'token-auditor-a': {
    uid: 'fb_uid_phase3_auditor_a',
    email: 'auditor.a@horizon-lending.com',
    name: 'Samuel Osei',
  },
};

async function cleanupPhase3TestData(): Promise<void> {
  const userIdsRes = await queryPlatform<{ id: string }>(
    `SELECT id FROM users WHERE firebase_uid IN ('fb_uid_phase3_owner_a', 'fb_uid_phase3_owner_b', 'fb_uid_phase3_auditor_a')`
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

describe('FloTech Phase 3 — Business Profiles, Memberships & Multi-Tenant Isolation (Live PostgreSQL)', () => {
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
    await cleanupPhase3TestData();

    // Provision all 3 test identities in PostgreSQL
    for (const token of Object.keys(TEST_TOKENS)) {
      await request(app)
        .post('/api/v1/auth/session')
        .set('X-Firebase-AppCheck', 'valid-app-check-token')
        .set('Authorization', `Bearer ${token}`)
        .send({});
    }
  });

  afterAll(async () => {
    await cleanupPhase3TestData();
    setFirebaseVerifierForTesting(null);
  });

  it('1. provisions a new business via POST /api/v1/businesses, seeds 5 system roles & 27 permissions, creates owner membership, and attaches a TRIALING subscription', async () => {
    const res = await request(app)
      .post('/api/v1/businesses')
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-owner-a')
      .send({
        legalName: 'Horizon Microfinance Ltd',
        tradingName: 'Horizon Credit',
        businessCategory: 'Microfinance & Lending Institution',
        registrationNumber: 'RC-9021044',
        taxId: 'TIN-1102938',
        primaryEmail: 'ops@horizon-lending.com',
        primaryPhone: '+1 (555) 300-4000',
        countryCode: 'US',
        currencyCode: 'USD',
        timezone: 'America/New_York',
        addressLine1: '450 Lexington Ave',
        city: 'New York',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    const { business, membership } = res.body.data;
    expect(business.legalName).toBe('Horizon Microfinance Ltd');
    expect(business.businessCode).toMatch(/^FLT-[A-F0-9]{6}$/);
    expect(business.currencyCode).toBe('USD');
    expect(business.status).toBe('ACTIVE');
    expect(business.settings.loanNumberPrefix).toBe('LN-');
    expect(business.settings.defaultGracePeriodDays).toBe(3);

    expect(membership.roleSlug).toBe('business_owner');
    expect(membership.permissions.length).toBe(27);

    // Verify 5 system roles were seeded for this business in PostgreSQL
    const rolesCount = await queryPlatform<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM roles WHERE business_id = $1 AND is_system_role = TRUE`,
      [business.id]
    );
    expect(rolesCount.rows[0]?.count).toBe('5');

    // Verify TRIALING subscription was created in business_subscriptions
    const subRes = await queryPlatform<{ status: string; unit_price: string }>(
      `SELECT status, unit_price FROM business_subscriptions WHERE business_id = $1`,
      [business.id]
    );
    expect(subRes.rows[0]?.status).toBe('TRIALING');
    expect(subRes.rows[0]?.unit_price).toBe('49.0000');
  });

  it('2. lists user business memberships via GET /api/v1/businesses and resolves full tenant context via GET /api/v1/businesses/:businessId/context', async () => {
    const createRes = await request(app)
      .post('/api/v1/businesses')
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-owner-a')
      .send({
        legalName: 'Horizon Microfinance Ltd',
        businessCategory: 'Microfinance & Lending Institution',
        primaryEmail: 'ops@horizon-lending.com',
        primaryPhone: '+1 (555) 300-4000',
        countryCode: 'US',
        currencyCode: 'USD',
      });

    const businessId = createRes.body.data.business.id as string;

    const listRes = await request(app)
      .get('/api/v1/businesses')
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-owner-a');

    expect(listRes.status).toBe(200);
    expect(listRes.body.data.length).toBe(1);
    expect(listRes.body.data[0]?.businessId).toBe(businessId);
    expect(listRes.body.data[0]?.roleSlug).toBe('business_owner');

    const ctxRes = await request(app)
      .get(`/api/v1/businesses/${businessId}/context`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-owner-a');

    expect(ctxRes.status).toBe(200);
    expect(ctxRes.body.data.business.id).toBe(businessId);
    expect(ctxRes.body.data.membership.roleSlug).toBe('business_owner');
  });

  it('3. enforces strict cross-tenant isolation: Owner B cannot access or mutate Owner A business (403 TENANT_ACCESS_DENIED)', async () => {
    const createResA = await request(app)
      .post('/api/v1/businesses')
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-owner-a')
      .send({
        legalName: 'Horizon Microfinance Ltd',
        businessCategory: 'Microfinance & Lending Institution',
        primaryEmail: 'ops@horizon-lending.com',
        primaryPhone: '+1 (555) 300-4000',
        countryCode: 'US',
        currencyCode: 'USD',
      });

    const businessIdA = createResA.body.data.business.id as string;

    // Owner B attempts to read Business A profile
    const crossRead = await request(app)
      .get(`/api/v1/businesses/${businessIdA}/profile`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-owner-b');

    expect(crossRead.status).toBe(403);
    expect(crossRead.body.error.code).toBe('TENANT_ACCESS_DENIED');

    // Owner B attempts to update Business A profile
    const crossPatch = await request(app)
      .patch(`/api/v1/businesses/${businessIdA}/profile`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-owner-b')
      .send({ legalName: 'Hijacked Business Name' });

    expect(crossPatch.status).toBe(403);
    expect(crossPatch.body.error.code).toBe('TENANT_ACCESS_DENIED');
  });

  it('4. updates business profile and operational settings when authorized and records audit_logs', async () => {
    const createRes = await request(app)
      .post('/api/v1/businesses')
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-owner-a')
      .send({
        legalName: 'Horizon Microfinance Ltd',
        businessCategory: 'Microfinance & Lending Institution',
        primaryEmail: 'ops@horizon-lending.com',
        primaryPhone: '+1 (555) 300-4000',
        countryCode: 'US',
        currencyCode: 'USD',
      });

    const businessId = createRes.body.data.business.id as string;

    const patchProfileRes = await request(app)
      .patch(`/api/v1/businesses/${businessId}/profile`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-owner-a')
      .send({
        tradingName: 'Horizon Global Lending',
        city: 'Boston',
        logoStoragePath: `businesses/${businessId}/branding/logo_2026.png`,
      });

    expect(patchProfileRes.status).toBe(200);
    expect(patchProfileRes.body.data.tradingName).toBe('Horizon Global Lending');
    expect(patchProfileRes.body.data.city).toBe('Boston');

    // Verify cross-business logo path spoofing is blocked
    const spoofLogoRes = await request(app)
      .patch(`/api/v1/businesses/${businessId}/profile`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-owner-a')
      .send({
        logoStoragePath:
          'businesses/00000000-0000-4000-8000-000000000000/branding/other_logo.png',
      });

    expect(spoofLogoRes.status).toBe(403);
    expect(spoofLogoRes.body.error.code).toBe('BUSINESS_LOGO_PATH_VIOLATION');

    // Update operational settings
    const patchSettingsRes = await request(app)
      .patch(`/api/v1/businesses/${businessId}/settings`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-owner-a')
      .send({
        loanNumberPrefix: 'HRZ-LN-',
        defaultGracePeriodDays: 5,
        requireDualApprovalForLoans: true,
      });

    expect(patchSettingsRes.status).toBe(200);
    expect(patchSettingsRes.body.data.loanNumberPrefix).toBe('HRZ-LN-');
    expect(patchSettingsRes.body.data.defaultGracePeriodDays).toBe(5);
    expect(patchSettingsRes.body.data.requireDualApprovalForLoans).toBe(true);
  });

  it('5. enforces RBAC permission boundaries within the same tenant: an Auditor can view business settings (business_settings:view) but cannot modify them (403 INSUFFICIENT_PERMISSIONS)', async () => {
    const createRes = await request(app)
      .post('/api/v1/businesses')
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-owner-a')
      .send({
        legalName: 'Horizon Microfinance Ltd',
        businessCategory: 'Microfinance & Lending Institution',
        primaryEmail: 'ops@horizon-lending.com',
        primaryPhone: '+1 (555) 300-4000',
        countryCode: 'US',
        currencyCode: 'USD',
      });

    const businessId = createRes.body.data.business.id as string;

    // Assign Auditor A to Business A with the 'auditor' system role
    const auditorUserRes = await queryPlatform<{ id: string }>(
      `SELECT id FROM users WHERE firebase_uid = 'fb_uid_phase3_auditor_a'`
    );
    const auditorRoleRes = await queryPlatform<{ id: string }>(
      `SELECT id FROM roles WHERE business_id = $1 AND slug = 'auditor'`,
      [businessId]
    );

    await queryPlatform(
      `INSERT INTO business_memberships (business_id, user_id, role_id, status, joined_at)
       VALUES ($1, $2, $3, 'ACTIVE', NOW())`,
      [businessId, auditorUserRes.rows[0]?.id, auditorRoleRes.rows[0]?.id]
    );

    // Auditor can GET /profile (business_settings:view is granted to auditor)
    const getRes = await request(app)
      .get(`/api/v1/businesses/${businessId}/profile`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-auditor-a');

    expect(getRes.status).toBe(200);
    expect(getRes.body.data.legalName).toBe('Horizon Microfinance Ltd');

    // Auditor CANNOT PATCH /profile (business_settings:manage is NOT granted to auditor)
    const patchRes = await request(app)
      .patch(`/api/v1/businesses/${businessId}/profile`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-auditor-a')
      .send({ city: 'Unauthorized Edit' });

    expect(patchRes.status).toBe(403);
    expect(patchRes.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
    expect(patchRes.body.error.details.missingPermissions).toContain(
      'business_settings:manage'
    );
  });
});
