# Kira BE — Claude Code Config

> Load the relevant SSOT.md section for your task, then AGENTS.md for the rules that apply.
> **Read AGENTS.md's Compliance Status table first**: a section it marks Partial or Not met names
> the shape to follow until the repo catches up.
> Anything that touches the database → AGENTS.md §H before you write the query.

---

## Project Snapshot

The API of Kira, an iOS personal-finance app; `kira-mobile-ios` generates its client from
`openapi.json`. Bun + Hono + `@hono/zod-openapi` + Drizzle on PostgreSQL + Pino. No Redis, by the
owner's decision; no auth yet (AGENTS.md Compliance Status).

Dev port `3000` · docs `/docs` (dev only) · spec `openapi.json` · prod
`https://kira-backend.codesheesh.com` (Dokploy, from `prod`).

---

## Agent Tooling

- Code navigation: Serena's symbol tools (`find_symbol`, `find_referencing_symbols`) before
  reading whole files. In a multi-repo workspace, scope every search with `relative_path`
  (`.claude/SERENA-WORKSPACE.md`).
- Library APIs: check current docs through Context7 before relying on training data.
- Rarely used MCP servers are not in `.mcp.json`; load one for a session with
  `claude --mcp-config .claude/mcp/<name>.json`.

## Command Wrapper

