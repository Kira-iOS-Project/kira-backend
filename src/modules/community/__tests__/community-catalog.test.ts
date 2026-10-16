/**
 * The curated catalog's sync (its lock, what an upsert may overwrite, and the curation team's
 * links) and the community blocks of Unduh Datamu.
 */

import { describe, expect, test } from 'bun:test';
import {
  COMMUNITY_CATALOG_LOCK,
  COMMUNITY_CATEGORY,
  COMMUNITY_REPORT_REASON,
  COMMUNITY_RULES_VERSION,
} from '../../../lib/constants/community.ts';
import { createFakeDb, inOrder } from '../../../test/fake-postgres.ts';
import { CATALOG_GROUPS } from '../community-groups.catalog.ts';
import { CATALOG_PRODUCTS } from '../community-products.catalog.ts';
import {
  type CommunityCatalogRepository,
  createCommunityCatalogRepository,
} from '../community-catalog.repository.ts';
import { communityExportSections, syncCommunityCatalog } from '../community-catalog.service.ts';
import { createCatalogRepositoryMock, NOW, USER_ID } from './helpers.ts';

type Synced = Parameters<CommunityCatalogRepository['syncCatalog']>[0];

function capture() {
  const synced: Synced[] = [];
  const repository = createCatalogRepositoryMock({
    syncCatalog: async (catalog) => void synced.push(catalog),
  });
  return { synced, repository };
}

const [LUNAS, SAHAM, KRIPTO] = CATALOG_GROUPS;
const [COURSE] = CATALOG_PRODUCTS;

describe('syncCommunityCatalog', () => {
  test('writes the boards’ catalog with no links when the team set none', async () => {
    const { synced, repository } = capture();

    const counts = await syncCommunityCatalog({ repository, links: {} });

    expect(counts).toEqual({ categories: 4, groups: 4, products: 4, links: 0 });
    expect(synced[0]?.groups.map((group) => group.name)).toEqual([
      'Lunas Bareng Jakarta',
      'Belajar Saham dari Nol',
      'Kripto Aman 101',
      'Ngobrol Gaji Pertama',
    ]);
    expect(synced[0]?.groups.every((group) => group.inviteUrl === null)).toBe(true);
    expect(synced[0]?.products.every((product) => product.sellerUrl === null)).toBe(true);
  });

  test('takes the team’s links, and drops an invite that leaves its platform', async () => {
    const { synced, repository } = capture();
    const links = {
      [LUNAS?.id ?? '']: 'https://chat.whatsapp.com/RealCodeFromTheTeam',
      [SAHAM?.id ?? '']: 'https://evil.example/join',
      [KRIPTO?.id ?? '']: 'https://discord.com/invite/RealCode',
      [COURSE?.id ?? '']: 'https://seller.example/kelas',
    };

    const counts = await syncCommunityCatalog({ repository, links });

    const groups = synced[0]?.groups ?? [];
    expect(groups.map((group) => group.inviteUrl)).toEqual([
      'https://chat.whatsapp.com/RealCodeFromTheTeam',
      null,
      'https://discord.com/invite/RealCode',
      null,
    ]);
    expect(synced[0]?.products[0]?.sellerUrl).toBe('https://seller.example/kelas');
    expect(counts.links).toBe(3);
  });

  test('reads the links from the environment by default', async () => {
    const { synced, repository } = capture();
    await syncCommunityCatalog({ repository });
    expect(synced[0]?.groups.every((group) => group.inviteUrl === null)).toBe(true);
  });
});

describe('the catalog repository', () => {
  test('syncs under the advisory lock, never overwriting a status or a creation time', async () => {
    const fake = createFakeDb();

    await createCommunityCatalogRepository(fake.db).syncCatalog({
      categories: [{ key: COMMUNITY_CATEGORY.debtFree, label: 'Bebas Hutang', rank: 1 }],
      groups: CATALOG_GROUPS.map((group) => Object.assign({}, group, { inviteUrl: null })),
      products: CATALOG_PRODUCTS.map((product) => Object.assign({}, product, { sellerUrl: null })),
    });

    const [lock, categories, groups, products] = fake.queries;
    expect(lock?.sql).toContain('pg_advisory_xact_lock');
    expect(lock?.params).toContain(COMMUNITY_CATALOG_LOCK);
    expect(categories?.sql).toContain('on conflict ("key") do update set "label" = excluded.label');
    for (const upsert of [groups, products]) {
      const set = upsert?.sql.split('do update set')[1] ?? '';
      expect(set).toContain('"updated_at" = now()');
      expect(set).not.toContain('"status"');
      expect(set).not.toContain('"created_at"');
      expect(set).not.toContain('"suspended_at"');
    }
    expect(groups?.sql).toContain('"invite_url" = excluded.invite_url');
    expect(products?.sql).toContain('"seller_url" = excluded.seller_url');
  });

  test('reads the person’s consents, joins and reports for the export', async () => {
    const fake = createFakeDb(
      inOrder(
        [{ version: COMMUNITY_RULES_VERSION, acceptedAt: NOW.toISOString() }],
        [{ groupName: 'Lunas Bareng Jakarta', openedAt: NOW.toISOString() }],
        [],
      ),
    );

    const rows = await createCommunityCatalogRepository(fake.db).listExportRows(USER_ID);

    expect(rows.consents).toEqual([{ version: COMMUNITY_RULES_VERSION, acceptedAt: NOW }]);
    expect(rows.joins).toEqual([{ groupName: 'Lunas Bareng Jakarta', openedAt: NOW }]);
    expect(rows.reports).toEqual([]);
    expect(fake.queries.every((query) => query.params.includes(USER_ID))).toBe(true);
  });
});

describe('communityExportSections', () => {
  test('words each block for people', async () => {
    const repository = createCatalogRepositoryMock({
      listExportRows: async () => ({
        consents: [{ version: COMMUNITY_RULES_VERSION, acceptedAt: NOW }],
        joins: [{ groupName: 'Lunas Bareng Jakarta', openedAt: NOW }],
        reports: [
          {
            groupName: 'Kripto Aman 101',
            reason: COMMUNITY_REPORT_REASON.scam,
            story: null,
            createdAt: NOW,
          },
          {
            groupName: 'Kripto Aman 101',
            reason: COMMUNITY_REPORT_REASON.other,
            story: 'Spam',
            createdAt: NOW,
          },
        ],
      }),
    });

    const sections = await communityExportSections(USER_ID, { repository });

    expect(sections).toEqual([
      {
        title: 'Komunitas · Aturan yang Disetujui',
        header: ['Tanggal', 'Versi Aturan'],
        rows: [['2026-10-17', COMMUNITY_RULES_VERSION]],
      },
      {
        title: 'Komunitas · Grup yang Dibuka',
        header: ['Tanggal', 'Grup'],
        rows: [['2026-10-17', 'Lunas Bareng Jakarta']],
      },
      {
        title: 'Komunitas · Laporan Grup',
        header: ['Tanggal', 'Grup', 'Alasan', 'Cerita'],
        rows: [
          ['2026-10-17', 'Kripto Aman 101', 'Penipuan atau Minta Transfer', ''],
          ['2026-10-17', 'Kripto Aman 101', 'Lainnya', 'Spam'],
        ],
      },
    ]);
  });

  test('has no block for a person with no community rows, from the default repository', async () => {
    expect(await communityExportSections(USER_ID)).toEqual([]);
  });
});
