import { and, asc, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { db } from '../../db/client/index.ts';
import { consents, transactions, weeklySummaries } from '../../db/schema/schema.ts';
import { CONSENT_PURPOSE } from '../../lib/constants/consents.ts';
import { TRANSACTION_TYPE } from '../../lib/constants/money.ts';
import { expenseCategorySchema } from '../../lib/money/money.schema.ts';
import type {
  CategoryTotal,
  FinanceRepository,
  WeeklyUserCategory,
  WeeklyWrite,
} from './finance.repository.types.ts';

type WeeklyRepository = Pick<
  FinanceRepository,
  | 'totals'
  | 'categories'
  | 'weeklyTotalsForUsers'
  | 'weeklyCategoriesForUsers'
  | 'optedInUsers'
  | 'saveWeeklies'
>;

const WIB_DATE = sql<string>`to_char(${transactions.occurredAt} at time zone 'Asia/Jakarta', 'YYYY-MM-DD')`;
const MAX_WEEKLY_USERS = 10_000;

export function createWeeklyRepository(client: PostgresJsDatabase = db): WeeklyRepository {
  return {
    async totals(userId, from, to) {
      return client
        .select({
          date: WIB_DATE,
          expense:
            sql<number>`coalesce(sum(${transactions.amount}) filter (where ${transactions.type} = ${TRANSACTION_TYPE.expense}), 0)`.mapWith(
              Number,
            ),
          income:
            sql<number>`coalesce(sum(${transactions.amount}) filter (where ${transactions.type} = ${TRANSACTION_TYPE.income}), 0)`.mapWith(
              Number,
            ),
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, userId),
            gte(transactions.occurredAt, from),
            lt(transactions.occurredAt, to),
          ),
        )
        .groupBy(WIB_DATE)
        .orderBy(asc(WIB_DATE))
        .limit(7);
    },

    async categories(userId, from, to) {
      const rows = await client
        .select({
          category: transactions.category,
          amount: sql<number>`coalesce(sum(${transactions.amount}), 0)`.mapWith(Number),
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, userId),
            eq(transactions.type, TRANSACTION_TYPE.expense),
            gte(transactions.occurredAt, from),
            lt(transactions.occurredAt, to),
          ),
        )
        .groupBy(transactions.category)
        .orderBy(desc(sql`sum(${transactions.amount})`), asc(transactions.category))
        .limit(4);
      return rows.flatMap((row): CategoryTotal[] => {
        const category = expenseCategorySchema.safeParse(row.category);
        return category.success ? [{ category: category.data, amount: row.amount }] : [];
      });
    },

    async weeklyTotalsForUsers(userIds, from, to) {
      return client
        .select({
          userId: transactions.userId,
          date: WIB_DATE,
          expense:
            sql<number>`coalesce(sum(${transactions.amount}) filter (where ${transactions.type} = ${TRANSACTION_TYPE.expense}), 0)`.mapWith(
              Number,
            ),
          income:
            sql<number>`coalesce(sum(${transactions.amount}) filter (where ${transactions.type} = ${TRANSACTION_TYPE.income}), 0)`.mapWith(
              Number,
            ),
        })
        .from(transactions)
        .where(
          and(
            inArray(transactions.userId, userIds),
            gte(transactions.occurredAt, from),
            lt(transactions.occurredAt, to),
          ),
        )
        .groupBy(transactions.userId, WIB_DATE)
        .orderBy(asc(transactions.userId), asc(WIB_DATE))
        .limit(MAX_WEEKLY_USERS * 7);
    },

    async weeklyCategoriesForUsers(userIds, from, to) {
      const rows = await client
        .select({
          userId: transactions.userId,
          category: transactions.category,
          amount: sql<number>`coalesce(sum(${transactions.amount}), 0)`.mapWith(Number),
        })
        .from(transactions)
        .where(
          and(
            inArray(transactions.userId, userIds),
            eq(transactions.type, TRANSACTION_TYPE.expense),
            gte(transactions.occurredAt, from),
            lt(transactions.occurredAt, to),
          ),
        )
        .groupBy(transactions.userId, transactions.category)
        .orderBy(
          asc(transactions.userId),
          desc(sql`sum(${transactions.amount})`),
          asc(transactions.category),
        )
        .limit(MAX_WEEKLY_USERS * 4);
      return rows.flatMap((row): WeeklyUserCategory[] => {
        const category = expenseCategorySchema.safeParse(row.category);
        return category.success
          ? [{ userId: row.userId, category: category.data, amount: row.amount }]
          : [];
      });
    },

    async optedInUsers() {
      return client
        .selectDistinctOn([consents.userId], {
          userId: consents.userId,
          granted: consents.granted,
        })
        .from(consents)
        .where(eq(consents.purpose, CONSENT_PURPOSE.weeklySummary))
        .orderBy(asc(consents.userId), desc(consents.decidedAt))
        .limit(MAX_WEEKLY_USERS);
    },

    async saveWeeklies(rows: WeeklyWrite[]) {
      if (rows.length === 0) return;
      await client
        .insert(weeklySummaries)
        .values(rows)
        .onConflictDoUpdate({
          target: [weeklySummaries.userId, weeklySummaries.weekStart],
          set: {
            expense: sql`excluded.expense`,
            income: sql`excluded.income`,
            note: sql`excluded.note`,
            generatedAt: new Date(),
          },
        });
    },
  };
}
