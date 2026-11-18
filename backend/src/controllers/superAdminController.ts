import type { Request, Response, NextFunction } from 'express';
import {
  BusinessStatus,
  type ApiSuccessResponse,
  type AuditLogEntryDTO,
  type PlatformSettingItemDTO,
  type SubscriptionPlanCatalogDTO,
  type SuperAdminBusinessSummaryDTO,
  type SuperAdminGlobalKpisDTO,
  type SuperAdminRevenueAnalyticsDTO,
  type SuperAdminSubscriptionRecordDTO,
  type SuperAdminUserDirectoryItemDTO,
} from '@flotech/shared';
import {
  SuperAdminAssignSubscriptionRequestSchema,
  SuperAdminBroadcastNotificationRequestSchema,
  SuperAdminUpdateBusinessStatusRequestSchema,
  SuperAdminUpdatePlatformSettingRequestSchema,
  SuperAdminUpdateUserStatusRequestSchema,
  SuperAdminUpsertPlanRequestSchema,
} from '../validation/schemas.js';
import {
  assignSuperAdminBusinessSubscription,
  broadcastSuperAdminNotification,
  getSuperAdminGlobalKpis,
  getSuperAdminRevenueAnalytics,
  listSuperAdminAuditLogs,
  listSuperAdminBusinesses,
  listSuperAdminPlatformSettings,
  listSuperAdminSubscriptionPlans,
  listSuperAdminSubscriptions,
  listSuperAdminUsers,
  updateSuperAdminBusinessStatus,
  updateSuperAdminUserStatus,
  upsertSuperAdminPlatformSetting,
  upsertSuperAdminSubscriptionPlan,
} from '../services/superAdminService.js';
import { AppError } from '../middleware/errorHandler.js';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function extractAuditMeta(req: Request): { ipAddress: string | null; userAgent: string | null } {
  return {
    ipAddress: req.ip ?? null,
    userAgent: req.header('User-Agent') ?? null,
  };
}

/**
 * GET /api/v1/super-admin/dashboard
 */
