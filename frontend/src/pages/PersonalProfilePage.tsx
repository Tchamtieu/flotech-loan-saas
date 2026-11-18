import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  UserCircle,
  ShieldCheck,
  Mail,
  Phone,
  Camera,
  CheckCircle2,
  Building2,
  KeyRound,
  LogOut,
  RefreshCw,
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
import { InputField } from '@/components/ui/FormElements';
import {
  DataTableContainer,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
  DataTableCell,
} from '@/components/ui/DataTable';
import { useAuthSession } from '@/hooks/useAuthSession';

export function PersonalProfilePage() {
  const navigate = useNavigate();
  const {
    isFirebaseConfigured,
    isLoadingAuth,
    profile,
    memberships,
    savePersonalProfileUpdates,
    uploadPersonalAvatar,
    refreshProfileSession,
    signOutSession,
  } = useAuthSession();

  const [fullName, setFullName] = useState(profile?.fullName ?? '');
  const [phoneNumber, setPhoneNumber] = useState(profile?.phoneNumber ?? '');
  const [avatarStoragePath, setAvatarStoragePath] = useState(profile?.avatarStoragePath ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setFullName(profile.fullName);
      setPhoneNumber(profile.phoneNumber ?? '');
      setAvatarStoragePath(profile.avatarStoragePath ?? '');
    }
  }, [profile]);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setFeedbackMessage(null);
    setErrorMessage(null);
    setIsSaving(true);

    try {
      await savePersonalProfileUpdates({
        fullName: fullName.trim(),
        phoneNumber: phoneNumber.trim() ? phoneNumber.trim() : null,
        avatarStoragePath: avatarStoragePath.trim() ? avatarStoragePath.trim() : null,
      });
      setFeedbackMessage('Personal profile saved to PostgreSQL (`users` & `audit_logs` updated).');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to update profile.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAvatarFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }
    setFeedbackMessage(null);
    setErrorMessage(null);
    setIsUploading(true);
    try {
      const uploadedPath = await uploadPersonalAvatar(file);
      setAvatarStoragePath(uploadedPath);
      setFeedbackMessage(`Avatar uploaded to Firebase Storage (${uploadedPath}) & recorded in PostgreSQL.`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Avatar upload failed.');
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div className="flex items-center gap-3.5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-flotech-primary text-white shadow-xs">
            <UserCircle className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-flotech-navy">
                Personal Profile & Identity
              </h1>
              <Badge variant="success">Phase 2 Active</Badge>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Backed by Firebase Authentication + PostgreSQL <code className="font-mono">users</code>{' '}
              table and <code className="font-mono">audit_logs</code>.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {profile ? (
            <>
              <Button
                id="btn-refresh-profile"
                variant="outline"
                size="sm"
                onClick={() => void refreshProfileSession()}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh Session
              </Button>
              <Button
                id="btn-sign-out"
                variant="danger"
                size="sm"
                onClick={async () => {
                  await signOutSession();
                  navigate('/auth/login');
                }}
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign Out
              </Button>
            </>
          ) : (
            <Button
              id="btn-go-to-login"
              variant="primary"
              size="sm"
              onClick={() => navigate('/auth/login')}
            >
              <KeyRound className="h-3.5 w-3.5" />
              Open Authentication Portal
            </Button>
          )}
        </div>
      </div>

      {/* Identity Overview & Profile Update Form */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Identity & Security Summary Card */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>PostgreSQL Identity Record</CardTitle>
            <CardDescription>
              Canonical identity attributes resolved via{' '}
              <code className="font-mono">GET /api/v1/auth/me</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-flotech-navy text-white font-bold text-base">
                {profile?.fullName
                  ? profile.fullName
                      .split(' ')
                      .map((part) => part[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase()
                  : 'FT'}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-flotech-navy truncate">
                  {profile?.fullName ?? 'Unauthenticated Session'}
                </div>
                <div className="text-slate-500 truncate">
                  {profile?.email ?? 'Sign in via Firebase Auth to load profile'}
                </div>
              </div>
            </div>

            <div className="space-y-2.5 pt-2">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-500">PostgreSQL User UUID</span>
                <span className="font-mono text-[11px] text-flotech-navy">
                  {profile?.id ?? '—'}
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-500">Firebase UID</span>
                <span className="font-mono text-[11px] text-flotech-navy">
                  {profile?.firebaseUid ?? '—'}
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-500">Platform Role</span>
                <Badge variant={profile?.platformRole === 'SUPER_ADMIN' ? 'navy' : 'primary'}>
                  {profile?.platformRole ?? 'USER (Default)'}
                </Badge>
              </div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-500">Account Status</span>
                <Badge variant={profile?.isActive !== false ? 'success' : 'danger'}>
                  {profile ? (profile.isActive ? 'ACTIVE' : 'SUSPENDED') : 'AWAITING_AUTH'}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Last Login Recorded</span>
                <span className="font-mono text-[11px] text-slate-600">
                  {profile?.lastLoginAt
                    ? new Date(profile.lastLoginAt).toISOString().slice(0, 19).replace('T', ' ')
                    : '—'}
                </span>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-1.5">
              <div className="flex items-center gap-1.5 font-semibold text-flotech-navy">
                <ShieldCheck className="h-4 w-4 text-flotech-teal" />
                Super Admin Protection Trigger
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Ordinary business users cannot modify <code className="font-mono">platform_role</code>.
                Both Zod <code className="font-mono">.strict()</code> validation and PostgreSQL
                trigger <code className="font-mono">trg_enforce_super_admin_protection</code> block
                unauthorized role elevation.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Right Column: Edit Personal Profile Form */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Update Personal Profile Details</CardTitle>
            <CardDescription>
              Submits validated updates to <code className="font-mono">PATCH /api/v1/auth/me</code>.
              Every change is recorded in the PostgreSQL <code className="font-mono">audit_logs</code>{' '}
              table with before/after JSON snapshots.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
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

            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InputField
                  id="input-profile-fullname"
                  label="Full Name"
                  placeholder="Enter your full legal name"
                  required
                  minLength={2}
                  maxLength={180}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  helperText="Stored in PostgreSQL users.full_name"
                />

                <InputField
                  id="input-profile-email-readonly"
                  label="Verified Email Address (Firebase)"
                  value={profile?.email ?? 'Sign in to view verified email'}
                  disabled
                  helperText="Synchronized from verified Firebase ID Token"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InputField
                  id="input-profile-phone"
                  label="Phone Number"
                  type="tel"
                  placeholder="+1 (555) 234-5678"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  helperText="Stored in PostgreSQL users.phone_number"
                />

                <InputField
                  id="input-profile-avatar-path"
                  label="Firebase Storage Avatar Path"
                  placeholder="avatars/<firebase_uid>/profile.png"
                  value={avatarStoragePath}
                  onChange={(e) => setAvatarStoragePath(e.target.value)}
                  helperText="Validated prefix: avatars/<your_firebase_uid>/*"
                />
              </div>

              {/* Firebase Storage Avatar Upload Control */}
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/60 p-4 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3 text-xs">
                  <Camera className="h-5 w-5 text-flotech-primary shrink-0" />
                  <div>
                    <div className="font-semibold text-flotech-navy">
                      Upload Profile Avatar to Firebase Storage
                    </div>
                    <div className="text-slate-500">
                      Uploads binary image to <code className="font-mono">avatars/&lt;uid&gt;/</code>{' '}
                      and saves object path in PostgreSQL.
                    </div>
                  </div>
                </div>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-flotech-navy hover:bg-slate-50">
                  <span>{isUploading ? 'Uploading...' : 'Select Image'}</span>
                  <input
                    id="input-upload-avatar-file"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    disabled={!isFirebaseConfigured || !profile || isUploading}
                    onChange={handleAvatarFileChange}
                  />
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <Button
                  id="btn-save-personal-profile"
                  type="submit"
                  variant="primary"
                  disabled={isSaving || isLoadingAuth || !profile}
                >
                  {isSaving ? 'Saving to PostgreSQL...' : 'Save Personal Profile'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Associated Business Memberships Table (Preview for Phase 3 Transition) */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Associated Business Memberships</CardTitle>
              <CardDescription>
                Businesses linked to your PostgreSQL <code className="font-mono">user_id</code> via{' '}
                <code className="font-mono">business_memberships</code>. Full business creation and
                membership onboarding are implemented next in Phase 3.
              </CardDescription>
            </div>
            <Building2 className="h-5 w-5 text-flotech-primary" />
          </div>
        </CardHeader>
        <CardContent>
          {memberships.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center text-xs text-slate-600 space-y-1">
              <div className="font-semibold text-flotech-navy">
                No Active Business Memberships Found for Current Session
              </div>
              <p>
                {profile
                  ? 'Your personal profile is active. Business creation and membership assignment are scheduled for Phase 3.'
                  : 'Sign in through the Authentication Portal or run the Phase 2 integration test suite to inspect provisioned memberships.'}
              </p>
            </div>
          ) : (
            <DataTableContainer>
              <DataTableHead>
                <tr>
                  <DataTableHeaderCell>Business Code</DataTableHeaderCell>
                  <DataTableHeaderCell>Business Legal Name</DataTableHeaderCell>
                  <DataTableHeaderCell>Assigned Role</DataTableHeaderCell>
                  <DataTableHeaderCell>Currency</DataTableHeaderCell>
                  <DataTableHeaderCell>Membership Status</DataTableHeaderCell>
                </tr>
              </DataTableHead>
              <tbody>
                {memberships.map((m) => (
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
                  </DataTableRow>
                ))}
              </tbody>
            </DataTableContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
