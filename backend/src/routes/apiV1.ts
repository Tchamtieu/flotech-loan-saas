import { Router } from 'express';
import { PermissionCode } from '@flotech/shared';
import {
  getHealthStatus,
  postScheduleCalculationPreview,
} from '../controllers/systemController.js';
import {
  getAuthMeController,
  patchAuthMeController,
  postAuthSessionController,
} from '../controllers/authProfileController.js';
import {
  getBusinessContextController,
  getBusinessProfileController,
  getBusinessSettingsController,
  getListUserBusinessesController,
  patchBusinessProfileController,
  patchBusinessSettingsController,
  postCreateBusinessController,
} from '../controllers/businessTenantController.js';
import {
  getBusinessEmployeesController,
  getBusinessRolesController,
  getPermissionsCatalogController,
  patchBusinessEmployeeController,
  patchBusinessRoleController,
  postCreateBusinessRoleController,
  postInviteOrAddEmployeeController,
} from '../controllers/rbacEmployeeController.js';
import {
  getCustomerDetailsController,
  getCustomersController,
  patchCustomerController,
  postAddCustomerKycDocumentController,
  postCreateCustomerController,
  postVerifyCustomerKycDocumentController,
} from '../controllers/customerKycController.js';
import {
  getLoanDetailsController,
  getLoanProductsController,
  getLoansController,
  patchLoanProductController,
  postApproveLoanApplicationController,
  postCreateLoanApplicationController,
  postCreateLoanProductController,
  postDisburseLoanController,
  postRejectLoanApplicationController,
  postReviewLoanApplicationController,
  postSubmitLoanApplicationController,
} from '../controllers/loanManagementController.js';
import {
  getOverdueLoansController,
  getRepaymentSchedulesController,
  postEvaluateOverdueSchedulesController,
  postRestructureLoanController,
  postWriteOffLoanController,
} from '../controllers/scheduleEngineController.js';
import {
  getPaymentReceiptController,
  getRepaymentDetailsController,
  getRepaymentsController,
  postRecordRepaymentController,
  postReverseRepaymentController,
} from '../controllers/repaymentManagementController.js';
import {
  getBusinessFinancialDashboardController,
  getExportFinancialStatementCsvController,
  getTenantNotificationsController,
  postMarkNotificationReadController,
} from '../controllers/financialReportingController.js';
import {
  getSuperAdminAuditLogsController,
  getSuperAdminBusinessesController,
  getSuperAdminDashboardController,
  getSuperAdminPlansController,
  getSuperAdminPlatformSettingsController,
  getSuperAdminRevenueAnalyticsController,
  getSuperAdminSubscriptionsController,
  getSuperAdminUsersController,
  patchSuperAdminBusinessStatusController,
  patchSuperAdminUserStatusController,
  postSuperAdminBroadcastNotificationController,
  postSuperAdminUpsertPlanController,
  putSuperAdminAssignSubscriptionController,
  putSuperAdminPlatformSettingController,
} from '../controllers/superAdminController.js';
import {
  getTenantSubscriptionOverviewController,
  postCancelTenantSubscriptionController,
  postChangeTenantSubscriptionPlanController,
} from '../controllers/subscriptionManagementController.js';
import {
  authenticateUserMiddleware,
  requirePermissions,
  requireSuperAdminMiddleware,
  requireTenantMembershipMiddleware,
  verifyAppCheckMiddleware,
  verifyFirebaseTokenOnlyMiddleware,
} from '../middleware/security.js';

export const apiV1Router = Router();

// Public system health endpoint for Google Cloud Run readiness/liveness probes
apiV1Router.get('/health', getHealthStatus);

// Backend-authoritative financial calculation preview (Decimal.js)
apiV1Router.post('/financial/schedule-preview', postScheduleCalculationPreview);

/**
 * PHASE 2 — Authentication & Personal Profile Router (`/api/v1/auth/*`)
 */
export const authRouter = Router();

