import { Decimal } from 'decimal.js';
import {
  InterestCalculationMethod,
  RepaymentFrequency,
  type DecimalString,
  type ISODateString,
  type LoanSchedulePreviewSummary,
} from '@flotech/shared';

/**
 * Configure Decimal.js globally for financial precision:
 * - precision: 34 significant digits (IEEE 754-2008 decimal128 equivalent)
 * - rounding: ROUND_HALF_UP (standard banking & commercial accounting rounding)
 */
export const FinancialDecimal = Decimal.clone({
  precision: 34,
  rounding: Decimal.ROUND_HALF_UP,
});

export const DB_MONEY_SCALE = 4; // Matches PostgreSQL NUMERIC(19, 4)
export const DB_RATE_SCALE = 6; // Matches PostgreSQL NUMERIC(10, 6)
export const DISPLAY_MONEY_SCALE = 2; // Standard 2-decimal currency display

/**
 * Converts a string or Decimal input to a 4-decimal-place fixed string suitable for PostgreSQL NUMERIC(19, 4).
 * Rejects JavaScript numbers at compile time and runtime to enforce Rule 7 ("Do not use JS floating-point for money").
 */
export function toStorageMoney(value: DecimalString | Decimal): DecimalString {
  if (typeof value === 'number') {
    throw new Error(
      'FINANCIAL_PRECISION_ERROR: Raw JavaScript numbers are forbidden in monetary calculations. Pass a string or Decimal.'
    );
  }
  const d = new FinancialDecimal(value);
  if (!d.isFinite()) {
    throw new Error('FINANCIAL_PRECISION_ERROR: Non-finite monetary value.');
  }
  return d.toFixed(DB_MONEY_SCALE, Decimal.ROUND_HALF_UP);
}

/**
 * Converts a percentage rate string or Decimal input to a 6-decimal-place fixed string suitable for PostgreSQL NUMERIC(10, 6).
 */
export function toStorageRate(value: DecimalString | Decimal): DecimalString {
  if (typeof value === 'number') {
    throw new Error(
      'FINANCIAL_PRECISION_ERROR: Raw JavaScript numbers are forbidden in interest/fee rate calculations. Pass a string or Decimal.'
    );
  }
  const d = new FinancialDecimal(value);
  if (!d.isFinite()) {
    throw new Error('FINANCIAL_PRECISION_ERROR: Non-finite rate value.');
  }
  return d.toFixed(DB_RATE_SCALE, Decimal.ROUND_HALF_UP);
}

/**
 * Rounds a monetary value to standard 2-decimal currency subunit precision (e.g. cents)
 * while returning a 4-decimal storage string (e.g., "1250.5500").
 */
export function roundCurrencyUnit(value: DecimalString | Decimal): Decimal {
  if (typeof value === 'number') {
    throw new Error(
      'FINANCIAL_PRECISION_ERROR: Raw JavaScript numbers are forbidden in monetary calculations.'
    );
  }
  const d = new FinancialDecimal(value);
  return new FinancialDecimal(d.toFixed(DISPLAY_MONEY_SCALE, Decimal.ROUND_HALF_UP));
}

export interface ScheduleCalculationInput {
  principalAmount: DecimalString;
  nominalInterestRatePercent: DecimalString;
  ratePeriod: 'PER_PERIOD' | 'PER_MONTH' | 'PER_ANNUM';
  interestMethod: InterestCalculationMethod;
  repaymentFrequency: RepaymentFrequency;
  termInstallments: number;
  firstRepaymentDate: ISODateString;
  originationFeeFixed?: DecimalString;
  originationFeePercent?: DecimalString;
}

/**
 * Computes the periodic interest rate as a high-precision Decimal fraction
 * based on the nominal interest rate, rate period, and repayment frequency.
 */
