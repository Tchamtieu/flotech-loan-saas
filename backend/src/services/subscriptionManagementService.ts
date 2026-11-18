import {
  CancelTenantSubscriptionRequestDTO,
  ChangeTenantSubscriptionPlanRequestDTO,
  PlatformRole,
  SubscriptionPlanCatalogDTO,
  SubscriptionStatus,
  TenantSubscriptionHistoryItemDTO,
  TenantSubscriptionOverviewDTO,
  UUID,
} from '@flotech/shared';
import { withTenantTransaction } from '../database/pool.js';
import { FinancialDecimal, toStorageMoney } from '../financial/decimalEngine.js';
import { AppError } from '../middleware/errorHandler.js';

function toIsoTimestamp(val: Date | string): string {
  if (val instanceof Date) {
    return val.toISOString();
  }
  return new Date(val).toISOString();
}

function toNullableIsoTimestamp(val: Date | string | null): string | null {
  if (!val) return null;
  return toIsoTimestamp(val);
}

function computeUtilizationPercent(used: number, max: number): string {
  if (max <= 0) return '0.0000';
  return new FinancialDecimal(used)
    .dividedBy(new FinancialDecimal(max))
    .times(100)
    .toFixed(4, FinancialDecimal.ROUND_HALF_UP);
}

/**
 * Retrieves the tenant business's current subscription, real-time quota utilization,
 * available SaaS plans catalog, and subscription change history.
 */
