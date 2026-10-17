/**
 * Kenali Profil Risikomu (REN-06, REN-07): one row per person with the five answers and the profile
 * the table in lib/constants/risk.ts made of them. Retaking the quiz replaces the row.
 */

import { sql } from 'drizzle-orm';
import { check, pgEnum, pgTable, smallint, uuid } from 'drizzle-orm/pg-core';
import { enumValues } from '../../lib/constants/enum-values.ts';
import { RISK_PROFILE } from '../../lib/constants/plan.ts';
import { users } from './accounts.ts';
import { timestamps } from './columns.ts';

export const riskProfileEnum = pgEnum('risk_profile', enumValues(RISK_PROFILE));

export const riskProfiles = pgTable(
  'risk_profiles',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** The option picked for each question, 0–3, in the quiz's order. */
    answers: smallint('answers').array().notNull(),
    profile: riskProfileEnum('profile').notNull(),
    ...timestamps,
  },
  (table) => [check('risk_profiles_answers_check', sql`cardinality(${table.answers}) = 5`)],
);
