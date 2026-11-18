import {
  CreateCustomerDocumentRequestDTO,
  CreateCustomerRequestDTO,
  CustomerDetailsResponseDTO,
  CustomerDocumentDTO,
  CustomerDTO,
  CustomerRiskTier,
  PlatformRole,
  UpdateCustomerRequestDTO,
  UUID,
} from '@flotech/shared';
import { withTenantTransaction } from '../database/pool.js';
import { toStorageMoney } from '../financial/decimalEngine.js';
import { AppError } from '../middleware/errorHandler.js';
import { listTenantLoans } from './loanManagementService.js';

interface CustomerRow {
  id: UUID;
  business_id: UUID;
  customer_number: string;
  first_name: string;
  last_name: string;
  business_name: string | null;
  email: string | null;
  phone_number: string;
  national_id_number: string | null;
  date_of_birth: Date | string | null;
  address_line_1: string | null;
  city: string | null;
  employment_status: string | null;
  monthly_income: string | null;
  credit_score_internal: number | null;
  risk_tier: CustomerRiskTier;
  is_archived: boolean;
  document_count: string | number;
  verified_document_count: string | number;
  created_by_user_id: UUID;
  created_at: Date | string;
  updated_at: Date | string;
}

interface CustomerDocumentRow {
  id: UUID;
  business_id: UUID;
  customer_id: UUID;
  document_type: string;
  file_name: string;
  firebase_storage_path: string;
  mime_type: string;
  file_size_bytes: string | number;
  verified_at: Date | string | null;
  verified_by_user_id: UUID | null;
  uploaded_by_user_id: UUID;
  created_at: Date | string;
}

export interface ListTenantCustomersFilters {
  q?: string;
  riskTier?: CustomerRiskTier;
  includeArchived?: boolean;
}

function toIsoTimestamp(val: Date | string): string {
  return val instanceof Date ? val.toISOString() : String(val);
}

function toNullableIsoTimestamp(val: Date | string | null): string | null {
  if (!val) return null;
  return val instanceof Date ? val.toISOString() : String(val);
}

function toNullableDateOnlyString(val: Date | string | null): string | null {
  if (!val) return null;
  if (val instanceof Date) {
    return val.toISOString().slice(0, 10);
  }
  return String(val).slice(0, 10);
}

function mapCustomerRowToDTO(row: CustomerRow): CustomerDTO {
  return {
    id: row.id,
    businessId: row.business_id,
    customerNumber: row.customer_number,
    firstName: row.first_name,
    lastName: row.last_name,
    businessName: row.business_name,
    email: row.email,
    phoneNumber: row.phone_number,
    nationalIdNumber: row.national_id_number,
    dateOfBirth: toNullableDateOnlyString(row.date_of_birth),
    addressLine1: row.address_line_1,
    city: row.city,
    employmentStatus: row.employment_status,
    monthlyIncome: row.monthly_income !== null ? toStorageMoney(row.monthly_income) : null,
    creditScoreInternal: row.credit_score_internal,
    riskTier: row.risk_tier,
    isArchived: row.is_archived,
    documentCount: Number(row.document_count ?? 0),
    verifiedDocumentCount: Number(row.verified_document_count ?? 0),
    createdByUserId: row.created_by_user_id,
    createdAt: toIsoTimestamp(row.created_at),
    updatedAt: toIsoTimestamp(row.updated_at),
  };
}

function mapCustomerDocumentRowToDTO(row: CustomerDocumentRow): CustomerDocumentDTO {
  return {
    id: row.id,
    businessId: row.business_id,
    customerId: row.customer_id,
    documentType: row.document_type,
    fileName: row.file_name,
    firebaseStoragePath: row.firebase_storage_path,
    mimeType: row.mime_type,
    fileSizeBytes: Number(row.file_size_bytes),
    verifiedAt: toNullableIsoTimestamp(row.verified_at),
    verifiedByUserId: row.verified_by_user_id,
    uploadedByUserId: row.uploaded_by_user_id,
    createdAt: toIsoTimestamp(row.created_at),
  };
}

