# SSOT.md — `kira-backend`

**Owner:** `@adhibuchori`
**Last verified against repo:** `2026-10-16`

> `CLAUDE.md` routes and `AGENTS.md` forbids; this file **describes**. It is the only one of the
> three that goes stale on its own, hence the date above: if it is months old, treat it as a lead,
> not as authority. Every claim below is verifiable by reading the file it names.

## What

The API of Kira, an iOS personal-finance companion. Its one consumer is the iOS app
(`kira-mobile-ios`), which generates its client from this repo's committed `openapi.json`: a
response-shape change is a breaking change for every installed build.

## Ecosystem

```
kira-mobile-ios  →  kira-backend   (HTTPS, https://api-kira.serenitycode.tech)
kira-backend     →  Postgres       (Dokploy's internal network, DATABASE_URL)
kira-backend     →  Resend         (HTTPS, transactional email only, RESEND_API_KEY)
```

Nothing else: no Redis, no queue, no object storage, no push service, and **no AI provider**. Kira's
AI features run on the iPhone (see On-Device AI). A new provider arrives with the ticket that needs
it, and this diagram changes in the same pull request.

## Stack

Bun 1.4 · Hono · `@hono/zod-openapi` (OpenAPI-first routing) · Scalar (`/docs`, development only)
· Drizzle ORM · PostgreSQL 18 (`postgres` driver) · Pino · Resend over `fetch` (no SDK). No Redis,
by the owner's decision.

## Architecture

Modular monolith — feature verticals with internal layering: `routes → handler → service →
repository → db`, the repository being the only layer that touches the database (AGENTS.md Rules
4 and 10). `src/modules/meta/` is the smallest reference module and `src/modules/auth/` the fullest
worked example; `AGENTS.md` "How to Add a New Module" is the pattern every module follows. Folders
hold files or folders, never both (`.claude/rules/common/folder-shape.md`).

```
src/
  index.ts             bootstrap: env first, migrations, docs, the scheduler, Bun.serve, ordered
                       shutdown
  app.ts               composition only: middleware, onError/notFound, /email/* static files,
                       app.route() mounts. Middleware order is fixed by AGENTS.md §I Rule 41
  env.ts               Zod env schema; the only file that reads process.env; exits on a bad value
  lib/
    constants/         the one home of every shared identifier (AGENTS.md Rule 43)
    errors/            errors.ts (DomainError and seven bases), problem.ts (the RFC 9457 mapper,
                       the 422 defaultHook, the 404 handler), error-codes.ts (ERROR_CODES)
    email/             layout.ts (renderEmail), resend.ts (the raw client), format.ts (dates, Rp)
    server/            factory.ts (createRouter, AppEnv), logger.ts (Pino), openapi.ts (/docs),
                       scheduler.ts (the hourly jobs), shutdown.ts (ordered, single-shot shutdown)
    time/              wib.ts (WIB calendar dates, payday periods), instant.ts
    usage/             plan-usage.ts (active plan, quota period, usage), usage.schema.ts
  db/
    client/            index.ts (the real pool), migrate.ts (the boot-time migration run)
    schema/            accounts, finances, ledger, billing (+ columns.ts, the schema.ts barrel)
    migrations/        drizzle-kit output, never hand-edited
  middlewares/         logger.middleware.ts (request start and finish lines)
  modules/             one folder per feature (below)
  test/                preload.ts, fake-postgres.ts, session.ts, config.ts (see Testing)
public/email/          the PNGs every email shows, served at /email/*
```

| Module | Mounted at | What it owns |
|---|---|---|
| `meta` | `/health` | The health check (outside `/api`, so the request budget never blocks it) |
| `auth` | `/api/auth` | Sign-in codes, sessions, `requireSession` (the gate every protected router uses) |
| `account` | `/api/me` | Me, settings, consents, CSV export (download and email), account deletion |
| `score` | `/api/health-check`, `/api/score` | The health-check quiz, the Kira Score engine, indicator detail |
| `payoff` | `/api/payoff`, `/api/debts` | Rencana Pelunasan and Rencanaku: simulates snowball or avalanche, keeps the active plan, records debt payments and the paid-off event; reads `score` and `home` through their barrels |
| `home` | `/api/home` | Beranda's aggregate; reads `score` through its barrel |
| `billing` | `/api/plans`, `/api/billing/*`, `/api/subscription*` | Plans, simulated checkout, invoices, gifts; its two jobs |
| `scholarship` | `/api/scholarship*` | Beasiswa Kira applications and the simulated review job |
| `jobs` | — (no routes) | The ordered list of scheduled jobs, and the auth-code cleanup |
| Catat (`chat`, `transaction`, `bank-import`, `usage`) | `/api/chat/*`, `/api/transactions*`, `/api/imports*`, `/api/usage` | **In progress (agent B3), not merged.** Described from the build contract below |

