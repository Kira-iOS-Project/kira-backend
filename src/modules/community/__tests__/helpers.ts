/**
 * Mock builders for the community module's injected dependencies (AGENTS.md Rule 19). The rows are
 * written in the column order of the repository's projections, as the fake Postgres answers them.
 */

import { app } from '../../../app.ts';
import {
  COMMUNITY_CATEGORY,
  COMMUNITY_LISTING_STATUS,
  COMMUNITY_PLATFORM,
  COMMUNITY_PRODUCT_KIND,
  COMMUNITY_RULES_VERSION,
} from '../../../lib/constants/community.ts';
import type { FakeQuery, FakeRow } from '../../../test/fake-postgres.ts';
import { AUTH_HEADER, signedIn } from '../../../test/session.ts';
import type { CommunityCatalogRepository } from '../community-catalog.repository.ts';
import type { CommunityRepository, GroupRow, ProductRow } from '../community.repository.ts';

/** Saturday 17 October 2026, 10.00 WIB. */
export const NOW = new Date('2026-10-17T03:00:00.000Z');
export const USER_ID = 'user-1';
export const GROUP_ID = 'a49f658c-b80d-43ca-b0c0-4a659130aa6d';
export const PRODUCT_ID = 'a68e4771-3ba4-4137-9c08-d83275c647d3';

export function groupRow(overrides: Partial<GroupRow> = {}): GroupRow {
  return {
    id: GROUP_ID,
    name: 'Lunas Bareng Jakarta',
    category: COMMUNITY_CATEGORY.debtFree,
    platform: COMMUNITY_PLATFORM.whatsapp,
    memberCount: 1240,
    summary: 'Saling dukung melunasi utang lewat jalur resmi.',
    icon: 'paylater',
    educationOnly: false,
    about: 'Saling dukung melunasi utang lewat jalur resmi dan berbagi naskah negosiasi.',
    adminName: 'Rani A.',
    adminInitials: 'RA',
    adminVerifiedSince: '2026-03-01',
    rules: ['Tanpa Ajakan Gagal Bayar', 'Tanpa Jual-Beli Data atau Joki', 'Jaga Privasi'],
    inviteUrl: 'https://invite.example/lunas-bareng-jakarta',
    linkCheckedOn: '2026-10-12',
    adminUnchanged: true,
    ...overrides,
  };
}

export function productRow(overrides: Partial<ProductRow> = {}): ProductRow {
  return {
    id: PRODUCT_ID,
    kind: COMMUNITY_PRODUCT_KIND.course,
    title: 'Kelas Budgeting Gaji Pertama',
    sellerName: 'Raka Aditya',
    sellerInitials: 'RA',
    sellerBadge: 'Perencana Bersertifikat',
    price: 149_000,
    icon: 'buku',
    description: 'Belajar membagi gaji pertama ke pos yang jelas.',
    meta: '6 modul video',
    sellerRole: 'Perencana keuangan bersertifikat · 4 kelas',
    contentsTitle: 'Yang Kamu Pelajari',
    contents: ['Membagi gaji ke pos kebutuhan'],
    affiliate: true,
    investmentRisk: false,
    sellerUrl: 'https://seller.example/kelas-budgeting-gaji-pertama',
    ...overrides,
  };
}

export function createCommunityRepositoryMock(
  overrides: Partial<CommunityRepository> = {},
): CommunityRepository {
  return {
    listCategories: async () => [],
    listActiveGroups: async () => [],
    findActiveGroup: async () => null,
    hasAcceptedRules: async () => false,
    acceptRules: async () => undefined,
    recordJoin: async () => undefined,
    fileReport: async () => ({ kind: 'filed', id: 'report-1', suspended: false }),
    listActiveProducts: async () => [],
    findActiveProduct: async () => null,
    ...overrides,
  };
}

export function createCatalogRepositoryMock(
  overrides: Partial<CommunityCatalogRepository> = {},
): CommunityCatalogRepository {
  return {
    syncCatalog: async () => undefined,
    listExportRows: async () => ({ consents: [], joins: [], reports: [] }),
    ...overrides,
  };
}

/** Route tests: a signed-in database answering each statement by what it asks. */
export const REPORT_ID = '5b0f8c3e-2a7d-4e61-9f4b-8c1d2e3f4a5b';

export type World = {
  group?: FakeRow | null;
  status?: string;
  consented?: boolean;
  openReport?: boolean;
  reporters?: number;
  product?: FakeRow | null;
};

/** The database as the routes read it: each statement answered by what it asks. */
export function world(state: World, seen: FakeQuery[] = []) {
  return signedIn((query) => {
    seen.push(query);
    const { sql } = query;
    if (sql.includes('from "community_categories"')) {
      return [{ key: COMMUNITY_CATEGORY.debtFree, label: 'Bebas Hutang' }];
    }
    if (sql.includes('for update')) {
      return state.group === null
        ? []
        : [{ status: state.status ?? COMMUNITY_LISTING_STATUS.active }];
    }
    if (sql.startsWith('select') && sql.includes('from "community_groups"')) {
      return state.group === null ? [] : [state.group ?? groupRow()];
    }
    if (sql.startsWith('select') && sql.includes('from "community_rules_consents"')) {
      return state.consented ? [{ version: COMMUNITY_RULES_VERSION }] : [];
    }
    if (sql.includes('count(distinct')) return [{ reporters: state.reporters ?? 1 }];
    if (sql.startsWith('select') && sql.includes('from "community_reports"')) {
      return state.openReport ? [{ id: REPORT_ID }] : [];
    }
    if (sql.startsWith('insert into "community_reports"')) return [{ id: REPORT_ID }];
    if (sql.includes('from "community_products"')) {
      return state.product === null ? [] : [state.product ?? productRow()];
    }
    return [];
  });
}

export function call(method: string, path: string, body?: unknown) {
  return app.request(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

export async function problemOf(res: Response) {
  return { status: res.status, code: ((await res.json()) as { code: string }).code };
}
