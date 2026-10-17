import { z } from '@hono/zod-openapi';

export const legalityQuerySchema = z.object({
  /** What the person typed: an app, a company or a web address. */
  q: z.string().trim().min(2).max(80).openapi({ example: 'kredit pintar' }),
});

const licensedLenderSchema = z
  .object({
    company: z.string().openapi({ example: 'PT Kredit Pintar Indonesia' }),
    app: z.string().openapi({ example: 'Kredit Pintar' }),
    license: z.string().openapi({ example: 'KEP-83/D.05/2019' }),
    licensedOn: z.string().openapi({ format: 'date', example: '2019-09-30' }),
    type: z.enum(['conventional', 'sharia']),
    website: z.string().openapi({ example: 'https://www.kreditpintar.com/' }),
  })
  .openapi('LicensedLender');

export const legalitySearchSchema = z
  .object({
    asOf: z.string().openapi({ format: 'date', example: '2026-07-31' }),
    source: z.string().openapi({ format: 'uri' }),
    listed: z.number().int().openapi({ example: 94 }),
    results: z.array(licensedLenderSchema).max(10),
  })
  .openapi('LegalitySearch');