Protected routers do `router.use('*', requireSession)` (from `../auth/index.ts`), declare
`security: [{ bearerAuth: [] }]` and read `c.get('userId')`. A router mounted at `/api` uses the
gate per path instead, so it never catches `/api/auth/*`.

## Authentication

Hand-rolled email + one-time code, no library and no Apple or Google sign-in (owner decision). All
of it lives in `src/modules/auth/`; the numbers are constants at the top of `auth.service.ts`.

- **Codes.** Six digits from `crypto.randomInt`, valid 10 minutes, one active code per address (a
  new one retires the old). Stored as **HMAC-SHA256(`AUTH_SECRET`, email:code)**, never in clear;
  compared with `timingSafeEqual`. A code allows **5 tries**, then it is spent; each try is
  claimed by a conditional `UPDATE … WHERE attempts < 5` before the compare, so parallel guesses
  get five and no more. The email is the only delivery channel; `POST /auth/code` answers 202
  whether or not the address has an account.
- **Tokens.** Opaque random tokens (32 bytes, base64url), **not JWTs**. The `sessions` table stores
  only their **SHA-256** hashes. Access token 15 minutes, refresh token 60 days.
- **Rotation with reuse detection.** `POST /auth/refresh` issues a new pair and keeps the previous
  refresh hash on the session. Presenting that previous token again revokes the session (`reused`);
  so does losing a race: rotation is a conditional `UPDATE` on the presented token, and the refresh
  that finds it already rotated revokes the session. A revoked, expired or unknown token answers
  401 `AUTH_REFRESH_INVALID`.
