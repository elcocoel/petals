# Petals

Petals helps people explore who holds power in on-chain networks. It reads accounts and governance data, draws them as flowers, and gives a person and their agents a shared place to investigate the sources.

An account becomes a petal. Its dimensions can show different data: voting power, holdings, membership or the backers behind a pool. The person's view sets what the dimensions mean.

[Open Petals](https://petals.elementarycomplexity.com) · [Documentation](https://petals.elementarycomplexity.com/docs) · [Connect an agent](https://petals.elementarycomplexity.com/connect)

## Try it without an account

1. Open the [Power Map](https://petals.elementarycomplexity.com/map). You should see the public collection of mapped networks. Select **NEAR** to filter it.
2. Open this [NEAR validator flower](https://petals.elementarycomplexity.com/d/dfa817f79b994383d6de7f8ad1b3015e352b85a0295e31e17c7d983ba9a2251a). You should see **60 largest validators + everyone else**, with a dated reading and a flower. The link opens a draft view of saved data; it does not publish anything.
3. Open **Interpretation and sources**. The legend explains the current view and links its sources. In the default view, every petal has equal width: width carries no data. Height shows stake share on a linear scale. The remaining validators are grouped into an explicit “everyone else” petal. Your saved view can differ, so read the date and the legend before comparing petals.
4. Read [how Petals fits together](https://petals.elementarycomplexity.com/docs/getting-started/how-petals-works), then inspect the [brain](https://petals.elementarycomplexity.com/docs/brain) and [schemas](https://petals.elementarycomplexity.com/docs/data-protocol). The reference pages render the repository's own files.

Browsing needs no wallet or credit. Talking with Petals' hosted agent needs wallet sign-in and credit.

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

## NEAR integrations

| Piece                 | Role                                                     | Source                                                                                                                     |
| --------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| NEAR AI Cloud         | Petals' hosted agent                                     | [Client](packages/agent/src/near-ai.ts)                                                                                    |
| NEAR wallet / NEP-413 | Sign in by proving control of an account                 | [Verifier](packages/near/src/auth/nep413.ts)                                                                               |
| NEAR Intents          | Top up from supported tokens and chains                  | [1Click adapter](packages/near/src/pay/one-click.ts), [payment routes](packages/agent/src/pay-routes.ts)                   |
| petals.near           | Mainnet recipient for direct NEAR top-ups                | [Transfer verification](packages/near/src/pay/transfer.ts)                                                                 |
| Credit contract       | Deposit, charge and withdrawal implementation on testnet | [Rust contract](packages/near/contract/src/lib.rs)                                                                         |
| NEAR Social           | Public profile data                                      | [Profile integration](apps/web/lib/near-social.ts)                                                                         |
| Sputnik DAO           | Read NEAR DAO governance                                 | [Reader](packages/inputs/src/modules/sputnik-dao.ts)                                                                       |
| People's own agents   | Join a person's work and return mapping jobs             | [Connection chapters](https://petals.elementarycomplexity.com/docs/connect-your-agent), [jobs](packages/agent/src/jobs.ts) |

## Data coverage

Petals reads systems on NEAR, Ethereum, Base, Arbitrum, Gnosis and Solana. Readings retain their date or block and their sources. Available data differs by system and reader.

## Dependencies

Package manifests and [pnpm-lock.yaml](pnpm-lock.yaml) list the project's third-party dependencies and versions.

## Build it with us

Start with [contribution paths](https://petals.elementarycomplexity.com/docs/build-it-with-us). Improve a reading recipe, add a reader with a bounded fixture, clarify a schema example, improve the renderer or fix a confusing guide. Keep factual data, interpretations and view choices distinct. Run the full gate before proposing a change.

The [media page](https://petals.elementarycomplexity.com/docs/build-it-with-us/media-kit) links to the demo and system illustration.

## Licence

[MIT](LICENSE).
