/**
 * The Drizzle schema: the source of truth for every table (AGENTS.md §D), one file per domain.
 * drizzle-kit reads this barrel; change a domain file, then run `bun run db:generate` and commit
 * the generated migration beside it (never edit one by hand). Every column a query filters, sorts
 * or joins on gets its index in the same change (Rule 32).
 */

export * from './accounts.ts';
export * from './billing.ts';
export * from './columns.ts';
export * from './finances.ts';
export * from './ledger.ts';
export * from './payoff.ts';
export * from './usage.ts';