authRouter.post(
  '/session',
  verifyAppCheckMiddleware,
  verifyFirebaseTokenOnlyMiddleware,
  postAuthSessionController
);

authRouter.get(
  '/me',
  verifyAppCheckMiddleware,
  authenticateUserMiddleware,
  getAuthMeController
);

authRouter.patch(
  '/me',
  verifyAppCheckMiddleware,
  authenticateUserMiddleware,
  patchAuthMeController
);

apiV1Router.use('/auth', authRouter);

/**
 * PHASE 3 — Authenticated User Business Onboarding & Listing (`/api/v1/businesses`)
 */
apiV1Router.get(
  '/businesses',
  verifyAppCheckMiddleware,
  authenticateUserMiddleware,
  getListUserBusinessesController
);

apiV1Router.post(
  '/businesses',
  verifyAppCheckMiddleware,
  authenticateUserMiddleware,
  postCreateBusinessController
);

/**
 * Tenant-Scoped Business Environment Router (`/api/v1/businesses/:businessId/*`)
 * Enforces:
 *   1. Firebase App Check verification
 *   2. Firebase ID token verification & PostgreSQL user lookup
 *   3. Active PostgreSQL `business_memberships` verification & RBAC loading
 */
export const businessTenantRouter = Router({ mergeParams: true });
businessTenantRouter.use(
  verifyAppCheckMiddleware,
  authenticateUserMiddleware,
  requireTenantMembershipMiddleware
);

businessTenantRouter.get('/context', getBusinessContextController);

businessTenantRouter.get(
  '/profile',
  requirePermissions(PermissionCode.BUSINESS_SETTINGS_VIEW),
  getBusinessProfileController
);

businessTenantRouter.patch(
  '/profile',
  requirePermissions(PermissionCode.BUSINESS_SETTINGS_MANAGE),
  patchBusinessProfileController
);

businessTenantRouter.get(
  '/settings',
  requirePermissions(PermissionCode.BUSINESS_SETTINGS_VIEW),
  getBusinessSettingsController
);

businessTenantRouter.patch(
  '/settings',
  requirePermissions(PermissionCode.BUSINESS_SETTINGS_MANAGE),
  patchBusinessSettingsController
);

/**
 * PHASE 4 — Tenant RBAC Roles, Permissions Catalog & Employee Management Routes
 */
businessTenantRouter.get(
  '/permissions',
  requirePermissions(PermissionCode.ROLES_VIEW),
  getPermissionsCatalogController
);

businessTenantRouter.get(
  '/roles',
  requirePermissions(PermissionCode.ROLES_VIEW),
  getBusinessRolesController
);

businessTenantRouter.post(
  '/roles',
  requirePermissions(PermissionCode.ROLES_MANAGE),
  postCreateBusinessRoleController
);

businessTenantRouter.patch(
  '/roles/:roleId',
  requirePermissions(PermissionCode.ROLES_MANAGE),
  patchBusinessRoleController
);

businessTenantRouter.get(
  '/employees',
  requirePermissions(PermissionCode.EMPLOYEES_VIEW),
  getBusinessEmployeesController
);

businessTenantRouter.post(
  '/employees',
  requirePermissions(PermissionCode.EMPLOYEES_MANAGE),
  postInviteOrAddEmployeeController
);

businessTenantRouter.patch(
  '/employees/:membershipId',
  requirePermissions(PermissionCode.EMPLOYEES_MANAGE),
  patchBusinessEmployeeController
);

/**
 * PHASE 5 — Customer Management & KYC Document Routes
 */
businessTenantRouter.get(
  '/customers',
  requirePermissions(PermissionCode.CUSTOMERS_VIEW),
  getCustomersController
);

businessTenantRouter.post(
  '/customers',
  requirePermissions(PermissionCode.CUSTOMERS_CREATE),
  postCreateCustomerController
);

businessTenantRouter.get(
  '/customers/:customerId',
  requirePermissions(PermissionCode.CUSTOMERS_VIEW),
  getCustomerDetailsController
);

