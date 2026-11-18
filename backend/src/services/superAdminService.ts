import {
  AuditLogEntryDTO,
  BusinessStatus,
  PlatformRole,
  PlatformSettingItemDTO,
  SubscriptionPlanCatalogDTO,
  SubscriptionStatus,
  SuperAdminAssignSubscriptionRequestDTO,
  SuperAdminBroadcastNotificationRequestDTO,
  SuperAdminBusinessSummaryDTO,
  SuperAdminGlobalKpisDTO,
  SuperAdminRevenueAnalyticsDTO,
  SuperAdminSubscriptionRecordDTO,
  SuperAdminUpdateBusinessStatusRequestDTO,
  SuperAdminUpdatePlatformSettingRequestDTO,
  SuperAdminUpdateUserStatusRequestDTO,
  SuperAdminUpsertPlanRequestDTO,
  SuperAdminUserDirectoryItemDTO,
  UUID,
} from '@flotech/shared';
import { withTenantTransaction } from '../database/pool.js';
import {
  FinancialDecimal,
  roundCurrencyUnit,
  toStorageMoney,
} from '../financial/decimalEngine.js';
import { AppError } from '../middleware/errorHandler.js';

function toIsoTimestamp(val: Date | string): string {
  return val instanceof Date ? val.toISOString() : String(val);
}

function toNullableIsoTimestamp(val: Date | string | null): string | null {
  if (!val) return null;
  return val instanceof Date ? val.toISOString() : String(val);
}

/**
 * Computes FloTech Digital Global Super Admin KPIs from real PostgreSQL platform data.
 */
export async function getSuperAdminGlobalKpis(
  actorUserId: UUID
): Promise<SuperAdminGlobalKpisDTO> {
  return withTenantTransaction(
    { businessId: null, actorUserId, isSuperAdmin: true },
    async (client) => {
      const bizAggRes = await client.query<{
        total_businesses: number;
        active_businesses: number;
        pending_businesses: number;
        suspended_businesses: number;
      }>(
        `SELECT
           COUNT(*)::int AS total_businesses,
           COUNT(*) FILTER (WHERE status = 'ACTIVE')::int AS active_businesses,
           COUNT(*) FILTER (WHERE status = 'PENDING_VERIFICATION')::int AS pending_businesses,
           COUNT(*) FILTER (WHERE status = 'SUSPENDED')::int AS suspended_businesses
         FROM businesses`
      );
      const bizAgg = bizAggRes.rows[0]!;

      const usersRes = await client.query<{ total_users: number }>(
        `SELECT COUNT(*)::int AS total_users FROM users`
      );
      const totalUsers = usersRes.rows[0]?.total_users ?? 0;

      // Latest subscription per business
      const subsRes = await client.query<{
        status: SubscriptionStatus;
        billing_cycle: 'MONTHLY' | 'ANNUAL';
        unit_price: string;
      }>(
        `SELECT DISTINCT ON (business_id)
           status,
           billing_cycle,
           unit_price
         FROM business_subscriptions
         ORDER BY business_id, created_at DESC`
      );

      let activeSubs = 0;
      let trialSubs = 0;
      let mrrDec = new FinancialDecimal(0);

      for (const s of subsRes.rows) {
        if (s.status === SubscriptionStatus.ACTIVE) {
          activeSubs += 1;
          const priceDec = new FinancialDecimal(s.unit_price);
          const monthlyContribution =
            s.billing_cycle === 'ANNUAL' ? priceDec.div(12) : priceDec;
          mrrDec = mrrDec.plus(monthlyContribution);
        } else if (s.status === SubscriptionStatus.TRIALING) {
          trialSubs += 1;
        }
      }

      const roundedMrrDec = roundCurrencyUnit(mrrDec);
      const arrDec = roundCurrencyUnit(roundedMrrDec.mul(12));

      const loansGlobalRes = await client.query<{
        active_loans_count: number;
        disbursed_volume: string;
      }>(
        `SELECT
           COUNT(*) FILTER (WHERE status IN ('ACTIVE', 'OVERDUE', 'RESTRUCTURED'))::int AS active_loans_count,
           COALESCE(SUM(principal_amount) FILTER (WHERE status IN ('ACTIVE', 'OVERDUE', 'RESTRUCTURED', 'CLOSED_PAID', 'DEFAULTED', 'WRITTEN_OFF')), 0)::text AS disbursed_volume
         FROM loans`
      );
      const loansGlobal = loansGlobalRes.rows[0]!;

      return {
        totalBusinesses: Number(bizAgg.total_businesses),
        activeBusinesses: Number(bizAgg.active_businesses),
        pendingVerificationBusinesses: Number(bizAgg.pending_businesses),
        suspendedBusinesses: Number(bizAgg.suspended_businesses),
        totalPlatformUsers: Number(totalUsers),
        activeSubscriptionsCount: activeSubs,
        trialSubscriptionsCount: trialSubs,
        monthlyRecurringRevenueUsd: toStorageMoney(roundedMrrDec),
        annualizedRunRateUsd: toStorageMoney(arrDec),
        globalActiveLoansCount: Number(loansGlobal.active_loans_count),
        globalDisbursedPrincipalVolume: toStorageMoney(loansGlobal.disbursed_volume),
      };
    }
  );
}

