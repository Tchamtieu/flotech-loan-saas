import { z } from 'zod';
import {
  BusinessStatus,
  InterestCalculationMethod,
  MembershipStatus,
  PermissionCode,
  RepaymentFrequency,
  RepaymentMethod,
  SubscriptionStatus,
} from '@flotech/shared';

/**
 * Validates that a monetary input is a strictly formatted decimal string
 * (never a JavaScript float) with up to 4 fractional digits and > 0.
 */
export const PositiveDecimalStringSchema = z
  .string()
  .regex(/^\d+(\.\d{1,4})?$/, 'Must be a valid positive decimal string with up to 4 decimal places')
  .refine((val) => parseFloat(val) > 0, 'Amount must be greater than zero');

export const NonNegativeDecimalStringSchema = z
  .string()
  .regex(/^\d+(\.\d{1,6})?$/, 'Must be a valid non-negative decimal string');

export const LoanSchedulePreviewRequestSchema = z.object({
  principalAmount: PositiveDecimalStringSchema,
  nominalInterestRatePercent: NonNegativeDecimalStringSchema,
  ratePeriod: z.enum(['PER_PERIOD', 'PER_MONTH', 'PER_ANNUM']),
  interestMethod: z.nativeEnum(InterestCalculationMethod),
  repaymentFrequency: z.nativeEnum(RepaymentFrequency),
  termInstallments: z.number().int().min(1).max(360),
  firstRepaymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  originationFeeFixed: NonNegativeDecimalStringSchema.optional(),
  originationFeePercent: NonNegativeDecimalStringSchema.optional(),
});

/**
 * PHASE 2 — Authentication & Personal Profile Schemas
 * `.strict()` rejects any undeclared fields (e.g., attempts to inject `platformRole: 'SUPER_ADMIN'`).
 */
export const PhoneStringSchema = z
  .string()
  .trim()
  .min(7, 'Phone number must be at least 7 characters')
  .max(40, 'Phone number cannot exceed 40 characters')
  .regex(/^[+0-9()\-\s]+$/, 'Phone number contains invalid characters');

export const ProvisionSessionRequestSchema = z
  .object({
    fullName: z.string().trim().min(2).max(180).optional(),
    phoneNumber: PhoneStringSchema.nullable().optional(),
  })
  .strict();

export const UpdatePersonalProfileRequestSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, 'Full name must be at least 2 characters')
      .max(180, 'Full name cannot exceed 180 characters')
      .optional(),
    phoneNumber: PhoneStringSchema.nullable().optional(),
    avatarStoragePath: z
      .string()
      .trim()
      .max(512)
      .regex(
        /^avatars\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9._-]+$/,
        'Avatar storage path must match avatars/<uid>/<filename>'
      )
      .nullable()
      .optional(),
  })
  .strict()
  .refine(
    (data) =>
      data.fullName !== undefined ||
      data.phoneNumber !== undefined ||
      data.avatarStoragePath !== undefined,
    { message: 'At least one profile field must be provided for update.' }
  );

/**
 * PHASE 3 — Business Profiles, Memberships & Operational Settings Schemas
 */
export const CreateBusinessRequestSchema = z
  .object({
    legalName: z.string().trim().min(2).max(200),
    tradingName: z.string().trim().min(2).max(200).nullable().optional(),
    businessCategory: z.string().trim().min(2).max(80),
    registrationNumber: z.string().trim().min(2).max(100).nullable().optional(),
    taxId: z.string().trim().min(2).max(100).nullable().optional(),
    primaryEmail: z.string().trim().email().max(255),
    primaryPhone: PhoneStringSchema,
    countryCode: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/, 'Must be a 2-letter ISO country code (e.g. US, GB, NG, KE)'),
    currencyCode: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/, 'Must be a 3-letter ISO currency code (e.g. USD, EUR, NGN, KES)'),
    timezone: z.string().trim().min(2).max(64).default('UTC'),
    addressLine1: z.string().trim().min(2).max(255).nullable().optional(),
    city: z.string().trim().min(2).max(120).nullable().optional(),
  })
  .strict();

export const UpdateBusinessProfileRequestSchema = z
  .object({
    legalName: z.string().trim().min(2).max(200).optional(),
    tradingName: z.string().trim().min(2).max(200).nullable().optional(),
    businessCategory: z.string().trim().min(2).max(80).optional(),
    registrationNumber: z.string().trim().min(2).max(100).nullable().optional(),
    taxId: z.string().trim().min(2).max(100).nullable().optional(),
    primaryEmail: z.string().trim().email().max(255).optional(),
    primaryPhone: PhoneStringSchema.optional(),
    countryCode: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/, 'Must be a 2-letter ISO country code')
      .optional(),
    timezone: z.string().trim().min(2).max(64).optional(),
    addressLine1: z.string().trim().min(2).max(255).nullable().optional(),
    city: z.string().trim().min(2).max(120).nullable().optional(),
    logoStoragePath: z
      .string()
      .trim()
      .max(512)
      .regex(
        /^businesses\/[0-9a-fA-F-]{36}\/branding\/[a-zA-Z0-9._-]+$/,
        'Logo storage path must match businesses/<business_id>/branding/<filename>'
      )
      .nullable()
      .optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one business profile field must be provided for update.',
  });