businessTenantRouter.patch(
  '/customers/:customerId',
  patchCustomerController
);

businessTenantRouter.post(
  '/customers/:customerId/documents',
  requirePermissions(PermissionCode.CUSTOMERS_UPDATE),
  postAddCustomerKycDocumentController
);

businessTenantRouter.post(
  '/customers/:customerId/documents/:documentId/verify',
  requirePermissions(PermissionCode.CUSTOMERS_UPDATE),
  postVerifyCustomerKycDocumentController
);

/**
 * PHASE 6 — Loan Products & Loan Management Routes
 */
businessTenantRouter.get(
  '/loan-products',
  requirePermissions(PermissionCode.LOAN_PRODUCTS_VIEW),
  getLoanProductsController
);

businessTenantRouter.post(
  '/loan-products',
  requirePermissions(PermissionCode.LOAN_PRODUCTS_MANAGE),
  postCreateLoanProductController
);

businessTenantRouter.patch(
  '/loan-products/:productId',
  requirePermissions(PermissionCode.LOAN_PRODUCTS_MANAGE),
  patchLoanProductController
);

businessTenantRouter.get(
  '/loans',
  requirePermissions(PermissionCode.LOANS_VIEW),
  getLoansController
);

businessTenantRouter.post(
  '/loans',
  requirePermissions(PermissionCode.LOANS_CREATE),
  postCreateLoanApplicationController
);

businessTenantRouter.get(
  '/loans/:loanId',
  requirePermissions(PermissionCode.LOANS_VIEW),
  getLoanDetailsController
);

businessTenantRouter.post(
  '/loans/:loanId/submit',
  requirePermissions(PermissionCode.LOANS_CREATE),
  postSubmitLoanApplicationController
);

businessTenantRouter.post(
  '/loans/:loanId/review',
  requirePermissions(PermissionCode.LOANS_REVIEW),
  postReviewLoanApplicationController
);

businessTenantRouter.post(
  '/loans/:loanId/approve',
  requirePermissions(PermissionCode.LOANS_APPROVE),
  postApproveLoanApplicationController
);

businessTenantRouter.post(
  '/loans/:loanId/reject',
  requirePermissions(PermissionCode.LOANS_APPROVE),
  postRejectLoanApplicationController
);

businessTenantRouter.post(
  '/loans/:loanId/disburse',
  requirePermissions(PermissionCode.LOANS_DISBURSE),
  postDisburseLoanController
);

/**
 * PHASE 7 — Financial Calculation Engine, Repayment Schedules, Delinquency & Restructuring Routes
 */
businessTenantRouter.get(
  '/repayment-schedules',
  requirePermissions(PermissionCode.LOANS_VIEW),
  getRepaymentSchedulesController
);

businessTenantRouter.post(
  '/repayment-schedules/evaluate-overdue',
  requirePermissions(PermissionCode.LOANS_REVIEW),
  postEvaluateOverdueSchedulesController
);

businessTenantRouter.get(
  '/overdue-loans',
  requirePermissions(PermissionCode.LOANS_VIEW),
  getOverdueLoansController
);

businessTenantRouter.post(
  '/loans/:loanId/restructure',
  requirePermissions(PermissionCode.LOANS_RESTRUCTURE),
  postRestructureLoanController
);

businessTenantRouter.post(
  '/loans/:loanId/write-off',
  requirePermissions(PermissionCode.LOANS_WRITE_OFF),
  postWriteOffLoanController
);

/**
 * PHASE 8 — Repayment Management, Waterfall Allocation & Receipts Routes
 */
businessTenantRouter.get(
  '/repayments',
  requirePermissions(PermissionCode.REPAYMENTS_VIEW),
  getRepaymentsController
);

businessTenantRouter.post(
  '/repayments',
  requirePermissions(PermissionCode.REPAYMENTS_RECORD),
  postRecordRepaymentController
);

