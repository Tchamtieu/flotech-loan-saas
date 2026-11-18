import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2,
  PlusCircle,
  ShieldCheck,
  CheckCircle2,
  Upload,
  KeyRound,
  Globe2,
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
import { useAuthSession } from '@/hooks/useAuthSession';

const BUSINESS_CATEGORIES = [
  'Microfinance & Lending Institution',
  'Small Business / Merchant Credit',
  'Cooperative / Credit Association',
  'Independent Entrepreneur Lender',
  'Medium-Sized Commercial Enterprise',
];

const SUPPORTED_CURRENCIES = [
  { code: 'USD', label: 'USD — US Dollar' },
  { code: 'EUR', label: 'EUR — Euro' },
  { code: 'GBP', label: 'GBP — British Pound' },
  { code: 'NGN', label: 'NGN — Nigerian Naira' },
  { code: 'KES', label: 'KES — Kenyan Shilling' },
  { code: 'ZAR', label: 'ZAR — South African Rand' },
  { code: 'GHS', label: 'GHS — Ghanaian Cedi' },
  { code: 'XOF', label: 'XOF — West African CFA Franc' },
];

export function BusinessProfilePage() {
  const navigate = useNavigate();
  const {
    isFirebaseConfigured,
    profile,
    memberships,
    activeBusinessProfile,
    activeTenantMembership,
    selectActiveBusiness,
    createBusiness,
    saveBusinessProfileUpdates,
    uploadBusinessLogo,
  } = useAuthSession();

  const [isCreatingNew, setIsCreatingNew] = useState<boolean>(false);

  // Edit Existing Business State
  const [legalName, setLegalName] = useState('');
  const [tradingName, setTradingName] = useState('');
  const [businessCategory, setBusinessCategory] = useState(BUSINESS_CATEGORIES[0] ?? '');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [taxId, setTaxId] = useState('');
  const [primaryEmail, setPrimaryEmail] = useState('');
  const [primaryPhone, setPrimaryPhone] = useState('');
  const [countryCode, setCountryCode] = useState('US');
  const [timezone, setTimezone] = useState('UTC');
  const [addressLine1, setAddressLine1] = useState('');
  const [city, setCity] = useState('');
  const [logoStoragePath, setLogoStoragePath] = useState('');

  // Create New Business State
  const [newLegalName, setNewLegalName] = useState('');
  const [newTradingName, setNewTradingName] = useState('');
  const [newCategory, setNewCategory] = useState(BUSINESS_CATEGORIES[0] ?? '');
  const [newRegNumber, setNewRegNumber] = useState('');
  const [newTaxId, setNewTaxId] = useState('');
  const [newEmail, setNewEmail] = useState(profile?.email ?? '');
  const [newPhone, setNewPhone] = useState(profile?.phoneNumber ?? '');
  const [newCountryCode, setNewCountryCode] = useState('US');
  const [newCurrencyCode, setNewCurrencyCode] = useState('USD');
  const [newTimezone, setNewTimezone] = useState('UTC');
  const [newAddress, setNewAddress] = useState('');
  const [newCity, setNewCity] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (activeBusinessProfile) {
      setLegalName(activeBusinessProfile.legalName);
      setTradingName(activeBusinessProfile.tradingName ?? '');
      setBusinessCategory(activeBusinessProfile.businessCategory);
      setRegistrationNumber(activeBusinessProfile.registrationNumber ?? '');
      setTaxId(activeBusinessProfile.taxId ?? '');
      setPrimaryEmail(activeBusinessProfile.primaryEmail);
      setPrimaryPhone(activeBusinessProfile.primaryPhone);
      setCountryCode(activeBusinessProfile.countryCode);
      setTimezone(activeBusinessProfile.timezone);
      setAddressLine1(activeBusinessProfile.addressLine1 ?? '');
      setCity(activeBusinessProfile.city ?? '');
      setLogoStoragePath(activeBusinessProfile.logoStoragePath ?? '');
    }
  }, [activeBusinessProfile]);

  async function handleCreateBusinessSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFeedbackMessage(null);
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const created = await createBusiness({
        legalName: newLegalName,
        tradingName: newTradingName || null,
        businessCategory: newCategory,
        registrationNumber: newRegNumber || null,
        taxId: newTaxId || null,
        primaryEmail: newEmail,
        primaryPhone: newPhone,
        countryCode: newCountryCode,
        currencyCode: newCurrencyCode,
        timezone: newTimezone,
        addressLine1: newAddress || null,
        city: newCity || null,
      });
      setIsCreatingNew(false);
      setFeedbackMessage(
        `Business "${created.legalName}" (${created.businessCode}) provisioned in PostgreSQL with 5 system RBAC roles and Business Owner membership.`
      );
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to create business.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleUpdateBusinessSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFeedbackMessage(null);
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await saveBusinessProfileUpdates({
        legalName,
        tradingName: tradingName.trim() ? tradingName.trim() : null,
        businessCategory,
        registrationNumber: registrationNumber.trim() ? registrationNumber.trim() : null,
        taxId: taxId.trim() ? taxId.trim() : null,
        primaryEmail,
        primaryPhone,
        countryCode,
        timezone,
        addressLine1: addressLine1.trim() ? addressLine1.trim() : null,
        city: city.trim() ? city.trim() : null,
        logoStoragePath: logoStoragePath.trim() ? logoStoragePath.trim() : null,
      });
      setFeedbackMessage(
        'Business profile updated in PostgreSQL (`businesses` & `audit_logs` recorded).'
      );
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to update business profile.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleLogoFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }
    setFeedbackMessage(null);
    setErrorMessage(null);
    setIsUploadingLogo(true);
    try {
      const path = await uploadBusinessLogo(file);
      setLogoStoragePath(path);
      setFeedbackMessage(`Business logo uploaded to Firebase Storage (${path}).`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Logo upload failed.');
    } finally {
      setIsUploadingLogo(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div className="flex items-center gap-3.5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-flotech-primary text-white shadow-xs">
            <Building2 className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-flotech-navy">
                Business Profile & Multi-Tenant Memberships
              </h1>
              <Badge variant="success">Phase 3 Active</Badge>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Backed by PostgreSQL <code className="font-mono">businesses</code>,{' '}
              <code className="font-mono">roles</code>,{' '}
              <code className="font-mono">business_memberships</code>, and Row-Level Security (RLS).
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            id="btn-toggle-create-business"
            variant={isCreatingNew ? 'outline' : 'primary'}
            size="sm"
            onClick={() => {
              setIsCreatingNew((prev) => !prev);
              setFeedbackMessage(null);
              setErrorMessage(null);
            }}
          >
            <PlusCircle className="h-4 w-4" />
            {isCreatingNew ? 'View Active Business Profile' : 'Create New Business Tenant'}
          </Button>
          <Button
            id="btn-go-to-business-settings"
            variant="navy"
            size="sm"
            onClick={() => navigate('/app/settings')}
          >
            Operational Settings
          </Button>
        </div>
      </div>

      {feedbackMessage && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-flotech-success">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{feedbackMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-medium text-flotech-danger">
          {errorMessage}
        </div>
      )}

      {/* Create New Business Tenant Form */}
      {isCreatingNew && (
        <Card className="border-blue-200">
          <CardHeader>
            <CardTitle>Onboard New Business Tenant (`POST /api/v1/businesses`)</CardTitle>
            <CardDescription>
              Atomically creates the <code className="font-mono">businesses</code> record, seeds all
              5 system RBAC roles (<code className="font-mono">business_owner</code>,{' '}
              <code className="font-mono">branch_manager</code>,{' '}
              <code className="font-mono">loan_officer</code>,{' '}
              <code className="font-mono">cashier</code>, <code className="font-mono">auditor</code>
              ), assigns you as <code className="font-mono">Business Owner</code>, and initializes a
              14-day trial subscription.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateBusinessSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <InputField
                  id="input-new-biz-legal-name"
                  label="Legal Business Name"
                  placeholder="e.g. Horizon Microfinance Ltd"
                  required
                  value={newLegalName}
                  onChange={(e) => setNewLegalName(e.target.value)}
                />
                <InputField
                  id="input-new-biz-trading-name"
                  label="Trading / Brand Name (Optional)"
                  placeholder="e.g. Horizon Credit"
                  value={newTradingName}
                  onChange={(e) => setNewTradingName(e.target.value)}
                />
                <SelectField
                  id="select-new-biz-category"
                  label="Business Category"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                >
                  {BUSINESS_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </SelectField>

                <InputField
                  id="input-new-biz-reg-number"
                  label="Registration Number"
                  placeholder="RC-8849201"
                  value={newRegNumber}
                  onChange={(e) => setNewRegNumber(e.target.value)}
                />
                <InputField
                  id="input-new-biz-tax-id"
                  label="Tax Identification Number (TIN)"
                  placeholder="TIN-4491029"
                  value={newTaxId}
                  onChange={(e) => setNewTaxId(e.target.value)}
                />
                <SelectField
                  id="select-new-biz-currency"
                  label="Primary Ledger Currency (Immutable)"
                  value={newCurrencyCode}
                  onChange={(e) => setNewCurrencyCode(e.target.value)}
                >
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                </SelectField>

                <InputField
                  id="input-new-biz-email"
                  label="Primary Business Email"
                  type="email"
                  placeholder="operations@horizoncredit.com"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                />
                <InputField
                  id="input-new-biz-phone"
                  label="Primary Business Phone"
                  type="tel"
                  placeholder="+1 (555) 890-1234"
                  required
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                />
                <InputField
                  id="input-new-biz-country"
                  label="ISO Country Code (2-Letter)"
                  placeholder="US"
                  maxLength={2}
                  required
                  value={newCountryCode}
                  onChange={(e) => setNewCountryCode(e.target.value.toUpperCase())}
                />

                <InputField
                  id="input-new-biz-timezone"
                  label="Operational Timezone"
                  placeholder="UTC"
                  required
                  value={newTimezone}
                  onChange={(e) => setNewTimezone(e.target.value)}
                />
                <InputField
                  id="input-new-biz-address"
                  label="Street Address"
                  placeholder="100 Financial District Blvd"
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                />
                <InputField
                  id="input-new-biz-city"
                  label="City"
                  placeholder="New York"
                  value={newCity}
                  onChange={(e) => setNewCity(e.target.value)}
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreatingNew(false)}
                >
                  Cancel
                </Button>
                <Button
                  id="btn-submit-create-business"
                  type="submit"
                  variant="primary"
                  disabled={isSubmitting || !profile}
                >
                  {isSubmitting
                    ? 'Provisioning Tenant in PostgreSQL...'
                    : 'Provision Business Tenant'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Active Business Profile & Edit Form */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Active Tenant Metadata & RBAC Summary */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Active Tenant Context</CardTitle>
            <CardDescription>
              Resolved from PostgreSQL via{' '}
              <code className="font-mono">GET /api/v1/businesses/:businessId/context</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-flotech-primary text-white font-bold">
                <Globe2 className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-flotech-navy truncate">
                  {activeBusinessProfile?.legalName ?? 'No Active Business Selected'}
                </div>
                <div className="text-slate-500 font-mono text-[11px]">
                  {activeBusinessProfile?.businessCode ?? 'Create or select a business tenant'}
                </div>
              </div>
            </div>

            <div className="space-y-2.5 pt-1">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-500">Tenant Business UUID</span>
                <span className="font-mono text-[11px] text-flotech-navy">
                  {activeBusinessProfile?.id ?? '—'}
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-500">Tenant Status</span>
                <Badge variant={activeBusinessProfile?.status === 'ACTIVE' ? 'success' : 'neutral'}>
                  {activeBusinessProfile?.status ?? 'AWAITING_TENANT'}
                </Badge>
              </div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-500">Ledger Currency</span>
                <Badge variant="navy">{activeBusinessProfile?.currencyCode ?? 'USD'}</Badge>
              </div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-500">Your Resolved Role</span>
                <Badge variant="primary">
                  {activeTenantMembership?.roleName ?? '—'}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Granted Permissions</span>
                <span className="font-mono font-semibold text-flotech-teal">
                  {activeTenantMembership ? `${activeTenantMembership.permissions.length} codes` : '0'}
                </span>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-1.5">
              <div className="flex items-center gap-1.5 font-semibold text-flotech-navy">
                <ShieldCheck className="h-4 w-4 text-flotech-teal" />
                Tenant Isolation Guarantee
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Every request to <code className="font-mono">/api/v1/businesses/:businessId/*</code>{' '}
                validates your active membership in PostgreSQL and binds{' '}
                <code className="font-mono">app.current_business_id</code> via Row-Level Security.
              </p>
            </div>

            {!profile && (
              <Button
                variant="primary"
                size="sm"
                className="w-full"
                onClick={() => navigate('/auth/login')}
              >
                <KeyRound className="h-3.5 w-3.5" />
                Sign In to Manage Business Tenants
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Right Column: Update Business Profile Form */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Business Legal & Branding Profile</CardTitle>
            <CardDescription>
              Protected by <code className="font-mono">business_settings:manage</code> permission on{' '}
              <code className="font-mono">PATCH /api/v1/businesses/:businessId/profile</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleUpdateBusinessSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InputField
                  id="input-biz-legal-name"
                  label="Legal Business Name"
                  required
                  value={legalName}
                  onChange={(e) => setLegalName(e.target.value)}
                />
                <InputField
                  id="input-biz-trading-name"
                  label="Trading / Brand Name"
                  value={tradingName}
                  onChange={(e) => setTradingName(e.target.value)}
                />
                <SelectField
                  id="select-biz-category"
                  label="Business Category"
                  value={businessCategory}
                  onChange={(e) => setBusinessCategory(e.target.value)}
                >
                  {BUSINESS_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </SelectField>
                <InputField
                  id="input-biz-currency-readonly"
                  label="Primary Ledger Currency (Locked)"
                  value={activeBusinessProfile?.currencyCode ?? 'USD'}
                  disabled
                  helperText="Locked after onboarding to preserve NUMERIC(19,4) ledger consistency"
                />
                <InputField
                  id="input-biz-reg-number"
                  label="Company Registration Number"
                  value={registrationNumber}
                  onChange={(e) => setRegistrationNumber(e.target.value)}
                />
                <InputField
                  id="input-biz-tax-id"
                  label="Tax ID / VAT Number"
                  value={taxId}
                  onChange={(e) => setTaxId(e.target.value)}
                />
                <InputField
                  id="input-biz-email"
                  label="Primary Operations Email"
                  type="email"
                  required
                  value={primaryEmail}
                  onChange={(e) => setPrimaryEmail(e.target.value)}
                />
                <InputField
                  id="input-biz-phone"
                  label="Primary Operations Phone"
                  type="tel"
                  required
                  value={primaryPhone}
                  onChange={(e) => setPrimaryPhone(e.target.value)}
                />
                <InputField
                  id="input-biz-country"
                  label="Country Code (ISO 2-Letter)"
                  maxLength={2}
                  required
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
                />
                <InputField
                  id="input-biz-timezone"
                  label="Operational Timezone"
                  required
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                />
                <InputField
                  id="input-biz-address"
                  label="Headquarters Street Address"
                  value={addressLine1}
                  onChange={(e) => setAddressLine1(e.target.value)}
                />
                <InputField
                  id="input-biz-city"
                  label="City"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
              </div>

              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/60 p-4 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3 text-xs">
                  <Upload className="h-5 w-5 text-flotech-primary shrink-0" />
                  <div>
                    <div className="font-semibold text-flotech-navy">
                      Business Brand Logo (Firebase Storage)
                    </div>
                    <div className="text-slate-500">
                      Scoped path:{' '}
                      <code className="font-mono">
                        businesses/&lt;business_id&gt;/branding/&lt;filename&gt;
                      </code>
                    </div>
                  </div>
                </div>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-flotech-navy hover:bg-slate-50">
                  <span>{isUploadingLogo ? 'Uploading...' : 'Upload Logo'}</span>
                  <input
                    id="input-upload-biz-logo"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    disabled={!isFirebaseConfigured || !activeBusinessProfile || isUploadingLogo}
                    onChange={handleLogoFileChange}
                  />
                </label>
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  id="btn-save-business-profile"
                  type="submit"
                  variant="primary"
                  disabled={isSubmitting || !activeBusinessProfile}
                >
                  {isSubmitting ? 'Saving Changes...' : 'Save Business Profile'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Multi-Tenant Memberships Directory */}
      <Card>
        <CardHeader>
          <CardTitle>Your Multi-Tenant Business Memberships</CardTitle>
          <CardDescription>
            Switch between businesses where you hold an active PostgreSQL{' '}
            <code className="font-mono">business_memberships</code> record.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {memberships.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center text-xs text-slate-600">
              No business memberships found for the current session. Click{' '}
              <strong>Create New Business Tenant</strong> above to onboard your first business.
            </div>
          ) : (
            <DataTableContainer>
              <DataTableHead>
                <tr>
                  <DataTableHeaderCell>Business Code</DataTableHeaderCell>
                  <DataTableHeaderCell>Legal Name</DataTableHeaderCell>
                  <DataTableHeaderCell>Assigned Role</DataTableHeaderCell>
                  <DataTableHeaderCell>Currency</DataTableHeaderCell>
                  <DataTableHeaderCell>Status</DataTableHeaderCell>
                  <DataTableHeaderCell className="text-right">Action</DataTableHeaderCell>
                </tr>
              </DataTableHead>
              <tbody>
                {memberships.map((m) => {
                  const isCurrent = activeBusinessProfile?.id === m.businessId;
                  return (
                    <DataTableRow key={m.membershipId}>
                      <DataTableCell className="font-mono font-semibold">
                        {m.businessCode}
                      </DataTableCell>
                      <DataTableCell className="font-medium text-flotech-navy">
                        {m.businessName}
                      </DataTableCell>
                      <DataTableCell>{m.roleName}</DataTableCell>
                      <DataTableCell className="font-mono">{m.currencyCode}</DataTableCell>
                      <DataTableCell>
                        <Badge variant={m.status === 'ACTIVE' ? 'success' : 'warning'}>
                          {m.status}
                        </Badge>
                      </DataTableCell>
                      <DataTableCell className="text-right">
                        {isCurrent ? (
                          <Badge variant="primary">Active Workspace</Badge>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void selectActiveBusiness(m.businessId)}
                          >
                            Switch to Tenant
                          </Button>
                        )}
                      </DataTableCell>
                    </DataTableRow>
                  );
                })}
              </tbody>
            </DataTableContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
