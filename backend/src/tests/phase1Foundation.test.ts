import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { Decimal } from 'decimal.js';
import { InterestCalculationMethod, RepaymentFrequency } from '@flotech/shared';
import {
  generateLoanSchedulePreview,
  toStorageMoney,
} from '../financial/decimalEngine.js';
import { createApp } from '../app.js';

describe('FloTech Phase 1 — Financial Engine & API Security Foundation', () => {
  it('enforces exact Decimal.js arithmetic without IEEE 754 floating-point drift (0.1 + 0.2 === 0.3000)', () => {
    const a = new Decimal('0.1');
    const b = new Decimal('0.2');
    expect(toStorageMoney(a.plus(b))).toBe('0.3000');
  });

  it('rejects raw JavaScript numbers in toStorageMoney at runtime', () => {
    expect(() => toStorageMoney(125.5 as unknown as string)).toThrow(
      /Raw JavaScript numbers are forbidden/
    );
  });

  it('generates a penny-accurate FLAT_RATE schedule where installment principals sum exactly to principalAmount', () => {
    const schedule = generateLoanSchedulePreview({
      principalAmount: '10000.0000',
      nominalInterestRatePercent: '12.000000',
      ratePeriod: 'PER_ANNUM',
      interestMethod: InterestCalculationMethod.FLAT_RATE,
      repaymentFrequency: RepaymentFrequency.MONTHLY,
      termInstallments: 3,
      firstRepaymentDate: '2026-12-01',
      originationFeeFixed: '50.0000',
      originationFeePercent: '1.000000',
    });

    expect(schedule.installmentCount).toBe(3);
    expect(schedule.principalAmount).toBe('10000.0000');
    expect(schedule.totalFeeAmount).toBe('150.0000'); // 50 fixed + 1% of 10,000 (100)
    expect(schedule.totalInterestAmount).toBe('300.0000'); // 1% per month * 3 months = 300

    // Verify 3333.33 + 3333.33 + 3333.34 === 10000.0000
    expect(schedule.installments[0]?.principalDue).toBe('3333.3300');
    expect(schedule.installments[1]?.principalDue).toBe('3333.3300');
    expect(schedule.installments[2]?.principalDue).toBe('3333.3400');
    expect(schedule.installments[2]?.closingBalance).toBe('0.0000');
  });

  it('generates a penny-accurate DECLINING_BALANCE_EQUAL_INSTALLMENTS schedule', () => {
    const schedule = generateLoanSchedulePreview({
      principalAmount: '12000.0000',
      nominalInterestRatePercent: '24.000000',
      ratePeriod: 'PER_ANNUM',
      interestMethod: InterestCalculationMethod.DECLINING_BALANCE_EQUAL_INSTALLMENTS,
      repaymentFrequency: RepaymentFrequency.MONTHLY,
      termInstallments: 6,
      firstRepaymentDate: '2026-12-01',
    });

    const sumPrincipal = schedule.installments.reduce(
      (acc, item) => acc.plus(new Decimal(item.principalDue)),
      new Decimal(0)
    );
    expect(toStorageMoney(sumPrincipal)).toBe('12000.0000');
    expect(schedule.installments[5]?.closingBalance).toBe('0.0000');
  });

  it('exposes GET /api/v1/health with FloTech Phase 1 metadata and X-Request-Id header', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.body.success).toBe(true);
    expect(res.body.data.owner).toBe('FloTech Digital');
    expect(res.body.data.phase).toBe('PHASE_1_ARCHITECTURE_FOUNDATION');
  });

  it('calculates loan schedule via POST /api/v1/financial/schedule-preview and rejects float numbers', async () => {
    const app = createApp();
    const validRes = await request(app)
      .post('/api/v1/financial/schedule-preview')
      .send({
        principalAmount: '5000.00',
        nominalInterestRatePercent: '10',
        ratePeriod: 'PER_ANNUM',
        interestMethod: InterestCalculationMethod.DECLINING_BALANCE_EQUAL_PRINCIPAL,
        repaymentFrequency: RepaymentFrequency.MONTHLY,
        termInstallments: 5,
        firstRepaymentDate: '2026-12-01',
      });

    expect(validRes.status).toBe(200);
    expect(validRes.body.success).toBe(true);
    expect(validRes.body.data.principalAmount).toBe('5000.0000');

    // Sending a raw float number for principalAmount must fail validation
    const invalidRes = await request(app)
      .post('/api/v1/financial/schedule-preview')
      .send({
        principalAmount: 5000.0,
        nominalInterestRatePercent: '10',
        ratePeriod: 'PER_ANNUM',
        interestMethod: InterestCalculationMethod.FLAT_RATE,
        repaymentFrequency: RepaymentFrequency.MONTHLY,
        termInstallments: 5,
        firstRepaymentDate: '2026-12-01',
      });

    expect(invalidRes.status).toBe(400);
    expect(invalidRes.body.success).toBe(false);
    expect(invalidRes.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('blocks unauthenticated or unattested requests to tenant and super-admin routes', async () => {
    const app = createApp();
    const tenantRes = await request(app).get(
      '/api/v1/businesses/11111111-1111-4111-8111-111111111111/context'
    );
    expect(tenantRes.status).toBe(401);

    const superAdminRes = await request(app).get('/api/v1/super-admin/context');
    expect(superAdminRes.status).toBe(401);
  });
});
