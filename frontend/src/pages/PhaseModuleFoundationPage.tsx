import React from 'react';
import { ShieldCheck, Database, Lock } from 'lucide-react';
import type { NavItemConfig } from '@/config/navigation';
import { Badge } from '@/components/ui/Badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/Card';

export interface PhaseModuleFoundationPageProps {
  environment: 'BUSINESS' | 'SUPER_ADMIN';
  moduleConfig: NavItemConfig;
}

/**
 * Renders the clean Phase 1 structural route shell for each Business (15 modules)
 * and Super Admin (9 modules) destination without displaying fake financial data.
 */
export function PhaseModuleFoundationPage({
  environment,
  moduleConfig,
}: PhaseModuleFoundationPageProps) {
  const Icon = moduleConfig.icon;
  const isSuperAdmin = environment === 'SUPER_ADMIN';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div className="flex items-center gap-3.5">
          <div
            className={`flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-xs ${
              isSuperAdmin ? 'bg-flotech-teal' : 'bg-flotech-primary'
            }`}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-flotech-navy">
                {moduleConfig.label}
              </h1>
              <Badge variant={isSuperAdmin ? 'teal' : 'primary'}>
                Scheduled: Phase {moduleConfig.phaseNumber}
              </Badge>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">{moduleConfig.description}</p>
          </div>
        </div>

        <Badge variant="neutral">
          Route: <span className="font-mono ml-1">{moduleConfig.path}</span>
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Phase 1 Architectural Foundation Initialized</CardTitle>
          <CardDescription>
            In compliance with Development Rule #8 (&ldquo;Do not use fake financial data as real
            business statistics&rdquo; and &ldquo;Never skip phases&rdquo;), this module&apos;s
            routing, RBAC guard, and PostgreSQL schema blueprint are established in Phase 1 and will
            be connected to live database queries in Phase {moduleConfig.phaseNumber}.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 space-y-1.5">
            <div className="flex items-center gap-2 font-semibold text-flotech-navy">
              <Database className="h-4 w-4 text-flotech-primary" />
              PostgreSQL Source of Truth
            </div>
            <p className="text-slate-600">
              Backed by normalized relational tables in{' '}
              <code className="font-mono">001_initial_schema_blueprint.sql</code> using{' '}
              <code className="font-mono">NUMERIC(19,4)</code>.
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 space-y-1.5">
            <div className="flex items-center gap-2 font-semibold text-flotech-navy">
              <ShieldCheck className="h-4 w-4 text-flotech-teal" />
              {isSuperAdmin ? 'Super Admin Guard' : 'Multi-Tenant Isolation'}
            </div>
            <p className="text-slate-600">
              {isSuperAdmin
                ? 'Protected by requireSuperAdminMiddleware verifying users.platform_role = SUPER_ADMIN in PostgreSQL.'
                : 'Protected by requireTenantMembershipMiddleware and PostgreSQL Row-Level Security (RLS) policies.'}
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 space-y-1.5">
            <div className="flex items-center gap-2 font-semibold text-flotech-navy">
              <Lock className="h-4 w-4 text-flotech-danger" />
              Firebase Auth & App Check
            </div>
            <p className="text-slate-600">
              Every API request to this module requires a verified Firebase ID token and valid
              Firebase App Check attestation header.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