/**
 * Lists all tenant businesses across the platform with membership, customer, active loan, and subscription summary.
 */
export async function listSuperAdminBusinesses(
  actorUserId: UUID,
  filters?: { status?: BusinessStatus; q?: string }
): Promise<SuperAdminBusinessSummaryDTO[]> {
  return withTenantTransaction(
    { businessId: null, actorUserId, isSuperAdmin: true },
    async (client) => {
      const conditions: string[] = ['1 = 1'];
      const params: unknown[] = [];

      if (filters?.status) {
        params.push(filters.status);
        conditions.push(`b.status = $${params.length}`);
      }

      if (filters?.q && filters.q.trim().length > 0) {
        params.push(`%${filters.q.trim()}%`);
        conditions.push(
          `(b.legal_name ILIKE $${params.length} OR b.business_code ILIKE $${params.length} OR b.primary_email ILIKE $${params.length})`
        );
      }

      const res = await client.query<{
        id: UUID;
        business_code: string;
        legal_name: string;
        trading_name: string | null;
        business_category: string;
        primary_email: string;
        primary_phone: string;
        country_code: string;
        currency_code: string;
        status: BusinessStatus;
        owner_user_id: UUID;
        owner_full_name: string;
        owner_email: string;
        member_count: number;
        customer_count: number;
        active_loan_count: number;
        subscription_plan_code: string | null;
        subscription_status: SubscriptionStatus | null;
        created_at: Date | string;
      }>(
        `SELECT
           b.id,
           b.business_code,
           b.legal_name,
           b.trading_name,
           b.business_category,
           b.primary_email,
           b.primary_phone,
           b.country_code,
           b.currency_code,
           b.status,
           b.owner_user_id,
           u.full_name AS owner_full_name,
           u.email AS owner_email,
           (SELECT COUNT(*)::int FROM business_memberships bm WHERE bm.business_id = b.id AND bm.status = 'ACTIVE') AS member_count,
           (SELECT COUNT(*)::int FROM customers c WHERE c.business_id = b.id AND c.is_archived = FALSE) AS customer_count,
           (SELECT COUNT(*)::int FROM loans l WHERE l.business_id = b.id AND l.status IN ('ACTIVE', 'OVERDUE', 'RESTRUCTURED')) AS active_loan_count,
           latest_sub.plan_code AS subscription_plan_code,
           latest_sub.status AS subscription_status,
           b.created_at
         FROM businesses b
         JOIN users u ON u.id = b.owner_user_id
         LEFT JOIN LATERAL (
           SELECT sp.code AS plan_code, bs.status
           FROM business_subscriptions bs
           JOIN subscription_plans sp ON sp.id = bs.plan_id
           WHERE bs.business_id = b.id
           ORDER BY bs.created_at DESC
           LIMIT 1
         ) latest_sub ON TRUE
         WHERE ${conditions.join(' AND ')}
         ORDER BY b.created_at DESC`,
        params
      );

      return res.rows.map((r) => ({
        id: r.id,
        businessCode: r.business_code,
        legalName: r.legal_name,
        tradingName: r.trading_name,
        businessCategory: r.business_category,
        primaryEmail: r.primary_email,
        primaryPhone: r.primary_phone,
        countryCode: r.country_code,
        currencyCode: r.currency_code,
        status: r.status,
        ownerUserId: r.owner_user_id,
        ownerFullName: r.owner_full_name,
        ownerEmail: r.owner_email,
        memberCount: Number(r.member_count),
        customerCount: Number(r.customer_count),
        activeLoanCount: Number(r.active_loan_count),
        subscriptionPlanCode: r.subscription_plan_code,
        subscriptionStatus: r.subscription_status,
        createdAt: toIsoTimestamp(r.created_at),
      }));
    }
  );
}

/**
 * Updates a tenant business's governance status (`PENDING_VERIFICATION`, `ACTIVE`, `SUSPENDED`, `ARCHIVED`)
 * and logs an immutable Super Admin audit record.
 */
