# Kira API

The backend of **Kira**, a personal-finance companion for people in Indonesia, on iPhone. It is the
one server the iOS app ([kira-mobile-ios](https://github.com/Kira-iOS-Project/kira-mobile-ios))
talks to, live at `https://api-kira.serenitycode.tech`.

> **Status.** The first product flows are built on the foundation: sign-in with an email code,
> the account and its consents, the health check and the Kira Score, Beranda, plans with simulated
> billing, and Beasiswa Kira, with transactional email and an hourly scheduler. Catat (chat,
> transactions and bank imports) is in progress and not merged yet ([Roadmap](#roadmap)).

## Contents

- [Tech Stack](#tech-stack)
- [System Design](#system-design)
- [Request Lifecycle](#request-lifecycle)
- [Code Architecture](#code-architecture)
- [Endpoints](#endpoints)
- [Authentication](#authentication)
- [Kira Score](#kira-score)
- [On-Device AI](#on-device-ai)
- [Email](#email)
- [Scheduled Jobs](#scheduled-jobs)
- [API Contract and the iOS Client](#api-contract-and-the-ios-client)
- [Error Contract](#error-contract)
- [Data](#data)
- [Delivery Pipeline](#delivery-pipeline)
- [Security](#security)
- [Architecture Decisions](#architecture-decisions)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [Repository Layout](#repository-layout)
- [Roadmap](#roadmap)

## Tech Stack

| Area | Choice | Version |
| --- | --- | --- |
| Runtime | [Bun](https://bun.sh) | 1.4.2 in CI and the image; 1.3.12 or newer locally |
| HTTP framework | [Hono](https://hono.dev) | 4.13.13 |
| Routing, validation, OpenAPI | `@hono/zod-openapi` with [Zod](https://zod.dev) | 1.6.3, Zod 4.6.5 |
| API reference | [Scalar](https://scalar.com) at `/docs`, off in production | 0.12.11 |
| Database | PostgreSQL (pgvector image) | 18 |
| ORM and migrations | [Drizzle ORM](https://orm.drizzle.team) and drizzle-kit | 0.45.4, 0.31.11 |
| PostgreSQL driver | postgres.js | 3.4.9 |
| Logging | Pino (pino-pretty in development) | 10.4.0 |
| Email | [Resend](https://resend.com) over `fetch`, no SDK | |
| Language and type check | TypeScript, checked by the native compiler (tsgo) | 7.0.2 |
| Lint, format, dead code | oxlint with tsgolint, oxfmt, knip | 1.87.0, 0.72.0, 6.40.0 |
| Tests | `bun test`, 100% line and function coverage per file | |
| Container | Multi-stage Docker image on `oven/bun:1.4.2-slim`, pinned by digest | |
| Hosting | [Dokploy](https://dokploy.com) on a VPS: Docker Swarm behind Traefik | |
| Edge | Cloudflare: DNS, TLS and proxy | |
| Backups | Daily `pg_dump` to Cloudflare R2 | |
| CI/CD | GitHub Actions | |

## System Design

One deployable service (a modular monolith) and one PostgreSQL database per environment. The app
reaches the API only through Cloudflare. The server answers only Cloudflare's address ranges, and
the database is never exposed to the internet.

```mermaid
flowchart LR
  subgraph phone["iPhone"]
    app["Kira iOS app<br/>SwiftUI, generated API client"]
  end
  subgraph edge["Cloudflare"]
    cf["DNS, TLS, proxy<br/>api-kira.serenitycode.tech"]
  end
  subgraph vps["VPS: Dokploy on Docker Swarm"]
    traefik["Traefik<br/>Cloudflare-only allowlist"]
    api["kira-backend container<br/>Bun + Hono, port 3000"]
    db[("PostgreSQL 18<br/>kira")]
    devdb[("PostgreSQL 18<br/>kira_dev")]
  end
  r2[("Cloudflare R2<br/>backups")]
  resend["Resend<br/>transactional email"]
  laptop["Developer laptop"]

  app -- "HTTPS, JSON" --> cf --> traefik --> api
  api -- "internal network" --> db
  api -- "HTTPS" --> resend
  db -. "daily dump, latest 7 kept" .-> r2
  laptop -. "SSH tunnel: read and write" .-> devdb
  laptop -. "SSH tunnel: read, and write as the owner" .-> db
```

| Piece | Responsibility |
| --- | --- |
| Cloudflare | Terminates TLS for `api-kira.serenitycode.tech` and proxies to the server; hides its address |
| Traefik | Routes the hostname to the container and refuses any client that is not a Cloudflare address (403) |
| kira-backend | Validates, runs business rules, reads and writes PostgreSQL, and answers JSON or problem+json |
| PostgreSQL `kira` | Production data. The API reaches it over Dokploy's internal network; developers reach it through the SSH tunnel, never through a public port |
| PostgreSQL `kira_dev` | Development data, read and written by developers through the SSH tunnel |
| Cloudflare R2 | Daily dumps of `kira`, the latest seven kept |
| Resend | Sends the transactional emails; their images load from the API's own `/email/*` |

There is no AI provider: Kira's AI features run on the iPhone ([On-Device AI](#on-device-ai)).

## Request Lifecycle

Every request passes the same middleware in a fixed order, and every failure, wherever it is
thrown, leaves through one error mapper as `application/problem+json`.

```mermaid
sequenceDiagram
  autonumber
  participant App as iOS app
  participant CF as Cloudflare
  participant TR as Traefik
  participant MW as Hono middleware
  participant RT as Route
  participant SV as Service
  participant RP as Repository
  participant DB as PostgreSQL

  App->>CF: HTTPS request
  CF->>TR: Proxied request from a Cloudflare address
  TR->>MW: Forwarded to the container
  Note over MW: requestId, secureHeaders, cors, requestLogger<br/>then on /api/*: bodyLimit, timeout
  MW->>RT: Input validated against the route's Zod schema
  alt Input fails the schema
    RT-->>App: 422 problem+json, VALIDATION_FAILED with fields
  else Input is valid
    RT->>SV: Typed input
    SV->>RP: A question through the port
    RP->>DB: Drizzle query, statement timeout 10 s
    DB-->>RP: Rows
    RP-->>SV: Rows shaped for the service
    alt A business rule fails
      SV-->>App: problem+json with the rule's code, through app.onError
    else Success
      SV-->>RT: Result
      RT-->>App: 2xx JSON with X-Request-Id
    end
  end
```

| Step | Why it sits there |
| --- | --- |
| `requestId` | First, so every later log line carries the id; the response returns it as `X-Request-Id` |
| `secureHeaders` | Before any body is produced |
| `cors` | An allowlist that is empty by default: the iOS app is not a browser and needs none |
| `requestLogger` | One line when the request starts and one when it finishes, with status and duration |
| `bodyLimit` (`/api/*`) | Refuses an oversized body before reading it (413) |
| `timeout` (`/api/*`) | Caps the handler's total time (504) |
| `app.onError` | The single mapper from any thrown error to problem+json |

`/health` sits outside `/api/*`, so it answers whatever the request budget says. Every protected
router runs `requireSession` (from the auth module) before its routes: it resolves the bearer token
to a session and sets `userId`, or answers 401 `AUTH_UNAUTHENTICATED`.

## Code Architecture

**A modular monolith of vertical slices, each built in Clean Architecture-style layers:
`routes → handler → service → repository → database`.** Every feature is one folder under
`src/modules/`, holding all of its layers; modules share only `src/lib/`. It deploys as one service,
but each module's boundaries are drawn so it could move out later without a rewrite. Dependencies
point inward: business rules depend on the repository's interface (a port), not on Drizzle, so they
are tested without a database. `src/modules/meta/` (the health check) is the reference module every
new one copies.

```mermaid
flowchart TB
  index["src/index.ts<br/>env, migrations, docs, Bun.serve, shutdown"] --> app["src/app.ts<br/>middleware, error mapper, route mounts"]
  app --> routes
  subgraph module["One vertical slice: src/modules/meta"]
    routes["meta.routes.ts<br/>contract: OpenAPI route, Zod schemas"] --> handler["meta.handler.ts<br/>controller: HTTP in and out, at most 15 lines"]
    handler --> service["meta.service.ts<br/>business rules, no HTTP, no SQL"]
    service -- "MetaRepository port" --> repo["meta.repository.ts<br/>data access: every query and transaction"]
    service --> errors["meta.errors.ts<br/>DomainError subclasses"]
  end
  repo --> client["src/db/client<br/>the connection pool"]
  client --> pg[("PostgreSQL")]
  lib["src/lib<br/>constants, errors, logger, router factory"] -.-> module
  env["src/env.ts<br/>the only reader of process.env"] -.-> index
```

| Layer | Role | Owns | Never does |
| --- | --- | --- | --- |
| `*.routes.ts` | Contract | Path, method, request and response schemas, the documented error statuses | Business logic |
| `*.handler.ts` | Controller | Reads the validated input, calls the service, shapes the response, in at most 15 lines | Data access, `try`/`catch` for domain errors |
| `*.service.ts` | Use cases | Business rules over the repository's port, injected as a default parameter so a test passes its own | Import Hono, Drizzle or the database client |
| `*.repository.ts` | Data access | The port type, its Drizzle implementation and a default instance: every query and transaction of the module | Hold business rules or throw domain errors |
| `*.schema.ts` | DTOs | The Zod request and response shapes, also the OpenAPI types | Logic |
| `*.errors.ts` | Domain errors | The module's `DomainError` subclasses, each with a registered code | Choose an HTTP body format |

### The Shape of a Repository

```ts
/** src/modules/meta/meta.repository.ts */
export type MetaRepository = { ping(): Promise<void> };                      /** the port */

export function createMetaRepository(client: DbLike = db): MetaRepository {  /** the Drizzle adapter */
  return { async ping() { await client.execute(sql`SELECT 1`); } };
}

export const metaRepository = createMetaRepository();                        /** the default instance */
```

```ts
/** src/modules/meta/meta.service.ts */
export async function getHealthReport(
  deps: { repository?: MetaRepository } = {},
): Promise<HealthResponse> {
  const repository = deps.repository ?? metaRepository;
  try {
    await repository.ping();
  } catch (err) {
    logger.error({ err }, 'Database health check failed');
    throw new HealthCheckFailedError({ database: 'unhealthy' });
  }
  return { status: 'ok', database: 'healthy' };
}
```

Each repository has one method per question its service asks, named for the domain, never a generic
`findAll` or a shared base class. Lists are keyset-paginated with explicit columns and limits, and a
transaction lives inside one repository method.

### Boundaries the Gates Enforce

| Boundary | Enforced by |
| --- | --- |
| A service never imports Hono, `drizzle-orm`, `postgres` or `src/db` | oxlint import rules on `src/modules/*/*.service.ts` |
| A handler never imports `drizzle-orm`, `postgres` or `src/db` | oxlint import rules on `src/modules/*/*.handler.ts` |
| Another module is reached only through its `index.ts` | oxlint import rules on `src/modules/*/**` |
| `src/lib` and `src/middlewares` never import a module | oxlint import rules |
| Only `src/env.ts` reads `process.env` | oxlint `no-restricted-properties` |
| The committed spec equals what the routes describe | `scripts/check/openapi.ts` |
| A folder holds files or folders, never both | `scripts/check/folder-shape.mjs` |
| Every source file is fully covered by tests | `bun run test:coverage` |

### Testing per Layer

| Layer | How it is tested | What a test replaces |
| --- | --- | --- |
| Repository | `bun test` with the fake Postgres client (`createFakeDb` in `src/test/fake-postgres.ts`) passed to its factory: a real Drizzle database that records each statement and answers with rows the test gives | The database client |
| Service | `bun test`, passing a repository double | The repository |
| Handler and route | `app.request()` through the real middleware and error mapper, signed in with `signedIn()` from `src/test/session.ts` | The database client and Resend, through the shared doubles in `src/test/preload.ts` |
| Database | The integration tier against a real PostgreSQL (`bun run test:integration`) | Nothing |

### Why This Architecture

| Option | Decision | Reason |
| --- | --- | --- |
| **Modular monolith, Clean Architecture-style layers with a repository** | Chosen | One deployable and one database suit one team and one client app. Each slice keeps a feature together; the layers keep HTTP, business rules and SQL apart; the repository port makes every business rule testable without a database. Lint rules hold the boundaries. |
| Microservices | Not chosen | Network calls, distributed data and several deploys, with nothing to gain at this scale. |
| Full hexagonal or DDD (entities, aggregates, a port for every dependency) | Not chosen | The repository port gives the decoupling that matters. Rich domain objects and a port per dependency would add types without adding safety for a product of this size. |
| A DI framework such as NestJS | Not chosen | Decorators and a container for what default parameters do. Hono on Bun starts fast and stays small. |
| Serverless functions | Not chosen | Cold starts and per-invocation database connections; one long-running container keeps a warm connection pool. |

### The Modules

| Module | Responsibility |
| --- | --- |
| `meta` | `GET /health`, the reference module |
| `auth` | Sign-in codes, sessions, and `requireSession`, the gate in front of every protected route |
| `account` | The signed-in person, their settings and consents, the data export and account deletion |
| `score` | The health-check quiz and the deterministic Kira Score engine |
| `home` | Beranda: one aggregate in one of three layouts |
| `billing` | Plans, simulated checkout, invoices, gifted months, and the renewal jobs |
| `scholarship` | Beasiswa Kira applications and their simulated review |
| `jobs` | The ordered list of hourly jobs (no routes) |

```mermaid
flowchart LR
  auth["auth<br/>requireSession"]
  account --> auth
  score --> auth
  home --> auth
  billing --> auth
  scholarship --> auth
  home -- "findScoreReport" --> score
  jobs --> billing
  jobs --> scholarship
  lib["src/lib<br/>constants, errors, email, time, usage, scheduler"]
  account -.-> lib
  billing -.-> lib
  scholarship -.-> lib
```

A module reaches another only through its `index.ts`; `src/lib` never imports a module.

## Endpoints

Every path below sits under `/api` and needs a bearer token, except the first three sign-in routes
and `/health`. The full contract, with every request and response shape, is `openapi.json`
(and `/docs` in development).

| Area | Method and path | What it does |
| --- | --- | --- |
| Meta | `GET /health` | The server is up and PostgreSQL answers |
| Auth | `POST /auth/code` | Emails a six-digit sign-in code |
| Auth | `POST /auth/verify` | Trades the code for a token pair; creates the account on a first sign-in |
| Auth | `POST /auth/refresh` | Trades a refresh token for a new pair |
| Auth | `POST /auth/sign-out` | Ends this session |
| Account | `GET /me`, `PATCH /me` | The person, plan, usage and payday period; focus, payday and hidden balances |
| Account | `GET /me/consents`, `PUT /me/consents` | Consents with their policy version (an append-only audit trail) |
| Account | `GET /me/export`, `POST /me/export/email` | The transactions as CSV, downloaded or emailed |
| Account | `POST /me/deletion` | Deletes the account after typing `HAPUS`, with a notice email |
| Score | `PUT /health-check` | Saves the six-step quiz and returns the first score |
| Score | `GET /score` | Score, band, three groups, six indicators, up to three steps |
| Score | `GET /score/indicators/{key}` | One indicator's ladder in rupiah, next rung and milestones |
| Home | `GET /home` | Beranda in its layout: money left, next step, score, checklist or debt plan |
| Billing | `GET /plans` | The three plans and the current one |
| Billing | `POST /billing/checkout` | Buys Muda or Plus (simulated) |
| Billing | `GET /subscription`, `POST /subscription/cancel`, `PUT /subscription/payment-method` | The paid plan |
| Billing | `GET /billing/invoices`, `POST /billing/gifts` | Invoice history; gifted Plus months for Beasiswa Kira |
| Scholarship | `GET /scholarship`, `POST /scholarship/applications`, `DELETE /scholarship/applications/current` | Eligibility, places left, applying and withdrawing |
| Catat (in progress) | `/chat/messages`, `/chat/receipts`, `/transactions`, `/imports`, `/usage` | Not merged yet: chat with on-device drafts, manual entries, history, undo, bank-CSV imports |

## Authentication

Sign-in is an email and a six-digit code, hand-rolled on PostgreSQL with no auth library and no
Apple or Google sign-in.

```mermaid
sequenceDiagram
  autonumber
  participant App as iOS app
  participant API as kira-backend
  participant DB as PostgreSQL
  participant RS as Resend

  App->>API: POST /api/auth/code {email}
  API->>DB: Count recent codes (cooldown, per address, per network)
  API->>DB: Retire the old code, store HMAC(code)
  API->>RS: Email the code
  API-->>App: 202 {expiresInSeconds: 600, resendAfterSeconds: 60}
  App->>API: POST /api/auth/verify {email, code}
  API->>DB: Check the HMAC, count the try
  API->>DB: Use the code, create the account if new, open a session
  API-->>App: 200 {accessToken, refreshToken, needsOnboarding}
  App->>API: POST /api/auth/refresh {refreshToken}
  API->>DB: Rotate the pair, keep the old refresh hash
  API-->>App: 200 a new pair
```

| Decision | Value |
| --- | --- |
| Code | Six digits, valid 10 minutes, one active per address, stored as HMAC-SHA256 under `AUTH_SECRET` |
| Tries | Five per code, then a new code is needed |
| Limits, counted in PostgreSQL | 60 s between codes, 5 codes an hour per address, 20 an hour per network |
| Tokens | Opaque random strings, stored only as SHA-256 hashes; access 15 minutes, refresh 60 days |
| Rotation | Every refresh issues a new pair; reusing a replaced refresh token revokes the session |
| Account | Created by the first verified code; the display name comes from the address ("dinda@…" is Dinda) |

`POST /auth/code` answers the same whether or not the address has an account. An hourly job deletes
codes older than a day.

## Kira Score

The score is computed by a deterministic engine from the health-check answers, never by AI. It is
the plain average of six indicators of 0 to 100 points, rounded half up, after the FinHealth Score.

| Group | Indicator | Measures |
| --- | --- | --- |
| Save | Emergency fund | Liquid savings in months of essential spending, against a 6× to 15× target |
| Save | Savings ratio | Monthly savings as a share of income |
| Debt | Instalment ratio | Monthly instalments as a share of income |
| Debt | Consumer debt | Open paylater, online-loan and credit-card accounts, and lateness |
| Debt | Debt to assets | Total debt as a share of all assets |
| Protect | Protection | Health cover and income cover |

Bands: vulnerable 0–39, coping 40–79, healthy 80–100. A consumer-debt indicator at 0 holds the
band at vulnerable. The engine also orders up to three next steps (expensive debt first, then the
emergency fund, protection, savings, instalments and debt) and estimates what each would add. A
score snapshot is stored with each health check and on the first read of each payday period, which
is what the score's change compares against.

## On-Device AI

The server calls no AI model. The app reads chat text, receipts (Vision), voice (Speech) and bank
statements on the iPhone, and sends the server structured results. The server validates and stores
them: whole-rupiah amounts, a receipt's items adding up to its total, an import of at most three
months. The plans' AI quotas are product tiers the server counts; turning the AI consent off
switches those inputs off, never manual entry.

## Email

Transactional only: the sign-in code, the data export, the deletion notice, the renewal reminder
three days ahead, and the Beasiswa Kira result. There are no push notifications.

```mermaid
flowchart LR
  module["A module's *.email.ts<br/>its own words"] --> layout["src/lib/email/layout.ts<br/>renderEmail: HTML tables and plain text"]
  layout --> resend["src/lib/email/resend.ts<br/>one POST to Resend"]
  ds["Design system components"] -- "bun run generate:email-assets" --> png["public/email/*.png"]
  png -- "GET /email/*" --> inbox["The reader's mail client"]
  resend --> inbox
```

Email clients read neither web fonts nor SVG, so the header, icons, mark and handwritten line are
PNGs, rendered from the design system's components by headless Chrome and committed. Without
`RESEND_API_KEY` outside production, emails are written to the log instead of sent.

## Scheduled Jobs

An in-process scheduler (`src/lib/server/scheduler.ts`) runs these every hour, one after another,
when `JOBS_ENABLED` is true. Each is idempotent and handles a batch per run; a failure is logged and
the next job still runs.

| Job | What it does |
| --- | --- |
| `subscription-rollover` | Ends a cancelled or finished period, or renews a paid plan with a new invoice (simulated) |
| `renewal-reminders` | Emails a paid plan three days before it renews, once per period |
| `scholarship-review` | Accepts Beasiswa Kira applications open for a day while this month's places last |
| `auth-code-cleanup` | Deletes sign-in codes older than a day |

## API Contract and the iOS Client

The Zod schemas on each route are the single source of truth for validation, documentation and the
iOS client. The spec is committed, and the quality gate fails when it no longer equals what the
code describes.

```mermaid
flowchart LR
  zod["Zod schemas<br/>in *.routes.ts"] --> export["bun run spec:export"]
  export --> spec["openapi.json<br/>committed here"]
  spec -- "copied into" --> copy["openapi.json<br/>kira-mobile-ios APIClient"]
  copy --> gen["swift-openapi-generator"]
  gen --> swift["Swift types and client"]
  check["check:openapi gate"] -. "spec equals the code" .-> spec
  codes["error-codes.sh, iOS gate"] -. "Problem.code equals ProblemCode" .-> copy
```

A response-shape change is a breaking change for every installed build, so it is made additively,
and the iOS repository refreshes its copy in the same feature.

## Error Contract

Every error is [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) problem detail with a stable
`code`. Clients branch on `code`, never on `title` or `detail`, and the app shows its own localized
message for each code. The real response for an unknown route:

```json
{
  "type": "https://api-kira.serenitycode.tech/problems/ROUTE_NOT_FOUND",
  "title": "Route Not Found",
  "status": 404,
  "detail": "No route matches GET /kira-readme-check.",
  "instance": "/kira-readme-check",
  "code": "ROUTE_NOT_FOUND",
  "requestId": "ac8600ed-5bcb-4c2f-bbec-cb2b5ca3e3f9"
}
```

| Code | Status | When |
| --- | --- | --- |
| `VALIDATION_FAILED` | 422 | The body or a parameter fails the route's schema; `fields` names each failure |
| `ROUTE_NOT_FOUND` | 404 | No route matches the method and path |
| `REQUEST_TOO_LARGE` | 413 | The body exceeds `BODY_LIMIT_BYTES` |
| `REQUEST_TIMEOUT` | 504 | The handler exceeds `REQUEST_TIMEOUT_MS` |
| `HTTP_ERROR` | the exception's | Any other HTTP exception |
| `INTERNAL_ERROR` | 500 | Anything unexpected; the body reveals nothing, the log keeps the cause |
| `META_HEALTH_UNHEALTHY` | 503 | `/health` cannot reach PostgreSQL |

The modules add their own codes, each on one of seven bases (400, 401, 403, 404, 409, 429, 503):

| Code | Status | When |
| --- | --- | --- |
| `AUTH_CODE_INVALID`, `AUTH_CODE_EXPIRED` | 400 | The sign-in code is wrong or past its ten minutes |
| `AUTH_UNAUTHENTICATED` | 401 | No valid access token on a protected route |
| `AUTH_REFRESH_INVALID` | 401 | The refresh token is unknown, expired, revoked or reused |
| `AUTH_CODE_RATE_LIMITED`, `AUTH_CODE_ATTEMPTS_EXCEEDED` | 429 | Too many codes asked for, or five wrong tries |
| `EMAIL_DELIVERY_FAILED` | 503 | Resend did not take the sign-in code or the data export |
| `SCORE_NOT_AVAILABLE` | 404 | The score or an indicator before the health check (Beranda shows no score instead) |
| `SUBSCRIPTION_NOT_FOUND` | 404 | No paid plan to show or change |
| `SUBSCRIPTION_NOT_CANCELLABLE` | 409 | A Beasiswa Kira plan cannot be cancelled |
| `SCHOLARSHIP_NOT_ELIGIBLE` | 409 | A paid plan, a running scholarship or an open application |
| `SCHOLARSHIP_APPLICATION_NOT_FOUND` | 404 | No open application to withdraw |

Catat's codes (`CHAT_*`, `TRANSACTION_*`, `IMPORT_*`, `RECEIPT_TOTAL_MISMATCH`,
`PLAN_FEATURE_UNAVAILABLE`) are registered and arrive with that module.

```mermaid
flowchart LR
  thrown["Thrown anywhere"] --> kind{"Error type"}
  kind -- "DomainError" --> own["Its status and code"]
  kind -- "HTTPException" --> mapped["Code chosen from its status"]
  kind -- "Anything else" --> opaque["500 INTERNAL_ERROR"]
  own --> body["problem+json<br/>type = base + code"]
  mapped --> body
  opaque --> body
  body --> ios["iOS: localized message<br/>for the code"]
```

The `type` base, `https://api-kira.serenitycode.tech/problems/`, is fixed for life: the installed
apps compare it, so changing it would turn every error into the generic message.

## Data

```mermaid
flowchart LR
  api["kira-backend<br/>owner role, pooled"] --> kira[("kira")]
  migrator["Migrator at boot<br/>one connection"] --> kira
  person["Developer<br/>owner role"] -. "SSH tunnel: reads and writes,<br/>after checking the latest backup" .-> kira
  debug["AI and debugging tools<br/>read-only role"] -. "SSH tunnel: reads only" .-> kira
  kira -- "daily 00:00 WIB" --> r2[("Cloudflare R2<br/>latest 7 dumps")]
```

- **Schema.** Sixteen tables in four files under `src/db/schema/`. Amounts are whole rupiah
  (`bigint`); every person's row cascades from `users`, so deleting an account deletes its data.
  Only a gift outlives its giver, anonymised, because gifted months fund Beasiswa Kira's places.

```mermaid
erDiagram
  users ||--o{ sessions : "signs in with"
  users ||--o{ consents : "decides"
  users ||--o| financial_profiles : "answers"
  users ||--o{ debt_accounts : "owes"
  users ||--o{ score_snapshots : "is scored"
  users ||--o{ chat_messages : "writes"
  users ||--o{ transactions : "records"
  users ||--o{ usage_counters : "uses"
  users ||--o{ bank_imports : "imports"
  bank_imports ||--o{ bank_import_rows : "holds"
  chat_messages ||--o{ transactions : "is the source of"
  users ||--o{ subscriptions : "holds"
  users ||--o{ invoices : "pays"
  subscriptions ||--o{ invoices : "bills"
  users |o--o{ gifts : "gifts"
  users ||--o{ scholarship_applications : "applies"
```

`auth_codes` stands alone, keyed by address: a code exists before its account does.
- **Migrations.** `bun run db:generate` writes SQL from the schema, which is committed with the
  change. The server applies pending migrations before it serves anything, over one connection of
  its own. A failed migration stops the new container before it takes a request.
- **Connection pool.** Every setting is explicit: `DB_POOL_MAX` (default 10), a 10 s statement
  timeout (below the 15 s request timeout), connect, idle and lifetime limits, and a 30 s cap on idle
  transactions. The connection carries the service name, so PostgreSQL's activity view shows it.
- **Access.** `bun run tunnel` opens an SSH tunnel to both databases, `kira_dev` and production `kira`,
  on local ports; neither database is open to the internet.
- **Roles.** The API connects as the database owner. A developer reads and writes either database as
  its owner role through the tunnel, and confirms the latest backup before a production write. The
  AI and debugging tools (the `db-dev` and `db-prod` MCP servers) use a separate read-only role with a
  30 s statement timeout, so an agent can inspect production but never change it. The provisioning
  superuser is used by no application.
- **Backups.** Production is dumped daily at 00:00 WIB to Cloudflare R2, the latest seven kept. A
  manual run was confirmed in R2 at setup; a restore has not been rehearsed yet.

## Delivery Pipeline

Two long-lived branches: `dev` collects finished work, `prod` is what runs. Every workflow starts
from a pull request; nothing runs on a push or a schedule.

```mermaid
flowchart LR
  branch["internal/scope branch"] -- "PR, quality gate" --> dev["dev"]
  dev -- "promotion PR, quality gate" --> prod["prod"]
  prod -- "deploy.yml" --> hook["Dokploy webhook"]
  hook --> build["docker build from prod"]
  build --> run["New container<br/>migrations, then serve"]
  prod -- "strip-ai.yml" --> strip["Agent config removed from prod<br/>prod merged back into dev"]
```

The quality gate (agent-config-kit's reusable `be-hono` workflow, pinned to one commit) runs on
every pull request:

| Check | Tool |
| --- | --- |
| Format, lint, type check | oxfmt, oxlint with tsgolint, tsgo |
| Dead code and unused dependencies | knip |
| Tests with the 100% per-file coverage floor | `bun test` |
| The spec equals the code | `scripts/check/openapi.ts` |
| Folder shape, shared constants, test doubles, Dockerfile | `scripts/check/*` |
| Secrets in the pull request's commits | gitleaks |
| Dependency audit: a high or critical advisory fails | `scripts/check/audit.ts` |

Beside it: CodeQL, dependency review, and a workflow lint (actionlint and zizmor) on every pull
request. The developer machine runs the same gates in a pre-commit hook.

## Security

- **Edge.** TLS at Cloudflare. The server only answers Cloudflare's addresses, so a direct request
  gets 403. The database ports and SSH are closed on the public interface.
- **Authentication.** One-time codes stored as HMACs, bearer tokens stored only as SHA-256 hashes,
  15-minute access tokens, refresh rotation that revokes a session on reuse, and code limits
  counted in PostgreSQL ([Authentication](#authentication)). Every route but `/health`, `/email/*`
  and the three sign-in routes requires a session.
- **Application.** Secure headers, an empty CORS allowlist, a body limit and a time budget on every
  API request, and request ids on every log line. Logs redact `authorization`, cookies, passwords,
  tokens and email addresses. Error bodies never carry internals.
- **Configuration.** `src/env.ts` validates every variable at boot and stops the process on a bad
  value. No secret is committed: production values live in Dokploy, and the deploy webhook URL is a
  GitHub secret.
- **Data.** Least-privilege roles, statement timeouts, daily off-site backups.
- **Supply chain.** Exact dependency versions and a frozen lockfile. The base images are pinned by
  digest, and the container runs as a non-root user. Every GitHub Action is pinned to a full commit
  SHA, an organization allow-list limits which actions run, and the workflow token is read-only
  unless a job asks for more.
- **Repository.** Secret scanning with push protection, Dependabot alerts, and approval before a fork's
  pull request may run workflows. `dev` and `prod` cannot be force-pushed or deleted.

## Architecture Decisions

| # | Decision | Why | Trade-off |
| --- | --- | --- | --- |
| 1 | A modular monolith on Bun and Hono | One deployable for a small team; modules keep features apart and could split later | One process scales as a whole |
| 2 | A repository behind a port in every module that touches the database | Business rules are tested without a database, and every query lives in one place per module | One more file per module, even for a single query |
| 3 | OpenAPI-first routes with `@hono/zod-openapi` | One schema validates input, documents the API and generates the iOS client | Routes must use the OpenAPI router; a plain `app.get()` is invisible to the spec, which the gate catches |
| 4 | RFC 9457 errors with registered codes and a fixed `type` base | The app branches on a stable code and localizes the message itself | Every new code is registered in the backend and mapped in the app |
| 5 | PostgreSQL 18 with Drizzle; migrations applied at boot | Schema and code ship together; a failing migration stops the release before it serves | A long migration delays the container's start |
| 6 | No Redis or queue | The product is small; rate limits are counted in PostgreSQL and jobs run in-process | Revisit if the API runs on more than one replica |
| 7 | Cloudflare in front, Cloudflare-only origin, private database | The server's address does not matter to clients, and the database is unreachable from outside | Developers reach the database through an SSH tunnel |
| 8 | Configuration validated at boot from the environment | A bad value fails at start, not at the first request that needs it | Every variable is listed in `src/env.ts` and the example files |
| 9 | Unit tests need no database; 100% per-file coverage | Fast, deterministic tests on every pull request | Database behaviour is covered by a separate integration tier |
| 10 | `dev` and `prod` branches; deploy on merge into `prod` through a webhook | Releases are explicit pull requests; the server pulls from the repository with a read-only key | A release waits for a promotion pull request |
| 11 | Pinned versions everywhere (dependencies, images, actions) | Reproducible builds and no silent upstream change | Updates are deliberate pull requests |
| 12 | Hand-rolled email-code sign-in with opaque tokens | A few hundred lines the team fully understands; tokens can be revoked at once, which a JWT cannot | Every request looks its session up in PostgreSQL |
| 13 | A deterministic Kira Score engine | The same answers always give the same score, and every point can be explained on screen | The methodology changes only through code |
| 14 | AI on the device, none on the server | No financial text leaves the phone for a model, and no provider cost per message | Parsing quality depends on the phone; the server can only validate |
| 15 | An in-process hourly scheduler | No queue or cron service to run for four small jobs | Exactly one replica may run it (`JOBS_ENABLED`) |
| 16 | Simulated payments and scholarship review | The flows ship and can be tested before a payment provider is chosen | Nothing is charged until a provider replaces the simulation |

## Getting Started

Requirements: Bun 1.3.12 or newer, and PostgreSQL 18 for running the server (not for the tests).

```bash
bun install
bun test src             # the unit tests: no database, no environment variable
bun run test:coverage    # the same, with the 100% per-file coverage floor
```

To run the server, point it at any PostgreSQL 18, for example a throwaway container:

```bash
docker run -d --name kira-pg -e POSTGRES_USER=kira -e POSTGRES_PASSWORD=kira \
  -e POSTGRES_DB=kira_dev -p 127.0.0.1:55432:5432 postgres:18
DATABASE_URL=postgresql://kira:kira@127.0.0.1:55432/kira_dev bun run dev
curl http://localhost:3000/health   # {"status":"ok","database":"healthy"}
curl -X POST http://localhost:3000/api/auth/code \
  -H 'Content-Type: application/json' -d '{"email":"dinda@example.com"}'
                                    # without RESEND_API_KEY the code appears in the server log
open http://localhost:3000/docs     # the API reference
```

The server applies the migrations itself before it starts. Team members use the shared development
database instead: `bun run env:init` writes `.env.development`, and `bun run tunnel` opens the SSH
tunnel it points at.

| Command | What it does |
| --- | --- |
| `bun run dev` | The server, restarting on change |
| `bun run build` | Bundles `src/index.ts` into `dist/`, which the image runs |
| `bun test src` | Unit tests |
| `bun run test:coverage` | Unit tests with the coverage floor |
| `bun run test:integration` | Integration tests against a real PostgreSQL |
| `bun run db:generate` | A migration from the schema; commit it with the change |
| `bun run spec:export` | Writes `openapi.json`, which the iOS app generates its client from |
| `bun run generate:email-assets -- --design-system <dir> --fonts <dir>` | Renders the email images into `public/email/` |
| `bash scripts/check/gates.sh` | Every gate, as the pre-commit hook and CI run them |

## Configuration

Every variable is validated in `src/env.ts`. The unit tests and the spec export need none.

| Variable | Default | Meaning |
| --- | --- | --- |
| `NODE_ENV` | `development` | `development`, `production` or `test` |
| `PORT` | `3000` | The HTTP port |
| `DATABASE_URL` | none | `postgresql://user:pass@host:5432/db`; required in production and to start the server |
| `CORS_ORIGINS` | empty | Comma-separated browser origins; empty allows none, and `*` is refused |
| `DB_POOL_MAX` | `10` | Pool size, at least 3 |
| `DB_STATEMENT_TIMEOUT_MS` | `10000` | Per statement, below the request timeout |
| `DB_PREPARE` | `true` | `false` behind a transaction-mode pooler |
| `REQUEST_TIMEOUT_MS` | `15000` | Time budget of an `/api/*` request |
| `BODY_LIMIT_BYTES` | `1048576` | Largest accepted body (1 MiB) |
| `DOCS_ENABLED` | on outside production | Serves `/docs` |
| `LOG_LEVEL` | `debug` in development, `info` in production, `silent` in tests | Pino level |
| `SHUTDOWN_FORCE_EXIT_MS` | `8000` | Grace period before a forced exit on shutdown |
| `RESEND_API_KEY` | none | Resend's key; required in production. Unset elsewhere, emails are logged instead of sent |
| `EMAIL_FROM` | Kira's sender | The sender, on a domain verified in Resend |
| `AUTH_SECRET` | random per process | At least 32 characters; signs the stored sign-in codes. Required in production |
| `PUBLIC_BASE_URL` | the production API | Where the images inside emails load from (`/email/*.png`) |
| `JOBS_ENABLED` | `true` | Runs the hourly scheduler; true on exactly one replica |

## Repository Layout

```text
src/
  index.ts          bootstrap: env, migrations, docs, Bun.serve, ordered shutdown
  app.ts            composition: middleware, error mapper, route mounts
  env.ts            the environment schema
  lib/              constants, errors (DomainError, the problem mapper), email (layout, Resend),
                    server utilities (router factory, logger, scheduler), time (WIB), usage
  db/               client (pool, boot migrations), schema (four domain files), migrations
  middlewares/      the request logger
  modules/          meta, auth, account, score, home, billing, scholarship, jobs
  test/             the shared doubles, the fake Postgres client and the signed-in helper
public/email/       the images every email shows, served at /email/*
scripts/            the quality gates, the bundler, the email-image renderer and operations helpers
openapi.json        the exported contract the iOS app consumes
Dockerfile          the multi-stage production image
```

## Roadmap

Done: sign-in, the account and consents, the health check and Kira Score, Beranda, plans with
simulated billing, Beasiswa Kira, transactional email and the hourly jobs.

1. **Catat**, in progress: chat with on-device drafts, manual entries, receipts, history, undo and
   bank-CSV imports, with the plans' usage counted on the server.
2. **The next areas** of the app, each with its tables, routes and error codes: wallets, budgets
   and bills, the debt repayment plan and score history, Kira Peduli, and the weekly summary.
3. **A payment provider** to replace the simulated checkout, chosen with its own ticket.
4. **The first integration tests** against a real PostgreSQL, and a rehearsed backup restore.
