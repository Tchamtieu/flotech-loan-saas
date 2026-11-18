import {
  PlatformRole,
  type MembershipStatus,
  type PersonalProfileDTO,
  type ProvisionSessionRequestDTO,
  type SessionContextResponseDTO,
  type UpdatePersonalProfileRequestDTO,
  type UUID,
} from '@flotech/shared';
import type { DecodedFirebaseIdentity } from '../config/firebase.js';
import { dbPool, queryPlatform } from '../database/pool.js';
import type { UserRow } from '../models/entities.js';
import { AppError } from '../middleware/errorHandler.js';

export interface RequestAuditMetadata {
  requestId: string;
  ipAddress: string | null;
  userAgent: string | null;
}

function toIsoTimestamp(val: Date | string | null): string | null {
  if (!val) {
    return null;
  }
  return val instanceof Date ? val.toISOString() : String(val);
}

function mapUserRowToProfileDTO(row: UserRow): PersonalProfileDTO {
  return {
    id: row.id,
    firebaseUid: row.firebase_uid,
    email: row.email,
    fullName: row.full_name,
    phoneNumber: row.phone_number,
    avatarStoragePath: row.avatar_storage_path,
    platformRole: row.platform_role,
    isActive: row.is_active,
    lastLoginAt: toIsoTimestamp(row.last_login_at as Date | string | null),
    createdAt: toIsoTimestamp(row.created_at as Date | string) ?? new Date().toISOString(),
    updatedAt: toIsoTimestamp(row.updated_at as Date | string) ?? new Date().toISOString(),
  };
}

/**
 * Fetches all business memberships for a given PostgreSQL user ID.
 */
export async function getUserBusinessMemberships(
  userId: UUID
): Promise<SessionContextResponseDTO['memberships']> {
  const result = await queryPlatform<{
    business_id: UUID;
    business_code: string;
    business_name: string;
    currency_code: string;
    membership_id: UUID;
    role_slug: string;
    role_name: string;
    status: MembershipStatus;
  }>(
    `SELECT
       b.id AS business_id,
       b.business_code,
       b.legal_name AS business_name,
       b.currency_code,
       bm.id AS membership_id,
       r.slug AS role_slug,
       r.name AS role_name,
       bm.status
     FROM business_memberships bm
     INNER JOIN businesses b ON b.id = bm.business_id
     INNER JOIN roles r ON r.id = bm.role_id AND r.business_id = bm.business_id
     WHERE bm.user_id = $1
     ORDER BY bm.created_at ASC`,
    [userId]
  );

  return result.rows.map((r) => ({
    businessId: r.business_id,
    businessCode: r.business_code,
    businessName: r.business_name,
    currencyCode: r.currency_code,
    membershipId: r.membership_id,
    roleSlug: r.role_slug,
    roleName: r.role_name,
    status: r.status,
  }));
}

/**
 * Synchronizes a verified Firebase identity with PostgreSQL `users` table inside an ACID transaction.
 * - Creates a new `users` record (`platform_role = 'USER'`) if first sign-in.
 * - Updates `last_login_at` if existing user.
 * - Rejects suspended accounts (`is_active = false`).
 * - Appends an immutable record to `audit_logs`.
 */
