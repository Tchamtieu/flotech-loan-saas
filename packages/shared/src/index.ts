/**
 * FloTech Digital — Loan Management SaaS
 * Shared Domain Types, Enums, and API Contracts
 *
 * ARCHITECTURAL RULE:
 * All monetary amounts in API payloads and TypeScript interfaces are represented
 * as fixed-precision decimal strings (e.g. "12500.0000" or "12500.00") to prevent
 * IEEE 754 floating-point precision loss across serialization boundaries.
 */

export type DecimalString = string;
export type ISODateString = string;
export type UUID = string;

export enum PlatformRole {
  USER = 'USER',
  SUPER_ADMIN = 'SUPER_ADMIN',
}

export enum BusinessStatus {
  PENDING_VERIFICATION = 'PENDING_VERIFICATION',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  ARCHIVED = 'ARCHIVED',
}

export enum MembershipStatus {
  INVITED = 'INVITED',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  REVOKED = 'REVOKED',
}

export enum SystemBusinessRoleSlug {
  BUSINESS_OWNER = 'business_owner',
  BRANCH_MANAGER = 'branch_manager',
  LOAN_OFFICER = 'loan_officer',
  CASHIER = 'cashier',
  AUDITOR = 'auditor',
}

export enum PermissionCode {
  // Dashboard & Analytics
  DASHBOARD_VIEW = 'dashboard:view',
  REPORTS_VIEW = 'reports:view',
  REPORTS_EXPORT = 'reports:export',

  // Customer Management
  CUSTOMERS_VIEW = 'customers:view',
  CUSTOMERS_CREATE = 'customers:create',
  CUSTOMERS_UPDATE = 'customers:update',
  CUSTOMERS_ARCHIVE = 'customers:archive',

  // Loan Products
  LOAN_PRODUCTS_VIEW = 'loan_products:view',
  LOAN_PRODUCTS_MANAGE = 'loan_products:manage',

  // Loans
  LOANS_VIEW = 'loans:view',
  LOANS_CREATE = 'loans:create',
  LOANS_REVIEW = 'loans:review',
  LOANS_APPROVE = 'loans:approve',
  LOANS_DISBURSE = 'loans:disburse',
  LOANS_RESTRUCTURE = 'loans:restructure',
  LOANS_WRITE_OFF = 'loans:write_off',

  // Repayments
  REPAYMENTS_VIEW = 'repayments:view',
  REPAYMENTS_RECORD = 'repayments:record',
  REPAYMENTS_REVERSE = 'repayments:reverse',

  // Employees & Roles
  EMPLOYEES_VIEW = 'employees:view',
  EMPLOYEES_MANAGE = 'employees:manage',
  ROLES_VIEW = 'roles:view',
  ROLES_MANAGE = 'roles:manage',

  // Business Settings & Subscription
  BUSINESS_SETTINGS_VIEW = 'business_settings:view',
  BUSINESS_SETTINGS_MANAGE = 'business_settings:manage',
  SUBSCRIPTION_VIEW = 'subscription:view',
  SUBSCRIPTION_MANAGE = 'subscription:manage',
}

export enum InterestCalculationMethod {
  FLAT_RATE = 'FLAT_RATE',
  DECLINING_BALANCE_EQUAL_INSTALLMENTS = 'DECLINING_BALANCE_EQUAL_INSTALLMENTS',
  DECLINING_BALANCE_EQUAL_PRINCIPAL = 'DECLINING_BALANCE_EQUAL_PRINCIPAL',
  INTEREST_ONLY = 'INTEREST_ONLY',
}

export enum RepaymentFrequency {
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  BIWEEKLY = 'BIWEEKLY',
  MONTHLY = 'MONTHLY',
  QUARTERLY = 'QUARTERLY',
}

export enum LoanStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  UNDER_REVIEW = 'UNDER_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  DISBURSED = 'DISBURSED',
  ACTIVE = 'ACTIVE',
  OVERDUE = 'OVERDUE',
  DEFAULTED = 'DEFAULTED',
  RESTRUCTURED = 'RESTRUCTURED',
  CLOSED_PAID = 'CLOSED_PAID',
  WRITTEN_OFF = 'WRITTEN_OFF',
}

