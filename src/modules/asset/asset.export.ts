/**
 * Portofolio Manual's part of the data export: one block with every asset, worded like the
 * transactions (Title Case Indonesian headers, the class labels people read, WIB days).
 */

import { ASSET_CLASS } from '../../lib/constants/asset.ts';
import type { ExportSection } from '../../lib/export/export-section.ts';
import { type AssetRepository, assetRepository } from './asset.repository.ts';

/** The tile labels of Tambah Aset. */
const ASSET_CLASS_LABEL: Record<(typeof ASSET_CLASS)[keyof typeof ASSET_CLASS], string> = {
  [ASSET_CLASS.deposit]: 'Deposito',
  [ASSET_CLASS.mutualFund]: 'Reksa Dana',
  [ASSET_CLASS.governmentBond]: 'SBN',
  [ASSET_CLASS.gold]: 'Emas',
  [ASSET_CLASS.stock]: 'Saham',
  [ASSET_CLASS.crypto]: 'Kripto',
  [ASSET_CLASS.other]: 'Lainnya',
};

/** The portfolio block, or nothing for a person without assets. */
export async function assetExportSections(
  userId: string,
  deps: { repository?: AssetRepository } = {},
): Promise<ExportSection[]> {
  const assets = await (deps.repository ?? assetRepository).list(userId);
  if (assets.length === 0) return [];
  return [
    {
      title: 'Rencana · Portofolio',
      header: ['Jenis Aset', 'Nama Aset', 'Nilai Sekarang', 'Tanggal'],
      rows: assets.map((asset) => [
        ASSET_CLASS_LABEL[asset.assetClass],
        asset.name,
        String(asset.value),
        asset.valuedOn,
      ]),
    },
  ];
}