export function computePeriodicInterestRate(
  nominalRatePercent: DecimalString,
  ratePeriod: 'PER_PERIOD' | 'PER_MONTH' | 'PER_ANNUM',
  frequency: RepaymentFrequency
): Decimal {
  const rateFraction = new FinancialDecimal(nominalRatePercent).dividedBy(100);

  if (ratePeriod === 'PER_PERIOD') {
    return rateFraction;
  }

  const periodsPerYearMap: Record<RepaymentFrequency, number> = {
    [RepaymentFrequency.DAILY]: 365,
    [RepaymentFrequency.WEEKLY]: 52,
    [RepaymentFrequency.BIWEEKLY]: 26,
    [RepaymentFrequency.MONTHLY]: 12,
    [RepaymentFrequency.QUARTERLY]: 4,
  };

  if (ratePeriod === 'PER_ANNUM') {
    return rateFraction.dividedBy(periodsPerYearMap[frequency]);
  }

  // ratePeriod === 'PER_MONTH'
  switch (frequency) {
    case RepaymentFrequency.MONTHLY:
      return rateFraction;
    case RepaymentFrequency.QUARTERLY:
      return rateFraction.times(3);
    case RepaymentFrequency.BIWEEKLY:
      return rateFraction.times(12).dividedBy(26);
    case RepaymentFrequency.WEEKLY:
      return rateFraction.times(12).dividedBy(52);
    case RepaymentFrequency.DAILY:
      return rateFraction.times(12).dividedBy(365);
  }
}

/**
 * Advances an ISO date string (YYYY-MM-DD) by `stepIndex` periods in UTC without timezone drift.
 */
export function advanceDateByFrequency(
  startDateIso: ISODateString,
  frequency: RepaymentFrequency,
  stepIndex: number
): ISODateString {
  const parts = startDateIso.split('-').map((p) => parseInt(p, 10));
  const year = parts[0] ?? 2026;
  const month = (parts[1] ?? 1) - 1;
  const day = parts[2] ?? 1;

  const date = new Date(Date.UTC(year, month, day));

  switch (frequency) {
    case RepaymentFrequency.DAILY:
      date.setUTCDate(date.getUTCDate() + stepIndex);
      break;
    case RepaymentFrequency.WEEKLY:
      date.setUTCDate(date.getUTCDate() + stepIndex * 7);
      break;
    case RepaymentFrequency.BIWEEKLY:
      date.setUTCDate(date.getUTCDate() + stepIndex * 14);
      break;
    case RepaymentFrequency.MONTHLY:
      date.setUTCMonth(date.getUTCMonth() + stepIndex);
      break;
    case RepaymentFrequency.QUARTERLY:
      date.setUTCMonth(date.getUTCMonth() + stepIndex * 3);
      break;
  }

  return date.toISOString().slice(0, 10);
}

/**
 * Generates a deterministic, penny-accurate repayment schedule using Decimal.js.
 * Guarantees that the sum of installment principals equals `principalAmount` to 4 decimal places.
 */
