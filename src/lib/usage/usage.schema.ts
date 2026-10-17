/**
 * The `Usage` object of the OpenAPI document, declared once so `/me`, `/usage`, `/subscription` and
 * the chat responses publish one component the iOS client reads as one type.
 */

import { z } from '@hono/zod-openapi';

const meterSchema = z
  .object({ used: z.number().int(), limit: z.number().int() })
  .openapi('UsageMeter');

export const usageSchema = z
  .object({
    aiMessages: meterSchema,
    receipts: meterSchema,
    /** Seconds of voice input; the limit is 0 outside Kira Plus. */
    voiceSeconds: meterSchema,
    resetsOn: z.iso.date(),
  })
  .openapi('Usage');
