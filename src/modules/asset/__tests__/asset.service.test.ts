import { describe, expect, test } from 'bun:test';
import { INDICATOR, INDICATOR_GROUP, SCORE_BAND } from '../../../lib/constants/score.ts';
import { getIndicatorDetail, ScoreNotAvailableError } from '../../score/index.ts';
import type { AssetRepository } from '../asset.repository.ts';
import { listAssets } from '../asset.service.ts';
import { createAssetMock } from './helpers.ts';

type Detail = Awaited<ReturnType<typeof getIndicatorDetail>>;

function repositoryOf(assets = [createAssetMock()]): AssetRepository {
  return {
    list: async () => assets,
    create: async () => assets[0]!,
    update: async () => null,
  };
}

function detail(measure: Detail['measure']): Detail {
  return {
    key: INDICATOR.debtToAsset,
    group: INDICATOR_GROUP.debt,
    points: 60,
    band: SCORE_BAND.coping,
    measure,
  } as Detail;
}

describe('listAssets', () => {
  test('totals the assets, takes the latest day, and reads Utang terhadap Aset', async () => {
    const assets = [
      createAssetMock({ value: 10_000_000, valuedOn: '2026-09-01' }),
      createAssetMock({ value: 5_000_000, valuedOn: '2026-10-05' }),
    ];
    const portfolio = await listAssets('user-1', {
      repository: repositoryOf(assets),
      indicator: async () => detail({ percent: 42, totalDebt: 6_300_000, totalAssets: 15_000_000 }),
    });
    expect(portfolio.total).toBe(15_000_000);
    expect(portfolio.updatedOn).toBe('2026-10-05');
    expect(portfolio.debtToAsset).toEqual({ percent: 42, points: 60, band: SCORE_BAND.coping });
  });

  test('an empty portfolio has no total and no day; a measure without a ratio reads 0%', async () => {
    const portfolio = await listAssets('user-1', {
      repository: repositoryOf([]),
      indicator: async () => detail({ health: true, income: false }),
    });
    expect(portfolio).toEqual({
      assets: [],
      total: 0,
      updatedOn: null,
      debtToAsset: { percent: 0, points: 60, band: SCORE_BAND.coping },
    });
  });

  test('is null before the health check, and lets any other failure through', async () => {
    const before = await listAssets('user-1', {
      repository: repositoryOf(),
      indicator: async () => {
        throw new ScoreNotAvailableError();
      },
    });
    expect(before.debtToAsset).toBeNull();
    const failing = listAssets('user-1', {
      repository: repositoryOf(),
      indicator: async () => {
        throw new Error('database down');
      },
    });
    await expect(failing).rejects.toThrow('database down');
  });
});