export enum InstallmentStatus {
  PENDING = 'PENDING',
  PARTIALLY_PAID = 'PARTIALLY_PAID',
  PAID = 'PAID',
  OVERDUE = 'OVERDUE',
  WAIVED = 'WAIVED',
}

export enum RepaymentMethod {
  CASH = 'CASH',
  BANK_TRANSFER = 'BANK_TRANSFER',
  MOBILE_MONEY = 'MOBILE_MONEY',
  CARD = 'CARD',
  CHEQUE = 'CHEQUE',
}

export enum SubscriptionStatus {
  TRIALING = 'TRIALING',
  ACTIVE = 'ACTIVE',
  PAST_DUE = 'PAST_DUE',
  CANCELED = 'CANCELED',
  EXPIRED = 'EXPIRED',
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta?: {
    requestId: string;
    timestamp: ISODateString;
    pagination?: {
      page: number;
      pageSize: number;
      totalItems: number;
      totalPages: number;
    };
  };
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    requestId: string;
    timestamp: ISODateString;
  };
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export interface AuthenticatedUserContext {
  userId: UUID;
  firebaseUid: string;
  email: string;
  fullName: string;
  platformRole: PlatformRole;
}

export interface TenantMembershipContext {
  businessId: UUID;
  businessName: string;
  businessCode: string;
  currencyCode: string;
  membershipId: UUID;
  roleId: UUID;
  roleSlug: string;
  roleName: string;
  permissions: PermissionCode[];
}

export interface LoanSchedulePreviewSummary {
  principalAmount: DecimalString;
  totalInterestAmount: DecimalString;
  totalFeeAmount: DecimalString;
  totalPayableAmount: DecimalString;
  effectivePeriodicRatePercent: DecimalString;
  installmentCount: number;
  installments: Array<{
    installmentNumber: number;
    dueDate: ISODateString;
    openingBalance: DecimalString;
    principalDue: DecimalString;
    interestDue: DecimalString;
    feeDue: DecimalString;
    totalDue: DecimalString;
    closingBalance: DecimalString;
  }>;
}

/**
 * PHASE 2 — Authentication & Personal Profiles Contracts
 */