RTK rewrites most shell commands to `rtk <command>` (the user's `~/.claude/hooks/rtk-rewrite.sh`)
and filters their output; the safety hook peels `rtk` off before judging a command. Read diffs,
check results and scan output unfiltered: `rtk proxy <command>`.

---

## Quality Gates

Before calling a task done, run `bash scripts/check/gates.sh`. It runs `scripts/check/gates.list`,
the same list `.husky/pre-commit` runs, and prints each gate's exit code and log. In a shared
checkout, `--paths <your files>` limits format and lint to your own files, and
`bash scripts/check/gates.sh --fix <files>` writes the format.

`bun run build` is not a gate; run it after a structural change and before a PR.

`bun run lint` passes `--type-aware`, which needs the `oxlint-tsgolint` devDependency — that is
what catches a Drizzle query with a missing `await` (§H Rule 37).

`src/env.ts` validates on import and exits, so the unit tier needs the env vars set, but it dials
nothing: `src/test/preload.ts` replaces Postgres (and, as they arrive, every provider SDK) for the
whole run. Never re-mock those in a test file; steer the controls it exports (AGENTS.md Rule 7).
`.env.ci.example` holds the fake values the unit tier runs with (CI and `ci-env.sh`).

If you touched `src/db/schema/`:

```bash
bun run db:generate                    # commit the generated migration in the same PR
bash scripts/check/index-coverage.sh   # every FK column must have an index (§H Rule 32)
```

---

## `.env` Files and Production Writes

The hooks refuse shell reads and writes of `.env*` files, and hold SQL that may write through
`db-prod`. Read a file's keys with `bash scripts/env/show.sh <file>` (secrets masked). Only the
user opens a write, with `! bun unlock env` or `! bun unlock db`; when a task needs one, hand them
that command and never work around a refusal. Details: `docs/unlock.md`.

---

## Context Loading Strategy

| Task                                   | Read                                  |
| -------------------------------------- | -------------------------------------- |
| Anything at all                        | AGENTS.md §A + Compliance Status       |
| New route / handler / module           | SSOT.md §Architecture + AGENTS.md §B, §C + "How to Add a New Module" |
| **Writing any query, index, or pagination** | **AGENTS.md §H + `.claude/rules/backend/drizzle.md`** |
| Caching, N+1, request budgets, latency | AGENTS.md §H, §I + `.claude/rules/backend/performance.md` |
| Middleware chain, CORS, hardening      | AGENTS.md §I + `.claude/rules/backend/hono.md` |
| Database / schema / migrations         | SSOT.md §Database + AGENTS.md §D + `.claude/rules/backend/drizzle.md` |
| Errors / a new error code              | AGENTS.md §C + `.claude/rules/common/error-codes.md` |
| Tests                                  | AGENTS.md §E + `.claude/rules/backend/testing.md` |
| Auth (none yet)                        | SSOT.md §Authentication: what to decide before the first protected route |
| Reviewing a change                     | `.claude/docs/code-review-checklist.md` + the `agent-be-hono:reviewer` subagent |

---

## Naming Conventions

| Type              | Convention                    | Example                          |
| ------------------ | ------------------------------ | ---------------------------------- |
| Module directory   | kebab-case, singular domain noun | `src/modules/project/`          |
| Module files       | `<module>.<layer>.ts`          | `project.service.ts`, `project.routes.ts` |
| Domain error class | PascalCase + `Error` suffix    | `ProjectNotFoundError`           |
| Zod schema export  | camelCase + `Schema` suffix    | `projectResponseSchema`          |
| Test file          | `__tests__/<unit>.test.ts` beside the source | `__tests__/project.service.test.ts` |
| Index name         | `<table>_<cols>_idx`           | `tasks_project_position_idx`     |

---

## Language Convention

All code, comments, JSDoc, commit messages, and PR descriptions are written in **English**.

---

## Commit Format

```
type: description
```

Types: `feat` · `fix` · `refactor` · `chore` · `docs` · `test` · `perf` · `ci`. No scope prefix.
If a sibling repo uses `type(scope): subject`, keep the difference deliberate and stated here.

Stage and commit by pathspec (`git commit -- <paths>`); `/agent-core:checkpoint` does too.
`git add -A` is used only inside `/agent-core:ship`, which states its own guards.

---

## Branching

| Branch                      | Purpose                                        |
| ---------------------------- | ------------------------------------------------ |
| `internal/{scope}`          | Experiments, proof of concept, work on one scope |
| `dev`                       | Active development — all scopes merge here first |
| `prod`                      | Stable, deployed code                            |

Merge order: `internal/{scope}` → `dev` → `prod`. Never push directly to `dev` or `prod`; the
user runs those pushes with `!`.

---

## Protected Files

Never edit without the task explicitly requiring it — see AGENTS.md "Core Files" for why:

```
src/app.ts                  ← composition root; middleware order is a contract (§I Rule 41)
src/env.ts                  ← breaks startup for everyone if the schema is wrong
src/lib/server/factory.ts   ← AppEnv and router creation for every module
src/lib/errors/             ← the error contract: errors.ts, problem.ts, error-codes.ts
src/db/client/index.ts      ← the real connection pool; `{ max: 1 }` here serializes every request
src/db/client/migrate.ts    ← runs at every boot (src/index.ts); a failure stops the deploy
src/db/migrations/          ← drizzle-kit generated — never hand-edited, bar a custom backfill's body (Rule 16)
.claude/settings.json
.env* (any)
```

---

## Notes

- `src/modules/meta/` is the reference module: copy it for new modules.
- `strip-ai.yml` removes the AI layer from `prod` on every merge. Work from `dev`.

---

## On-demand References

Nothing below loads automatically. Read the file when its row matches the task.

| Read when | File |
| --- | --- |
| Hooks, GitHub and CI, reviews, MCP pins, deploys, skill scanning | `.claude/OPERATIONS.md` |
| Known traps — scan the trigger keywords before debugging | `.claude/anti-patterns/INDEX.md` |
| Reviewing a change: the human checklist, keyed to AGENTS.md rules | `.claude/docs/code-review-checklist.md` |
| Postgres through `db-dev`/`db-prod`: topology, tunnel, production rules | `.claude/DATABASE.md` |
| CI runner labels, when a runner pool is added (copy `.claude/CI-RUNNERS.example.md`) | `.claude/CI-RUNNERS.md` |
| Dokploy for one session (deploys, logs, env): `claude --mcp-config .claude/mcp/dokploy.json` | `.claude/mcp/dokploy.json` |
| Rarely used MCP servers, loaded per session with `claude --mcp-config` | `.claude/mcp/*.json` |
| Unlocking `.env` edits or production writes, and what the lock does not stop | `docs/unlock.md` |

<!-- >>> agent-config-kit: managed by /agent-core:setup and sync; edit outside this block -->
## Agent config kit

<!-- agent-config-kit/agent-core -->
### Guardrails and workflow (agent-core)

- The kit's hooks run here while `.claude/agent-config-kit.lock` exists. A hook refusal or a deny
  rule is never argued away: hand the command to the user to run with `!`.
- `.env*` files: list one with `bash scripts/env/show.sh <file>` (secrets masked); change a value
  with `scripts/env/set.sh <file> <KEY>` (value on stdin), which works only while the user has
  unlocked `env`. Only the user unlocks `env` or `db` (`docs/unlock.md`).
- Commit by pathspec (`git commit -- <paths>`); only `/agent-core:ship` stages everything.
- Flow: `/agent-core:plan` → `/agent-core:review` → `/agent-core:commit` →
  `/agent-core:create-pr` → `/agent-core:merge-pr`. `/agent-core:help` lists every command.
- `/agent-core:sync --check` reports drift from what setup installed.

<!-- agent-config-kit/agent-be-hono -->
### Bun + Hono API (agent-be-hono)

- Rules: `AGENTS.md`, `.claude/rules/backend/`; traps: `.claude/anti-patterns/INDEX.md`.
- The `migration-guard` hook refuses hand edits to generated migrations: change the schema, then
  `bun run db:generate`. Review with the `agent-be-hono:reviewer` subagent.

<!-- agent-config-kit/agent-deploy -->
### Deploys (agent-deploy)

- Deploy target and adapter: `.claude/OPERATIONS.md` § Deploys. Only the user starts
  `/agent-deploy:verify-deploy` and `/agent-deploy:promote-deploy`. A deploy counts once a deployment
  created after the merge has finished; an accepted webhook or a green CI run is not that proof.
- `scripts/deploy/*.sh` use the network, so Claude asks first. The user runs `trigger-deploy.sh`,
  whose webhook URL is a secret, in their own terminal.
<!-- <<< agent-config-kit -->
