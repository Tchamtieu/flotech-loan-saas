import crypto from 'node:crypto';
import {
  BusinessStatus,
  MembershipStatus,
  PermissionCode,
  PlatformRole,
  SubscriptionStatus,
  SystemBusinessRoleSlug,
  type BusinessOperationalSettingsDTO,
  type BusinessProfileDTO,
  type CreateBusinessRequestDTO,
  type SessionContextResponseDTO,
  type TenantMembershipContext,
  type UpdateBusinessProfileRequestDTO,
  type UpdateBusinessSettingsRequestDTO,
  type UUID,
} from '@flotech/shared';
import { dbPool, withTenantTransaction } from '../database/pool.js';
import type { BusinessRow } from '../models/entities.js';
import { AppError } from '../middleware/errorHandler.js';
import {
  getUserBusinessMemberships,
  type RequestAuditMetadata,
} from './authProfileService.js';

export const DEFAULT_BUSINESS_SETTINGS: BusinessOperationalSettingsDTO = {
  loanNumberPrefix: 'LN-',
  customerNumberPrefix: 'CUST-',
  receiptNumberPrefix: 'RCPT-',
  defaultGracePeriodDays: 3,
  requireDualApprovalForLoans: false,
  allowPartialInstallmentPayments: true,
  statementFooterNote: 'Thank you for partnering with our lending institution.',
};

function toIsoString(val: Date | string | null | undefined): string {
  if (!val) {
    return new Date().toISOString();
  }
  return val instanceof Date ? val.toISOString() : String(val);
}

export function normalizeOperationalSettings(
  raw: Record<string, unknown> | null | undefined
): BusinessOperationalSettingsDTO {
  const source = raw ?? {};
  return {
    loanNumberPrefix:
      typeof source['loanNumberPrefix'] === 'string'
        ? source['loanNumberPrefix']
        : DEFAULT_BUSINESS_SETTINGS.loanNumberPrefix,
    customerNumberPrefix:
      typeof source['customerNumberPrefix'] === 'string'
        ? source['customerNumberPrefix']
        : DEFAULT_BUSINESS_SETTINGS.customerNumberPrefix,
    receiptNumberPrefix:
      typeof source['receiptNumberPrefix'] === 'string'
        ? source['receiptNumberPrefix']
        : DEFAULT_BUSINESS_SETTINGS.receiptNumberPrefix,
    defaultGracePeriodDays:
      typeof source['defaultGracePeriodDays'] === 'number'
        ? source['defaultGracePeriodDays']
        : DEFAULT_BUSINESS_SETTINGS.defaultGracePeriodDays,
    requireDualApprovalForLoans:
      typeof source['requireDualApprovalForLoans'] === 'boolean'
        ? source['requireDualApprovalForLoans']
        : DEFAULT_BUSINESS_SETTINGS.requireDualApprovalForLoans,
    allowPartialInstallmentPayments:
      typeof source['allowPartialInstallmentPayments'] === 'boolean'
        ? source['allowPartialInstallmentPayments']
        : DEFAULT_BUSINESS_SETTINGS.allowPartialInstallmentPayments,
    statementFooterNote:
      typeof source['statementFooterNote'] === 'string'
        ? source['statementFooterNote']
        : DEFAULT_BUSINESS_SETTINGS.statementFooterNote,
  };
}

