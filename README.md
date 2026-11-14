# Petals

Judging or screening Petals? Start at [JUDGES.md](JUDGES.md).

Petals helps people explore who holds power in on-chain networks. It reads accounts and governance data, draws them as flowers, and gives a person and their agents a shared place to investigate the sources.

An account becomes a petal. Its dimensions can show different data: voting power, holdings, membership or the backers behind a pool. The person's view sets what the dimensions mean.

[Open Petals](https://petals.elementarycomplexity.com) · [Documentation](https://petals.elementarycomplexity.com/docs) · [Connect an agent](https://petals.elementarycomplexity.com/connect)

## Try it without an account

1. Open the [Power Map](https://petals.elementarycomplexity.com/map). You should see the public collection of mapped networks. Select **NEAR** to filter it.
2. Open this [NEAR validator flower](https://petals.elementarycomplexity.com/d/dfa817f79b994383d6de7f8ad1b3015e352b85a0295e31e17c7d983ba9a2251a). You should see **60 largest validators + everyone else**, with a dated reading and a flower. The link opens a draft view of saved data; it does not publish anything.
3. Open **Interpretation and sources**. The legend explains the current view and links its sources. In the default view, every petal has equal width: width carries no data. Height shows stake share on a linear scale. The remaining validators are grouped into an explicit “everyone else” petal. Your saved view can differ, so read the date and the legend before comparing petals.
4. Read [how Petals fits together](https://petals.elementarycomplexity.com/docs/getting-started/how-petals-works), then inspect the [brain](https://petals.elementarycomplexity.com/docs/brain) and [schemas](https://petals.elementarycomplexity.com/docs/data-protocol). The reference pages render the repository's own files.

Browsing needs no wallet or credit. Talking with Petals' hosted agent needs credit and a sign-up with a NEAR wallet. Ethereum and Solana wallets linked afterwards sign in to the same profile and pay through NEAR Intents.

## Run from a clean checkout

Use **Node 24** and **pnpm 10.33.0**, as pinned in [.nvmrc](.nvmrc) and [package.json](package.json). Obtain a checkout of this repository and run the following from its root.

```sh
pnpm install --frozen-lockfile
```

### Produce a flower without a wallet, model key or payment

```sh
export PETAL_STATE_DIR="$(mktemp -d /tmp/petals-demo.XXXXXX)"
pnpm -s petal figures near-validators --fake
pnpm -s petal render near-validators --fake --out "$PETAL_STATE_DIR/flower.svg"
```

The first command prints figures for the recorded NEAR validator fixture. The second writes `flower.svg` in the temporary state folder. The fixture has 371 participants; the one-third concentration threshold is reached by nine participants. This is recorded test data, not today's network. Open the SVG in a browser to see the flower.

### Run the site and API

In terminal one, from the repository root:

```sh
export PETAL_STATE_DIR="$(mktemp -d /tmp/petals-server.XXXXXX)"
PETAL_FAKE=1 PETAL_API=http://127.0.0.1:3000 pnpm run server
```

In terminal two, from the same repository root:

```sh
PETAL_SERVER=http://127.0.0.1:8787 pnpm dev
```

Open [localhost:3000/docs](http://127.0.0.1:3000/docs) to read the docs. Open [localhost:3000/api/v1/health](http://127.0.0.1:3000/api/v1/health): it should return JSON with `ok: true`, `fake: true` and `llm: "recorded"`. Both processes bind to `127.0.0.1`.

A fresh local [Power Map](http://127.0.0.1:3000/map) is empty. The public site's saved collection is deployment state and is not bundled with a clone. The CLI example above is the reproducible flower demonstration; fixture mode does not import the public collection.

Use **`pnpm run server`**, including `run`. With this pnpm version, `pnpm server` does not start the application's API. `pnpm dev` starts only the web app. Stop both development processes with Ctrl-C when finished.

### Check the code

```sh
node --test apps/web/components/docs/content.test.ts
bash scripts/check.sh
```

The full gate checks TypeScript, lint, unit tests, secret and publication boundaries, protocol and generated-file consistency, design tokens and a production web build. See [docs maintenance](docs/README.md) for how Markdown becomes pages.

## How the system is arranged

| Part               | Responsibility                                                             | Source                                                                 |
| ------------------ | -------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Brain              | Doctrine, chapters and recipes guide an agent's reading and interpretation | [brain/](brain/)                                                       |
| Inputs             | Read supported on-chain systems, retaining the source and reading context  | [packages/inputs/](packages/inputs/)                                   |
| Data and rendering | Validate versioned records; connect data to dimensions; draw flowers       | [packages/core/](packages/core/)                                       |
| Tools and agent    | Expose operations, run conversations and coordinate jobs                   | [packages/tools/](packages/tools/), [packages/agent/](packages/agent/) |
| Site and CLI       | Browser workspace, public map, docs and command-line entry point           | [apps/web/](apps/web/), [apps/cli/](apps/cli/)                         |
| NEAR integration   | Authentication, payments and NEAR-facing infrastructure                    | [packages/near/](packages/near/)                                       |

The API is a separate process. The Next.js site forwards API requests to `PETAL_SERVER`. The same brain chapters appear in the docs and in agent setup; protocols and schemas are rendered from their canonical files, with examples from their fixtures.

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

## Collective mapping

The Power Map is built together by its people, and three counts per person show who's helping: facts they added first, facts they confirmed, and accounts that built on their work. A map is everything its authors published about one address: each publication is a version signed by its author's wallet and kept in an append-only record, and the map is composed from that record, fact by fact, the same way every time. The same value at the same block is one fact, credited to everyone who stated it; a different value is marked for anyone to check, and both stand. Nobody's work replaces another's, and anyone can recompute each author's counts from the record. One press can carry many publications in one manifest (`manifest/v1`); Petals' base data on 267 maps is signed once by petals.near, checkable from each map's version history. See [collective mapping](https://petals.elementarycomplexity.com/docs/ideas/collective-mapping) and the [spec](specs/005-mapping-brain/composition.md).

## What uses NEAR

| Piece                   | Role                                                                                                                                                                                                                  | Source                                                                                                                     |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Credit contract         | `petals-credit.near` on mainnet: payments go in as deposits. `petals.near` can upgrade it (deliberate for the hackathon), so "always withdrawable" is Petals' promise, kept in every build, not enforced by the chain | [Rust contract](packages/near/contract/src/lib.rs)                                                                         |
| Charger                 | `petals-charger.near`'s service key can only call `charge` on the credit contract; the account also holds the owner's full-access key                                                                                 | [Rust contract](packages/near/contract/src/lib.rs)                                                                         |
| Owner                   | `petals.near` signed the base data on 267 maps once; upgrades the credit contract this first wave                                                                                                                     | [Manifest schema](packages/core/schema/manifest.schema.json)                                                               |
| NEAR AI Cloud, in a TEE | Petals' hosted agent; each answer can carry a `provider_tee` signature made inside the model's enclave                                                                                                                | [Client](packages/agent/src/near-ai.ts), [signatures](packages/agent/src/signature.ts)                                     |
| NEAR Intents (1Click)   | Top up from supported tokens and chains                                                                                                                                                                               | [1Click adapter](packages/near/src/pay/one-click.ts), [payment routes](packages/agent/src/pay-routes.ts)                   |
| FastData publications   | `petals-writer.near` writes published flowers to `petals.near` with a key restricted to `__fastdata_kv`; the account also holds the owner's full-access key                                                           | [Writer](packages/near/src/map/fastdata-writer.ts), [reader](packages/near/src/map/fastdata-reader.ts)                     |
| NEAR Social             | Public profile data, read from NEAR Social's API                                                                                                                                                                      | [Profile integration](apps/web/lib/near-social.ts)                                                                         |
| near-connect, NEP-413   | Sign in by proving control of an account, through near-connect's wallet picker                                                                                                                                        | [Wallet](apps/web/lib/wallet.ts), [verifier](packages/near/src/auth/nep413.ts)                                             |
| Sputnik DAO             | Read NEAR DAO governance                                                                                                                                                                                              | [Reader](packages/inputs/src/modules/sputnik-dao.ts)                                                                       |
| People's own agents     | Join a person's work and return mapping jobs                                                                                                                                                                          | [Connection chapters](https://petals.elementarycomplexity.com/docs/connect-your-agent), [jobs](packages/agent/src/jobs.ts) |

## Verify it on chain

Read-only, on NEAR mainnet; no wallet or key needed. With [near-cli-rs](https://github.com/near/near-cli-rs):

```sh
# The credit contract's code: hash Dy3xxsZTPsviKF6G4gFsAPnwHw5rJ4eGHNADZNdPshNx
near account view-account-summary petals-credit.near network-config mainnet now

# Its configuration: {"owner":"petals.near","charger":"petals-charger.near","wnear":"wrap.near"}
near contract call-function as-read-only petals-credit.near config json-args '{}' network-config mainnet now

# What it has charged so far, in yoctoNEAR
near contract call-function as-read-only petals-credit.near earned json-args '{}' network-config mainnet now

# One account's deposit, in yoctoNEAR (for example; balances move as people use Petals)
near contract call-function as-read-only petals-credit.near balance_of json-args '{"account_id":"elcocoel.near"}' network-config mainnet now

# The service accounts' keys: a restricted key each, and the owner's full-access key
near account list-keys petals-charger.near network-config mainnet now
near account list-keys petals-writer.near network-config mainnet now
```

The same calls over JSON-RPC, with no install:

```sh
curl -s https://rpc.mainnet.fastnear.com -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"view_account","finality":"final","account_id":"petals-credit.near"}}'
curl -s https://rpc.mainnet.fastnear.com -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"call_function","finality":"final","account_id":"petals-credit.near","method_name":"config","args_base64":"e30="}}'
```

A published flower on FastData: `petals-writer.near` wrote the key `petal/v1/spec/62eaaefb9f5852c72d37a63c` to `petals.near` at block 224,536,338 ([transaction](https://nearblocks.io/txns/65guEPJJQCFwmKTSzMBSLEYpFU15mvZvZbaspEWt4qbm)). Read it back, and see it [drawn](https://petals.elementarycomplexity.com/f/62eaaefb9f5852c72d37a63c):

```sh
curl -s -X POST https://kv.main.fastnear.com/v0/latest/petals.near/petals-writer.near \
  -H 'content-type: application/json' -d '{"key":"petal/v1/spec/62eaaefb9f5852c72d37a63c"}'
```

A NEAR Social profile, as Petals reads one: `curl -s https://api2.near.social/v1/accounts/mob.near`.

Explorer: [petals-credit.near](https://nearblocks.io/address/petals-credit.near), [petals-charger.near](https://nearblocks.io/address/petals-charger.near), [petals-writer.near](https://nearblocks.io/address/petals-writer.near), [petals.near](https://nearblocks.io/address/petals.near).

## Data coverage

Petals reads systems on NEAR, Ethereum, Base, Arbitrum, Gnosis and Solana. Readings retain their date or block and their sources. Available data differs by system and reader.

## Dependencies

Package manifests and [pnpm-lock.yaml](pnpm-lock.yaml) list the project's third-party dependencies and versions.

## Build it with us

Start with [contribution paths](https://petals.elementarycomplexity.com/docs/build-it-with-us). Improve a reading recipe, add a reader with a bounded fixture, clarify a schema example, improve the renderer or fix a confusing guide. Keep factual data, interpretations and view choices distinct. Run the full gate before proposing a change.

The [media page](https://petals.elementarycomplexity.com/docs/build-it-with-us/media-kit) links to the demo and system illustration.

## NEAR HACKATHON

Built for NEAR HACKATHON. The code was written with AI coding agents (Claude Code and Codex). Third-party libraries are listed in the package manifests and pnpm-lock.yaml.

## Licence

[MIT](LICENSE).
