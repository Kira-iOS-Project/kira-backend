# SSOT.md — `kira-backend`

**Owner:** `@adhibuchori`
**Last verified against repo:** `2026-10-15`

> `CLAUDE.md` routes and `AGENTS.md` forbids; this file **describes**. It is the only one of the
> three that goes stale on its own, hence the date above: if it is months old, treat it as a lead,
> not as authority. Every claim below is verifiable by reading the file it names.

## What

The API of Kira, an iOS personal-finance companion. Its one consumer is the iOS app
(`kira-mobile-ios`), which generates its client from this repo's committed `openapi.json`: a
response-shape change is a breaking change for every installed build.

## Ecosystem

```
kira-mobile-ios  →  kira-backend   (HTTPS, https://kira-backend.codesheesh.com)
kira-backend     →  Postgres       (Dokploy's internal network, DATABASE_URL)
```

This repo calls nothing else: no Redis, no queue, no object storage, no email or AI provider yet.
No such variable exists in `src/env.ts`. Each of those arrives with the ticket that needs it, and
this diagram changes in the same pull request.

## Stack

Bun 1.4 · Hono · `@hono/zod-openapi` (OpenAPI-first routing) · Scalar (`/docs`, development only)
· Drizzle ORM · PostgreSQL 18 (`postgres` driver) · Pino. No Redis, by the owner's decision.

## Architecture

Modular monolith — feature verticals with internal layering. `src/modules/meta/` is the reference
module; `AGENTS.md` "How to Add a New Module" is the pattern every module follows. Folders hold
files or folders, never both (`.claude/rules/common/folder-shape.md`).

```
src/
  index.ts             bootstrap: env first, migrations, docs, Bun.serve, ordered shutdown
  app.ts               composition only: middleware, onError/notFound, app.route() mounts.
                       Middleware order is fixed by AGENTS.md §I Rule 41
  env.ts               Zod env schema; the only file that reads process.env; exits on a bad value
  lib/
    constants/         the one home of every shared identifier (AGENTS.md Rule 43)
    errors/            errors.ts (DomainError), problem.ts (the RFC 9457 mapper, the 422
                       defaultHook, the 404 handler), error-codes.ts (ERROR_CODES)
    server/            factory.ts (createRouter, AppEnv), logger.ts (Pino), openapi.ts (/docs),
                       shutdown.ts (ordered, single-shot shutdown)
  db/
    client/            index.ts (the real pool), migrate.ts (the boot-time migration run)
    schema/            schema.ts (no table yet; the `timestamps` bundle every table spreads)
    migrations/        drizzle-kit output, never hand-edited (only the empty journal so far)
  middlewares/         logger.middleware.ts (request start and finish lines)
  modules/meta/        GET /health: routes, handler, service, schema, errors, index, __tests__/
  test/                preload.ts (the shared doubles), config.ts (the integration-tier switch)
```

There is no `middlewares/auth` and no `middlewares/rate-limit`: nothing needs them while `/health`
is the only route. AGENTS.md's Compliance Status lists both as the next follow-up.

## Authentication

None yet. The product design signs people in with their email and a one-time code (sent with
Resend), with no Apple or Google sign-in. Before the first protected route: choose the library or
the hand-rolled flow, rate-limit the code routes per email and per IP (in memory or in Postgres:
there is no Redis), keep the bearer token short-lived, and record each decision here.

## Error Contract — RFC 9457

Every thrown error becomes `application/problem+json`: `{ type, title, status, detail, instance,
code, requestId }`, plus `fields` on a 422. `type` is `PROBLEM_TYPE_BASE` plus the code, never
`about:blank`; `title` is fixed per code. Problem type base:
`https://kira-backend.codesheesh.com/problems/` (set before the first release; never change it).
`app.onError` (`handleAppError`) is the single mapper for `DomainError` subclasses, Hono
`HTTPException` and unknown errors, and `app.notFound` gives unmatched routes the same shape. Every
code is listed once in `src/lib/errors/error-codes.ts`; the spec publishes them as the
`Problem.code` enum. Rules: `AGENTS.md` §C and `.claude/rules/common/error-codes.md`.

## Database

- Two Postgres 18 instances (pgvector image) on the VPS, managed by Dokploy project **Kira**:
  `DB-Kira` (production, database `kira`, owner `kira`) and `DB-Kira-Dev` (development, database
  `kira_dev`, owner `kira_dev`). Access, roles and the tunnel: `.claude/DATABASE.md`.