export function mapBusinessRowToDTO(row: BusinessRow): BusinessProfileDTO {
  return {
    id: row.id,
    businessCode: row.business_code,
    legalName: row.legal_name,
    tradingName: row.trading_name,
    businessCategory: row.business_category,
    registrationNumber: row.registration_number,
    taxId: row.tax_id,
    primaryEmail: row.primary_email,
    primaryPhone: row.primary_phone,
    countryCode: row.country_code,
    currencyCode: row.currency_code,
    timezone: row.timezone,
    addressLine1: row.address_line_1,
    city: row.city,
    logoStoragePath: row.logo_storage_path,
    status: row.status,
    ownerUserId: row.owner_user_id,
    settings: normalizeOperationalSettings(row.settings_json),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

const ALL_PERMISSION_CODES: PermissionCode[] = Object.values(PermissionCode);

const SYSTEM_ROLE_DEFINITIONS: Array<{
  slug: SystemBusinessRoleSlug;
  name: string;
  description: string;
  permissions: PermissionCode[];
}> = [
  {
    slug: SystemBusinessRoleSlug.BUSINESS_OWNER,
    name: 'Business Owner',
    description: 'Full administrative, financial, and operational control of the business tenant.',
    permissions: ALL_PERMISSION_CODES,
  },
  {
    slug: SystemBusinessRoleSlug.BRANCH_MANAGER,
    name: 'Branch Manager',
    description: 'Manages customers, loan products, loan approvals, disbursements, repayments, and staff.',
    permissions: ALL_PERMISSION_CODES.filter(
      (p) => p !== PermissionCode.SUBSCRIPTION_MANAGE && p !== PermissionCode.ROLES_MANAGE
    ),
  },
  {
    slug: SystemBusinessRoleSlug.LOAN_OFFICER,
    name: 'Loan Officer',
    description: 'Onboards customers, uploads KYC documents, and originates/reviews loan applications.',
    permissions: [
      PermissionCode.DASHBOARD_VIEW,
      PermissionCode.CUSTOMERS_VIEW,
      PermissionCode.CUSTOMERS_CREATE,
      PermissionCode.CUSTOMERS_UPDATE,
      PermissionCode.LOAN_PRODUCTS_VIEW,
      PermissionCode.LOANS_VIEW,
      PermissionCode.LOANS_CREATE,
      PermissionCode.LOANS_REVIEW,
      PermissionCode.REPAYMENTS_VIEW,
    ],
  },
  {
    slug: SystemBusinessRoleSlug.CASHIER,
    name: 'Cashier / Collections Officer',
    description: 'Records customer repayments, views repayment schedules, and issues official receipts.',
    permissions: [
      PermissionCode.DASHBOARD_VIEW,
      PermissionCode.CUSTOMERS_VIEW,
      PermissionCode.LOANS_VIEW,
      PermissionCode.REPAYMENTS_VIEW,
      PermissionCode.REPAYMENTS_RECORD,
    ],
  },
  {
    slug: SystemBusinessRoleSlug.AUDITOR,
    name: 'Internal Auditor',
    description: 'Read-only access to dashboards, customers, loans, repayments, and financial reports.',
    permissions: [
      PermissionCode.DASHBOARD_VIEW,
      PermissionCode.REPORTS_VIEW,
      PermissionCode.REPORTS_EXPORT,
      PermissionCode.CUSTOMERS_VIEW,
      PermissionCode.LOAN_PRODUCTS_VIEW,
      PermissionCode.LOANS_VIEW,
      PermissionCode.REPAYMENTS_VIEW,
      PermissionCode.EMPLOYEES_VIEW,
      PermissionCode.ROLES_VIEW,
      PermissionCode.BUSINESS_SETTINGS_VIEW,
      PermissionCode.SUBSCRIPTION_VIEW,
    ],
  },
];

function generateBusinessCode(): string {
  const randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `FLT-${randomSuffix}`;
}

/**
 * Provisions a new multi-tenant business inside a single ACID PostgreSQL transaction:
 * 1. Inserts the `businesses` row (`status = 'ACTIVE'`, default operational settings).
 * 2. Activates RLS session variable `app.current_business_id` for the newly created business.
 * 3. Seeds the 5 system roles (`business_owner`, `branch_manager`, `loan_officer`, `cashier`, `auditor`)
 *    and their `role_permissions`.
 * 4. Creates the founding `business_memberships` record (`status = 'ACTIVE'`, `role = business_owner`).
 * 5. Creates a default `TRIALING` subscription in `business_subscriptions` linked to `STARTER_TRIAL`.
 * 6. Writes an immutable `BUSINESS_CREATED` entry in `audit_logs`.
 */
export async function createTenantBusiness(
  actorUserId: UUID,
  actorPlatformRole: PlatformRole,
  input: CreateBusinessRequestDTO,
  auditMeta: RequestAuditMetadata
): Promise<{
  business: BusinessProfileDTO;
  membership: TenantMembershipContext;
}> {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');

    const businessCode = generateBusinessCode();

    const businessInsert = await client.query<BusinessRow>(
      `INSERT INTO businesses (
         business_code,
         legal_name,
         trading_name,
         business_category,
         registration_number,
         tax_id,
         primary_email,
         primary_phone,
         country_code,
         currency_code,
         timezone,
         address_line_1,
         city,
         status,
         owner_user_id,
         settings_json
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       RETURNING *`,
      [
        businessCode,
        input.legalName.trim(),
        input.tradingName?.trim() ?? null,
        input.businessCategory.trim(),
        input.registrationNumber?.trim() ?? null,
        input.taxId?.trim() ?? null,
        input.primaryEmail.trim().toLowerCase(),
        input.primaryPhone.trim(),
        input.countryCode.trim().toUpperCase(),
        input.currencyCode.trim().toUpperCase(),
        input.timezone?.trim() || 'UTC',
        input.addressLine1?.trim() ?? null,
        input.city?.trim() ?? null,
        BusinessStatus.ACTIVE,
        actorUserId,
        JSON.stringify(DEFAULT_BUSINESS_SETTINGS),
      ]
    );

    const businessRow = businessInsert.rows[0];
    if (!businessRow) {
      throw new AppError(500, 'BUSINESS_CREATION_FAILED', 'Unable to create business record.');
    }

    // Bind RLS session context to the new business_id for subsequent inserts into RLS-protected tables
    await client.query(`SELECT set_config('app.current_business_id', $1, true)`, [businessRow.id]);
    await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [actorUserId]);

    let ownerRoleId: UUID | null = null;

    for (const roleDef of SYSTEM_ROLE_DEFINITIONS) {
      const roleRes = await client.query<{ id: UUID }>(
        `INSERT INTO roles (business_id, slug, name, description, is_system_role)
         VALUES ($1, $2, $3, $4, TRUE)
         RETURNING id`,
        [businessRow.id, roleDef.slug, roleDef.name, roleDef.description]
      );

      const createdRoleId = roleRes.rows[0]?.id;
      if (!createdRoleId) {
        throw new AppError(500, 'ROLE_SEED_FAILED', `Failed to seed role ${roleDef.slug}`);
      }

      if (roleDef.slug === SystemBusinessRoleSlug.BUSINESS_OWNER) {
        ownerRoleId = createdRoleId;
      }

      for (const permCode of roleDef.permissions) {
        await client.query(
          `INSERT INTO role_permissions (role_id, business_id, permission_code)
           VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [createdRoleId, businessRow.id, permCode]
        );
      }
    }

    if (!ownerRoleId) {
      throw new AppError(500, 'OWNER_ROLE_MISSING', 'Business Owner role was not initialized.');
    }

    const membershipRes = await client.query<{ id: UUID }>(
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
       VALUES ($1, $2, $3, 'EMP-0001', 'Founder & Business Owner', 'Executive', $4, $2, NOW())
       RETURNING id`,
      [businessRow.id, actorUserId, ownerRoleId, MembershipStatus.ACTIVE]
    );

    const membershipId = membershipRes.rows[0]?.id;
    if (!membershipId) {
      throw new AppError(500, 'MEMBERSHIP_CREATION_FAILED', 'Failed to create owner membership.');
    }

    // Attach default TRIALING subscription if STARTER_TRIAL plan exists
    const planRes = await client.query<{ id: UUID; monthly_price: string; currency_code: string }>(
      `SELECT id, monthly_price, currency_code FROM subscription_plans WHERE code = 'STARTER_TRIAL' LIMIT 1`
    );

    const starterPlan = planRes.rows[0];
    if (starterPlan) {
      await client.query(
        `INSERT INTO business_subscriptions (
           business_id,
           plan_id,
           status,
           billing_cycle,
           unit_price,
           currency_code,
           current_period_start,
           current_period_end
         )
         VALUES ($1, $2, $3, 'MONTHLY', $4, $5, NOW(), NOW() + INTERVAL '14 days')`,
        [
          businessRow.id,
          starterPlan.id,
          SubscriptionStatus.TRIALING,
          starterPlan.monthly_price,
          starterPlan.currency_code,
        ]
      );
    }

    const businessDTO = mapBusinessRowToDTO(businessRow);

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
       VALUES ($1, $2, $3, 'BUSINESS_CREATED', 'BUSINESS', $1, $4, $5, $6, NULL, $7)`,
      [
        businessRow.id,
        actorUserId,
        actorPlatformRole,
        auditMeta.requestId,
        auditMeta.ipAddress,
        auditMeta.userAgent,
        JSON.stringify(businessDTO),
      ]
    );

    await client.query('COMMIT');

    return {
      business: businessDTO,
      membership: {
        businessId: businessRow.id,
        businessName: businessRow.legal_name,
        businessCode: businessRow.business_code,
        currencyCode: businessRow.currency_code,
        membershipId,
        roleId: ownerRoleId,
        roleSlug: SystemBusinessRoleSlug.BUSINESS_OWNER,
        roleName: 'Business Owner',
        permissions: ALL_PERMISSION_CODES,
      },
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Lists all business memberships for the authenticated user.
 */
export async function listUserBusinesses(
  userId: UUID
): Promise<SessionContextResponseDTO['memberships']> {
  return getUserBusinessMemberships(userId);
}

/**
 * Retrieves the canonical BusinessProfileDTO for a verified tenant business.
 */
export async function getTenantBusinessProfile(
  businessId: UUID,
  actorUserId: UUID
): Promise<BusinessProfileDTO> {
  return withTenantTransaction({ businessId, actorUserId }, async (client) => {
    const res = await client.query<BusinessRow>(
      `SELECT * FROM businesses WHERE id = $1 LIMIT 1`,
      [businessId]
    );
    const row = res.rows[0];
    if (!row) {
      throw new AppError(404, 'BUSINESS_NOT_FOUND', 'Requested business profile was not found.');
    }
    return mapBusinessRowToDTO(row);
  });
}

/**
 * Updates a business's profile details inside a tenant-scoped transaction and writes an audit log.
 * Enforces logo storage path prefix ownership (`businesses/<business_id>/branding/*`).
 */
export async function updateTenantBusinessProfile(
  businessId: UUID,
  actorUserId: UUID,
  actorPlatformRole: PlatformRole,
  updates: UpdateBusinessProfileRequestDTO,
  auditMeta: RequestAuditMetadata
): Promise<BusinessProfileDTO> {
  if (
    updates.logoStoragePath !== undefined &&
    updates.logoStoragePath !== null &&
    !updates.logoStoragePath.startsWith(`businesses/${businessId}/branding/`)
  ) {
    throw new AppError(
      403,
      'BUSINESS_LOGO_PATH_VIOLATION',
      `Business logo storage path must reside under businesses/${businessId}/branding/.`
    );
  }

  return withTenantTransaction({ businessId, actorUserId }, async (client) => {
    const existingRes = await client.query<BusinessRow>(
      `SELECT * FROM businesses WHERE id = $1 FOR UPDATE`,
      [businessId]
    );
    const existing = existingRes.rows[0];
    if (!existing) {
      throw new AppError(404, 'BUSINESS_NOT_FOUND', 'Business record not found.');
    }

    const beforeDTO = mapBusinessRowToDTO(existing);

    const updatedRes = await client.query<BusinessRow>(
      `UPDATE businesses
       SET legal_name = $2,
           trading_name = $3,
           business_category = $4,
           registration_number = $5,
           tax_id = $6,
           primary_email = $7,
           primary_phone = $8,
           country_code = $9,
           timezone = $10,
           address_line_1 = $11,
           city = $12,
           logo_storage_path = $13,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        businessId,
        updates.legalName !== undefined ? updates.legalName.trim() : existing.legal_name,
        updates.tradingName !== undefined
          ? updates.tradingName?.trim() ?? null
          : existing.trading_name,
        updates.businessCategory !== undefined
          ? updates.businessCategory.trim()
          : existing.business_category,
        updates.registrationNumber !== undefined
          ? updates.registrationNumber?.trim() ?? null
          : existing.registration_number,
        updates.taxId !== undefined ? updates.taxId?.trim() ?? null : existing.tax_id,
        updates.primaryEmail !== undefined
          ? updates.primaryEmail.trim().toLowerCase()
          : existing.primary_email,
        updates.primaryPhone !== undefined ? updates.primaryPhone.trim() : existing.primary_phone,
        updates.countryCode !== undefined
          ? updates.countryCode.trim().toUpperCase()
          : existing.country_code,
        updates.timezone !== undefined ? updates.timezone.trim() : existing.timezone,
        updates.addressLine1 !== undefined
          ? updates.addressLine1?.trim() ?? null
          : existing.address_line_1,
        updates.city !== undefined ? updates.city?.trim() ?? null : existing.city,
        updates.logoStoragePath !== undefined
          ? updates.logoStoragePath
          : existing.logo_storage_path,
      ]
    );

    const updatedRow = updatedRes.rows[0];
    if (!updatedRow) {
      throw new AppError(500, 'BUSINESS_UPDATE_FAILED', 'Failed to update business profile.');
    }

    const afterDTO = mapBusinessRowToDTO(updatedRow);

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
       VALUES ($1, $2, $3, 'BUSINESS_PROFILE_UPDATED', 'BUSINESS', $1, $4, $5, $6, $7, $8)`,
      [
        businessId,
        actorUserId,
        actorPlatformRole,
        auditMeta.requestId,
        auditMeta.ipAddress,
        auditMeta.userAgent,
        JSON.stringify(beforeDTO),
        JSON.stringify(afterDTO),
      ]
    );

    return afterDTO;
  });
}

/**
 * Updates a business's operational settings (`settings_json`) inside a tenant-scoped transaction
 * and records an immutable audit log entry.
 */
export async function updateTenantBusinessSettings(
  businessId: UUID,
  actorUserId: UUID,
  actorPlatformRole: PlatformRole,
  updates: UpdateBusinessSettingsRequestDTO,
  auditMeta: RequestAuditMetadata
): Promise<BusinessOperationalSettingsDTO> {
  return withTenantTransaction({ businessId, actorUserId }, async (client) => {
    const existingRes = await client.query<BusinessRow>(
      `SELECT * FROM businesses WHERE id = $1 FOR UPDATE`,
      [businessId]
    );
    const existing = existingRes.rows[0];
    if (!existing) {
      throw new AppError(404, 'BUSINESS_NOT_FOUND', 'Business record not found.');
    }

    const currentSettings = normalizeOperationalSettings(existing.settings_json);
    const nextSettings: BusinessOperationalSettingsDTO = {
      loanNumberPrefix: updates.loanNumberPrefix ?? currentSettings.loanNumberPrefix,
      customerNumberPrefix: updates.customerNumberPrefix ?? currentSettings.customerNumberPrefix,
      receiptNumberPrefix: updates.receiptNumberPrefix ?? currentSettings.receiptNumberPrefix,
      defaultGracePeriodDays:
        updates.defaultGracePeriodDays ?? currentSettings.defaultGracePeriodDays,
      requireDualApprovalForLoans:
        updates.requireDualApprovalForLoans ?? currentSettings.requireDualApprovalForLoans,
      allowPartialInstallmentPayments:
        updates.allowPartialInstallmentPayments ?? currentSettings.allowPartialInstallmentPayments,
      statementFooterNote: updates.statementFooterNote ?? currentSettings.statementFooterNote,
    };

    await client.query(
      `UPDATE businesses
       SET settings_json = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [businessId, JSON.stringify(nextSettings)]
    );

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
       VALUES ($1, $2, $3, 'BUSINESS_SETTINGS_UPDATED', 'BUSINESS_SETTINGS', $1, $4, $5, $6, $7, $8)`,
      [
        businessId,
        actorUserId,
        actorPlatformRole,
        auditMeta.requestId,
        auditMeta.ipAddress,
        auditMeta.userAgent,
        JSON.stringify(currentSettings),
        JSON.stringify(nextSettings),
      ]
    );

    return nextSettings;
  });
}
