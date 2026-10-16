/**
 * People and how they sign in: the account, the one-time codes sent by email, the sessions they
 * open and the consents they give (ONB-05 to ONB-08, AKN-04).
 */

import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  pgEnum,
  pgTable,
  smallint,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { CONSENT_PURPOSE } from '../../lib/constants/consents.ts';
import { enumValues } from '../../lib/constants/enum-values.ts';
import { FOCUS } from '../../lib/constants/profile.ts';
import { moment, timestamps } from './columns.ts';

export const focusEnum = pgEnum('focus', enumValues(FOCUS));
export const consentPurposeEnum = pgEnum('consent_purpose', enumValues(CONSENT_PURPOSE));

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Lower-cased before it is stored, so one address is one account. */
    email: varchar('email', { length: 320 }).notNull(),
    /** Derived from the address at sign-up ("dinda@email.com" is Dinda): no screen asks a name. */
    displayName: varchar('display_name', { length: 60 }).notNull(),
    focus: focusEnum('focus').default(FOCUS.trackSpending).notNull(),
    /** Tanggal gajian: a day of the month, or the last day of each month. Unset until answered. */
    paydayDay: smallint('payday_day'),
    paydayEndOfMonth: boolean('payday_end_of_month').default(false).notNull(),
    hideBalances: boolean('hide_balances').default(false).notNull(),
    /** Set by Persetujuan Data; an account without it has not finished signing up. */
    consentedAt: moment('consented_at'),
    /** Set by Mode Darurat Utang (PED-07) when it lands; Beasiswa Kira reads it. */
    debtEmergencyModeUsedAt: moment('debt_emergency_mode_used_at'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('users_email_idx').on(table.email),
    check('users_payday_day_check', sql`${table.paydayDay} between 1 and 31`),
  ],
);

export const authCodes = pgTable(
  'auth_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: varchar('email', { length: 320 }).notNull(),
    /** HMAC-SHA256 of the address and the code under AUTH_SECRET, hex. */
    codeHash: varchar('code_hash', { length: 64 }).notNull(),
    requestIp: varchar('request_ip', { length: 64 }).notNull(),
    attempts: smallint('attempts').default(0).notNull(),
    expiresAt: moment('expires_at').notNull(),
    /** Set when the code signs someone in, or when a newer code replaces it. */
    consumedAt: moment('consumed_at'),
    createdAt: moment('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('auth_codes_email_created_idx').on(table.email, table.createdAt.desc().nullsFirst()),
    index('auth_codes_ip_created_idx').on(table.requestIp, table.createdAt.desc().nullsFirst()),
    index('auth_codes_created_idx').on(table.createdAt),
    check('auth_codes_attempts_check', sql`${table.attempts} >= 0`),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    /** SHA-256 of the bearer token, hex; the token itself is never stored. */
    accessTokenHash: varchar('access_token_hash', { length: 64 }).notNull(),
    accessExpiresAt: moment('access_expires_at').notNull(),
    refreshTokenHash: varchar('refresh_token_hash', { length: 64 }).notNull(),
    /** The refresh token this one replaced: presenting it again ends the session (reuse). */
    previousRefreshTokenHash: varchar('previous_refresh_token_hash', { length: 64 }),
    refreshExpiresAt: moment('refresh_expires_at').notNull(),
    revokedAt: moment('revoked_at'),
    ...timestamps,
  },
  (table) => [
    index('sessions_user_idx').on(table.userId),
    uniqueIndex('sessions_access_token_hash_idx').on(table.accessTokenHash),
    uniqueIndex('sessions_refresh_token_hash_idx').on(table.refreshTokenHash),
    index('sessions_previous_refresh_token_hash_idx').on(table.previousRefreshTokenHash),
  ],
);

/**
 * One row per code check that passed the rate limit (POST /api/auth/verify), counted per address
 * and per network so a burst of guesses is refused before any code is compared. Deleted by the
 * hourly cleanup a day later.
 */
export const signInAttempts = pgTable(
  'sign_in_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: varchar('email', { length: 320 }).notNull(),
    requestIp: varchar('request_ip', { length: 64 }).notNull(),
    createdAt: moment('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('sign_in_attempts_email_created_idx').on(
      table.email,
      table.createdAt.desc().nullsFirst(),
    ),
    index('sign_in_attempts_ip_created_idx').on(
      table.requestIp,
      table.createdAt.desc().nullsFirst(),
    ),
    index('sign_in_attempts_created_idx').on(table.createdAt),
  ],
);

/** One row per decision, never updated: the latest row per purpose is the one in force. */
export const consents = pgTable(
  'consents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    purpose: consentPurposeEnum('purpose').notNull(),
    granted: boolean('granted').notNull(),
    policyVersion: varchar('policy_version', { length: 20 }).notNull(),
    decidedAt: moment('decided_at').defaultNow().notNull(),
  },
  (table) => [
    index('consents_user_purpose_decided_idx').on(
      table.userId,
      table.purpose,
      table.decidedAt.desc().nullsFirst(),
    ),
  ],
);
