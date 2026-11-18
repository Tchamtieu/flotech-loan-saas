import type { Request, Response, NextFunction } from 'express';
import {
  LoanStatus,
  type ApiSuccessResponse,
  type LoanDetailsResponseDTO,
  type LoanDTO,
  type LoanProductDTO,
} from '@flotech/shared';
import {
  CreateLoanApplicationRequestSchema,
  CreateLoanProductRequestSchema,
  LoanLifecycleActionRequestSchema,
  UpdateLoanProductRequestSchema,
} from '../validation/schemas.js';
import {
  approveLoanApplication,
  createLoanApplication,
  createTenantLoanProduct,
  disburseApprovedLoan,
  getTenantLoanDetails,
  listTenantLoanProducts,
  listTenantLoans,
  rejectLoanApplication,
  reviewLoanApplication,
  submitDraftLoanApplication,
  updateTenantLoanProduct,
} from '../services/loanManagementService.js';
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
 * GET /api/v1/businesses/:businessId/loan-products
 * Requires `loan_products:view` permission.
 */
export async function getLoanProductsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.authUser || !req.tenantContext) {
    next(new AppError(401, 'UNAUTHENTICATED', 'Tenant authentication context is missing.'));
    return;
  }

  try {
    const rawIncludeInactive = req.query['includeInactive'];
    const includeInactive =
      rawIncludeInactive === undefined ||
      rawIncludeInactive === 'true' ||
      rawIncludeInactive === '1';

    const products = await listTenantLoanProducts(
      req.tenantContext.businessId,
      req.authUser.userId,
      includeInactive
    );

    const response: ApiSuccessResponse<LoanProductDTO[]> = {
      success: true,
      data: products,
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
 * POST /api/v1/businesses/:businessId/loan-products
 * Requires `loan_products:manage` permission.
 */
export async function postCreateLoanProductController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.authUser || !req.tenantContext) {
    next(new AppError(401, 'UNAUTHENTICATED', 'Tenant authentication context is missing.'));
    return;
  }

  const parsed = CreateLoanProductRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    next(
      new AppError(400, 'VALIDATION_ERROR', 'Invalid loan product creation payload.', {
        issues: parsed.error.flatten(),
      })
    );
    return;
  }

  try {
    const created = await createTenantLoanProduct(
      req.tenantContext.businessId,
      req.authUser.userId,
      req.authUser.platformRole,
      parsed.data,
      extractAuditMeta(req)
    );

    const response: ApiSuccessResponse<LoanProductDTO> = {
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
 * PATCH /api/v1/businesses/:businessId/loan-products/:productId
 * Requires `loan_products:manage` permission.
 */
export async function patchLoanProductController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.authUser || !req.tenantContext) {
    next(new AppError(401, 'UNAUTHENTICATED', 'Tenant authentication context is missing.'));
    return;
  }

  const rawProductId = req.params['productId'];
  const productId = Array.isArray(rawProductId) ? rawProductId[0] : rawProductId;
  if (!productId || !UUID_REGEX.test(productId)) {
    next(new AppError(400, 'INVALID_PRODUCT_ID', 'Provided productId is not a valid UUID.'));
    return;
  }

  const parsed = UpdateLoanProductRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    next(
      new AppError(400, 'VALIDATION_ERROR', 'Invalid loan product update payload.', {
        issues: parsed.error.flatten(),
      })
    );
    return;
  }

  try {
    const updated = await updateTenantLoanProduct(
      req.tenantContext.businessId,
      productId,
      req.authUser.userId,
      req.authUser.platformRole,
      parsed.data,
      extractAuditMeta(req)
    );

    const response: ApiSuccessResponse<LoanProductDTO> = {
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
 * GET /api/v1/businesses/:businessId/loans
 * Requires `loans:view` permission.
 */
export async function getLoansController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.authUser || !req.tenantContext) {
    next(new AppError(401, 'UNAUTHENTICATED', 'Tenant authentication context is missing.'));
    return;
  }

  try {
    const rawStatus = req.query['status'];
    let status: LoanStatus | undefined;
    if (typeof rawStatus === 'string' && rawStatus.trim().length > 0) {
      const candidate = rawStatus.trim().toUpperCase() as LoanStatus;
      if (!Object.values(LoanStatus).includes(candidate)) {
        next(new AppError(400, 'INVALID_LOAN_STATUS', 'Invalid loan status filter.'));
        return;
      }
      status = candidate;
    }

    const rawCustomerId = req.query['customerId'];
    let customerId: string | undefined;
    if (typeof rawCustomerId === 'string' && rawCustomerId.trim().length > 0) {
      if (!UUID_REGEX.test(rawCustomerId.trim())) {
        next(new AppError(400, 'INVALID_CUSTOMER_ID', 'customerId filter must be a valid UUID.'));
        return;
      }
      customerId = rawCustomerId.trim();
    }

    const rawProductId = req.query['loanProductId'];
    let loanProductId: string | undefined;
    if (typeof rawProductId === 'string' && rawProductId.trim().length > 0) {
      if (!UUID_REGEX.test(rawProductId.trim())) {
        next(
          new AppError(
            400,
            'INVALID_LOAN_PRODUCT_ID',
            'loanProductId filter must be a valid UUID.'
          )
        );
        return;
      }
      loanProductId = rawProductId.trim();
    }

    const rawQ = req.query['q'];
    const q = typeof rawQ === 'string' ? rawQ.trim() : undefined;

    const loans = await listTenantLoans(
      req.tenantContext.businessId,
      req.authUser.userId,
      { status, customerId, loanProductId, q }
    );

    const response: ApiSuccessResponse<LoanDTO[]> = {
      success: true,
      data: loans,
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
 * POST /api/v1/businesses/:businessId/loans
 * Requires `loans:create` permission.
 */
export async function postCreateLoanApplicationController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.authUser || !req.tenantContext) {
    next(new AppError(401, 'UNAUTHENTICATED', 'Tenant authentication context is missing.'));
    return;
  }

  const parsed = CreateLoanApplicationRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    next(
      new AppError(400, 'VALIDATION_ERROR', 'Invalid loan application payload.', {
        issues: parsed.error.flatten(),
      })
    );
    return;
  }

  try {
    const created = await createLoanApplication(
      req.tenantContext.businessId,
      req.authUser.userId,
      req.authUser.platformRole,
      parsed.data,
      extractAuditMeta(req)
    );

    const response: ApiSuccessResponse<LoanDTO> = {
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
 * GET /api/v1/businesses/:businessId/loans/:loanId
 * Requires `loans:view` permission.
 */
export async function getLoanDetailsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.authUser || !req.tenantContext) {
    next(new AppError(401, 'UNAUTHENTICATED', 'Tenant authentication context is missing.'));
    return;
  }

  const rawLoanId = req.params['loanId'];
  const loanId = Array.isArray(rawLoanId) ? rawLoanId[0] : rawLoanId;
  if (!loanId || !UUID_REGEX.test(loanId)) {
    next(new AppError(400, 'INVALID_LOAN_ID', 'Provided loanId is not a valid UUID.'));
    return;
  }

  try {
    const details = await getTenantLoanDetails(
      req.tenantContext.businessId,
      loanId,
      req.authUser.userId
    );

    const response: ApiSuccessResponse<LoanDetailsResponseDTO> = {
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
 * POST /api/v1/businesses/:businessId/loans/:loanId/submit
 * Requires `loans:create` permission.
 */
export async function postSubmitLoanApplicationController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.authUser || !req.tenantContext) {
    next(new AppError(401, 'UNAUTHENTICATED', 'Tenant authentication context is missing.'));
    return;
  }

  const rawLoanId = req.params['loanId'];
  const loanId = Array.isArray(rawLoanId) ? rawLoanId[0] : rawLoanId;
  if (!loanId || !UUID_REGEX.test(loanId)) {
    next(new AppError(400, 'INVALID_LOAN_ID', 'Provided loanId is not a valid UUID.'));
    return;
  }

  const parsed = LoanLifecycleActionRequestSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    next(
      new AppError(400, 'VALIDATION_ERROR', 'Invalid loan submit payload.', {
        issues: parsed.error.flatten(),
      })
    );
    return;
  }

  try {
    const updated = await submitDraftLoanApplication(
      req.tenantContext.businessId,
      loanId,
      req.authUser.userId,
      req.authUser.platformRole,
      parsed.data,
      extractAuditMeta(req)
    );

    const response: ApiSuccessResponse<LoanDTO> = {
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
 * POST /api/v1/businesses/:businessId/loans/:loanId/review
 * Requires `loans:review` permission.
 */
export async function postReviewLoanApplicationController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.authUser || !req.tenantContext) {
    next(new AppError(401, 'UNAUTHENTICATED', 'Tenant authentication context is missing.'));
    return;
  }

  const rawLoanId = req.params['loanId'];
  const loanId = Array.isArray(rawLoanId) ? rawLoanId[0] : rawLoanId;
  if (!loanId || !UUID_REGEX.test(loanId)) {
    next(new AppError(400, 'INVALID_LOAN_ID', 'Provided loanId is not a valid UUID.'));
    return;
  }

  const parsed = LoanLifecycleActionRequestSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    next(
      new AppError(400, 'VALIDATION_ERROR', 'Invalid loan review payload.', {
        issues: parsed.error.flatten(),
      })
    );
    return;
  }

  try {
    const updated = await reviewLoanApplication(
      req.tenantContext.businessId,
      loanId,
      req.authUser.userId,
      req.authUser.platformRole,
      parsed.data,
      extractAuditMeta(req)
    );

    const response: ApiSuccessResponse<LoanDTO> = {
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
 * POST /api/v1/businesses/:businessId/loans/:loanId/approve
 * Requires `loans:approve` permission.
 */
export async function postApproveLoanApplicationController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.authUser || !req.tenantContext) {
    next(new AppError(401, 'UNAUTHENTICATED', 'Tenant authentication context is missing.'));
    return;
  }

  const rawLoanId = req.params['loanId'];
  const loanId = Array.isArray(rawLoanId) ? rawLoanId[0] : rawLoanId;
  if (!loanId || !UUID_REGEX.test(loanId)) {
    next(new AppError(400, 'INVALID_LOAN_ID', 'Provided loanId is not a valid UUID.'));
    return;
  }

  const parsed = LoanLifecycleActionRequestSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    next(
      new AppError(400, 'VALIDATION_ERROR', 'Invalid loan approval payload.', {
        issues: parsed.error.flatten(),
      })
    );
    return;
  }

  try {
    const updated = await approveLoanApplication(
      req.tenantContext.businessId,
      loanId,
      req.authUser.userId,
      req.authUser.platformRole,
      parsed.data,
      extractAuditMeta(req)
    );

    const response: ApiSuccessResponse<LoanDTO> = {
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
 * POST /api/v1/businesses/:businessId/loans/:loanId/reject
 * Requires `loans:reject` permission.
 */
export async function postRejectLoanApplicationController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.authUser || !req.tenantContext) {
    next(new AppError(401, 'UNAUTHENTICATED', 'Tenant authentication context is missing.'));
    return;
  }

  const rawLoanId = req.params['loanId'];
  const loanId = Array.isArray(rawLoanId) ? rawLoanId[0] : rawLoanId;
  if (!loanId || !UUID_REGEX.test(loanId)) {
    next(new AppError(400, 'INVALID_LOAN_ID', 'Provided loanId is not a valid UUID.'));
    return;
  }

  const parsed = LoanLifecycleActionRequestSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    next(
      new AppError(400, 'VALIDATION_ERROR', 'Invalid loan rejection payload.', {
        issues: parsed.error.flatten(),
      })
    );
    return;
  }

  try {
    const updated = await rejectLoanApplication(
      req.tenantContext.businessId,
      loanId,
      req.authUser.userId,
      req.authUser.platformRole,
      parsed.data,
      extractAuditMeta(req)
    );

    const response: ApiSuccessResponse<LoanDTO> = {
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
 * POST /api/v1/businesses/:businessId/loans/:loanId/disburse
 * Requires `loans:disburse` permission.
 */
export async function postDisburseLoanController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.authUser || !req.tenantContext) {
    next(new AppError(401, 'UNAUTHENTICATED', 'Tenant authentication context is missing.'));
    return;
  }

  const rawLoanId = req.params['loanId'];
  const loanId = Array.isArray(rawLoanId) ? rawLoanId[0] : rawLoanId;
  if (!loanId || !UUID_REGEX.test(loanId)) {
    next(new AppError(400, 'INVALID_LOAN_ID', 'Provided loanId is not a valid UUID.'));
    return;
  }

  const parsed = LoanLifecycleActionRequestSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    next(
      new AppError(400, 'VALIDATION_ERROR', 'Invalid loan disbursement payload.', {
        issues: parsed.error.flatten(),
      })
    );
    return;
  }

  try {
    const details = await disburseApprovedLoan(
      req.tenantContext.businessId,
      loanId,
      req.authUser.userId,
      req.authUser.platformRole,
      parsed.data,
      extractAuditMeta(req)
    );

    const response: ApiSuccessResponse<LoanDetailsResponseDTO> = {
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