export async function updateSuperAdminBusinessStatus(
  actorUserId: UUID,
  businessId: UUID,
  input: SuperAdminUpdateBusinessStatusRequestDTO,
  auditMeta: { ipAddress: string | null; userAgent: string | null }
): Promise<SuperAdminBusinessSummaryDTO> {
  await withTenantTransaction(
    { businessId: null, actorUserId, isSuperAdmin: true },
    async (client) => {
      const existingRes = await client.query<{ id: UUID; status: BusinessStatus }>(
        `SELECT id, status FROM businesses WHERE id = $1 FOR UPDATE`,
        [businessId]
      );
      const existing = existingRes.rows[0];
      if (!existing) {
        throw new AppError(404, 'BUSINESS_NOT_FOUND', 'Target business was not found.');
      }

      await client.query(
        `UPDATE businesses
         SET status = $2,
             updated_at = NOW()
         WHERE id = $1`,
        [businessId, input.status]
      );

      await client.query(
        `INSERT INTO audit_logs (
           business_id, actor_user_id, actor_platform_role, action, entity_type, entity_id, before_state, after_state, ip_address, user_agent
         )
         VALUES ($1, $2, 'SUPER_ADMIN', 'SUPER_ADMIN_BUSINESS_STATUS_UPDATED', 'businesses', $1, $3::jsonb, $4::jsonb, $5, $6)`,
        [
          businessId,
          actorUserId,
          JSON.stringify({ status: existing.status }),
          JSON.stringify({ status: input.status, reason: input.reason }),
          auditMeta.ipAddress,
          auditMeta.userAgent,
        ]
      );
    }
  );

  const list = await listSuperAdminBusinesses(actorUserId);
  const updated = list.find((b) => b.id === businessId);
  if (!updated) {
    throw new AppError(404, 'BUSINESS_NOT_FOUND', 'Updated business was not found.');
  }
  return updated;
}

/**
 * Lists all platform users across FloTech Digital (`SUPER_ADMIN` only).
 */
export async function listSuperAdminUsers(
  actorUserId: UUID,
  q?: string
): Promise<SuperAdminUserDirectoryItemDTO[]> {
  return withTenantTransaction(
    { businessId: null, actorUserId, isSuperAdmin: true },
    async (client) => {
      const params: unknown[] = [];
      let whereClause = '';
      if (q && q.trim().length > 0) {
        params.push(`%${q.trim()}%`);
        whereClause = `WHERE u.email ILIKE $1 OR u.full_name ILIKE $1`;
      }

      const res = await client.query<{
        id: UUID;
        firebase_uid: string;
        email: string;
        full_name: string;
        phone_number: string | null;
        platform_role: PlatformRole;
        is_active: boolean;
        memberships_count: number;
        last_login_at: Date | string | null;
        created_at: Date | string;
      }>(
        `SELECT
           u.id,
           u.firebase_uid,
           u.email,
           u.full_name,
           u.phone_number,
           u.platform_role,
           u.is_active,
           (SELECT COUNT(*)::int FROM business_memberships bm WHERE bm.user_id = u.id) AS memberships_count,
           u.last_login_at,
           u.created_at
         FROM users u
         ${whereClause}
         ORDER BY u.created_at DESC`,
        params
      );

      return res.rows.map((r) => ({
        id: r.id,
        firebaseUid: r.firebase_uid,
        email: r.email,
        fullName: r.full_name,
        phoneNumber: r.phone_number,
        platformRole: r.platform_role,
        isActive: r.is_active,
        businessMembershipsCount: Number(r.memberships_count),
        lastLoginAt: toNullableIsoTimestamp(r.last_login_at),
        createdAt: toIsoTimestamp(r.created_at),
      }));
    }
  );
}

/**
 * Updates a platform user's `is_active` status (`SUPER_ADMIN` only, prevents self-deactivation).
 */