export const UpdateBusinessSettingsRequestSchema = z
  .object({
    loanNumberPrefix: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9-]{2,12}$/, 'Prefix must be 2–12 uppercase alphanumeric characters')
      .optional(),
    customerNumberPrefix: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9-]{2,12}$/, 'Prefix must be 2–12 uppercase alphanumeric characters')
      .optional(),
    receiptNumberPrefix: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9-]{2,12}$/, 'Prefix must be 2–12 uppercase alphanumeric characters')
      .optional(),
    defaultGracePeriodDays: z.number().int().min(0).max(90).optional(),
    requireDualApprovalForLoans: z.boolean().optional(),
    allowPartialInstallmentPayments: z.boolean().optional(),
    statementFooterNote: z.string().trim().max(500).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one operational setting must be provided for update.',
  });

/**
 * PHASE 4 — Roles, Permissions & Employee Management Schemas
 */
export const CreateBusinessRoleRequestSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9_]{2,64}$/, 'Role slug must be 2–64 lowercase alphanumeric or underscore characters')
      .optional(),
    description: z.string().trim().max(500).nullable().optional(),
    permissions: z
      .array(z.nativeEnum(PermissionCode))
      .min(1, 'At least one permission must be assigned to a role'),
  })
  .strict();

export const UpdateBusinessRoleRequestSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    permissions: z
      .array(z.nativeEnum(PermissionCode))
      .min(1, 'At least one permission must be assigned to a role')
      .optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one role field must be provided for update.',
  });

export const InviteOrAddEmployeeRequestSchema = z
  .object({
    email: z.string().trim().email().max(255),
    fullName: z.string().trim().min(2).max(180),
    phoneNumber: PhoneStringSchema.nullable().optional(),
    roleId: z.string().uuid('roleId must be a valid UUID'),
    employeeCode: z.string().trim().min(1).max(40).nullable().optional(),
    jobTitle: z.string().trim().min(2).max(120).nullable().optional(),
    department: z.string().trim().min(2).max(120).nullable().optional(),
    activateImmediately: z.boolean().optional(),
  })
  .strict();

export const UpdateEmployeeMembershipRequestSchema = z
  .object({
    roleId: z.string().uuid('roleId must be a valid UUID').optional(),
    employeeCode: z.string().trim().min(1).max(40).nullable().optional(),
    jobTitle: z.string().trim().min(2).max(120).nullable().optional(),
    department: z.string().trim().min(2).max(120).nullable().optional(),
    status: z.nativeEnum(MembershipStatus).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one employee membership field must be provided for update.',
  });

/**
 * PHASE 5 — Customer Management & KYC Document Schemas
 */
export const CustomerRiskTierSchema = z.enum(['LOW', 'STANDARD', 'HIGH', 'RESTRICTED']);

export const CreateCustomerRequestSchema = z
  .object({
    firstName: z.string().trim().min(1, 'First name is required').max(120),
    lastName: z.string().trim().min(1, 'Last name is required').max(120),
    businessName: z.string().trim().min(2).max(200).nullable().optional(),
    email: z.string().trim().email().max(255).nullable().optional(),
    phoneNumber: PhoneStringSchema,
    nationalIdNumber: z.string().trim().min(2).max(80).nullable().optional(),
    dateOfBirth: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'dateOfBirth must be YYYY-MM-DD')
      .nullable()
      .optional(),
    addressLine1: z.string().trim().min(2).max(255).nullable().optional(),
    city: z.string().trim().min(2).max(120).nullable().optional(),
    employmentStatus: z.string().trim().min(2).max(80).nullable().optional(),
    monthlyIncome: NonNegativeDecimalStringSchema.nullable().optional(),
    creditScoreInternal: z.number().int().min(0).max(1000).nullable().optional(),
    riskTier: CustomerRiskTierSchema.default('STANDARD'),
  })
  .strict();

