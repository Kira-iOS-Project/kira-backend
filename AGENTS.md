# AGENTS.md — Kira BE

> Enforced guardrails. Read §A and the Compliance Status table below before touching any code.

Every rule below is falsifiable and carries an **Enforcement** column: a lint rule name, a CI step,
a hook script, or the literal tag `advisory` (checked by code review or the reviewer subagent, not
by a machine). A rule that only lives in prose is a wish — see `.claude/anti-patterns/` for what
happens when one gets skipped.

> **Numbers are append-only.** A new rule takes the next free number, whatever section it sits
> in: Rules 42, 43, 49 and 50 live in §G. If several repos share this numbering, say so here and never
> renumber locally. A review citing "Rule 12" otherwise means two different things depending on
> who is reading, and the rule-citation check (`scripts/check/ai-config.sh`) disagrees with both.

---

## Compliance Status — read this first

> **Fill this table in honestly before you use this document.** It is the single highest-value
> section here, and the one most often skipped.

Most repos adopt rules **after** growing a real domain. Some sections will describe what the code
already does; others describe a target it has not reached. Stating which is which is what keeps the
whole document trustworthy — an agent that cites a rule for a file that does not exist wastes a
session, and after that it stops trusting any rule in the file.

| Section | Status | What that means here |
|---|---|---|
| §A Protocol | Enforced | Applies as written. Commits are `type: description`. |
| §B Layer boundaries | Enforced | Eight modules (`meta`, `auth`, `account`, `score`, `home`, `billing`, `scholarship`, `jobs`), each routes → handler → service → repository; `jobs` has no routes, only the scheduled-job list. `home` reads `score` through its `index.ts`. The oxlint import rules bind every one; the service and handler overrides sit after the cross-module one, which used to replace them. |
| §C Error contract | Enforced | `src/lib/errors/` is the whole contract; base `https://api-kira.serenitycode.tech/problems/`; `check:openapi` holds the spec side. |
| §D Database | Enforced | Seventeen tables in four domain files under `src/db/schema/` (SSOT.md § Database), with their indexes and CHECK constraints mirroring the zod rules, in one generated migration. Migrations run at boot. |
| §E Testing | Enforced | Unit tier at 100% per file, against the fake Postgres client (`src/test/fake-postgres.ts`) and the shared doubles in `src/test/preload.ts`. No integration test yet; `src/test/config.ts` is ready for the first. |
| §F Security | Enforced | Rules 22 to 25 bind. Auth is email + one-time code with opaque bearer tokens (SSOT.md § Authentication); every route but `/health`, `/email/*` and `/api/auth/{code,verify,refresh}` sits behind `requireSession`. Rule 24 is satisfied by the auth module's Postgres-counted code limits. |
| §G Code quality | Enforced | Applies as written, Rules 43 (`src/lib/constants/`), 49 (`check:comments`) and 50 (English identifiers) included. |
| §H Query & performance | Enforced | Applies as written: explicit columns, a `.limit()` on every list, keyset cursors, batched writes, and an index for every filtered column in the schema. No table is near 100k rows yet, so Rule 33 has not been exercised. |
| §I Runtime hardening | Enforced | Pool, CORS allowlist (empty by default: the iOS app needs none), request id, body limit, timeout and secure headers are in place. |

Three conventions that make this table work:

**Three states, not two.** "Partial" carries most of the value — a section where two rules bind and
one does not is the common case, and collapsing it to Enforced or Not met loses exactly the detail
someone needs.

**Say what to do in the meantime.** A section marked Not met should name the shape to follow until
the migration lands. Otherwise each contributor invents a third shape, and the migration gets
harder rather than easier.

**List the follow-up work in order.** A numbered list below the table, each entry naming the
section it unblocks, turns a list of deviations into a plan.

Tracked follow-up work, in the order it should happen:

1. Catat (chat, transactions, usage, bank imports) merges from `work/b3-catat`. Until then
   `error-codes.test.ts` fails on its eleven codes, which nothing on this branch raises — completes
   §C
2. The first `*.integration.test.ts`, against the dev database through the tunnel: the health-check
   save transaction and the import commit are the first candidates — exercises §E Rule 20
3. A rehearsed restore of the daily backup — §D
4. If the API ever runs a second replica: move the code limits' counting and the scheduler's single
   runner to a shape that holds across processes (an advisory lock), and set `JOBS_ENABLED=false`
   on all but one — §F Rule 24, §I

Finally, record any **known behaviour that looks like a bug and is not**. Something like a health
endpoint reporting a failed dependency inside a 200 response is the kind of thing that gets
"fixed" by someone who does not know it was deliberate — one sentence here prevents that.

