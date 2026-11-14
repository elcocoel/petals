# Agents in this repo

Screening or judging Petals? Start at [JUDGES.md](JUDGES.md): a ten-minute verification path, each track's claims with
the code and a live check, mainnet transactions and known limits.

Working on the code: `bash scripts/check.sh` is the gate (typecheck, lint, tests, protocol pins, tokens, boundary and
secret scans, web build); it ends `check: all green`. The brain, specs and schemas are the sources of truth; `docs/`
renders them.

## Repo map

| Path                  | What it holds                                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------------------------------- |
| `apps/web/`           | The site: the landing, the Power Map, flowers, `/make` with the agent, the lobby, the docs                     |
| `apps/cli/`           | The `petal` command line: the tools in-process, JSON out                                                       |
| `packages/core/`      | Schemas, types, canonical hashes, validation, counting and the SVG renderer; no network, no disk               |
| `packages/inputs/`    | The readers for each supported system, a keyless RPC pool and the snapshot store                               |
| `packages/tools/`     | One tool registry, served over HTTP and MCP                                                                    |
| `packages/agent/`     | Petals' agent on NEAR AI Cloud, the API routes, jobs for connected agents, payments                            |
| `packages/near/`      | NEAR: sign-in (NEP-413 and linked wallets), FastData publishing, 1Click payments, the credit contract          |
| `packages/store/`     | Private data behind one interface (Postgres, or SQLite): people, sessions, runs, credit                        |
| `packages/relations/` | A rebuildable index of relations between groups, public data only                                              |
| `packages/tokens/`    | The design tokens, emitted as CSS and checked for contrast                                                     |
| `brain/`              | The doctrine, chapters and reading recipes agents follow; the repo is their only source                        |
| `skill/`              | `skill/petal`: the agent skill, sharing its rules with Petals' own agent; `skill/ironclaw` is an unbuilt shell |
| `docs/`               | The documentation's own pages; the site renders them with the brain, the specs and the schemas                 |
| `specs/`              | The specifications: core, system, target, workspace, mapping brain, the map, and the protocols                 |
| `fixtures/`           | Recorded data, so tests and a clean clone run with no keys and no network                                      |
| `tests/`              | End-to-end tests (the recorded suite is behind the current code)                                               |
| `scripts/`            | The gate (`check.sh`) and maintenance scripts                                                                  |
