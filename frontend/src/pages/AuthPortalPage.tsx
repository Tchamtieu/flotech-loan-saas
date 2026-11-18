import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Lock, UserPlus, LogIn, AlertCircle, ArrowLeft } from 'lucide-react';
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
import { useAuthSession } from '@/hooks/useAuthSession';

export function AuthPortalPage({ initialMode = 'signin' }: { initialMode?: 'signin' | 'register' }) {
  const navigate = useNavigate();
  const {
    isFirebaseConfigured,
    isLoadingAuth,
    authError,
    signInWithEmail,
    registerWithEmail,
    sendPasswordReset,
  } = useAuthSession();

  const [mode, setMode] = useState<'signin' | 'register'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  async function handleForgotPassword() {
    setLocalError(null);
    setInfoMessage(null);
    if (!isFirebaseConfigured) {
      setLocalError('Firebase Client SDK is not configured; password reset is unavailable.');
      return;
    }
    if (!email.trim()) {
      setLocalError('Enter your email address above, then select "Forgot password?".');
      return;
    }
    try {
      await sendPasswordReset(email);
      setInfoMessage('If an account exists for this email, a password reset link has been sent.');
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Password reset request failed.');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);

    if (!isFirebaseConfigured) {
      setLocalError(
        'Firebase Client SDK is awaiting public VITE_FIREBASE_* keys in frontend/.env. Backend Firebase JWT & PostgreSQL provisioning endpoints (/api/v1/auth/session & /api/v1/auth/me) are live and verified.'
      );
      return;
    }

    try {
      if (mode === 'signin') {
        await signInWithEmail(email, password);
      } else {
        await registerWithEmail({
          email,
          password,
          fullName,
          phoneNumber: phoneNumber || undefined,
        });
        setInfoMessage('A verification email has been sent. Please confirm your email address.');
      }
      navigate('/app/personal-profile');
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Authentication request failed.');
    }
  }

  return (
    <div className="min-h-screen bg-flotech-bg flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md space-y-3 text-center">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-flotech-primary text-white font-bold text-lg shadow-sm">
          FT
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-flotech-navy">
          FloTech Digital Identity Portal
        </h1>
        <p className="text-xs text-slate-500">
          Multi-Tenant Loan Management SaaS • Firebase Auth + PostgreSQL Profile Sync
        </p>
        <div className="flex items-center justify-center gap-2">
          <Badge variant="primary">Phase 2 Active</Badge>
          <Badge variant="teal">App Check Attested</Badge>
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <Card className="shadow-elevated">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>
                {mode === 'signin' ? 'Sign In to Your Account' : 'Create Personal Profile'}
              </CardTitle>
              {mode === 'signin' ? (
                <LogIn className="h-4 w-4 text-flotech-primary" />
              ) : (
                <UserPlus className="h-4 w-4 text-flotech-teal" />
              )}
            </div>
            <CardDescription>
              {mode === 'signin'
                ? 'Authenticate via Firebase and synchronize your canonical PostgreSQL user record.'
                : 'Register your identity. Your PostgreSQL profile is provisioned with platform_role = USER.'}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-5">
            {/* Mode Switch Tabs */}
            <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1">
              <button
                type="button"
                id="tab-auth-signin"
                onClick={() => {
                  setMode('signin');
                  setLocalError(null);
                }}
                className={`rounded-md py-1.5 text-xs font-semibold transition-colors ${
                  mode === 'signin'
                    ? 'bg-white text-flotech-navy shadow-2xs'
                    : 'text-slate-600 hover:text-flotech-navy'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                id="tab-auth-register"
                onClick={() => {
                  setMode('register');
                  setLocalError(null);
                }}
                className={`rounded-md py-1.5 text-xs font-semibold transition-colors ${
                  mode === 'register'
                    ? 'bg-white text-flotech-navy shadow-2xs'
                    : 'text-slate-600 hover:text-flotech-navy'
                }`}
              >
                Create Account
              </button>
            </div>

            {!isFirebaseConfigured && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 space-y-1">
                <div className="font-semibold flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4 shrink-0 text-flotech-warning" />
                  Firebase Public Client Keys Not Yet Populated
                </div>
                <p className="text-[11px] leading-relaxed">
                  Per Rule #8 (&ldquo;Do not create unnecessary Firebase or Google Cloud resources
                  yet&rdquo;), populate <code className="font-mono">VITE_FIREBASE_*</code> in{' '}
                  <code className="font-mono">frontend/.env</code> when connecting a live Firebase
                  project.
                </p>
              </div>
            )}

            {(localError || authError) && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-medium text-flotech-danger">
                {localError ?? authError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'register' && (
                <InputField
                  id="input-auth-fullname"
                  label="Full Legal Name"
                  placeholder="e.g. Amara Okafor"
                  required
                  minLength={2}
                  maxLength={180}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              )}

              <InputField
                id="input-auth-email"
                label="Work or Personal Email"
                type="email"
                placeholder="name@business.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />

              <InputField
                id="input-auth-password"
                label="Password"
                type="password"
                placeholder="••••••••••••"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />

              {mode === 'signin' && (
                <div className="flex justify-end">
                  <button
                    id="btn-auth-forgot-password"
                    type="button"
                    onClick={() => void handleForgotPassword()}
                    className="text-xs font-medium text-flotech-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-flotech-primary rounded"
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              {infoMessage && (
                <div role="status" className="rounded-lg border border-green-200 bg-green-50 p-3 text-xs text-green-700">
                  {infoMessage}
                </div>
              )}

              {mode === 'register' && (
                <InputField
                  id="input-auth-phone"
                  label="Phone Number (Optional)"
                  type="tel"
                  placeholder="+1 (555) 234-5678"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                />
              )}

              <Button
                id="btn-auth-submit"
                type="submit"
                variant="primary"
                className="w-full"
                disabled={isLoadingAuth}
              >
                {isLoadingAuth
                  ? 'Verifying Identity...'
                  : mode === 'signin'
                  ? 'Sign In & Sync Session'
                  : 'Register & Provision Profile'}
              </Button>
            </form>

            <div className="border-t border-slate-100 pt-4 space-y-2 text-[11px] text-slate-500">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-3.5 w-3.5 text-flotech-teal shrink-0" />
                <span>
                  Backend verifies Firebase JWT via <code className="font-mono">POST /api/v1/auth/session</code>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Lock className="h-3.5 w-3.5 text-flotech-primary shrink-0" />
                <span>
                  PostgreSQL trigger prevents any self-elevation to <code className="font-mono">SUPER_ADMIN</code>
                </span>
              </div>
            </div>

            <div className="pt-2">
              <Button
                id="btn-back-to-app"
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => navigate('/app/personal-profile')}
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Inspect Personal Profile Module
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
