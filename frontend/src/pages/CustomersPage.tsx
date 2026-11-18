import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, uploadBytes } from 'firebase/storage';
import type {
  CustomerDocumentDTO,
  CustomerDTO,
  CustomerRiskTier,
  LoanDTO,
} from '@flotech/shared';
import {
  Users,
  UserPlus,
  Search,
  FileCheck2,
  FileText,
  ShieldCheck,
  Archive,
  RotateCcw,
  RefreshCw,
  CheckCircle2,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/Card';
import { InputField, SelectField } from '@/components/ui/FormElements';
import {
  DataTableContainer,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
  DataTableCell,
} from '@/components/ui/DataTable';
import {
  getActiveAppCheckToken,
  getFirebaseClientStorage,
  isFirebaseClientConfigured,
} from '@/config/firebaseClient';
import { formatDecimalMoneyDisplay } from '@/config/utils';
import { useAuthSession } from '@/hooks/useAuthSession';
import {
  addCustomerKycDocumentApi,
  createCustomerApi,
  fetchCustomerDetailsApi,
  fetchCustomersApi,
  updateCustomerApi,
  verifyCustomerKycDocumentApi,
} from '@/services/apiClient';

function getRiskTierBadgeVariant(tier: CustomerRiskTier): 'success' | 'primary' | 'warning' | 'danger' {
  switch (tier) {
    case 'LOW':
      return 'success';
    case 'STANDARD':
      return 'primary';
    case 'HIGH':
      return 'warning';
    case 'RESTRICTED':
      return 'danger';
  }
}

export function CustomersPage() {
  const navigate = useNavigate();
  const { firebaseUser, activeBusinessId, activeBusinessProfile } = useAuthSession();

  const [customers, setCustomers] = useState<CustomerDTO[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [riskTierFilter, setRiskTierFilter] = useState<string>('ALL');
  const [includeArchived, setIncludeArchived] = useState(false);

  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerDTO | null>(null);
  const [selectedCustomerDocs, setSelectedCustomerDocs] = useState<CustomerDocumentDTO[]>([]);
  const [selectedCustomerLoans, setSelectedCustomerLoans] = useState<LoanDTO[]>([]);

  // Create Customer Form State
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [nationalIdNumber, setNationalIdNumber] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [city, setCity] = useState('');
  const [employmentStatus, setEmploymentStatus] = useState('EMPLOYED');
  const [monthlyIncome, setMonthlyIncome] = useState('2500.00');
  const [creditScoreInternal, setCreditScoreInternal] = useState('720');
  const [riskTier, setRiskTier] = useState<CustomerRiskTier>('STANDARD');

  // Edit Selected Customer State
  const [editMonthlyIncome, setEditMonthlyIncome] = useState('');
  const [editCreditScore, setEditCreditScore] = useState('');
  const [editRiskTier, setEditRiskTier] = useState<CustomerRiskTier>('STANDARD');

  // KYC Document Form State
  const [kycDocumentType, setKycDocumentType] = useState('NATIONAL_ID');
  const [kycFileName, setKycFileName] = useState('national_id_front.pdf');
  const [kycMimeType, setKycMimeType] = useState('application/pdf');
  const [kycFileSizeBytes, setKycFileSizeBytes] = useState('245760');

  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const currencyCode = activeBusinessProfile?.currencyCode ?? 'USD';

  const loadCustomers = useCallback(async () => {
    if (!firebaseUser || !activeBusinessId) {
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const idToken = await firebaseUser.getIdToken();
      const appCheckToken = await getActiveAppCheckToken();

      const res = await fetchCustomersApi(idToken, appCheckToken, activeBusinessId, {
        q: searchQuery.trim() || undefined,
        riskTier:
          riskTierFilter !== 'ALL' ? (riskTierFilter as CustomerRiskTier) : undefined,
        includeArchived,
      });

      if (res.success) {
        setCustomers(res.data);
      } else {
        setErrorMessage(`${res.error.code}: ${res.error.message}`);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load customers.');
    } finally {
      setIsLoading(false);
    }
  }, [firebaseUser, activeBusinessId, searchQuery, riskTierFilter, includeArchived]);

  useEffect(() => {
    void loadCustomers();
  }, [loadCustomers]);

  async function handleInspectCustomer(customer: CustomerDTO) {
    if (!firebaseUser || !activeBusinessId) return;
    setErrorMessage(null);
    try {
      const idToken = await firebaseUser.getIdToken();
      const appCheckToken = await getActiveAppCheckToken();
      const res = await fetchCustomerDetailsApi(
        idToken,
        appCheckToken,
        activeBusinessId,
        customer.id
      );
      if (res.success) {
        setSelectedCustomer(res.data.customer);
        setSelectedCustomerDocs(res.data.documents);
        setSelectedCustomerLoans(res.data.loans ?? []);
        setEditMonthlyIncome(res.data.customer.monthlyIncome ?? '');
        setEditCreditScore(
          res.data.customer.creditScoreInternal !== null
            ? String(res.data.customer.creditScoreInternal)
            : ''
        );
        setEditRiskTier(res.data.customer.riskTier);
      } else {
        setErrorMessage(`${res.error.code}: ${res.error.message}`);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load customer details.');
    }
  }

  async function handleCreateCustomerSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!firebaseUser || !activeBusinessId) {
      setErrorMessage('Sign in and select an active business tenant first.');
      return;
    }

    setFeedbackMessage(null);
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const idToken = await firebaseUser.getIdToken();
      const appCheckToken = await getActiveAppCheckToken();

      const res = await createCustomerApi(idToken, appCheckToken, activeBusinessId, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        businessName: businessName.trim() || null,
        email: email.trim() || null,
        phoneNumber: phoneNumber.trim(),
        nationalIdNumber: nationalIdNumber.trim() || null,
        dateOfBirth: dateOfBirth.trim() || null,
        addressLine1: addressLine1.trim() || null,
        city: city.trim() || null,
        employmentStatus: employmentStatus.trim() || null,
        monthlyIncome: monthlyIncome.trim() || null,
        creditScoreInternal: creditScoreInternal.trim()
          ? Number(creditScoreInternal)
          : null,
        riskTier,
      });

      if (!res.success) {
        setErrorMessage(`${res.error.code}: ${res.error.message}`);
        return;
      }

      setFeedbackMessage(
        `Customer ${res.data.customerNumber} (${res.data.firstName} ${res.data.lastName}) onboarded in PostgreSQL.`
      );
      setIsCreatingCustomer(false);
      setFirstName('');
      setLastName('');
      setBusinessName('');
      setEmail('');
      setPhoneNumber('');
      setNationalIdNumber('');
      await loadCustomers();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to onboard customer.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleUpdateUnderwritingSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!firebaseUser || !activeBusinessId || !selectedCustomer) return;

    setFeedbackMessage(null);
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const idToken = await firebaseUser.getIdToken();
      const appCheckToken = await getActiveAppCheckToken();

      const res = await updateCustomerApi(
        idToken,
        appCheckToken,
        activeBusinessId,
        selectedCustomer.id,
        {
          monthlyIncome: editMonthlyIncome.trim() || null,
          creditScoreInternal: editCreditScore.trim() ? Number(editCreditScore) : null,
          riskTier: editRiskTier,
        }
      );

      if (!res.success) {
        setErrorMessage(`${res.error.code}: ${res.error.message}`);
        return;
      }

      setSelectedCustomer(res.data);
      setFeedbackMessage(
        `Updated underwriting profile for ${res.data.customerNumber} (${res.data.riskTier}).`
      );
      await loadCustomers();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to update customer.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleToggleArchiveCustomer(customer: CustomerDTO) {
    if (!firebaseUser || !activeBusinessId) return;
    setFeedbackMessage(null);
    setErrorMessage(null);

    try {
      const idToken = await firebaseUser.getIdToken();
      const appCheckToken = await getActiveAppCheckToken();

      const res = await updateCustomerApi(
        idToken,
        appCheckToken,
        activeBusinessId,
        customer.id,
        { isArchived: !customer.isArchived }
      );

      if (!res.success) {
        setErrorMessage(`${res.error.code}: ${res.error.message}`);
        return;
      }

      setFeedbackMessage(
        `${res.data.customerNumber} (${res.data.firstName} ${res.data.lastName}) is now ${res.data.isArchived ? 'Archived' : 'Active'}.`
      );
      if (selectedCustomer?.id === customer.id) {
        setSelectedCustomer(res.data);
      }
      await loadCustomers();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to archive/restore customer.');
    }
  }

  async function handleKycFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !activeBusinessId || !selectedCustomer) return;

    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    setKycFileName(sanitizedName);
    setKycMimeType(file.type || 'application/octet-stream');
    setKycFileSizeBytes(String(file.size));

    if (isFirebaseClientConfigured()) {
      try {
        const storagePath = `businesses/${activeBusinessId}/customers/${selectedCustomer.id}/kyc/${Date.now()}_${sanitizedName}`;
        const storageRef = ref(getFirebaseClientStorage(), storagePath);
        await uploadBytes(storageRef, file);
        setKycFileName(`${Date.now()}_${sanitizedName}`);
      } catch {
        // Fallback to metadata registration if local storage bucket is not connected
      }
    }
  }

  async function handleRegisterKycDocumentSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!firebaseUser || !activeBusinessId || !selectedCustomer) return;

    setFeedbackMessage(null);
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const idToken = await firebaseUser.getIdToken();
      const appCheckToken = await getActiveAppCheckToken();

      const sanitizedFileName = kycFileName.trim().replace(/[^a-zA-Z0-9._-]/g, '_');
      const firebaseStoragePath = `businesses/${activeBusinessId}/customers/${selectedCustomer.id}/kyc/${sanitizedFileName}`;

      const res = await addCustomerKycDocumentApi(
        idToken,
        appCheckToken,
        activeBusinessId,
        selectedCustomer.id,
        {
          documentType: kycDocumentType,
          fileName: sanitizedFileName,
          firebaseStoragePath,
          mimeType: kycMimeType.trim(),
          fileSizeBytes: Number(kycFileSizeBytes) || 1024,
        }
      );

      if (!res.success) {
        setErrorMessage(`${res.error.code}: ${res.error.message}`);
        return;
      }

      setFeedbackMessage(`Registered KYC document "${res.data.fileName}" (${res.data.documentType}).`);
      await handleInspectCustomer(selectedCustomer);
      await loadCustomers();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to register KYC document.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleVerifyKycDocument(doc: CustomerDocumentDTO) {
    if (!firebaseUser || !activeBusinessId || !selectedCustomer) return;
    setFeedbackMessage(null);
    setErrorMessage(null);

    try {
      const idToken = await firebaseUser.getIdToken();
      const appCheckToken = await getActiveAppCheckToken();

      const res = await verifyCustomerKycDocumentApi(
        idToken,
        appCheckToken,
        activeBusinessId,
        selectedCustomer.id,
        doc.id
      );

      if (!res.success) {
        setErrorMessage(`${res.error.code}: ${res.error.message}`);
        return;
      }

      setFeedbackMessage(`Verified KYC document "${res.data.fileName}".`);
      await handleInspectCustomer(selectedCustomer);
      await loadCustomers();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to verify KYC document.');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="primary">PHASE 5 — CUSTOMER &amp; KYC MANAGEMENT</Badge>
            {activeBusinessProfile && (
              <Badge variant="neutral">{activeBusinessProfile.businessCode}</Badge>
            )}
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-flotech-navy">
            Borrowers &amp; KYC Registry
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Onboard retail or SME borrowers, evaluate risk tiers and{' '}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono">
              NUMERIC(19, 4)
            </code>{' '}
            monthly income, and verify tenant-isolated KYC documents.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadCustomers()}
            disabled={isLoading}
          >
            <RefreshCw className="h-4 w-4" />
            {isLoading ? 'Refreshing...' : 'Refresh'}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsCreatingCustomer((prev) => !prev)}
          >
            <UserPlus className="h-4 w-4" />
            {isCreatingCustomer ? 'Close Onboarding Form' : 'Onboard New Customer'}
          </Button>
        </div>
      </div>

      {feedbackMessage && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-900">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-flotech-success" />
          <span>{feedbackMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-flotech-danger">
          {errorMessage}
        </div>
      )}

      {!activeBusinessId ? (
        <Card>
          <CardHeader>
            <CardTitle>No Active Business Selected</CardTitle>
            <CardDescription>
              Sign in and select or onboard a business workspace to manage borrowers.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="primary" onClick={() => navigate('/app/business-profile')}>
              Go to Business Profile &amp; Onboarding
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Create Customer Form */}
          {isCreatingCustomer && (
            <Card className="border-blue-200 bg-blue-50/20">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <UserPlus className="h-5 w-5 text-flotech-primary" />
                  <CardTitle>Onboard New Borrower</CardTitle>
                </div>
                <CardDescription>
                  Automatically assigns a sequential{' '}
                  <code className="rounded bg-slate-100 px-1 py-0.5 text-xs font-mono">
                    {activeBusinessProfile?.settings.customerNumberPrefix ?? 'CUST-'}00001
                  </code>{' '}
                  identifier and enforces your active subscription customer quota.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCreateCustomerSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <InputField
                      label="First Name"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="Amara"
                      required
                    />
                    <InputField
                      label="Last Name"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Okafor"
                      required
                    />
                    <InputField
                      label="SME / Trading Name (Optional)"
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      placeholder="Okafor Agro Logistics Ltd"
                    />
                    <InputField
                      label="Phone Number"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="+234 803 555 0199"
                      required
                    />
                    <InputField
                      label="Email Address (Optional)"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="amara@okaforlogistics.com"
                    />
                    <InputField
                      label="National ID / Tax Number"
                      value={nationalIdNumber}
                      onChange={(e) => setNationalIdNumber(e.target.value)}
                      placeholder="NIN-8492019482"
                    />
                    <InputField
                      label="Date of Birth (YYYY-MM-DD)"
                      type="date"
                      value={dateOfBirth}
                      onChange={(e) => setDateOfBirth(e.target.value)}
                    />
                    <SelectField
                      label="Employment / Business Status"
                      value={employmentStatus}
                      onChange={(e) => setEmploymentStatus(e.target.value)}
                    >
                      <option value="EMPLOYED">Salaried Employee</option>
                      <option value="SELF_EMPLOYED">Self-Employed / Entrepreneur</option>
                      <option value="SME_MERCHANT">Registered SME / Merchant</option>
                      <option value="ASSOCIATION_MEMBER">Cooperative / Association Member</option>
                    </SelectField>
                    <InputField
                      label={`Verified Monthly Income (${currencyCode})`}
                      value={monthlyIncome}
                      onChange={(e) => setMonthlyIncome(e.target.value)}
                      placeholder="2500.00"
                      helperText="Exact decimal string (NUMERIC(19,4))"
                    />
                    <InputField
                      label="Internal Credit Score (0–1000)"
                      type="number"
                      min={0}
                      max={1000}
                      value={creditScoreInternal}
                      onChange={(e) => setCreditScoreInternal(e.target.value)}
                    />
                    <SelectField
                      label="Initial Risk Tier"
                      value={riskTier}
                      onChange={(e) => setRiskTier(e.target.value as CustomerRiskTier)}
                    >
                      <option value="LOW">LOW — Prime Borrower</option>
                      <option value="STANDARD">STANDARD — Normal Underwriting</option>
                      <option value="HIGH">HIGH — Enhanced Monitoring</option>
                      <option value="RESTRICTED">RESTRICTED — Hold New Disbursements</option>
                    </SelectField>
                    <InputField
                      label="City"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="Lagos"
                    />
                  </div>
                  <InputField
                    label="Residential / Business Address"
                    value={addressLine1}
                    onChange={(e) => setAddressLine1(e.target.value)}
                    placeholder="14 Marina Commercial Avenue"
                  />

                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setIsCreatingCustomer(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      variant="primary"
                      disabled={isSubmitting}
                    >
                      <UserPlus className="h-4 w-4" />
                      {isSubmitting ? 'Creating...' : 'Create Customer Record'}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Search & Filter Toolbar */}
          <Card>
            <CardContent className="pt-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-12 sm:items-end">
                <div className="sm:col-span-6">
                  <InputField
                    label="Search Borrowers"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by customer #, name, business, phone, email, or National ID..."
                  />
                </div>
                <div className="sm:col-span-3">
                  <SelectField
                    label="Filter by Risk Tier"
                    value={riskTierFilter}
                    onChange={(e) => setRiskTierFilter(e.target.value)}
                  >
                    <option value="ALL">All Risk Tiers</option>
                    <option value="LOW">LOW Risk</option>
                    <option value="STANDARD">STANDARD Risk</option>
                    <option value="HIGH">HIGH Risk</option>
                    <option value="RESTRICTED">RESTRICTED</option>
                  </SelectField>
                </div>
                <div className="flex items-center justify-between gap-3 sm:col-span-3">
                  <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={includeArchived}
                      onChange={(e) => setIncludeArchived(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-flotech-primary"
                    />
                    Include Archived
                  </label>
                  <Button
                    type="button"
                    variant="navy"
                    size="sm"
                    onClick={() => void loadCustomers()}
                  >
                    <Search className="h-3.5 w-3.5" />
                    Filter
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Borrower Directory Table */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-flotech-primary" />
                  <CardTitle>Tenant Customers ({customers.length})</CardTitle>
                </div>
                <Badge variant="neutral">{currencyCode} Ledger</Badge>
              </div>
              <CardDescription>
                Click &ldquo;Inspect &amp; KYC&rdquo; on any customer to verify KYC documents or update underwriting metrics.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DataTableContainer>
                <DataTableHead>
                  <tr>
                    <DataTableHeaderCell>Customer #</DataTableHeaderCell>
                    <DataTableHeaderCell>Borrower / Business</DataTableHeaderCell>
                    <DataTableHeaderCell>Contact &amp; National ID</DataTableHeaderCell>
                    <DataTableHeaderCell className="text-right">Monthly Income</DataTableHeaderCell>
                    <DataTableHeaderCell>Risk &amp; Score</DataTableHeaderCell>
                    <DataTableHeaderCell>KYC Docs</DataTableHeaderCell>
                    <DataTableHeaderCell className="text-right">Actions</DataTableHeaderCell>
                  </tr>
                </DataTableHead>
                <tbody className="divide-y divide-slate-200">
                  {customers.map((cust) => (
                    <DataTableRow key={cust.id}>
                      <DataTableCell className="tabular-money font-semibold text-flotech-navy">
                        {cust.customerNumber}
                        {cust.isArchived && (
                          <div className="mt-1">
                            <Badge variant="neutral">ARCHIVED</Badge>
                          </div>
                        )}
                      </DataTableCell>
                      <DataTableCell>
                        <div className="font-semibold text-flotech-navy">
                          {cust.firstName} {cust.lastName}
                        </div>
                        {cust.businessName && (
                          <div className="text-xs font-medium text-slate-600">
                            {cust.businessName}
                          </div>
                        )}
                        <div className="text-[11px] text-slate-400">
                          {cust.employmentStatus ?? 'Unspecified'}
                          {cust.city ? ` • ${cust.city}` : ''}
                        </div>
                      </DataTableCell>
                      <DataTableCell>
                        <div className="text-xs font-medium text-slate-800">{cust.phoneNumber}</div>
                        {cust.email && <div className="text-xs text-slate-500">{cust.email}</div>}
                        {cust.nationalIdNumber && (
                          <div className="mt-0.5 font-mono text-[11px] text-slate-500">
                            ID: {cust.nationalIdNumber}
                          </div>
                        )}
                      </DataTableCell>
                      <DataTableCell className="tabular-money text-right font-medium text-flotech-navy">
                        {cust.monthlyIncome
                          ? formatDecimalMoneyDisplay(cust.monthlyIncome, currencyCode)
                          : '—'}
                      </DataTableCell>
                      <DataTableCell>
                        <div className="flex items-center gap-1.5">
                          <Badge variant={getRiskTierBadgeVariant(cust.riskTier)}>
                            {cust.riskTier}
                          </Badge>
                          {cust.creditScoreInternal !== null && (
                            <span className="tabular-money text-xs font-semibold text-slate-700">
                              {cust.creditScoreInternal} pts
                            </span>
                          )}
                        </div>
                      </DataTableCell>
                      <DataTableCell>
                        <Badge
                          variant={
                            cust.verifiedDocumentCount > 0
                              ? 'success'
                              : cust.documentCount > 0
                                ? 'warning'
                                : 'neutral'
                          }
                        >
                          {cust.verifiedDocumentCount}/{cust.documentCount} Verified
                        </Badge>
                      </DataTableCell>
                      <DataTableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void handleInspectCustomer(cust)}
                          >
                            <FileCheck2 className="h-3.5 w-3.5" />
                            Inspect &amp; KYC
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void handleToggleArchiveCustomer(cust)}
                          >
                            {cust.isArchived ? (
                              <RotateCcw className="h-3.5 w-3.5" />
                            ) : (
                              <Archive className="h-3.5 w-3.5" />
                            )}
                            {cust.isArchived ? 'Restore' : 'Archive'}
                          </Button>
                        </div>
                      </DataTableCell>
                    </DataTableRow>
                  ))}
                  {customers.length === 0 && (
                    <DataTableRow>
                      <DataTableCell className="py-8 text-center text-slate-500" colSpan={7}>
                        No customers match the current filter criteria. Click &ldquo;Onboard New Customer&rdquo; above to add a borrower.
                      </DataTableCell>
                    </DataTableRow>
                  )}
                </tbody>
              </DataTableContainer>
            </CardContent>
          </Card>

          {/* Selected Customer Detail & KYC Verification Drawer */}
          {selectedCustomer && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              <div className="lg:col-span-5">
                <Card className="border-slate-300">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="h-5 w-5 text-flotech-primary" />
                        <CardTitle>
                          Underwriting: {selectedCustomer.customerNumber}
                        </CardTitle>
                      </div>
                      <Badge variant={getRiskTierBadgeVariant(selectedCustomer.riskTier)}>
                        {selectedCustomer.riskTier}
                      </Badge>
                    </div>
                    <CardDescription>
                      {selectedCustomer.firstName} {selectedCustomer.lastName}
                      {selectedCustomer.businessName ? ` — ${selectedCustomer.businessName}` : ''}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleUpdateUnderwritingSubmit} className="space-y-4">
                      <InputField
                        label={`Verified Monthly Income (${currencyCode})`}
                        value={editMonthlyIncome}
                        onChange={(e) => setEditMonthlyIncome(e.target.value)}
                        placeholder="3200.00"
                      />
                      <InputField
                        label="Internal Credit Score (0–1000)"
                        type="number"
                        min={0}
                        max={1000}
                        value={editCreditScore}
                        onChange={(e) => setEditCreditScore(e.target.value)}
                      />
                      <SelectField
                        label="Risk Tier Classification"
                        value={editRiskTier}
                        onChange={(e) => setEditRiskTier(e.target.value as CustomerRiskTier)}
                      >
                        <option value="LOW">LOW — Prime Borrower</option>
                        <option value="STANDARD">STANDARD — Normal Underwriting</option>
                        <option value="HIGH">HIGH — Enhanced Monitoring</option>
                        <option value="RESTRICTED">RESTRICTED — Hold New Disbursements</option>
                      </SelectField>
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedCustomer(null)}
                        >
                          Close Panel
                        </Button>
                        <Button
                          type="submit"
                          variant="primary"
                          size="sm"
                          disabled={isSubmitting}
                        >
                          {isSubmitting ? 'Saving...' : 'Save Underwriting Profile'}
                        </Button>
                      </div>
                    </form>
                  </CardContent>
                </Card>
              </div>

              <div className="lg:col-span-7">
                <Card className="border-slate-300">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileText className="h-5 w-5 text-flotech-teal" />
                        <CardTitle>
                          KYC Documents ({selectedCustomerDocs.length})
                        </CardTitle>
                      </div>
                      <code className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-mono text-slate-600">
                        businesses/{activeBusinessId.slice(0, 8)}…/customers/{selectedCustomer.id.slice(0, 8)}…/kyc/
                      </code>
                    </div>
                    <CardDescription>
                      Documents are strictly scoped to this business and customer path in Firebase Storage and verified in PostgreSQL.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <form
                      onSubmit={handleRegisterKycDocumentSubmit}
                      className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3"
                    >
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <SelectField
                          label="Document Type"
                          value={kycDocumentType}
                          onChange={(e) => setKycDocumentType(e.target.value)}
                        >
                          <option value="NATIONAL_ID">National ID Card</option>
                          <option value="PASSPORT">International Passport</option>
                          <option value="PROOF_OF_INCOME">Bank Statement / Payslip</option>
                          <option value="BUSINESS_REGISTRATION">CAC / Business Certificate</option>
                          <option value="UTILITY_BILL">Proof of Address / Utility Bill</option>
                          <option value="COLLATERAL_DEED">Collateral Valuation / Title</option>
                        </SelectField>
                        <InputField
                          label="Document File Name"
                          value={kycFileName}
                          onChange={(e) => setKycFileName(e.target.value)}
                          required
                        />
                        <div>
                          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600">
                            Attach File (Optional)
                          </label>
                          <input
                            type="file"
                            onChange={handleKycFileSelect}
                            className="block w-full text-xs text-slate-600 file:mr-2 file:rounded-md file:border-0 file:bg-slate-200 file:px-2.5 file:py-1.5 file:text-xs file:font-semibold file:text-flotech-navy"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <Button
                          type="submit"
                          size="sm"
                          variant="teal"
                          disabled={isSubmitting}
                        >
                          <Upload className="h-3.5 w-3.5" />
                          Register KYC Document
                        </Button>
                      </div>
                    </form>

                    <DataTableContainer>
                      <DataTableHead>
                        <tr>
                          <DataTableHeaderCell>Document Type</DataTableHeaderCell>
                          <DataTableHeaderCell>File &amp; Storage Path</DataTableHeaderCell>
                          <DataTableHeaderCell>Verification Status</DataTableHeaderCell>
                          <DataTableHeaderCell className="text-right">Action</DataTableHeaderCell>
                        </tr>
                      </DataTableHead>
                      <tbody className="divide-y divide-slate-200">
                        {selectedCustomerDocs.map((doc) => (
                          <DataTableRow key={doc.id}>
                            <DataTableCell>
                              <Badge variant="primary">{doc.documentType}</Badge>
                            </DataTableCell>
                            <DataTableCell>
                              <div className="text-xs font-semibold text-flotech-navy">
                                {doc.fileName}
                              </div>
                              <div className="font-mono text-[11px] text-slate-400">
                                {doc.firebaseStoragePath}
                              </div>
                            </DataTableCell>
                            <DataTableCell>
                              {doc.verifiedAt ? (
                                <Badge variant="success">
                                  VERIFIED ({new Date(doc.verifiedAt).toLocaleDateString()})
                                </Badge>
                              ) : (
                                <Badge variant="warning">PENDING REVIEW</Badge>
                              )}
                            </DataTableCell>
                            <DataTableCell className="text-right">
                              {!doc.verifiedAt ? (
                                <Button
                                  size="sm"
                                  variant="primary"
                                  onClick={() => void handleVerifyKycDocument(doc)}
                                >
                                  Verify KYC
                                </Button>
                              ) : (
                                <span className="text-xs font-medium text-emerald-700">
                                  Verified
                                </span>
                              )}
                            </DataTableCell>
                          </DataTableRow>
                        ))}
                        {selectedCustomerDocs.length === 0 && (
                          <DataTableRow>
                            <DataTableCell
                              className="py-6 text-center text-xs text-slate-500"
                              colSpan={4}
                            >
                              No KYC documents registered for this borrower yet.
                            </DataTableCell>
                          </DataTableRow>
                        )}
                      </tbody>
                    </DataTableContainer>
                  </CardContent>
                </Card>

                {/* Borrower Loan History Card */}
                <Card className="lg:col-span-12">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-flotech-primary" />
                      Borrower Loan History ({selectedCustomerLoans.length})
                    </CardTitle>
                    <CardDescription>
                      Complete ledger of loans originated for {selectedCustomer.firstName}{' '}
                      {selectedCustomer.lastName} ({selectedCustomer.customerNumber}).
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <DataTableContainer>
                      <DataTableHead>
                        <tr>
                          <DataTableHeaderCell>Loan #</DataTableHeaderCell>
                          <DataTableHeaderCell>Product</DataTableHeaderCell>
                          <DataTableHeaderCell>Status</DataTableHeaderCell>
                          <DataTableHeaderCell className="text-right">
                            Original Principal
                          </DataTableHeaderCell>
                          <DataTableHeaderCell className="text-right">
                            Total Paid
                          </DataTableHeaderCell>
                          <DataTableHeaderCell className="text-right">
                            Remaining Due
                          </DataTableHeaderCell>
                        </tr>
                      </DataTableHead>
                      <tbody className="divide-y divide-slate-200">
                        {selectedCustomerLoans.map((ln) => (
                          <DataTableRow key={ln.id}>
                            <DataTableCell className="font-mono text-xs font-semibold text-flotech-navy">
                              {ln.loanNumber}
                            </DataTableCell>
                            <DataTableCell className="text-xs text-slate-700">
                              {ln.loanProductName} ({ln.loanProductCode})
                            </DataTableCell>
                            <DataTableCell>
                              <Badge
                                variant={
                                  ln.status === 'ACTIVE' || ln.status === 'CLOSED_PAID'
                                    ? 'success'
                                    : ln.status === 'OVERDUE'
                                      ? 'danger'
                                      : 'neutral'
                                }
                              >
                                {ln.status}
                              </Badge>
                            </DataTableCell>
                            <DataTableCell className="text-right font-mono text-xs">
                              {formatDecimalMoneyDisplay(ln.principalAmount, ln.currencyCode)}
                            </DataTableCell>
                            <DataTableCell className="text-right font-mono text-xs text-emerald-700">
                              {formatDecimalMoneyDisplay(ln.totalAmountPaid, ln.currencyCode)}
                            </DataTableCell>
                            <DataTableCell className="text-right font-mono text-xs font-semibold text-slate-900">
                              {formatDecimalMoneyDisplay(ln.totalOutstanding, ln.currencyCode)}
                            </DataTableCell>
                          </DataTableRow>
                        ))}
                        {selectedCustomerLoans.length === 0 && (
                          <DataTableRow>
                            <DataTableCell
                              colSpan={6}
                              className="py-6 text-center text-xs text-slate-500"
                            >
                              No loans have been originated for this borrower yet.
                            </DataTableCell>
                          </DataTableRow>
                        )}
                      </tbody>
                    </DataTableContainer>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
