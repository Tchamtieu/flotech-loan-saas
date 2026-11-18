import type { Request, Response, NextFunction } from 'express';
import {
  PlatformRole,
  PermissionCode,
  type AuthenticatedUserContext,
  type TenantMembershipContext,
} from '@flotech/shared';
import { env } from '../config/env.js';
import {
  getFirebaseVerifier,
  type DecodedFirebaseIdentity,
} from '../config/firebase.js';
import { queryPlatform } from '../database/pool.js';
import { AppError } from './errorHandler.js';

declare global {
  namespace Express {
    interface Request {
      decodedFirebaseToken?: DecodedFirebaseIdentity;
      authUser?: AuthenticatedUserContext;
      tenantContext?: TenantMembershipContext;
    }
  }
}

/**
 * 1. Firebase App Check Verification Middleware
 * Verifies the `X-Firebase-AppCheck` header on incoming requests to protect the backend
 * from unauthorized non-client traffic and automated abuse.
 */
export async function verifyAppCheckMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  if (!env.ENFORCE_FIREBASE_APP_CHECK) {
    next();
    return;
  }

  const appCheckToken = req.header('X-Firebase-AppCheck');
  if (!appCheckToken) {
    next(
      new AppError(
        401,
        'APP_CHECK_MISSING',
        'Missing X-Firebase-AppCheck header. Requests must originate from an attested FloTech client.'
      )
    );
    return;
  }

  try {
    await getFirebaseVerifier().verifyAppCheckToken(appCheckToken);
    next();
  } catch {
    next(new AppError(401, 'APP_CHECK_INVALID', 'Invalid or expired Firebase App Check token.'));
  }
}

/**
 * 2A. Firebase JWT Verification Only Middleware (Used by `/api/v1/auth/session` provisioning)
 * Verifies the Bearer token via Firebase Admin SDK and attaches `req.decodedFirebaseToken`.
 */
export async function verifyFirebaseTokenOnlyMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next(
      new AppError(401, 'AUTH_TOKEN_MISSING', 'Missing or malformed Authorization Bearer token.')
    );
    return;
  }

  const idToken = authHeader.slice('Bearer '.length).trim();
  if (!idToken) {
    next(new AppError(401, 'AUTH_TOKEN_EMPTY', 'Authorization Bearer token is empty.'));
    return;
  }

  try {
    const decodedToken = await getFirebaseVerifier().verifyIdToken(idToken, true);
    req.decodedFirebaseToken = decodedToken;
    next();
  } catch {
    next(new AppError(401, 'AUTH_TOKEN_INVALID', 'Invalid or expired Firebase ID token.'));
  }
}

/**
 * 2B. Firebase Authentication & PostgreSQL User Resolution Middleware
 * - Extracts the Bearer ID token from the Authorization header.
 * - Cryptographically verifies the JWT via Firebase Admin SDK (`checkRevoked = true`).
 * - Resolves the canonical user record from PostgreSQL (`users` table).
 *
 * CRITICAL SECURITY RULE:
 * Super Admin status (`platform_role = 'SUPER_ADMIN'`) is ALWAYS read from PostgreSQL,
 * never trusted from client request headers or mutable client claims.
 */
export async function authenticateUserMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next(
      new AppError(401, 'AUTH_TOKEN_MISSING', 'Missing or malformed Authorization Bearer token.')
    );
    return;
  }

  const idToken = authHeader.slice('Bearer '.length).trim();
  if (!idToken) {
    next(new AppError(401, 'AUTH_TOKEN_EMPTY', 'Authorization Bearer token is empty.'));
    return;
  }

  try {
    const decodedToken = await getFirebaseVerifier().verifyIdToken(idToken, true);
    req.decodedFirebaseToken = decodedToken;

    const result = await queryPlatform<{
      id: string;
      firebase_uid: string;
      email: string;
      full_name: string;
      platform_role: PlatformRole;
      is_active: boolean;
    }>(
      `SELECT id, firebase_uid, email, full_name, platform_role, is_active
       FROM users
       WHERE firebase_uid = $1
       LIMIT 1`,
      [decodedToken.uid]
    );

    const userRow = result.rows[0];
    if (!userRow) {
      next(
        new AppError(
          403,
          'USER_PROFILE_NOT_PROVISIONED',
          'Authenticated Firebase identity does not have an active FloTech user profile. Call POST /api/v1/auth/session first.'
        )
      );
      return;
    }

    if (!userRow.is_active) {
      next(
        new AppError(
          403,
          'USER_ACCOUNT_SUSPENDED',
          'Your user account has been suspended. Please contact FloTech Digital support.'
        )
      );
      return;
    }

    req.authUser = {
      userId: userRow.id,
      firebaseUid: userRow.firebase_uid,
      email: userRow.email,
      fullName: userRow.full_name,
      platformRole: userRow.platform_role,
    };

    next();
  } catch (err) {
    if (err instanceof AppError) {
      next(err);
      return;
    }
    next(new AppError(401, 'AUTH_TOKEN_INVALID', 'Invalid or expired Firebase ID token.'));
  }
}

