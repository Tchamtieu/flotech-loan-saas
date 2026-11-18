import type { Request, Response, NextFunction } from 'express';
import {
  CancelTenantSubscriptionRequestSchema,
  ChangeTenantSubscriptionPlanRequestSchema,
} from '../validation/schemas.js';
import {
  cancelTenantSubscription,
  changeTenantSubscriptionPlan,
  getTenantSubscriptionOverview,
} from '../services/subscriptionManagementService.js';

export async function getTenantSubscriptionOverviewController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const businessId = req.tenantContext!.businessId;
    const actorUserId = req.authUser!.userId;
    const overview = await getTenantSubscriptionOverview(businessId, actorUserId);
    res.status(200).json({
      success: true,
      data: overview,
      meta: {
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function postChangeTenantSubscriptionPlanController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const businessId = req.tenantContext!.businessId;
    const actorUser = req.authUser!;
    const parsed = ChangeTenantSubscriptionPlanRequestSchema.parse(req.body);
    const updated = await changeTenantSubscriptionPlan(
      businessId,
      actorUser.userId,
      actorUser.platformRole,
      parsed,
      {
        ipAddress: req.ip ?? null,
        userAgent: req.header('user-agent') ?? null,
      }
    );
    res.status(200).json({
      success: true,
      data: updated,
      meta: {
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function postCancelTenantSubscriptionController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const businessId = req.tenantContext!.businessId;
    const actorUser = req.authUser!;
    const parsed = CancelTenantSubscriptionRequestSchema.parse(req.body);
    const updated = await cancelTenantSubscription(
      businessId,
      actorUser.userId,
      actorUser.platformRole,
      parsed,
      {
        ipAddress: req.ip ?? null,
        userAgent: req.header('user-agent') ?? null,
      }
    );
    res.status(200).json({
      success: true,
      data: updated,
      meta: {
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
}
