import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PermissionCode,
  type BusinessRoleDTO,
  type PermissionCatalogItemDTO,
} from '@flotech/shared';
import {
  ShieldCheck,
  PlusCircle,
  Lock,
  CheckCircle2,
  Users,
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
import { getActiveAppCheckToken } from '@/config/firebaseClient';
import { useAuthSession } from '@/hooks/useAuthSession';
import {
  createBusinessRoleApi,
  fetchBusinessRolesApi,
  fetchPermissionsCatalogApi,
  updateBusinessRoleApi,
} from '@/services/apiClient';

const ARCHITECTURAL_PERMISSION_GROUPS: Array<{
  module: string;
  permissions: Array<{ code: PermissionCode; description: string }>;
}> = [
  {
    module: 'DASHBOARD & REPORTS',
    permissions: [
      { code: PermissionCode.DASHBOARD_VIEW, description: 'View business dashboard & KPIs' },
      { code: PermissionCode.REPORTS_VIEW, description: 'View financial & PAR reports' },
      { code: PermissionCode.REPORTS_EXPORT, description: 'Export financial statements' },
    ],
  },
  {
    module: 'CUSTOMER MANAGEMENT',
    permissions: [
      { code: PermissionCode.CUSTOMERS_VIEW, description: 'View borrower profiles & KYC' },
      { code: PermissionCode.CUSTOMERS_CREATE, description: 'Create borrowers & upload KYC' },
      { code: PermissionCode.CUSTOMERS_UPDATE, description: 'Update borrower details & verify KYC' },
      { code: PermissionCode.CUSTOMERS_ARCHIVE, description: 'Archive borrower records' },
    ],
  },
  {
    module: 'LOAN PRODUCTS & LOANS',
    permissions: [
      { code: PermissionCode.LOAN_PRODUCTS_VIEW, description: 'View loan product catalog' },
      { code: PermissionCode.LOAN_PRODUCTS_MANAGE, description: 'Create & edit loan products' },
      { code: PermissionCode.LOANS_VIEW, description: 'View loan contracts & schedules' },
      { code: PermissionCode.LOANS_CREATE, description: 'Originate loan applications' },
      { code: PermissionCode.LOANS_REVIEW, description: 'Perform underwriting review' },
      { code: PermissionCode.LOANS_APPROVE, description: 'Approve or reject loans' },
      { code: PermissionCode.LOANS_DISBURSE, description: 'Record loan disbursement' },
      { code: PermissionCode.LOANS_RESTRUCTURE, description: 'Restructure loan schedules' },
      { code: PermissionCode.LOANS_WRITE_OFF, description: 'Write off defaulted loans' },
    ],
  },
  {
    module: 'REPAYMENTS & RECEIPTS',
    permissions: [
      { code: PermissionCode.REPAYMENTS_VIEW, description: 'View repayments & receipts' },
      { code: PermissionCode.REPAYMENTS_RECORD, description: 'Record customer repayments' },
      { code: PermissionCode.REPAYMENTS_REVERSE, description: 'Reverse erroneous repayments' },
    ],
  },
  {
    module: 'GOVERNANCE, STAFF & SETTINGS',
    permissions: [
      { code: PermissionCode.EMPLOYEES_VIEW, description: 'View business employees' },
      { code: PermissionCode.EMPLOYEES_MANAGE, description: 'Invite & manage employees' },
      { code: PermissionCode.ROLES_VIEW, description: 'View roles & permissions' },
      { code: PermissionCode.ROLES_MANAGE, description: 'Create & edit custom roles' },
      { code: PermissionCode.BUSINESS_SETTINGS_VIEW, description: 'View business settings' },
      { code: PermissionCode.BUSINESS_SETTINGS_MANAGE, description: 'Update business settings' },
      { code: PermissionCode.SUBSCRIPTION_VIEW, description: 'View subscription & quotas' },
      { code: PermissionCode.SUBSCRIPTION_MANAGE, description: 'Manage subscription billing' },
    ],
  },
];

export function RolesPermissionsPage() {
  const navigate = useNavigate();
  const { firebaseUser, activeBusinessId, activeBusinessProfile } = useAuthSession();

  const [roles, setRoles] = useState<BusinessRoleDTO[]>([]);
  const [catalog, setCatalog] = useState<PermissionCatalogItemDTO[]>([]);
  const [selectedRole, setSelectedRole] = useState<BusinessRoleDTO | null>(null);
  const [isCreatingRole, setIsCreatingRole] = useState(false);

  // Create / Edit Role Form State
  const [roleName, setRoleName] = useState('');
  const [roleDescription, setRoleDescription] = useState('');
  const [selectedPerms, setSelectedPerms] = useState<Set<PermissionCode>>(
    new Set([PermissionCode.DASHBOARD_VIEW, PermissionCode.LOANS_VIEW])
  );

  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadRolesAndPermissions = useCallback(async () => {
    if (!firebaseUser || !activeBusinessId) {
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const idToken = await firebaseUser.getIdToken();
      const appCheckToken = await getActiveAppCheckToken();

      const [rolesRes, permsRes] = await Promise.all([
        fetchBusinessRolesApi(idToken, appCheckToken, activeBusinessId),
        fetchPermissionsCatalogApi(idToken, appCheckToken, activeBusinessId),
      ]);

      if (rolesRes.success) {
        setRoles(rolesRes.data);
        if (rolesRes.data[0] && !selectedRole) {
          setSelectedRole(rolesRes.data[0]);
        }
      } else {
        setErrorMessage(`${rolesRes.error.code}: ${rolesRes.error.message}`);
      }

      if (permsRes.success) {
        setCatalog(permsRes.data);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load roles.');
    } finally {
      setIsLoading(false);
    }
  }, [firebaseUser, activeBusinessId, selectedRole]);

  useEffect(() => {
    void loadRolesAndPermissions();
  }, [loadRolesAndPermissions]);

  function handleTogglePerm(code: PermissionCode) {
    setSelectedPerms((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  }

  function handleSelectRoleForInspection(role: BusinessRoleDTO) {
    setIsCreatingRole(false);
    setSelectedRole(role);
    setRoleName(role.name);
    setRoleDescription(role.description ?? '');
    setSelectedPerms(new Set(role.permissions));
    setFeedbackMessage(null);
    setErrorMessage(null);
  }

  function handleStartCreateCustomRole() {
    setIsCreatingRole(true);
    setSelectedRole(null);
    setRoleName('');
    setRoleDescription('');
    setSelectedPerms(new Set([PermissionCode.DASHBOARD_VIEW, PermissionCode.CUSTOMERS_VIEW]));
    setFeedbackMessage(null);
    setErrorMessage(null);
  }

  async function handleSaveRoleSubmit(e: React.FormEvent) {
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
      const permissionsArray = Array.from(selectedPerms);

      if (isCreatingRole) {
        const res = await createBusinessRoleApi(idToken, appCheckToken, activeBusinessId, {
          name: roleName.trim(),
          description: roleDescription.trim() || null,
          permissions: permissionsArray,
        });

        if (!res.success) {
          throw new Error(`${res.error.code}: ${res.error.message}`);
        }

        setFeedbackMessage(
          `Custom role "${res.data.name}" (${res.data.slug}) created in PostgreSQL with ${res.data.permissions.length} permissions.`
        );
        setIsCreatingRole(false);
        await loadRolesAndPermissions();
        setSelectedRole(res.data);
      } else if (selectedRole) {
        const res = await updateBusinessRoleApi(
          idToken,
          appCheckToken,
          activeBusinessId,
          selectedRole.id,
          {
            name: roleName.trim(),
            description: roleDescription.trim() || null,
            permissions: permissionsArray,
          }
        );

        if (!res.success) {
          throw new Error(`${res.error.code}: ${res.error.message}`);
        }

        setFeedbackMessage(
          `Role "${res.data.name}" updated in PostgreSQL and recorded in audit_logs.`
        );
        await loadRolesAndPermissions();
        setSelectedRole(res.data);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Role operation failed.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div className="flex items-center gap-3.5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-flotech-primary text-white shadow-xs">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-flotech-navy">
                Roles & Permissions Matrix (RBAC)
              </h1>
              <Badge variant="success">Phase 4 Active</Badge>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Tenant-isolated role definitions and 27 atomic permission codes stored in PostgreSQL{' '}
              <code className="font-mono">roles</code> and{' '}
              <code className="font-mono">role_permissions</code>.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            id="btn-refresh-roles"
            variant="outline"
            size="sm"
            onClick={() => void loadRolesAndPermissions()}
            disabled={isLoading || !activeBusinessId}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
          <Button
            id="btn-create-custom-role"
            variant="primary"
            size="sm"
            onClick={handleStartCreateCustomRole}
          >
            <PlusCircle className="h-4 w-4" />
            Create Custom Role
          </Button>
          <Button
            id="btn-go-to-employees"
            variant="navy"
            size="sm"
            onClick={() => navigate('/app/employees')}
          >
            <Users className="h-4 w-4" />
            Manage Employees
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

      {/* Main Grid: Left Role List, Right Permission Matrix Builder */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Business Roles Table */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>
              Tenant Roles ({activeBusinessProfile?.businessCode ?? 'Select Business'})
            </CardTitle>
            <CardDescription>
              5 seeded system roles plus custom roles created for this business.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {roles.length === 0 ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 space-y-2">
                <div className="font-semibold text-flotech-navy">
                  5 Default System Roles Seeded on Business Onboarding:
                </div>
                <ul className="space-y-1 font-mono text-[11px] text-slate-700">
                  <li>• business_owner (27 permissions)</li>
                  <li>• branch_manager (25 permissions)</li>
                  <li>• loan_officer (9 permissions)</li>
                  <li>• cashier (5 permissions)</li>
                  <li>• auditor (12 permissions)</li>
                </ul>
              </div>
            ) : (
              <DataTableContainer>
                <DataTableHead>
                  <tr>
                    <DataTableHeaderCell>Role</DataTableHeaderCell>
                    <DataTableHeaderCell>Type</DataTableHeaderCell>
                    <DataTableHeaderCell className="text-right">Perms</DataTableHeaderCell>
                  </tr>
                </DataTableHead>
                <tbody>
                  {roles.map((r) => {
                    const isSelected = !isCreatingRole && selectedRole?.id === r.id;
                    return (
                      <DataTableRow
                        key={r.id}
                        onClick={() => handleSelectRoleForInspection(r)}
                        className={`cursor-pointer ${isSelected ? 'bg-blue-50/80' : ''}`}
                      >
                        <DataTableCell>
                          <div className="font-semibold text-flotech-navy">{r.name}</div>
                          <div className="font-mono text-[11px] text-slate-500">{r.slug}</div>
                        </DataTableCell>
                        <DataTableCell>
                          <Badge variant={r.isSystemRole ? 'navy' : 'teal'}>
                            {r.isSystemRole ? 'SYSTEM' : 'CUSTOM'}
                          </Badge>
                        </DataTableCell>
                        <DataTableCell className="text-right font-mono font-semibold text-flotech-primary">
                          {r.permissions.length}
                        </DataTableCell>
                      </DataTableRow>
                    );
                  })}
                </tbody>
              </DataTableContainer>
            )}

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-semibold text-flotech-navy">
                <Lock className="h-3.5 w-3.5 text-flotech-danger" />
                Owner Lockout Protection
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                The <code className="font-mono">business_owner</code> system role always retains all
                27 permissions (`403 OWNER_ROLE_IMMUTABLE_PERMISSIONS` if reduction is attempted).
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Right Column: Role Builder & Atomic Permission Matrix */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>
                  {isCreatingRole
                    ? 'Create New Custom Business Role'
                    : selectedRole
                    ? `Configure Role: ${selectedRole.name} (${selectedRole.slug})`
                    : 'Atomic Permission Matrix (27 Permissions)'}
                </CardTitle>
                <CardDescription>
                  Protected by <code className="font-mono">roles:manage</code> permission on{' '}
                  <code className="font-mono">POST / PATCH /api/v1/businesses/:businessId/roles</code>.
                </CardDescription>
              </div>
              <Badge variant="primary">{selectedPerms.size} / 27 Selected</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveRoleSubmit} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InputField
                  id="input-role-name"
                  label="Role Display Name"
                  placeholder="e.g. Senior Credit Underwriter"
                  required
                  value={roleName}
                  onChange={(e) => setRoleName(e.target.value)}
                />
                <InputField
                  id="input-role-description"
                  label="Role Description"
                  placeholder="Responsibilities and operational scope"
                  value={roleDescription}
                  onChange={(e) => setRoleDescription(e.target.value)}
                />
              </div>

              <div className="space-y-4">
                {ARCHITECTURAL_PERMISSION_GROUPS.map((group) => (
                  <div
                    key={group.module}
                    className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3"
                  >
                    <div className="text-xs font-bold uppercase tracking-wider text-flotech-navy border-b border-slate-200 pb-2">
                      {group.module}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {group.permissions.map((perm) => {
                        const checked = selectedPerms.has(perm.code);
                        const catalogMatch = catalog.find((c) => c.code === perm.code);
                        return (
                          <label
                            key={perm.code}
                            className={`flex items-start gap-2.5 rounded-lg border p-2.5 text-xs cursor-pointer transition-colors ${
                              checked
                                ? 'border-blue-300 bg-blue-50/70 text-flotech-navy'
                                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => handleTogglePerm(perm.code)}
                              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-flotech-primary focus:ring-flotech-primary"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="font-mono text-[11px] font-semibold text-flotech-navy">
                                {perm.code}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                {catalogMatch?.description ?? perm.description}
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                <Button
                  id="btn-save-role-matrix"
                  type="submit"
                  variant="primary"
                  disabled={isSubmitting || !activeBusinessId}
                >
                  {isSubmitting
                    ? 'Persisting to PostgreSQL...'
                    : isCreatingRole
                    ? 'Create Custom Role'
                    : 'Save Role & Permission Matrix'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
