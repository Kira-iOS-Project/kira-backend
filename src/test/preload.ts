/**
 * Every external client replaced once, before any test file loads (`preload` in bunfig.toml).
 *
 * `mock.module` mutates a registry the whole run shares, so two files mocking the same module is
 * last-write-wins, and the loser silently runs against the other's mock or a real service. Tests
 * never re-mock these modules: they steer them through the controls below and reset them with
 * `resetExternalMocks()` (AGENTS.md Rule 7, `bun run check:mocks`).
 */

import { mock } from 'bun:test';
import { createFakeDb, type FakeResponder } from './fake-postgres.ts';

/** ── Postgres ────────────────────────────────────────────────────────────── */

const fake = createFakeDb((query) => dbControl.respond(query));

export const dbControl = {
  /** Answers every statement the app's own `db` sends (src/test/fake-postgres.ts). */
  respond: (async () => []) as FakeResponder,
  /** The statements sent since the last reset, in order. */
  queries: fake.queries,
};

/** The real module opens a pool from DATABASE_URL on import; the unit tier never dials it. */
void mock.module('../db/client/index.ts', () => ({
  db: fake.db,
  client: {},
}));

/** ── Resend ──────────────────────────────────────────────────────────────── */

type SentEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: { filename: string; content: string }[];
};

export const emailControl = {
  /** Every email the app sent since the last reset. */
  sent: [] as SentEmail[],
  /** Throw from here to stand in for Resend refusing a message. */
  send: async (message: SentEmail): Promise<void> => {
    emailControl.sent.push(message);
  },
};

void mock.module('../lib/email/resend.ts', () => ({
  sendEmail: (message: SentEmail) => emailControl.send(message),
}));

/** ── Reset ───────────────────────────────────────────────────────────────── */

/** Call from `beforeEach`, so one test's steering cannot leak into the next. */
export function resetExternalMocks(): void {
  dbControl.respond = async () => [];
  dbControl.queries.length = 0;
  emailControl.sent = [];
  emailControl.send = async (message) => {
    emailControl.sent.push(message);
  };
}
