import type { Request, Response, NextFunction } from 'express';
import type {
  ApiSuccessResponse,
  BusinessFinancialDashboardDTO,
  NotificationItemDTO,
} from '@flotech/shared';
import {
  exportBusinessFinancialStatementCsv,
  getBusinessFinancialDashboard,
  listTenantNotifications,
  markTenantNotificationRead,
} from '../services/financialReportingService.js';
import { AppError } from '../middleware/errorHandler.js';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/v1/businesses/:businessId/dashboard
 * GET /api/v1/businesses/:businessId/reports/portfolio
 * Requires `dashboard:view` or `reports:view` permission.
 */
export async function getBusinessFinancialDashboardController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.authUser || !req.tenantContext) {
    next(new AppError(401, 'UNAUTHENTICATED', 'Tenant authentication context is missing.'));
    return;
  }

  const rawAsOfDate =
    typeof req.query['asOfDate'] === 'string' ? req.query['asOfDate'].trim() : undefined;

  if (rawAsOfDate && !DATE_ONLY_REGEX.test(rawAsOfDate)) {
    next(new AppError(400, 'INVALID_DATE_FILTER', 'asOfDate must be YYYY-MM-DD.'));
    return;
  }

  try {
    const dashboard = await getBusinessFinancialDashboard(
      req.tenantContext.businessId,
      req.authUser.userId,
      rawAsOfDate
    );

    const response: ApiSuccessResponse<BusinessFinancialDashboardDTO> = {
      success: true,
      data: dashboard,
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
 * GET /api/v1/businesses/:businessId/reports/export-csv
 * Requires `reports:export` permission.
 */
export async function getExportFinancialStatementCsvController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.authUser || !req.tenantContext) {
    next(new AppError(401, 'UNAUTHENTICATED', 'Tenant authentication context is missing.'));
    return;
  }

  const rawAsOfDate =
    typeof req.query['asOfDate'] === 'string' ? req.query['asOfDate'].trim() : undefined;

  if (rawAsOfDate && !DATE_ONLY_REGEX.test(rawAsOfDate)) {
    next(new AppError(400, 'INVALID_DATE_FILTER', 'asOfDate must be YYYY-MM-DD.'));
    return;
  }

  try {
    const exported = await exportBusinessFinancialStatementCsv(
      req.tenantContext.businessId,
      req.authUser.userId,
      rawAsOfDate
    );

    const response: ApiSuccessResponse<{ fileName: string; csvContent: string }> = {
      success: true,
      data: exported,
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
 * GET /api/v1/businesses/:businessId/notifications
 */
export async function getTenantNotificationsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.authUser || !req.tenantContext) {
    next(new AppError(401, 'UNAUTHENTICATED', 'Tenant authentication context is missing.'));
    return;
  }

  const unreadOnly = req.query['unreadOnly'] === 'true' || req.query['unreadOnly'] === '1';

  try {
    const notifications = await listTenantNotifications(
      req.tenantContext.businessId,
      req.authUser.userId,
      unreadOnly
    );

    const response: ApiSuccessResponse<NotificationItemDTO[]> = {
      success: true,
      data: notifications,
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
 * POST /api/v1/businesses/:businessId/notifications/:notificationId/read
 */
export async function postMarkNotificationReadController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.authUser || !req.tenantContext) {
    next(new AppError(401, 'UNAUTHENTICATED', 'Tenant authentication context is missing.'));
    return;
  }

  const rawNotificationId = req.params['notificationId'];
  const notificationId =
    typeof rawNotificationId === 'string' ? rawNotificationId : undefined;
  if (!notificationId || !UUID_REGEX.test(notificationId)) {
    next(
      new AppError(
        400,
        'INVALID_NOTIFICATION_ID',
        'notificationId parameter must be a valid UUID.'
      )
    );
    return;
  }

  try {
    const updated = await markTenantNotificationRead(
      req.tenantContext.businessId,
      notificationId,
      req.authUser.userId
    );

    const response: ApiSuccessResponse<NotificationItemDTO> = {
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