export async function updateSuperAdminUserStatus(
  actorUserId: UUID,
  targetUserId: UUID,
  input: SuperAdminUpdateUserStatusRequestDTO,
  auditMeta: { ipAddress: string | null; userAgent: string | null }
): Promise<SuperAdminUserDirectoryItemDTO> {
  if (actorUserId === targetUserId && !input.isActive) {
    throw new AppError(
      409,
      'SUPER_ADMIN_SELF_DEACTIVATION_BLOCKED',
      'A Super Admin cannot deactivate their own platform account.'
    );
  }

  await withTenantTransaction(
    { businessId: null, actorUserId, isSuperAdmin: true },
    async (client) => {
      const existingRes = await client.query<{ id: UUID; is_active: boolean }>(
        `SELECT id, is_active FROM users WHERE id = $1 FOR UPDATE`,
        [targetUserId]
      );
      const existing = existingRes.rows[0];
      if (!existing) {
        throw new AppError(404, 'USER_NOT_FOUND', 'Target user was not found.');
      }

      await client.query(
        `UPDATE users
         SET is_active = $2,
             updated_at = NOW()
         WHERE id = $1`,
        [targetUserId, input.isActive]
      );

      await client.query(
        `INSERT INTO audit_logs (
           business_id, actor_user_id, actor_platform_role, action, entity_type, entity_id, before_state, after_state, ip_address, user_agent
         )
         VALUES (NULL, $1, 'SUPER_ADMIN', 'SUPER_ADMIN_USER_STATUS_UPDATED', 'users', $2, $3::jsonb, $4::jsonb, $5, $6)`,
        [
          actorUserId,
          targetUserId,
          JSON.stringify({ isActive: existing.is_active }),
          JSON.stringify({ isActive: input.isActive, reason: input.reason }),
          auditMeta.ipAddress,
          auditMeta.userAgent,
        ]
      );
    }
  );

  const users = await listSuperAdminUsers(actorUserId);
  const updated = users.find((u) => u.id === targetUserId);
  if (!updated) {
    throw new AppError(404, 'USER_NOT_FOUND', 'Updated user was not found.');
  }
  return updated;
}

/**
 * Lists all SaaS subscription plans in `subscription_plans` with active subscriber counts.
 */
export async function listSuperAdminSubscriptionPlans(
  actorUserId: UUID
): Promise<SubscriptionPlanCatalogDTO[]> {
  return withTenantTransaction(
    { businessId: null, actorUserId, isSuperAdmin: true },
    async (client) => {
      const res = await client.query<{
        id: UUID;
        code: string;
        name: string;
        description: string | null;
        currency_code: string;
        monthly_price: string;
        annual_price: string;
        max_active_loans: number;
        max_employees: number;
        max_customers: number;
        features_json: Record<string, unknown>;
        is_public: boolean;
        active_subscriber_count: number;
        created_at: Date | string;
        updated_at: Date | string;
      }>(
        `SELECT
           sp.*,
           (
             SELECT COUNT(*)::int
             FROM business_subscriptions bs
             WHERE bs.plan_id = sp.id AND bs.status IN ('TRIALING', 'ACTIVE')
           ) AS active_subscriber_count
         FROM subscription_plans sp
         ORDER BY sp.monthly_price ASC`
      );

      return res.rows.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        description: r.description,
        currencyCode: r.currency_code,
        monthlyPrice: toStorageMoney(r.monthly_price),
        annualPrice: toStorageMoney(r.annual_price),
        maxActiveLoans: Number(r.max_active_loans),
        maxEmployees: Number(r.max_employees),
        maxCustomers: Number(r.max_customers),
        features: r.features_json ?? {},
        isPublic: r.is_public,
        activeSubscriberCount: Number(r.active_subscriber_count),
        createdAt: toIsoTimestamp(r.created_at),
        updatedAt: toIsoTimestamp(r.updated_at),
      }));
    }
  );
}

/**
 * Creates or updates a SaaS subscription plan (`subscription_plans`) by `code` (`SUPER_ADMIN` only).
 */
export async function upsertSuperAdminSubscriptionPlan(
  actorUserId: UUID,
  input: SuperAdminUpsertPlanRequestDTO,
  auditMeta: { ipAddress: string | null; userAgent: string | null }
): Promise<SubscriptionPlanCatalogDTO> {
  await withTenantTransaction(
    { businessId: null, actorUserId, isSuperAdmin: true },
    async (client) => {
      const res = await client.query<{ id: UUID }>(
        `INSERT INTO subscription_plans (
           code,
           name,
           description,
           currency_code,
           monthly_price,
           annual_price,
           max_active_loans,
           max_employees,
           max_customers,
           features_json,
           is_public
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11)
         ON CONFLICT (code) DO UPDATE
           SET name = EXCLUDED.name,
               description = EXCLUDED.description,
               currency_code = EXCLUDED.currency_code,
               monthly_price = EXCLUDED.monthly_price,
               annual_price = EXCLUDED.annual_price,
               max_active_loans = EXCLUDED.max_active_loans,
               max_employees = EXCLUDED.max_employees,
               max_customers = EXCLUDED.max_customers,
               features_json = EXCLUDED.features_json,
               is_public = EXCLUDED.is_public,
               updated_at = NOW()
         RETURNING id`,
        [
          input.code,
          input.name,
          input.description ?? null,
          input.currencyCode ?? 'USD',
          toStorageMoney(input.monthlyPrice),
          toStorageMoney(input.annualPrice),
          input.maxActiveLoans,
          input.maxEmployees,
          input.maxCustomers,
          JSON.stringify(input.features ?? {}),
          input.isPublic ?? true,
        ]
      );
      const planId = res.rows[0]!.id;

      await client.query(
        `INSERT INTO audit_logs (
           business_id, actor_user_id, actor_platform_role, action, entity_type, entity_id, before_state, after_state, ip_address, user_agent
         )
         VALUES (NULL, $1, 'SUPER_ADMIN', 'SUPER_ADMIN_PLAN_UPSERTED', 'subscription_plans', $2, NULL, $3::jsonb, $4, $5)`,
        [
          actorUserId,
          planId,
          JSON.stringify({
            code: input.code,
            name: input.name,
            monthlyPrice: toStorageMoney(input.monthlyPrice),
            annualPrice: toStorageMoney(input.annualPrice),
            maxActiveLoans: input.maxActiveLoans,
            maxEmployees: input.maxEmployees,
            maxCustomers: input.maxCustomers,
          }),
          auditMeta.ipAddress,
          auditMeta.userAgent,
        ]
      );
    }
  );

  const plans = await listSuperAdminSubscriptionPlans(actorUserId);
  return plans.find((p) => p.code === input.code)!;
}

