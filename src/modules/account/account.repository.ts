/**
 * The account module's data access (AGENTS.md Rules 4 and 10): the profile, the plan and usage
 * Profil shows, the consent audit trail, the data export and the deletion of an account.
 */

import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { db } from '../../db/client/index.ts';
import {
  consents,
  debtAccounts,
  financialProfiles,
  subscriptions,
  transactions,
  usageCounters,
  users,
} from '../../db/schema/schema.ts';
import { CONSENT_PURPOSE, PRIVACY_POLICY_VERSION } from '../../lib/constants/consents.ts';
import { EXPORT_ROW_LIMIT } from '../../lib/constants/export.ts';
import { SUBSCRIPTION_STATUS } from '../../lib/constants/plans.ts';
import type { PlanSubscription, UsageCounters } from '../../lib/usage/plan-usage.ts';

type Row<T extends { $inferSelect: object }> = T['$inferSelect'];
type User = Row<typeof users>;
type Transaction = Row<typeof transactions>;

export type Profile = Pick<
  User,
  | 'email'
  | 'displayName'
  | 'focus'
  | 'paydayDay'
  | 'paydayEndOfMonth'
  | 'hideBalances'
  | 'consentedAt'
  | 'debtEmergencyModeUsedAt'
>;
export type ProfileChanges = Partial<
  Pick<User, 'focus' | 'paydayDay' | 'paydayEndOfMonth' | 'hideBalances'>
>;
export type ConsentDecision = Pick<Row<typeof consents>, 'purpose' | 'granted' | 'decidedAt'>;
export type ExportRow = Pick<
  Transaction,
  'occurredAt' | 'type' | 'category' | 'name' | 'amount' | 'source' | 'note'
>;

export type AccountRepository = {
  findProfile(userId: string): Promise<Profile | null>;
  updateProfile(userId: string, changes: ProfileChanges): Promise<void>;
  /** The active subscription, as the one-row list `activePlanOf` reads (empty on Kira Gratis). */
  findActiveSubscriptions(userId: string): Promise<PlanSubscription[]>;
  findUsage(userId: string, periodStart: string): Promise<UsageCounters | null>;
  /** The decision in force for each purpose: the latest row of each. */
  latestConsents(userId: string): Promise<ConsentDecision[]>;
  hasHealthCheck(userId: string): Promise<boolean>;
  lastCategory(userId: string, type: Transaction['type']): Promise<Transaction['category'] | null>;
  countOpenDebts(userId: string): Promise<number>;
  /**
   * Appends the decisions with the policy in force. The first time also records the core purpose
   * and marks the account consented, which is what ends onboarding.
   */
  recordConsents(
    userId: string,
    decisions: Pick<ConsentDecision, 'purpose' | 'granted'>[],
    now: Date,
  ): Promise<void>;
  listExportRows(userId: string): Promise<ExportRow[]>;
  /** Removes the account; every table that belongs to it follows by cascade. */
  deleteUser(userId: string): Promise<void>;
};

export function createAccountRepository(client: PostgresJsDatabase = db): AccountRepository {
  return {
    async findProfile(userId) {
      const [row] = await client
        .select({
          email: users.email,
          displayName: users.displayName,
          focus: users.focus,
          paydayDay: users.paydayDay,
          paydayEndOfMonth: users.paydayEndOfMonth,
          hideBalances: users.hideBalances,
          consentedAt: users.consentedAt,
          debtEmergencyModeUsedAt: users.debtEmergencyModeUsedAt,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      return row ?? null;
    },

    async updateProfile(userId, changes) {
      if (Object.keys(changes).length === 0) return;
      await client.update(users).set(changes).where(eq(users.id, userId));
    },

    findActiveSubscriptions(userId) {
      return client
        .select({
          plan: subscriptions.plan,
          source: subscriptions.source,
          status: subscriptions.status,
          currentPeriodStart: subscriptions.currentPeriodStart,
          currentPeriodEnd: subscriptions.currentPeriodEnd,
        })
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.userId, userId),
            eq(subscriptions.status, SUBSCRIPTION_STATUS.active),
          ),
        )
        .limit(1);
    },

    async findUsage(userId, periodStart) {
      const [row] = await client
        .select({
          aiMessages: usageCounters.aiMessages,
          receipts: usageCounters.receipts,
          voiceSeconds: usageCounters.voiceSeconds,
        })
        .from(usageCounters)
        .where(and(eq(usageCounters.userId, userId), eq(usageCounters.periodStart, periodStart)))
        .limit(1);
      return row ?? null;
    },

    latestConsents(userId) {
      return client
        .selectDistinctOn([consents.purpose], {
          purpose: consents.purpose,
          granted: consents.granted,
          decidedAt: consents.decidedAt,
        })
        .from(consents)
        .where(eq(consents.userId, userId))
        .orderBy(consents.purpose, desc(consents.decidedAt))
        .limit(Object.keys(CONSENT_PURPOSE).length);
    },

    async hasHealthCheck(userId) {
      const rows = await client
        .select({ userId: financialProfiles.userId })
        .from(financialProfiles)
        .where(eq(financialProfiles.userId, userId))
        .limit(1);
      return rows.length > 0;
    },

    async lastCategory(userId, type) {
      const [row] = await client
        .select({ category: transactions.category })
        .from(transactions)
        .where(and(eq(transactions.userId, userId), eq(transactions.type, type)))
        .orderBy(desc(transactions.occurredAt), desc(transactions.id))
        .limit(1);
      return row?.category ?? null;
    },

    async countOpenDebts(userId) {
      const [row] = await client
        .select({ count: sql<number>`count(*)::int` })
        .from(debtAccounts)
        .where(and(eq(debtAccounts.userId, userId), isNull(debtAccounts.paidOffAt)));
      return row?.count ?? 0;
    },

    async recordConsents(userId, decisions, now) {
      await client.transaction(async (tx) => {
        const first = await tx
          .update(users)
          .set({ consentedAt: now })
          .where(and(eq(users.id, userId), isNull(users.consentedAt)))
          .returning({ id: users.id });
        const core = first.length > 0 ? [{ purpose: CONSENT_PURPOSE.core, granted: true }] : [];
        await tx.insert(consents).values(
          [...core, ...decisions].map(({ purpose, granted }) => ({
            userId,
            purpose,
            granted,
            policyVersion: PRIVACY_POLICY_VERSION,
            decidedAt: now,
          })),
        );
      });
    },

    listExportRows(userId) {
      return client
        .select({
          occurredAt: transactions.occurredAt,
          type: transactions.type,
          category: transactions.category,
          name: transactions.name,
          amount: transactions.amount,
          source: transactions.source,
          note: transactions.note,
        })
        .from(transactions)
        .where(eq(transactions.userId, userId))
        .orderBy(asc(transactions.occurredAt), asc(transactions.id))
        .limit(EXPORT_ROW_LIMIT);
    },

    async deleteUser(userId) {
      await client.delete(users).where(eq(users.id, userId));
    },
  };
}

export const accountRepository = createAccountRepository();
