/**
 * Etalase through the community service over a repository double: summaries for a kind, and a
 * product's detail.
 */

import { describe, expect, test } from 'bun:test';
import { COMMUNITY_PRODUCT_KIND } from '../../../lib/constants/community.ts';
import { CommunityProductNotFoundError } from '../community.errors.ts';
import { getProduct, listProducts } from '../community.service.ts';
import { createCommunityRepositoryMock, PRODUCT_ID, productRow } from './helpers.ts';

describe('products', () => {
  test('lists the summaries for a kind, without the detail', async () => {
    const kinds: unknown[] = [];
    const repository = createCommunityRepositoryMock({
      listActiveProducts: async (kind) => {
        kinds.push(kind);
        return [productRow({ price: null })];
      },
    });

    const { products } = await listProducts(
      { kind: COMMUNITY_PRODUCT_KIND.course },
      { repository },
    );

    expect(kinds).toEqual([COMMUNITY_PRODUCT_KIND.course]);
    expect(products[0]).toMatchObject({ id: PRODUCT_ID, price: null, icon: 'buku' });
    expect(Object.keys(products[0] ?? {})).not.toContain('sellerUrl');
  });

  test('answers a product with its detail, and refuses a missing one', async () => {
    const found = createCommunityRepositoryMock({ findActiveProduct: async () => productRow() });

    const product = await getProduct(PRODUCT_ID, { repository: found });

    expect(product).toMatchObject({
      meta: '6 modul video',
      affiliate: true,
      investmentRisk: false,
    });
    expect(product.sellerUrl).toBe('https://lynk.id/rakaaditya/kelas-budgeting-gaji-pertama');
    await expect(
      getProduct(PRODUCT_ID, { repository: createCommunityRepositoryMock() }),
    ).rejects.toThrow(CommunityProductNotFoundError);
  });
});
