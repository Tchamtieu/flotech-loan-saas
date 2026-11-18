import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { PermissionCode } from '@flotech/shared';
import { createApp } from '../app.js';
import {
  setFirebaseVerifierForTesting,
  type DecodedFirebaseIdentity,
} from '../config/firebase.js';
import { runMigrations } from '../database/migrate.js';
import { queryPlatform } from '../database/pool.js';

const TEST_TOKENS: Record<string, DecodedFirebaseIdentity> = {
  'token-p4-owner-a': {
    uid: 'fb_uid_phase4_owner_a',
    email: 'owner.p4.a@flotech-test.com',
    name: 'Amina Diallo',
  },
  'token-p4-owner-b': {
    uid: 'fb_uid_phase4_owner_b',
    email: 'owner.p4.b@flotech-test.com',
    name: 'David Thorne',
  },
  'token-p4-staff-a': {
    uid: 'fb_uid_phase4_staff_a',
    email: 'staff.p4.a@flotech-test.com',
    name: 'Tariq Hassan',
  },
};

async function cleanupPhase4TestData(): Promise<void> {
  const userIdsRes = await queryPlatform<{ id: string }>(
    `SELECT id FROM users WHERE email LIKE '%@flotech-test.com' AND (
       firebase_uid IN ('fb_uid_phase4_owner_a', 'fb_uid_phase4_owner_b', 'fb_uid_phase4_staff_a')
       OR email LIKE 'invited.p4.%@flotech-test.com'
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

describe('FloTech Phase 4 — Roles, Permissions & Employee Management (Live PostgreSQL)', () => {
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
    await cleanupPhase4TestData();

    for (const token of Object.keys(TEST_TOKENS)) {
      await request(app)
        .post('/api/v1/auth/session')
        .set('X-Firebase-AppCheck', 'valid-app-check-token')
        .set('Authorization', `Bearer ${token}`)
        .send({});
    }
  });

  afterAll(async () => {
    await cleanupPhase4TestData();
    setFirebaseVerifierForTesting(null);
  });

  it('1. lists the 27-permission catalog and the 5 seeded system roles for a business', async () => {
    const bizRes = await request(app)
      .post('/api/v1/businesses')
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p4-owner-a')
      .send({
        legalName: 'Sahel Commercial Lending',
        businessCategory: 'Microfinance & Lending Institution',
        primaryEmail: 'ops@sahel-lending.com',
        primaryPhone: '+1 (555) 700-1000',
        countryCode: 'US',
        currencyCode: 'USD',
      });

    const businessId = bizRes.body.data.business.id as string;

    const permsRes = await request(app)
      .get(`/api/v1/businesses/${businessId}/permissions`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p4-owner-a');

    expect(permsRes.status).toBe(200);
    expect(permsRes.body.data.length).toBe(27);

    const rolesRes = await request(app)
      .get(`/api/v1/businesses/${businessId}/roles`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p4-owner-a');

    expect(rolesRes.status).toBe(200);
    expect(rolesRes.body.data.length).toBe(5);
  });

  it('2. creates and updates a custom role, and blocks stripping permissions from the business_owner system role', async () => {
    const bizRes = await request(app)
      .post('/api/v1/businesses')
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p4-owner-a')
      .send({
        legalName: 'Sahel Commercial Lending',
        businessCategory: 'Microfinance & Lending Institution',
        primaryEmail: 'ops@sahel-lending.com',
        primaryPhone: '+1 (555) 700-1000',
        countryCode: 'US',
        currencyCode: 'USD',
      });

    const businessId = bizRes.body.data.business.id as string;

    // Create custom role
    const createRoleRes = await request(app)
      .post(`/api/v1/businesses/${businessId}/roles`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p4-owner-a')
      .send({
        name: 'Senior Credit Underwriter',
        description: 'Reviews and approves mid-market commercial loans',
        permissions: [
          PermissionCode.DASHBOARD_VIEW,
          PermissionCode.CUSTOMERS_VIEW,
          PermissionCode.LOANS_VIEW,
          PermissionCode.LOANS_REVIEW,
          PermissionCode.LOANS_APPROVE,
        ],
      });

    expect(createRoleRes.status).toBe(201);
    expect(createRoleRes.body.data.slug).toBe('senior_credit_underwriter');
    expect(createRoleRes.body.data.isSystemRole).toBe(false);
    expect(createRoleRes.body.data.permissions.length).toBe(5);

    const customRoleId = createRoleRes.body.data.id as string;

    // Update custom role permissions
    const patchRoleRes = await request(app)
      .patch(`/api/v1/businesses/${businessId}/roles/${customRoleId}`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p4-owner-a')
      .send({
        permissions: [
          PermissionCode.DASHBOARD_VIEW,
          PermissionCode.LOANS_VIEW,
          PermissionCode.LOANS_REVIEW,
        ],
      });

    expect(patchRoleRes.status).toBe(200);
    expect(patchRoleRes.body.data.permissions.length).toBe(3);

    // Attempt to strip permissions from business_owner role
    const ownerRoleId = bizRes.body.data.membership.roleId as string;
    const stripOwnerRes = await request(app)
      .patch(`/api/v1/businesses/${businessId}/roles/${ownerRoleId}`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p4-owner-a')
      .send({
        permissions: [PermissionCode.DASHBOARD_VIEW],
      });

    expect(stripOwnerRes.status).toBe(403);
    expect(stripOwnerRes.body.error.code).toBe('OWNER_ROLE_IMMUTABLE_PERMISSIONS');
  });

  it('3. onboards an existing user as an employee, verifies they can immediately authenticate into the tenant with their assigned role, and blocks cross-tenant role assignment', async () => {
    const bizResA = await request(app)
      .post('/api/v1/businesses')
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p4-owner-a')
      .send({
        legalName: 'Sahel Commercial Lending',
        businessCategory: 'Microfinance & Lending Institution',
        primaryEmail: 'ops@sahel-lending.com',
        primaryPhone: '+1 (555) 700-1000',
        countryCode: 'US',
        currencyCode: 'USD',
      });

    const businessIdA = bizResA.body.data.business.id as string;

    const bizResB = await request(app)
      .post('/api/v1/businesses')
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p4-owner-b')
      .send({
        legalName: 'Thorne Capital',
        businessCategory: 'Small Business / Merchant Credit',
        primaryEmail: 'ops@thorne-cap.com',
        primaryPhone: '+1 (555) 800-2000',
        countryCode: 'US',
        currencyCode: 'USD',
      });

    const roleIdFromBusinessB = bizResB.body.data.membership.roleId as string;

    // Attempt to onboard employee into Business A using a roleId belonging to Business B
    const crossRoleAttempt = await request(app)
      .post(`/api/v1/businesses/${businessIdA}/employees`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p4-owner-a')
      .send({
        email: 'staff.p4.a@flotech-test.com',
        fullName: 'Tariq Hassan',
        roleId: roleIdFromBusinessB,
      });

    expect(crossRoleAttempt.status).toBe(400);
    expect(crossRoleAttempt.body.error.code).toBe('ROLE_NOT_IN_BUSINESS');

    // Find Loan Officer role in Business A
    const rolesResA = await request(app)
      .get(`/api/v1/businesses/${businessIdA}/roles`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p4-owner-a');

    const loanOfficerRole = (
      rolesResA.body.data as Array<{ id: string; slug: string }>
    ).find((r) => r.slug === 'loan_officer');
    expect(loanOfficerRole).toBeDefined();

    // Onboard Tariq Hassan into Business A as Loan Officer
    const addEmpRes = await request(app)
      .post(`/api/v1/businesses/${businessIdA}/employees`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p4-owner-a')
      .send({
        email: 'staff.p4.a@flotech-test.com',
        fullName: 'Tariq Hassan',
        roleId: loanOfficerRole!.id,
        jobTitle: 'Field Loan Officer',
        department: 'SME Credit',
        activateImmediately: true,
      });

    expect(addEmpRes.status).toBe(201);
    expect(addEmpRes.body.data.employeeCode).toBe('EMP-0002');
    expect(addEmpRes.body.data.roleSlug).toBe('loan_officer');
    expect(addEmpRes.body.data.status).toBe('ACTIVE');

    // Verify Tariq Hassan can now access Business A /context with Loan Officer permissions
    const staffCtxRes = await request(app)
      .get(`/api/v1/businesses/${businessIdA}/context`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p4-staff-a');

    expect(staffCtxRes.status).toBe(200);
    expect(staffCtxRes.body.data.membership.roleSlug).toBe('loan_officer');
    expect(staffCtxRes.body.data.membership.permissions).toContain('loans:create');
    expect(staffCtxRes.body.data.membership.permissions).not.toContain('employees:manage');
  });

  it('4. blocks suspending or demoting the sole active Business Owner (409 LAST_BUSINESS_OWNER_PROTECTION) and enforces max_employees subscription quota', async () => {
    const bizRes = await request(app)
      .post('/api/v1/businesses')
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p4-owner-a')
      .send({
        legalName: 'Sahel Commercial Lending',
        businessCategory: 'Microfinance & Lending Institution',
        primaryEmail: 'ops@sahel-lending.com',
        primaryPhone: '+1 (555) 700-1000',
        countryCode: 'US',
        currencyCode: 'USD',
      });

    const businessId = bizRes.body.data.business.id as string;
    const ownerMembershipId = bizRes.body.data.membership.membershipId as string;

    // Attempt to suspend the sole active Business Owner
    const selfSuspendRes = await request(app)
      .patch(`/api/v1/businesses/${businessId}/employees/${ownerMembershipId}`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p4-owner-a')
      .send({
        status: 'SUSPENDED',
      });

    expect(selfSuspendRes.status).toBe(409);
    expect(selfSuspendRes.body.error.code).toBe('LAST_BUSINESS_OWNER_PROTECTION');

    // Find Cashier role
    const rolesRes = await request(app)
      .get(`/api/v1/businesses/${businessId}/roles`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p4-owner-a');
    const cashierRole = (rolesRes.body.data as Array<{ id: string; slug: string }>).find(
      (r) => r.slug === 'cashier'
    )!;

    // STARTER_TRIAL has max_employees = 5. Owner is #1. Add 4 more employees (#2, #3, #4, #5)
    for (let i = 2; i <= 5; i++) {
      const empRes = await request(app)
        .post(`/api/v1/businesses/${businessId}/employees`)
        .set('X-Firebase-AppCheck', 'valid-app-check-token')
        .set('Authorization', 'Bearer token-p4-owner-a')
        .send({
          email: `invited.p4.${i}@flotech-test.com`,
          fullName: `Invited Staff ${i}`,
          roleId: cashierRole.id,
        });
      expect(empRes.status).toBe(201);
    }

    // Adding a 6th employee must be blocked by max_employees = 5 quota
    const quotaExceededRes = await request(app)
      .post(`/api/v1/businesses/${businessId}/employees`)
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer token-p4-owner-a')
      .send({
        email: 'invited.p4.6@flotech-test.com',
        fullName: 'Invited Staff 6',
        roleId: cashierRole.id,
      });

    expect(quotaExceededRes.status).toBe(403);
    expect(quotaExceededRes.body.error.code).toBe('SUBSCRIPTION_EMPLOYEE_QUOTA_EXCEEDED');
  });
});