export async function getTenantSubscriptionOverview(
  businessId: UUID,
  actorUserId: UUID
): Promise<TenantSubscriptionOverviewDTO> {
  return withTenantTransaction(
    { businessId, actorUserId, isSuperAdmin: false },
    async (client) => {
      // 1. Fetch latest business subscription joined with plan
      const subRes = await client.query<{
        id: UUID;
        business_id: UUID;
        plan_id: UUID;
        plan_code: string;
        plan_name: string;
        plan_description: string | null;
        monthly_price: string;
        annual_price: string;
        max_active_loans: number;
        max_employees: number;
        max_customers: number;
        features_json: Record<string, unknown>;
        status: SubscriptionStatus;
        billing_cycle: 'MONTHLY' | 'ANNUAL';
        unit_price: string;
        current_period_start: Date | string;
        current_period_end: Date | string;
        cancel_at_period_end: boolean;
        canceled_at: Date | string | null;
      }>(
        `SELECT
           bs.id,
           bs.business_id,
           bs.plan_id,
           sp.code AS plan_code,
           sp.name AS plan_name,
           sp.description AS plan_description,
           sp.monthly_price,
           sp.annual_price,
           sp.max_active_loans,
           sp.max_employees,
           sp.max_customers,
           sp.features_json,
           bs.status,
           bs.billing_cycle,
           bs.unit_price,
           bs.current_period_start,
           bs.current_period_end,
           bs.cancel_at_period_end,
           bs.canceled_at
         FROM business_subscriptions bs
         JOIN subscription_plans sp ON sp.id = bs.plan_id
         WHERE bs.business_id = $1
         ORDER BY bs.created_at DESC
         LIMIT 1
         FOR UPDATE OF bs`,
        [businessId]
      );

      const subRow = subRes.rows[0];
      if (!subRow) {
        throw new AppError(
          404,
          'SUBSCRIPTION_NOT_FOUND',
          'No subscription record was found for this business tenant.'
        );
      }

      // Synchronize status to EXPIRED if current_period_end has passed and cancel_at_period_end is true
      let effectiveStatus = subRow.status;
      const periodEndMs = new Date(subRow.current_period_end).getTime();
      const nowMs = Date.now();
      if (
        (effectiveStatus === SubscriptionStatus.TRIALING ||
          effectiveStatus === SubscriptionStatus.ACTIVE) &&
        subRow.cancel_at_period_end &&
        periodEndMs < nowMs
      ) {
        effectiveStatus = SubscriptionStatus.EXPIRED;
        await client.query(
          `UPDATE business_subscriptions
           SET status = 'EXPIRED', updated_at = NOW()
           WHERE id = $1 AND business_id = $2`,
          [subRow.id, businessId]
        );
      }

      const daysRemaining = Math.max(
        0,
        Math.ceil((periodEndMs - nowMs) / (1000 * 60 * 60 * 24))
      );

      // 2. Compute real-time quota utilization from PostgreSQL
      const usageRes = await client.query<{
        active_loans_used: number;
        active_employees_used: number;
        active_customers_used: number;
      }>(
        `SELECT
           (SELECT COUNT(*)::int FROM loans WHERE business_id = $1 AND status IN ('ACTIVE', 'OVERDUE')) AS active_loans_used,
           (SELECT COUNT(*)::int FROM business_memberships WHERE business_id = $1 AND status IN ('INVITED', 'ACTIVE')) AS active_employees_used,
           (SELECT COUNT(*)::int FROM customers WHERE business_id = $1 AND is_archived = FALSE) AS active_customers_used`,
        [businessId]
      );
      const usage = usageRes.rows[0]!;
      const activeLoansUsed = Number(usage.active_loans_used ?? 0);
      const activeEmployeesUsed = Number(usage.active_employees_used ?? 0);
      const activeCustomersUsed = Number(usage.active_customers_used ?? 0);

      const maxActiveLoans = Number(subRow.max_active_loans);
      const maxEmployees = Number(subRow.max_employees);
      const maxCustomers = Number(subRow.max_customers);

      // 3. Load available public plans catalog
      const plansRes = await client.query<{
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
        active_subscribers: number;
        created_at: Date | string;
        updated_at: Date | string;
      }>(
        `SELECT
           sp.*,
           COUNT(bs.id) FILTER (WHERE bs.status IN ('TRIALING', 'ACTIVE'))::int AS active_subscribers
         FROM subscription_plans sp
         LEFT JOIN business_subscriptions bs ON bs.plan_id = sp.id
         WHERE sp.is_public = TRUE
         GROUP BY sp.id
         ORDER BY sp.monthly_price ASC`
      );

      const availablePlans: SubscriptionPlanCatalogDTO[] = plansRes.rows.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        description: p.description,
        currencyCode: p.currency_code || 'USD',
        monthlyPrice: toStorageMoney(p.monthly_price),
        annualPrice: toStorageMoney(p.annual_price),
        maxActiveLoans: Number(p.max_active_loans),
        maxEmployees: Number(p.max_employees),
        maxCustomers: Number(p.max_customers),
        features: p.features_json ?? {},
        isPublic: p.is_public,
        activeSubscriberCount: Number(p.active_subscribers ?? 0),
        createdAt: toIsoTimestamp(p.created_at),
        updatedAt: toIsoTimestamp(p.updated_at),
      }));

      // 4. Load subscription audit history for this tenant
      const historyRes = await client.query<{
        id: UUID;
        action: string;
        actor_full_name: string | null;
        before_state: Record<string, unknown> | null;
        after_state: Record<string, unknown> | null;
        created_at: Date | string;
      }>(
        `SELECT
           al.id,
           al.action,
           u.full_name AS actor_full_name,
           al.before_state,
           al.after_state,
           al.created_at
         FROM audit_logs al
         LEFT JOIN users u ON u.id = al.actor_user_id
         WHERE al.business_id = $1
           AND (
             al.entity_type IN ('business_subscriptions', 'SUBSCRIPTION')
             OR al.action IN ('BUSINESS_CREATED', 'SUBSCRIPTION_PLAN_CHANGED', 'SUBSCRIPTION_CANCELED', 'SUPER_ADMIN_SUBSCRIPTION_ASSIGNED')
           )
         ORDER BY al.created_at DESC
         LIMIT 20`,
        [businessId]
      );

      const history: TenantSubscriptionHistoryItemDTO[] = historyRes.rows.map((h) => ({
        id: h.id,
        action: h.action,
        actorFullName: h.actor_full_name,
        beforeState: h.before_state,
        afterState: h.after_state,
        createdAt: toIsoTimestamp(h.created_at),
      }));

      const unitPriceUsd =
        subRow.billing_cycle === 'ANNUAL'
          ? toStorageMoney(subRow.annual_price)
          : toStorageMoney(subRow.monthly_price);

      return {
        subscriptionId: subRow.id,
        businessId: subRow.business_id,
        planId: subRow.plan_id,
        planCode: subRow.plan_code,
        planName: subRow.plan_name,
        planDescription: subRow.plan_description,
        status: effectiveStatus,
        billingInterval: subRow.billing_cycle,
        unitPriceUsd,
        trialEndsAt:
          effectiveStatus === SubscriptionStatus.TRIALING
            ? toIsoTimestamp(subRow.current_period_end)
            : null,
        currentPeriodStart: toIsoTimestamp(subRow.current_period_start),
        currentPeriodEnd: toIsoTimestamp(subRow.current_period_end),
        daysRemainingInPeriod: daysRemaining,
        autoRenew: !subRow.cancel_at_period_end,
        canceledAt: toNullableIsoTimestamp(subRow.canceled_at),
        features: subRow.features_json ?? {},
        billingProviderMode: 'MANUAL_INVOICE_OR_SANDBOX',
        quotas: {
          activeLoansUsed,
          maxActiveLoans,
          activeLoansUtilizationPercent: computeUtilizationPercent(
            activeLoansUsed,
            maxActiveLoans
          ),
          activeEmployeesUsed,
          maxEmployees,
          activeEmployeesUtilizationPercent: computeUtilizationPercent(
            activeEmployeesUsed,
            maxEmployees
          ),
          activeCustomersUsed,
          maxCustomers,
          activeCustomersUtilizationPercent: computeUtilizationPercent(
            activeCustomersUsed,
            maxCustomers
          ),
        },
        availablePlans,
        history,
      };
    }
  );
}

