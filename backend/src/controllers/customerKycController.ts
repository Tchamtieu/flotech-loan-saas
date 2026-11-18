import type { Request, Response, NextFunction } from 'express';
import {
  PermissionCode,
  type ApiSuccessResponse,
  type CustomerDetailsResponseDTO,
  type CustomerDocumentDTO,
  type CustomerDTO,
  type CustomerRiskTier,
} from '@flotech/shared';
import {
  CreateCustomerDocumentRequestSchema,
  CreateCustomerRequestSchema,
  CustomerRiskTierSchema,
  UpdateCustomerRequestSchema,
} from '../validation/schemas.js';
import {
  addCustomerKycDocument,
  createTenantCustomer,
  getTenantCustomerDetails,
  listTenantCustomers,
  updateTenantCustomer,
  verifyCustomerKycDocument,
} from '../services/customerKycService.js';
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
 * GET /api/v1/businesses/:businessId/customers
 * Requires `customers:view` permission.
 */
export async function getCustomersController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.authUser || !req.tenantContext) {
    next(new AppError(401, 'UNAUTHENTICATED', 'Tenant authentication context is missing.'));
    return;
  }

  try {
    const rawQ = req.query['q'];
    const q = typeof rawQ === 'string' ? rawQ.trim() : undefined;

    const rawRiskTier = req.query['riskTier'];
    let riskTier: CustomerRiskTier | undefined;
    if (typeof rawRiskTier === 'string' && rawRiskTier.trim().length > 0) {
      const parsedTier = CustomerRiskTierSchema.safeParse(rawRiskTier.trim().toUpperCase());
      if (!parsedTier.success) {
        next(
          new AppError(
            400,
            'INVALID_RISK_TIER',
            'riskTier must be LOW, STANDARD, HIGH, or RESTRICTED.'
          )
        );
        return;
      }
      riskTier = parsedTier.data;
    }

    const rawIncludeArchived = req.query['includeArchived'];
    const includeArchived =
      rawIncludeArchived === 'true' || rawIncludeArchived === '1';

    const customers = await listTenantCustomers(
      req.tenantContext.businessId,
      req.authUser.userId,
      { q, riskTier, includeArchived }
    );

    const response: ApiSuccessResponse<CustomerDTO[]> = {
      success: true,
      data: customers,
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
 * POST /api/v1/businesses/:businessId/customers
 * Requires `customers:create` permission.
 */
export async function postCreateCustomerController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.authUser || !req.tenantContext) {
    next(new AppError(401, 'UNAUTHENTICATED', 'Tenant authentication context is missing.'));
    return;
  }

  const parsed = CreateCustomerRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    next(
      new AppError(400, 'VALIDATION_ERROR', 'Invalid customer onboarding payload.', {
        issues: parsed.error.flatten(),
      })
    );
    return;
  }

  try {
    const created = await createTenantCustomer(
      req.tenantContext.businessId,
      req.authUser.userId,
      req.authUser.platformRole,
      parsed.data,
      extractAuditMeta(req)
    );

    const response: ApiSuccessResponse<CustomerDTO> = {
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
 * GET /api/v1/businesses/:businessId/customers/:customerId
 * Requires `customers:view` permission.
 */
export async function getCustomerDetailsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.authUser || !req.tenantContext) {
    next(new AppError(401, 'UNAUTHENTICATED', 'Tenant authentication context is missing.'));
    return;
  }

  const rawCustomerId = req.params['customerId'];
  const customerId = Array.isArray(rawCustomerId) ? rawCustomerId[0] : rawCustomerId;
  if (!customerId || !UUID_REGEX.test(customerId)) {
    next(new AppError(400, 'INVALID_CUSTOMER_ID', 'Provided customerId is not a valid UUID.'));
    return;
  }

  try {
    const details = await getTenantCustomerDetails(
      req.tenantContext.businessId,
      customerId,
      req.authUser.userId
    );

    const response: ApiSuccessResponse<CustomerDetailsResponseDTO> = {
      success: true,
      data: details,
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
 * PATCH /api/v1/businesses/:businessId/customers/:customerId
 * Enforces `customers:archive` when `isArchived` is modified and `customers:update` when profile fields are modified.
 */
export async function patchCustomerController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.authUser || !req.tenantContext) {
    next(new AppError(401, 'UNAUTHENTICATED', 'Tenant authentication context is missing.'));
    return;
  }

  const rawCustomerId = req.params['customerId'];
  const customerId = Array.isArray(rawCustomerId) ? rawCustomerId[0] : rawCustomerId;
  if (!customerId || !UUID_REGEX.test(customerId)) {
    next(new AppError(400, 'INVALID_CUSTOMER_ID', 'Provided customerId is not a valid UUID.'));
    return;
  }

  const parsed = UpdateCustomerRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    next(
      new AppError(400, 'VALIDATION_ERROR', 'Invalid customer update payload.', {
        issues: parsed.error.flatten(),
      })
    );
    return;
  }

  const grantedPermissions = new Set(req.tenantContext.permissions);
  const nonArchiveFields = Object.keys(parsed.data).filter((k) => k !== 'isArchived');

  if (parsed.data.isArchived !== undefined && !grantedPermissions.has(PermissionCode.CUSTOMERS_ARCHIVE)) {
    next(
      new AppError(
        403,
        'INSUFFICIENT_PERMISSIONS',
        'Archiving or restoring a customer requires the customers:archive permission.',
        { missingPermissions: [PermissionCode.CUSTOMERS_ARCHIVE] }
      )
    );
    return;
  }

  if (nonArchiveFields.length > 0 && !grantedPermissions.has(PermissionCode.CUSTOMERS_UPDATE)) {
    next(
      new AppError(
        403,
        'INSUFFICIENT_PERMISSIONS',
        'Updating customer profile fields requires the customers:update permission.',
        { missingPermissions: [PermissionCode.CUSTOMERS_UPDATE] }
      )
    );
    return;
  }

  try {
    const updated = await updateTenantCustomer(
      req.tenantContext.businessId,
      customerId,
      req.authUser.userId,
      req.authUser.platformRole,
      parsed.data,
      extractAuditMeta(req)
    );

    const response: ApiSuccessResponse<CustomerDTO> = {
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
 * POST /api/v1/businesses/:businessId/customers/:customerId/documents
 * Requires `customers:update` permission.
 */
export async function postAddCustomerKycDocumentController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.authUser || !req.tenantContext) {
    next(new AppError(401, 'UNAUTHENTICATED', 'Tenant authentication context is missing.'));
    return;
  }

  const rawCustomerId = req.params['customerId'];
  const customerId = Array.isArray(rawCustomerId) ? rawCustomerId[0] : rawCustomerId;
  if (!customerId || !UUID_REGEX.test(customerId)) {
    next(new AppError(400, 'INVALID_CUSTOMER_ID', 'Provided customerId is not a valid UUID.'));
    return;
  }

  const parsed = CreateCustomerDocumentRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    next(
      new AppError(400, 'VALIDATION_ERROR', 'Invalid customer KYC document payload.', {
        issues: parsed.error.flatten(),
      })
    );
    return;
  }

  try {
    const createdDoc = await addCustomerKycDocument(
      req.tenantContext.businessId,
      customerId,
      req.authUser.userId,
      req.authUser.platformRole,
      parsed.data,
      extractAuditMeta(req)
    );

    const response: ApiSuccessResponse<CustomerDocumentDTO> = {
      success: true,
      data: createdDoc,
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
 * POST /api/v1/businesses/:businessId/customers/:customerId/documents/:documentId/verify
 * Requires `customers:update` permission.
 */
export async function postVerifyCustomerKycDocumentController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.authUser || !req.tenantContext) {
    next(new AppError(401, 'UNAUTHENTICATED', 'Tenant authentication context is missing.'));
    return;
  }

  const rawCustomerId = req.params['customerId'];
  const customerId = Array.isArray(rawCustomerId) ? rawCustomerId[0] : rawCustomerId;
  if (!customerId || !UUID_REGEX.test(customerId)) {
    next(new AppError(400, 'INVALID_CUSTOMER_ID', 'Provided customerId is not a valid UUID.'));
    return;
  }

  const rawDocumentId = req.params['documentId'];
  const documentId = Array.isArray(rawDocumentId) ? rawDocumentId[0] : rawDocumentId;
  if (!documentId || !UUID_REGEX.test(documentId)) {
    next(new AppError(400, 'INVALID_DOCUMENT_ID', 'Provided documentId is not a valid UUID.'));
    return;
  }

  try {
    const verifiedDoc = await verifyCustomerKycDocument(
      req.tenantContext.businessId,
      customerId,
      documentId,
      req.authUser.userId,
      req.authUser.platformRole,
      extractAuditMeta(req)
    );

    const response: ApiSuccessResponse<CustomerDocumentDTO> = {
      success: true,
      data: verifiedDoc,
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
