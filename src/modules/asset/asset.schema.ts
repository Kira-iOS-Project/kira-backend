/**
 * The shapes of Portofolio Manual (REN-10) and Tambah Aset (REN-11): an asset, the portfolio with
 * its total and the Utang terhadap Aset reading, and the body of a new or edited asset.
 */

import { z } from '@hono/zod-openapi';
import { ASSET_CLASS, ASSET_NAME_MAX, ASSET_VALUE_MAX } from '../../lib/constants/asset.ts';
import { enumValues } from '../../lib/constants/enum-values.ts';
import { SCORE_BAND } from '../../lib/constants/score.ts';
import { wibDate } from '../../lib/time/wib.ts';

const assetClassSchema = z.enum(enumValues(ASSET_CLASS));
const nameSchema = z.string().trim().min(1).max(ASSET_NAME_MAX);
const valueSchema = z.number().int().min(1).max(ASSET_VALUE_MAX);
/** "Tanggal": a WIB day, never after today. */
const valuedOnSchema = z.iso
  .date()
  .refine((day) => day <= wibDate(new Date()), { message: 'The date cannot be in the future' });

export const assetSchema = z
  .object({
    id: z.uuid(),
    assetClass: assetClassSchema,
    name: z.string(),
    value: z.number().int(),
    valuedOn: z.iso.date(),
  })
  .openapi('Asset');

export const portfolioSchema = z
  .object({
    assets: z.array(assetSchema),
    /** The sum of every asset's value; 0 for an empty portfolio. */
    total: z.number().int(),
    /** The latest `valuedOn` among the assets; null for an empty portfolio. */
    updatedOn: z.iso.date().nullable(),
    /** Utang terhadap Aset with these assets; null before the health check. */
    debtToAsset: z
      .object({
        percent: z.number().int(),
        points: z.number().int(),
        band: z.enum(enumValues(SCORE_BAND)),
      })
      .nullable(),
  })
  .openapi('Portfolio');

export const createAssetBodySchema = z
  .object({
    assetClass: assetClassSchema,
    name: nameSchema,
    value: valueSchema,
    valuedOn: valuedOnSchema,
  })
  .openapi('AssetInput');

export const updateAssetBodySchema = z
  .object({
    assetClass: assetClassSchema.optional(),
    name: nameSchema.optional(),
    value: valueSchema.optional(),
    valuedOn: valuedOnSchema.optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, { message: 'Change at least one field' })
  .openapi('AssetUpdate');

export const assetIdParamSchema = z.object({ id: z.uuid() });

export type Asset = z.infer<typeof assetSchema>;
export type Portfolio = z.infer<typeof portfolioSchema>;
export type AssetInput = z.infer<typeof createAssetBodySchema>;
export type AssetPatch = z.infer<typeof updateAssetBodySchema>;