/**
 * Lists all business subscription records across the platform.
 */
export async function listSuperAdminSubscriptions(
  actorUserId: UUID
): Promise<SuperAdminSubscriptionRecordDTO[]> {
  return withTenantTransaction(
    { businessId: null, actorUserId, isSuperAdmin: true },
    async (client) => {
      const res = await client.query<{
        id: UUID;
        business_id: UUID;
        business_code: string;
        business_legal_name: string;
        plan_id: UUID;
        plan_code: string;
        plan_name: string;
        status: SubscriptionStatus;
        billing_cycle: 'MONTHLY' | 'ANNUAL';
        unit_price: string;
        currency_code: string;
        current_period_start: Date | string;
        current_period_end: Date | string;
        cancel_at_period_end: boolean;
        created_at: Date | string;
        updated_at: Date | string;
      }>(
        `SELECT
           bs.*,
           b.business_code,
           b.legal_name AS business_legal_name,
           sp.code AS plan_code,
           sp.name AS plan_name
         FROM business_subscriptions bs
         JOIN businesses b ON b.id = bs.business_id
         JOIN subscription_plans sp ON sp.id = bs.plan_id
         ORDER BY bs.created_at DESC`
      );

      return res.rows.map((r) => ({
        id: r.id,
        businessId: r.business_id,
        businessCode: r.business_code,
        businessLegalName: r.business_legal_name,
        planId: r.plan_id,
        planCode: r.plan_code,
        planName: r.plan_name,
        status: r.status,
        billingCycle: r.billing_cycle,
        unitPrice: toStorageMoney(r.unit_price),
        currencyCode: r.currency_code,
        currentPeriodStart: toIsoTimestamp(r.current_period_start),
        currentPeriodEnd: toIsoTimestamp(r.current_period_end),
        cancelAtPeriodEnd: r.cancel_at_period_end,
        createdAt: toIsoTimestamp(r.created_at),
        updatedAt: toIsoTimestamp(r.updated_at),
      }));
    }
  );
}

/**
 * Assigns or updates a tenant business's active subscription plan and billing status (`SUPER_ADMIN` only).
 */