/**
 * Changes the tenant business's subscription plan and/or billing interval (`subscription:manage`).
 * Validates that current active usage does not exceed the target plan's quotas before allowing a downgrade.
 */
export async function changeTenantSubscriptionPlan(
  businessId: UUID,
  actorUserId: UUID,
  actorPlatformRole: PlatformRole,
  input: ChangeTenantSubscriptionPlanRequestDTO,
  auditMeta: { ipAddress: string | null; userAgent: string | null }
): Promise<TenantSubscriptionOverviewDTO> {
  await withTenantTransaction(
    { businessId, actorUserId, isSuperAdmin: false },
    async (client) => {
      // 1. Lock target plan
      const planRes = await client.query<{
        id: UUID;
        code: string;
        name: string;
        is_public: boolean;
        max_active_loans: number;
        max_employees: number;
        max_customers: number;
        monthly_price: string;
        annual_price: string;
      }>(
        `SELECT
           id,
           code,
           name,
           is_public,
           max_active_loans,
           max_employees,
           max_customers,
           monthly_price,
           annual_price
         FROM subscription_plans
         WHERE code = $1
         LIMIT 1`,
        [input.planCode.trim().toUpperCase()]
      );
      const targetPlan = planRes.rows[0];
      if (!targetPlan || !targetPlan.is_public) {
        throw new AppError(
          404,
          'SUBSCRIPTION_PLAN_NOT_FOUND',
          `Subscription plan "${input.planCode}" was not found or is inactive.`
        );
      }

      // 2. Check current active usage against target plan limits (downgrade guard)
      const usageRes = await client.query<{
        active_loans_used: number;
        active_employees_used: number;
        active_customers_used: number;
      }>(
        `SELECT
           (SELECT COUNT(*)::int FROM loans WHERE business_id = $1 AND status IN ('ACTIVE', 'OVERDUE')) AS active_loans_used,
           (SELECT COUNT(*)::int FROM business_memberships WHERE business_id = $1 AND status IN ('INVITED', 'ACTIVE')) AS active_employees_used,
           (SELECT COUNT(*)::int FROM customers WHERE business_id = $1 AND is_archived = FALSE) AS active_customers_used`,
        [businessId]
      );
      const usage = usageRes.rows[0]!;
      const conflicts: string[] = [];

      if (usage.active_loans_used > targetPlan.max_active_loans) {
        conflicts.push(
          `Active loans (${usage.active_loans_used}) exceed ${targetPlan.name} limit (${targetPlan.max_active_loans})`
        );
      }
      if (usage.active_employees_used > targetPlan.max_employees) {
        conflicts.push(
          `Employees (${usage.active_employees_used}) exceed ${targetPlan.name} limit (${targetPlan.max_employees})`
        );
      }
      if (usage.active_customers_used > targetPlan.max_customers) {
        conflicts.push(
          `Active customers (${usage.active_customers_used}) exceed ${targetPlan.name} limit (${targetPlan.max_customers})`
        );
      }

      if (conflicts.length > 0) {
        throw new AppError(
          409,
          'SUBSCRIPTION_DOWNGRADE_QUOTA_CONFLICT',
          `Cannot switch to ${targetPlan.name} because current resource usage exceeds plan limits: ${conflicts.join('; ')}.`,
          { conflicts }
        );
      }

      // 3. Lock current business subscription
      const currentSubRes = await client.query<{
        id: UUID;
        plan_id: UUID;
        status: SubscriptionStatus;
        billing_cycle: string;
        current_period_end: Date | string;
        cancel_at_period_end: boolean;
      }>(
        `SELECT id, plan_id, status, billing_cycle, current_period_end, cancel_at_period_end
         FROM business_subscriptions
         WHERE business_id = $1
         ORDER BY created_at DESC
         LIMIT 1
         FOR UPDATE`,
        [businessId]
      );
      const currentSub = currentSubRes.rows[0];
      if (!currentSub) {
        throw new AppError(
          404,
          'SUBSCRIPTION_NOT_FOUND',
          'No subscription record was found for this business.'
        );
      }

      const now = new Date();
      const periodEnd = new Date(now.getTime());
      if (input.billingInterval === 'ANNUAL') {
        periodEnd.setUTCFullYear(periodEnd.getUTCFullYear() + 1);
      } else {
        periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);
      }

      const newAutoRenew = input.autoRenew ?? true;
      const newCancelAtPeriodEnd = !newAutoRenew;
      const newUnitPrice =
        input.billingInterval === 'ANNUAL'
          ? toStorageMoney(targetPlan.annual_price)
          : toStorageMoney(targetPlan.monthly_price);

      await client.query(
        `UPDATE business_subscriptions
         SET plan_id = $3,
             status = 'ACTIVE',
             billing_cycle = $4,
             unit_price = $5,
             current_period_start = $6,
             current_period_end = $7,
             cancel_at_period_end = $8,
             canceled_at = NULL,
             updated_at = NOW()
         WHERE id = $1 AND business_id = $2`,
        [
          currentSub.id,
          businessId,
          targetPlan.id,
          input.billingInterval,
          newUnitPrice,
          now.toISOString(),
          periodEnd.toISOString(),
          newCancelAtPeriodEnd,
        ]
      );

      await client.query(
        `INSERT INTO audit_logs (
           business_id, actor_user_id, actor_platform_role, action, entity_type, entity_id, before_state, after_state, ip_address, user_agent
         )
         VALUES ($1, $2, $3, 'SUBSCRIPTION_PLAN_CHANGED', 'business_subscriptions', $4, $5::jsonb, $6::jsonb, $7, $8)`,
        [
          businessId,
          actorUserId,
          actorPlatformRole,
          currentSub.id,
          JSON.stringify({
            planId: currentSub.plan_id,
            status: currentSub.status,
            billingInterval: currentSub.billing_cycle,
          }),
          JSON.stringify({
            planId: targetPlan.id,
            planCode: targetPlan.code,
            planName: targetPlan.name,
            status: SubscriptionStatus.ACTIVE,
            billingInterval: input.billingInterval,
            unitPriceUsd: newUnitPrice,
            currentPeriodEnd: periodEnd.toISOString(),
            autoRenew: newAutoRenew,
          }),
          auditMeta.ipAddress,
          auditMeta.userAgent,
        ]
      );
    }
  );

  return getTenantSubscriptionOverview(businessId, actorUserId);
}

