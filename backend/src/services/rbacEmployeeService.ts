import crypto from 'node:crypto';
import {
  MembershipStatus,
  PermissionCode,
  PlatformRole,
  SystemBusinessRoleSlug,
  type BusinessEmployeeDTO,
  type BusinessRoleDTO,
  type CreateBusinessRoleRequestDTO,
  type InviteOrAddEmployeeRequestDTO,
  type PermissionCatalogItemDTO,
  type UpdateBusinessRoleRequestDTO,
  type UpdateEmployeeMembershipRequestDTO,
  type UUID,
} from '@flotech/shared';
import { queryPlatform, withTenantTransaction } from '../database/pool.js';
import type { UserRow } from '../models/entities.js';
import { AppError } from '../middleware/errorHandler.js';
import type { RequestAuditMetadata } from './authProfileService.js';

function toIso(val: Date | string | null | undefined): string {
  if (!val) {
    return new Date().toISOString();
  }
  return val instanceof Date ? val.toISOString() : String(val);
}

function toNullableIso(val: Date | string | null | undefined): string | null {
  if (!val) {
    return null;
  }
  return val instanceof Date ? val.toISOString() : String(val);
}

function slugifyRoleName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
}

/**
 * Returns the complete atomic permission catalog from PostgreSQL `permissions`.
 */
export async function listSystemPermissionsCatalog(): Promise<PermissionCatalogItemDTO[]> {
  const res = await queryPlatform<{
    code: PermissionCode;
    module: string;
    description: string;
  }>(`SELECT code, module, description FROM permissions ORDER BY module ASC, code ASC`);

  return res.rows.map((r) => ({
    code: r.code,
    module: r.module,
    description: r.description,
  }));
}

interface RoleQueryRow {
  id: UUID;
  business_id: UUID;
  slug: string;
  name: string;
  description: string | null;
  is_system_role: boolean;
  permissions: PermissionCode[];
  member_count: string;
  created_at: Date | string;
  updated_at: Date | string;
}

function mapRoleRowToDTO(r: RoleQueryRow): BusinessRoleDTO {
  return {
    id: r.id,
    businessId: r.business_id,
    slug: r.slug,
    name: r.name,
    description: r.description,
    isSystemRole: r.is_system_role,
    permissions: r.permissions,
    memberCount: parseInt(r.member_count, 10) || 0,
    createdAt: toIso(r.created_at),
    updatedAt: toIso(r.updated_at),
  };
}

/**
 * Lists all roles (system and custom) for a specific business tenant along with
 * their assigned permissions and active/invited member counts.
 */
export async function listTenantBusinessRoles(
  businessId: UUID,
  actorUserId: UUID
): Promise<BusinessRoleDTO[]> {
  return withTenantTransaction({ businessId, actorUserId }, async (client) => {
    const res = await client.query<RoleQueryRow>(
      `SELECT
         r.id,
         r.business_id,
         r.slug,
         r.name,
         r.description,
         r.is_system_role,
         r.created_at,
         r.updated_at,
         COALESCE(
           ARRAY_AGG(DISTINCT rp.permission_code) FILTER (WHERE rp.permission_code IS NOT NULL),
           '{}'
         ) AS permissions,
         COUNT(DISTINCT bm.id)::text AS member_count
       FROM roles r
       LEFT JOIN role_permissions rp
         ON rp.role_id = r.id AND rp.business_id = r.business_id
       LEFT JOIN business_memberships bm
         ON bm.role_id = r.id AND bm.business_id = r.business_id AND bm.status <> 'REVOKED'
       WHERE r.business_id = $1
       GROUP BY r.id
       ORDER BY r.is_system_role DESC, r.created_at ASC`,
      [businessId]
    );

    return res.rows.map(mapRoleRowToDTO);
  });
}

/**
 * Creates a custom role within a business tenant and assigns atomic permissions.
 */