export async function getSuperAdminDashboardController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.authUser) {
    next(new AppError(401, 'UNAUTHENTICATED', 'Authentication context is missing.'));
    return;
  }

  try {
    const kpis = await getSuperAdminGlobalKpis(req.authUser.userId);
    const response: ApiSuccessResponse<SuperAdminGlobalKpisDTO> = {
      success: true,
      data: kpis,
      meta: {
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
      },
    };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/super-admin/businesses
 */
export async function getSuperAdminBusinessesController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.authUser) {
    next(new AppError(401, 'UNAUTHENTICATED', 'Authentication context is missing.'));
    return;
  }

  const rawStatus =
    typeof req.query['status'] === 'string' ? req.query['status'].trim() : undefined;
  const rawQ = typeof req.query['q'] === 'string' ? req.query['q'].trim() : undefined;

  if (
    rawStatus &&
    !Object.values(BusinessStatus).includes(rawStatus as BusinessStatus)
  ) {
    next(new AppError(400, 'INVALID_BUSINESS_STATUS', `Invalid business status: ${rawStatus}`));
    return;
  }

  try {
    const businesses = await listSuperAdminBusinesses(req.authUser.userId, {
      status: rawStatus as BusinessStatus | undefined,
      q: rawQ,
    });
    const response: ApiSuccessResponse<SuperAdminBusinessSummaryDTO[]> = {
      success: true,
      data: businesses,
      meta: {
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
      },
    };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/v1/super-admin/businesses/:businessId/status
 */
export async function patchSuperAdminBusinessStatusController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.authUser) {
    next(new AppError(401, 'UNAUTHENTICATED', 'Authentication context is missing.'));
    return;
  }

  const rawBusinessId = req.params['businessId'];
  const businessId = typeof rawBusinessId === 'string' ? rawBusinessId : undefined;
  if (!businessId || !UUID_REGEX.test(businessId)) {
    next(new AppError(400, 'INVALID_BUSINESS_ID', 'businessId parameter must be a valid UUID.'));
    return;
  }

  const parsed = SuperAdminUpdateBusinessStatusRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    next(
      new AppError(400, 'VALIDATION_ERROR', 'Invalid business status update payload.', {
        issues: parsed.error.flatten(),
      })
    );
    return;
  }

  try {
    const updated = await updateSuperAdminBusinessStatus(
      req.authUser.userId,
      businessId,
      parsed.data,
      extractAuditMeta(req)
    );
    const response: ApiSuccessResponse<SuperAdminBusinessSummaryDTO> = {
      success: true,
      data: updated,
      meta: {
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
      },
    };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/super-admin/users
 */
export async function getSuperAdminUsersController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.authUser) {
    next(new AppError(401, 'UNAUTHENTICATED', 'Authentication context is missing.'));
    return;
  }

  const rawQ = typeof req.query['q'] === 'string' ? req.query['q'].trim() : undefined;

  try {
    const users = await listSuperAdminUsers(req.authUser.userId, rawQ);
    const response: ApiSuccessResponse<SuperAdminUserDirectoryItemDTO[]> = {
      success: true,
      data: users,
      meta: {
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
      },
    };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/v1/super-admin/users/:userId/status
 */
export async function patchSuperAdminUserStatusController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.authUser) {
    next(new AppError(401, 'UNAUTHENTICATED', 'Authentication context is missing.'));
    return;
  }

  const rawUserId = req.params['userId'];
  const targetUserId = typeof rawUserId === 'string' ? rawUserId : undefined;
  if (!targetUserId || !UUID_REGEX.test(targetUserId)) {
    next(new AppError(400, 'INVALID_USER_ID', 'userId parameter must be a valid UUID.'));
    return;
  }

  const parsed = SuperAdminUpdateUserStatusRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    next(
      new AppError(400, 'VALIDATION_ERROR', 'Invalid user status update payload.', {
        issues: parsed.error.flatten(),
      })
    );
    return;
  }

  try {
    const updated = await updateSuperAdminUserStatus(
      req.authUser.userId,
      targetUserId,
      parsed.data,
      extractAuditMeta(req)
    );
    const response: ApiSuccessResponse<SuperAdminUserDirectoryItemDTO> = {
      success: true,
      data: updated,
      meta: {
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
      },
    };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/super-admin/plans
 */
export async function getSuperAdminPlansController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.authUser) {
    next(new AppError(401, 'UNAUTHENTICATED', 'Authentication context is missing.'));
    return;
  }

  try {
    const plans = await listSuperAdminSubscriptionPlans(req.authUser.userId);
    const response: ApiSuccessResponse<SubscriptionPlanCatalogDTO[]> = {
      success: true,
      data: plans,
      meta: {
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
      },
    };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/super-admin/plans
 */
export async function postSuperAdminUpsertPlanController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.authUser) {
    next(new AppError(401, 'UNAUTHENTICATED', 'Authentication context is missing.'));
    return;
  }

  const parsed = SuperAdminUpsertPlanRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    next(
      new AppError(400, 'VALIDATION_ERROR', 'Invalid subscription plan payload.', {
        issues: parsed.error.flatten(),
      })
    );
    return;
  }

  try {
    const plan = await upsertSuperAdminSubscriptionPlan(
      req.authUser.userId,
      parsed.data,
      extractAuditMeta(req)
    );
    const response: ApiSuccessResponse<SubscriptionPlanCatalogDTO> = {
      success: true,
      data: plan,
      meta: {
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
      },
    };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/super-admin/subscriptions
 */
export async function getSuperAdminSubscriptionsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.authUser) {
    next(new AppError(401, 'UNAUTHENTICATED', 'Authentication context is missing.'));
    return;
  }

  try {
    const subs = await listSuperAdminSubscriptions(req.authUser.userId);
    const response: ApiSuccessResponse<SuperAdminSubscriptionRecordDTO[]> = {
      success: true,
      data: subs,
      meta: {
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
      },
    };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/v1/super-admin/businesses/:businessId/subscription
 */
export async function putSuperAdminAssignSubscriptionController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.authUser) {
    next(new AppError(401, 'UNAUTHENTICATED', 'Authentication context is missing.'));
    return;
  }

  const rawBusinessId = req.params['businessId'];
  const businessId = typeof rawBusinessId === 'string' ? rawBusinessId : undefined;
  if (!businessId || !UUID_REGEX.test(businessId)) {
    next(new AppError(400, 'INVALID_BUSINESS_ID', 'businessId parameter must be a valid UUID.'));
    return;
  }

  const parsed = SuperAdminAssignSubscriptionRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    next(
      new AppError(400, 'VALIDATION_ERROR', 'Invalid subscription assignment payload.', {
        issues: parsed.error.flatten(),
      })
    );
    return;
  }

  try {
    const assigned = await assignSuperAdminBusinessSubscription(
      req.authUser.userId,
      businessId,
      parsed.data,
      extractAuditMeta(req)
    );
    const response: ApiSuccessResponse<SuperAdminSubscriptionRecordDTO> = {
      success: true,
      data: assigned,
      meta: {
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
      },
    };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/super-admin/revenue-analytics
 */
export async function getSuperAdminRevenueAnalyticsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.authUser) {
    next(new AppError(401, 'UNAUTHENTICATED', 'Authentication context is missing.'));
    return;
  }

  try {
    const revenue = await getSuperAdminRevenueAnalytics(req.authUser.userId);
    const response: ApiSuccessResponse<SuperAdminRevenueAnalyticsDTO> = {
      success: true,
      data: revenue,
      meta: {
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
      },
    };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/super-admin/notifications/broadcast
 */
export async function postSuperAdminBroadcastNotificationController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.authUser) {
    next(new AppError(401, 'UNAUTHENTICATED', 'Authentication context is missing.'));
    return;
  }

  const parsed = SuperAdminBroadcastNotificationRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    next(
      new AppError(400, 'VALIDATION_ERROR', 'Invalid notification broadcast payload.', {
        issues: parsed.error.flatten(),
      })
    );
    return;
  }

  try {
    const result = await broadcastSuperAdminNotification(
      req.authUser.userId,
      parsed.data,
      extractAuditMeta(req)
    );
    const response: ApiSuccessResponse<{ deliveredCount: number }> = {
      success: true,
      data: result,
      meta: {
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
      },
    };
    res.status(201).json(response);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/super-admin/audit-logs
 */
export async function getSuperAdminAuditLogsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.authUser) {
    next(new AppError(401, 'UNAUTHENTICATED', 'Authentication context is missing.'));
    return;
  }

  const rawBusinessId =
    typeof req.query['businessId'] === 'string' ? req.query['businessId'].trim() : undefined;
  const rawAction =
    typeof req.query['action'] === 'string' ? req.query['action'].trim() : undefined;
  const rawLimit =
    typeof req.query['limit'] === 'string' ? Number(req.query['limit']) : undefined;

  if (rawBusinessId && !UUID_REGEX.test(rawBusinessId)) {
    next(
      new AppError(400, 'INVALID_BUSINESS_ID', 'businessId query filter must be a valid UUID.')
    );
    return;
  }

  try {
    const logs = await listSuperAdminAuditLogs(req.authUser.userId, {
      businessId: rawBusinessId,
      action: rawAction,
      limit: Number.isFinite(rawLimit) ? rawLimit : 100,
    });
    const response: ApiSuccessResponse<AuditLogEntryDTO[]> = {
      success: true,
      data: logs,
      meta: {
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
      },
    };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/super-admin/settings
 */
export async function getSuperAdminPlatformSettingsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.authUser) {
    next(new AppError(401, 'UNAUTHENTICATED', 'Authentication context is missing.'));
    return;
  }

  try {
    const settings = await listSuperAdminPlatformSettings(req.authUser.userId);
    const response: ApiSuccessResponse<PlatformSettingItemDTO[]> = {
      success: true,
      data: settings,
      meta: {
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
      },
    };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/v1/super-admin/settings
 */
export async function putSuperAdminPlatformSettingController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.authUser) {
    next(new AppError(401, 'UNAUTHENTICATED', 'Authentication context is missing.'));
    return;
  }

  const parsed = SuperAdminUpdatePlatformSettingRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    next(
      new AppError(400, 'VALIDATION_ERROR', 'Invalid platform setting payload.', {
        issues: parsed.error.flatten(),
      })
    );
    return;
  }

  try {
    const updated = await upsertSuperAdminPlatformSetting(
      req.authUser.userId,
      parsed.data,
      extractAuditMeta(req)
    );
    const response: ApiSuccessResponse<PlatformSettingItemDTO> = {
      success: true,
      data: updated,
      meta: {
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
      },
    };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}