export async function assignSuperAdminBusinessSubscription(
  actorUserId: UUID,
  businessId: UUID,
  input: SuperAdminAssignSubscriptionRequestDTO,
  auditMeta: { ipAddress: string | null; userAgent: string | null }
): Promise<SuperAdminSubscriptionRecordDTO> {
  const updatedSubId = await withTenantTransaction(
    { businessId: null, actorUserId, isSuperAdmin: true },
    async (client) => {
      const planRes = await client.query<{
        id: UUID;
        code: string;
        monthly_price: string;
        annual_price: string;
        currency_code: string;
      }>(
        `SELECT id, code, monthly_price, annual_price, currency_code
         FROM subscription_plans
         WHERE id = $1`,
        [input.planId]
      );
      const planRow = planRes.rows[0];
      if (!planRow) {
        throw new AppError(404, 'SUBSCRIPTION_PLAN_NOT_FOUND', 'Subscription plan was not found.');
      }

      const unitPrice =
        input.billingCycle === 'ANNUAL'
          ? toStorageMoney(planRow.annual_price)
          : toStorageMoney(planRow.monthly_price);

      const defaultPeriodEnd = new Date(
        Date.now() + (input.billingCycle === 'ANNUAL' ? 365 : 30) * 86400000
      ).toISOString();
      const effectivePeriodEnd = input.currentPeriodEnd
        ? new Date(input.currentPeriodEnd).toISOString()
        : defaultPeriodEnd;

      const existingSubRes = await client.query<{ id: UUID }>(
        `SELECT id
         FROM business_subscriptions
         WHERE business_id = $1
         ORDER BY created_at DESC
         LIMIT 1
         FOR UPDATE`,
        [businessId]
      );

      let subId: UUID;
      if (existingSubRes.rows[0]) {
        subId = existingSubRes.rows[0].id;
        await client.query(
          `UPDATE business_subscriptions
           SET plan_id = $2,
               status = $3,
               billing_cycle = $4,
               unit_price = $5,
               currency_code = $6,
               current_period_start = NOW(),
               current_period_end = $7,
               cancel_at_period_end = $8,
               updated_at = NOW()
           WHERE id = $1`,
          [
            subId,
            planRow.id,
            input.status,
            input.billingCycle,
            unitPrice,
            planRow.currency_code,
            effectivePeriodEnd,
            input.cancelAtPeriodEnd ?? false,
          ]
        );
      } else {
        const insRes = await client.query<{ id: UUID }>(
          `INSERT INTO business_subscriptions (
             business_id,
             plan_id,
             status,
             billing_cycle,
             unit_price,
             currency_code,
             current_period_start,
             current_period_end,
             cancel_at_period_end
           )
           VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, $8)
           RETURNING id`,
          [
            businessId,
            planRow.id,
            input.status,
            input.billingCycle,
            unitPrice,
            planRow.currency_code,
            effectivePeriodEnd,
            input.cancelAtPeriodEnd ?? false,
          ]
        );
        subId = insRes.rows[0]!.id;
      }

      await client.query(
        `INSERT INTO audit_logs (
           business_id, actor_user_id, actor_platform_role, action, entity_type, entity_id, before_state, after_state, ip_address, user_agent
         )
         VALUES ($1, $2, 'SUPER_ADMIN', 'SUPER_ADMIN_SUBSCRIPTION_ASSIGNED', 'business_subscriptions', $3, NULL, $4::jsonb, $5, $6)`,
        [
          businessId,
          actorUserId,
          subId,
          JSON.stringify({
            planCode: planRow.code,
            status: input.status,
            billingCycle: input.billingCycle,
            unitPrice,
            reason: input.reason,
          }),
          auditMeta.ipAddress,
          auditMeta.userAgent,
        ]
      );

      return subId;
    }
  );

  const allSubs = await listSuperAdminSubscriptions(actorUserId);
  return allSubs.find((s) => s.id === updatedSubId)!;
}

/**
 * Computes SaaS MRR, ARR, and per-plan revenue breakdown from real PostgreSQL `business_subscriptions`.
 */
export async function getSuperAdminRevenueAnalytics(
  actorUserId: UUID
): Promise<SuperAdminRevenueAnalyticsDTO> {
  return withTenantTransaction(
    { businessId: null, actorUserId, isSuperAdmin: true },
    async (client) => {
      const subsRes = await client.query<{
        plan_code: string;
        plan_name: string;
        status: SubscriptionStatus;
        billing_cycle: 'MONTHLY' | 'ANNUAL';
        unit_price: string;
      }>(
        `SELECT DISTINCT ON (bs.business_id)
           sp.code AS plan_code,
           sp.name AS plan_name,
           bs.status,
           bs.billing_cycle,
           bs.unit_price
         FROM business_subscriptions bs
         JOIN subscription_plans sp ON sp.id = bs.plan_id
         ORDER BY bs.business_id, bs.created_at DESC`
      );

      let mrrDec = new FinancialDecimal(0);
      let activePaid = 0;
      let trialing = 0;
      let pastDue = 0;

      const planMap = new Map<
        string,
        {
          planCode: string;
          planName: string;
          subscriberCount: number;
          mrrContributionDec: InstanceType<typeof FinancialDecimal>;
        }
      >();

      const allPlansRes = await client.query<{ code: string; name: string }>(
        `SELECT code, name FROM subscription_plans ORDER BY monthly_price ASC`
      );
      for (const p of allPlansRes.rows) {
        planMap.set(p.code, {
          planCode: p.code,
          planName: p.name,
          subscriberCount: 0,
          mrrContributionDec: new FinancialDecimal(0),
        });
      }

      for (const s of subsRes.rows) {
        const entry = planMap.get(s.plan_code) ?? {
          planCode: s.plan_code,
          planName: s.plan_name,
          subscriberCount: 0,
          mrrContributionDec: new FinancialDecimal(0),
        };
        entry.subscriberCount += 1;

        if (s.status === SubscriptionStatus.ACTIVE) {
          activePaid += 1;
          const unitDec = new FinancialDecimal(s.unit_price);
          const monthlyDec = s.billing_cycle === 'ANNUAL' ? unitDec.div(12) : unitDec;
          mrrDec = mrrDec.plus(monthlyDec);
          entry.mrrContributionDec = entry.mrrContributionDec.plus(monthlyDec);
        } else if (s.status === SubscriptionStatus.TRIALING) {
          trialing += 1;
        } else if (s.status === SubscriptionStatus.PAST_DUE) {
          pastDue += 1;
        }

        planMap.set(s.plan_code, entry);
      }

      const roundedMrr = roundCurrencyUnit(mrrDec);
      const roundedArr = roundCurrencyUnit(roundedMrr.mul(12));

      return {
        mrrUsd: toStorageMoney(roundedMrr),
        arrUsd: toStorageMoney(roundedArr),
        activePaidSubscriptions: activePaid,
        trialingSubscriptions: trialing,
        pastDueSubscriptions: pastDue,
        planBreakdown: Array.from(planMap.values()).map((p) => ({
          planCode: p.planCode,
          planName: p.planName,
          subscriberCount: p.subscriberCount,
          monthlyRevenueContributionUsd: toStorageMoney(roundCurrencyUnit(p.mrrContributionDec)),
        })),
      };
    }
  );
}

