/**
 * Every external client replaced once, before any test file loads (`preload` in bunfig.toml).
 *
 * `mock.module` mutates a registry the whole run shares, so two files mocking the same module is
 * last-write-wins, and the loser silently runs against the other's mock or a real service. Tests
 * never re-mock these modules: they steer them through the controls below and reset them with
 * `resetExternalMocks()` (AGENTS.md Rule 7, `bun run check:mocks`).
 */

import { mock } from 'bun:test';

/* ── Postgres ────────────────────────────────────────────────────────────── */

export const dbControl = {
  /** What `db.execute` does: the health check's `SELECT 1`. */
  execute: async (): Promise<unknown> => undefined,
};

/* The real module opens a pool from DATABASE_URL on import; the unit tier never dials it. */
void mock.module('../db/client/index.ts', () => ({
  db: { execute: () => dbControl.execute() },
  client: {},
}));

/* ── Reset ───────────────────────────────────────────────────────────────── */

/** Call from `beforeEach`, so one test's steering cannot leak into the next. */
export function resetExternalMocks(): void {
  dbControl.execute = async () => undefined;
}
