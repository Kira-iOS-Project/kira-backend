/**
 * The shared Postgres double's answers for the payoff routes: Dinda, her accounts and her plan, in
 * the column order each query selects them.
 */

import {
  DEBT_KIND,
  DEBT_PAYMENT_STATUS,
  FOCUS,
  MARITAL_STATUS,
} from '../../../lib/constants/profile.ts';
import type { FakeQuery, FakeRow } from '../../../test/fake-postgres.ts';
import { AUTH_HEADER } from '../../../test/session.ts';
import { app } from '../../../app.ts';
import { DINDA_OPEN, ID_A, PAYOFF_PLAN, PLAN_DEBTS } from './helpers.ts';

/** Dinda: 7,5 juta income and 5,66 juta spent, so 1,84 juta is left whatever day the suite runs. */
export function dinda(query: FakeQuery): FakeRow[] {
  if (query.sql.includes('"display_name"')) {
    return [
      {
        displayName: 'Dinda',
        hideBalances: false,
        focus: FOCUS.trackSpending,
        paydayDay: 25,
        paydayEndOfMonth: false,
        completedAt: new Date().toISOString(),
        income: 7_500_000,
        essential: 4_200_000,
        emergencyFund: 4_800_000,
      },
    ];
  }
  if (query.sql.includes('from "transactions"')) {
    return [{ income: 0, expense: 5_660_000, count: 12 }];
  }
  if (query.sql.includes('from "debt_accounts"')) return DINDA_OPEN;
  if (query.sql.startsWith('insert into "transactions"')) return [{ id: 'transaction-1' }];
  return [];
}

const PLAN_ROW = {
  id: PAYOFF_PLAN.id,
  method: PAYOFF_PLAN.method,
  extraPayment: PAYOFF_PLAN.extraPayment,
  focusDebtId: PAYOFF_PLAN.focusDebtId,
  createdAt: PAYOFF_PLAN.createdAt.toISOString(),
};

/** The account rows in the column order Rencanaku selects them. */
export const PLAN_DEBT_ROWS = PLAN_DEBTS.map((d) => ({
  id: d.id,
  kind: d.kind,
  name: d.name,
  remaining: d.remaining,
  original: d.original,
  monthlyInstalment: d.monthlyInstalment,
  annualInterestRate: d.annualInterestRate === null ? null : String(d.annualInterestRate),
  dueDay: d.dueDay,
  paymentStatus: d.paymentStatus,
}));

/** Dinda with an active plan; the score module's own reads are answered too. */
export function planned(query: FakeQuery): FakeRow[] {
  if (query.sql.includes('from "payoff_plans"')) return [PLAN_ROW];
  if (query.sql.startsWith('insert into "payoff_plans"')) return [PLAN_ROW];
  if (query.sql.startsWith('insert into "transactions"')) return [{ id: 'transaction-1' }];
  if (query.sql.startsWith('insert into "debt_payments"')) return [{ id: 'payment-1' }];
  /** No account paid off since the plan began, unless a test says so. */
  if (query.sql.includes('"paid_off_at" >=')) return [];
  if (query.sql.includes('from "debt_accounts"') && query.sql.includes('"original_amount"')) {
    return PLAN_DEBT_ROWS;
  }
  if (query.sql.startsWith('update "debt_accounts"')) return [{ id: ID_A }];
  if (query.sql.includes('left join "financial_profiles"')) {
    return [
      {
        focus: FOCUS.trackSpending,
        paydayDay: 25,
        paydayEndOfMonth: false,
        completedAt: new Date().toISOString(),
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
  if (query.sql.includes('from "debt_accounts"')) {
    return [
      {
        kind: DEBT_KIND.paylater,
        name: 'Paylater B',
        remaining: 890_000,
        monthlyInstalment: 290_000,
        paymentStatus: DEBT_PAYMENT_STATUS.onTime,
      },
    ];
  }
  return dinda(query);
}

export function call(method: string, path: string, body?: unknown) {
  return app.request(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