Known behaviour, deliberate:

- `POST /api/auth/code` answers 202 for any address, account or not, so it never tells anyone who
  has an account.
- `GET /api/score`, `GET /api/score/indicators/{key}` and `GET /api/home` may write: the first read
  in a payday period stores that period's score snapshot. That is the payday re-check, with no job.
- `POST /api/me/deletion` deletes the account even when its notice email fails (the failure is
  logged). A data-export email that fails answers 503, because nothing was done.
- Checkout, gifts and the Beasiswa Kira review are simulations: no money moves, and the hourly job
  "renews" a paid plan by writing an invoice row.
- Without `RESEND_API_KEY` outside production, emails are logged instead of sent; the sign-in code
  appears in the log.
- Urungkan takes the whole batch back: a transaction of the batch edited after Simpan (within the
  30 s window) is deleted with the rest, and its draft returns with the values it was saved with.
- The data export (`GET /api/me/export` and its email) holds at most 50 000 transactions
  (`EXPORT_ROW_LIMIT`), newest first. Years of typical use stay far below it.
- Someone else can spend an address's code tries and checks (10 per 15 minutes) by guessing at it.
  That briefly blocks its owner's sign-in; it never lets the guesser in.

---

## §A. Protocol

| # | Rule | Enforcement |
|---|------|-------------|
| 1 | **Read first.** Identify every file a change touches before writing code. State what will change and why if the approach isn't obvious. This repo's commit convention is `type: description` (no scope). If a sibling repo uses `type(scope): subject`, that difference is deliberate — pick one format per repo and state it, rather than mixing both. | advisory |
| 2 | **Simplicity first.** Minimal change that achieves the goal. Do not add abstractions — a shared test helper, a new lib module — that nothing currently needs. The repository is not one of them: Rule 4 makes it part of every module that touches the database. Reuse before writing, in this order: this codebase, the standard library (Web APIs, Bun and Node built-ins), Hono's and Drizzle's built-ins, a dependency already in `package.json`; only then add a dependency or new code. | advisory / `agent-be-hono:reviewer` |
| 3 | **Surgical changes.** Do not touch files outside the task's scope, including reformatting code you didn't otherwise change. | advisory / `agent-be-hono:reviewer` |
| 4 | **Every module that touches the database has a service and a repository.** The shape is `routes → handler → service → repository → db`. The service holds the business rules and depends on the repository's type (the port), injected as a default parameter. `<module>.repository.ts` is the module's only file that imports `drizzle-orm`, `postgres` or `src/db`: it owns every query and every transaction boundary (Rule 10 gives its shape). A module with no data access has no repository. The owner's decision (2026-10-16): an explicit data-access layer in every module, over the kit's repository-on-escalation default. | `.oxlintrc.json` (services may not import `drizzle-orm`, `postgres` or `src/db`) / `agent-be-hono:reviewer` |

---

## §B. Layer Boundaries

**Rule 5 — Layer ownership**

| Layer | File | Responsibility |
|-------|------|-----------------|
| Routes | `<module>.routes.ts` | `createRoute()` specs + `router.openapi(route, handler)` binding. Declares `responses`, including error responses via `errorResponses()` (`src/lib/errors/problem.ts`). |
| Handler | `<module>.handler.ts` | HTTP glue only. Reads `c.req.valid(...)`, calls the service, shapes the response. Typed `RouteHandler<typeof route, AppEnv>`. ≤15 lines (Rule 28). No try/catch for domain errors. |
| Service | `<module>.service.ts` | Business rules. Never imports `Context`, `drizzle-orm`, `postgres` or `src/db`. Dependencies, the repository first, injected via default parameters. Throws `DomainError` subclasses. |
| Repository | `<module>.repository.ts` | Every query and transaction boundary of the module (Rules 4 and 10): the port type, the Drizzle adapter, its default instance. The only layer that touches the database. |
| Schema | `<module>.schema.ts` | Zod request/response schemas. |
| Errors | `<module>.errors.ts` | Module-specific `DomainError` subclasses. |
| Index | `index.ts` | Barrel — the ONLY file another module or `app.ts` may import from. |

`src/modules/meta/` is the reference module, built to the full shape: copy it (`src/modules/auth/`
is the fullest worked example: a middleware, an email, a transaction-heavy repository). A
module that predates these rules and skips a layer is a deviation to record in Compliance Status,
not a pattern to copy: **a new module gets a service, and a repository when it touches the database.**

