import type { Request, Response, NextFunction } from 'express';
import {
  InstallmentStatus,
  type ApiSuccessResponse,
  type InstallmentWithLoanContextDTO,
  type LoanDetailsResponseDTO,
  type LoanDTO,
  type OverdueEvaluationResultDTO,
  type OverdueLoanSummaryDTO,
} from '@flotech/shared';
import {
  EvaluateOverdueSchedulesRequestSchema,
  RestructureLoanRequestSchema,
  WriteOffLoanRequestSchema,
} from '../validation/schemas.js';
import {
  evaluateTenantDelinquencyAndPenalties,
  listTenantOverdueLoans,
  listTenantRepaymentSchedules,
  restructureTenantLoan,
  writeOffTenantLoan,
} from '../services/scheduleEngineService.js';
import { AppError } from '../middleware/errorHandler.js';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function extractAuditMeta(req: Request): { ipAddress: string | null; userAgent: string | null } {
  return {
    ipAddress: req.ip ?? null,
    userAgent: req.header('User-Agent') ?? null,
  };
}

/**
 * GET /api/v1/businesses/:businessId/repayment-schedules
 * Requires `loans:view` permission.
 */
export async function getRepaymentSchedulesController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.authUser || !req.tenantContext) {
    next(new AppError(401, 'UNAUTHENTICATED', 'Tenant authentication context is missing.'));
    return;
  }

  const rawStatus = typeof req.query['status'] === 'string' ? req.query['status'].trim() : undefined;
  const rawLoanId = typeof req.query['loanId'] === 'string' ? req.query['loanId'].trim() : undefined;
  const rawCustomerId =
    typeof req.query['customerId'] === 'string' ? req.query['customerId'].trim() : undefined;
  const rawDueFrom =
    typeof req.query['dueFrom'] === 'string' ? req.query['dueFrom'].trim() : undefined;
  const rawDueTo = typeof req.query['dueTo'] === 'string' ? req.query['dueTo'].trim() : undefined;
  const rawOverdueOnly = req.query['overdueOnly'];
  const rawAsOfDate =
    typeof req.query['asOfDate'] === 'string' ? req.query['asOfDate'].trim() : undefined;

  if (
    rawStatus &&
    !Object.values(InstallmentStatus).includes(rawStatus as InstallmentStatus)
  ) {
    next(new AppError(400, 'INVALID_INSTALLMENT_STATUS', `Invalid installment status: ${rawStatus}`));
    return;
  }

  if (rawLoanId && !UUID_REGEX.test(rawLoanId)) {
    next(new AppError(400, 'INVALID_LOAN_ID', 'loanId query filter must be a valid UUID.'));
    return;
  }

  if (rawCustomerId && !UUID_REGEX.test(rawCustomerId)) {
    next(new AppError(400, 'INVALID_CUSTOMER_ID', 'customerId query filter must be a valid UUID.'));
    return;
  }

  if (rawDueFrom && !DATE_ONLY_REGEX.test(rawDueFrom)) {
    next(new AppError(400, 'INVALID_DATE_FILTER', 'dueFrom must be YYYY-MM-DD.'));
    return;
  }

  if (rawDueTo && !DATE_ONLY_REGEX.test(rawDueTo)) {
    next(new AppError(400, 'INVALID_DATE_FILTER', 'dueTo must be YYYY-MM-DD.'));
    return;
  }

  if (rawAsOfDate && !DATE_ONLY_REGEX.test(rawAsOfDate)) {
    next(new AppError(400, 'INVALID_DATE_FILTER', 'asOfDate must be YYYY-MM-DD.'));
    return;
  }

  const overdueOnly = rawOverdueOnly === 'true' || rawOverdueOnly === '1';

  try {
    const schedules = await listTenantRepaymentSchedules(
      req.tenantContext.businessId,
      req.authUser.userId,
      {
        status: rawStatus as InstallmentStatus | undefined,
        loanId: rawLoanId,
        customerId: rawCustomerId,
        dueFrom: rawDueFrom,
        dueTo: rawDueTo,
        overdueOnly,
        asOfDate: rawAsOfDate,
      }
    );

    const response: ApiSuccessResponse<InstallmentWithLoanContextDTO[]> = {
      success: true,
      data: schedules,
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
 * POST /api/v1/businesses/:businessId/repayment-schedules/evaluate-overdue
 * Requires `loans:review` permission.
 */
export async function postEvaluateOverdueSchedulesController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.authUser || !req.tenantContext) {
    next(new AppError(401, 'UNAUTHENTICATED', 'Tenant authentication context is missing.'));
    return;
  }

  const parsed = EvaluateOverdueSchedulesRequestSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    next(
      new AppError(400, 'VALIDATION_ERROR', 'Invalid delinquency evaluation payload.', {
        issues: parsed.error.flatten(),
      })
    );
    return;
  }

  try {
    const result = await evaluateTenantDelinquencyAndPenalties(
      req.tenantContext.businessId,
      req.authUser.userId,
      req.authUser.platformRole,
      parsed.data,
      extractAuditMeta(req)
    );

    const response: ApiSuccessResponse<OverdueEvaluationResultDTO> = {
      success: true,
      data: result,
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
 * GET /api/v1/businesses/:businessId/overdue-loans
 * Requires `loans:view` permission.
 */
export async function getOverdueLoansController(
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
    const overdueLoans = await listTenantOverdueLoans(
      req.tenantContext.businessId,
      req.authUser.userId,
      rawAsOfDate
    );

    const response: ApiSuccessResponse<OverdueLoanSummaryDTO[]> = {
      success: true,
      data: overdueLoans,
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
 * POST /api/v1/businesses/:businessId/loans/:loanId/restructure
 * Requires `loans:restructure` permission.
 */
export async function postRestructureLoanController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.authUser || !req.tenantContext) {
    next(new AppError(401, 'UNAUTHENTICATED', 'Tenant authentication context is missing.'));
    return;
  }

  const rawLoanId = req.params['loanId'];
  const loanId = typeof rawLoanId === 'string' ? rawLoanId : undefined;
  if (!loanId || !UUID_REGEX.test(loanId)) {
    next(new AppError(400, 'INVALID_LOAN_ID', 'loanId parameter must be a valid UUID.'));
    return;
  }

  const parsed = RestructureLoanRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    next(
      new AppError(400, 'VALIDATION_ERROR', 'Invalid loan restructure payload.', {
        issues: parsed.error.flatten(),
      })
    );
    return;
  }

  try {
    const restructured = await restructureTenantLoan(
      req.tenantContext.businessId,
      loanId,
      req.authUser.userId,
      req.authUser.platformRole,
      parsed.data,
      extractAuditMeta(req)
    );

    const response: ApiSuccessResponse<LoanDetailsResponseDTO> = {
      success: true,
      data: restructured,
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
 * POST /api/v1/businesses/:businessId/loans/:loanId/write-off
 * Requires `loans:write_off` permission.
 */
export async function postWriteOffLoanController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.authUser || !req.tenantContext) {
    next(new AppError(401, 'UNAUTHENTICATED', 'Tenant authentication context is missing.'));
    return;
  }

  const rawLoanId = req.params['loanId'];
  const loanId = typeof rawLoanId === 'string' ? rawLoanId : undefined;
  if (!loanId || !UUID_REGEX.test(loanId)) {
    next(new AppError(400, 'INVALID_LOAN_ID', 'loanId parameter must be a valid UUID.'));
    return;
  }

  const parsed = WriteOffLoanRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    next(
      new AppError(400, 'VALIDATION_ERROR', 'Invalid loan write-off payload.', {
        issues: parsed.error.flatten(),
      })
    );
    return;
  }

  try {
    const writtenOff = await writeOffTenantLoan(
      req.tenantContext.businessId,
      loanId,
      req.authUser.userId,
      req.authUser.platformRole,
      parsed.data,
      extractAuditMeta(req)
    );

    const response: ApiSuccessResponse<LoanDTO> = {
      success: true,
      data: writtenOff,
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
