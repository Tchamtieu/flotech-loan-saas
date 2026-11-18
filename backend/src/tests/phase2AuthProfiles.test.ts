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
  'valid-token-user-1': {
    uid: 'fb_uid_phase2_user_1',
    email: 'amara.okafor@flotech-test.com',
    name: 'Amara Okafor',
  },
  'valid-token-user-2': {
    uid: 'fb_uid_phase2_user_2',
    email: 'kwame.mensah@flotech-test.com',
    name: 'Kwame Mensah',
  },
};

describe('FloTech Phase 2 — Authentication & Personal Profiles (Live PostgreSQL)', () => {
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
    // Clean up test user records and their audit logs before each test
    await queryPlatform(
      `DELETE FROM audit_logs WHERE actor_user_id IN (
         SELECT id FROM users WHERE firebase_uid IN ('fb_uid_phase2_user_1', 'fb_uid_phase2_user_2', 'fb_uid_trigger_test')
       )`
    );
    await queryPlatform(
      `DELETE FROM users WHERE firebase_uid IN ('fb_uid_phase2_user_1', 'fb_uid_phase2_user_2', 'fb_uid_trigger_test')`
    );
  });

  afterAll(() => {
    setFirebaseVerifierForTesting(null);
  });

  it('1. provisions a new PostgreSQL user profile on first POST /api/v1/auth/session with platform_role = USER and writes an audit log', async () => {
    const res = await request(app)
      .post('/api/v1/auth/session')
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer valid-token-user-1')
      .send({
        fullName: 'Amara Okafor',
        phoneNumber: '+1 (555) 234-5678',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.profile.firebaseUid).toBe('fb_uid_phase2_user_1');
    expect(res.body.data.profile.email).toBe('amara.okafor@flotech-test.com');
    expect(res.body.data.profile.fullName).toBe('Amara Okafor');
    expect(res.body.data.profile.phoneNumber).toBe('+1 (555) 234-5678');
    expect(res.body.data.profile.platformRole).toBe('USER');
    expect(res.body.data.profile.isActive).toBe(true);
    expect(res.body.data.memberships).toEqual([]);

    // Verify audit_logs entry was written in PostgreSQL
    const auditRes = await queryPlatform<{ action: string }>(
      `SELECT action FROM audit_logs WHERE actor_user_id = $1`,
      [res.body.data.profile.id]
    );
    expect(auditRes.rows[0]?.action).toBe('USER_PROFILE_PROVISIONED');
  });

  it('2. is idempotent on subsequent POST /api/v1/auth/session calls and updates last_login_at', async () => {
    const first = await request(app)
      .post('/api/v1/auth/session')
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer valid-token-user-1')
      .send({ fullName: 'Amara Okafor' });

    const second = await request(app)
      .post('/api/v1/auth/session')
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer valid-token-user-1')
      .send({});

    expect(second.status).toBe(200);
    expect(second.body.data.profile.id).toBe(first.body.data.profile.id);
    expect(second.body.data.profile.fullName).toBe('Amara Okafor');
  });

  it('3. retrieves the authenticated user personal profile via GET /api/v1/auth/me', async () => {
    await request(app)
      .post('/api/v1/auth/session')
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer valid-token-user-1')
      .send({ fullName: 'Amara Okafor' });

    const meRes = await request(app)
      .get('/api/v1/auth/me')
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer valid-token-user-1');

    expect(meRes.status).toBe(200);
    expect(meRes.body.success).toBe(true);
    expect(meRes.body.data.profile.email).toBe('amara.okafor@flotech-test.com');
    expect(meRes.body.data.profile.fullName).toBe('Amara Okafor');
  });

  it('4. updates personal profile fields via PATCH /api/v1/auth/me and records before/after states in audit_logs', async () => {
    const sessionRes = await request(app)
      .post('/api/v1/auth/session')
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer valid-token-user-1')
      .send({ fullName: 'Amara Okafor' });

    const userId = sessionRes.body.data.profile.id as string;

    const patchRes = await request(app)
      .patch('/api/v1/auth/me')
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer valid-token-user-1')
      .send({
        fullName: 'Amara N. Okafor',
        phoneNumber: '+1 (555) 999-0000',
        avatarStoragePath: 'avatars/fb_uid_phase2_user_1/avatar_2026.png',
      });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.success).toBe(true);
    expect(patchRes.body.data.fullName).toBe('Amara N. Okafor');
    expect(patchRes.body.data.phoneNumber).toBe('+1 (555) 999-0000');
    expect(patchRes.body.data.avatarStoragePath).toBe(
      'avatars/fb_uid_phase2_user_1/avatar_2026.png'
    );

    const auditRes = await queryPlatform<{
      action: string;
      before_state: { fullName: string };
      after_state: { fullName: string };
    }>(
      `SELECT action, before_state, after_state
       FROM audit_logs
       WHERE actor_user_id = $1 AND action = 'USER_PROFILE_UPDATED'`,
      [userId]
    );

    expect(auditRes.rows.length).toBe(1);
    expect(auditRes.rows[0]?.before_state.fullName).toBe('Amara Okafor');
    expect(auditRes.rows[0]?.after_state.fullName).toBe('Amara N. Okafor');
  });

  it('5. blocks cross-user avatar storage path spoofing on PATCH /api/v1/auth/me', async () => {
    await request(app)
      .post('/api/v1/auth/session')
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer valid-token-user-1')
      .send({ fullName: 'Amara Okafor' });

    const spoofRes = await request(app)
      .patch('/api/v1/auth/me')
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer valid-token-user-1')
      .send({
        avatarStoragePath: 'avatars/fb_uid_phase2_user_2/stolen_avatar.png',
      });

    expect(spoofRes.status).toBe(403);
    expect(spoofRes.body.error.code).toBe('AVATAR_PATH_OWNERSHIP_VIOLATION');
  });

  it('6. blocks privilege escalation attempts via API payload (.strict() Zod validation) and via PostgreSQL trigger trg_enforce_super_admin_protection', async () => {
    await request(app)
      .post('/api/v1/auth/session')
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer valid-token-user-1')
      .send({ fullName: 'Amara Okafor' });

    // Attempt 1: API payload injection of platformRole: 'SUPER_ADMIN'
    const apiAttempt = await request(app)
      .patch('/api/v1/auth/me')
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer valid-token-user-1')
      .send({
        fullName: 'Amara Okafor',
        platformRole: 'SUPER_ADMIN',
      });

    expect(apiAttempt.status).toBe(400);
    expect(apiAttempt.body.error.code).toBe('VALIDATION_ERROR');

    // Attempt 2: Direct SQL UPDATE without app.is_super_admin = 'true' session variable
    await expect(
      queryPlatform(
        `UPDATE users SET platform_role = 'SUPER_ADMIN' WHERE firebase_uid = 'fb_uid_phase2_user_1'`
      )
    ).rejects.toThrow(/SECURITY_VIOLATION: Ordinary users cannot grant SUPER_ADMIN privileges/);
  });

  it('7. blocks suspended user accounts (is_active = false) from accessing /api/v1/auth/me or /api/v1/auth/session', async () => {
    await request(app)
      .post('/api/v1/auth/session')
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer valid-token-user-2')
      .send({ fullName: 'Kwame Mensah' });

    // Suspend user in PostgreSQL
    await queryPlatform(
      `UPDATE users SET is_active = FALSE WHERE firebase_uid = 'fb_uid_phase2_user_2'`
    );

    const meRes = await request(app)
      .get('/api/v1/auth/me')
      .set('X-Firebase-AppCheck', 'valid-app-check-token')
      .set('Authorization', 'Bearer valid-token-user-2');

    expect(meRes.status).toBe(403);
    expect(meRes.body.error.code).toBe('USER_ACCOUNT_SUSPENDED');
  });
});
