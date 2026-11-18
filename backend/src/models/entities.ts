import type {
  BusinessStatus,
  DecimalString,
  InstallmentStatus,
  InterestCalculationMethod,
  ISODateString,
  LoanStatus,
  MembershipStatus,
  PlatformRole,
  RepaymentFrequency,
  RepaymentMethod,
  SubscriptionStatus,
  UUID,
} from '@flotech/shared';

export interface UserRow {
  id: UUID;
  firebase_uid: string;
  email: string;
  full_name: string;
  phone_number: string | null;
  avatar_storage_path: string | null;
  platform_role: PlatformRole;
  is_active: boolean;
  last_login_at: ISODateString | null;
  created_at: ISODateString;
  updated_at: ISODateString;
}

export interface BusinessRow {
  id: UUID;
  business_code: string;
  legal_name: string;
  trading_name: string | null;
  business_category: string;
  registration_number: string | null;
  tax_id: string | null;
  primary_email: string;
  primary_phone: string;
  country_code: string;
  currency_code: string;
  timezone: string;
  address_line_1: string | null;
  city: string | null;
  logo_storage_path: string | null;
  status: BusinessStatus;
  owner_user_id: UUID;
  settings_json: Record<string, unknown>;
  created_at: ISODateString;
  updated_at: ISODateString;
}

export interface BusinessMembershipRow {
  id: UUID;
  business_id: UUID;
  user_id: UUID;
  role_id: UUID;
  employee_code: string | null;
  job_title: string | null;
  department: string | null;
  status: MembershipStatus;
  invited_by_user_id: UUID | null;
  joined_at: ISODateString | null;
  created_at: ISODateString;
  updated_at: ISODateString;
}

export interface CustomerRow {
  id: UUID;
  business_id: UUID;
  customer_number: string;
  first_name: string;
  last_name: string;
  business_name: string | null;
  email: string | null;
  phone_number: string;
  national_id_number: string | null;
  date_of_birth: ISODateString | null;
  address_line_1: string | null;
  city: string | null;
  employment_status: string | null;
  monthly_income: DecimalString | null;
  credit_score_internal: number | null;
  risk_tier: string;
  is_archived: boolean;
  created_by_user_id: UUID;
  created_at: ISODateString;
  updated_at: ISODateString;
}

export interface LoanProductRow {
  id: UUID;
  business_id: UUID;
  code: string;
  name: string;
  description: string | null;
  currency_code: string;
  interest_method: InterestCalculationMethod;
  repayment_frequency: RepaymentFrequency;
  nominal_interest_rate_percent: DecimalString;
  rate_period: 'PER_PERIOD' | 'PER_MONTH' | 'PER_ANNUM';
  min_principal: DecimalString;
  max_principal: DecimalString;
  min_term_installments: number;
  max_term_installments: number;
  origination_fee_fixed: DecimalString;
  origination_fee_percent: DecimalString;
  late_penalty_rate_percent: DecimalString;
  grace_period_days: number;
  is_active: boolean;
  created_by_user_id: UUID;
  created_at: ISODateString;
  updated_at: ISODateString;
}

export interface LoanRow {
  id: UUID;
  business_id: UUID;
  loan_number: string;
  customer_id: UUID;
  loan_product_id: UUID;
  status: LoanStatus;
  currency_code: string;
  interest_method: InterestCalculationMethod;
  repayment_frequency: RepaymentFrequency;
  nominal_interest_rate_percent: DecimalString;
  rate_period: 'PER_PERIOD' | 'PER_MONTH' | 'PER_ANNUM';
  term_installments: number;
  principal_amount: DecimalString;
  total_interest_amount: DecimalString;
  total_fee_amount: DecimalString;
  total_penalty_amount: DecimalString;
  total_payable_amount: DecimalString;
  principal_outstanding: DecimalString;
  interest_outstanding: DecimalString;
  fee_outstanding: DecimalString;
  penalty_outstanding: DecimalString;
  total_outstanding: DecimalString;
  application_date: ISODateString;
  approved_at: ISODateString | null;
  approved_by_user_id: UUID | null;
  disbursed_at: ISODateString | null;
  disbursed_by_user_id: UUID | null;
  first_repayment_date: ISODateString | null;
  maturity_date: ISODateString | null;
  closed_at: ISODateString | null;
  loan_officer_membership_id: UUID | null;
  purpose: string | null;
  created_by_user_id: UUID;
  created_at: ISODateString;
  updated_at: ISODateString;
}

export interface RepaymentScheduleRow {
  id: UUID;
  business_id: UUID;
  loan_id: UUID;
  installment_number: number;
  due_date: ISODateString;
  status: InstallmentStatus;
  opening_principal_balance: DecimalString;
  principal_due: DecimalString;
  interest_due: DecimalString;
  fee_due: DecimalString;
  penalty_due: DecimalString;
  total_due: DecimalString;
  principal_paid: DecimalString;
  interest_paid: DecimalString;
  fee_paid: DecimalString;
  penalty_paid: DecimalString;
  total_paid: DecimalString;
  closing_principal_balance: DecimalString;
  paid_at: ISODateString | null;
  created_at: ISODateString;
  updated_at: ISODateString;
}

export interface RepaymentRow {
  id: UUID;
  business_id: UUID;
  loan_id: UUID;
  customer_id: UUID;
  reference_number: string;
  payment_method: RepaymentMethod;
  external_transaction_ref: string | null;
  currency_code: string;
  amount_received: DecimalString;
  allocated_penalty: DecimalString;
  allocated_fee: DecimalString;
  allocated_interest: DecimalString;
  allocated_principal: DecimalString;
  overpayment_credit: DecimalString;
  paid_at: ISODateString;
  recorded_by_user_id: UUID;
  is_reversed: boolean;
  reversed_at: ISODateString | null;
  reversed_by_user_id: UUID | null;
  reversal_reason: string | null;
  notes: string | null;
  created_at: ISODateString;
}

export interface BusinessSubscriptionRow {
  id: UUID;
  business_id: UUID;
  plan_id: UUID;
  status: SubscriptionStatus;
  billing_cycle: 'MONTHLY' | 'ANNUAL';
  unit_price: DecimalString;
  currency_code: string;
  current_period_start: ISODateString;
  current_period_end: ISODateString;
  cancel_at_period_end: boolean;
  created_at: ISODateString;
  updated_at: ISODateString;
}
