import { z } from '@hono/zod-openapi';

const emailSchema = z.email().max(320).openapi({ example: 'dinda@email.com' });

export const requestCodeBodySchema = z.object({ email: emailSchema }).openapi('CodeRequest');

export const codeRequestedResponseSchema = z
  .object({
    /** A code lasts ten minutes (ONB-07). */
    expiresInSeconds: z.number().int(),
    /** "Kirim Ulang Kode" opens after this many seconds. */
    resendAfterSeconds: z.number().int(),
  })
  .openapi('CodeRequested');

export const verifyCodeBodySchema = z
  .object({
    email: emailSchema,
    code: z
      .string()
      .regex(/^\d{6}$/)
      .openapi({ example: '381427' }),
  })
  .openapi('CodeVerification');

export const sessionTokensResponseSchema = z
  .object({
    accessToken: z.string(),
    refreshToken: z.string(),
    accessExpiresInSeconds: z.number().int(),
  })
  .openapi('SessionTokens');

export const signedInResponseSchema = sessionTokensResponseSchema
  .extend({
    /** True until Persetujuan Data is given: a first sign-up, or one left halfway. */
    needsOnboarding: z.boolean(),
  })
  .openapi('SignedIn');

export const refreshBodySchema = z
  .object({ refreshToken: z.string().min(1) })
  .openapi('SessionRefresh');

export type CodeRequestedResponse = z.infer<typeof codeRequestedResponseSchema>;
export type SessionTokensResponse = z.infer<typeof sessionTokensResponseSchema>;
export type SignedInResponse = z.infer<typeof signedInResponseSchema>;