Enforcement: `.oxlintrc.json` overrides for `src/modules/*/**`.

**Rule 6 — Handlers: ALLOWED / FORBIDDEN**

```ts
/** FORBIDDEN — handler reaching into the DB directly */
import { db } from "../../db/client/index.ts";
export const getThing: RouteHandler<typeof getThingRoute, AppEnv> = async (c) => {
  const row = await db.select()... /** no — this belongs in the repository, called by the service */
  return c.json(row, 200);
};

/** ALLOWED — thin glue, service owns the logic */
import { getThingReport } from "./thing.service.ts";
export const getThing: RouteHandler<typeof getThingRoute, AppEnv> = async (c) => {
  const report = await getThingReport();
  return c.json(report, 200);
};
```

Enforcement: `.oxlintrc.json` — `src/modules/*/*.handler.ts` forbids importing `drizzle-orm`,
`postgres`, or anything under `**/db/**`.

**Rule 7 — Services are pure**

No `Context` import, ever. Dependencies come in as default parameters so a test can override
them with a plain object — no container, no mocking library:

```ts
/** src/modules/meta/meta.service.ts */
export async function getHealthReport(
  deps: { repository?: MetaRepository } = {},
): Promise<HealthResponse> {
  const repository = deps.repository ?? metaRepository;
  /** ... */
}
```

Enforcement: `.oxlintrc.json` — `src/modules/*/*.service.ts` forbids Hono, `drizzle-orm`, `postgres`
and anything under `**/db/**`; `agent-be-hono:reviewer`.

Tests do not replace modules one file at a time. External clients (Postgres, Redis, the queues,
the auth library, every provider SDK) are replaced once, in the shared doubles under `src/test/`
(`preload.ts` and the controls it exports), because `mock.module` is process-wide (see
`.claude/anti-patterns/bun-mock-module-is-process-wide.md`); `bun run check:mocks` refuses a
per-file replacement. A repository that imports a client at module scope is therefore still testable:
pass a client to its factory, or steer it through those controls.

**Rule 8 — Cross-module imports go through `index.ts` only**

```ts
/** FORBIDDEN — reaching into another module's internals */
import { getHealthReport } from "../health/health.service.ts";

/** ALLOWED — the module's public barrel */
import { healthRouter } from "../health/index.ts";
```

Enforcement: `.oxlintrc.json` — `src/modules/*/**` forbids `../*/[!index]*`.

**Rule 9 — `lib/` and `middlewares/` never import from `modules/`**

The dependency direction is one-way: `modules/* → lib/*, db/*, middlewares/*`. Reversing it
creates a cycle the moment two modules share infrastructure.

Enforcement: `.oxlintrc.json` — `src/lib/**` and `src/middlewares/**` forbid `**/modules/**`.

**Rule 10 — The repository's shape**

```ts
/** src/modules/meta/meta.repository.ts */
export type MetaRepository = { ping(): Promise<void> };           /** the port the service uses */

export function createMetaRepository(client: DbLike = db): MetaRepository {  /** the Drizzle adapter */
  return { async ping() { await client.execute(sql`SELECT 1`); } };
}

export const metaRepository = createMetaRepository();             /** the default instance */
```

- One method per question the service asks, named for the domain (`findActiveByOwner`, never a
  generic `findAll`/`save` or a base class shared by every repository).
- Explicit column projection (Rule 30), an explicit `.limit()` on lists (Rule 29), transactions
  inside one method (Rule 35). It returns rows shaped for the service and throws nothing of its own:
  the service turns a failure into a `DomainError`.
