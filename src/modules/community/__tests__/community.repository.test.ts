/**
 * The community repository over the fake Postgres: the SQL each question builds (curation order,
 * never members; a limit on every list; the report's row lock and its count of distinct people),
 * and a burst of parallel reports decided one at a time.
 */

import { describe, expect, test } from 'bun:test';
import {
  COMMUNITY_CATEGORY,
  COMMUNITY_LISTING_STATUS,
  COMMUNITY_LIST_LIMIT,
  COMMUNITY_PRODUCT_KIND,
  COMMUNITY_REPORT_REASON,
  COMMUNITY_RULES_VERSION,
  COMMUNITY_SUSPENSION_REPORTERS,
} from '../../../lib/constants/community.ts';
import {
  createFakeDb,
  inOrder,
  type FakeQuery,
  type FakeRow,
} from '../../../test/fake-postgres.ts';
import { createCommunityRepository } from '../community.repository.ts';
import { GROUP_ID, groupRow, NOW, PRODUCT_ID, productRow, USER_ID } from './helpers.ts';

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

describe('community repository reads', () => {
  test('lists categories by rank and active groups by curation rank, never by members', async () => {
    const fake = createFakeDb(
      inOrder([{ key: COMMUNITY_CATEGORY.stocks, label: 'Saham' }], [groupRow()]),
    );
    const repository = createCommunityRepository(fake.db);

    const categories = await repository.listCategories();
    const groups = await repository.listActiveGroups(COMMUNITY_CATEGORY.stocks);

    expect(categories).toEqual([{ key: COMMUNITY_CATEGORY.stocks, label: 'Saham' }]);
    expect(groups).toEqual([groupRow()]);
    const [categorySql, groupSql] = sqlOf(fake.queries);
    expect(categorySql).toContain('order by "community_categories"."rank"');
    expect(groupSql).toContain('order by "community_groups"."curation_rank" asc');
    expect(groupSql).not.toContain('member_count" desc');
    expect(fake.queries[1]?.params).toEqual([
      COMMUNITY_LISTING_STATUS.active,
      COMMUNITY_CATEGORY.stocks,
      COMMUNITY_LIST_LIMIT,
    ]);
  });

  test('lists every active group without a category', async () => {
    const fake = createFakeDb();
    await createCommunityRepository(fake.db).listActiveGroups(undefined);
    expect(fake.queries[0]?.params).toEqual([
      COMMUNITY_LISTING_STATUS.active,
      COMMUNITY_LIST_LIMIT,
    ]);
  });

  test('finds an active group, or none', async () => {
    const fake = createFakeDb(inOrder([groupRow()], []));
    const repository = createCommunityRepository(fake.db);

    expect(await repository.findActiveGroup(GROUP_ID)).toEqual(groupRow());
    expect(await repository.findActiveGroup(GROUP_ID)).toBeNull();
    expect(fake.queries[0]?.params).toEqual([GROUP_ID, COMMUNITY_LISTING_STATUS.active, 1]);
  });

  test('reads and stores the rules consent per version, once', async () => {
    const fake = createFakeDb(inOrder([{ version: COMMUNITY_RULES_VERSION }], []));
    const repository = createCommunityRepository(fake.db);

    expect(await repository.hasAcceptedRules(USER_ID, COMMUNITY_RULES_VERSION)).toBe(true);
    expect(await repository.hasAcceptedRules(USER_ID, COMMUNITY_RULES_VERSION)).toBe(false);
    await repository.acceptRules(USER_ID, COMMUNITY_RULES_VERSION);
    await repository.recordJoin(USER_ID, GROUP_ID);

    const [, , consent, join] = sqlOf(fake.queries);
    expect(consent).toContain('insert into "community_rules_consents"');
    expect(consent).toContain('on conflict do nothing');
    expect(join).toContain('insert into "community_group_joins"');
  });

  test('lists active products by curation rank, filtered by kind, and finds one', async () => {
    const fake = createFakeDb(inOrder([productRow()], [], [productRow()], []));
    const repository = createCommunityRepository(fake.db);

    expect(await repository.listActiveProducts(COMMUNITY_PRODUCT_KIND.ebook)).toEqual([
      productRow(),
    ]);
    await repository.listActiveProducts(undefined);
    expect(await repository.findActiveProduct(PRODUCT_ID)).toEqual(productRow());
    expect(await repository.findActiveProduct(PRODUCT_ID)).toBeNull();

    expect(fake.queries[0]?.sql).toContain('order by "community_products"."curation_rank" asc');
    expect(fake.queries[0]?.params).toContain(COMMUNITY_PRODUCT_KIND.ebook);
    expect(fake.queries[1]?.params).toEqual([
      COMMUNITY_LISTING_STATUS.active,
      COMMUNITY_LIST_LIMIT,
    ]);
  });
});

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
    expect(fake.queries[3]?.params).toContain(NOW.toISOString());
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
        return state.reports.includes(String(params[1])) ? [{ id: 'open' }] : [];
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
