import type { Request, Response, NextFunction } from 'express';
import type {
  ApiSuccessResponse,
  PersonalProfileDTO,
  SessionContextResponseDTO,
} from '@flotech/shared';
import {
  ProvisionSessionRequestSchema,
  UpdatePersonalProfileRequestSchema,
} from '../validation/schemas.js';
import {
  getPersonalProfileSession,
  provisionOrSyncUserSession,
  updatePersonalProfile,
  type RequestAuditMetadata,
} from '../services/authProfileService.js';
import { AppError } from '../middleware/errorHandler.js';

function extractAuditMeta(req: Request): RequestAuditMetadata {
  return {
    requestId: req.requestId,
    ipAddress: req.ip ?? null,
    userAgent: req.header('User-Agent') ?? null,
  };
}

/**
 * POST /api/v1/auth/session
 * Verifies the Firebase ID token (`req.decodedFirebaseToken`) and provisions or synchronizes
 * the canonical PostgreSQL `users` record.
 */
export async function postAuthSessionController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.decodedFirebaseToken) {
    next(new AppError(401, 'UNAUTHENTICATED', 'Verified Firebase token context is missing.'));
    return;
  }

  const parsed = ProvisionSessionRequestSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    next(
      new AppError(400, 'VALIDATION_ERROR', 'Invalid session provisioning payload.', {
        issues: parsed.error.flatten(),
      })
    );
    return;
  }

  try {
    const sessionContext = await provisionOrSyncUserSession(
      req.decodedFirebaseToken,
      parsed.data,
      extractAuditMeta(req)
    );

    const response: ApiSuccessResponse<SessionContextResponseDTO> = {
      success: true,
      data: sessionContext,
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
 * GET /api/v1/auth/me
 * Returns the authenticated user's PostgreSQL personal profile and business memberships.
 */
export async function getAuthMeController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.authUser) {
    next(new AppError(401, 'UNAUTHENTICATED', 'Authentication is required.'));
    return;
  }

  try {
    const sessionContext = await getPersonalProfileSession(req.authUser.userId);
    const response: ApiSuccessResponse<SessionContextResponseDTO> = {
      success: true,
      data: sessionContext,
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
 * PATCH /api/v1/auth/me
 * Updates the authenticated user's personal profile (`fullName`, `phoneNumber`, `avatarStoragePath`).
 */
export async function patchAuthMeController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.authUser) {
    next(new AppError(401, 'UNAUTHENTICATED', 'Authentication is required.'));
    return;
  }

  const parsed = UpdatePersonalProfileRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    next(
      new AppError(400, 'VALIDATION_ERROR', 'Invalid personal profile update payload.', {
        issues: parsed.error.flatten(),
      })
    );
    return;
  }

  try {
    const updatedProfile = await updatePersonalProfile(
      req.authUser.userId,
      req.authUser.firebaseUid,
      parsed.data,
      extractAuditMeta(req)
    );

    const response: ApiSuccessResponse<PersonalProfileDTO> = {
      success: true,
      data: updatedProfile,
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