/**
 * Lists customers for a tenant business with optional search, risk-tier filter, and archived filter.
 */
export async function listTenantCustomers(
  businessId: UUID,
  actorUserId: UUID,
  filters: ListTenantCustomersFilters = {}
): Promise<CustomerDTO[]> {
  return withTenantTransaction(
    { businessId, actorUserId, isSuperAdmin: false },
    async (client) => {
      const params: unknown[] = [businessId];
      const conditions: string[] = ['c.business_id = $1'];

      if (!filters.includeArchived) {
        conditions.push('c.is_archived = FALSE');
      }

      if (filters.riskTier) {
        params.push(filters.riskTier);
        conditions.push(`c.risk_tier = $${params.length}`);
      }

      if (filters.q && filters.q.trim().length > 0) {
        params.push(`%${filters.q.trim()}%`);
        const idx = params.length;
        conditions.push(
          `(
            c.customer_number ILIKE $${idx}
            OR c.first_name ILIKE $${idx}
            OR c.last_name ILIKE $${idx}
            OR (c.first_name || ' ' || c.last_name) ILIKE $${idx}
            OR COALESCE(c.business_name, '') ILIKE $${idx}
            OR COALESCE(c.email, '') ILIKE $${idx}
            OR c.phone_number ILIKE $${idx}
            OR COALESCE(c.national_id_number, '') ILIKE $${idx}
          )`
        );
      }

      const res = await client.query<CustomerRow>(
        `SELECT
           c.*,
           COUNT(cd.id)::int AS document_count,
           COUNT(cd.id) FILTER (WHERE cd.verified_at IS NOT NULL)::int AS verified_document_count
         FROM customers c
         LEFT JOIN customer_documents cd
           ON cd.business_id = c.business_id AND cd.customer_id = c.id
         WHERE ${conditions.join(' AND ')}
         GROUP BY c.id
         ORDER BY c.is_archived ASC, c.created_at DESC`,
        params
      );

      return res.rows.map(mapCustomerRowToDTO);
    }
  );
}

/**
 * Fetches a single tenant customer and all of their KYC documents.
 */
export async function getTenantCustomerDetails(
  businessId: UUID,
  customerId: UUID,
  actorUserId: UUID
): Promise<CustomerDetailsResponseDTO> {
  return withTenantTransaction(
    { businessId, actorUserId, isSuperAdmin: false },
    async (client) => {
      const customerRes = await client.query<CustomerRow>(
        `SELECT
           c.*,
           COUNT(cd.id)::int AS document_count,
           COUNT(cd.id) FILTER (WHERE cd.verified_at IS NOT NULL)::int AS verified_document_count
         FROM customers c
         LEFT JOIN customer_documents cd
           ON cd.business_id = c.business_id AND cd.customer_id = c.id
         WHERE c.business_id = $1 AND c.id = $2
         GROUP BY c.id`,
        [businessId, customerId]
      );

      const customerRow = customerRes.rows[0];
      if (!customerRow) {
        throw new AppError(404, 'CUSTOMER_NOT_FOUND', 'Customer was not found in this business.');
      }

      const docsRes = await client.query<CustomerDocumentRow>(
        `SELECT *
         FROM customer_documents
         WHERE business_id = $1 AND customer_id = $2
         ORDER BY created_at DESC`,
        [businessId, customerId]
      );

      const loans = await listTenantLoans(businessId, actorUserId, { customerId });

      return {
        customer: mapCustomerRowToDTO(customerRow),
        documents: docsRes.rows.map(mapCustomerDocumentRowToDTO),
        loans,
      };
    }
  );
}

/**
 * Creates a new customer in the tenant business, enforcing subscription `max_customers` quota,
 * sequential `customer_number` generation from the tenant's `customerNumberPrefix`, and
 * `NUMERIC(19, 4)` decimal storage for `monthly_income`.
 */
