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

function fakeMethods(client: object, respond: () => FakeResponder, log: FakeQuery[]): FakeMethods {
  return {
    unsafe(sql, params = []) {
      const query = { sql, params };
      log.push(query);
      const rows = (async () => respond()(query))();
      return Object.assign(rows, {
        values: async () => (await rows).map((row) => Object.values(row)),
      });
    },
    begin: (run) => run(client),
    savepoint: (run) => run(client),
  };
}

/**
 * A Drizzle database over the fake client, and the statements it received, in order.
 * `drizzle.mock()` builds the real session over a bare client object; the methods the session calls
 * are added to that same object, which Drizzle exposes as `$client`.
 */
export function createFakeDb(responder: FakeResponder = () => []) {
  const queries: FakeQuery[] = [];
  const state = { responder };
  const db = drizzle.mock();
  const client: unknown = Reflect.get(db, '$client');
  if (typeof client !== 'object' || client === null)
    throw new Error('drizzle.mock() kept no client');
  Object.assign(
    client,
    fakeMethods(client, () => state.responder, queries),
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