/**
 * 3. Multi-Tenant Business Isolation & Membership Verification Middleware
 *
 * CRITICAL ARCHITECTURAL RULE 6:
 * "Never trust business IDs or permissions supplied by the frontend without backend validation."
 *
 * Whenever a route targets a business (`:businessId` param or `X-Business-Id` header),
 * this middleware queries PostgreSQL to verify that:
 *   1. The business exists and is ACTIVE.
 *   2. The authenticated `req.authUser.userId` holds an ACTIVE `business_memberships` record
 *      in that specific business.
 *   3. The effective `PermissionCode[]` set is loaded directly from PostgreSQL `role_permissions`.
 */
export async function requireTenantMembershipMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.authUser) {
    next(new AppError(401, 'UNAUTHENTICATED', 'Authentication required before tenant resolution.'));
    return;
  }

  const rawParam = req.params['businessId'];
  const businessIdParam =
    (Array.isArray(rawParam) ? rawParam[0] : rawParam) ?? req.header('X-Business-Id');
  if (!businessIdParam) {
    next(
      new AppError(
        400,
        'BUSINESS_CONTEXT_MISSING',
        'A valid businessId route parameter or X-Business-Id header is required.'
      )
    );
    return;
  }

  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(businessIdParam)) {
    next(new AppError(400, 'INVALID_BUSINESS_ID', 'Provided business identifier is not a valid UUID.'));
    return;
  }

  try {
    const membershipResult = await queryPlatform<{
      business_id: string;
      business_name: string;
      business_code: string;
      currency_code: string;
      business_status: string;
      membership_id: string;
      role_id: string;
      role_slug: string;
      role_name: string;
      permissions: PermissionCode[];
    }>(
      `SELECT
         b.id AS business_id,
         b.legal_name AS business_name,
         b.business_code,
         b.currency_code,
         b.status AS business_status,
         bm.id AS membership_id,
         r.id AS role_id,
         r.slug AS role_slug,
         r.name AS role_name,
         COALESCE(
           ARRAY_AGG(rp.permission_code) FILTER (WHERE rp.permission_code IS NOT NULL),
           '{}'
         ) AS permissions
       FROM business_memberships bm
       INNER JOIN businesses b ON b.id = bm.business_id
       INNER JOIN roles r ON r.id = bm.role_id AND r.business_id = bm.business_id
       LEFT JOIN role_permissions rp ON rp.role_id = r.id AND rp.business_id = r.business_id
       WHERE bm.business_id = $1
         AND bm.user_id = $2
         AND bm.status = 'ACTIVE'
       GROUP BY b.id, bm.id, r.id
       LIMIT 1`,
      [businessIdParam, req.authUser.userId]
    );

    const row = membershipResult.rows[0];
    if (!row) {
      next(
        new AppError(
          403,
          'TENANT_ACCESS_DENIED',
          'You do not have an active membership in the requested business.'
        )
      );
      return;
    }

    if (row.business_status !== 'ACTIVE') {
      next(
        new AppError(
          403,
          'BUSINESS_NOT_ACTIVE',
          `Access denied because business status is ${row.business_status}.`
        )
      );
      return;
    }

    req.tenantContext = {
      businessId: row.business_id,
      businessName: row.business_name,
      businessCode: row.business_code,
      currencyCode: row.currency_code,
      membershipId: row.membership_id,
      roleId: row.role_id,
      roleSlug: row.role_slug,
      roleName: row.role_name,
      permissions: row.permissions,
    };

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * 4. Granular Role-Based Access Control (RBAC) Guard
 * Verifies that the authenticated member's PostgreSQL-resolved permission set
 * contains every required permission code for the endpoint.
 */
export function requirePermissions(...requiredPermissions: PermissionCode[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const tenant = req.tenantContext;
    if (!tenant) {
      next(
        new AppError(
          500,
          'TENANT_CONTEXT_UNINITIALIZED',
          'Tenant membership context must be initialized before checking permissions.'
        )
      );
      return;
    }

    const grantedSet = new Set(tenant.permissions);
    const missing = requiredPermissions.filter((perm) => !grantedSet.has(perm));

    if (missing.length > 0) {
      next(
        new AppError(
          403,
          'INSUFFICIENT_PERMISSIONS',
          'Your business role does not grant permission to perform this action.',
          { missingPermissions: missing }
        )
      );
      return;
    }

    next();
  };
}

/**
 * 5. FloTech Digital Super Admin Guard
 * Strictly restricts `/api/v1/super-admin/*` routes to users whose PostgreSQL
 * `users.platform_role` is `SUPER_ADMIN`.
 * Ordinary business owners or employees can NEVER pass this guard.
 */
export function requireSuperAdminMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  if (!req.authUser) {
    next(new AppError(401, 'UNAUTHENTICATED', 'Authentication is required.'));
    return;
  }

  if (req.authUser.platformRole !== PlatformRole.SUPER_ADMIN) {
    next(
      new AppError(
        403,
        'SUPER_ADMIN_REQUIRED',
        'Access restricted to FloTech Digital Super Administrators.'
      )
    );
    return;
  }

  next();
}
