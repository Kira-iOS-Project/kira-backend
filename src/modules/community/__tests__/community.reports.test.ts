/**
 * Filing a report over the fake Postgres: the group's row lock, the duplicate check, the count of
 * distinct people with an open report in the window, the take-down at the threshold, and a burst
 * of parallel reports decided one at a time.
 */

import { describe, expect, test } from 'bun:test';
import {
  COMMUNITY_LISTING_STATUS,
  COMMUNITY_REPORT_REASON,
  COMMUNITY_REPORT_STATUS,
  COMMUNITY_SUSPENSION_REPORTERS,
} from '../../../lib/constants/community.ts';
import {
  createFakeDb,
  inOrder,
  type FakeQuery,
  type FakeRow,
} from '../../../test/fake-postgres.ts';
import { createCommunityRepository } from '../community.repository.ts';
import { GROUP_ID, NOW, USER_ID } from './helpers.ts';

const REPORT = {
  userId: USER_ID,
  groupId: GROUP_ID,
  reason: COMMUNITY_REPORT_REASON.scam,
  story: null,
  since: NOW,
  threshold: COMMUNITY_SUSPENSION_REPORTERS,
};

function sqlOf(queries: FakeQuery[]) {
  return queries.map((query) => query.sql);
}

describe('fileReport', () => {
  test('locks the group, files the report, and counts distinct people since the window', async () => {
    const fake = createFakeDb(
      inOrder(
        [{ status: COMMUNITY_LISTING_STATUS.active }],
        [],
        [{ id: 'report-1' }],
        [{ reporters: 4 }],
      ),
    );

    const outcome = await createCommunityRepository(fake.db).fileReport(REPORT);

    expect(outcome).toEqual({ kind: 'filed', id: 'report-1', suspended: false });
    const [lock, open, insert, count] = sqlOf(fake.queries);
    expect(lock).toContain('for update');
    expect(open).toContain('"community_reports"."status" = $');
    expect(insert).toContain('insert into "community_reports"');
    expect(count).toContain('count(distinct "user_id")');
    expect(count).toContain('"community_reports"."status" = $');
    expect(fake.queries[3]?.params).toEqual([
      GROUP_ID,
      NOW.toISOString(),
      COMMUNITY_REPORT_STATUS.open,
    ]);
    expect(fake.queries).toHaveLength(4);
  });

  test('takes the group down at the threshold of distinct people', async () => {
    const fake = createFakeDb(
      inOrder(
        [{ status: COMMUNITY_LISTING_STATUS.active }],
        [],
        [{ id: 'report-5' }],
        [{ reporters: 5 }],
      ),
    );

    const outcome = await createCommunityRepository(fake.db).fileReport(REPORT);

    expect(outcome).toEqual({ kind: 'filed', id: 'report-5', suspended: true });
    expect(fake.queries[4]?.sql).toContain('update "community_groups" set "status" = $1');
    expect(fake.queries[4]?.params).toContain(COMMUNITY_LISTING_STATUS.suspended);
  });

  test('a group the team restored is not taken down again by one new report', async () => {
    /** Four people reported within the window; the team reviewed their reports and restored it. */
    const reviewed = ['p1', 'p2', 'p3', 'p4'];
    const fake = createFakeDb(({ sql, params }) => {
      if (sql.includes('for update')) return [{ status: COMMUNITY_LISTING_STATUS.active }];
      if (sql.startsWith('insert into "community_reports"')) return [{ id: 'report-5' }];
      if (!sql.includes('count(distinct')) return [];
      const openOnly = params.includes(COMMUNITY_REPORT_STATUS.open);
      return [{ reporters: openOnly ? 1 : reviewed.length + 1 }];
    });

    const outcome = await createCommunityRepository(fake.db).fileReport({
      ...REPORT,
      userId: 'p5',
    });

    expect(outcome).toEqual({ kind: 'filed', id: 'report-5', suspended: false });
    expect(sqlOf(fake.queries).some((sql) => sql.startsWith('update "community_groups"'))).toBe(
      false,
    );
  });

  test('refuses a second open report and a missing or suspended group', async () => {
    const duplicate = createFakeDb(
      inOrder([{ status: COMMUNITY_LISTING_STATUS.active }], [{ id: 'r' }]),
    );
    const suspended = createFakeDb(inOrder([{ status: COMMUNITY_LISTING_STATUS.suspended }]));
    const missing = createFakeDb();

    expect(await createCommunityRepository(duplicate.db).fileReport(REPORT)).toEqual({
      kind: 'duplicate',
    });
    expect(await createCommunityRepository(suspended.db).fileReport(REPORT)).toEqual({
      kind: 'missing',
    });
    expect(await createCommunityRepository(missing.db).fileReport(REPORT)).toEqual({
      kind: 'missing',
    });
    expect(duplicate.queries).toHaveLength(2);
  });

  test('a burst of reports counts each person once and takes the group down once', async () => {
    const state = {
      status: COMMUNITY_LISTING_STATUS.active as string,
      reports: [] as string[],
      downs: 0,
    };
    const respond = ({ sql, params }: FakeQuery): FakeRow[] => {
      if (sql.includes('for update')) return [{ status: state.status }];
      if (sql.startsWith('select "id" from "community_reports"')) {
        return state.reports.includes(String(params[1])) ? [{ id: 'report-open' }] : [];
      }
      if (sql.startsWith('insert into "community_reports"')) {
        state.reports.push(String(params[1]));
        return [{ id: `report-${state.reports.length}` }];
      }
      if (sql.includes('count(distinct')) return [{ reporters: new Set(state.reports).size }];
      if (sql.startsWith('update "community_groups"')) {
        state.status = COMMUNITY_LISTING_STATUS.suspended;
        state.downs += 1;
      }
      return [];
    };
    const repository = createCommunityRepository(
      createFakeDb(respond, { serialTransactions: true }).db,
    );
    const people = ['p1', 'p2', 'p3', 'p4', 'p1', 'p2', 'p5', 'p6'];

    const outcomes = await Promise.all(
      people.map((userId) => repository.fileReport({ ...REPORT, userId })),
    );

    expect(outcomes.map((outcome) => outcome.kind)).toEqual([
      'filed',
      'filed',
      'filed',
      'filed',
      'duplicate',
      'duplicate',
      'filed',
      'missing',
    ]);
    expect(new Set(state.reports).size).toBe(COMMUNITY_SUSPENSION_REPORTERS);
    expect(state.downs).toBe(1);
  });
});
