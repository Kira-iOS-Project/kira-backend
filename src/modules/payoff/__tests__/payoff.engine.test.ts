import { describe, expect, test } from 'bun:test';
import { MAX_PAYOFF_MONTHS, PAYOFF_METHOD } from '../../../lib/constants/payoff.ts';
import { payoffOrder, simulate } from '../payoff.engine.ts';
import { payoffDebt } from './helpers.ts';

const SMALL = payoffDebt({
  id: 'a',
  name: 'Small',
  remaining: 500_000,
  monthlyInstalment: 100_000,
});
const BIG = payoffDebt({
  id: 'b',
  name: 'Big',
  remaining: 2_000_000,
  monthlyInstalment: 200_000,
  annualInterestRate: 36,
});

describe('payoffOrder', () => {
  test('snowball pays the smallest balance first', () => {
    expect(payoffOrder([BIG, SMALL], PAYOFF_METHOD.snowball).map((d) => d.id)).toEqual(['a', 'b']);
  });

  test('avalanche pays the highest rate first', () => {
    expect(payoffOrder([SMALL, BIG], PAYOFF_METHOD.avalanche).map((d) => d.id)).toEqual(['b', 'a']);
  });

  test('a tie breaks on the other measure', () => {
    const cheap = payoffDebt({ id: 'c', remaining: 500_000, annualInterestRate: 10 });
    const dear = payoffDebt({ id: 'd', remaining: 500_000, annualInterestRate: 40 });
    const same = payoffDebt({ id: 'e', remaining: 900_000, annualInterestRate: 40 });
    expect(payoffOrder([cheap, dear], PAYOFF_METHOD.snowball).map((d) => d.id)).toEqual(['d', 'c']);
    expect(payoffOrder([same, dear], PAYOFF_METHOD.avalanche).map((d) => d.id)).toEqual(['d', 'e']);
  });

  test('a full tie falls to the account id, so the order never changes between calls', () => {
    const first = payoffDebt({ id: 'f', remaining: 500_000, annualInterestRate: 20 });
    const second = payoffDebt({ id: 'g', remaining: 500_000, annualInterestRate: 20 });
    for (const method of [PAYOFF_METHOD.snowball, PAYOFF_METHOD.avalanche]) {
      expect(payoffOrder([second, first], method).map((d) => d.id)).toEqual(['f', 'g']);
      expect(payoffOrder([first, second], method).map((d) => d.id)).toEqual(['f', 'g']);
    }
  });

  test('does not reorder the input', () => {
    const input = [BIG, SMALL];
    payoffOrder(input, PAYOFF_METHOD.snowball);
    expect(input.map((d) => d.id)).toEqual(['b', 'a']);
  });
});

describe('simulate', () => {
  test('an empty plan pays nothing and finishes never', () => {
    expect(simulate([], PAYOFF_METHOD.snowball, 0)).toEqual({
      accounts: [],
      totalInterest: null,
      allPaidMonths: null,
    });
  });

  test('without interest, months are the balance over the instalment', () => {
    const result = simulate([SMALL], PAYOFF_METHOD.snowball, 0);
    expect(result.accounts[0]).toMatchObject({ position: 1, months: 5, interest: 0 });
    expect(result.allPaidMonths).toBe(5);
    expect(result.totalInterest).toBe(0);
  });

  test('a freed instalment rolls to the next account', () => {
    const result = simulate(
      [SMALL, { ...BIG, annualInterestRate: null }],
      PAYOFF_METHOD.snowball,
      0,
    );
    /** Budget 300k: Small is gone in month 5, then Big gets all 300k. 2,000k - 5×200k = 1,000k left. */
    expect(result.accounts.map((a) => a.months)).toEqual([5, 9]);
    expect(result.allPaidMonths).toBe(9);
  });

  test('an extra payment shortens the plan', () => {
    const slow = simulate([SMALL], PAYOFF_METHOD.snowball, 0);
    const fast = simulate([SMALL], PAYOFF_METHOD.snowball, 100_000);
    expect(fast.allPaidMonths).toBe(3);
    expect(fast.allPaidMonths).toBeLessThan(slow.allPaidMonths ?? 0);
  });

  test('interest accrues monthly at the yearly rate over twelve', () => {
    const debt = payoffDebt({
      remaining: 1_000_000,
      monthlyInstalment: 1_000_000,
      annualInterestRate: 12,
    });
    /** A last payment equal to the balance settles it this month, with no interest. */
    const result = simulate([debt], PAYOFF_METHOD.avalanche, 0);
    expect(result.accounts[0]).toMatchObject({ months: 1, interest: 0 });
    /** 1,000,000 at 1% a month paid 600,000: 400,000 left + 4,000 interest, paid next month. */
    const two = simulate([{ ...debt, monthlyInstalment: 600_000 }], PAYOFF_METHOD.avalanche, 0);
    expect(two.accounts[0]).toMatchObject({ months: 2, interest: 4_000 });
  });

  test('avalanche costs no more interest than snowball', () => {
    const debts = [SMALL, BIG];
    const snow = simulate(debts, PAYOFF_METHOD.snowball, 0);
    const ava = simulate(debts, PAYOFF_METHOD.avalanche, 0);
    expect(ava.totalInterest ?? Infinity).toBeLessThanOrEqual(snow.totalInterest ?? 0);
  });

  test('an instalment that cannot cover the interest never pays off', () => {
    const debt = payoffDebt({
      remaining: 10_000_000,
      monthlyInstalment: 50_000,
      annualInterestRate: 60,
    });
    const result = simulate([debt], PAYOFF_METHOD.snowball, 0);
    expect(result.accounts[0]).toMatchObject({ months: null, interest: null });
    expect(result).toMatchObject({ totalInterest: null, allPaidMonths: null });
  });

  test('stops at the month ceiling', () => {
    const debt = payoffDebt({ remaining: 1_000_000_000, monthlyInstalment: 1_000_000 });
    expect(simulate([debt], PAYOFF_METHOD.snowball, 0).accounts[0]?.months).toBeNull();
    expect(MAX_PAYOFF_MONTHS).toBe(600);
  });

  test('a zero instalment pays only from the extra payment', () => {
    const debt = payoffDebt({ remaining: 300_000, monthlyInstalment: 0 });
    expect(simulate([debt], PAYOFF_METHOD.snowball, 100_000).accounts[0]?.months).toBe(3);
  });
});
