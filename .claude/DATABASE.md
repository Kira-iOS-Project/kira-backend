# Postgres — MCP Access for Debugging

> **Listed in the CLAUDE.md "On-demand References" table; never `@`-import it.** This file is
> **operational rules, not neutral reference.** It is the only place that says which production
> operations are allowed, so treat an edit to it the way you would treat an edit to a firewall rule.

Access is through the `db-dev` and `db-prod` MCP servers
([Postgres MCP Pro](https://github.com/crystaldba/postgres-mcp)), pinned in `.mcp.json`.

## Topology

Two instances (`pgvector/pgvector:pg18`) on the VPS, in Dokploy project **Kira**. They hold
different database names, so a name alone tells you where you are: `kira` is production,
`kira_dev` is development.

|             | Dokploy name  | App name             | Port     | `postgresId`            |
| ----------- | ------------- | -------------------- | -------- | ----------------------- |
| Development | `DB-Kira-Dev` | `kira-db-dev-kptr9x` | **5437** | `HbJEx_RfHu48FK4M-hS2T` |
| Production  | `DB-Kira`     | `kira-db-ugfcxh`     | **5436** | `JL5LsOG3hALkeSc3ianhC` |

| Database   | Owner role | Extensions | Used by                                        |
| ---------- | ---------- | ---------- | ---------------------------------------------- |
| `kira`     | `kira`     | none yet   | the production API (Dokploy `DATABASE_URL`)    |
| `kira_dev` | `kira_dev` | none yet   | local development (`.env.development`)         |

The API reaches `kira` over Dokploy's internal network (`kira-db-ugfcxh:5432`), never through the
published port. Each instance also has a provisioning superuser (`kira_admin`, `kira_dev_admin`),
whose password Dokploy holds; no application uses it. `vector` is available in the image; creating
the extension needs that superuser, once, before the migration that uses it.

Backups: production `kira` is dumped daily at 17:00 UTC (00:00 WIB) to the `R2-Backups` destination
under `kira-db-ugfcxh/kira/`, the latest 7 kept. Before any production write, confirm the newest
dump exists (`backup.listBackupFiles`, or Dokploy → DB-Kira → Backups); never assume the schedule
ran.

## Tunnel must be up first

Reach Postgres through the tunnel on `127.0.0.1`, never through the VPS's public address: both
ports are dropped on the public interface (`.claude/OPERATIONS.md` § Container firewall trap). The
MCP servers read their URI **at startup**, so start the tunnel **before** the session:

```bash
bun run tunnel   # 5437 (dev) and 5436 (prod) on 127.0.0.1; leave it running
```

| Target        | Address with the tunnel up | Never use            |
| ------------- | -------------------------- | -------------------- |
| Postgres dev  | `127.0.0.1:5437`           | `72.62.122.190:5437` |
| Postgres prod | `127.0.0.1:5436`           | `72.62.122.190:5436` |

A tunnel does not survive a network change: restart it after switching networks.
`ECONNREFUSED 127.0.0.1:5437` from the app is that, not a broken database.

## Choosing a database

Each MCP server connects to **one** database, fixed by `KIRA_DB_DEV_URI` / `KIRA_DB_PROD_URI` in
`~/.config/kira/secrets.zsh` (mode 600, sourced by `~/.zshrc`) and read at startup. Restart the
session after changing one.

```
postgresql://kira_mcp:<password>@127.0.0.1:5437/kira_dev
postgresql://kira_mcp:<password>@127.0.0.1:5436/kira
```

## The role the agent connects as

`kira_mcp`, on both instances: `CONNECT` on the application database only (not `postgres`, not
`template1`), `USAGE` on `public`, `SELECT` on every table and sequence the owner creates (default
privileges under `kira` / `kira_dev`, so future migrations need no re-grant), `USAGE` on the
schemas the owner creates (Drizzle's `drizzle` bookkeeping schema included), and
`pg_read_all_stats` for the health tools. It runs with `default_transaction_read_only = on` and a
30 s statement timeout, and at most 5 connections. It cannot write, run DDL, drop a database or
manage roles. Migrations run as the owner role inside the container at boot, never through this
role.

## Rules for the production server

Both servers run `--access-mode=restricted`, and the role is read-only besides. The server name in
every tool call is the other half of the distinction:

- `mcp__db-dev__*` — free to use for reads.
- `mcp__db-prod__*` — read-only twice over. `mcp__db-prod__execute_sql` is also an **`ask`** rule in
  `.claude/settings.json`; never add it to `permissions.allow`. agent-core's `db-guard` checks every
  call: one read-only statement passes, anything else waits for the user's `unlock db`
  (`docs/unlock.md`), which still opens nothing while the role is read-only.

A production write happens outside MCP, by a person, as the owner role, after confirming the newest
backup exists.

## Available tools

`list_schemas` · `list_objects` · `get_object_details` · `explain_query` (supports hypothetical
index simulation) · `get_top_queries` (requires `pg_stat_statements`, not installed) ·
`analyze_workload_indexes` · `analyze_query_indexes` · `analyze_db_health` (cache hit, vacuum,
connections, replication, sequence limits) · `execute_sql`.
