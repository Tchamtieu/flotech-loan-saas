import type { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import type { ApiErrorResponse } from '@flotech/shared';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: Record<string, unknown>;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

export function attachRequestId(req: Request, res: Response, next: NextFunction): void {
  const incomingId = req.header('X-Request-Id');
  const requestId = incomingId && incomingId.length <= 64 ? incomingId : crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
}

export function globalErrorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = req.requestId ?? crypto.randomUUID();
  const timestamp = new Date().toISOString();

  if (err instanceof AppError) {
    const payload: ApiErrorResponse = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
        requestId,
        timestamp,
      },
    };
    res.status(err.statusCode).json(payload);
    return;
  }

  console.error(`[ERROR][${requestId}]`, err);
  const payload: ApiErrorResponse = {
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected internal error occurred.',
      requestId,
      timestamp,
    },
  };
  res.status(500).json(payload);
}
