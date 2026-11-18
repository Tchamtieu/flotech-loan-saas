import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merges Tailwind CSS classes deterministically without specificity conflicts.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Formats a backend-calculated DecimalString (e.g. "12500.0000") for display ONLY.
 *
 * ARCHITECTURAL RULE 5 & 7:
 * The frontend NEVER performs financial arithmetic or interest calculations.
 * It only formats pre-calculated backend `DecimalString` values for human reading.
 */
export function formatDecimalMoneyDisplay(
  decimalString: string,
  currencyCode = 'USD'
): string {
  const trimmed = decimalString.trim();
  const isNegative = trimmed.startsWith('-');
  const normalized = isNegative ? trimmed.slice(1) : trimmed;
  const [integerPartRaw = '0', fractionalPartRaw = '00'] = normalized.split('.');

  const integerFormatted = integerPartRaw.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const twoDecimalFraction = (fractionalPartRaw + '00').slice(0, 2);

  return `${isNegative ? '-' : ''}${currencyCode} ${integerFormatted}.${twoDecimalFraction}`;
}
