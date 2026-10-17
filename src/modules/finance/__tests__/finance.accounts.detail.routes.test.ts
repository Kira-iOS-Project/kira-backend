import { beforeEach, describe, expect, test } from 'bun:test';
import {
  DEBT_KIND,
  DEBT_PAYMENT_STATUS,
  FOCUS,
  MARITAL_STATUS,
} from '../../../lib/constants/profile.ts';
import { debtDetailSchema } from '../finance.accounts.schema.ts';
import { app } from '../../../app.ts';
import { dbControl, resetExternalMocks } from '../../../test/preload.ts';
import { signedIn } from '../../../test/session.ts';

beforeEach(() => resetExternalMocks());

describe('GET /api/debts/{id}', () => {
  test('returns an owner-scoped schedule, payment history and simulated score', async () => {
    const debtId = '00000000-0000-4000-8000-000000000005';
    dbControl.respond = signedIn((query) => {
      if (query.sql.includes('from "debt_accounts"')) {
        return [
          {
            id: debtId,
            name: 'Paylater A',
            kind: DEBT_KIND.paylater,
            originalAmount: 1_000_000,
            remainingAmount: 800_000,
            monthlyInstallment: 100_000,
            remainingTenorMonths: 7,
            dueDay: 20,
            paymentStatus: DEBT_PAYMENT_STATUS.onTime,
            createdAt: new Date('2026-08-10T00:00:00.000Z'),
            remaining: 800_000,
            monthlyInstalment: 100_000,
          },
        ];
      }
      if (query.sql.includes('from "debt_payments"')) {
        return [
          {
            id: '00000000-0000-4000-8000-000000000006',
            amount: 100_000,
            paidAt: new Date('2026-08-18T00:00:00.000Z'),
          },
          {
            id: '00000000-0000-4000-8000-000000000007',
            amount: 100_000,
            paidAt: new Date('2026-09-21T00:00:00.000Z'),
          },
        ];
      }
      if (query.sql.includes('left join "financial_profiles"')) {
        return [
          {
            focus: FOCUS.trackSpending,
            paydayDay: 25,
            paydayEndOfMonth: false,
            completedAt: '2026-08-10T00:00:00.000Z',
            income: 7_500_000,
            essential: 4_200_000,
            emergencyFund: 4_800_000,
            monthlySavings: 600_000,
            otherAssets: 2_900_000,
            propertyAssets: 37_000_000,
            dependents: 0,
            maritalStatus: MARITAL_STATUS.single,
            protections: '{bpjs_health,bpjs_employment}',
          },
        ];
      }
      return [];
    });

    const response = await app.request(`/api/debts/${debtId}`, {
      headers: { Authorization: 'Bearer test-access-token' },
    });
    expect(response.status).toBe(200);
    const body = debtDetailSchema.parse(await response.json());
    expect(body).toMatchObject({
      id: debtId,
      scoreEstimate: { isSimulated: true },
      nextStep: expect.any(String),
    });
    expect(
      (body.installmentSchedule as { dueDate: string; status: string }[])
        .slice(0, 3)
        .map(({ dueDate, status }) => ({ dueDate, status })),
    ).toEqual([
      { dueDate: '2026-08-20', status: 'paid' },
      { dueDate: '2026-09-20', status: 'paid' },
      { dueDate: '2026-10-20', status: 'dueSoon' },
    ]);
    expect((body.paymentHistory as { onTime: boolean }[]).map(({ onTime }) => onTime)).toEqual([
      true,
      false,
    ]);
    expect((await app.request(`/api/debts/${debtId}`)).status).toBe(401);
  });
});
