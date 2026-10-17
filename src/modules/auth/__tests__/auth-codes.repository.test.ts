import { describe, expect, test } from 'bun:test';
import { createFakeDb, inOrder } from '../../../test/fake-postgres.ts';
import { createAuthRepository } from '../auth.repository.ts';
import { NOW } from './helpers.ts';

const allow = () => null;

describe('issueCode', () => {
  const input = {
    email: 'dinda@email.com',
    ip: '1.2.3.4',
    codeHash: 'h'.repeat(64),
    expiresAt: NOW,
    now: NOW,
    since: NOW,
  };

  test('locks the address and the network, counts, retires older codes and stores the new one', async () => {
    const fake = createFakeDb(
      inOrder([], [], [{ createdAt: NOW.toISOString() }], [{ count: 2 }], [{ count: 7 }]),
    );
    const seen: unknown[] = [];

    const refusal = await createAuthRepository(fake.db).issueCode(input, (usage) => {
      seen.push(usage);
      return null;
    });

    expect(refusal).toBeNull();
    expect(seen).toEqual([{ latestAt: NOW, emailCount: 2, ipCount: 7 }]);
    const sql = fake.queries.map((query) => query.sql);
    expect(sql[0]).toContain('pg_advisory_xact_lock');
    expect(fake.queries[0]?.params).toEqual(['auth:email:dinda@email.com']);
    expect(fake.queries[1]?.params).toEqual(['auth:ip:1.2.3.4']);
    expect(sql.slice(-2).map((text) => text.split(' ')[0])).toEqual(['update', 'insert']);
  });

  test('stores nothing when the decision refuses', async () => {
    const fake = createFakeDb();
    const refusal = await createAuthRepository(fake.db).issueCode(input, () => 'resend cooldown');

    expect(refusal).toBe('resend cooldown');
    expect(fake.queries.some((query) => query.sql.startsWith('insert'))).toBe(false);
  });
});

describe('recordCheck', () => {
  const input = { email: 'dinda@email.com', ip: '1.2.3.4', since: NOW };

  test('counts the checks under both locks and records this one', async () => {
    const fake = createFakeDb(inOrder([], [], [{ count: 3 }], [{ count: 40 }]));
    const seen: unknown[] = [];

    expect(
      await createAuthRepository(fake.db).recordCheck(input, (usage) => {
        seen.push(usage);
        return null;
      }),
    ).toBeNull();
    expect(seen).toEqual([{ emailCount: 3, ipCount: 40 }]);
    expect(fake.queries.at(-1)?.sql).toStartWith('insert into "sign_in_attempts"');
  });

  test('records nothing when refused, and reads an empty window as zero', async () => {
    const fake = createFakeDb();
    const seen: unknown[] = [];
    const refusal = await createAuthRepository(fake.db).recordCheck(input, (usage) => {
      seen.push(usage);
      return 'address check limit';
    });

    expect(refusal).toBe('address check limit');
    expect(seen).toEqual([{ emailCount: 0, ipCount: 0 }]);
    expect(fake.queries.some((query) => query.sql.startsWith('insert'))).toBe(false);
    expect(
      await createAuthRepository(createFakeDb().db).issueCode(
        { ...input, codeHash: 'h', expiresAt: NOW, now: NOW },
        allow,
      ),
    ).toBeNull();
  });
});

describe('findActiveCode and claimAttempt', () => {
  test('finds the latest unused code, or null', async () => {
    const row = { id: 'code-1', codeHash: 'h', attempts: 2, expiresAt: NOW.toISOString() };
    const fake = createFakeDb(inOrder([row], []));
    const repository = createAuthRepository(fake.db);

    expect(await repository.findActiveCode('dinda@email.com')).toEqual({ ...row, expiresAt: NOW });
    expect(await repository.findActiveCode('dinda@email.com')).toBeNull();
  });

  test('claims a try only while the code is live and has tries left', async () => {
    const fake = createFakeDb(inOrder([{ codeHash: 'h', attempts: 3 }], []));
    const repository = createAuthRepository(fake.db);

    expect(await repository.claimAttempt('code-1', NOW, 5)).toEqual({ codeHash: 'h', attempts: 3 });
    expect(await repository.claimAttempt('code-1', NOW, 5)).toBeNull();
    const sql = fake.queries[0]?.sql ?? '';
    expect(sql).toContain('"attempts" = "auth_codes"."attempts" + 1');
    expect(sql).toContain('"auth_codes"."attempts" < $');
    expect(sql).toContain('"consumed_at" is null');
    expect(sql).toContain('"expires_at" > $');
  });
});
