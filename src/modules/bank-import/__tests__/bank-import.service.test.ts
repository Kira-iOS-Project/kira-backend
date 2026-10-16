import { describe, expect, test } from 'bun:test';
import { INCOME_CATEGORY, TRANSACTION_TYPE } from '../../../lib/constants/money.ts';
import { PLAN, SUBSCRIPTION_SOURCE, SUBSCRIPTION_STATUS } from '../../../lib/constants/plans.ts';
import { activePlanOf, usageOf } from '../../../lib/usage/plan-usage.ts';
import type { BankImportRepository } from '../bank-import.repository.ts';
import { createImport } from '../bank-import.service.ts';
import { createBankImportRepositoryMock, IMPORT_BODY, NOW } from './helpers.ts';

function planUsage(plus: boolean) {
  const plan = activePlanOf(
    plus
      ? [
          {
            plan: PLAN.plus,
            source: SUBSCRIPTION_SOURCE.purchase,
            status: SUBSCRIPTION_STATUS.active,
            currentPeriodStart: NOW,
            currentPeriodEnd: NOW,
          },
        ]
      : [],
  );
  const period = { start: '2026-10-01', resetsOn: '2026-11-01' };
  return async () => ({ plan, period, usage: usageOf(null, plan.id, period.resetsOn) });
}

let ids = 0;
const newId = () => `9d0e1f2a-0000-4000-8000-${String(++ids).padStart(12, '0')}`;

describe('createImport', () => {
  test('keeps the rows for review and flags the ones already recorded', async () => {
    const created: Parameters<BankImportRepository['create']>[0][] = [];
    const repository = createBankImportRepositoryMock({
      findRecorded: async (_userId, from, to) => {
        expect([from, to]).toEqual([
          new Date('2026-09-30T17:00:00.000Z'),
          new Date('2026-10-02T17:00:00.000Z'),
        ]);
        return [
          {
            occurredAt: new Date('2026-10-02T03:00:00.000Z'),
            type: TRANSACTION_TYPE.expense,
            amount: 18_000,
          },
        ];
      },
      create: async (input) => void created.push(input),
    });

    const result = await createImport('user-1', IMPORT_BODY, {
      repository,
      planUsage: planUsage(true),
      newId,
    });

    expect(result).toMatchObject({ rowCount: 2, dateFrom: '2026-10-01', dateTo: '2026-10-02' });
    expect(result.rows[0]).toMatchObject({
      amount: 18_000,
      type: TRANSACTION_TYPE.expense,
      isDuplicate: true,
    });
    expect(result.rows[1]).toMatchObject({
      amount: 6_000_000,
      type: TRANSACTION_TYPE.income,
      isDuplicate: false,
    });
    expect(created[0]?.bankImport).toMatchObject({
      id: result.id,
      fileName: 'mutasi-oktober.csv',
      rowCount: 2,
    });
    expect(created[0]?.rows.map((row) => row.rowIndex)).toEqual([0, 1]);
  });

  test('refuses outside Kira Plus and beyond three months', async () => {
    await expect(
      createImport('user-1', IMPORT_BODY, { planUsage: planUsage(false) }),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: 'PLAN_FEATURE_UNAVAILABLE',
    });
    const long = {
      ...IMPORT_BODY,
      rows: [
        ...IMPORT_BODY.rows,
        {
          date: '2026-07-01',
          description: 'GAJI JULI',
          amount: 1,
          category: INCOME_CATEGORY.salary,
        },
      ],
    };
    await expect(
      createImport('user-1', long, { planUsage: planUsage(true) }),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: 'IMPORT_RANGE_TOO_LONG',
    });
  });

  test('reads the real plan, store and ids by default', async () => {
    await expect(createImport('user-1', IMPORT_BODY)).rejects.toMatchObject({ statusCode: 403 });
    const result = await createImport('user-1', IMPORT_BODY, { planUsage: planUsage(true) });
    expect(result.id).toMatch(/^[0-9a-f-]{36}$/);
  });
});
