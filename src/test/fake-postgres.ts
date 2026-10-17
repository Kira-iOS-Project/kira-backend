/**
 * A stand-in for the postgres.js client under a real Drizzle database, so the unit tier runs the
 * SQL Drizzle actually builds without a server (AGENTS.md Rule 20).
 *
 * Drizzle's postgres-js session calls `client.unsafe(sql, params)` and, for a select or a
 * `returning`, `.values()` on its result; a transaction calls `client.begin(fn)`. This client hands
 * each statement to a responder, which answers with rows written as objects in the column order of
 * the query (`select({ id, email })` is answered `{ id: 'u1', email: 'a@b.c' }`). Insertion order is
 * what turns an object into the positional row Drizzle maps back.
 */

import { drizzle } from 'drizzle-orm/postgres-js';

export type FakeQuery = { sql: string; params: readonly unknown[] };
export type FakeRow = Record<string, unknown>;
export type FakeResponder = (query: FakeQuery) => FakeRow[] | Promise<FakeRow[]>;

type FakeResult = Promise<FakeRow[]> & { values(): Promise<unknown[][]> };

type FakeMethods = {
  unsafe(sql: string, params?: readonly unknown[]): FakeResult;
  begin<T>(run: (client: unknown) => Promise<T>): Promise<T>;
  savepoint<T>(run: (client: unknown) => Promise<T>): Promise<T>;
};

/**
 * Runs transactions one after another when `serial` is set: the stand-in for the row and advisory
 * locks that make Postgres serialize them, so a test can fire a burst of parallel requests.
 */
function transactionRunner(serial: boolean) {
  let tail: Promise<void> = Promise.resolve();
  return async <T>(run: () => Promise<T>): Promise<T> => {
    if (!serial) return run();
    const previous = tail;
    const { promise: done, resolve } = Promise.withResolvers<void>();
    tail = done;
    await previous;
    try {
      return await run();
    } finally {
      resolve();
    }
  };
}

/**
 * Fails like postgres.js does on a live server: a JS Date reaches the driver only when it was bound
 * inside a raw sql`` fragment, where no column maps it to a string first. Drizzle's own column binds
 * arrive as ISO strings, so a Date here is the bug that made PUT /api/care/debt-emergency a 500.
 * Bind `${date.toISOString()}::timestamptz` instead.
 */
function rejectUntypedDates(params: readonly unknown[]) {
  const index = params.findIndex((param) => param instanceof Date);
  if (index === -1) return;
  throw new TypeError(
    `The "string" argument must be of type string. Received an instance of Date (param $${index + 1})`,
  );
}

function fakeMethods(
  client: object,
  respond: () => FakeResponder,
  log: FakeQuery[],
  serial: boolean,
): FakeMethods {
  const inTransaction = transactionRunner(serial);
  return {
    unsafe(sql, params = []) {
      rejectUntypedDates(params);
      const query = { sql, params };
      log.push(query);
      const rows = (async () => respond()(query))();
      return Object.assign(rows, {
        values: async () => (await rows).map((row) => Object.values(row)),
      });
    },
    begin: (run) => inTransaction(() => run(client)),
    savepoint: (run) => run(client),
  };
}

/**
 * A Drizzle database over the fake client, and the statements it received, in order.
 * `drizzle.mock()` builds the real session over a bare client object; the methods the session calls
 * are added to that same object, which Drizzle exposes as `$client`.
 */
export function createFakeDb(
  responder: FakeResponder = () => [],
  options: { serialTransactions?: boolean } = {},
) {
  const queries: FakeQuery[] = [];
  const state = { responder };
  const db = drizzle.mock();
  const client: unknown = Reflect.get(db, '$client');
  if (typeof client !== 'object' || client === null)
    throw new Error('drizzle.mock() kept no client');
  Object.assign(
    client,
    fakeMethods(client, () => state.responder, queries, options.serialTransactions ?? false),
  );
  return {
    db,
    queries,
    /** Replace the responder of an existing database. */
    respondWith(next: FakeResponder) {
      state.responder = next;
    },
  };
}

/**
 * A responder that answers the statements in turn with the given row sets, then with no rows. It
 * matches nothing by text: a test that cares which statement got which rows asserts on `queries`.
 */
export function inOrder(...rowSets: FakeRow[][]): FakeResponder {
  let next = 0;
  return () => rowSets[next++] ?? [];
}
