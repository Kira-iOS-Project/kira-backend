# kira-backend

The API of **Kira**, an iOS personal-finance companion. Bun + Hono + Drizzle ORM on PostgreSQL,
deployed by Dokploy to `https://kira-backend.codesheesh.com`.

## Getting started

Prerequisites: [Bun](https://bun.sh) 1.3.12 or newer (CI and the image run 1.4.2), `cloudflared`,
and the SSH alias `codesheesh-server` in `~/.ssh/config` (the development database lives on the
VPS). `bun.lock` stays at lockfile version 1, which Bun 1.3 writes and Bun 1.4 reads unchanged;
move it to version 2 in a pull request of its own once every machine runs Bun 1.4.

```bash
bun install
bun run env:init   # .env.development from .env.development.example, if missing
bun run tunnel     # dev Postgres on 127.0.0.1:5437 and prod on 5436; leave it running
bun run dev        # http://localhost:3000, API reference at /docs
```

The server applies pending migrations before it starts, in development and in production.

## Scripts

| Command | What it does |
| --- | --- |
| `bun run dev` | Server with restart on change |
| `bun run build` | Bundles `src/index.ts` into `dist/` (what the image runs) |
| `bun test src` | Unit tests (no database) |
| `bun run test:coverage` | Unit tests with the 100% per-file coverage gate |
| `bun run db:generate` | A migration from the schema in `src/db/schema/`; commit it with the change |
| `bun run spec:export` | Writes `openapi.json`, which the iOS app generates its client from |
| `bash scripts/check/gates.sh` | Every pre-commit gate, as CI runs them |

## Branches and deploys

`internal/{scope}` → `dev` → `prod`. Every workflow runs on a pull request: the quality gate on
each one, and on a merge into `prod` the deploy (Dokploy webhook) and the strip of the agent
configuration from `prod`. Never push to `dev` or `prod` directly.

## Configuration

Every variable is validated in `src/env.ts`; the list with defaults is in `SSOT.md` § Env
Variables (on `dev`). Production values live in Dokploy (project Kira, application Back-End),
never in a file. The unit tests and the OpenAPI export need no environment variable at all.
