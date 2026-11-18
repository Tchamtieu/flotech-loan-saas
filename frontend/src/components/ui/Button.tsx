import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/config/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flotech-primary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.99]',
  {
    variants: {
      variant: {
        primary:
          'bg-flotech-primary text-white shadow-sm hover:bg-flotech-primaryHover',
        navy:
          'bg-flotech-navy text-white shadow-sm hover:bg-flotech-navySurface',
        teal:
          'bg-flotech-teal text-white shadow-sm hover:opacity-95',
        outline:
          'border border-slate-300 bg-white text-flotech-navy hover:bg-slate-50',
        ghost:
          'text-slate-700 hover:bg-slate-100 hover:text-flotech-navy',
        danger:
          'bg-flotech-danger text-white shadow-sm hover:opacity-95',
        success:
          'bg-flotech-success text-white shadow-sm hover:opacity-95',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-10 px-4 py-2',
        lg: 'h-11 px-6 text-base',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';
