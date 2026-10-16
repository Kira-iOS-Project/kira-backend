import { describe, expect, test } from 'bun:test';
import { CONSENT_PURPOSE, PRIVACY_POLICY_VERSION } from '../../../lib/constants/consents.ts';
import { EXPENSE_CATEGORY, TRANSACTION_TYPE } from '../../../lib/constants/money.ts';
import { PLAN, SUBSCRIPTION_SOURCE, SUBSCRIPTION_STATUS } from '../../../lib/constants/plans.ts';
import { FOCUS } from '../../../lib/constants/profile.ts';
import { createFakeDb, inOrder } from '../../../test/fake-postgres.ts';
import { createAccountRepository, EXPORT_ROW_LIMIT } from '../account.repository.ts';
import { createProfile, NOW, USER_ID } from './helpers.ts';

describe('createAccountRepository: the profile', () => {
  test('finds the profile, or null', async () => {
    const row = createProfile({ consentedAt: null });
    const fake = createFakeDb(inOrder([row], []));
    const repository = createAccountRepository(fake.db);

    expect(await repository.findProfile(USER_ID)).toEqual(row);
    expect(await repository.findProfile(USER_ID)).toBeNull();
    expect(fake.queries[0]?.sql).toContain('from "users" where "users"."id" = $1 limit $2');
  });

  test('updates only when there is something to change', async () => {
    const fake = createFakeDb();
    const repository = createAccountRepository(fake.db);

    await repository.updateProfile(USER_ID, {});
    await repository.updateProfile(USER_ID, { focus: FOCUS.debtFree });

    expect(fake.queries).toHaveLength(1);
    expect(fake.queries[0]?.sql).toStartWith('update "users" set "focus" = $1');
  });
});

describe('createAccountRepository: plan and usage', () => {
  test('lists the active subscription', async () => {
    const row = {
      plan: PLAN.young,
      source: SUBSCRIPTION_SOURCE.purchase,
      status: SUBSCRIPTION_STATUS.active,
      currentPeriodStart: NOW.toISOString(),
      currentPeriodEnd: NOW.toISOString(),
    };
    const fake = createFakeDb(inOrder([row]));

    const rows = await createAccountRepository(fake.db).findActiveSubscriptions(USER_ID);

    expect(rows).toEqual([{ ...row, currentPeriodStart: NOW, currentPeriodEnd: NOW }]);
    expect(fake.queries[0]?.params).toEqual([USER_ID, SUBSCRIPTION_STATUS.active, 1]);
  });

  test('reads the counters of a period, or null', async () => {
    const counters = { aiMessages: 4, receipts: 1, voiceSeconds: 0 };
    const fake = createFakeDb(inOrder([counters], []));
    const repository = createAccountRepository(fake.db);

    expect(await repository.findUsage(USER_ID, '2026-10-01')).toEqual(counters);
    expect(await repository.findUsage(USER_ID, '2026-10-01')).toBeNull();
    expect(fake.queries[0]?.params).toEqual([USER_ID, '2026-10-01', 1]);
  });
});

describe('createAccountRepository: what Profil counts', () => {
  test('reads the latest decision per purpose', async () => {
    const row = {
      purpose: CONSENT_PURPOSE.aiProcessing,
      granted: true,
      decidedAt: NOW.toISOString(),
    };
    const fake = createFakeDb(inOrder([row]));

    expect(await createAccountRepository(fake.db).latestConsents(USER_ID)).toEqual([
      { ...row, decidedAt: NOW },
    ]);
    expect(fake.queries[0]?.sql).toContain('select distinct on ("consents"."purpose")');
    expect(fake.queries[0]?.sql).toContain('"consents"."decided_at" desc');
  });

  test('knows whether the health check was answered', async () => {
    const fake = createFakeDb(inOrder([{ userId: USER_ID }], []));
    const repository = createAccountRepository(fake.db);

    expect(await repository.hasHealthCheck(USER_ID)).toBe(true);
    expect(await repository.hasHealthCheck(USER_ID)).toBe(false);
  });

  test('reads the category of the latest transaction of a type, or null', async () => {
    const fake = createFakeDb(inOrder([{ category: EXPENSE_CATEGORY.food }], []));
    const repository = createAccountRepository(fake.db);

    expect(await repository.lastCategory(USER_ID, TRANSACTION_TYPE.expense)).toBe(
      EXPENSE_CATEGORY.food,
    );
    expect(await repository.lastCategory(USER_ID, TRANSACTION_TYPE.income)).toBeNull();
    expect(fake.queries[1]?.params).toEqual([USER_ID, TRANSACTION_TYPE.income, 1]);
  });

  test('counts the debts not paid off', async () => {
    const fake = createFakeDb(inOrder([{ count: 3 }], []));
    const repository = createAccountRepository(fake.db);

    expect(await repository.countOpenDebts(USER_ID)).toBe(3);
    expect(await repository.countOpenDebts(USER_ID)).toBe(0);
    expect(fake.queries[0]?.sql).toContain('"debt_accounts"."paid_off_at" is null');
  });
});

describe('createAccountRepository: consents, export and deletion', () => {
  const decisions = [
    { purpose: CONSENT_PURPOSE.aiProcessing, granted: true },
    { purpose: CONSENT_PURPOSE.weeklySummary, granted: false },
  ];

  test('the first decision also records the core purpose and marks the account consented', async () => {
    const fake = createFakeDb(inOrder([{ id: USER_ID }]));

    await createAccountRepository(fake.db).recordConsents(USER_ID, decisions, NOW);

    expect(fake.queries[0]?.sql).toContain('"users"."consented_at" is null');
    expect(fake.queries[1]?.sql).toStartWith('insert into "consents"');
    expect(fake.queries[1]?.params).toContain(CONSENT_PURPOSE.core);
    expect(fake.queries[1]?.params).toContain(PRIVACY_POLICY_VERSION);
  });

  test('a later decision appends only the toggles', async () => {
    const fake = createFakeDb();

    await createAccountRepository(fake.db).recordConsents(USER_ID, decisions, NOW);

    expect(fake.queries[1]?.params).not.toContain(CONSENT_PURPOSE.core);
  });

  test('lists the export rows oldest first, bounded', async () => {
    const fake = createFakeDb();

    expect(await createAccountRepository(fake.db).listExportRows(USER_ID)).toEqual([]);
    expect(fake.queries[0]?.sql).toContain('order by "transactions"."occurred_at" asc');
    expect(fake.queries[0]?.params).toEqual([USER_ID, EXPORT_ROW_LIMIT]);
  });

  test('deletes the account row', async () => {
    const fake = createFakeDb();

    await createAccountRepository(fake.db).deleteUser(USER_ID);

    expect(fake.queries[0]).toEqual({
      sql: 'delete from "users" where "users"."id" = $1',
      params: [USER_ID],
    });
  });
});
