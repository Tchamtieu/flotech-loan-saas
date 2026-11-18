import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MembershipStatus,
  type BusinessEmployeeDTO,
  type BusinessRoleDTO,
} from '@flotech/shared';
import {
  UserCheck,
  UserPlus,
  ShieldCheck,
  CheckCircle2,
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
import { InputField, SelectField } from '@/components/ui/FormElements';
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
  fetchBusinessEmployeesApi,
  fetchBusinessRolesApi,
  inviteOrAddEmployeeApi,
  updateBusinessEmployeeApi,
} from '@/services/apiClient';

export function EmployeesPage() {
  const navigate = useNavigate();
  const { firebaseUser, activeBusinessId, activeBusinessProfile } = useAuthSession();

  const [employees, setEmployees] = useState<BusinessEmployeeDTO[]>([]);
  const [roles, setRoles] = useState<BusinessRoleDTO[]>([]);
  const [isAddingEmployee, setIsAddingEmployee] = useState(false);

  // Add / Invite Employee Form State
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [roleId, setRoleId] = useState('');
  const [employeeCode, setEmployeeCode] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [department, setDepartment] = useState('Lending Operations');
  const [activateImmediately, setActivateImmediately] = useState(true);

  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadEmployeesAndRoles = useCallback(async () => {
    if (!firebaseUser || !activeBusinessId) {
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const idToken = await firebaseUser.getIdToken();
      const appCheckToken = await getActiveAppCheckToken();

      const [empRes, rolesRes] = await Promise.all([
        fetchBusinessEmployeesApi(idToken, appCheckToken, activeBusinessId),
        fetchBusinessRolesApi(idToken, appCheckToken, activeBusinessId),
      ]);

      if (empRes.success) {
        setEmployees(empRes.data);
      } else {
        setErrorMessage(`${empRes.error.code}: ${empRes.error.message}`);
      }

      if (rolesRes.success) {
        setRoles(rolesRes.data);
        if (!roleId && rolesRes.data[0]) {
          setRoleId(rolesRes.data[0].id);
        }
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load employees.');
    } finally {
      setIsLoading(false);
    }
  }, [firebaseUser, activeBusinessId, roleId]);

  useEffect(() => {
    void loadEmployeesAndRoles();
  }, [loadEmployeesAndRoles]);

  async function handleInviteEmployeeSubmit(e: React.FormEvent) {
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

      const res = await inviteOrAddEmployeeApi(idToken, appCheckToken, activeBusinessId, {
        email: email.trim(),
        fullName: fullName.trim(),
        phoneNumber: phoneNumber.trim() || null,
        roleId,
        employeeCode: employeeCode.trim() || null,
        jobTitle: jobTitle.trim() || null,
        department: department.trim() || null,
        activateImmediately,
      });

      if (!res.success) {
        throw new Error(`${res.error.code}: ${res.error.message}`);
      }

      setFeedbackMessage(
        `Employee "${res.data.fullName}" (${res.data.employeeCode}) added with role "${res.data.roleName}" and status ${res.data.status}.`
      );
      setIsAddingEmployee(false);
      setEmail('');
      setFullName('');
      setPhoneNumber('');
      setEmployeeCode('');
      setJobTitle('');
      await loadEmployeesAndRoles();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to onboard employee.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleStatusChange(
    membershipId: string,
    nextStatus: MembershipStatus
  ) {
    if (!firebaseUser || !activeBusinessId) {
      return;
    }
    setFeedbackMessage(null);
    setErrorMessage(null);
    try {
      const idToken = await firebaseUser.getIdToken();
      const appCheckToken = await getActiveAppCheckToken();
      const res = await updateBusinessEmployeeApi(
        idToken,
        appCheckToken,
        activeBusinessId,
        membershipId,
        { status: nextStatus }
      );
      if (!res.success) {
        throw new Error(`${res.error.code}: ${res.error.message}`);
      }
      setFeedbackMessage(
        `Updated membership status for ${res.data.fullName} to ${res.data.status}.`
      );
      await loadEmployeesAndRoles();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to update employee status.');
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div className="flex items-center gap-3.5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-flotech-primary text-white shadow-xs">
            <UserCheck className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-flotech-navy">
                Employee & Staff Management
              </h1>
              <Badge variant="success">Phase 4 Active</Badge>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Onboard staff, assign RBAC roles, enforce subscription employee quotas, and manage
              membership lifecycles in PostgreSQL <code className="font-mono">business_memberships</code>.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            id="btn-refresh-employees"
            variant="outline"
            size="sm"
            onClick={() => void loadEmployeesAndRoles()}
            disabled={isLoading || !activeBusinessId}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
          <Button
            id="btn-toggle-add-employee"
            variant={isAddingEmployee ? 'outline' : 'primary'}
            size="sm"
            onClick={() => setIsAddingEmployee((prev) => !prev)}
          >
            <UserPlus className="h-4 w-4" />
            {isAddingEmployee ? 'Cancel Onboarding' : 'Add / Invite Employee'}
          </Button>
          <Button
            id="btn-go-to-roles"
            variant="navy"
            size="sm"
            onClick={() => navigate('/app/roles-permissions')}
          >
            <ShieldCheck className="h-4 w-4" />
            Roles & Permissions
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

      {/* Add / Invite Employee Form */}
      {isAddingEmployee && (
        <Card className="border-blue-200">
          <CardHeader>
            <CardTitle>
              Onboard or Invite Staff Member (
              <code className="font-mono text-xs">
                POST /api/v1/businesses/:businessId/employees
              </code>
              )
            </CardTitle>
            <CardDescription>
              Requires <code className="font-mono">employees:manage</code> permission. Validates
              that the selected <code className="font-mono">roleId</code> belongs to this business
              and checks your active subscription <code className="font-mono">max_employees</code>{' '}
              quota.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleInviteEmployeeSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <InputField
                  id="input-emp-fullname"
                  label="Employee Full Name"
                  placeholder="e.g. Chidi Nwosu"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
                <InputField
                  id="input-emp-email"
                  label="Work Email Address"
                  type="email"
                  placeholder="chidi@business.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <InputField
                  id="input-emp-phone"
                  label="Phone Number"
                  type="tel"
                  placeholder="+1 (555) 444-3322"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                />

                <SelectField
                  id="select-emp-role"
                  label="Assigned Business Role"
                  value={roleId}
                  onChange={(e) => setRoleId(e.target.value)}
                  required
                >
                  {roles.length === 0 ? (
                    <option value="">Select active business first</option>
                  ) : (
                    roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({r.slug})
                      </option>
                    ))
                  )}
                </SelectField>

                <InputField
                  id="input-emp-code"
                  label="Employee Code (Auto-generated if blank)"
                  placeholder="EMP-0002"
                  value={employeeCode}
                  onChange={(e) => setEmployeeCode(e.target.value)}
                />
                <InputField
                  id="input-emp-job-title"
                  label="Job Title"
                  placeholder="Senior Loan Officer"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                />
                <InputField
                  id="input-emp-department"
                  label="Department / Branch"
                  placeholder="Lending Operations"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                />
              </div>

              <label className="flex items-center gap-2.5 text-xs text-flotech-navy cursor-pointer pt-1">
                <input
                  id="checkbox-emp-activate"
                  type="checkbox"
                  checked={activateImmediately}
                  onChange={(e) => setActivateImmediately(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-flotech-primary focus:ring-flotech-primary"
                />
                <span>
                  Activate membership immediately (<code className="font-mono">ACTIVE</code>) rather
                  than pending invitation (<code className="font-mono">INVITED</code>)
                </span>
              </label>

              <div className="flex justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsAddingEmployee(false)}
                >
                  Cancel
                </Button>
                <Button
                  id="btn-submit-add-employee"
                  type="submit"
                  variant="primary"
                  disabled={isSubmitting || !activeBusinessId || !roleId}
                >
                  {isSubmitting ? 'Onboarding Employee...' : 'Confirm Employee Onboarding'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Employees Directory Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>
                Business Staff Directory (
                {activeBusinessProfile?.legalName ?? 'No Active Business Selected'})
              </CardTitle>
              <CardDescription>
                Protected by <code className="font-mono">employees:view</code> and{' '}
                <code className="font-mono">employees:manage</code> permissions. Sole active{' '}
                <code className="font-mono">business_owner</code> accounts are protected from
                accidental suspension or demotion (`409 LAST_BUSINESS_OWNER_PROTECTION`).
              </CardDescription>
            </div>
            <Badge variant="primary">{employees.length} Members</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {employees.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center text-xs text-slate-600">
              {activeBusinessId
                ? 'No employee records loaded. Click Refresh or Add / Invite Employee above.'
                : 'Sign in and select or create a business tenant in Business Profile to manage employees.'}
            </div>
          ) : (
            <DataTableContainer>
              <DataTableHead>
                <tr>
                  <DataTableHeaderCell>Code</DataTableHeaderCell>
                  <DataTableHeaderCell>Employee</DataTableHeaderCell>
                  <DataTableHeaderCell>Role</DataTableHeaderCell>
                  <DataTableHeaderCell>Job Title / Dept</DataTableHeaderCell>
                  <DataTableHeaderCell>Status</DataTableHeaderCell>
                  <DataTableHeaderCell className="text-right">Lifecycle Controls</DataTableHeaderCell>
                </tr>
              </DataTableHead>
              <tbody>
                {employees.map((emp) => (
                  <DataTableRow key={emp.membershipId}>
                    <DataTableCell className="font-mono font-semibold">
                      {emp.employeeCode ?? '—'}
                    </DataTableCell>
                    <DataTableCell>
                      <div className="font-semibold text-flotech-navy">{emp.fullName}</div>
                      <div className="text-xs text-slate-500">{emp.email}</div>
                    </DataTableCell>
                    <DataTableCell>
                      <Badge
                        variant={emp.roleSlug === 'business_owner' ? 'navy' : 'primary'}
                      >
                        {emp.roleName}
                      </Badge>
                    </DataTableCell>
                    <DataTableCell>
                      <div className="text-xs font-medium text-flotech-navy">
                        {emp.jobTitle ?? '—'}
                      </div>
                      <div className="text-[11px] text-slate-500">{emp.department ?? '—'}</div>
                    </DataTableCell>
                    <DataTableCell>
                      <Badge
                        variant={
                          emp.status === MembershipStatus.ACTIVE
                            ? 'success'
                            : emp.status === MembershipStatus.INVITED
                            ? 'warning'
                            : 'danger'
                        }
                      >
                        {emp.status}
                      </Badge>
                    </DataTableCell>
                    <DataTableCell className="text-right space-x-2">
                      {emp.status !== MembershipStatus.ACTIVE && (
                        <Button
                          size="sm"
                          variant="success"
                          onClick={() =>
                            void handleStatusChange(emp.membershipId, MembershipStatus.ACTIVE)
                          }
                        >
                          Activate
                        </Button>
                      )}
                      {emp.status === MembershipStatus.ACTIVE && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            void handleStatusChange(emp.membershipId, MembershipStatus.SUSPENDED)
                          }
                        >
                          Suspend
                        </Button>
                      )}
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
