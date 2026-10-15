import { z } from '@hono/zod-openapi';

export const healthResponseSchema = z
  .object({
    status: z.enum(['ok']),
    database: z.enum(['healthy']),
  })
  .openapi('Health');

export type HealthResponse = z.infer<typeof healthResponseSchema>;