export interface PersonalProfileDTO {
  id: UUID;
  firebaseUid: string;
  email: string;
  fullName: string;
  phoneNumber: string | null;
  avatarStoragePath: string | null;
  platformRole: PlatformRole;
  isActive: boolean;
  lastLoginAt: ISODateString | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface ProvisionSessionRequestDTO {
  fullName?: string;
  phoneNumber?: string | null;
}

export interface UpdatePersonalProfileRequestDTO {
  fullName?: string;
  phoneNumber?: string | null;
  avatarStoragePath?: string | null;
}

export interface SessionContextResponseDTO {
  profile: PersonalProfileDTO;
  memberships: Array<{
    businessId: UUID;
    businessCode: string;
    businessName: string;
    currencyCode: string;
    membershipId: UUID;
    roleSlug: string;
    roleName: string;
    status: MembershipStatus;
  }>;
}

/**
 * PHASE 3 — Business Profiles, Operational Settings & Memberships Contracts
 */
export interface BusinessOperationalSettingsDTO {
  loanNumberPrefix: string;
  customerNumberPrefix: string;
  receiptNumberPrefix: string;
  defaultGracePeriodDays: number;
  requireDualApprovalForLoans: boolean;
  allowPartialInstallmentPayments: boolean;
  statementFooterNote: string;
}

export interface BusinessProfileDTO {
  id: UUID;
  businessCode: string;
  legalName: string;
  tradingName: string | null;
  businessCategory: string;
  registrationNumber: string | null;
  taxId: string | null;
  primaryEmail: string;
  primaryPhone: string;
  countryCode: string;
  currencyCode: string;
  timezone: string;
  addressLine1: string | null;
  city: string | null;
  logoStoragePath: string | null;
  status: BusinessStatus;
  ownerUserId: UUID;
  settings: BusinessOperationalSettingsDTO;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface CreateBusinessRequestDTO {
  legalName: string;
  tradingName?: string | null;
  businessCategory: string;
  registrationNumber?: string | null;
  taxId?: string | null;
  primaryEmail: string;
  primaryPhone: string;
  countryCode: string;
  currencyCode: string;
  timezone?: string;
  addressLine1?: string | null;
  city?: string | null;
}

export interface UpdateBusinessProfileRequestDTO {
  legalName?: string;
  tradingName?: string | null;
  businessCategory?: string;
  registrationNumber?: string | null;
  taxId?: string | null;
  primaryEmail?: string;
  primaryPhone?: string;
  countryCode?: string;
  timezone?: string;
  addressLine1?: string | null;
  city?: string | null;
  logoStoragePath?: string | null;
}

export interface UpdateBusinessSettingsRequestDTO {
  loanNumberPrefix?: string;
  customerNumberPrefix?: string;
  receiptNumberPrefix?: string;
  defaultGracePeriodDays?: number;
  requireDualApprovalForLoans?: boolean;
  allowPartialInstallmentPayments?: boolean;
  statementFooterNote?: string;
}

export interface BusinessContextDetailsDTO {
  business: BusinessProfileDTO;
  membership: TenantMembershipContext;
}

/**
 * PHASE 4 — Roles, Permissions & Employee Management Contracts
 */
export interface PermissionCatalogItemDTO {
  code: PermissionCode;
  module: string;
  description: string;
}

export interface BusinessRoleDTO {
  id: UUID;
  businessId: UUID;
  slug: string;
  name: string;
  description: string | null;
  isSystemRole: boolean;
  permissions: PermissionCode[];
  memberCount: number;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface CreateBusinessRoleRequestDTO {
  name: string;
  slug?: string;
  description?: string | null;
  permissions: PermissionCode[];
}

export interface UpdateBusinessRoleRequestDTO {
  name?: string;
  description?: string | null;
  permissions?: PermissionCode[];
}

export interface BusinessEmployeeDTO {
  membershipId: UUID;
  businessId: UUID;
  userId: UUID;
  fullName: string;
  email: string;
  phoneNumber: string | null;
  roleId: UUID;
  roleSlug: string;
  roleName: string;
  employeeCode: string | null;
  jobTitle: string | null;
  department: string | null;
  status: MembershipStatus;
  invitedByUserId: UUID | null;
  joinedAt: ISODateString | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface InviteOrAddEmployeeRequestDTO {
  email: string;
  fullName: string;
  phoneNumber?: string | null;
  roleId: UUID;
  employeeCode?: string | null;
  jobTitle?: string | null;
  department?: string | null;
  activateImmediately?: boolean;
}

export interface UpdateEmployeeMembershipRequestDTO {
  roleId?: UUID;
  employeeCode?: string | null;
  jobTitle?: string | null;
  department?: string | null;
  status?: MembershipStatus;
}

/**
 * PHASE 5 — Customer Management & KYC Document Contracts
 */
export type CustomerRiskTier = 'LOW' | 'STANDARD' | 'HIGH' | 'RESTRICTED';

export interface CustomerDTO {
  id: UUID;
  businessId: UUID;
  customerNumber: string;
  firstName: string;
  lastName: string;
  businessName: string | null;
  email: string | null;
  phoneNumber: string;
  nationalIdNumber: string | null;
  dateOfBirth: ISODateString | null;
  addressLine1: string | null;
  city: string | null;
  employmentStatus: string | null;
  monthlyIncome: DecimalString | null;
  creditScoreInternal: number | null;
  riskTier: CustomerRiskTier;
  isArchived: boolean;
  documentCount: number;
  verifiedDocumentCount: number;
  createdByUserId: UUID;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface CustomerDocumentDTO {
  id: UUID;
  businessId: UUID;
  customerId: UUID;
  documentType: string;
  fileName: string;
  firebaseStoragePath: string;
  mimeType: string;
  fileSizeBytes: number;
  verifiedAt: ISODateString | null;
  verifiedByUserId: UUID | null;
  uploadedByUserId: UUID;
  createdAt: ISODateString;
}

export interface CustomerDetailsResponseDTO {
  customer: CustomerDTO;
  documents: CustomerDocumentDTO[];
  loans?: LoanDTO[];
}

export interface CreateCustomerRequestDTO {
  firstName: string;
  lastName: string;
  businessName?: string | null;
  email?: string | null;
  phoneNumber: string;
  nationalIdNumber?: string | null;
  dateOfBirth?: ISODateString | null;
  addressLine1?: string | null;
  city?: string | null;
  employmentStatus?: string | null;
  monthlyIncome?: DecimalString | null;
  creditScoreInternal?: number | null;
  riskTier?: CustomerRiskTier;
}

export interface UpdateCustomerRequestDTO {
  firstName?: string;
  lastName?: string;
  businessName?: string | null;
  email?: string | null;
  phoneNumber?: string;
  nationalIdNumber?: string | null;
  dateOfBirth?: ISODateString | null;
  addressLine1?: string | null;
  city?: string | null;
  employmentStatus?: string | null;
  monthlyIncome?: DecimalString | null;
  creditScoreInternal?: number | null;
  riskTier?: CustomerRiskTier;
  isArchived?: boolean;
}

export interface CreateCustomerDocumentRequestDTO {
  documentType: string;
  fileName: string;
  firebaseStoragePath: string;
  mimeType: string;
  fileSizeBytes: number;
}

/**
 * PHASE 6 — Loan Products & Loan Management Contracts
 */
export type InterestRatePeriod = 'PER_PERIOD' | 'PER_MONTH' | 'PER_ANNUM';

export interface LoanProductDTO {
  id: UUID;
  businessId: UUID;
  code: string;
  name: string;
  description: string | null;
  currencyCode: string;
  interestMethod: InterestCalculationMethod;
  repaymentFrequency: RepaymentFrequency;
  nominalInterestRatePercent: DecimalString;
  ratePeriod: InterestRatePeriod;
  minPrincipal: DecimalString;
  maxPrincipal: DecimalString;
  minTermInstallments: number;
  maxTermInstallments: number;
  originationFeeFixed: DecimalString;
  originationFeePercent: DecimalString;
  latePenaltyRatePercent: DecimalString;
  gracePeriodDays: number;
  isActive: boolean;
  activeLoanCount: number;
  createdByUserId: UUID;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface CreateLoanProductRequestDTO {
  code: string;
  name: string;
  description?: string | null;
  interestMethod: InterestCalculationMethod;
  repaymentFrequency: RepaymentFrequency;
  nominalInterestRatePercent: DecimalString;
  ratePeriod: InterestRatePeriod;
  minPrincipal: DecimalString;
  maxPrincipal: DecimalString;
  minTermInstallments: number;
  maxTermInstallments: number;
  originationFeeFixed?: DecimalString;
  originationFeePercent?: DecimalString;
  latePenaltyRatePercent?: DecimalString;
  gracePeriodDays?: number;
  isActive?: boolean;
}

export interface UpdateLoanProductRequestDTO {
  name?: string;
  description?: string | null;
  nominalInterestRatePercent?: DecimalString;
  ratePeriod?: InterestRatePeriod;
  minPrincipal?: DecimalString;
  maxPrincipal?: DecimalString;
  minTermInstallments?: number;
  maxTermInstallments?: number;
  originationFeeFixed?: DecimalString;
  originationFeePercent?: DecimalString;
  latePenaltyRatePercent?: DecimalString;
  gracePeriodDays?: number;
  isActive?: boolean;
}

export interface RepaymentScheduleInstallmentDTO {
  id: UUID;
  businessId: UUID;
  loanId: UUID;
  installmentNumber: number;
  dueDate: ISODateString;
  status: InstallmentStatus;
  openingPrincipalBalance: DecimalString;
  principalDue: DecimalString;
  interestDue: DecimalString;
  feeDue: DecimalString;
  penaltyDue: DecimalString;
  totalDue: DecimalString;
  principalPaid: DecimalString;
  interestPaid: DecimalString;
  feePaid: DecimalString;
  penaltyPaid: DecimalString;
  totalPaid: DecimalString;
  closingPrincipalBalance: DecimalString;
  paidAt: ISODateString | null;
}

export interface LoanDTO {
  id: UUID;
  businessId: UUID;
  loanNumber: string;
  customerId: UUID;
  customerNumber: string;
  customerFullName: string;
  customerBusinessName: string | null;
  loanProductId: UUID;
  loanProductCode: string;
  loanProductName: string;
  status: LoanStatus;
  currencyCode: string;
  interestMethod: InterestCalculationMethod;
  repaymentFrequency: RepaymentFrequency;
  nominalInterestRatePercent: DecimalString;
  ratePeriod: InterestRatePeriod;
  termInstallments: number;
  principalAmount: DecimalString;
  totalInterestAmount: DecimalString;
  totalFeeAmount: DecimalString;
  totalPenaltyAmount: DecimalString;
  totalPayableAmount: DecimalString;
  principalRepaid: DecimalString;
  interestCollected: DecimalString;
  feeCollected: DecimalString;
  penaltyCollected: DecimalString;
  totalAmountPaid: DecimalString;
  principalOutstanding: DecimalString;
  interestOutstanding: DecimalString;
  feeOutstanding: DecimalString;
  penaltyOutstanding: DecimalString;
  totalOutstanding: DecimalString;
  applicationDate: ISODateString;
  approvedAt: ISODateString | null;
  approvedByUserId: UUID | null;
  disbursedAt: ISODateString | null;
  disbursedByUserId: UUID | null;
  firstRepaymentDate: ISODateString | null;
  maturityDate: ISODateString | null;
  closedAt: ISODateString | null;
  loanOfficerMembershipId: UUID | null;
  purpose: string | null;
  createdByUserId: UUID;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface LoanDetailsResponseDTO {
  loan: LoanDTO;
  schedules: RepaymentScheduleInstallmentDTO[];
}

export interface CreateLoanApplicationRequestDTO {
  customerId: UUID;
  loanProductId: UUID;
  principalAmount: DecimalString;
  termInstallments: number;
  firstRepaymentDate: ISODateString;
  loanOfficerMembershipId?: UUID | null;
  purpose?: string | null;
  submitImmediately?: boolean;
}

export interface LoanLifecycleActionRequestDTO {
  notes?: string | null;
  firstRepaymentDate?: ISODateString;
}

/**
 * PHASE 7 — Financial Calculation Engine, Repayment Schedules, Delinquency & Restructuring Contracts
 */
export interface RepaymentScheduleFilterParamsDTO {
  status?: InstallmentStatus;
  loanId?: UUID;
  customerId?: UUID;
  dueFrom?: ISODateString;
  dueTo?: ISODateString;
  overdueOnly?: boolean;
  asOfDate?: ISODateString;
}

export interface InstallmentWithLoanContextDTO extends RepaymentScheduleInstallmentDTO {
  loanNumber: string;
  loanStatus: LoanStatus;
  customerId: UUID;
  customerNumber: string;
  customerFullName: string;
  customerPhoneNumber: string;
  loanProductId: UUID;
  loanProductName: string;
  currencyCode: string;
  gracePeriodDays: number;
  latePenaltyRatePercent: DecimalString;
  unpaidInstallmentBalance: DecimalString;
  daysPastDue: number;
}

export interface OverdueLoanSummaryDTO {
  loan: LoanDTO;
  customerPhoneNumber: string;
  customerEmail: string | null;
  gracePeriodDays: number;
  latePenaltyRatePercent: DecimalString;
  overdueInstallmentsCount: number;
  totalOverdueAmount: DecimalString;
  oldestOverdueDueDate: ISODateString | null;
  maxDaysPastDue: number;
}

export interface EvaluateOverdueSchedulesRequestDTO {
  asOfDate?: ISODateString;
  applyLatePenalties?: boolean;
}

export interface OverdueEvaluationResultDTO {
  evaluatedAt: ISODateString;
  asOfDate: ISODateString;
  installmentsMarkedOverdue: number;
  loansMarkedOverdue: number;
  penaltiesAccruedCount: number;
  totalPenaltyAccruedAmount: DecimalString;
}

export interface RestructureLoanRequestDTO {
  newTermInstallments: number;
  newNominalInterestRatePercent?: DecimalString;
  newFirstRepaymentDate: ISODateString;
  waiveUnpaidPenalties?: boolean;
  reason: string;
}

export interface WriteOffLoanRequestDTO {
  reason: string;
}

/**
 * PHASE 8 — Repayment Management, Waterfall Allocation & Receipts Contracts
 */
export interface RepaymentAllocationItemDTO {
  id: UUID;
  businessId: UUID;
  repaymentId: UUID;
  scheduleId: UUID;
  installmentNumber: number;
  dueDate: ISODateString;
  principalAllocated: DecimalString;
  interestAllocated: DecimalString;
  feeAllocated: DecimalString;
  penaltyAllocated: DecimalString;
  totalAllocated: DecimalString;
  createdAt: ISODateString;
}

export interface PaymentReceiptSnapshotDTO {
  receiptNumber: string;
  referenceNumber: string;
  issuedAt: ISODateString;
  businessLegalName: string;
  businessCode: string;
  statementFooterNote: string;
  customerNumber: string;
  customerFullName: string;
  customerPhoneNumber: string;
  loanNumber: string;
  loanProductName: string;
  currencyCode: string;
  paymentMethod: RepaymentMethod;
  externalTransactionRef: string | null;
  amountReceived: DecimalString;
  allocatedPenalty: DecimalString;
  allocatedFee: DecimalString;
  allocatedInterest: DecimalString;
  allocatedPrincipal: DecimalString;
  overpaymentCredit: DecimalString;
  remainingLoanTotalOutstanding: DecimalString;
  remainingLoanPrincipalOutstanding: DecimalString;
  recordedByFullName: string;
}

export interface PaymentReceiptDTO {
  id: UUID;
  businessId: UUID;
  repaymentId: UUID;
  receiptNumber: string;
  issuedAt: ISODateString;
  pdfStoragePath: string | null;
  snapshot: PaymentReceiptSnapshotDTO;
}

export interface RepaymentDTO {
  id: UUID;
  businessId: UUID;
  loanId: UUID;
  loanNumber: string;
  customerId: UUID;
  customerNumber: string;
  customerFullName: string;
  referenceNumber: string;
  receiptNumber: string | null;
  paymentMethod: RepaymentMethod;
  externalTransactionRef: string | null;
  currencyCode: string;
  amountReceived: DecimalString;
  allocatedPenalty: DecimalString;
  allocatedFee: DecimalString;
  allocatedInterest: DecimalString;
  allocatedPrincipal: DecimalString;
  overpaymentCredit: DecimalString;
  paidAt: ISODateString;
  recordedByUserId: UUID;
  recordedByFullName: string;
  isReversed: boolean;
  reversedAt: ISODateString | null;
  reversedByUserId: UUID | null;
  reversalReason: string | null;
  notes: string | null;
  createdAt: ISODateString;
}

export interface RepaymentDetailsResponseDTO {
  repayment: RepaymentDTO;
  allocations: RepaymentAllocationItemDTO[];
  receipt: PaymentReceiptDTO | null;
  loan: LoanDTO;
}

export interface RecordRepaymentRequestDTO {
  loanId: UUID;
  amountReceived: DecimalString;
  paymentMethod: RepaymentMethod;
  externalTransactionRef?: string | null;
  idempotencyKey?: string | null;
  paidAt?: ISODateString;
  notes?: string | null;
}

export interface ReverseRepaymentRequestDTO {
  reversalReason: string;
}

/**
 * PHASE 9 — Financial Dashboards, Portfolio Analytics & Notifications Contracts
 */
export interface PortfolioKpiSummaryDTO {
  currencyCode: string;
  totalCustomersCount: number;
  activeCustomersCount: number;
  totalLoansCount: number;
  activeLoansCount: number;
  overdueLoansCount: number;
  closedPaidLoansCount: number;
  totalDisbursedPrincipal: DecimalString;
  totalContractedInterest: DecimalString;
  totalContractedFees: DecimalString;
  totalAccruedPenalties: DecimalString;
  totalPrincipalOutstanding: DecimalString;
  totalInterestOutstanding: DecimalString;
  totalFeeOutstanding: DecimalString;
  totalPenaltyOutstanding: DecimalString;
  totalPortfolioOutstanding: DecimalString;
  totalCollectedAmount: DecimalString;
  totalCollectedPrincipal: DecimalString;
  totalCollectedInterest: DecimalString;
  totalCollectedFees: DecimalString;
  totalCollectedPenalties: DecimalString;
  collectionEfficiencyPercent: DecimalString;
}

export interface ParAgingBucketDTO {
  bucketLabel: 'CURRENT' | 'PAR_1_29' | 'PAR_30_59' | 'PAR_60_89' | 'PAR_90_PLUS';
  loansCount: number;
  principalAtRisk: DecimalString;
  totalOutstandingAtRisk: DecimalString;
  percentOfPortfolioPrincipal: DecimalString;
}

export interface MonthlyCashflowPointDTO {
  monthKey: string; // YYYY-MM
  disbursedPrincipal: DecimalString;
  expectedCollections: DecimalString;
  actualCollections: DecimalString;
}

export interface ProductPerformanceBreakdownDTO {
  loanProductId: UUID;
  loanProductCode: string;
  loanProductName: string;
  loansCount: number;
  activeLoansCount: number;
  disbursedPrincipal: DecimalString;
  principalOutstanding: DecimalString;
  totalCollected: DecimalString;
}

export interface BusinessFinancialDashboardDTO {
  asOfDate: ISODateString;
  kpis: PortfolioKpiSummaryDTO;
  parBuckets: ParAgingBucketDTO[];
  par30RatioPercent: DecimalString;
  par90RatioPercent: DecimalString;
  monthlyCashflow: MonthlyCashflowPointDTO[];
  productBreakdown: ProductPerformanceBreakdownDTO[];
  recentRepayments: RepaymentDTO[];
}

export interface NotificationItemDTO {
  id: UUID;
  businessId: UUID | null;
  recipientUserId: UUID;
  category: string;
  title: string;
  body: string;
  actionUrl: string | null;
  isRead: boolean;
  readAt: ISODateString | null;
  createdAt: ISODateString;
}

/**
 * PHASE 10 — FloTech Digital Super Admin Environment Contracts
 */
export interface SuperAdminGlobalKpisDTO {
  totalBusinesses: number;
  activeBusinesses: number;
  pendingVerificationBusinesses: number;
  suspendedBusinesses: number;
  totalPlatformUsers: number;
  activeSubscriptionsCount: number;
  trialSubscriptionsCount: number;
  monthlyRecurringRevenueUsd: DecimalString;
  annualizedRunRateUsd: DecimalString;
  globalActiveLoansCount: number;
  globalDisbursedPrincipalVolume: DecimalString;
}

export interface SuperAdminBusinessSummaryDTO {
  id: UUID;
  businessCode: string;
  legalName: string;
  tradingName: string | null;
  businessCategory: string;
  primaryEmail: string;
  primaryPhone: string;
  countryCode: string;
  currencyCode: string;
  status: BusinessStatus;
  ownerUserId: UUID;
  ownerFullName: string;
  ownerEmail: string;
  memberCount: number;
  customerCount: number;
  activeLoanCount: number;
  subscriptionPlanCode: string | null;
  subscriptionStatus: SubscriptionStatus | null;
  createdAt: ISODateString;
}

export interface SuperAdminUpdateBusinessStatusRequestDTO {
  status: BusinessStatus;
  reason: string;
}

export interface SuperAdminUserDirectoryItemDTO {
  id: UUID;
  firebaseUid: string;
  email: string;
  fullName: string;
  phoneNumber: string | null;
  platformRole: PlatformRole;
  isActive: boolean;
  businessMembershipsCount: number;
  lastLoginAt: ISODateString | null;
  createdAt: ISODateString;
}

export interface SuperAdminUpdateUserStatusRequestDTO {
  isActive: boolean;
  reason: string;
}

export interface SubscriptionPlanCatalogDTO {
  id: UUID;
  code: string;
  name: string;
  description: string | null;
  currencyCode: string;
  monthlyPrice: DecimalString;
  annualPrice: DecimalString;
  maxActiveLoans: number;
  maxEmployees: number;
  maxCustomers: number;
  features: Record<string, unknown>;
  isPublic: boolean;
  activeSubscriberCount: number;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface SuperAdminUpsertPlanRequestDTO {
  code: string;
  name: string;
  description?: string | null;
  currencyCode?: string;
  monthlyPrice: DecimalString;
  annualPrice: DecimalString;
  maxActiveLoans: number;
  maxEmployees: number;
  maxCustomers: number;
  features?: Record<string, unknown>;
  isPublic?: boolean;
}

export interface SuperAdminSubscriptionRecordDTO {
  id: UUID;
  businessId: UUID;
  businessCode: string;
  businessLegalName: string;
  planId: UUID;
  planCode: string;
  planName: string;
  status: SubscriptionStatus;
  billingCycle: 'MONTHLY' | 'ANNUAL';
  unitPrice: DecimalString;
  currencyCode: string;
  currentPeriodStart: ISODateString;
  currentPeriodEnd: ISODateString;
  cancelAtPeriodEnd: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface SuperAdminAssignSubscriptionRequestDTO {
  planId: UUID;
  status: SubscriptionStatus;
  billingCycle: 'MONTHLY' | 'ANNUAL';
  currentPeriodEnd?: ISODateString;
  cancelAtPeriodEnd?: boolean;
  reason: string;
}

export interface SuperAdminRevenueAnalyticsDTO {
  mrrUsd: DecimalString;
  arrUsd: DecimalString;
  activePaidSubscriptions: number;
  trialingSubscriptions: number;
  pastDueSubscriptions: number;
  planBreakdown: Array<{
    planCode: string;
    planName: string;
    subscriberCount: number;
    monthlyRevenueContributionUsd: DecimalString;
  }>;
}

export interface SuperAdminBroadcastNotificationRequestDTO {
  category: string;
  title: string;
  body: string;
  targetBusinessId?: UUID | null;
  actionUrl?: string | null;
}

export interface AuditLogEntryDTO {
  id: UUID;
  businessId: UUID | null;
  businessName: string | null;
  actorUserId: UUID | null;
  actorEmail: string | null;
  actorFullName: string | null;
  actorPlatformRole: PlatformRole;
  action: string;
  entityType: string;
  entityId: UUID | null;
  requestId: string | null;
  ipAddress: string | null;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  createdAt: ISODateString;
}

export interface PlatformSettingItemDTO {
  key: string;
  valueJson: Record<string, unknown>;
  description: string | null;
  updatedByUserId: UUID | null;
  updatedAt: ISODateString;
}

export interface SuperAdminUpdatePlatformSettingRequestDTO {
  key: string;
  valueJson: Record<string, unknown>;
  description?: string | null;
}

/**
 * PHASE 11 — Tenant Subscription Management & Quota Self-Service Contracts
 */
export interface TenantSubscriptionQuotaUsageDTO {
  activeLoansUsed: number;
  maxActiveLoans: number;
  activeLoansUtilizationPercent: DecimalString;
  activeEmployeesUsed: number;
  maxEmployees: number;
  activeEmployeesUtilizationPercent: DecimalString;
  activeCustomersUsed: number;
  maxCustomers: number;
  activeCustomersUtilizationPercent: DecimalString;
}

export interface TenantSubscriptionHistoryItemDTO {
  id: UUID;
  action: string;
  actorFullName: string | null;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  createdAt: ISODateString;
}

export interface TenantSubscriptionOverviewDTO {
  subscriptionId: UUID;
  businessId: UUID;
  planId: UUID;
  planCode: string;
  planName: string;
  planDescription: string | null;
  status: SubscriptionStatus;
  billingInterval: 'MONTHLY' | 'ANNUAL';
  unitPriceUsd: DecimalString;
  trialEndsAt: ISODateString | null;
  currentPeriodStart: ISODateString;
  currentPeriodEnd: ISODateString;
  daysRemainingInPeriod: number;
  autoRenew: boolean;
  canceledAt: ISODateString | null;
  features: Record<string, unknown>;
  billingProviderMode: 'MANUAL_INVOICE_OR_SANDBOX';
  quotas: TenantSubscriptionQuotaUsageDTO;
  availablePlans: SubscriptionPlanCatalogDTO[];
  history: TenantSubscriptionHistoryItemDTO[];
}

export interface ChangeTenantSubscriptionPlanRequestDTO {
  planCode: string;
  billingInterval: 'MONTHLY' | 'ANNUAL';
  autoRenew?: boolean;
}

export interface CancelTenantSubscriptionRequestDTO {
  immediate?: boolean;
  reason: string;
}