export const UpdateCustomerRequestSchema = z
  .object({
    firstName: z.string().trim().min(1).max(120).optional(),
    lastName: z.string().trim().min(1).max(120).optional(),
    businessName: z.string().trim().min(2).max(200).nullable().optional(),
    email: z.string().trim().email().max(255).nullable().optional(),
    phoneNumber: PhoneStringSchema.optional(),
    nationalIdNumber: z.string().trim().min(2).max(80).nullable().optional(),
    dateOfBirth: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'dateOfBirth must be YYYY-MM-DD')
      .nullable()
      .optional(),
    addressLine1: z.string().trim().min(2).max(255).nullable().optional(),
    city: z.string().trim().min(2).max(120).nullable().optional(),
    employmentStatus: z.string().trim().min(2).max(80).nullable().optional(),
    monthlyIncome: NonNegativeDecimalStringSchema.nullable().optional(),
    creditScoreInternal: z.number().int().min(0).max(1000).nullable().optional(),
    riskTier: CustomerRiskTierSchema.optional(),
    isArchived: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one customer field must be provided for update.',
  });

export const CreateCustomerDocumentRequestSchema = z
  .object({
    documentType: z.string().trim().min(2).max(64),
    fileName: z.string().trim().min(1).max(255),
    firebaseStoragePath: z
      .string()
      .trim()
      .max(512)
      .regex(
        /^businesses\/[0-9a-fA-F-]{36}\/customers\/[0-9a-fA-F-]{36}\/kyc\/[a-zA-Z0-9._-]+$/,
        'firebaseStoragePath must match businesses/<business_id>/customers/<customer_id>/kyc/<filename>'
      ),
    mimeType: z.string().trim().min(3).max(120),
    fileSizeBytes: z.number().int().positive().max(50 * 1024 * 1024),
  })
  .strict();

/**
 * PHASE 6 — Loan Products & Loan Management Schemas
 */
export const InterestRatePeriodSchema = z.enum(['PER_PERIOD', 'PER_MONTH', 'PER_ANNUM']);

export const CreateLoanProductRequestSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(
        /^[A-Z0-9_-]{2,40}$/,
        'Loan product code must be 2–40 uppercase alphanumeric, underscore, or hyphen characters'
      ),
    name: z.string().trim().min(2).max(160),
    description: z.string().trim().max(1000).nullable().optional(),
    interestMethod: z.nativeEnum(InterestCalculationMethod),
    repaymentFrequency: z.nativeEnum(RepaymentFrequency),
    nominalInterestRatePercent: NonNegativeDecimalStringSchema,
    ratePeriod: InterestRatePeriodSchema,
    minPrincipal: PositiveDecimalStringSchema,
    maxPrincipal: PositiveDecimalStringSchema,
    minTermInstallments: z.number().int().min(1).max(360),
    maxTermInstallments: z.number().int().min(1).max(360),
    originationFeeFixed: NonNegativeDecimalStringSchema.default('0.0000'),
    originationFeePercent: NonNegativeDecimalStringSchema.default('0.000000'),
    latePenaltyRatePercent: NonNegativeDecimalStringSchema.default('0.000000'),
    gracePeriodDays: z.number().int().min(0).max(90).default(0),
    isActive: z.boolean().default(true),
  })
  .strict()
  .refine((data) => data.maxTermInstallments >= data.minTermInstallments, {
    message: 'maxTermInstallments must be greater than or equal to minTermInstallments.',
    path: ['maxTermInstallments'],
  });

export const UpdateLoanProductRequestSchema = z
  .object({
    name: z.string().trim().min(2).max(160).optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    nominalInterestRatePercent: NonNegativeDecimalStringSchema.optional(),
    ratePeriod: InterestRatePeriodSchema.optional(),
    minPrincipal: PositiveDecimalStringSchema.optional(),
    maxPrincipal: PositiveDecimalStringSchema.optional(),
    minTermInstallments: z.number().int().min(1).max(360).optional(),
    maxTermInstallments: z.number().int().min(1).max(360).optional(),
    originationFeeFixed: NonNegativeDecimalStringSchema.optional(),
    originationFeePercent: NonNegativeDecimalStringSchema.optional(),
    latePenaltyRatePercent: NonNegativeDecimalStringSchema.optional(),
    gracePeriodDays: z.number().int().min(0).max(90).optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one loan product field must be provided for update.',
  });

export const CreateLoanApplicationRequestSchema = z
  .object({
    customerId: z.string().uuid('customerId must be a valid UUID'),
    loanProductId: z.string().uuid('loanProductId must be a valid UUID'),
    principalAmount: PositiveDecimalStringSchema,
    termInstallments: z.number().int().min(1).max(360),
    firstRepaymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'firstRepaymentDate must be YYYY-MM-DD'),
    loanOfficerMembershipId: z.string().uuid().nullable().optional(),
    purpose: z.string().trim().max(1000).nullable().optional(),
    submitImmediately: z.boolean().default(true),
  })
  .strict();

export const LoanLifecycleActionRequestSchema = z
  .object({
    notes: z.string().trim().max(1000).nullable().optional(),
    firstRepaymentDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'firstRepaymentDate must be YYYY-MM-DD')
      .optional(),
  })
  .strict();

