import type {
  ApiResponse,
  BusinessContextDetailsDTO,
  BusinessEmployeeDTO,
  BusinessOperationalSettingsDTO,
  BusinessProfileDTO,
  BusinessRoleDTO,
  CreateBusinessRequestDTO,
  CreateBusinessRoleRequestDTO,
  CreateCustomerDocumentRequestDTO,
  CreateCustomerRequestDTO,
  CreateLoanApplicationRequestDTO,
  CreateLoanProductRequestDTO,
  CustomerDetailsResponseDTO,
  CustomerDocumentDTO,
  CustomerDTO,
  CustomerRiskTier,
  InterestCalculationMethod,
  InviteOrAddEmployeeRequestDTO,
  LoanDetailsResponseDTO,
  LoanDTO,
  LoanLifecycleActionRequestDTO,
  LoanProductDTO,
  LoanSchedulePreviewSummary,
  LoanStatus,
  PermissionCatalogItemDTO,
  PersonalProfileDTO,
  ProvisionSessionRequestDTO,
  RepaymentFrequency,
  SessionContextResponseDTO,
  UpdateBusinessProfileRequestDTO,
  UpdateBusinessRoleRequestDTO,
  UpdateBusinessSettingsRequestDTO,
  UpdateCustomerRequestDTO,
  UpdateEmployeeMembershipRequestDTO,
  UpdateLoanProductRequestDTO,
  UpdatePersonalProfileRequestDTO,
  EvaluateOverdueSchedulesRequestDTO,
  InstallmentWithLoanContextDTO,
  OverdueEvaluationResultDTO,
  OverdueLoanSummaryDTO,
  RepaymentScheduleFilterParamsDTO,
  RestructureLoanRequestDTO,
  WriteOffLoanRequestDTO,
  AuditLogEntryDTO,
  BusinessFinancialDashboardDTO,
  BusinessStatus,
  NotificationItemDTO,
  PaymentReceiptDTO,
  PlatformSettingItemDTO,
  RecordRepaymentRequestDTO,
  RepaymentDetailsResponseDTO,
  RepaymentDTO,
  RepaymentMethod,
  ReverseRepaymentRequestDTO,
  SubscriptionPlanCatalogDTO,
  SuperAdminAssignSubscriptionRequestDTO,
  SuperAdminBroadcastNotificationRequestDTO,
  SuperAdminBusinessSummaryDTO,
  SuperAdminGlobalKpisDTO,
  SuperAdminRevenueAnalyticsDTO,
  SuperAdminSubscriptionRecordDTO,
  SuperAdminUpdateBusinessStatusRequestDTO,
  SuperAdminUpdatePlatformSettingRequestDTO,
  SuperAdminUpdateUserStatusRequestDTO,
  SuperAdminUpsertPlanRequestDTO,
  SuperAdminUserDirectoryItemDTO,
  CancelTenantSubscriptionRequestDTO,
  ChangeTenantSubscriptionPlanRequestDTO,
  TenantSubscriptionOverviewDTO,
} from '@flotech/shared';

const API_BASE_URL = import.meta.env['VITE_API_BASE_URL'] ?? '/api/v1';

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  idToken?: string;
  appCheckToken?: string;
  businessId?: string;
}

