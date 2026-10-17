/**
 * The community repository's reads and consents over the fake Postgres: the SQL each question
 * builds (curation order, never members; a limit on every list). Filing a report is in
 * community.reports.test.ts.
 */

import { describe, expect, test } from 'bun:test';
import {
  COMMUNITY_CATEGORY,
  COMMUNITY_LISTING_STATUS,
  COMMUNITY_LIST_LIMIT,
  COMMUNITY_PRODUCT_KIND,
  COMMUNITY_RULES_VERSION,
} from '../../../lib/constants/community.ts';
import { createFakeDb, inOrder, type FakeQuery } from '../../../test/fake-postgres.ts';
import { createCommunityRepository } from '../community.repository.ts';
import { GROUP_ID, groupRow, PRODUCT_ID, productRow, USER_ID } from './helpers.ts';

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