export function generateLoanSchedulePreview(
  input: ScheduleCalculationInput
): LoanSchedulePreviewSummary {
  const principal = roundCurrencyUnit(input.principalAmount);
  if (principal.lte(0)) {
    throw new Error('Principal amount must be greater than zero.');
  }
  if (!Number.isInteger(input.termInstallments) || input.termInstallments < 1) {
    throw new Error('Term installments must be a positive integer.');
  }

  const fixedFee = roundCurrencyUnit(input.originationFeeFixed ?? '0');
  const percentFee = roundCurrencyUnit(
    principal.times(new FinancialDecimal(input.originationFeePercent ?? '0').dividedBy(100))
  );
  const totalFee = fixedFee.plus(percentFee);

  const periodicRate = computePeriodicInterestRate(
    input.nominalInterestRatePercent,
    input.ratePeriod,
    input.repaymentFrequency
  );

  const n = input.termInstallments;
  const installments: LoanSchedulePreviewSummary['installments'] = [];

  let remainingPrincipal = principal;
  let totalInterestAccrued = new FinancialDecimal(0);

  // Pre-compute constant annuity installment if DECLINING_BALANCE_EQUAL_INSTALLMENTS
  let fixedAnnuityPayment = new FinancialDecimal(0);
  if (input.interestMethod === InterestCalculationMethod.DECLINING_BALANCE_EQUAL_INSTALLMENTS) {
    if (periodicRate.eq(0)) {
      fixedAnnuityPayment = roundCurrencyUnit(principal.dividedBy(n));
    } else {
      // PMT = P * [r * (1 + r)^n] / [(1 + r)^n - 1]
      const onePlusRPowerN = periodicRate.plus(1).pow(n);
      const numerator = principal.times(periodicRate).times(onePlusRPowerN);
      const denominator = onePlusRPowerN.minus(1);
      fixedAnnuityPayment = roundCurrencyUnit(numerator.dividedBy(denominator));
    }
  }

  for (let i = 1; i <= n; i++) {
    const isLast = i === n;
    const openingBalance = remainingPrincipal;
    const dueDate = advanceDateByFrequency(
      input.firstRepaymentDate,
      input.repaymentFrequency,
      i - 1
    );

    // Origination fee is attached to Installment #1 if applicable
    const feeDue = i === 1 ? totalFee : new FinancialDecimal(0);

    let principalDue = new FinancialDecimal(0);
    let interestDue = new FinancialDecimal(0);

    switch (input.interestMethod) {
      case InterestCalculationMethod.FLAT_RATE: {
        const totalFlatInterest = roundCurrencyUnit(principal.times(periodicRate).times(n));
        const basePrincipal = roundCurrencyUnit(principal.dividedBy(n));
        const baseInterest = roundCurrencyUnit(totalFlatInterest.dividedBy(n));
        const remainingInterest = FinancialDecimal.max(
          new FinancialDecimal(0),
          totalFlatInterest.minus(totalInterestAccrued)
        );

        principalDue = isLast
          ? remainingPrincipal
          : FinancialDecimal.min(remainingPrincipal, basePrincipal);
        interestDue = isLast
          ? remainingInterest
          : FinancialDecimal.min(remainingInterest, baseInterest);
        break;
      }

      case InterestCalculationMethod.DECLINING_BALANCE_EQUAL_PRINCIPAL: {
        const basePrincipal = roundCurrencyUnit(principal.dividedBy(n));
        principalDue = isLast
          ? remainingPrincipal
          : FinancialDecimal.min(remainingPrincipal, basePrincipal);
        interestDue = roundCurrencyUnit(openingBalance.times(periodicRate));
        break;
      }

      case InterestCalculationMethod.DECLINING_BALANCE_EQUAL_INSTALLMENTS: {
        interestDue = roundCurrencyUnit(openingBalance.times(periodicRate));
        if (isLast) {
          principalDue = remainingPrincipal;
        } else {
          principalDue = fixedAnnuityPayment.minus(interestDue);
          if (principalDue.gt(remainingPrincipal)) {
            principalDue = remainingPrincipal;
          }
        }
        break;
      }

      case InterestCalculationMethod.INTEREST_ONLY: {
        interestDue = roundCurrencyUnit(openingBalance.times(periodicRate));
        principalDue = isLast ? remainingPrincipal : new FinancialDecimal(0);
        break;
      }
    }

    const closingBalance = openingBalance.minus(principalDue);
    const totalDue = principalDue.plus(interestDue).plus(feeDue);

    remainingPrincipal = closingBalance;
    totalInterestAccrued = totalInterestAccrued.plus(interestDue);

    installments.push({
      installmentNumber: i,
      dueDate,
      openingBalance: toStorageMoney(openingBalance),
      principalDue: toStorageMoney(principalDue),
      interestDue: toStorageMoney(interestDue),
      feeDue: toStorageMoney(feeDue),
      totalDue: toStorageMoney(totalDue),
      closingBalance: toStorageMoney(closingBalance),
    });
  }

  const totalPayable = principal.plus(totalInterestAccrued).plus(totalFee);

  return {
    principalAmount: toStorageMoney(principal),
    totalInterestAmount: toStorageMoney(totalInterestAccrued),
    totalFeeAmount: toStorageMoney(totalFee),
    totalPayableAmount: toStorageMoney(totalPayable),
    effectivePeriodicRatePercent: periodicRate.times(100).toFixed(6, Decimal.ROUND_HALF_UP),
    installmentCount: n,
    installments,
  };
}