export async function createTenantCustomer(
  businessId: UUID,
  actorUserId: UUID,
  actorPlatformRole: PlatformRole,
  input: CreateCustomerRequestDTO,
  auditMeta: { ipAddress: string | null; userAgent: string | null }
): Promise<CustomerDTO> {
  return withTenantTransaction(
    { businessId, actorUserId, isSuperAdmin: false },
    async (client) => {
      // 1. Lock the business row to serialize sequential customer number generation and quota checks
      const bizRes = await client.query<{ settings_json: Record<string, unknown> }>(
        `SELECT settings_json FROM businesses WHERE id = $1 FOR UPDATE`,
        [businessId]
      );
      const bizRow = bizRes.rows[0];
      if (!bizRow) {
        throw new AppError(404, 'BUSINESS_NOT_FOUND', 'Business tenant was not found.');
      }

      // 2. Enforce active subscription status and customer quota (`max_customers`)
      const subRes = await client.query<{
        status: string;
        current_period_end: Date | string;
        cancel_at_period_end: boolean;
        max_customers: number;
      }>(
        `SELECT bs.status, bs.current_period_end, bs.cancel_at_period_end, sp.max_customers
         FROM business_subscriptions bs
         JOIN subscription_plans sp ON sp.id = bs.plan_id
         WHERE bs.business_id = $1
         ORDER BY bs.created_at DESC
         LIMIT 1`,
        [businessId]
      );

      const subRow = subRes.rows[0];
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
            `Your business subscription is currently ${isExpiredByDate ? 'EXPIRED' : subRow.status}. Please renew or upgrade your plan to register new customers.`
          );
        }
      }

      const maxCustomers = subRow?.max_customers ?? 1000;
      const activeCountRes = await client.query<{ active_count: number }>(
        `SELECT COUNT(*)::int AS active_count
         FROM customers
         WHERE business_id = $1 AND is_archived = FALSE`,
        [businessId]
      );
      const currentActiveCount = activeCountRes.rows[0]?.active_count ?? 0;

      if (currentActiveCount >= maxCustomers) {
        throw new AppError(
          403,
          'SUBSCRIPTION_CUSTOMER_QUOTA_EXCEEDED',
          `Your current subscription plan allows up to ${maxCustomers} active customers.`
        );
      }

      // 3. Generate sequential customer number using the business's configured prefix
      const rawPrefix = bizRow.settings_json?.customerNumberPrefix;
      const prefix =
        typeof rawPrefix === 'string' && rawPrefix.trim().length >= 2
          ? rawPrefix.trim().toUpperCase()
          : 'CUST-';
      const normalizedPrefix = prefix.endsWith('-') ? prefix : `${prefix}-`;

      const totalCountRes = await client.query<{ total_count: number }>(
        `SELECT COUNT(*)::int AS total_count FROM customers WHERE business_id = $1`,
        [businessId]
      );
      let nextSeq = (totalCountRes.rows[0]?.total_count ?? 0) + 1;
      let customerNumber = `${normalizedPrefix}${String(nextSeq).padStart(5, '0')}`;

      // Guard against collision if prefix changed previously
      while (true) {
        const collisionRes = await client.query(
          `SELECT 1 FROM customers WHERE business_id = $1 AND customer_number = $2`,
          [businessId, customerNumber]
        );
        if (collisionRes.rowCount === 0) break;
        nextSeq += 1;
        customerNumber = `${normalizedPrefix}${String(nextSeq).padStart(5, '0')}`;
      }

      const formattedMonthlyIncome =
        input.monthlyIncome !== undefined && input.monthlyIncome !== null
          ? toStorageMoney(input.monthlyIncome)
          : null;

      const insertRes = await client.query<CustomerRow>(
        `INSERT INTO customers (
           business_id,
           customer_number,
           first_name,
           last_name,
           business_name,
           email,
           phone_number,
           national_id_number,
           date_of_birth,
           address_line_1,
           city,
           employment_status,
           monthly_income,
           credit_score_internal,
           risk_tier,
           is_archived,
           created_by_user_id
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, FALSE, $16)
         RETURNING *, 0 AS document_count, 0 AS verified_document_count`,
        [
          businessId,
          customerNumber,
          input.firstName.trim(),
          input.lastName.trim(),
          input.businessName ?? null,
          input.email ? input.email.toLowerCase().trim() : null,
          input.phoneNumber.trim(),
          input.nationalIdNumber ?? null,
          input.dateOfBirth ?? null,
          input.addressLine1 ?? null,
          input.city ?? null,
          input.employmentStatus ?? null,
          formattedMonthlyIncome,
          input.creditScoreInternal ?? null,
          input.riskTier ?? 'STANDARD',
          actorUserId,
        ]
      );

      const created = insertRes.rows[0]!;

      await client.query(
        `INSERT INTO audit_logs (
           business_id, actor_user_id, actor_platform_role, action, entity_type, entity_id, after_state, ip_address, user_agent
         )
         VALUES ($1, $2, $3, 'CUSTOMER_CREATED', 'customers', $4, $5::jsonb, $6, $7)`,
        [
          businessId,
          actorUserId,
          actorPlatformRole,
          created.id,
          JSON.stringify({
            customerNumber: created.customer_number,
            firstName: created.first_name,
            lastName: created.last_name,
            riskTier: created.risk_tier,
            monthlyIncome: formattedMonthlyIncome,
          }),
          auditMeta.ipAddress,
          auditMeta.userAgent,
        ]
      );

      return mapCustomerRowToDTO(created);
    }
  );
}

