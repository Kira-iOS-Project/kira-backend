import { describe, expect, test } from 'bun:test';
import { PLAN, SUBSCRIPTION_SOURCE, SUBSCRIPTION_STATUS } from '../../constants/plans.ts';
import { usageSchema } from '../usage.schema.ts';
import {
  activePlanOf,
  type PlanSubscription,
  quotaPeriod,
  quotaPeriodStart,
  usageOf,
} from '../plan-usage.ts';

function subscription(overrides: Partial<PlanSubscription> = {}): PlanSubscription {
  return {
    plan: PLAN.plus,
    source: SUBSCRIPTION_SOURCE.purchase,
    status: SUBSCRIPTION_STATUS.active,
    /** 31 January 2026, 00.00 WIB. */
    currentPeriodStart: new Date('2026-01-30T17:00:00Z'),
    currentPeriodEnd: new Date('2026-11-14T17:00:00Z'),
    ...overrides,
  };
}

describe('activePlanOf', () => {
  test('is Kira Gratis without an active subscription', () => {
    expect(activePlanOf([subscription({ status: SUBSCRIPTION_STATUS.ended })])).toEqual({
      id: PLAN.free,
      source: null,
      renewsOn: null,
      subscription: null,
    });
  });

  test('is the active subscription, renewing on its WIB end date', () => {
    const active = subscription({ source: SUBSCRIPTION_SOURCE.scholarship });
    expect(activePlanOf([subscription({ status: SUBSCRIPTION_STATUS.ended }), active])).toEqual({
      id: PLAN.plus,
      source: SUBSCRIPTION_SOURCE.scholarship,
      renewsOn: '2026-11-15',
      subscription: active,
    });
  });
});

describe('quotaPeriod', () => {
  test('is the calendar month on Kira Gratis, refilling on the 1st', () => {
    expect(quotaPeriod(null, '2026-10-16')).toEqual({
      start: '2026-10-01',
      resetsOn: '2026-11-01',
    });
    expect(quotaPeriodStart(null, '2026-12-31')).toBe('2026-12-01');
  });

  test('runs from the monthly anniversary of a paid plan, short months on their last day', () => {
    const plan = subscription();
    expect(quotaPeriod(plan, '2026-02-28')).toEqual({
      start: '2026-02-28',
      resetsOn: '2026-03-31',
    });
    expect(quotaPeriod(plan, '2026-03-30')).toEqual({
      start: '2026-02-28',
      resetsOn: '2026-03-31',
    });
    expect(quotaPeriod(plan, '2026-10-31')).toEqual({
      start: '2026-10-31',
      resetsOn: '2026-11-30',
    });
    expect(quotaPeriodStart(plan, '2026-01-31')).toBe('2026-01-31');
  });

  test('refills a yearly plan every month, and starts at the anchor before it begins', () => {
    const yearly = subscription({ currentPeriodStart: new Date('2026-10-11T17:00:00Z') });
    expect(quotaPeriod(yearly, '2027-03-20')).toEqual({
      start: '2027-03-12',
      resetsOn: '2027-04-12',
    });
    expect(quotaPeriod(yearly, '2026-10-01')).toEqual({
      start: '2026-10-12',
      resetsOn: '2026-11-12',
    });
  });
});

describe('usageOf', () => {
  test('reads the counters against the plan terms', () => {
    const usage = usageOf(
      { aiMessages: 12, receipts: 4, voiceSeconds: 0 },
      PLAN.free,
      '2026-11-01',
    );
    expect(usage).toEqual({
      aiMessages: { used: 12, limit: 30 },
      receipts: { used: 4, limit: 10 },
      voiceSeconds: { used: 0, limit: 0 },
      resetsOn: '2026-11-01',
    });
    expect(usageSchema.parse(usage)).toEqual(usage);
  });

  test('counts nothing used before the first counter row', () => {
    expect(usageOf(null, PLAN.plus, '2026-11-15').voiceSeconds).toEqual({ used: 0, limit: 10_800 });
  });
});