/**
 * Cancels a tenant business subscription either at period end (`immediate = false`)
 * or immediately (`immediate = true -> status = CANCELED`).
 */
export async function cancelTenantSubscription(
  businessId: UUID,
  actorUserId: UUID,
  actorPlatformRole: PlatformRole,
  input: CancelTenantSubscriptionRequestDTO,
  auditMeta: { ipAddress: string | null; userAgent: string | null }
): Promise<TenantSubscriptionOverviewDTO> {
  await withTenantTransaction(
    { businessId, actorUserId, isSuperAdmin: false },
    async (client) => {
      const currentSubRes = await client.query<{
        id: UUID;
        status: SubscriptionStatus;
        cancel_at_period_end: boolean;
      }>(
        `SELECT id, status, cancel_at_period_end
         FROM business_subscriptions
         WHERE business_id = $1
         ORDER BY created_at DESC
         LIMIT 1
         FOR UPDATE`,
        [businessId]
      );
      const currentSub = currentSubRes.rows[0];
      if (!currentSub) {
        throw new AppError(
          404,
          'SUBSCRIPTION_NOT_FOUND',
          'No subscription record was found for this business.'
        );
      }

      const immediate = input.immediate === true;
      const nextStatus = immediate ? SubscriptionStatus.CANCELED : currentSub.status;
      const nowIso = new Date().toISOString();

      await client.query(
        `UPDATE business_subscriptions
         SET status = $3,
             cancel_at_period_end = TRUE,
             canceled_at = $4,
             updated_at = NOW()
         WHERE id = $1 AND business_id = $2`,
        [currentSub.id, businessId, nextStatus, nowIso]
      );

      await client.query(
        `INSERT INTO audit_logs (
           business_id, actor_user_id, actor_platform_role, action, entity_type, entity_id, before_state, after_state, ip_address, user_agent
         )
         VALUES ($1, $2, $3, 'SUBSCRIPTION_CANCELED', 'business_subscriptions', $4, $5::jsonb, $6::jsonb, $7, $8)`,
        [
          businessId,
          actorUserId,
          actorPlatformRole,
          currentSub.id,
          JSON.stringify({
            status: currentSub.status,
            autoRenew: !currentSub.cancel_at_period_end,
          }),
          JSON.stringify({
            status: nextStatus,
            autoRenew: false,
            immediate,
            reason: input.reason ?? null,
            canceledAt: nowIso,
          }),
          auditMeta.ipAddress,
          auditMeta.userAgent,
        ]
      );
    }
  );

  return getTenantSubscriptionOverview(businessId, actorUserId);
}
