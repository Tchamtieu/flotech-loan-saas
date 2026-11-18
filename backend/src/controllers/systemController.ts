import type { Request, Response, NextFunction } from 'express';
import type { ApiSuccessResponse, LoanSchedulePreviewSummary } from '@flotech/shared';
import { LoanSchedulePreviewRequestSchema } from '../validation/schemas.js';
import { generateLoanSchedulePreview } from '../financial/decimalEngine.js';
import { AppError } from '../middleware/errorHandler.js';

export function getHealthStatus(req: Request, res: Response): void {
  const payload: ApiSuccessResponse<{
    service: string;
    owner: string;
    phase: string;
    status: 'healthy';
    financialEngine: 'Decimal.js (NUMERIC 19,4)';
    databaseEngine: 'PostgreSQL (Single Source of Truth)';
  }> = {
    success: true,
    data: {
      service: 'flotech-loan-management-api',
      owner: 'FloTech Digital',
      phase: 'PHASE_1_ARCHITECTURE_FOUNDATION',
      status: 'healthy',
      financialEngine: 'Decimal.js (NUMERIC 19,4)',
      databaseEngine: 'PostgreSQL (Single Source of Truth)',
    },
    meta: {
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
    },
  };

  res.status(200).json(payload);
}

/**
 * Backend-authoritative financial schedule calculation endpoint.
 * All critical financial calculations happen on the backend using Decimal.js,
 * never in the frontend using JavaScript floating-point numbers.
 */
export function postScheduleCalculationPreview(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const parsed = LoanSchedulePreviewRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    next(
      new AppError(400, 'VALIDATION_ERROR', 'Invalid loan schedule calculation parameters.', {
        issues: parsed.error.flatten(),
      })
    );
    return;
  }

  try {
    const schedule = generateLoanSchedulePreview(parsed.data);
    const response: ApiSuccessResponse<LoanSchedulePreviewSummary> = {
      success: true,
      data: schedule,
      meta: {
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
      },
    };
    res.status(200).json(response);
  } catch (err) {
    next(
      new AppError(
        400,
        'FINANCIAL_CALCULATION_ERROR',
        err instanceof Error ? err.message : 'Unable to compute loan schedule.'
      )
    );
  }
}
