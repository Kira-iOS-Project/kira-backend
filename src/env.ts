/**
 * The validated environment, and the only file that reads `process.env` (AGENTS.md Rule 22).
 *
 * Bun loads `.env.<NODE_ENV>` by itself in development; in production every value comes from the
 * platform (Dokploy), never from a file in the image. A value that does not parse stops the process
 * at boot, where someone is watching, instead of at the first request that needed it. The error
 * names each key and why it failed, never the value: DATABASE_URL carries a password.
 */

import { z } from 'zod';

const flag = (fallback: 'true' | 'false') =>
  z
    .enum(['true', 'false'])
    .default(fallback)
    .transform((value) => value === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),

  /** Required in production (below) and by the server before it starts (src/index.ts). Unset only
     where nothing connects: the unit tests and the OpenAPI export, which need no variable at all. */
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }).optional(),

  /** Browser origins allowed to call this API, comma-separated. The iOS app is not a browser and
     needs none, so the default allows no origin at all. Never a wildcard (AGENTS.md Rule 39). */
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    )
    .refine((origins) => !origins.includes('*'), 'CORS_ORIGINS must list origins, never *'),

  /** The request budget on /api/* (AGENTS.md Rule 41). */
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  BODY_LIMIT_BYTES: z.coerce.number().int().positive().default(1_048_576),

  /** The pool (AGENTS.md Rules 17 and 38). DB_POOL_MAX times the replica count stays under the
     server's max_connections; the statement timeout stops one stuck query from holding a
     connection forever. DB_PREPARE is false only behind a transaction-mode pooler. */
  DB_POOL_MAX: z.coerce.number().int().min(3).default(10),
  DB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  DB_PREPARE: flag('true'),

  /** /docs and /openapi.json. Off in production unless set to true on purpose. */
  DOCS_ENABLED: z.enum(['true', 'false']).optional(),

  /** Kept under Docker's 10 s stop grace period, so the process exits on its own terms. */
  SHUTDOWN_FORCE_EXIT_MS: z.coerce.number().int().positive().default(8_000),

  /** Transactional email through Resend (the sign-in code, the renewal reminder, the Beasiswa
     Kira result, the account-deletion notice and the data export). Required in production; in
     development an unset key writes the email to the log instead of sending it. EMAIL_FROM names a
     sender on a domain verified in Resend. */
  RESEND_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().min(3).default('Kira <noreply@serenitycode.tech>'),

  /** Signs the stored one-time codes (an HMAC, so a leaked table does not give the codes away).
     Required in production; elsewhere an unset value becomes a random one per process. */
  AUTH_SECRET: z.string().min(32).optional(),

  /** Layanan Kira Peduli's own line (PED-01, PED-04): the phone and the WhatsApp number, as the
     person dials them ("0811…"). Until both are set, GET /care/contacts leaves the contact out. */
  KIRA_CARE_PHONE: z
    .string()
    .regex(/^\+?[0-9]{3,15}$/)
    .optional(),
  KIRA_CARE_WHATSAPP: z
    .string()
    .regex(/^\+?[0-9]{8,15}$/)
    .optional(),

  /** Where the public files live, for the images inside emails (`/email/*.png`). */
  PUBLIC_BASE_URL: z.url({ protocol: /^https?$/ }).default('https://api-kira.serenitycode.tech'),

  /** The in-process scheduler (renewal reminders, subscription periods, Beasiswa Kira reviews).
     One replica runs it; off only to run a second process beside the first. */
  JOBS_ENABLED: flag('true'),

  /** The verified links of the curated community groups and Etalase products (KOM-02, KOM-07): a
     JSON object from a group's or a product's id to its https link, set by the curation team and
     written at boot. Without one, a group answers Gabung Grup with COMMUNITY_LINK_UNAVAILABLE and
     a product has no seller page. */
  COMMUNITY_LINKS_JSON: z
    .string()
    .default('{}')
    .transform((value, context) => {
      try {
        return JSON.parse(value) as unknown;
      } catch {
        context.addIssue({ code: 'custom', message: 'COMMUNITY_LINKS_JSON must be a JSON object' });
        return z.NEVER;
      }
    })
    .pipe(z.record(z.uuid(), z.url({ protocol: /^https$/ }))),
});

const parsed = schema
  .refine((value) => value.NODE_ENV !== 'production' || value.DATABASE_URL !== undefined, {
    message: 'DATABASE_URL is required in production',
    path: ['DATABASE_URL'],
  })
  .refine((value) => value.NODE_ENV !== 'production' || value.RESEND_API_KEY !== undefined, {
    message: 'RESEND_API_KEY is required in production',
    path: ['RESEND_API_KEY'],
  })
  .refine((value) => value.NODE_ENV !== 'production' || value.AUTH_SECRET !== undefined, {
    message: 'AUTH_SECRET is required in production',
    path: ['AUTH_SECRET'],
  })
  .safeParse(process.env);

if (!parsed.success) {
  console.error(`Invalid environment variables:\n${z.prettifyError(parsed.error)}`);
  process.exit(1);
}

const { DOCS_ENABLED, AUTH_SECRET, ...values } = parsed.data;

export const env = {
  ...values,
  DOCS_ENABLED:
    DOCS_ENABLED === undefined ? values.NODE_ENV !== 'production' : DOCS_ENABLED === 'true',
  AUTH_SECRET: AUTH_SECRET ?? crypto.randomUUID() + crypto.randomUUID(),
};