- Tests: the repository with a client double passed to its factory (and its SQL through `.toSQL()`
  where the query's shape matters, Rule 33); the service with a repository double.

Enforcement: `agent-be-hono:reviewer`.

---

## §C. Errors — RFC 9457 `application/problem+json`

Every code a client can receive is listed once in `src/lib/errors/error-codes.ts`; the registry and
the envelope's fields are in `.claude/rules/common/error-codes.md`. Every problem's `type` is
`PROBLEM_TYPE_BASE` (one absolute https base per API, exported by `src/lib/errors/problem.ts`) plus
its code, and its `title` is fixed per code: clients resolve a failure by that `type`, so the base
is set once and never changed, and nothing sends `about:blank`. Enforcement: `check:openapi` (the
spec's `Problem` contract); the mapper itself is advisory / `agent-be-hono:reviewer`.

**Rule 11 — Every thrown error is a `DomainError` subclass or a Hono `HTTPException`.** Never
hand-roll a JSON error body (`c.json({ error: "..." }, 400)`) in a handler or service — that's
exactly the four-envelope drift this contract replaced. `src/lib/errors/problem.ts`'s
`handleAppError` (wired via `app.onError` in `src/app.ts`) is the only place a thrown error
becomes a response. Enforcement: advisory / `agent-be-hono:reviewer`.

**Rule 12 — `userMessage` is client-safe. The second constructor argument (`internalDetail`)
is logs-only and must never contain IDs, stack traces, or internals that could help an
attacker.**

```ts
/** src/modules/health/health.errors.ts — an example */
export class HealthCheckFailedError extends ServiceUnavailableError {
  constructor(report: { database: string; redis: string }) {
    super(
      "One or more dependencies are unhealthy.",       /** userMessage -> client */
      `database=${report.database} redis=${report.redis}`, /** internalDetail -> logs only */
      "META_HEALTH_UNHEALTHY",                          /** stable machine code */
    );
  }
}
```

Enforcement: advisory / `agent-be-hono:reviewer`.

**Rule 13 — Every route declares the error responses its service can actually throw**, via
`errorResponses(...)` from `src/lib/errors/problem.ts`, plus `422` (the shared `defaultHook` can fire
on any route with request validation). A route whose `responses` map only lists `200` is lying
to the OpenAPI spec the moment its service throws anything. Enforcement: advisory (no automated
OpenAPI-vs-service-throws diff exists yet — flag in review).

**Rule 14 — A new HTTP status needs a new base class in `src/lib/errors/errors.ts`,** not a one-off
inline error shape. The seven bases (`ValidationError`, `UnauthorizedError`, `ForbiddenError`,
`NotFoundError`, `ConflictError`, `TooManyRequestsError`, `ServiceUnavailableError`) cover
400/401/403/404/409/429/503; extend `DomainError` directly for anything else. Enforcement:
advisory.

---

## §D. Database

**Rule 15 — Never import `drizzle-orm`, `postgres`, or `src/db/**` in a `*.handler.ts`.**
Enforcement: `.oxlintrc.json` (see Rule 6).

**Rule 16 — Never hand-edit `src/db/migrations/`.** Generated by `bun run db:generate` only.
The one exception is a data backfill a schema change needs: `bun run db:generate --custom
--name <what>` (the project's own drizzle-kit, never a download) writes the empty file, its snapshot and its journal entry, and only that file's SQL
body is written by hand. It is replay-safe (`ON CONFLICT DO NOTHING`, or an `UPDATE` whose result
does not change on a second run), reviewed like code, and never a schema change. Enforcement:
agent-be-hono's `migration-guard` hook (blocking, so a person writes that body deliberately
rather than through an agent's edit) + `scripts/check/migrations.sh` in CI (fails the PR if the
migrations directory is out of date with the schema).

**Rule 17 — `src/db/client/index.ts` holds the one real connection pool for the running app.**
`{ max: 1 }` belongs only in `src/db/client/migrate.ts`, where a migration run genuinely needs a
single serialized connection. See `.claude/anti-patterns/postgres-max-1-pool.md`. Enforcement:
advisory / `agent-be-hono:reviewer`.

**Rule 18 — Transaction boundaries live in the repository** (`db.transaction(async (tx) => ...)`)
when one exists — never spread a multi-statement transaction across a service function.
Enforcement: advisory.

---

## §E. Testing

Coverage is 100% per file, lines and functions, over all of `src/**` outside a closed exemption
list: `.claude/rules/typescript/coverage.md`. The tiers are described in
`.claude/rules/backend/testing.md`.

**Rule 19 — Every module's service ships with unit tests and a local
`__tests__/helpers.ts`** exposing mock builders (`createXMock(overrides)`) before the module is
considered done. Keep helpers module-local until duplication across modules proves a shared
helper is worth it (see `src/modules/meta/__tests__/helpers.ts`). Enforcement:
advisory / `agent-be-hono:reviewer`.

**Rule 20 — Unit tests (`bun test src`) never touch real Postgres or Redis.** Anything that
needs a live dependency is a `*.integration.test.ts` file gated by
`shouldRunIntegrationTests()` (`src/test/config.ts`):

```ts
const testIntegration = shouldRunIntegrationTests() ? test : test.skip;
testIntegration("persists a row", async () => { /** real db */ });
```

Enforcement: the quality gate runs the unit tier only, with no `DATABASE_URL` and no database
service, so a unit test that dials Postgres fails there.
`bun run test:integration` runs the integration tier against a real Postgres (the dev database through
the tunnel, or a local one), locally or in a
CI job you add for it.

**Rule 21 — Route-level tests import the real `handleAppError`** from `src/lib/errors/problem.ts`
(via `app.ts`), never redeclare an inline error mapper — otherwise the test can pass while the
real mapping has silently drifted. Enforcement: advisory / `agent-be-hono:reviewer`.

---

## §F. Security

**Rule 22 — Never read `process.env` outside `src/env.ts`.** It is the only file that
validates and re-exports environment variables. Enforcement: advisory.

**Rule 23 — Never `console.*`.** Use `src/lib/server/logger.ts` (Pino). Enforcement:
`.oxlintrc.json` `no-console: error` (exempted only in `src/env.ts` and `src/db/client/migrate.ts`,
which run before the logger can exist).

**Rule 24 — A rate limit decides allow or deny first, exactly once, before any work it guards.**
The kit's form of this rule is about Redis (`await next()` never inside the Redis try/catch; see
`.claude/anti-patterns/rate-limit-double-next.md`). This repo runs no Redis, by the owner's decision,
so its limits are counted in Postgres. The limiters today are the sign-in code requests and checks
(`src/modules/auth/auth.limits.ts`, values in SSOT.md § Authentication). Each decision runs inside
the transaction that writes, under advisory locks on the address and the network
(`auth-codes.repository.ts`), so parallel requests cannot all pass a count read before any of them
wrote; over a limit they answer 429 `AUTH_CODE_RATE_LIMITED` before a code is stored, an email sent
or a code compared, and a code's 5 tries are claimed one by one with a conditional `UPDATE`. A
future limiter, middleware or not, keeps that shape: decide first, atomically with the write, then
call `next()` (or do the work) exactly once, and never fail open on a counting error. Enforcement:
advisory / `agent-be-hono:reviewer`; the parallel-burst tests in
`src/modules/auth/__tests__/auth.concurrency.test.ts`.

**Rule 25 — No `.env` file or secret is ever committed.** Enforcement: a staged gitleaks scan in
pre-commit (`scripts/check/gates.list`), then the quality gate's secret scan (gitleaks) +
`.env`-committed check (the `be-hono-quality-gate` workflow that
`.github/workflows/quality-gate.yml` calls), both diffing the actual PR range.

---

## §G. Code Quality

**Rule 26 — Max 200 lines per file (error, not warning).** Split into smaller files —
service, repository, sub-handler — before it grows past this. Blank lines and comments do not
count. Enforcement: `.oxlintrc.json`
`max-lines: ["error", { max: 200, skipBlankLines: true, skipComments: true }]`.

**Rule 27 — No `oxlint-disable` comments.** Fix the underlying issue instead of suppressing
the lint. Enforcement: advisory / `agent-be-hono:reviewer`.

**Rule 28 — Handlers stay ≤15 lines.** If a handler grows past that, the excess is business
logic that belongs in the service. Enforcement: advisory / `agent-be-hono:reviewer`.

**Rule 42 — No `any`.** No explicit `any` anywhere, tests included: not `: any`, `as any`,
`any[]`, `Record<string, any>`, nor a generic that defaults to it. External data is `unknown`,
narrowed with a type guard or parsed with Zod; a type that depends on the caller is a generic. No
`oxlint-disable` or `eslint-disable` to get past it. No double assertion through `unknown` either
(`x as unknown as T`): a test fake is a real object, a complete fixture, or a `Pick<...>`-narrowed
parameter. The detail is in `.claude/rules/typescript/types.md`. Enforcement: oxlint
`typescript/no-explicit-any` at `error`; `scripts/check/double-assertion.sh` in pre-commit and the
quality gate.

**Rule 43 — One home per identifier.** A literal another place must spell the same way — a role,
a status, a Redis key prefix, a queue name, an error code — is declared once under
`src/lib/constants/` and imported everywhere, tests included, so renaming it is one edit. The old
location never re-exports it. A literal nothing else depends on stays inline, and a vendor's
vocabulary (a provider SDK's status string, BullMQ's `'failed'`, `PromiseSettledResult`'s
`'rejected'`) is not ours to centralise. A test that exists to prove two sides agree keeps its
literal independent, with the reason in `scripts/check/constants.config.json`. Enforced by
`bun run check:constants`, which derives the vocabulary from each home rather than holding a copy
of it.

**Rule 49 — Comments are `/** … */`, never `//`.** A note above code, a file header, a trailing
remark: all of them open with `/**`, in code and in the TypeScript, JavaScript and Swift examples
of the Markdown this repo owns. The only `//` left is a directive a tool reads
(`@ts-expect-error`, `oxlint-disable`, `v8 ignore`, a triple-slash reference). Files the kit manages
keep its `/* … */` notes, so a sync never reports them as drift. Enforced by
`bun run check:comments` (`scripts/check/comment-style.mjs`, which `--fix` rewrites). The owner's
decision, 2026-10-16.

**Rule 50 — Identifiers are English; Indonesian is only text a person reads.** Types, functions,
variables, parameters, enum values, error codes, constants, route paths, table and column names,
test names and file names are English. Kira speaks Indonesian only through the iOS app's String
Catalog translations; the API returns codes and English `title`s, never Indonesian copy. A design
name quoted from the canvas (`CAT-05 · Scan Struk`) may appear in docs and tickets, never as an
identifier. Enforced by `agent-be-hono:reviewer`. The owner's decision, 2026-10-16.

---

## §H. Query & Performance

The deeper reference for everything here is `.claude/rules/backend/drizzle.md` (schema, index,
and query patterns) and `.claude/rules/backend/performance.md` (caching, budgets, N+1
checklist). This section is the enforced, numbered subset.

**Rule 29 — No unbounded reads.** Every list query carries an explicit `.limit()`, and every
list endpoint is paginated. **Keyset is the default** — it stays O(1) at any depth and, unlike
`OFFSET`, cannot skip or duplicate rows when the underlying data changes mid-traversal:

```ts
/** keyset — needs a composite index on (created_at DESC, id DESC), see Rule 32 */
const page = await db
  .select({ id: things.id, name: things.name, createdAt: things.createdAt })
  .from(things)
  .where(cursor ? lt(things.createdAt, cursor) : undefined)
  .orderBy(desc(things.createdAt), desc(things.id))
  .limit(limit);
```

`.offset()` is allowed only for an admin table that is known to stay small and genuinely needs
jump-to-page; when you use it, write the row ceiling you are assuming in a comment.
Enforcement: advisory / `agent-be-hono:reviewer`.

**Rule 30 — Select columns explicitly.** `db.select({ id: t.id, name: t.name })`, never a bare
`db.select()` on a table carrying `text`, `jsonb`, or array columns — a bare select ships every
byte of those columns over the wire on every request. In the relational query builder use
`columns: {...}`, which Drizzle applies as a partial select at the query level (no extra data
leaves Postgres). Enforcement: advisory / `agent-be-hono:reviewer`.

**Rule 31 — No query inside a loop (N+1).** Batch with `inArray()`, a join, or the relational
query builder's `with:` — Drizzle emits that as a single statement using `LEFT JOIN LATERAL` +
`json_agg`, not one query per parent row. Independent queries go in `Promise.all`:

```ts
/** FORBIDDEN — one round trip per id */
for (const id of ids) rows.push(await db.select().from(things).where(eq(things.id, id)));

/** ALLOWED — one round trip */
const rows = await db.select().from(things).where(inArray(things.id, ids));
```

Enforcement: `.oxlintrc.json` `no-await-in-loop: error`.

**Rule 32 — Every column you filter, sort, or join on is indexed, in the same PR as the
query.** Foreign key columns are always indexed — Postgres creates an index for a PRIMARY KEY
but **not** for a `REFERENCES` column. Composite index column order is equality columns first,
then the range/sort column. Use a partial index when the query always carries the same constant
predicate. Enforcement: `scripts/check/index-coverage.sh` (CI) + `agent-be-hono:reviewer`.

**Rule 33 — A query against a table expected to exceed ~100k rows ships with `EXPLAIN (ANALYZE,
BUFFERS)` output in the PR.** A `Seq Scan` on a request-path query is a blocker unless the PR
says why it is acceptable. Enforcement: `.github/PULL_REQUEST_TEMPLATE/dev.md` checklist.

**Rule 34 — Hot-path queries use prepared statements** — `.prepare("name")` plus
`sql.placeholder()`, so the SQL is concatenated once and Postgres reuses the parsed plan. Do
not prepare one-off or admin queries: prepared statements only pay off on repeated execution,
and they buy nothing when the query is slow to *execute* rather than slow to *parse*. Behind a
transaction-mode pooler (PgBouncer, Supabase pooler) server-side prepared statements break
outright — that deployment requires `DB_PREPARE=false` (Rule 38). Enforcement: advisory.

**Rule 35 — Transactions are short and live in the repository.** No HTTP call, no Redis round
trip, no non-DB `await` inside `db.transaction()` — every one of those holds a connection and a
row lock open for the duration of something the database cannot see. The upper bound is
enforced by `statement_timeout` and `idle_in_transaction_session_timeout` on the pool (Rule 38).
Enforcement: advisory / `agent-be-hono:reviewer`.

**Rule 36 — Writes are batched.** One `db.insert(t).values([...])` for N rows, never N inserts.
Upsert via `.onConflictDoUpdate()` — a select-then-insert is a race, not an upsert.
Enforcement: `no-await-in-loop` + `agent-be-hono:reviewer`.

**Rule 37 — Every Drizzle query is awaited.** Drizzle's query builders are *thenables*: a
missing `await` returns a builder object that type-checks fine and silently never runs. This is
the most expensive class of bug available in this stack, and it is invisible without type-aware
linting. Enforcement: `.oxlintrc.json` `typescript/no-floating-promises`,
`typescript/no-misused-promises`, `typescript/await-thenable` — all type-aware, which is why
`bun run lint` passes `--type-aware` and `oxlint-tsgolint` is a required devDependency.

---

## §I. Runtime & HTTP Hardening

**Rule 38 — The connection pool is configured, never left at defaults.** `src/db/client/index.ts` sets
`max`, `idle_timeout`, `connect_timeout`, `max_lifetime`, and — the one that actually prevents
an outage — `connection.statement_timeout` plus `idle_in_transaction_session_timeout`. Without
those, one stuck query holds a pooled connection forever. `max` × replica count must stay under
Postgres's `max_connections`. This does **not** repeal Rule 17: what is forbidden there is
`max: 1`, not explicit configuration. Enforcement: `quality-gate.yml` greps
`src/db/client/index.ts` for a pool cap of 1 or 2 and for both timeouts.

**Rule 39 — CORS is an allowlist, never a bare `cors()`.** Bare `cors()` sends
`Access-Control-Allow-Origin: *`. Origins come from `env.CORS_ORIGINS`. Enforcement:
`quality-gate.yml` greps `src/app.ts` for `cors()` with no argument.

**Rule 40 — Every request carries a correlation ID.** `requestId()` is the first middleware
registered; the ID goes into every Pino line and out on the `X-Request-Id` response header, so
a client-reported failure can be traced to its log lines. Enforcement: advisory / `agent-be-hono:reviewer`.

**Rule 41 — `/api/*` has a request budget: `bodyLimit`, `timeout`, and `secureHeaders`.** The
middleware order in `src/app.ts` is part of the contract, not a preference — it is documented
inline there and in `.claude/rules/backend/hono.md`. Enforcement: `quality-gate.yml` greps
`src/app.ts` for all three.

---

## §P. Payload Contract (where adopted)

Only where setup answered `payload-encryption=yes` (a `payload.config.json` exists). The full
contract and its threat model: `.claude/PAYLOAD-CONTRACT.md`; the short form loads from
`.claude/rules/common/payload-contract.md`.

**Rule 44 — Every body that crosses a service boundary is sealed**, unless its route is exempted
in `payload.config.json` with a written reason. A half-policy is chosen by what the body needs
(`response-only` for a multipart upload, `request-only` for an event stream), never by how
sensitive it looks.

**Rule 45 — No route path outside the registry.** Paths come from `src/lib/endpoints/endpoints.ts`, never a typed `/api/...`; `endpoints.generated.ts` is
regenerated (`bun run generate:endpoints`), never edited.

**Rule 46 — Encrypt at the transport only.** The payload middleware opens requests before any validator and seals responses; handlers and services see plaintext. It reads the body from `c.req.raw`, never `c.req.text()`. Nothing else imports `src/lib/payload/`.

**Rule 47 — Keys are added, never repurposed**: one variable per hop, `<NAME>_NEXT` for rotation,
never public, never printed or committed. Tests use placeholder bytes and the real cipher.

**Rule 48 — The committed switch says `strict`.** Debug with `PAYLOAD_MODE=off` in your own
shell; every service refuses `off` in production.

---

## How to Add a New Module

Copy `src/modules/meta/` — the reference module, built to the full shape (errors,
schema, service with injected dependencies, thin handler, route owning the OpenAPI contract,
tests). Do **not** copy a module your Compliance Status lists as a deviation.

**Step 1 — Directory:** `src/modules/<name>/`

**Step 2 — Errors** (`<name>.errors.ts`). Add the code to `ERROR_CODES` in
`src/lib/errors/error-codes.ts` first; `DomainError` takes an `ErrorCode`, so an unlisted code
fails `tsc`.

```ts
import { NotFoundError } from "../../lib/errors/errors.ts";

export class ThingNotFoundError extends NotFoundError {
  constructor(id: string) {
    super("Thing not found.", id, "THING_NOT_FOUND");
  }
}
```

**Step 3 — Schema** (`<name>.schema.ts`)

```ts
import { z } from "@hono/zod-openapi";

export const thingResponseSchema = z
  .object({ id: z.string(), name: z.string() })
  .openapi("Thing");

/**
 * Rule 29: list endpoints are keyset-paginated. Pair a cursor query schema
 * (ListThingsQuerySchema) with a { data, nextCursor } response schema.
 */
```

**Step 4 — Service** (`<name>.service.ts`) — business rules over the repository's port, taken as a
default parameter so it is testable without a database (Rule 7); throws the module's domain errors.
Never imports Hono, `drizzle-orm` or `src/db`; `.oxlintrc.json` enforces that.

**Step 5 — Repository** (`<name>.repository.ts`) — required when the module touches the database
(Rule 4), in the shape Rule 10 gives: the port, the factory over `client = db`, the default instance.
Explicit column projection (Rule 30), an explicit `.limit()` (Rule 29), and an index for every
filtered/sorted/joined column committed in the same PR (Rule 32).

**Step 6 — Handler** (`<name>.handler.ts`)

```ts
import type { RouteHandler } from "@hono/zod-openapi";
import type { AppEnv } from "../../lib/server/factory.ts";
import { getThing } from "./thing.service.ts";
import type { getThingRoute } from "./thing.routes.ts";

export const handleGetThing: RouteHandler<typeof getThingRoute, AppEnv> = async (c) => {
  const { id } = c.req.valid("param");
  const thing = await getThing(id);
  return c.json(thing, 200);
  /** No try/catch — ThingNotFoundError propagates to app.onError. */
};
```

**Step 7 — Routes** (`<name>.routes.ts`)

```ts
import { createRoute, z } from "@hono/zod-openapi";
import { errorResponses } from "../../lib/errors/problem.ts";
import { createRouter } from "../../lib/server/factory.ts";
import { handleGetThing } from "./thing.handler.ts";
import { thingResponseSchema } from "./thing.schema.ts";

export const getThingRoute = createRoute({
  method: "get",
  path: "/{id}",
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { content: { "application/json": { schema: thingResponseSchema } }, description: "OK" },
    ...errorResponses(404, 422), /** Rule 13: every status the service can throw */
  },
});

const thingRouter = createRouter();
thingRouter.openapi(getThingRoute, handleGetThing);
export { thingRouter };
```

**Step 8 — Index** (`index.ts`)

```ts
export { thingRouter } from "./thing.routes.ts";
```

**Step 9 — Mount in `src/app.ts`**

```ts
import { thingRouter } from "./modules/thing/index.ts";
app.route("/api/things", thingRouter);
```

Mount under `/api/*` unless there is a reason not to — that prefix is what carries the request
budget and rate limiting (Rule 41). A health-check module is the exception, mounted at `/`,
because a health check must answer even when rate limiting would not let it.

**Step 10 — Tests** (`__tests__/helpers.ts` + `__tests__/<name>.service.test.ts`, plus a route
test through the real `app`) — see `src/modules/meta/__tests__/` for the pattern
(Rules 19–21).

**Step 11 — Verify:** `bash scripts/check/gates.sh`, then `bun run build`.

---

## Core Files — Handle With Care

| File | What It Controls | Risk of a Bad Change |
|------|--------------------|------------------------|
| `src/lib/server/factory.ts` | `AppEnv` context type, router/middleware creation for the whole app | Every module's typing breaks at once |
| `src/lib/errors/errors.ts` | The `DomainError` hierarchy every module builds on | Silently changes every error's HTTP status/shape |
| `src/lib/errors/problem.ts` | The single error-to-HTTP-response mapper | Breaks the error contract for every route, and every FE error path, at once |
| `src/app.ts` | Middleware order, error handler wiring, route mounts | Breaks all HTTP routing; reordering the chain silently removes the request budget |
| `src/env.ts` | Validated env vars — process exits if the schema doesn't match | Breaks startup for everyone |
| `src/db/client/index.ts` | The app's real connection pool | Reintroducing `{ max: 1 }` here serializes every request onto one connection |
| `src/db/schema/*.ts` | Table definitions and every index | A dropped index turns a hot query into a sequential scan with no other symptom |
| `src/db/client/migrate.ts` | The migration run at every boot | A failure here stops every deploy at start-up |

AI agents: do not modify these files unless the task explicitly requires it. Prefer adding a
new module over changing shared infrastructure.
