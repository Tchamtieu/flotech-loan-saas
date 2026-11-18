import type { Request, Response, NextFunction } from 'express';
import {
  RepaymentMethod,
  type ApiSuccessResponse,
  type PaymentReceiptDTO,
  type RepaymentDetailsResponseDTO,
  type RepaymentDTO,
} from '@flotech/shared';
import {
  RecordRepaymentRequestSchema,
  ReverseRepaymentRequestSchema,
} from '../validation/schemas.js';
import {
  getTenantPaymentReceipt,
  getTenantRepaymentDetails,
  listTenantRepayments,
  recordTenantLoanRepayment,
  reverseTenantLoanRepayment,
} from '../services/repaymentManagementService.js';
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
 * GET /api/v1/businesses/:businessId/repayments
 * Requires `repayments:view` permission.
 */
export async function getRepaymentsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.authUser || !req.tenantContext) {
    next(new AppError(401, 'UNAUTHENTICATED', 'Tenant authentication context is missing.'));
    return;
  }

  const rawLoanId =
    typeof req.query['loanId'] === 'string' ? req.query['loanId'].trim() : undefined;
  const rawCustomerId =
    typeof req.query['customerId'] === 'string' ? req.query['customerId'].trim() : undefined;
  const rawPaymentMethod =
    typeof req.query['paymentMethod'] === 'string'
      ? req.query['paymentMethod'].trim()
      : undefined;
  const rawIncludeReversed = req.query['includeReversed'];

  if (rawLoanId && !UUID_REGEX.test(rawLoanId)) {
    next(new AppError(400, 'INVALID_LOAN_ID', 'loanId query filter must be a valid UUID.'));
    return;
  }

  if (rawCustomerId && !UUID_REGEX.test(rawCustomerId)) {
    next(
      new AppError(400, 'INVALID_CUSTOMER_ID', 'customerId query filter must be a valid UUID.')
    );
    return;
  }

  if (
    rawPaymentMethod &&
    !Object.values(RepaymentMethod).includes(rawPaymentMethod as RepaymentMethod)
  ) {
    next(
      new AppError(
        400,
        'INVALID_PAYMENT_METHOD',
        `Invalid paymentMethod query filter: ${rawPaymentMethod}`
      )
    );
    return;
  }

  const includeReversed =
    rawIncludeReversed === undefined ||
    rawIncludeReversed === 'true' ||
    rawIncludeReversed === '1';

  try {
    const repayments = await listTenantRepayments(
      req.tenantContext.businessId,
      req.authUser.userId,
      {
        loanId: rawLoanId,
        customerId: rawCustomerId,
        paymentMethod: rawPaymentMethod as RepaymentMethod | undefined,
        includeReversed,
      }
    );

    const response: ApiSuccessResponse<RepaymentDTO[]> = {
      success: true,
      data: repayments,
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
 * POST /api/v1/businesses/:businessId/repayments
 * Requires `repayments:record` permission.
 */
export async function postRecordRepaymentController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.authUser || !req.tenantContext) {
    next(new AppError(401, 'UNAUTHENTICATED', 'Tenant authentication context is missing.'));
    return;
  }

  const parsed = RecordRepaymentRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    next(
      new AppError(400, 'VALIDATION_ERROR', 'Invalid repayment payload.', {
        issues: parsed.error.flatten(),
      })
    );
    return;
  }

  try {
    const recorded = await recordTenantLoanRepayment(
      req.tenantContext.businessId,
      req.authUser.userId,
      req.authUser.platformRole,
      parsed.data,
      extractAuditMeta(req)
    );

    const response: ApiSuccessResponse<RepaymentDetailsResponseDTO> = {
      success: true,
      data: recorded,
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
 * GET /api/v1/businesses/:businessId/repayments/:repaymentId
 * Requires `repayments:view` permission.
 */
export async function getRepaymentDetailsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.authUser || !req.tenantContext) {
    next(new AppError(401, 'UNAUTHENTICATED', 'Tenant authentication context is missing.'));
    return;
  }

  const rawRepaymentId = req.params['repaymentId'];
  const repaymentId = typeof rawRepaymentId === 'string' ? rawRepaymentId : undefined;
  if (!repaymentId || !UUID_REGEX.test(repaymentId)) {
    next(new AppError(400, 'INVALID_REPAYMENT_ID', 'repaymentId parameter must be a valid UUID.'));
    return;
  }

  try {
    const details = await getTenantRepaymentDetails(
      req.tenantContext.businessId,
      repaymentId,
      req.authUser.userId
    );

    const response: ApiSuccessResponse<RepaymentDetailsResponseDTO> = {
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
 * POST /api/v1/businesses/:businessId/repayments/:repaymentId/reverse
 * Requires `repayments:reverse` permission.
 */
export async function postReverseRepaymentController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.authUser || !req.tenantContext) {
    next(new AppError(401, 'UNAUTHENTICATED', 'Tenant authentication context is missing.'));
    return;
  }

  const rawRepaymentId = req.params['repaymentId'];
  const repaymentId = typeof rawRepaymentId === 'string' ? rawRepaymentId : undefined;
  if (!repaymentId || !UUID_REGEX.test(repaymentId)) {
    next(new AppError(400, 'INVALID_REPAYMENT_ID', 'repaymentId parameter must be a valid UUID.'));
    return;
  }

  const parsed = ReverseRepaymentRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    next(
      new AppError(400, 'VALIDATION_ERROR', 'Invalid repayment reversal payload.', {
        issues: parsed.error.flatten(),
      })
    );
    return;
  }

  try {
    const reversed = await reverseTenantLoanRepayment(
      req.tenantContext.businessId,
      repaymentId,
      req.authUser.userId,
      req.authUser.platformRole,
      parsed.data,
      extractAuditMeta(req)
    );

    const response: ApiSuccessResponse<RepaymentDetailsResponseDTO> = {
      success: true,
      data: reversed,
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
 * GET /api/v1/businesses/:businessId/repayments/:repaymentId/receipt
 * Requires `repayments:view` permission.
 */
export async function getPaymentReceiptController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.authUser || !req.tenantContext) {
    next(new AppError(401, 'UNAUTHENTICATED', 'Tenant authentication context is missing.'));
    return;
  }

  const rawRepaymentId = req.params['repaymentId'];
  const repaymentId = typeof rawRepaymentId === 'string' ? rawRepaymentId : undefined;
  if (!repaymentId || !UUID_REGEX.test(repaymentId)) {
    next(new AppError(400, 'INVALID_REPAYMENT_ID', 'repaymentId parameter must be a valid UUID.'));
    return;
  }

  try {
    const receipt = await getTenantPaymentReceipt(
      req.tenantContext.businessId,
      repaymentId,
      req.authUser.userId
    );

    const response: ApiSuccessResponse<PaymentReceiptDTO> = {
      success: true,
      data: receipt,
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
