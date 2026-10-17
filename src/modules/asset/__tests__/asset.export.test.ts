import { describe, expect, test } from 'bun:test';
import { ASSET_CLASS } from '../../../lib/constants/asset.ts';
import type { AssetRepository } from '../asset.repository.ts';
import { assetExportSections } from '../asset.export.ts';
import { createAssetMock } from './helpers.ts';

function repositoryOf(assets: ReturnType<typeof createAssetMock>[]): AssetRepository {
  return { list: async () => assets, create: async () => assets[0]!, update: async () => null };
}

describe('assetExportSections', () => {
  test('writes one Portofolio block with the class labels, or nothing without assets', async () => {
    const classes = Object.values(ASSET_CLASS);
    const assets = classes.map((assetClass, index) =>
      createAssetMock({ assetClass, name: `Aset ${index}` }),
    );
    const [section] = await assetExportSections('user-1', { repository: repositoryOf(assets) });
    expect(section?.title).toBe('Rencana · Portofolio');
    expect(section?.header).toEqual(['Jenis Aset', 'Nama Aset', 'Nilai Sekarang', 'Tanggal']);
    expect(section?.rows.map((row) => row[0])).toEqual([
      'Deposito',
      'Reksa Dana',
      'SBN',
      'Emas',
      'Saham',
      'Kripto',
      'Lainnya',
    ]);
    expect(section?.rows[0]).toEqual(['Deposito', 'Aset 0', '15000000', '2026-10-01']);
    expect(await assetExportSections('user-1', { repository: repositoryOf([]) })).toEqual([]);
  });
});