/**
 * Broadcasts a platform notification to all active users (or all active members of a target business).
 */
export async function broadcastSuperAdminNotification(
  actorUserId: UUID,
  input: SuperAdminBroadcastNotificationRequestDTO,
  auditMeta: { ipAddress: string | null; userAgent: string | null }
): Promise<{ deliveredCount: number }> {
  return withTenantTransaction(
    { businessId: null, actorUserId, isSuperAdmin: true },
    async (client) => {
      let recipientUserIds: UUID[] = [];

      if (input.targetBusinessId) {
        const membersRes = await client.query<{ user_id: UUID }>(
          `SELECT DISTINCT user_id
           FROM business_memberships
           WHERE business_id = $1 AND status = 'ACTIVE'`,
          [input.targetBusinessId]
        );
        recipientUserIds = membersRes.rows.map((r) => r.user_id);
      } else {
        const usersRes = await client.query<{ id: UUID }>(
          `SELECT id FROM users WHERE is_active = TRUE`
        );
        recipientUserIds = usersRes.rows.map((r) => r.id);
      }

      for (const recipientId of recipientUserIds) {
        await client.query(
          `INSERT INTO notifications (
             business_id,
             recipient_user_id,
             category,
             title,
             body,
             action_url
           )
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            input.targetBusinessId ?? null,
            recipientId,
            input.category,
            input.title,
            input.body,
            input.actionUrl ?? null,
          ]
        );
      }

      await client.query(
        `INSERT INTO audit_logs (
           business_id, actor_user_id, actor_platform_role, action, entity_type, entity_id, before_state, after_state, ip_address, user_agent
         )
         VALUES ($1, $2, 'SUPER_ADMIN', 'SUPER_ADMIN_NOTIFICATION_BROADCAST', 'notifications', NULL, NULL, $3::jsonb, $4, $5)`,
        [
          input.targetBusinessId ?? null,
          actorUserId,
          JSON.stringify({
            category: input.category,
            title: input.title,
            targetBusinessId: input.targetBusinessId ?? null,
            deliveredCount: recipientUserIds.length,
          }),
          auditMeta.ipAddress,
          auditMeta.userAgent,
        ]
      );

      return { deliveredCount: recipientUserIds.length };
    }
  );
}

/**
 * Lists immutable platform & tenant audit logs (`audit_logs`).
 */
export async function listSuperAdminAuditLogs(
  actorUserId: UUID,
  filters?: { businessId?: UUID; action?: string; limit?: number }
): Promise<AuditLogEntryDTO[]> {
  return withTenantTransaction(
    { businessId: null, actorUserId, isSuperAdmin: true },
    async (client) => {
      const conditions: string[] = ['1 = 1'];
      const params: unknown[] = [];

      if (filters?.businessId) {
        params.push(filters.businessId);
        conditions.push(`al.business_id = $${params.length}`);
      }

      if (filters?.action && filters.action.trim().length > 0) {
        params.push(filters.action.trim());
        conditions.push(`al.action = $${params.length}`);
      }

      const limit = Math.min(200, Math.max(1, filters?.limit ?? 100));
      params.push(limit);

      const res = await client.query<{
        id: UUID;
        business_id: UUID | null;
        business_name: string | null;
        actor_user_id: UUID | null;
        actor_email: string | null;
        actor_full_name: string | null;
        actor_platform_role: PlatformRole;
        action: string;
        entity_type: string;
        entity_id: UUID | null;
        request_id: string | null;
        ip_address: string | null;
        before_state: Record<string, unknown> | null;
        after_state: Record<string, unknown> | null;
        created_at: Date | string;
      }>(
        `SELECT
           al.id,
           al.business_id,
           b.legal_name AS business_name,
           al.actor_user_id,
           u.email AS actor_email,
           u.full_name AS actor_full_name,
           al.actor_platform_role,
           al.action,
           al.entity_type,
           al.entity_id,
           al.request_id,
           al.ip_address,
           al.before_state,
           al.after_state,
           al.created_at
         FROM audit_logs al
         LEFT JOIN businesses b ON b.id = al.business_id
         LEFT JOIN users u ON u.id = al.actor_user_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY al.created_at DESC
         LIMIT $${params.length}`,
        params
      );

      return res.rows.map((r) => ({
        id: r.id,
        businessId: r.business_id,
        businessName: r.business_name,
        actorUserId: r.actor_user_id,
        actorEmail: r.actor_email,
        actorFullName: r.actor_full_name,
        actorPlatformRole: r.actor_platform_role,
        action: r.action,
        entityType: r.entity_type,
        entityId: r.entity_id,
        requestId: r.request_id,
        ipAddress: r.ip_address,
        beforeState: r.before_state,
        afterState: r.after_state,
        createdAt: toIsoTimestamp(r.created_at),
      }));
    }
  );
}

/**
 * Lists all platform settings from `platform_settings`.
 */
export async function listSuperAdminPlatformSettings(
  actorUserId: UUID
): Promise<PlatformSettingItemDTO[]> {
  return withTenantTransaction(
    { businessId: null, actorUserId, isSuperAdmin: true },
    async (client) => {
      const res = await client.query<{
        key: string;
        value_json: Record<string, unknown>;
        description: string | null;
        updated_by_user_id: UUID | null;
        updated_at: Date | string;
      }>(`SELECT * FROM platform_settings ORDER BY key ASC`);

      return res.rows.map((r) => ({
        key: r.key,
        valueJson: r.value_json ?? {},
        description: r.description,
        updatedByUserId: r.updated_by_user_id,
        updatedAt: toIsoTimestamp(r.updated_at),
      }));
    }
  );
}

/**
 * Updates or creates a platform setting in `platform_settings` (`SUPER_ADMIN` only).
 */
export async function upsertSuperAdminPlatformSetting(
  actorUserId: UUID,
  input: SuperAdminUpdatePlatformSettingRequestDTO,
  auditMeta: { ipAddress: string | null; userAgent: string | null }
): Promise<PlatformSettingItemDTO> {
  return withTenantTransaction(
    { businessId: null, actorUserId, isSuperAdmin: true },
    async (client) => {
      const res = await client.query<{
        key: string;
        value_json: Record<string, unknown>;
        description: string | null;
        updated_by_user_id: UUID | null;
        updated_at: Date | string;
      }>(
        `INSERT INTO platform_settings (key, value_json, description, updated_by_user_id, updated_at)
         VALUES ($1, $2::jsonb, $3, $4, NOW())
         ON CONFLICT (key) DO UPDATE
           SET value_json = EXCLUDED.value_json,
               description = COALESCE(EXCLUDED.description, platform_settings.description),
               updated_by_user_id = EXCLUDED.updated_by_user_id,
               updated_at = NOW()
         RETURNING *`,
        [
          input.key,
          JSON.stringify(input.valueJson),
          input.description ?? null,
          actorUserId,
        ]
      );

      await client.query(
        `INSERT INTO audit_logs (
           business_id, actor_user_id, actor_platform_role, action, entity_type, entity_id, before_state, after_state, ip_address, user_agent
         )
         VALUES (NULL, $1, 'SUPER_ADMIN', 'SUPER_ADMIN_PLATFORM_SETTING_UPDATED', 'platform_settings', NULL, NULL, $2::jsonb, $3, $4)`,
        [
          actorUserId,
          JSON.stringify({ key: input.key, valueJson: input.valueJson }),
          auditMeta.ipAddress,
          auditMeta.userAgent,
        ]
      );

      const r = res.rows[0]!;
      return {
        key: r.key,
        valueJson: r.value_json ?? {},
        description: r.description,
        updatedByUserId: r.updated_by_user_id,
        updatedAt: toIsoTimestamp(r.updated_at),
      };
    }
  );
}
