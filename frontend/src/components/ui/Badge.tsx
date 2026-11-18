import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/config/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        primary: 'bg-blue-50 text-flotech-primary border border-blue-200',
        teal: 'bg-teal-50 text-flotech-teal border border-teal-200',
        success: 'bg-emerald-50 text-flotech-success border border-emerald-200',
        warning: 'bg-amber-50 text-amber-700 border border-amber-200',
        danger: 'bg-red-50 text-flotech-danger border border-red-200',
        neutral: 'bg-slate-100 text-slate-700 border border-slate-200',
        navy: 'bg-flotech-navy text-white',
      },
    },
    defaultVariants: {
      variant: 'neutral',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
