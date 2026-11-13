# Quickstart: prove the walking skeleton

**Feature**: `001-petal-core` | **Date**: 2026-11-04 | **Plan**: [plan.md](./plan.md)

This is the end-to-end check for Phase A. When all five steps pass, every part of Petal is standing on NEAR, thin. It is a run guide, not code. Shapes are in [contracts/](./contracts/) and [data-model.md](./data-model.md).

## Prerequisites

| Need | For | Without it |
|---|---|---|
| Node 24 (`nvm use`; Node 22 won't do) and pnpm 10 | everything | nothing runs |
| `NEAR_AI_API_KEY` in `/path/to/keys/near-ai.env` (outside the repo) | live agent in step 2 | the agent replays a recorded run and says so |
| Testnet receiver `petals.testnet` and writer `petals-writer.testnet`, the writer's function-call key file in `/path/to/keys/` | map reads and writes in steps 1 and 3 | gallery shows fixtures only; publish uses the fake map |
| A Meteor (or Intear) wallet with any `.testnet` account | signing in step 3 | step 3 can't be checked |
| Claude Code with the Petal skill | step 4 | step 4 can't be checked |

Nothing here needs mainnet, money, or a judge account.

## Setup

```bash
cd build
nvm use                 # Node 24
pnpm install
pnpm test               # unit, golden, contract and schema tests; must be green
pnpm dev                # site and API on http://localhost:3000 (API also standalone on :8787 via `pnpm api`)
```

Environment (all optional; see `.env.example`): `NEAR_AI_API_KEY`, `PETAL_MAP_NETWORK=testnet`, `PETAL_MAP_RECEIVER=petals.testnet`, `PETAL_WRITER_ACCOUNT=petals-writer.testnet`, `PETAL_WRITER_KEY_FILE=/path/to/keys/petal-writer.testnet.json`, `PETAL_TRUSTED_WRITERS=petals-writer.testnet`, `PETAL_LLM_DAILY_USD=3`, `FASTNEAR_API_KEY`.

`GET /api/v1/health` reports `map: up | down | mirror` and `llm: up | down | recorded`, so you know which mode you are in.

## Step 1: a visitor sees published flowers

1. Open `http://localhost:3000`.
2. **Expect**: the gallery shows at least one flower read from the shared map on testnet (badge "on NEAR", with a link to the transaction) and the hero fixtures (badge "fixture"). No sign-in is asked for.
3. Open one. **Expect**: the flower, a legend line for every primitive used, the interpretation with sources, and petal details on click (account, identity with its status, the values behind each primitive).

Check by API: `curl localhost:3000/api/v1/flowers` lists entries with `where: "map"` and `where: "fixture"`. With the map down, the list still returns from the mirror and `health.map` says `mirror`.

## Step 2: a maker talks a flower into existence

1. Go to `/make` and type: **who stands behind NEAR's validators?**
2. **Expect** progress events in order, none more than 10 s apart: reading the map → snapshot found (`reused: true`, from the fixture) → counting → proposing → validating → drawing.
3. **Expect** the agent's tool calls to include `get_snapshot`, `describe_snapshot` or `compute_figures`, `propose_spec` with `segments: "backers"`, `validate_spec` (valid), `render_flower`.
4. **Expect** the flower: NEAR validators, each bar cut into backers (other delegators, accounts with 1M+ NEAR, liquid-staking contracts, lockups), a legend that includes segments, and an interpretation where every mapping cites a source id and `unknowns` is not empty.
5. **Expect** every number in the answer to appear in the `compute_figures` output (for example the Nakamoto coefficient of 9).
6. **Expect** a model signature shown under the interpretation (`signature_kind: provider_tee`, model id, signing address), or "recorded run, no signature" without a key.

Check by API: `POST /api/v1/agent/chat` streams `run`, `stage`, `tool_call`, `tool_result`, `flower`, `signature`, `done`. Note the `spec_sha256` from the `flower` event; step 4 compares against it. Leave and come back: close the tab mid-run, then open the `resume_url` from the `run` event (`/make?run=<run_id>`), or `curl localhost:3000/api/v1/agent/runs/<run_id>`; the finished flower is there.

## Step 3: the maker publishes on NEAR

1. Press **Publish**. The wallet asks for one signature (NEP-413 message naming the entry hash). No gas, no transaction in the wallet.
2. **Expect**: the site shows "Published", the key `petal/v1/spec/<id>`, the writer `petals-writer.testnet`, and a testnet explorer link. The receipt shows as failed on the explorer because the receiver has no contract; that is expected and the page says so.
3. **Expect**: within 30 s the flower appears in the gallery with the maker's account as author and "signed by <account>" verified.
4. Read it back directly: `curl https://kv.test.fastnear.com/v0/latest/petals.testnet/petals-writer.testnet/petal%2Fv1%2Fspec%2F<id>` returns the entry. Its recomputed hash matches its id.
5. Reuse: ask for House of Stake twice (`POST /api/v1/snapshots {"network":"near-house-of-stake"}`). **Expect** the first call to fetch live (`reused: false`, about 10 s, a new `petal/v1/snapshot/<sha256>` and index key on the map) and the second to return the same `sha256` with `reused: true` in well under a second. Asking for NEAR validators again also says `reused: true`.

Negative checks: a tampered message, a reused nonce, or a function-call key instead of a full-access key all return `unauthorised`.

## Step 4: the same request through the maker's own agent

1. Install the skill: copy `skill/petal/` to `~/.claude/skills/petal/`, or add the tools with `claude mcp add petal -- pnpm -s --dir <repo> petal mcp`, where `<repo>` is the root of the clone (locally, the `build/` folder).
2. In Claude Code, ask: **who stands behind NEAR's validators?**
3. **Expect**: the agent follows the skill's order (list networks → snapshot → figures → propose → validate → render) and returns a `view_url`, the legend and an interpretation.
4. **Expect**: its `spec_sha256` equals the one from step 2. The interpretation's wording may differ; the spec may not.
5. **Expect**: asked to publish, the agent calls `prepare_publish` and hands back a `sign_url` for the human; it never asks for a key.

## Step 5: a dry payment quote

1. On a flower, press **Sponsor a refresh**.
2. **Expect**: a NEAR Intents quote for 1 USDC paid from Base USDC (amount in, about 1.01 USDC; time estimate; fees), labelled "Dry quote. Paying is not switched on." No deposit address is shown and no money moves.

Check by API: `POST /api/v1/quote {"purpose":"sponsor_refresh","amount_usd":1}` returns `dry: true`.

## Automated end-to-end test

```bash
pnpm test:e2e                 # recorded agent run, fake map: steps 1, 2, 3 (fake), 4 (spec hash), 5 (recorded quote)
PETAL_LIVE=1 pnpm test:e2e    # NEAR AI Cloud, testnet map, live 1Click dry quote; needs the keys above
```

The recorded test runs on every change. The live test runs at least at the end of every working session once the keys exist (from milestone M1; constitution: each day ends with a working build of the core path).

## Judge path (SC-009)

From a clean clone with no keys: `pnpm install && pnpm dev`, open the site. **Expect** the hero flowers from fixtures, each opening fully, and the `/make` chat replaying a recorded run. Without the site: `pnpm petal figures near-validators` prints the same figures the flower quotes (the CLI door, re-runnable evidence). Phase B adds the hosted URL where the live agent and live map work with no account.

## Skeleton is done when

- [ ] All five steps pass live once, and `pnpm test:e2e` passes.
- [ ] Golden SVG tests pass twice in a row on a clean checkout (SC-005).
- [ ] No secret is in the repo (`git grep` for key prefixes returns nothing).
- [ ] Steps 1–5 have been seen running live.