/**
 * PHASE 7 — Financial Calculation Engine, Repayment Schedules, Delinquency & Restructuring Schemas
 */
export const EvaluateOverdueSchedulesRequestSchema = z
  .object({
    asOfDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'asOfDate must be YYYY-MM-DD')
      .optional(),
    applyLatePenalties: z.boolean().default(true),
  })
  .strict();

export const RestructureLoanRequestSchema = z
  .object({
    newTermInstallments: z.number().int().min(1).max(360),
    newNominalInterestRatePercent: NonNegativeDecimalStringSchema.optional(),
    newFirstRepaymentDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'newFirstRepaymentDate must be YYYY-MM-DD'),
    waiveUnpaidPenalties: z.boolean().default(false),
    reason: z.string().trim().min(5).max(1000),
  })
  .strict();

export const WriteOffLoanRequestSchema = z
  .object({
    reason: z.string().trim().min(5).max(1000),
  })
  .strict();

/**
 * PHASE 8 — Repayment Management, Waterfall Allocation & Receipts Schemas
 */
export const RecordRepaymentRequestSchema = z
  .object({
    loanId: z.string().uuid('loanId must be a valid UUID'),
    amountReceived: PositiveDecimalStringSchema,
    paymentMethod: z.nativeEnum(RepaymentMethod),
    externalTransactionRef: z.string().trim().max(120).nullable().optional(),
    idempotencyKey: z.string().trim().min(4).max(120).nullable().optional(),
    paidAt: z.string().trim().min(10).max(40).optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
  })
  .strict();

export const ReverseRepaymentRequestSchema = z
  .object({
    reversalReason: z.string().trim().min(5).max(1000),
  })
  .strict();

/**
 * PHASE 10 — FloTech Digital Super Admin Environment Schemas
 */
export const SuperAdminUpdateBusinessStatusRequestSchema = z
  .object({
    status: z.nativeEnum(BusinessStatus),
    reason: z.string().trim().min(5).max(1000),
  })
  .strict();

export const SuperAdminUpdateUserStatusRequestSchema = z
  .object({
    isActive: z.boolean(),
    reason: z.string().trim().min(5).max(1000),
  })
  .strict();

export const SuperAdminUpsertPlanRequestSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_-]{2,64}$/, 'Plan code must be 2–64 uppercase alphanumeric characters'),
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().max(1000).nullable().optional(),
    currencyCode: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/, 'currencyCode must be a 3-letter ISO code')
      .default('USD'),
    monthlyPrice: NonNegativeDecimalStringSchema,
    annualPrice: NonNegativeDecimalStringSchema,
    maxActiveLoans: z.number().int().min(1).max(1000000),
    maxEmployees: z.number().int().min(1).max(100000),
    maxCustomers: z.number().int().min(1).max(10000000),
    features: z.record(z.unknown()).default({}),
    isPublic: z.boolean().default(true),
  })
  .strict();

export const SuperAdminAssignSubscriptionRequestSchema = z
  .object({
    planId: z.string().uuid('planId must be a valid UUID'),
    status: z.nativeEnum(SubscriptionStatus),
    billingCycle: z.enum(['MONTHLY', 'ANNUAL']),
    currentPeriodEnd: z.string().trim().min(10).max(40).optional(),
    cancelAtPeriodEnd: z.boolean().default(false),
    reason: z.string().trim().min(5).max(1000),
  })
  .strict();

export const SuperAdminBroadcastNotificationRequestSchema = z
  .object({
    category: z.string().trim().min(2).max(64),
    title: z.string().trim().min(3).max(200),
    body: z.string().trim().min(5).max(2000),
    targetBusinessId: z.string().uuid().nullable().optional(),
    actionUrl: z.string().trim().max(500).nullable().optional(),
  })
  .strict();

export const SuperAdminUpdatePlatformSettingRequestSchema = z
  .object({
    key: z
      .string()
      .trim()
      .min(3)
      .max(100)
      .regex(/^[a-z0-9._-]+$/i, 'Setting key must contain alphanumeric, dot, underscore, or hyphen characters'),
    valueJson: z.record(z.unknown()),
    description: z.string().trim().max(1000).nullable().optional(),
  })
  .strict();

/**
 * PHASE 11 — Tenant Subscription Management Schemas
 */
export const ChangeTenantSubscriptionPlanRequestSchema = z
  .object({
    planCode: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_-]{2,64}$/, 'planCode must be 2–64 uppercase alphanumeric characters'),
    billingInterval: z.enum(['MONTHLY', 'ANNUAL']),
    autoRenew: z.boolean().optional(),
  })
  .strict();

export const CancelTenantSubscriptionRequestSchema = z
  .object({
    immediate: z.boolean().default(false),
    reason: z.string().trim().min(5).max(1000),
  })
  .strict();
