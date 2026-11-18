import type { Request, Response, NextFunction } from 'express';
import type {
  ApiSuccessResponse,
  BusinessEmployeeDTO,
  BusinessRoleDTO,
  PermissionCatalogItemDTO,
} from '@flotech/shared';
import {
  CreateBusinessRoleRequestSchema,
  InviteOrAddEmployeeRequestSchema,
  UpdateBusinessRoleRequestSchema,
  UpdateEmployeeMembershipRequestSchema,
} from '../validation/schemas.js';
import {
  createCustomBusinessRole,
  inviteOrAddBusinessEmployee,
  listBusinessEmployees,
  listSystemPermissionsCatalog,
  listTenantBusinessRoles,
  updateBusinessEmployeeMembership,
  updateBusinessRole,
} from '../services/rbacEmployeeService.js';
import type { RequestAuditMetadata } from '../services/authProfileService.js';
import { AppError } from '../middleware/errorHandler.js';

function extractAuditMeta(req: Request): RequestAuditMetadata {
  return {
    requestId: req.requestId,
    ipAddress: req.ip ?? null,
    userAgent: req.header('User-Agent') ?? null,
  };
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * GET /api/v1/businesses/:businessId/permissions
 * Requires `roles:view` permission.
 */
export async function getPermissionsCatalogController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const catalog = await listSystemPermissionsCatalog();
    const response: ApiSuccessResponse<PermissionCatalogItemDTO[]> = {
      success: true,
      data: catalog,
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
 * GET /api/v1/businesses/:businessId/roles
 * Requires `roles:view` permission.
 */
export async function getBusinessRolesController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.authUser || !req.tenantContext) {
    next(new AppError(401, 'UNAUTHENTICATED', 'Tenant authentication context is missing.'));
    return;
  }

  try {
    const roles = await listTenantBusinessRoles(
      req.tenantContext.businessId,
      req.authUser.userId
    );
    const response: ApiSuccessResponse<BusinessRoleDTO[]> = {
      success: true,
      data: roles,
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
 * POST /api/v1/businesses/:businessId/roles
 * Requires `roles:manage` permission.
 */
export async function postCreateBusinessRoleController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.authUser || !req.tenantContext) {
    next(new AppError(401, 'UNAUTHENTICATED', 'Tenant authentication context is missing.'));
    return;
  }

  const parsed = CreateBusinessRoleRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    next(
      new AppError(400, 'VALIDATION_ERROR', 'Invalid role creation payload.', {
        issues: parsed.error.flatten(),
      })
    );
    return;
  }

  try {
    const created = await createCustomBusinessRole(
      req.tenantContext.businessId,
      req.authUser.userId,
      req.authUser.platformRole,
      parsed.data,
      extractAuditMeta(req)
    );
    const response: ApiSuccessResponse<BusinessRoleDTO> = {
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
 * PATCH /api/v1/businesses/:businessId/roles/:roleId
 * Requires `roles:manage` permission.
 */
export async function patchBusinessRoleController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.authUser || !req.tenantContext) {
    next(new AppError(401, 'UNAUTHENTICATED', 'Tenant authentication context is missing.'));
    return;
  }

  const rawRoleId = req.params['roleId'];
  const roleId = Array.isArray(rawRoleId) ? rawRoleId[0] : rawRoleId;
  if (!roleId || !UUID_REGEX.test(roleId)) {
    next(new AppError(400, 'INVALID_ROLE_ID', 'Provided roleId is not a valid UUID.'));
    return;
  }

  const parsed = UpdateBusinessRoleRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    next(
      new AppError(400, 'VALIDATION_ERROR', 'Invalid role update payload.', {
        issues: parsed.error.flatten(),
      })
    );
    return;
  }

  try {
    const updated = await updateBusinessRole(
      req.tenantContext.businessId,
      roleId,
      req.authUser.userId,
      req.authUser.platformRole,
      parsed.data,
      extractAuditMeta(req)
    );
    const response: ApiSuccessResponse<BusinessRoleDTO> = {
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
 * GET /api/v1/businesses/:businessId/employees
 * Requires `employees:view` permission.
 */
export async function getBusinessEmployeesController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.authUser || !req.tenantContext) {
    next(new AppError(401, 'UNAUTHENTICATED', 'Tenant authentication context is missing.'));
    return;
  }

  try {
    const employees = await listBusinessEmployees(
      req.tenantContext.businessId,
      req.authUser.userId
    );
    const response: ApiSuccessResponse<BusinessEmployeeDTO[]> = {
      success: true,
      data: employees,
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
 * POST /api/v1/businesses/:businessId/employees
 * Requires `employees:manage` permission.
 */
export async function postInviteOrAddEmployeeController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.authUser || !req.tenantContext) {
    next(new AppError(401, 'UNAUTHENTICATED', 'Tenant authentication context is missing.'));
    return;
  }

  const parsed = InviteOrAddEmployeeRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    next(
      new AppError(400, 'VALIDATION_ERROR', 'Invalid employee onboarding payload.', {
        issues: parsed.error.flatten(),
      })
    );
    return;
  }

  try {
    const created = await inviteOrAddBusinessEmployee(
      req.tenantContext.businessId,
      req.authUser.userId,
      req.authUser.platformRole,
      parsed.data,
      extractAuditMeta(req)
    );
    const response: ApiSuccessResponse<BusinessEmployeeDTO> = {
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
 * PATCH /api/v1/businesses/:businessId/employees/:membershipId
 * Requires `employees:manage` permission.
 */
export async function patchBusinessEmployeeController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.authUser || !req.tenantContext) {
    next(new AppError(401, 'UNAUTHENTICATED', 'Tenant authentication context is missing.'));
    return;
  }

  const rawMembershipId = req.params['membershipId'];
  const membershipId = Array.isArray(rawMembershipId) ? rawMembershipId[0] : rawMembershipId;
  if (!membershipId || !UUID_REGEX.test(membershipId)) {
    next(
      new AppError(400, 'INVALID_MEMBERSHIP_ID', 'Provided membershipId is not a valid UUID.')
    );
    return;
  }

  const parsed = UpdateEmployeeMembershipRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    next(
      new AppError(400, 'VALIDATION_ERROR', 'Invalid employee membership update payload.', {
        issues: parsed.error.flatten(),
      })
    );
    return;
  }

  try {
    const updated = await updateBusinessEmployeeMembership(
      req.tenantContext.businessId,
      membershipId,
      req.authUser.userId,
      req.authUser.platformRole,
      parsed.data,
      extractAuditMeta(req)
    );
    const response: ApiSuccessResponse<BusinessEmployeeDTO> = {
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