/**
 * Updates a tenant customer's profile, risk tier, income, or archive status.
 */
export async function updateTenantCustomer(
  businessId: UUID,
  customerId: UUID,
  actorUserId: UUID,
  actorPlatformRole: PlatformRole,
  updates: UpdateCustomerRequestDTO,
  auditMeta: { ipAddress: string | null; userAgent: string | null }
): Promise<CustomerDTO> {
  return withTenantTransaction(
    { businessId, actorUserId, isSuperAdmin: false },
    async (client) => {
      const existingRes = await client.query<CustomerRow>(
        `SELECT * FROM customers WHERE business_id = $1 AND id = $2 FOR UPDATE`,
        [businessId, customerId]
      );
      const existing = existingRes.rows[0];
      if (!existing) {
        throw new AppError(404, 'CUSTOMER_NOT_FOUND', 'Customer was not found in this business.');
      }

      const nextFirstName =
        updates.firstName !== undefined ? updates.firstName.trim() : existing.first_name;
      const nextLastName =
        updates.lastName !== undefined ? updates.lastName.trim() : existing.last_name;
      const nextBusinessName =
        updates.businessName !== undefined ? updates.businessName : existing.business_name;
      const nextEmail =
        updates.email !== undefined
          ? updates.email
            ? updates.email.toLowerCase().trim()
            : null
          : existing.email;
      const nextPhone =
        updates.phoneNumber !== undefined ? updates.phoneNumber.trim() : existing.phone_number;
      const nextNationalId =
        updates.nationalIdNumber !== undefined
          ? updates.nationalIdNumber
          : existing.national_id_number;
      const nextDob =
        updates.dateOfBirth !== undefined
          ? updates.dateOfBirth
          : toNullableDateOnlyString(existing.date_of_birth);
      const nextAddress =
        updates.addressLine1 !== undefined ? updates.addressLine1 : existing.address_line_1;
      const nextCity = updates.city !== undefined ? updates.city : existing.city;
      const nextEmployment =
        updates.employmentStatus !== undefined
          ? updates.employmentStatus
          : existing.employment_status;
      const nextMonthlyIncome =
        updates.monthlyIncome !== undefined
          ? updates.monthlyIncome !== null
            ? toStorageMoney(updates.monthlyIncome)
            : null
          : existing.monthly_income !== null
            ? toStorageMoney(existing.monthly_income)
            : null;
      const nextCreditScore =
        updates.creditScoreInternal !== undefined
          ? updates.creditScoreInternal
          : existing.credit_score_internal;
      const nextRiskTier =
        updates.riskTier !== undefined ? updates.riskTier : existing.risk_tier;
      const nextIsArchived =
        updates.isArchived !== undefined ? updates.isArchived : existing.is_archived;

      await client.query(
        `UPDATE customers
         SET first_name = $3,
             last_name = $4,
             business_name = $5,
             email = $6,
             phone_number = $7,
             national_id_number = $8,
             date_of_birth = $9,
             address_line_1 = $10,
             city = $11,
             employment_status = $12,
             monthly_income = $13,
             credit_score_internal = $14,
             risk_tier = $15,
             is_archived = $16,
             updated_at = NOW()
         WHERE business_id = $1 AND id = $2`,
        [
          businessId,
          customerId,
          nextFirstName,
          nextLastName,
          nextBusinessName,
          nextEmail,
          nextPhone,
          nextNationalId,
          nextDob,
          nextAddress,
          nextCity,
          nextEmployment,
          nextMonthlyIncome,
          nextCreditScore,
          nextRiskTier,
          nextIsArchived,
        ]
      );

      const actionName =
        updates.isArchived === true && !existing.is_archived
          ? 'CUSTOMER_ARCHIVED'
          : updates.isArchived === false && existing.is_archived
            ? 'CUSTOMER_RESTORED'
            : 'CUSTOMER_UPDATED';

      await client.query(
        `INSERT INTO audit_logs (
           business_id, actor_user_id, actor_platform_role, action, entity_type, entity_id, before_state, after_state, ip_address, user_agent
         )
         VALUES ($1, $2, $3, $4, 'customers', $5, $6::jsonb, $7::jsonb, $8, $9)`,
        [
          businessId,
          actorUserId,
          actorPlatformRole,
          actionName,
          customerId,
          JSON.stringify({
            riskTier: existing.risk_tier,
            isArchived: existing.is_archived,
            monthlyIncome: existing.monthly_income,
          }),
          JSON.stringify({
            customerNumber: existing.customer_number,
            updatedFields: Object.keys(updates),
            riskTier: nextRiskTier,
            isArchived: nextIsArchived,
            monthlyIncome: nextMonthlyIncome,
          }),
          auditMeta.ipAddress,
          auditMeta.userAgent,
        ]
      );

      const refreshedRes = await client.query<CustomerRow>(
        `SELECT
           c.*,
           COUNT(cd.id)::int AS document_count,
           COUNT(cd.id) FILTER (WHERE cd.verified_at IS NOT NULL)::int AS verified_document_count
         FROM customers c
         LEFT JOIN customer_documents cd
           ON cd.business_id = c.business_id AND cd.customer_id = c.id
         WHERE c.business_id = $1 AND c.id = $2
         GROUP BY c.id`,
        [businessId, customerId]
      );

      return mapCustomerRowToDTO(refreshedRes.rows[0]!);
    }
  );
}

