import type { Request, Response, NextFunction } from 'express';
import type {
  ApiSuccessResponse,
  BusinessContextDetailsDTO,
  BusinessOperationalSettingsDTO,
  BusinessProfileDTO,
  SessionContextResponseDTO,
} from '@flotech/shared';
import {
  CreateBusinessRequestSchema,
  UpdateBusinessProfileRequestSchema,
  UpdateBusinessSettingsRequestSchema,
} from '../validation/schemas.js';
import {
  createTenantBusiness,
  getTenantBusinessProfile,
  listUserBusinesses,
  updateTenantBusinessProfile,
  updateTenantBusinessSettings,
} from '../services/businessTenantService.js';
import type { RequestAuditMetadata } from '../services/authProfileService.js';
import { AppError } from '../middleware/errorHandler.js';

function extractAuditMeta(req: Request): RequestAuditMetadata {
  return {
    requestId: req.requestId,
    ipAddress: req.ip ?? null,
    userAgent: req.header('User-Agent') ?? null,
  };
}

/**
 * POST /api/v1/businesses
 * Creates a new multi-tenant business, seeds default RBAC roles & permissions,
 * assigns the creator as `business_owner`, and attaches a `TRIALING` subscription.
 */
export async function postCreateBusinessController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.authUser) {
    next(new AppError(401, 'UNAUTHENTICATED', 'Authentication is required.'));
    return;
  }

  const parsed = CreateBusinessRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    next(
      new AppError(400, 'VALIDATION_ERROR', 'Invalid business creation payload.', {
        issues: parsed.error.flatten(),
      })
    );
    return;
  }

  try {
    const created = await createTenantBusiness(
      req.authUser.userId,
      req.authUser.platformRole,
      parsed.data,
      extractAuditMeta(req)
    );

    const response: ApiSuccessResponse<BusinessContextDetailsDTO> = {
      success: true,
      data: created,
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
 * GET /api/v1/businesses
 * Lists all business memberships for the authenticated user.
 */
export async function getListUserBusinessesController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.authUser) {
    next(new AppError(401, 'UNAUTHENTICATED', 'Authentication is required.'));
    return;
  }

  try {
    const memberships = await listUserBusinesses(req.authUser.userId);
    const response: ApiSuccessResponse<SessionContextResponseDTO['memberships']> = {
      success: true,
      data: memberships,
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
 * GET /api/v1/businesses/:businessId/context
 * Returns the verified tenant business profile and the caller's resolved membership & permissions.
 */
export async function getBusinessContextController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.authUser || !req.tenantContext) {
    next(new AppError(401, 'UNAUTHENTICATED', 'Tenant authentication context is missing.'));
    return;
  }

  try {
    const business = await getTenantBusinessProfile(
      req.tenantContext.businessId,
      req.authUser.userId
    );
    const response: ApiSuccessResponse<BusinessContextDetailsDTO> = {
      success: true,
      data: {
        business,
        membership: req.tenantContext,
      },
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
 * GET /api/v1/businesses/:businessId/profile
 * Requires `business_settings:view` permission.
 */
export async function getBusinessProfileController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.authUser || !req.tenantContext) {
    next(new AppError(401, 'UNAUTHENTICATED', 'Tenant authentication context is missing.'));
    return;
  }

  try {
    const profile = await getTenantBusinessProfile(
      req.tenantContext.businessId,
      req.authUser.userId
    );
    const response: ApiSuccessResponse<BusinessProfileDTO> = {
      success: true,
      data: profile,
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
 * PATCH /api/v1/businesses/:businessId/profile
 * Requires `business_settings:manage` permission.
 */
export async function patchBusinessProfileController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.authUser || !req.tenantContext) {
    next(new AppError(401, 'UNAUTHENTICATED', 'Tenant authentication context is missing.'));
    return;
  }

  const parsed = UpdateBusinessProfileRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    next(
      new AppError(400, 'VALIDATION_ERROR', 'Invalid business profile update payload.', {
        issues: parsed.error.flatten(),
      })
    );
    return;
  }

  try {
    const updated = await updateTenantBusinessProfile(
      req.tenantContext.businessId,
      req.authUser.userId,
      req.authUser.platformRole,
      parsed.data,
      extractAuditMeta(req)
    );
    const response: ApiSuccessResponse<BusinessProfileDTO> = {
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
 * GET /api/v1/businesses/:businessId/settings
 * Requires `business_settings:view` permission.
 */
export async function getBusinessSettingsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.authUser || !req.tenantContext) {
    next(new AppError(401, 'UNAUTHENTICATED', 'Tenant authentication context is missing.'));
    return;
  }

  try {
    const profile = await getTenantBusinessProfile(
      req.tenantContext.businessId,
      req.authUser.userId
    );
    const response: ApiSuccessResponse<BusinessOperationalSettingsDTO> = {
      success: true,
      data: profile.settings,
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
 * PATCH /api/v1/businesses/:businessId/settings
 * Requires `business_settings:manage` permission.
 */
export async function patchBusinessSettingsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.authUser || !req.tenantContext) {
    next(new AppError(401, 'UNAUTHENTICATED', 'Tenant authentication context is missing.'));
    return;
  }

  const parsed = UpdateBusinessSettingsRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    next(
      new AppError(400, 'VALIDATION_ERROR', 'Invalid business operational settings payload.', {
        issues: parsed.error.flatten(),
      })
    );
    return;
  }

  try {
    const updatedSettings = await updateTenantBusinessSettings(
      req.tenantContext.businessId,
      req.authUser.userId,
      req.authUser.platformRole,
      parsed.data,
      extractAuditMeta(req)
    );
    const response: ApiSuccessResponse<BusinessOperationalSettingsDTO> = {
      success: true,
      data: updatedSettings,
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