- `src/db/client/index.ts` holds the real connection pool, explicitly configured (AGENTS.md §I
  Rule 38): `max` (`DB_POOL_MAX`), `idle_timeout`, `connect_timeout`, `max_lifetime`, `prepare`
  (`DB_PREPARE`), `connection.statement_timeout` and `idle_in_transaction_session_timeout`.
- `src/db/client/migrate.ts` applies pending migrations at every boot, over a single connection of
  its own with no statement timeout; a failure stops the container before it serves anything.
- Daily backup of `kira` to R2 at 17:00 UTC (00:00 WIB), the latest 7 kept
  (`kira-db-ugfcxh/kira/` in the `R2-Backups` destination).

## Testing

- **Unit** — `bun test src`. No database, network or environment variable: `src/test/preload.ts`
  replaces the Postgres client for the whole run. The quality gate runs this tier, with coverage.
  There is no CI env file, by the owner's decision.
- **Integration** — `bun run test:integration`: `*.integration.test.ts` files gated by
  `shouldRunIntegrationTests()`, against a real Postgres. None exists yet.

Coverage (`bun run test:coverage`) is 100% per file, lines and functions, over all of `src/**`,
and `scripts/check/coverage-files.mjs` fails on any source file no test loads. The exemptions in
`bunfig.toml` are a closed list; the policy is `.claude/rules/typescript/coverage.md`.

## Pipeline

Every workflow starts from a pull-request event; nothing runs on a push or a schedule.

- **Pre-commit** (`.husky/pre-commit` running `scripts/check/gates.sh --hook`) — the gates in
  `scripts/check/gates.list` that the staged files need.
- **Quality gate** (`.github/workflows/quality-gate.yml`, calling agent-config-kit's
  `be-hono-quality-gate` workflow) — every pull request.
- **Read-only checks** (`workflows-lint.yml`; `dependency-review.yml` and `codeql.yml` skip on a
  private repository without GitHub Code Security) — every pull request.
- **Deploy** — `.github/workflows/deploy.yml`, on a pull request merged into `prod`: it POSTs the
  Dokploy webhook (`DEPLOY_WEBHOOK_URL` secret), and Dokploy builds the `Dockerfile` from `prod`.
- **AI-layer strip** — `.github/workflows/strip-ai.yml`, on the same merge: removes `.claude/`,
  `AGENTS.md`, `CLAUDE.md` and `SSOT.md` from `prod` and merges `prod` back into `dev`.

## Env Variables

```
NODE_ENV                 development | production | test
PORT                     default 3000
DATABASE_URL             postgresql://user:pass@host:5432/db. Required in production and to
                         start the server; the unit tests and the OpenAPI export run without it
CORS_ORIGINS             comma-separated browser origins; empty (the default) allows none.
                         The iOS app is not a browser and needs none.
DB_POOL_MAX              default 10, at least 3
DB_STATEMENT_TIMEOUT_MS  default 10000 — below the request timeout
DB_PREPARE               true | false — false behind a transaction-mode pooler
REQUEST_TIMEOUT_MS       default 15000
BODY_LIMIT_BYTES         default 1048576 (1 MiB)
DOCS_ENABLED             true | false — default true outside production, false in it
LOG_LEVEL                fatal | error | warn | info | debug | trace | silent
SHUTDOWN_FORCE_EXIT_MS   default 8000
```

No other environment variable is read anywhere in `src/`. If you add one, update `src/env.ts`'s
schema, `.env.development.example`, `.env.production.example`, Dokploy's environment and this list
in the same pull request. There is no `REDIS_URL`: this repo runs no Redis.

## Branches

```
internal/{scope} → dev (quality gate on the PR) → prod (quality gate on the promotion PR, then the
                                                         deploy and the strip)
```

Naming: `internal/{scope}` for a single task; `internal/{scope}/{context}` for parallel tasks
sharing a scope. Never push directly to `dev` or `prod`.

## Known traps

- The PG18 image keeps its data in `/var/lib/postgresql/18/docker`. A Dokploy Postgres created with
  the default volume path (`/var/lib/postgresql/data`) refuses to start; both Kira instances mount
  the PG18 path.
- `z.infer` of a schema built with `z` from `@hono/zod-openapi`, and `c.req.valid(...)`, can
  resolve to `any` when the package's `zod` and the repo's own `zod` differ. Hover one before
  trusting it.