export async function createCustomBusinessRole(
  businessId: UUID,
  actorUserId: UUID,
  actorPlatformRole: PlatformRole,
  input: CreateBusinessRoleRequestDTO,
  auditMeta: RequestAuditMetadata
): Promise<BusinessRoleDTO> {
  const resolvedSlug = input.slug ? input.slug.trim().toLowerCase() : slugifyRoleName(input.name);
  if (!resolvedSlug || resolvedSlug.length < 2) {
    throw new AppError(400, 'INVALID_ROLE_SLUG', 'Generated role slug must be at least 2 characters.');
  }

  const uniquePermissions = Array.from(new Set(input.permissions));

  return withTenantTransaction({ businessId, actorUserId }, async (client) => {
    const dupCheck = await client.query<{ id: UUID }>(
      `SELECT id FROM roles WHERE business_id = $1 AND slug = $2 LIMIT 1`,
      [businessId, resolvedSlug]
    );
    if (dupCheck.rowCount && dupCheck.rowCount > 0) {
      throw new AppError(
        409,
        'ROLE_SLUG_ALREADY_EXISTS',
        `A role with slug '${resolvedSlug}' already exists in this business.`
      );
    }

    const roleInsert = await client.query<{
      id: UUID;
      business_id: UUID;
      slug: string;
      name: string;
      description: string | null;
      is_system_role: boolean;
      created_at: Date | string;
      updated_at: Date | string;
    }>(
      `INSERT INTO roles (business_id, slug, name, description, is_system_role)
       VALUES ($1, $2, $3, $4, FALSE)
       RETURNING id, business_id, slug, name, description, is_system_role, created_at, updated_at`,
      [businessId, resolvedSlug, input.name.trim(), input.description?.trim() ?? null]
    );

    const roleRow = roleInsert.rows[0];
    if (!roleRow) {
      throw new AppError(500, 'ROLE_CREATION_FAILED', 'Failed to create custom business role.');
    }

    for (const perm of uniquePermissions) {
      await client.query(
        `INSERT INTO role_permissions (role_id, business_id, permission_code)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [roleRow.id, businessId, perm]
      );
    }

    const dto: BusinessRoleDTO = {
      id: roleRow.id,
      businessId: roleRow.business_id,
      slug: roleRow.slug,
      name: roleRow.name,
      description: roleRow.description,
      isSystemRole: roleRow.is_system_role,
      permissions: uniquePermissions,
      memberCount: 0,
      createdAt: toIso(roleRow.created_at),
      updatedAt: toIso(roleRow.updated_at),
    };

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
       VALUES ($1, $2, $3, 'BUSINESS_ROLE_CREATED', 'ROLE', $4, $5, $6, $7, NULL, $8)`,
      [
        businessId,
        actorUserId,
        actorPlatformRole,
        roleRow.id,
        auditMeta.requestId,
        auditMeta.ipAddress,
        auditMeta.userAgent,
        JSON.stringify(dto),
      ]
    );

    return dto;
  });
}

/**
 * Updates a business role's name, description, and/or permission matrix.
 * SECURITY INVARIANT:
 * The `business_owner` system role's permissions cannot be stripped to prevent
 * permanent administrative lockout of the tenant.
 */
export async function updateBusinessRole(
  businessId: UUID,
  roleId: UUID,
  actorUserId: UUID,
  actorPlatformRole: PlatformRole,
  updates: UpdateBusinessRoleRequestDTO,
  auditMeta: RequestAuditMetadata
): Promise<BusinessRoleDTO> {
  return withTenantTransaction({ businessId, actorUserId }, async (client) => {
    const existingRes = await client.query<{
      id: UUID;
      business_id: UUID;
      slug: string;
      name: string;
      description: string | null;
      is_system_role: boolean;
      created_at: Date | string;
      updated_at: Date | string;
    }>(
      `SELECT id, business_id, slug, name, description, is_system_role, created_at, updated_at
       FROM roles
       WHERE business_id = $1 AND id = $2
       FOR UPDATE`,
      [businessId, roleId]
    );

    const existingRole = existingRes.rows[0];
    if (!existingRole) {
      throw new AppError(404, 'ROLE_NOT_FOUND', 'Role not found in this business.');
    }

    if (
      existingRole.slug === SystemBusinessRoleSlug.BUSINESS_OWNER &&
      updates.permissions !== undefined
    ) {
      const allPerms = Object.values(PermissionCode);
      const providedSet = new Set(updates.permissions);
      const missingFromOwner = allPerms.filter((p) => !providedSet.has(p));
      if (missingFromOwner.length > 0) {
        throw new AppError(
          403,
          'OWNER_ROLE_IMMUTABLE_PERMISSIONS',
          'The Business Owner system role must retain all permissions to prevent tenant lockout.'
        );
      }
    }

    const beforePermsRes = await client.query<{ permission_code: PermissionCode }>(
      `SELECT permission_code FROM role_permissions WHERE business_id = $1 AND role_id = $2`,
      [businessId, roleId]
    );
    const beforePerms = beforePermsRes.rows.map((r) => r.permission_code);

    const updatedRoleRes = await client.query<{
      id: UUID;
      business_id: UUID;
      slug: string;
      name: string;
      description: string | null;
      is_system_role: boolean;
      created_at: Date | string;
      updated_at: Date | string;
    }>(
      `UPDATE roles
       SET name = $3,
           description = $4,
           updated_at = NOW()
       WHERE business_id = $1 AND id = $2
       RETURNING id, business_id, slug, name, description, is_system_role, created_at, updated_at`,
      [
        businessId,
        roleId,
        updates.name !== undefined ? updates.name.trim() : existingRole.name,
        updates.description !== undefined
          ? updates.description?.trim() ?? null
          : existingRole.description,
      ]
    );

    const updatedRole = updatedRoleRes.rows[0];
    if (!updatedRole) {
      throw new AppError(500, 'ROLE_UPDATE_FAILED', 'Unable to update role.');
    }

    let finalPermissions = beforePerms;
    if (updates.permissions !== undefined) {
      finalPermissions = Array.from(new Set(updates.permissions));
      await client.query(
        `DELETE FROM role_permissions WHERE business_id = $1 AND role_id = $2`,
        [businessId, roleId]
      );
      for (const perm of finalPermissions) {
        await client.query(
          `INSERT INTO role_permissions (role_id, business_id, permission_code)
           VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [roleId, businessId, perm]
        );
      }
    }

    const countRes = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM business_memberships
       WHERE business_id = $1 AND role_id = $2 AND status <> 'REVOKED'`,
      [businessId, roleId]
    );

    const afterDto: BusinessRoleDTO = {
      id: updatedRole.id,
      businessId: updatedRole.business_id,
      slug: updatedRole.slug,
      name: updatedRole.name,
      description: updatedRole.description,
      isSystemRole: updatedRole.is_system_role,
      permissions: finalPermissions,
      memberCount: parseInt(countRes.rows[0]?.count ?? '0', 10) || 0,
      createdAt: toIso(updatedRole.created_at),
      updatedAt: toIso(updatedRole.updated_at),
    };

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
       VALUES ($1, $2, $3, 'BUSINESS_ROLE_UPDATED', 'ROLE', $4, $5, $6, $7, $8, $9)`,
      [
        businessId,
        actorUserId,
        actorPlatformRole,
        roleId,
        auditMeta.requestId,
        auditMeta.ipAddress,
        auditMeta.userAgent,
        JSON.stringify({ ...existingRole, permissions: beforePerms }),
        JSON.stringify(afterDto),
      ]
    );

    return afterDto;
  });
}

interface EmployeeJoinRow {
  membership_id: UUID;
  business_id: UUID;
  user_id: UUID;
  full_name: string;
  email: string;
  phone_number: string | null;
  role_id: UUID;
  role_slug: string;
  role_name: string;
  employee_code: string | null;
  job_title: string | null;
  department: string | null;
  status: MembershipStatus;
  invited_by_user_id: UUID | null;
  joined_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

function mapEmployeeJoinRowToDTO(row: EmployeeJoinRow): BusinessEmployeeDTO {
  return {
    membershipId: row.membership_id,
    businessId: row.business_id,
    userId: row.user_id,
    fullName: row.full_name,
    email: row.email,
    phoneNumber: row.phone_number,
    roleId: row.role_id,
    roleSlug: row.role_slug,
    roleName: row.role_name,
    employeeCode: row.employee_code,
    jobTitle: row.job_title,
    department: row.department,
    status: row.status,
    invitedByUserId: row.invited_by_user_id,
    joinedAt: toNullableIso(row.joined_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

/**
 * Lists all employees / members belonging to a business tenant.
 */
export async function listBusinessEmployees(
  businessId: UUID,
  actorUserId: UUID
): Promise<BusinessEmployeeDTO[]> {
  return withTenantTransaction({ businessId, actorUserId }, async (client) => {
    const res = await client.query<EmployeeJoinRow>(
      `SELECT
         bm.id AS membership_id,
         bm.business_id,
         bm.user_id,
         u.full_name,
         u.email,
         u.phone_number,
         r.id AS role_id,
         r.slug AS role_slug,
         r.name AS role_name,
         bm.employee_code,
         bm.job_title,
         bm.department,
         bm.status,
         bm.invited_by_user_id,
         bm.joined_at,
         bm.created_at,
         bm.updated_at
       FROM business_memberships bm
       INNER JOIN users u ON u.id = bm.user_id
       INNER JOIN roles r ON r.id = bm.role_id AND r.business_id = bm.business_id
       WHERE bm.business_id = $1
       ORDER BY bm.created_at ASC`,
      [businessId]
    );

    return res.rows.map(mapEmployeeJoinRowToDTO);
  });
}

/**
 * Invites or onboards an employee into a business tenant:
 * - Verifies that `input.roleId` belongs to the target `businessId`.
 * - Enforces subscription quota (`max_employees`) if an active subscription is present.
 * - Looks up the user by `email` in `users` (or creates a pre-provisioned user identity if not yet registered).
 * - Inserts `business_memberships` (`ACTIVE` or `INVITED`) and logs `EMPLOYEE_MEMBERSHIP_CREATED` in `audit_logs`.
 */
export async function inviteOrAddBusinessEmployee(
  businessId: UUID,
  actorUserId: UUID,
  actorPlatformRole: PlatformRole,
  input: InviteOrAddEmployeeRequestDTO,
  auditMeta: RequestAuditMetadata
): Promise<BusinessEmployeeDTO> {
  const normalizedEmail = input.email.trim().toLowerCase();

  return withTenantTransaction({ businessId, actorUserId }, async (client) => {
    // 1. Verify that roleId belongs to this specific business
    const roleCheck = await client.query<{ id: UUID; slug: string; name: string }>(
      `SELECT id, slug, name FROM roles WHERE business_id = $1 AND id = $2 LIMIT 1`,
      [businessId, input.roleId]
    );
    const targetRole = roleCheck.rows[0];
    if (!targetRole) {
      throw new AppError(
        400,
        'ROLE_NOT_IN_BUSINESS',
        'The specified roleId does not exist in this business tenant.'
      );
    }

    // 2. Check subscription status and max_employees quota
    const quotaRes = await client.query<{
      status: string;
      current_period_end: Date | string;
      cancel_at_period_end: boolean;
      max_employees: number;
    }>(
      `SELECT bs.status, bs.current_period_end, bs.cancel_at_period_end, sp.max_employees
       FROM business_subscriptions bs
       INNER JOIN subscription_plans sp ON sp.id = bs.plan_id
       WHERE bs.business_id = $1
       ORDER BY bs.created_at DESC
       LIMIT 1`,
      [businessId]
    );
    const subRow = quotaRes.rows[0];
    if (subRow) {
      const periodEndMs = new Date(subRow.current_period_end).getTime();
      const isExpiredByDate =
        Number.isFinite(periodEndMs) && periodEndMs < Date.now() && subRow.cancel_at_period_end;
      if (
        subRow.status === 'EXPIRED' ||
        subRow.status === 'CANCELED' ||
        subRow.status === 'PAST_DUE' ||
        isExpiredByDate
      ) {
        throw new AppError(
          403,
          'SUBSCRIPTION_INACTIVE_OR_EXPIRED',
          `Your business subscription is currently ${isExpiredByDate ? 'EXPIRED' : subRow.status}. Please renew or upgrade your plan to invite new employees.`
        );
      }

      const maxEmployees = subRow.max_employees;
      const currentCountRes = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM business_memberships
         WHERE business_id = $1 AND status IN ('INVITED', 'ACTIVE')`,
        [businessId]
      );
      const currentCount = parseInt(currentCountRes.rows[0]?.count ?? '0', 10) || 0;
      if (currentCount >= maxEmployees) {
        throw new AppError(
          403,
          'SUBSCRIPTION_EMPLOYEE_QUOTA_EXCEEDED',
          `Your current subscription plan allows up to ${maxEmployees} active/invited employees.`
        );
      }
    }

    // 3. Resolve or create user by email
    const existingUserRes = await client.query<UserRow>(
      `SELECT * FROM users WHERE email = $1 LIMIT 1`,
      [normalizedEmail]
    );
    let userRow = existingUserRes.rows[0];

    if (!userRow) {
      const pendingFirebaseUid = `invited_${crypto.randomUUID()}`;
      const createdUserRes = await client.query<UserRow>(
        `INSERT INTO users (firebase_uid, email, full_name, phone_number, platform_role, is_active)
         VALUES ($1, $2, $3, $4, 'USER', TRUE)
         RETURNING *`,
        [
          pendingFirebaseUid,
          normalizedEmail,
          input.fullName.trim(),
          input.phoneNumber?.trim() ?? null,
        ]
      );
      userRow = createdUserRes.rows[0];
    }

    if (!userRow) {
      throw new AppError(500, 'EMPLOYEE_USER_RESOLUTION_FAILED', 'Unable to resolve employee user.');
    }

    // 4. Verify the user is not already a member of this business
    const existingMemberRes = await client.query<{ id: UUID }>(
      `SELECT id FROM business_memberships WHERE business_id = $1 AND user_id = $2 LIMIT 1`,
      [businessId, userRow.id]
    );
    if (existingMemberRes.rowCount && existingMemberRes.rowCount > 0) {
      throw new AppError(
        409,
        'EMPLOYEE_ALREADY_MEMBER',
        `User ${normalizedEmail} already has a membership record in this business.`
      );
    }

    // Generate sequential employee code if not provided
    let resolvedEmployeeCode = input.employeeCode?.trim() ?? null;
    if (!resolvedEmployeeCode) {
      const seqRes = await client.query<{ count: string }>(
        `SELECT (COUNT(*) + 1)::text AS count FROM business_memberships WHERE business_id = $1`,
        [businessId]
      );
      const num = (seqRes.rows[0]?.count ?? '1').padStart(4, '0');
      resolvedEmployeeCode = `EMP-${num}`;
    }

    const desiredStatus =
      input.activateImmediately !== false ? MembershipStatus.ACTIVE : MembershipStatus.INVITED;

    const insertMemberRes = await client.query<{
      id: UUID;
      created_at: Date | string;
      updated_at: Date | string;
      joined_at: Date | string | null;
    }>(
      `INSERT INTO business_memberships (
         business_id,
         user_id,
         role_id,
         employee_code,
         job_title,
         department,
         status,
         invited_by_user_id,
         joined_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CASE WHEN $7 = 'ACTIVE'::membership_status_type THEN NOW() ELSE NULL END)
       RETURNING id, created_at, updated_at, joined_at`,
      [
        businessId,
        userRow.id,
        targetRole.id,
        resolvedEmployeeCode,
        input.jobTitle?.trim() ?? null,
        input.department?.trim() ?? null,
        desiredStatus,
        actorUserId,
      ]
    );

    const memberRow = insertMemberRes.rows[0];
    if (!memberRow) {
      throw new AppError(500, 'MEMBERSHIP_INSERT_FAILED', 'Failed to create employee membership.');
    }

    const dto: BusinessEmployeeDTO = {
      membershipId: memberRow.id,
      businessId,
      userId: userRow.id,
      fullName: userRow.full_name,
      email: userRow.email,
      phoneNumber: userRow.phone_number,
      roleId: targetRole.id,
      roleSlug: targetRole.slug,
      roleName: targetRole.name,
      employeeCode: resolvedEmployeeCode,
      jobTitle: input.jobTitle?.trim() ?? null,
      department: input.department?.trim() ?? null,
      status: desiredStatus,
      invitedByUserId: actorUserId,
      joinedAt: toNullableIso(memberRow.joined_at),
      createdAt: toIso(memberRow.created_at),
      updatedAt: toIso(memberRow.updated_at),
    };

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
       VALUES ($1, $2, $3, 'EMPLOYEE_MEMBERSHIP_CREATED', 'BUSINESS_MEMBERSHIP', $4, $5, $6, $7, NULL, $8)`,
      [
        businessId,
        actorUserId,
        actorPlatformRole,
        memberRow.id,
        auditMeta.requestId,
        auditMeta.ipAddress,
        auditMeta.userAgent,
        JSON.stringify(dto),
      ]
    );

    return dto;
  });
}

/**
 * Updates an employee's role, job metadata, or membership status (`ACTIVE`, `SUSPENDED`, `REVOKED`).
 * SECURITY INVARIANT:
 * Prevents demoting or suspending/revoking the last `ACTIVE` `business_owner` of a business
 * so a tenant can never be orphaned without an active owner.
 */
export async function updateBusinessEmployeeMembership(
  businessId: UUID,
  membershipId: UUID,
  actorUserId: UUID,
  actorPlatformRole: PlatformRole,
  updates: UpdateEmployeeMembershipRequestDTO,
  auditMeta: RequestAuditMetadata
): Promise<BusinessEmployeeDTO> {
  return withTenantTransaction({ businessId, actorUserId }, async (client) => {
    const existingRes = await client.query<EmployeeJoinRow>(
      `SELECT
         bm.id AS membership_id,
         bm.business_id,
         bm.user_id,
         u.full_name,
         u.email,
         u.phone_number,
         r.id AS role_id,
         r.slug AS role_slug,
         r.name AS role_name,
         bm.employee_code,
         bm.job_title,
         bm.department,
         bm.status,
         bm.invited_by_user_id,
         bm.joined_at,
         bm.created_at,
         bm.updated_at
       FROM business_memberships bm
       INNER JOIN users u ON u.id = bm.user_id
       INNER JOIN roles r ON r.id = bm.role_id AND r.business_id = bm.business_id
       WHERE bm.business_id = $1 AND bm.id = $2
       FOR UPDATE OF bm`,
      [businessId, membershipId]
    );

    const existing = existingRes.rows[0];
    if (!existing) {
      throw new AppError(404, 'EMPLOYEE_MEMBERSHIP_NOT_FOUND', 'Employee membership not found.');
    }

    const beforeDto = mapEmployeeJoinRowToDTO(existing);

    let nextRoleId = existing.role_id;
    let nextRoleSlug = existing.role_slug;
    let nextRoleName = existing.role_name;

    if (updates.roleId !== undefined && updates.roleId !== existing.role_id) {
      const roleCheck = await client.query<{ id: UUID; slug: string; name: string }>(
        `SELECT id, slug, name FROM roles WHERE business_id = $1 AND id = $2 LIMIT 1`,
        [businessId, updates.roleId]
      );
      const targetRole = roleCheck.rows[0];
      if (!targetRole) {
        throw new AppError(
          400,
          'ROLE_NOT_IN_BUSINESS',
          'Target role does not belong to this business.'
        );
      }
      nextRoleId = targetRole.id;
      nextRoleSlug = targetRole.slug;
      nextRoleName = targetRole.name;
    }

    const nextStatus = updates.status ?? existing.status;

    // Check last-active-owner protection
    const isCurrentlyActiveOwner =
      existing.role_slug === SystemBusinessRoleSlug.BUSINESS_OWNER &&
      existing.status === MembershipStatus.ACTIVE;
    const wouldLoseActiveOwnerStatus =
      nextRoleSlug !== SystemBusinessRoleSlug.BUSINESS_OWNER ||
      nextStatus !== MembershipStatus.ACTIVE;

    if (isCurrentlyActiveOwner && wouldLoseActiveOwnerStatus) {
      const otherOwnersRes = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM business_memberships bm
         INNER JOIN roles r ON r.id = bm.role_id AND r.business_id = bm.business_id
         WHERE bm.business_id = $1
           AND bm.id <> $2
           AND bm.status = 'ACTIVE'
           AND r.slug = $3`,
        [businessId, membershipId, SystemBusinessRoleSlug.BUSINESS_OWNER]
      );
      const otherOwnersCount = parseInt(otherOwnersRes.rows[0]?.count ?? '0', 10) || 0;
      if (otherOwnersCount === 0) {
        throw new AppError(
          409,
          'LAST_BUSINESS_OWNER_PROTECTION',
          'Cannot demote, suspend, or revoke the sole active Business Owner of this tenant.'
        );
      }
    }

    const updatedRes = await client.query<{
      updated_at: Date | string;
      joined_at: Date | string | null;
    }>(
      `UPDATE business_memberships
       SET role_id = $3,
           employee_code = $4,
           job_title = $5,
           department = $6,
           status = $7,
           joined_at = CASE
             WHEN joined_at IS NULL AND $7 = 'ACTIVE'::membership_status_type THEN NOW()
             ELSE joined_at
           END,
           updated_at = NOW()
       WHERE business_id = $1 AND id = $2
       RETURNING updated_at, joined_at`,
      [
        businessId,
        membershipId,
        nextRoleId,
        updates.employeeCode !== undefined
          ? updates.employeeCode?.trim() ?? null
          : existing.employee_code,
        updates.jobTitle !== undefined ? updates.jobTitle?.trim() ?? null : existing.job_title,
        updates.department !== undefined
          ? updates.department?.trim() ?? null
          : existing.department,
        nextStatus,
      ]
    );

    const updatedRow = updatedRes.rows[0];
    const afterDto: BusinessEmployeeDTO = {
      ...beforeDto,
      roleId: nextRoleId,
      roleSlug: nextRoleSlug,
      roleName: nextRoleName,
      employeeCode:
        updates.employeeCode !== undefined
          ? updates.employeeCode?.trim() ?? null
          : existing.employee_code,
      jobTitle:
        updates.jobTitle !== undefined ? updates.jobTitle?.trim() ?? null : existing.job_title,
      department:
        updates.department !== undefined
          ? updates.department?.trim() ?? null
          : existing.department,
      status: nextStatus,
      joinedAt: toNullableIso(updatedRow?.joined_at ?? existing.joined_at),
      updatedAt: toIso(updatedRow?.updated_at),
    };

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
       VALUES ($1, $2, $3, 'EMPLOYEE_MEMBERSHIP_UPDATED', 'BUSINESS_MEMBERSHIP', $4, $5, $6, $7, $8, $9)`,
      [
        businessId,
        actorUserId,
        actorPlatformRole,
        membershipId,
        auditMeta.requestId,
        auditMeta.ipAddress,
        auditMeta.userAgent,
        JSON.stringify(beforeDto),
        JSON.stringify(afterDto),
      ]
    );

    return afterDto;
  });
}
