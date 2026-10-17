/**
 * Portofolio Manual (REN-10, REN-11): the classes an asset can be, and the limits of one entry. The
 * app turns each class into its label (Deposito, Reksa Dana, SBN, Emas, Saham, Kripto, Lainnya).
 */

import { COMMUNITY_CATEGORY, COMMUNITY_REPORT_REASON } from './community.ts';

/** The seven tiles of Tambah Aset, in their order on the board. */
export const ASSET_CLASS = {
  deposit: 'deposit',
  mutualFund: 'mutual_fund',
  governmentBond: 'government_bond',
  gold: 'gold',
  stock: 'stock',
  crypto: COMMUNITY_CATEGORY.crypto,
  other: COMMUNITY_REPORT_REASON.other,
} as const;

/** "Nama Aset": at most this many characters. */
export const ASSET_NAME_MAX = 80;

/** "Nilai Sekarang": at most Rp999.999.999.999,00. */
export const ASSET_VALUE_MAX = 999_999_999_999;
