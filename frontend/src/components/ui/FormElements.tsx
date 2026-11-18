import React from 'react';
import { cn } from '@/config/utils';

export interface InputFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  errorText?: string;
}

export const InputField = React.forwardRef<HTMLInputElement, InputFieldProps>(
  ({ className, label, helperText, errorText, id, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={id}
            className="text-xs font-semibold uppercase tracking-wider text-slate-600"
          >
            {label}
          </label>
        )}
        <input
          id={id}
          ref={ref}
          className={cn(
            'flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-flotech-navy placeholder:text-slate-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flotech-primary focus-visible:border-flotech-primary disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-60',
            errorText && 'border-flotech-danger focus-visible:ring-flotech-danger',
            className
          )}
          {...props}
        />
        {errorText ? (
          <p className="text-xs font-medium text-flotech-danger">{errorText}</p>
        ) : helperText ? (
          <p className="text-xs text-slate-500">{helperText}</p>
        ) : null}
      </div>
    );
  }
);
InputField.displayName = 'InputField';

export interface SelectFieldProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  helperText?: string;
}

export const SelectField = React.forwardRef<HTMLSelectElement, SelectFieldProps>(
  ({ className, label, helperText, id, children, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={id}
            className="text-xs font-semibold uppercase tracking-wider text-slate-600"
          >
            {label}
          </label>
        )}
        <select
          id={id}
          ref={ref}
          className={cn(
            'flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-flotech-navy transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flotech-primary focus-visible:border-flotech-primary',
            className
          )}
          {...props}
        >
          {children}
        </select>
        {helperText && <p className="text-xs text-slate-500">{helperText}</p>}
      </div>
    );
  }
);
SelectField.displayName = 'SelectField';