businessTenantRouter.get(
  '/repayments/:repaymentId',
  requirePermissions(PermissionCode.REPAYMENTS_VIEW),
  getRepaymentDetailsController
);

businessTenantRouter.post(
  '/repayments/:repaymentId/reverse',
  requirePermissions(PermissionCode.REPAYMENTS_REVERSE),
  postReverseRepaymentController
);

businessTenantRouter.get(
  '/repayments/:repaymentId/receipt',
  requirePermissions(PermissionCode.REPAYMENTS_VIEW),
  getPaymentReceiptController
);

/**
 * PHASE 9 — Financial Dashboards, Portfolio Analytics, Exports & Notifications Routes
 */
businessTenantRouter.get(
  '/dashboard',
  requirePermissions(PermissionCode.DASHBOARD_VIEW),
  getBusinessFinancialDashboardController
);

businessTenantRouter.get(
  '/reports/portfolio',
  requirePermissions(PermissionCode.REPORTS_VIEW),
  getBusinessFinancialDashboardController
);

businessTenantRouter.get(
  '/reports/export-csv',
  requirePermissions(PermissionCode.REPORTS_EXPORT),
  getExportFinancialStatementCsvController
);

businessTenantRouter.get('/notifications', getTenantNotificationsController);

businessTenantRouter.post(
  '/notifications/:notificationId/read',
  postMarkNotificationReadController
);

/**
 * PHASE 11 — Tenant Subscription Management & Quota Self-Service Routes
 */
businessTenantRouter.get(
  '/subscription',
  requirePermissions(PermissionCode.SUBSCRIPTION_VIEW),
  getTenantSubscriptionOverviewController
);

businessTenantRouter.post(
  '/subscription/change-plan',
  requirePermissions(PermissionCode.SUBSCRIPTION_MANAGE),
  postChangeTenantSubscriptionPlanController
);

businessTenantRouter.post(
  '/subscription/cancel',
  requirePermissions(PermissionCode.SUBSCRIPTION_MANAGE),
  postCancelTenantSubscriptionController
);

apiV1Router.use('/businesses/:businessId', businessTenantRouter);

/**
 * PHASE 10 — FloTech Digital Super Admin Router (`/api/v1/super-admin/*`)
 * Enforces:
 *   1. Firebase App Check verification
 *   2. Firebase ID token verification & PostgreSQL user lookup
 *   3. PostgreSQL `users.platform_role === 'SUPER_ADMIN'` verification
 */
export const superAdminRouter = Router();
superAdminRouter.use(
  verifyAppCheckMiddleware,
  authenticateUserMiddleware,
  requireSuperAdminMiddleware
);

superAdminRouter.get('/context', (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      superAdmin: req.authUser,
    },
  });
});

superAdminRouter.get('/dashboard', getSuperAdminDashboardController);
superAdminRouter.get('/businesses', getSuperAdminBusinessesController);
superAdminRouter.patch('/businesses/:businessId/status', patchSuperAdminBusinessStatusController);
superAdminRouter.get('/users', getSuperAdminUsersController);
superAdminRouter.patch('/users/:userId/status', patchSuperAdminUserStatusController);
superAdminRouter.get('/plans', getSuperAdminPlansController);
superAdminRouter.post('/plans', postSuperAdminUpsertPlanController);
superAdminRouter.get('/subscriptions', getSuperAdminSubscriptionsController);
superAdminRouter.put(
  '/businesses/:businessId/subscription',
  putSuperAdminAssignSubscriptionController
);
superAdminRouter.get('/revenue-analytics', getSuperAdminRevenueAnalyticsController);
superAdminRouter.post('/notifications/broadcast', postSuperAdminBroadcastNotificationController);
superAdminRouter.get('/audit-logs', getSuperAdminAuditLogsController);
superAdminRouter.get('/settings', getSuperAdminPlatformSettingsController);
superAdminRouter.put('/settings', putSuperAdminPlatformSettingController);

apiV1Router.use('/super-admin', superAdminRouter);
