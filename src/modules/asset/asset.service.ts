/**
 * Portofolio Manual's rules (REN-10, REN-11): the portfolio with its total and the Utang terhadap
 * Aset reading it gives, and adding or changing an asset. The score reads the portfolio's total on
 * every request (score.repository `findState`), so a write needs no recompute of its own.
 */

import { INDICATOR } from '../../lib/constants/score.ts';
import { getIndicatorDetail, ScoreNotAvailableError } from '../score/index.ts';
import { AssetNotFoundError } from './asset.errors.ts';
import { type AssetRepository, assetRepository } from './asset.repository.ts';
import type { Asset, AssetInput, AssetPatch, Portfolio } from './asset.schema.ts';

export type AssetDeps = {
  repository?: AssetRepository;
  /** The Kira Score's indicator detail, replaceable in tests. */
  indicator?: typeof getIndicatorDetail;
};

/** Utang terhadap Aset as Portofolio shows it: the ratio, its points and its band; null before the quiz. */
async function debtToAssetOf(userId: string, deps: AssetDeps): Promise<Portfolio['debtToAsset']> {
  try {
    const indicator = await (deps.indicator ?? getIndicatorDetail)(userId, INDICATOR.debtToAsset);
    const percent = 'percent' in indicator.measure ? indicator.measure.percent : 0;
    return { percent, points: indicator.points, band: indicator.band };
  } catch (error) {
    if (error instanceof ScoreNotAvailableError) return null;
    throw error;
  }
}

export async function listAssets(userId: string, deps: AssetDeps = {}): Promise<Portfolio> {
  const repository = deps.repository ?? assetRepository;
  const [assets, debtToAsset] = await Promise.all([
    repository.list(userId),
    debtToAssetOf(userId, deps),
  ]);
  const total = assets.reduce((sum, asset) => sum + asset.value, 0);
  const updatedOn = assets.reduce<string | null>(
    (latest, asset) => (latest === null || asset.valuedOn > latest ? asset.valuedOn : latest),
    null,
  );
  return { assets, total, updatedOn, debtToAsset };
}

export function createAsset(userId: string, input: AssetInput, deps: AssetDeps = {}): Promise<Asset> {
  return (deps.repository ?? assetRepository).create(userId, input);
}

export async function updateAsset(
  userId: string,
  id: string,
  patch: AssetPatch,
  deps: AssetDeps = {},
): Promise<Asset> {
  const asset = await (deps.repository ?? assetRepository).update(userId, id, patch);
  if (!asset) throw new AssetNotFoundError();
  return asset;
}
