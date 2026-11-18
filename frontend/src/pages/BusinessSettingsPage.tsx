import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Settings,
  CheckCircle2,
  ShieldCheck,
  Building2,
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
import { useAuthSession } from '@/hooks/useAuthSession';

export function BusinessSettingsPage() {
  const navigate = useNavigate();
  const {
    activeBusinessProfile,
    saveBusinessSettingsUpdates,
  } = useAuthSession();

  const [loanNumberPrefix, setLoanNumberPrefix] = useState('LN-');
  const [customerNumberPrefix, setCustomerNumberPrefix] = useState('CUST-');
  const [receiptNumberPrefix, setReceiptNumberPrefix] = useState('RCPT-');
  const [defaultGracePeriodDays, setDefaultGracePeriodDays] = useState('3');
  const [requireDualApprovalForLoans, setRequireDualApprovalForLoans] = useState(false);
  const [allowPartialInstallmentPayments, setAllowPartialInstallmentPayments] = useState(true);
  const [statementFooterNote, setStatementFooterNote] = useState(
    'Thank you for partnering with our lending institution.'
  );

  const [isSaving, setIsSaving] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (activeBusinessProfile?.settings) {
      const s = activeBusinessProfile.settings;
      setLoanNumberPrefix(s.loanNumberPrefix);
      setCustomerNumberPrefix(s.customerNumberPrefix);
      setReceiptNumberPrefix(s.receiptNumberPrefix);
      setDefaultGracePeriodDays(String(s.defaultGracePeriodDays));
      setRequireDualApprovalForLoans(s.requireDualApprovalForLoans);
      setAllowPartialInstallmentPayments(s.allowPartialInstallmentPayments);
      setStatementFooterNote(s.statementFooterNote);
    }
  }, [activeBusinessProfile]);

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setFeedbackMessage(null);
    setErrorMessage(null);
    setIsSaving(true);

    try {
      await saveBusinessSettingsUpdates({
        loanNumberPrefix: loanNumberPrefix.trim().toUpperCase(),
        customerNumberPrefix: customerNumberPrefix.trim().toUpperCase(),
        receiptNumberPrefix: receiptNumberPrefix.trim().toUpperCase(),
        defaultGracePeriodDays: parseInt(defaultGracePeriodDays, 10) || 0,
        requireDualApprovalForLoans,
        allowPartialInstallmentPayments,
        statementFooterNote: statementFooterNote.trim(),
      });
      setFeedbackMessage(
        'Operational settings saved to PostgreSQL (`businesses.settings_json` & `audit_logs` updated).'
      );
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to save operational settings.'
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div className="flex items-center gap-3.5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-flotech-primary text-white shadow-xs">
            <Settings className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-flotech-navy">
                Tenant Operational Settings
              </h1>
              <Badge variant="success">Phase 3 Active</Badge>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Configure numbering prefixes, grace periods, underwriting controls, and receipt
              policies per tenant in PostgreSQL <code className="font-mono">businesses.settings_json</code>.
            </p>
          </div>
        </div>

        <Button
          id="btn-back-to-business-profile"
          variant="outline"
          size="sm"
          onClick={() => navigate('/app/business-profile')}
        >
          <Building2 className="h-4 w-4" />
          Back to Business Profile
        </Button>
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

      <Card>
        <CardHeader>
          <CardTitle>
            Document Numbering, Delinquency & Underwriting Rules (
            <code className="font-mono text-xs">
              PATCH /api/v1/businesses/:businessId/settings
            </code>
            )
          </CardTitle>
          <CardDescription>
            Requires <code className="font-mono">business_settings:manage</code> permission in the
            active business tenant.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveSettings} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <InputField
                id="input-setting-loan-prefix"
                label="Loan Number Prefix"
                value={loanNumberPrefix}
                onChange={(e) => setLoanNumberPrefix(e.target.value.toUpperCase())}
                helperText="e.g. LN-00001"
                required
              />
              <InputField
                id="input-setting-customer-prefix"
                label="Customer Number Prefix"
                value={customerNumberPrefix}
                onChange={(e) => setCustomerNumberPrefix(e.target.value.toUpperCase())}
                helperText="e.g. CUST-00001"
                required
              />
              <InputField
                id="input-setting-receipt-prefix"
                label="Receipt Number Prefix"
                value={receiptNumberPrefix}
                onChange={(e) => setReceiptNumberPrefix(e.target.value.toUpperCase())}
                helperText="e.g. RCPT-00001"
                required
              />
              <InputField
                id="input-setting-grace-days"
                label="Default Grace Period (Days)"
                type="number"
                min={0}
                max={90}
                value={defaultGracePeriodDays}
                onChange={(e) => setDefaultGracePeriodDays(e.target.value)}
                helperText="0–90 days before late penalties"
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
              <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-4 cursor-pointer">
                <input
                  id="checkbox-setting-dual-approval"
                  type="checkbox"
                  checked={requireDualApprovalForLoans}
                  onChange={(e) => setRequireDualApprovalForLoans(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-flotech-primary focus:ring-flotech-primary"
                />
                <div className="text-xs">
                  <div className="font-semibold text-flotech-navy">
                    Require Dual Underwriting & Approval
                  </div>
                  <p className="text-slate-500 mt-0.5">
                    Enforces separation of duties so the Loan Officer who reviews an application
                    cannot also be the final approver.
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-4 cursor-pointer">
                <input
                  id="checkbox-setting-partial-payments"
                  type="checkbox"
                  checked={allowPartialInstallmentPayments}
                  onChange={(e) => setAllowPartialInstallmentPayments(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-flotech-primary focus:ring-flotech-primary"
                />
                <div className="text-xs">
                  <div className="font-semibold text-flotech-navy">
                    Allow Partial Installment Repayments
                  </div>
                  <p className="text-slate-500 mt-0.5">
                    Permits Cashiers to record partial installment payments allocated via the
                    Penalty &rarr; Fee &rarr; Interest &rarr; Principal waterfall.
                  </p>
                </div>
              </label>
            </div>

            <InputField
              id="input-setting-footer-note"
              label="Official Receipt & Statement Footer Note"
              value={statementFooterNote}
              onChange={(e) => setStatementFooterNote(e.target.value)}
              helperText="Printed on generated PDF repayment receipts and borrower statements"
            />

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <ShieldCheck className="h-4 w-4 text-flotech-teal" />
                <span>All changes are logged to PostgreSQL `audit_logs`</span>
              </div>
              <Button
                id="btn-save-business-settings"
                type="submit"
                variant="primary"
                disabled={isSaving || !activeBusinessProfile}
              >
                {isSaving ? 'Saving Settings...' : 'Save Operational Settings'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
