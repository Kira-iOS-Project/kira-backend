/**
 * The community module's work outside its routes: syncing the curated catalog at boot, and the
 * person's community rows for Unduh Datamu (the rules accepted, the groups opened, the reports).
 */

import { COMMUNITY_REPORT_REASON } from '../../lib/constants/community.ts';
import type { ExportSection } from '../../lib/export/export-section.ts';
import { wibDate } from '../../lib/time/wib.ts';
import { CATALOG_CATEGORIES, CATALOG_GROUPS } from './community-groups.catalog.ts';
import { CATALOG_PRODUCTS } from './community-products.catalog.ts';
import { communityCatalogRepository } from './community-catalog.repository.ts';
import type { CommunityCatalogRepository } from './community-catalog.repository.ts';
import type { ReportReason } from './community.schema.ts';

export type CatalogDeps = { repository?: CommunityCatalogRepository };

/** Laporkan Grup's reasons, as the sheet words them. */
const REASON_LABEL: Record<ReportReason, string> = {
  [COMMUNITY_REPORT_REASON.defaultInvite]: 'Ajakan Gagal Bayar',
  [COMMUNITY_REPORT_REASON.guaranteedProfit]: 'Janji Untung Pasti',
  [COMMUNITY_REPORT_REASON.scam]: 'Penipuan atau Minta Transfer',
  [COMMUNITY_REPORT_REASON.dataOrJockey]: 'Jual Data atau Joki',
  [COMMUNITY_REPORT_REASON.inappropriate]: 'Konten Tidak Pantas',
  [COMMUNITY_REPORT_REASON.other]: 'Lainnya',
};

/**
 * Writes the curated categories, groups and products (idempotent; safe beside another instance
 * booting) and says how many of each the catalog holds.
 */
export async function syncCommunityCatalog(deps: CatalogDeps = {}) {
  const repository = deps.repository ?? communityCatalogRepository;
  const catalog = {
    categories: CATALOG_CATEGORIES,
    groups: CATALOG_GROUPS,
    products: CATALOG_PRODUCTS,
  };
  await repository.syncCatalog(catalog);
  return {
    categories: catalog.categories.length,
    groups: catalog.groups.length,
    products: catalog.products.length,
  };
}

/** The person's community rows as Unduh Datamu's blocks; an empty block is left out. */
export async function communityExportSections(
  userId: string,
  deps: CatalogDeps = {},
): Promise<ExportSection[]> {
  const repository = deps.repository ?? communityCatalogRepository;
  const { consents, joins, reports } = await repository.listExportRows(userId);
  const sections: ExportSection[] = [
    {
      title: 'Komunitas · Aturan yang Disetujui',
      header: ['Tanggal', 'Versi Aturan'],
      rows: consents.map((row) => [wibDate(row.acceptedAt), row.version]),
    },
    {
      title: 'Komunitas · Grup yang Dibuka',
      header: ['Tanggal', 'Grup'],
      rows: joins.map((row) => [wibDate(row.openedAt), row.groupName]),
    },
    {
      title: 'Komunitas · Laporan Grup',
      header: ['Tanggal', 'Grup', 'Alasan', 'Cerita'],
      rows: reports.map((row) => [
        wibDate(row.createdAt),
        row.groupName,
        REASON_LABEL[row.reason],
        row.story ?? '',
      ]),
    },
  ];
  return sections.filter((section) => section.rows.length > 0);
}