export async function apiRequest<T>(
  endpointPath: string,
  options: RequestOptions = {}
): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (options.idToken) {
    headers['Authorization'] = `Bearer ${options.idToken}`;
  }
  if (options.appCheckToken) {
    headers['X-Firebase-AppCheck'] = options.appCheckToken;
  }
  if (options.businessId) {
    headers['X-Business-Id'] = options.businessId;
  }

  const response = await fetch(`${API_BASE_URL}${endpointPath}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const payload = (await response.json()) as ApiResponse<T>;
  return payload;
}

export async function requestBackendLoanSchedulePreview(params: {
  principalAmount: string;
  nominalInterestRatePercent: string;
  ratePeriod: 'PER_PERIOD' | 'PER_MONTH' | 'PER_ANNUM';
  interestMethod: InterestCalculationMethod;
  repaymentFrequency: RepaymentFrequency;
  termInstallments: number;
  firstRepaymentDate: string;
}): Promise<ApiResponse<LoanSchedulePreviewSummary>> {
  return apiRequest<LoanSchedulePreviewSummary>('/financial/schedule-preview', {
    method: 'POST',
    body: params,
  });
}

/**
 * PHASE 2 — Authentication & Personal Profile API Calls
 */
export async function provisionBackendUserSession(
  idToken: string,
  appCheckToken: string | undefined,
  body: ProvisionSessionRequestDTO = {}
): Promise<ApiResponse<SessionContextResponseDTO>> {
  return apiRequest<SessionContextResponseDTO>('/auth/session', {
    method: 'POST',
    idToken,
    appCheckToken,
    body,
  });
}

export async function fetchAuthenticatedPersonalProfile(
  idToken: string,
  appCheckToken?: string
): Promise<ApiResponse<SessionContextResponseDTO>> {
  return apiRequest<SessionContextResponseDTO>('/auth/me', {
    method: 'GET',
    idToken,
    appCheckToken,
  });
}

export async function updateAuthenticatedPersonalProfile(
  idToken: string,
  appCheckToken: string | undefined,
  updates: UpdatePersonalProfileRequestDTO
): Promise<ApiResponse<PersonalProfileDTO>> {
  return apiRequest<PersonalProfileDTO>('/auth/me', {
    method: 'PATCH',
    idToken,
    appCheckToken,
    body: updates,
  });
}

/**
 * PHASE 3 — Multi-Tenant Business Profiles, Memberships & Settings API Calls
 */
export async function createNewBusinessTenant(
  idToken: string,
  appCheckToken: string | undefined,
  payload: CreateBusinessRequestDTO
): Promise<ApiResponse<BusinessContextDetailsDTO>> {
  return apiRequest<BusinessContextDetailsDTO>('/businesses', {
    method: 'POST',
    idToken,
    appCheckToken,
    body: payload,
  });
}

export async function fetchTenantBusinessContext(
  idToken: string,
  appCheckToken: string | undefined,
  businessId: string
): Promise<ApiResponse<BusinessContextDetailsDTO>> {
  return apiRequest<BusinessContextDetailsDTO>(`/businesses/${businessId}/context`, {
    method: 'GET',
    idToken,
    appCheckToken,
    businessId,
  });
}

export async function updateTenantBusinessProfileApi(
  idToken: string,
  appCheckToken: string | undefined,
  businessId: string,
  updates: UpdateBusinessProfileRequestDTO
): Promise<ApiResponse<BusinessProfileDTO>> {
  return apiRequest<BusinessProfileDTO>(`/businesses/${businessId}/profile`, {
    method: 'PATCH',
    idToken,
    appCheckToken,
    businessId,
    body: updates,
  });
}

export async function updateTenantBusinessSettingsApi(
  idToken: string,
  appCheckToken: string | undefined,
  businessId: string,
  updates: UpdateBusinessSettingsRequestDTO
): Promise<ApiResponse<BusinessOperationalSettingsDTO>> {
  return apiRequest<BusinessOperationalSettingsDTO>(`/businesses/${businessId}/settings`, {
    method: 'PATCH',
    idToken,
    appCheckToken,
    businessId,
    body: updates,
  });
}

/**
 * PHASE 4 — Tenant RBAC Roles, Permissions Catalog & Employee Management API Calls
 */
export async function fetchPermissionsCatalogApi(
  idToken: string,
  appCheckToken: string | undefined,
  businessId: string
): Promise<ApiResponse<PermissionCatalogItemDTO[]>> {
  return apiRequest<PermissionCatalogItemDTO[]>(`/businesses/${businessId}/permissions`, {
    method: 'GET',
    idToken,
    appCheckToken,
    businessId,
  });
}

export async function fetchBusinessRolesApi(
  idToken: string,
  appCheckToken: string | undefined,
  businessId: string
): Promise<ApiResponse<BusinessRoleDTO[]>> {
  return apiRequest<BusinessRoleDTO[]>(`/businesses/${businessId}/roles`, {
    method: 'GET',
    idToken,
    appCheckToken,
    businessId,
  });
}

export async function createBusinessRoleApi(
  idToken: string,
  appCheckToken: string | undefined,
  businessId: string,
  payload: CreateBusinessRoleRequestDTO
): Promise<ApiResponse<BusinessRoleDTO>> {
  return apiRequest<BusinessRoleDTO>(`/businesses/${businessId}/roles`, {
    method: 'POST',
    idToken,
    appCheckToken,
    businessId,
    body: payload,
  });
}

export async function updateBusinessRoleApi(
  idToken: string,
  appCheckToken: string | undefined,
  businessId: string,
  roleId: string,
  payload: UpdateBusinessRoleRequestDTO
): Promise<ApiResponse<BusinessRoleDTO>> {
  return apiRequest<BusinessRoleDTO>(`/businesses/${businessId}/roles/${roleId}`, {
    method: 'PATCH',
    idToken,
    appCheckToken,
    businessId,
    body: payload,
  });
}

export async function fetchBusinessEmployeesApi(
  idToken: string,
  appCheckToken: string | undefined,
  businessId: string
): Promise<ApiResponse<BusinessEmployeeDTO[]>> {
  return apiRequest<BusinessEmployeeDTO[]>(`/businesses/${businessId}/employees`, {
    method: 'GET',
    idToken,
    appCheckToken,
    businessId,
  });
}

export async function inviteOrAddEmployeeApi(
  idToken: string,
  appCheckToken: string | undefined,
  businessId: string,
  payload: InviteOrAddEmployeeRequestDTO
): Promise<ApiResponse<BusinessEmployeeDTO>> {
  return apiRequest<BusinessEmployeeDTO>(`/businesses/${businessId}/employees`, {
    method: 'POST',
    idToken,
    appCheckToken,
    businessId,
    body: payload,
  });
}

export async function updateBusinessEmployeeApi(
  idToken: string,
  appCheckToken: string | undefined,
  businessId: string,
  membershipId: string,
  payload: UpdateEmployeeMembershipRequestDTO
): Promise<ApiResponse<BusinessEmployeeDTO>> {
  return apiRequest<BusinessEmployeeDTO>(
    `/businesses/${businessId}/employees/${membershipId}`,
    {
      method: 'PATCH',
      idToken,
      appCheckToken,
      businessId,
      body: payload,
    }
  );
}

/**
 * PHASE 5 — Customer Management & KYC Document API Calls
 */
export async function fetchCustomersApi(
  idToken: string,
  appCheckToken: string | undefined,
  businessId: string,
  filters?: { q?: string; riskTier?: CustomerRiskTier; includeArchived?: boolean }
): Promise<ApiResponse<CustomerDTO[]>> {
  const params = new URLSearchParams();
  if (filters?.q && filters.q.trim().length > 0) {
    params.set('q', filters.q.trim());
  }
  if (filters?.riskTier) {
    params.set('riskTier', filters.riskTier);
  }
  if (filters?.includeArchived) {
    params.set('includeArchived', 'true');
  }
  const queryString = params.toString();
  const path = `/businesses/${businessId}/customers${queryString ? `?${queryString}` : ''}`;

  return apiRequest<CustomerDTO[]>(path, {
    method: 'GET',
    idToken,
    appCheckToken,
    businessId,
  });
}

export async function fetchCustomerDetailsApi(
  idToken: string,
  appCheckToken: string | undefined,
  businessId: string,
  customerId: string
): Promise<ApiResponse<CustomerDetailsResponseDTO>> {
  return apiRequest<CustomerDetailsResponseDTO>(
    `/businesses/${businessId}/customers/${customerId}`,
    {
      method: 'GET',
      idToken,
      appCheckToken,
      businessId,
    }
  );
}

export async function createCustomerApi(
  idToken: string,
  appCheckToken: string | undefined,
  businessId: string,
  payload: CreateCustomerRequestDTO
): Promise<ApiResponse<CustomerDTO>> {
  return apiRequest<CustomerDTO>(`/businesses/${businessId}/customers`, {
    method: 'POST',
    idToken,
    appCheckToken,
    businessId,
    body: payload,
  });
}

export async function updateCustomerApi(
  idToken: string,
  appCheckToken: string | undefined,
  businessId: string,
  customerId: string,
  payload: UpdateCustomerRequestDTO
): Promise<ApiResponse<CustomerDTO>> {
  return apiRequest<CustomerDTO>(`/businesses/${businessId}/customers/${customerId}`, {
    method: 'PATCH',
    idToken,
    appCheckToken,
    businessId,
    body: payload,
  });
}

export async function addCustomerKycDocumentApi(
  idToken: string,
  appCheckToken: string | undefined,
  businessId: string,
  customerId: string,
  payload: CreateCustomerDocumentRequestDTO
): Promise<ApiResponse<CustomerDocumentDTO>> {
  return apiRequest<CustomerDocumentDTO>(
    `/businesses/${businessId}/customers/${customerId}/documents`,
    {
      method: 'POST',
      idToken,
      appCheckToken,
      businessId,
      body: payload,
    }
  );
}

export async function verifyCustomerKycDocumentApi(
  idToken: string,
  appCheckToken: string | undefined,
  businessId: string,
  customerId: string,
  documentId: string
): Promise<ApiResponse<CustomerDocumentDTO>> {
  return apiRequest<CustomerDocumentDTO>(
    `/businesses/${businessId}/customers/${customerId}/documents/${documentId}/verify`,
    {
      method: 'POST',
      idToken,
      appCheckToken,
      businessId,
    }
  );
}

/**
 * PHASE 6 — Loan Products & Loan Management API Calls
 */
export async function fetchLoanProductsApi(
  idToken: string,
  appCheckToken: string | undefined,
  businessId: string,
  includeInactive = true
): Promise<ApiResponse<LoanProductDTO[]>> {
  const query = includeInactive ? '?includeInactive=true' : '?includeInactive=false';
  return apiRequest<LoanProductDTO[]>(`/businesses/${businessId}/loan-products${query}`, {
    method: 'GET',
    idToken,
    appCheckToken,
    businessId,
  });
}

export async function createLoanProductApi(
  idToken: string,
  appCheckToken: string | undefined,
  businessId: string,
  payload: CreateLoanProductRequestDTO
): Promise<ApiResponse<LoanProductDTO>> {
  return apiRequest<LoanProductDTO>(`/businesses/${businessId}/loan-products`, {
    method: 'POST',
    idToken,
    appCheckToken,
    businessId,
    body: payload,
  });
}

export async function updateLoanProductApi(
  idToken: string,
  appCheckToken: string | undefined,
  businessId: string,
  productId: string,
  payload: UpdateLoanProductRequestDTO
): Promise<ApiResponse<LoanProductDTO>> {
  return apiRequest<LoanProductDTO>(
    `/businesses/${businessId}/loan-products/${productId}`,
    {
      method: 'PATCH',
      idToken,
      appCheckToken,
      businessId,
      body: payload,
    }
  );
}

export async function fetchLoansApi(
  idToken: string,
  appCheckToken: string | undefined,
  businessId: string,
  filters?: {
    status?: LoanStatus;
    customerId?: string;
    loanProductId?: string;
    q?: string;
  }
): Promise<ApiResponse<LoanDTO[]>> {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.customerId) params.set('customerId', filters.customerId);
  if (filters?.loanProductId) params.set('loanProductId', filters.loanProductId);
  if (filters?.q && filters.q.trim().length > 0) params.set('q', filters.q.trim());

  const queryString = params.toString();
  const path = `/businesses/${businessId}/loans${queryString ? `?${queryString}` : ''}`;

  return apiRequest<LoanDTO[]>(path, {
    method: 'GET',
    idToken,
    appCheckToken,
    businessId,
  });
}

export async function fetchLoanDetailsApi(
  idToken: string,
  appCheckToken: string | undefined,
  businessId: string,
  loanId: string
): Promise<ApiResponse<LoanDetailsResponseDTO>> {
  return apiRequest<LoanDetailsResponseDTO>(
    `/businesses/${businessId}/loans/${loanId}`,
    {
      method: 'GET',
      idToken,
      appCheckToken,
      businessId,
    }
  );
}

export async function createLoanApplicationApi(
  idToken: string,
  appCheckToken: string | undefined,
  businessId: string,
  payload: CreateLoanApplicationRequestDTO
): Promise<ApiResponse<LoanDTO>> {
  return apiRequest<LoanDTO>(`/businesses/${businessId}/loans`, {
    method: 'POST',
    idToken,
    appCheckToken,
    businessId,
    body: payload,
  });
}

export async function submitLoanApplicationApi(
  idToken: string,
  appCheckToken: string | undefined,
  businessId: string,
  loanId: string,
  payload?: LoanLifecycleActionRequestDTO
): Promise<ApiResponse<LoanDTO>> {
  return apiRequest<LoanDTO>(`/businesses/${businessId}/loans/${loanId}/submit`, {
    method: 'POST',
    idToken,
    appCheckToken,
    businessId,
    body: payload ?? {},
  });
}

export async function reviewLoanApplicationApi(
  idToken: string,
  appCheckToken: string | undefined,
  businessId: string,
  loanId: string,
  payload?: LoanLifecycleActionRequestDTO
): Promise<ApiResponse<LoanDTO>> {
  return apiRequest<LoanDTO>(`/businesses/${businessId}/loans/${loanId}/review`, {
    method: 'POST',
    idToken,
    appCheckToken,
    businessId,
    body: payload ?? {},
  });
}

export async function approveLoanApplicationApi(
  idToken: string,
  appCheckToken: string | undefined,
  businessId: string,
  loanId: string,
  payload?: LoanLifecycleActionRequestDTO
): Promise<ApiResponse<LoanDTO>> {
  return apiRequest<LoanDTO>(`/businesses/${businessId}/loans/${loanId}/approve`, {
    method: 'POST',
    idToken,
    appCheckToken,
    businessId,
    body: payload ?? {},
  });
}

export async function rejectLoanApplicationApi(
  idToken: string,
  appCheckToken: string | undefined,
  businessId: string,
  loanId: string,
  payload?: LoanLifecycleActionRequestDTO
): Promise<ApiResponse<LoanDTO>> {
  return apiRequest<LoanDTO>(`/businesses/${businessId}/loans/${loanId}/reject`, {
    method: 'POST',
    idToken,
    appCheckToken,
    businessId,
    body: payload ?? {},
  });
}

export async function disburseLoanApi(
  idToken: string,
  appCheckToken: string | undefined,
  businessId: string,
  loanId: string,
  payload?: LoanLifecycleActionRequestDTO
): Promise<ApiResponse<LoanDetailsResponseDTO>> {
  return apiRequest<LoanDetailsResponseDTO>(
    `/businesses/${businessId}/loans/${loanId}/disburse`,
    {
      method: 'POST',
      idToken,
      appCheckToken,
      businessId,
      body: payload ?? {},
    }
  );
}

/**
 * PHASE 7 — Repayment Schedules, Delinquency Evaluation, Overdue Loans, Restructuring & Write-Off API Calls
 */
export async function fetchRepaymentSchedulesApi(
  idToken: string,
  appCheckToken: string | undefined,
  businessId: string,
  filters?: RepaymentScheduleFilterParamsDTO
): Promise<ApiResponse<InstallmentWithLoanContextDTO[]>> {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.loanId) params.set('loanId', filters.loanId);
  if (filters?.customerId) params.set('customerId', filters.customerId);
  if (filters?.dueFrom) params.set('dueFrom', filters.dueFrom);
  if (filters?.dueTo) params.set('dueTo', filters.dueTo);
  if (filters?.overdueOnly) params.set('overdueOnly', 'true');
  if (filters?.asOfDate) params.set('asOfDate', filters.asOfDate);

  const queryString = params.toString();
  const path = `/businesses/${businessId}/repayment-schedules${queryString ? `?${queryString}` : ''}`;

  return apiRequest<InstallmentWithLoanContextDTO[]>(path, {
    method: 'GET',
    idToken,
    appCheckToken,
    businessId,
  });
}

export async function evaluateOverdueSchedulesApi(
  idToken: string,
  appCheckToken: string | undefined,
  businessId: string,
  payload?: EvaluateOverdueSchedulesRequestDTO
): Promise<ApiResponse<OverdueEvaluationResultDTO>> {
  return apiRequest<OverdueEvaluationResultDTO>(
    `/businesses/${businessId}/repayment-schedules/evaluate-overdue`,
    {
      method: 'POST',
      idToken,
      appCheckToken,
      businessId,
      body: payload ?? {},
    }
  );
}

export async function fetchOverdueLoansApi(
  idToken: string,
  appCheckToken: string | undefined,
  businessId: string,
  asOfDate?: string
): Promise<ApiResponse<OverdueLoanSummaryDTO[]>> {
  const query = asOfDate ? `?asOfDate=${encodeURIComponent(asOfDate)}` : '';
  return apiRequest<OverdueLoanSummaryDTO[]>(`/businesses/${businessId}/overdue-loans${query}`, {
    method: 'GET',
    idToken,
    appCheckToken,
    businessId,
  });
}

export async function restructureLoanApi(
  idToken: string,
  appCheckToken: string | undefined,
  businessId: string,
  loanId: string,
  payload: RestructureLoanRequestDTO
): Promise<ApiResponse<LoanDetailsResponseDTO>> {
  return apiRequest<LoanDetailsResponseDTO>(
    `/businesses/${businessId}/loans/${loanId}/restructure`,
    {
      method: 'POST',
      idToken,
      appCheckToken,
      businessId,
      body: payload,
    }
  );
}

export async function writeOffLoanApi(
  idToken: string,
  appCheckToken: string | undefined,
  businessId: string,
  loanId: string,
  payload: WriteOffLoanRequestDTO
): Promise<ApiResponse<LoanDTO>> {
  return apiRequest<LoanDTO>(`/businesses/${businessId}/loans/${loanId}/write-off`, {
    method: 'POST',
    idToken,
    appCheckToken,
    businessId,
    body: payload,
  });
}

/**
 * PHASE 8 — Repayment Management, Waterfall Allocation & Receipts API Calls
 */
export async function fetchRepaymentsApi(
  idToken: string,
  appCheckToken: string | undefined,
  businessId: string,
  filters?: {
    loanId?: string;
    customerId?: string;
    paymentMethod?: RepaymentMethod;
    includeReversed?: boolean;
  }
): Promise<ApiResponse<RepaymentDTO[]>> {
  const params = new URLSearchParams();
  if (filters?.loanId) params.set('loanId', filters.loanId);
  if (filters?.customerId) params.set('customerId', filters.customerId);
  if (filters?.paymentMethod) params.set('paymentMethod', filters.paymentMethod);
  if (filters?.includeReversed !== undefined) {
    params.set('includeReversed', filters.includeReversed ? 'true' : 'false');
  }
  const queryString = params.toString();
  const path = `/businesses/${businessId}/repayments${queryString ? `?${queryString}` : ''}`;

  return apiRequest<RepaymentDTO[]>(path, {
    method: 'GET',
    idToken,
    appCheckToken,
    businessId,
  });
}

export async function recordRepaymentApi(
  idToken: string,
  appCheckToken: string | undefined,
  businessId: string,
  payload: RecordRepaymentRequestDTO
): Promise<ApiResponse<RepaymentDetailsResponseDTO>> {
  return apiRequest<RepaymentDetailsResponseDTO>(`/businesses/${businessId}/repayments`, {
    method: 'POST',
    idToken,
    appCheckToken,
    businessId,
    body: payload,
  });
}

export async function fetchRepaymentDetailsApi(
  idToken: string,
  appCheckToken: string | undefined,
  businessId: string,
  repaymentId: string
): Promise<ApiResponse<RepaymentDetailsResponseDTO>> {
  return apiRequest<RepaymentDetailsResponseDTO>(
    `/businesses/${businessId}/repayments/${repaymentId}`,
    {
      method: 'GET',
      idToken,
      appCheckToken,
      businessId,
    }
  );
}

export async function reverseRepaymentApi(
  idToken: string,
  appCheckToken: string | undefined,
  businessId: string,
  repaymentId: string,
  payload: ReverseRepaymentRequestDTO
): Promise<ApiResponse<RepaymentDetailsResponseDTO>> {
  return apiRequest<RepaymentDetailsResponseDTO>(
    `/businesses/${businessId}/repayments/${repaymentId}/reverse`,
    {
      method: 'POST',
      idToken,
      appCheckToken,
      businessId,
      body: payload,
    }
  );
}

export async function fetchPaymentReceiptApi(
  idToken: string,
  appCheckToken: string | undefined,
  businessId: string,
  repaymentId: string
): Promise<ApiResponse<PaymentReceiptDTO>> {
  return apiRequest<PaymentReceiptDTO>(
    `/businesses/${businessId}/repayments/${repaymentId}/receipt`,
    {
      method: 'GET',
      idToken,
      appCheckToken,
      businessId,
    }
  );
}

/**
 * PHASE 9 — Financial Dashboards, Portfolio Analytics, Exports & Notifications API Calls
 */
export async function fetchBusinessFinancialDashboardApi(
  idToken: string,
  appCheckToken: string | undefined,
  businessId: string,
  asOfDate?: string
): Promise<ApiResponse<BusinessFinancialDashboardDTO>> {
  const query = asOfDate ? `?asOfDate=${encodeURIComponent(asOfDate)}` : '';
  return apiRequest<BusinessFinancialDashboardDTO>(
    `/businesses/${businessId}/dashboard${query}`,
    {
      method: 'GET',
      idToken,
      appCheckToken,
      businessId,
    }
  );
}

export async function fetchBusinessPortfolioReportApi(
  idToken: string,
  appCheckToken: string | undefined,
  businessId: string,
  asOfDate?: string
): Promise<ApiResponse<BusinessFinancialDashboardDTO>> {
  const query = asOfDate ? `?asOfDate=${encodeURIComponent(asOfDate)}` : '';
  return apiRequest<BusinessFinancialDashboardDTO>(
    `/businesses/${businessId}/reports/portfolio${query}`,
    {
      method: 'GET',
      idToken,
      appCheckToken,
      businessId,
    }
  );
}

export async function exportBusinessFinancialStatementCsvApi(
  idToken: string,
  appCheckToken: string | undefined,
  businessId: string,
  asOfDate?: string
): Promise<ApiResponse<{ fileName: string; csvContent: string }>> {
  const query = asOfDate ? `?asOfDate=${encodeURIComponent(asOfDate)}` : '';
  return apiRequest<{ fileName: string; csvContent: string }>(
    `/businesses/${businessId}/reports/export-csv${query}`,
    {
      method: 'GET',
      idToken,
      appCheckToken,
      businessId,
    }
  );
}

export async function fetchTenantNotificationsApi(
  idToken: string,
  appCheckToken: string | undefined,
  businessId: string,
  unreadOnly = false
): Promise<ApiResponse<NotificationItemDTO[]>> {
  const query = unreadOnly ? '?unreadOnly=true' : '';
  return apiRequest<NotificationItemDTO[]>(`/businesses/${businessId}/notifications${query}`, {
    method: 'GET',
    idToken,
    appCheckToken,
    businessId,
  });
}

export async function markTenantNotificationReadApi(
  idToken: string,
  appCheckToken: string | undefined,
  businessId: string,
  notificationId: string
): Promise<ApiResponse<NotificationItemDTO>> {
  return apiRequest<NotificationItemDTO>(
    `/businesses/${businessId}/notifications/${notificationId}/read`,
    {
      method: 'POST',
      idToken,
      appCheckToken,
      businessId,
    }
  );
}

/**
 * PHASE 10 — FloTech Digital Super Admin Environment API Calls
 */
export async function fetchSuperAdminDashboardApi(
  idToken: string,
  appCheckToken: string | undefined
): Promise<ApiResponse<SuperAdminGlobalKpisDTO>> {
  return apiRequest<SuperAdminGlobalKpisDTO>('/super-admin/dashboard', {
    method: 'GET',
    idToken,
    appCheckToken,
  });
}

export async function fetchSuperAdminBusinessesApi(
  idToken: string,
  appCheckToken: string | undefined,
  filters?: { status?: BusinessStatus; q?: string }
): Promise<ApiResponse<SuperAdminBusinessSummaryDTO[]>> {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.q && filters.q.trim().length > 0) params.set('q', filters.q.trim());
  const queryString = params.toString();
  return apiRequest<SuperAdminBusinessSummaryDTO[]>(
    `/super-admin/businesses${queryString ? `?${queryString}` : ''}`,
    {
      method: 'GET',
      idToken,
      appCheckToken,
    }
  );
}

export async function updateSuperAdminBusinessStatusApi(
  idToken: string,
  appCheckToken: string | undefined,
  businessId: string,
  payload: SuperAdminUpdateBusinessStatusRequestDTO
): Promise<ApiResponse<SuperAdminBusinessSummaryDTO>> {
  return apiRequest<SuperAdminBusinessSummaryDTO>(
    `/super-admin/businesses/${businessId}/status`,
    {
      method: 'PATCH',
      idToken,
      appCheckToken,
      body: payload,
    }
  );
}

export async function fetchSuperAdminUsersApi(
  idToken: string,
  appCheckToken: string | undefined,
  q?: string
): Promise<ApiResponse<SuperAdminUserDirectoryItemDTO[]>> {
  const query = q && q.trim().length > 0 ? `?q=${encodeURIComponent(q.trim())}` : '';
  return apiRequest<SuperAdminUserDirectoryItemDTO[]>(`/super-admin/users${query}`, {
    method: 'GET',
    idToken,
    appCheckToken,
  });
}

export async function updateSuperAdminUserStatusApi(
  idToken: string,
  appCheckToken: string | undefined,
  userId: string,
  payload: SuperAdminUpdateUserStatusRequestDTO
): Promise<ApiResponse<SuperAdminUserDirectoryItemDTO>> {
  return apiRequest<SuperAdminUserDirectoryItemDTO>(
    `/super-admin/users/${userId}/status`,
    {
      method: 'PATCH',
      idToken,
      appCheckToken,
      body: payload,
    }
  );
}

export async function fetchSuperAdminPlansApi(
  idToken: string,
  appCheckToken: string | undefined
): Promise<ApiResponse<SubscriptionPlanCatalogDTO[]>> {
  return apiRequest<SubscriptionPlanCatalogDTO[]>('/super-admin/plans', {
    method: 'GET',
    idToken,
    appCheckToken,
  });
}

export async function upsertSuperAdminPlanApi(
  idToken: string,
  appCheckToken: string | undefined,
  payload: SuperAdminUpsertPlanRequestDTO
): Promise<ApiResponse<SubscriptionPlanCatalogDTO>> {
  return apiRequest<SubscriptionPlanCatalogDTO>('/super-admin/plans', {
    method: 'POST',
    idToken,
    appCheckToken,
    body: payload,
  });
}

export async function fetchSuperAdminSubscriptionsApi(
  idToken: string,
  appCheckToken: string | undefined
): Promise<ApiResponse<SuperAdminSubscriptionRecordDTO[]>> {
  return apiRequest<SuperAdminSubscriptionRecordDTO[]>('/super-admin/subscriptions', {
    method: 'GET',
    idToken,
    appCheckToken,
  });
}

export async function assignSuperAdminSubscriptionApi(
  idToken: string,
  appCheckToken: string | undefined,
  businessId: string,
  payload: SuperAdminAssignSubscriptionRequestDTO
): Promise<ApiResponse<SuperAdminSubscriptionRecordDTO>> {
  return apiRequest<SuperAdminSubscriptionRecordDTO>(
    `/super-admin/businesses/${businessId}/subscription`,
    {
      method: 'PUT',
      idToken,
      appCheckToken,
      body: payload,
    }
  );
}

export async function fetchSuperAdminRevenueAnalyticsApi(
  idToken: string,
  appCheckToken: string | undefined
): Promise<ApiResponse<SuperAdminRevenueAnalyticsDTO>> {
  return apiRequest<SuperAdminRevenueAnalyticsDTO>('/super-admin/revenue-analytics', {
    method: 'GET',
    idToken,
    appCheckToken,
  });
}

export async function broadcastSuperAdminNotificationApi(
  idToken: string,
  appCheckToken: string | undefined,
  payload: SuperAdminBroadcastNotificationRequestDTO
): Promise<ApiResponse<{ deliveredCount: number }>> {
  return apiRequest<{ deliveredCount: number }>('/super-admin/notifications/broadcast', {
    method: 'POST',
    idToken,
    appCheckToken,
    body: payload,
  });
}

export async function fetchSuperAdminAuditLogsApi(
  idToken: string,
  appCheckToken: string | undefined,
  filters?: { businessId?: string; action?: string; limit?: number }
): Promise<ApiResponse<AuditLogEntryDTO[]>> {
  const params = new URLSearchParams();
  if (filters?.businessId) params.set('businessId', filters.businessId);
  if (filters?.action) params.set('action', filters.action);
  if (filters?.limit) params.set('limit', String(filters.limit));
  const queryString = params.toString();
  return apiRequest<AuditLogEntryDTO[]>(
    `/super-admin/audit-logs${queryString ? `?${queryString}` : ''}`,
    {
      method: 'GET',
      idToken,
      appCheckToken,
    }
  );
}

export async function fetchSuperAdminPlatformSettingsApi(
  idToken: string,
  appCheckToken: string | undefined
): Promise<ApiResponse<PlatformSettingItemDTO[]>> {
  return apiRequest<PlatformSettingItemDTO[]>('/super-admin/settings', {
    method: 'GET',
    idToken,
    appCheckToken,
  });
}

export async function updateSuperAdminPlatformSettingApi(
  idToken: string,
  appCheckToken: string | undefined,
  payload: SuperAdminUpdatePlatformSettingRequestDTO
): Promise<ApiResponse<PlatformSettingItemDTO>> {
  return apiRequest<PlatformSettingItemDTO>('/super-admin/settings', {
    method: 'PUT',
    idToken,
    appCheckToken,
    body: payload,
  });
}

/**
 * PHASE 11 — Tenant Subscription Management & Quota Self-Service API Calls
 */
export async function fetchTenantSubscriptionOverviewApi(
  idToken: string,
  appCheckToken: string | undefined,
  businessId: string
): Promise<ApiResponse<TenantSubscriptionOverviewDTO>> {
  return apiRequest<TenantSubscriptionOverviewDTO>(`/businesses/${businessId}/subscription`, {
    method: 'GET',
    idToken,
    appCheckToken,
    businessId,
  });
}

export async function changeTenantSubscriptionPlanApi(
  idToken: string,
  appCheckToken: string | undefined,
  businessId: string,
  payload: ChangeTenantSubscriptionPlanRequestDTO
): Promise<ApiResponse<TenantSubscriptionOverviewDTO>> {
  return apiRequest<TenantSubscriptionOverviewDTO>(
    `/businesses/${businessId}/subscription/change-plan`,
    {
      method: 'POST',
      idToken,
      appCheckToken,
      businessId,
      body: payload,
    }
  );
}

export async function cancelTenantSubscriptionApi(
  idToken: string,
  appCheckToken: string | undefined,
  businessId: string,
  payload: CancelTenantSubscriptionRequestDTO
): Promise<ApiResponse<TenantSubscriptionOverviewDTO>> {
  return apiRequest<TenantSubscriptionOverviewDTO>(
    `/businesses/${businessId}/subscription/cancel`,
    {
      method: 'POST',
      idToken,
      appCheckToken,
      businessId,
      body: payload,
    }
  );
}