/**
 * Registers a KYC document metadata record for a tenant customer.
 * Enforces that `firebaseStoragePath` starts with `businesses/<businessId>/customers/<customerId>/kyc/`.
 */
export async function addCustomerKycDocument(
  businessId: UUID,
  customerId: UUID,
  actorUserId: UUID,
  actorPlatformRole: PlatformRole,
  input: CreateCustomerDocumentRequestDTO,
  auditMeta: { ipAddress: string | null; userAgent: string | null }
): Promise<CustomerDocumentDTO> {
  const expectedPrefix = `businesses/${businessId}/customers/${customerId}/kyc/`;
  if (!input.firebaseStoragePath.startsWith(expectedPrefix)) {
    throw new AppError(
      403,
      'KYC_STORAGE_PATH_VIOLATION',
      `KYC document storage path must reside inside ${expectedPrefix}<filename>.`
    );
  }

  return withTenantTransaction(
    { businessId, actorUserId, isSuperAdmin: false },
    async (client) => {
      const custRes = await client.query<{ id: UUID; customer_number: string }>(
        `SELECT id, customer_number FROM customers WHERE business_id = $1 AND id = $2`,
        [businessId, customerId]
      );
      if (custRes.rowCount === 0) {
        throw new AppError(404, 'CUSTOMER_NOT_FOUND', 'Customer was not found in this business.');
      }

      const insertRes = await client.query<CustomerDocumentRow>(
        `INSERT INTO customer_documents (
           business_id,
           customer_id,
           document_type,
           file_name,
           firebase_storage_path,
           mime_type,
           file_size_bytes,
           uploaded_by_user_id
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          businessId,
          customerId,
          input.documentType.trim().toUpperCase(),
          input.fileName.trim(),
          input.firebaseStoragePath.trim(),
          input.mimeType.trim(),
          input.fileSizeBytes,
          actorUserId,
        ]
      );

      const docRow = insertRes.rows[0]!;

      await client.query(
        `INSERT INTO audit_logs (
           business_id, actor_user_id, actor_platform_role, action, entity_type, entity_id, after_state, ip_address, user_agent
         )
         VALUES ($1, $2, $3, 'CUSTOMER_KYC_DOCUMENT_ADDED', 'customer_documents', $4, $5::jsonb, $6, $7)`,
        [
          businessId,
          actorUserId,
          actorPlatformRole,
          docRow.id,
          JSON.stringify({
            customerId,
            documentType: docRow.document_type,
            fileName: docRow.file_name,
            firebaseStoragePath: docRow.firebase_storage_path,
          }),
          auditMeta.ipAddress,
          auditMeta.userAgent,
        ]
      );

      return mapCustomerDocumentRowToDTO(docRow);
    }
  );
}

/**
 * Marks a customer KYC document as verified by the current authenticated staff member.
 */
export async function verifyCustomerKycDocument(
  businessId: UUID,
  customerId: UUID,
  documentId: UUID,
  actorUserId: UUID,
  actorPlatformRole: PlatformRole,
  auditMeta: { ipAddress: string | null; userAgent: string | null }
): Promise<CustomerDocumentDTO> {
  return withTenantTransaction(
    { businessId, actorUserId, isSuperAdmin: false },
    async (client) => {
      const updateRes = await client.query<CustomerDocumentRow>(
        `UPDATE customer_documents
         SET verified_at = COALESCE(verified_at, NOW()),
             verified_by_user_id = COALESCE(verified_by_user_id, $4)
         WHERE business_id = $1
           AND customer_id = $2
           AND id = $3
         RETURNING *`,
        [businessId, customerId, documentId, actorUserId]
      );

      const docRow = updateRes.rows[0];
      if (!docRow) {
        throw new AppError(
          404,
          'KYC_DOCUMENT_NOT_FOUND',
          'KYC document was not found for this customer.'
        );
      }

      await client.query(
        `INSERT INTO audit_logs (
           business_id, actor_user_id, actor_platform_role, action, entity_type, entity_id, after_state, ip_address, user_agent
         )
         VALUES ($1, $2, $3, 'CUSTOMER_KYC_DOCUMENT_VERIFIED', 'customer_documents', $4, $5::jsonb, $6, $7)`,
        [
          businessId,
          actorUserId,
          actorPlatformRole,
          docRow.id,
          JSON.stringify({
            customerId,
            documentType: docRow.document_type,
            verifiedByUserId: actorUserId,
          }),
          auditMeta.ipAddress,
          auditMeta.userAgent,
        ]
      );

      return mapCustomerDocumentRowToDTO(docRow);
    }
  );
}