export async function provisionOrSyncUserSession(
  firebaseIdentity: DecodedFirebaseIdentity,
  input: ProvisionSessionRequestDTO,
  auditMeta: RequestAuditMetadata
): Promise<SessionContextResponseDTO> {
  if (!firebaseIdentity.email) {
    throw new AppError(
      400,
      'FIREBASE_EMAIL_REQUIRED',
      'Verified Firebase identity must include an email address.'
    );
  }

  const normalizedEmail = firebaseIdentity.email.trim().toLowerCase();
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');

    const existingResult = await client.query<UserRow>(
      `SELECT * FROM users WHERE firebase_uid = $1 FOR UPDATE`,
      [firebaseIdentity.uid]
    );

    let userRow = existingResult.rows[0];
    let auditAction = 'USER_SESSION_SYNCED';
    const beforeState = userRow ? mapUserRowToProfileDTO(userRow) : null;

    if (!userRow) {
      const resolvedFullName =
        input.fullName?.trim() ||
        firebaseIdentity.name?.trim() ||
        normalizedEmail.split('@')[0] ||
        'FloTech User';

      const insertResult = await client.query<UserRow>(
        `INSERT INTO users (
           firebase_uid,
           email,
           full_name,
           phone_number,
           platform_role,
           is_active,
           last_login_at
         )
         VALUES ($1, $2, $3, $4, $5, TRUE, NOW())
         RETURNING *`,
        [
          firebaseIdentity.uid,
          normalizedEmail,
          resolvedFullName,
          input.phoneNumber ?? null,
          PlatformRole.USER,
        ]
      );

      userRow = insertResult.rows[0];
      auditAction = 'USER_PROFILE_PROVISIONED';
    } else {
      if (!userRow.is_active) {
        throw new AppError(
          403,
          'USER_ACCOUNT_SUSPENDED',
          'Your user account has been suspended. Please contact FloTech Digital support.'
        );
      }

      const updateResult = await client.query<UserRow>(
        `UPDATE users
         SET email = $2,
             full_name = COALESCE($3, full_name),
             phone_number = COALESCE($4, phone_number),
             last_login_at = NOW(),
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [
          userRow.id,
          normalizedEmail,
          input.fullName?.trim() ?? null,
          input.phoneNumber !== undefined ? input.phoneNumber : null,
        ]
      );

      userRow = updateResult.rows[0];
    }

    if (!userRow) {
      throw new AppError(500, 'USER_PROVISION_FAILED', 'Failed to persist user profile.');
    }

    const profileDTO = mapUserRowToProfileDTO(userRow);

    await client.query(
      `INSERT INTO audit_logs (
         business_id,
         actor_user_id,
         actor_platform_role,
         action,
         entity_type,
         entity_id,
         request_id,
         ip_address,
         user_agent,
         before_state,
         after_state
       )
       VALUES (NULL, $1, $2, $3, 'USER', $1, $4, $5, $6, $7, $8)`,
      [
        userRow.id,
        userRow.platform_role,
        auditAction,
        auditMeta.requestId,
        auditMeta.ipAddress,
        auditMeta.userAgent,
        beforeState ? JSON.stringify(beforeState) : null,
        JSON.stringify(profileDTO),
      ]
    );

    await client.query('COMMIT');

    const memberships = await getUserBusinessMemberships(userRow.id);
    return {
      profile: profileDTO,
      memberships,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Retrieves the canonical PersonalProfileDTO and business memberships for an authenticated user.
 */
export async function getPersonalProfileSession(
  userId: UUID
): Promise<SessionContextResponseDTO> {
  const result = await queryPlatform<UserRow>(
    `SELECT * FROM users WHERE id = $1 LIMIT 1`,
    [userId]
  );

  const userRow = result.rows[0];
  if (!userRow) {
    throw new AppError(404, 'USER_NOT_FOUND', 'Personal profile record not found.');
  }

  const memberships = await getUserBusinessMemberships(userId);
  return {
    profile: mapUserRowToProfileDTO(userRow),
    memberships,
  };
}

/**
 * Updates the authenticated user's personal profile (`full_name`, `phone_number`, `avatar_storage_path`)
 * in PostgreSQL and records an immutable audit log entry.
 *
 * SECURITY RULE:
 * - If `avatarStoragePath` is provided, it MUST start with `avatars/<firebase_uid>/` so a user
 *   cannot link another user's Firebase Storage object.
 * - `platform_role` is never modified here.
 */
export async function updatePersonalProfile(
  userId: UUID,
  firebaseUid: string,
  updates: UpdatePersonalProfileRequestDTO,
  auditMeta: RequestAuditMetadata
): Promise<PersonalProfileDTO> {
  if (
    updates.avatarStoragePath !== undefined &&
    updates.avatarStoragePath !== null &&
    !updates.avatarStoragePath.startsWith(`avatars/${firebaseUid}/`)
  ) {
    throw new AppError(
      403,
      'AVATAR_PATH_OWNERSHIP_VIOLATION',
      `Avatar storage path must reside under your personal prefix (avatars/${firebaseUid}/).`
    );
  }

  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');

    const existingResult = await client.query<UserRow>(
      `SELECT * FROM users WHERE id = $1 FOR UPDATE`,
      [userId]
    );

    const existingRow = existingResult.rows[0];
    if (!existingRow) {
      throw new AppError(404, 'USER_NOT_FOUND', 'Personal profile record not found.');
    }

    const beforeProfile = mapUserRowToProfileDTO(existingRow);

    const nextFullName =
      updates.fullName !== undefined ? updates.fullName.trim() : existingRow.full_name;
    const nextPhone =
      updates.phoneNumber !== undefined ? updates.phoneNumber : existingRow.phone_number;
    const nextAvatar =
      updates.avatarStoragePath !== undefined
        ? updates.avatarStoragePath
        : existingRow.avatar_storage_path;

    const updateResult = await client.query<UserRow>(
      `UPDATE users
       SET full_name = $2,
           phone_number = $3,
           avatar_storage_path = $4,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [userId, nextFullName, nextPhone, nextAvatar]
    );

    const updatedRow = updateResult.rows[0];
    if (!updatedRow) {
      throw new AppError(500, 'PROFILE_UPDATE_FAILED', 'Unable to update personal profile.');
    }

    const afterProfile = mapUserRowToProfileDTO(updatedRow);

    await client.query(
      `INSERT INTO audit_logs (
         business_id,
         actor_user_id,
         actor_platform_role,
         action,
         entity_type,
         entity_id,
         request_id,
         ip_address,
         user_agent,
         before_state,
         after_state
       )
       VALUES (NULL, $1, $2, 'USER_PROFILE_UPDATED', 'USER', $1, $3, $4, $5, $6, $7)`,
      [
        userId,
        updatedRow.platform_role,
        auditMeta.requestId,
        auditMeta.ipAddress,
        auditMeta.userAgent,
        JSON.stringify(beforeProfile),
        JSON.stringify(afterProfile),
      ]
    );

    await client.query('COMMIT');
    return afterProfile;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