- **Rate limits, counted in Postgres** (no Redis, AGENTS.md Rule 24), values in
  `src/modules/auth/auth.limits.ts`. The network is the `cf-connecting-ip` header, else the first
  `x-forwarded-for` hop.
  - Code requests: a **60 s** cooldown per address, **5 per hour per address**, **20 per hour per
    network**, counted from `auth_codes`.
  - Code checks (`POST /auth/verify`): **10 per 15 minutes per address** (two codes' five tries
    each, so an honest typo and a new code still fit) and **60 per 15 minutes per network** (many
    people share one address behind a mobile carrier's NAT), counted from `sign_in_attempts`.
    Every check counts, right or wrong; a refused one is not recorded.
  - Each decision runs inside the transaction that writes, under `pg_advisory_xact_lock` on the
    address and then the network (`auth-codes.repository.ts`), so a burst of parallel requests is
    counted one at a time. Over a limit: 429 `AUTH_CODE_RATE_LIMITED`, before anything is stored
    or sent. The hourly cleanup deletes codes and checks a day old.
- **Sign-up** is the first verified code: the account is created then, with `displayName` taken
  from the address's local part ("dinda@…" → Dinda). `needsOnboarding` stays true until the
  consents are given (`users.consentedAt`). Codes older than a day are deleted by the
  `auth-code-cleanup` job.

## Error Contract — RFC 9457

Every thrown error becomes `application/problem+json`: `{ type, title, status, detail, instance,
code, requestId }`, plus `fields` on a 422. `type` is `PROBLEM_TYPE_BASE` plus the code, never
`about:blank`; `title` is fixed per code. Problem type base:
`https://api-kira.serenitycode.tech/problems/` (set before the first release; never change it).
`app.onError` (`handleAppError`) is the single mapper for `DomainError` subclasses, Hono
`HTTPException` and unknown errors, and `app.notFound` gives unmatched routes the same shape. Every
code is listed once in `src/lib/errors/error-codes.ts`; the spec publishes them as the
`Problem.code` enum. Seven status bases exist: 400, 401, 403, 404, 409, 429, 503. Rules: `AGENTS.md`
§C and `.claude/rules/common/error-codes.md`.

## Kira Score

Deterministic, computed by `src/modules/score/` on every read from the stored health-check answers;
no AI is involved (owner decision). Methodology after the FinHealth Score.

- **Engine.** `score.engine.ts` (pure): six indicators of 0–100 points — emergency fund, savings
  ratio, instalment ratio, consumer debt, debt to assets, protection — each from a fixed ladder.
  Three groups (save, debt, protect) are rounded averages; the score is the plain average of the six,
  rounded half up. Bands: vulnerable 0–39, coping 40–79, healthy 80–100; a consumer-debt indicator
  at 0 caps the band at vulnerable.
- **Around it.** `score.measure.ts` (the numbers the app writes its text from), `score.steps.ts`
  (up to three priority steps in a fixed order, each with `estimatedGain` = score with the step done
  minus score now), `score.ladder.ts` (an indicator's ladder in rupiah, its next rung, milestones).
- **Snapshots.** `PUT /health-check` stores one (`health_check`). A read that finds no snapshot in
  the current payday period stores one (`recompute`): that is "dicek lagi setiap gajian" without a
  job. `delta` compares with the latest snapshot from before the period.

## On-Device AI

There is **no server-side AI and no LLM call** anywhere in this repo. The iPhone parses chat text
(a deterministic slang parser, refined by Apple Foundation Models when available), reads receipts
(Vision), transcribes voice (Speech) and parses bank CSVs. The server **stores and validates**:
amounts are integers ≥ 0, a receipt's items must sum to its total, an import may span at most 92
days. Plans keep their AI quotas (messages, receipts, voice seconds) as product tiers, counted in
`usage_counters`; the AI-processing consent off disables those inputs but never manual entry.

## Email

Transactional only (no push notifications, owner decision): the sign-in code, the data export, the
account-deletion notice, the renewal reminder three days ahead and the Beasiswa Kira result.

- `src/lib/email/resend.ts` POSTs to Resend's API with `fetch`. Without `RESEND_API_KEY` outside
  production the message is logged instead, so sign-in works on a laptop; production refuses to
  boot without the key.
- `src/lib/email/layout.ts` (`renderEmail`) is the one layout, from the canvas board
  EmailKodeVerifikasi: tables and inline styles, the design tokens' light values, and a plain-text
  part for every message. Each module writes its own words in `<module>.email.ts`.
- Images are PNGs in `public/email/` (headers, icons, mark, handwritten tagline), served by
  `app.get('/email/*', serveStatic(...))` and linked from `PUBLIC_BASE_URL`. They are rendered from
  the design system's own components by `bun run generate:email-assets -- --design-system <dir>
  --fonts <dir>` (headless Chrome, 2×; needs the network for React from cdnjs) and committed.

## Scheduled Jobs

`src/lib/server/scheduler.ts` runs in-process, hourly, when `JOBS_ENABLED` is true (one replica
runs it; set it false only on a second process). Jobs run one after another in the order of
`src/modules/jobs/jobs.service.ts`: `subscription-rollover`, `renewal-reminders`,
`scholarship-review`, `auth-code-cleanup`. A failing job is logged and the next one runs; a tick
that arrives during a run is skipped. Every job is idempotent and handles a batch per run. Each
job's logic is a service function tested with injected dependencies.

## Billing and Beasiswa Kira

Plans come from `PLAN_TERMS` (`src/lib/constants/plans.ts`): Gratis Rp0, Muda Rp15.000/month or
Rp150.000/year, Plus Rp29.000/month or Rp290.000/year. **Checkout, gifts and the scholarship review
are simulations**: nothing is charged and no payment provider is called. A checkout activates the
plan at once and writes an invoice row; the rollover job ends a cancelled period or renews it with
a new invoice. Beasiswa Kira's monthly places are one per three gifted months; an application open
for a day is accepted while places last (three months of Plus, emailed) or waits.

## Catat (in progress)

Agent B3 is building it on `work/b3-catat`; nothing below is on this branch yet, and
`error-codes.test.ts` fails on its codes until it merges. From the build contract: chat history and
messages with on-device drafts (idempotent on `clientId`), commit and a 30-second undo of a draft
batch, receipts, manual transactions, history with keyset cursors, a period summary, `GET /usage`,
and bank-CSV imports with duplicate detection and an atomic commit.

## Database

- Two Postgres 18 instances (pgvector image) on the VPS, managed by Dokploy project **Kira**:
  `DB-Kira` (production, database `kira`, owner `kira`) and `DB-Kira-Dev` (development, database
  `kira_dev`, owner `kira_dev`). Access, roles and the tunnel: `.claude/DATABASE.md`.
- Tables (`src/db/schema/`): `users`, `auth_codes`, `sign_in_attempts`, `sessions`, `consents` (accounts.ts);
  `financial_profiles`, `debt_accounts`, `score_snapshots` (finances.ts); `chat_messages`,
  `transactions`, `usage_counters`, `bank_imports`, `bank_import_rows` (ledger.ts); `subscriptions`,
  `invoices`, `gifts`, `scholarship_applications` (billing.ts). Amounts are whole rupiah (`bigint`).
  Every child row cascades from `users`, so deleting an account deletes its data; the one
  exception is `gifts`, whose giver is set to null, because gifted months keep funding Beasiswa
  Kira's places.
- `src/db/client/index.ts` holds the real connection pool, explicitly configured (AGENTS.md §I
  Rule 38): `max` (`DB_POOL_MAX`), `idle_timeout`, `connect_timeout`, `max_lifetime`, `prepare`
  (`DB_PREPARE`), `connection.statement_timeout` and `idle_in_transaction_session_timeout`.
- `src/db/client/migrate.ts` applies pending migrations at every boot, over a single connection of
  its own with no statement timeout; a failure stops the container before it serves anything.
- Daily backup of `kira` to R2 at 17:00 UTC (00:00 WIB), the latest 7 kept
  (`$KIRA_DB_PROD_APP/kira/` in the R2 backup destination).

## Testing

- **Unit** — `bun test src`. No database, network or environment variable. `src/test/preload.ts`
  replaces the Postgres client and Resend once for the whole run and exports their controls
  (`dbControl`, `emailControl`, `resetExternalMocks()`).
- **Fake Postgres** — `src/test/fake-postgres.ts`: a real Drizzle database over a fake postgres.js
  client, so tests run the SQL Drizzle actually builds. `createFakeDb(responder)` answers each
  statement with rows written as objects in the query's select-key order; `inOrder(...rowSets)`
  answers statements in turn; `queries` records every statement for assertions. A repository test
  passes a fake to its factory; a route test steers the app's own `db` with `dbControl.respond`.
- **Sessions** — `src/test/session.ts`: `signedIn(next)` answers the session gate's lookup with the
  test user and passes every other statement on; send `AUTH_HEADER`.
- **Integration** — `bun run test:integration`: `*.integration.test.ts` files gated by
  `shouldRunIntegrationTests()`, against a real Postgres. None exists yet.

Coverage (`bun run test:coverage`) is 100% per file, lines and functions, over all of `src/**`,
and `scripts/check/coverage-files.mjs` fails on any source file no test loads. The exemptions in
`bunfig.toml` are a closed list; the policy is `.claude/rules/typescript/coverage.md`. There is no
CI env file, by the owner's decision.

## Pipeline

Every workflow starts from a pull-request event; nothing runs on a push or a schedule.

- **Pre-commit** (`.husky/pre-commit` running `scripts/check/gates.sh --hook`) — the gates in
  `scripts/check/gates.list` that the staged files need.
- **Quality gate** (`.github/workflows/quality-gate.yml`, calling agent-config-kit's
  `be-hono-quality-gate` workflow) — every pull request.
- **Read-only checks** (`workflows-lint.yml`, `dependency-review.yml`, `codeql.yml`) — every pull
  request; the repository is public, so dependency review and CodeQL run at no cost.
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
RESEND_API_KEY           required in production; unset elsewhere logs emails instead of sending
EMAIL_FROM               the sender, on a domain verified in Resend
AUTH_SECRET              at least 32 characters; signs stored codes. Required in production;
                         unset elsewhere becomes a random value per process
PUBLIC_BASE_URL          where /email/*.png is served from, for the images inside emails
JOBS_ENABLED             true | false — default true; the hourly scheduler
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
- A router mounted at `/api` with `router.use('*', requireSession)` would gate `/api/auth/*` too:
  mount protected routers at their own prefix, or gate per path.
- `check:constants` matches any string equal to a vocabulary word, dates included: a test date of
  `2026-10-15` collides with the privacy policy version. A word that is genuinely someone else's
  (GET /health's `healthy`) gets an `allow` entry with its reason in
  `scripts/check/constants.config.json`.
