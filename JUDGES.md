# Judging Petals

Petals maps who holds power in an on-chain network and draws it as a flower: one petal per account, sized by its share.
An agent reads the chain with deterministic tools, records the source and block of every reading, and keeps facts apart
from what it inferred. It runs on NEAR mainnet: NEAR sign-in, an agent on NEAR AI Cloud, a credit contract, NEAR Intents
top-ups and flowers published to FastData.

Live: https://petals.elementarycomplexity.com · Repo map: [AGENTS.md](AGENTS.md#repo-map) · Licence: MIT.

The submission form carries a no-wallet invite link for the hosted agent; it is not in this repo.

**One fixed public flower:** https://petals.elementarycomplexity.com/f/62eaaefb9f5852c72d37a63c (a flower published to
FastData by `petals-writer.near`, signed by `petals.near`).

## Three steps, no wallet

1. Open https://petals.elementarycomplexity.com/map. You see the Power Map: 184 maps across Solana, Ethereum, NEAR, Base,
   Arbitrum and Gnosis, filterable by chain in Tools.
2. Open the fixed flower above. You see its petals, with the reading's sources and the block it was read at.
3. Run `curl -s https://petals.elementarycomplexity.com/api/v1/maps/eip155:100:0x372fc5a6b0b12ae174f09f6fc849a83de6b503b6/record`.
   You see RaidGuild's map record: each entry with its author, `"signed": true` for `petals.near`, and its layers by
   hash.

## By track

Every row is live on mainnet unless its status says otherwise.

### Privacy & Private AI

| Claim                                                                                            | Status | Code or test                                                                                                | Check                                                                                                         | Expected                                                        |
| ------------------------------------------------------------------------------------------------ | ------ | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Petals' agent runs on NEAR AI Cloud; every answer keeps its TEE signature and attestation report | live   | `packages/agent/src/near-ai.ts`, `packages/agent/src/signature.ts`, `packages/agent/test/signature.test.ts` | With the invite link, ask a question; the answer's report is served at `/api/v1/attestations/<report_sha256>` | The attestation report NEAR AI returned, matched by its hash    |
| A person's conversations and pages stay private                                                  | live   | `packages/tools/test/private-state.test.ts`; run owners in `specs/001-petal-core/contracts/http-api.md`     | `curl -sI https://petals.elementarycomplexity.com/lobby`                                                      | `307` to `/`: a person's own page is closed to visitors         |
| Mail addresses and phone numbers are kept out of published claims about people                   | live   | `packages/core/src/claims/people.ts`                                                                        | Read the rule at the top of that file                                                                         | Values, notes and quotes with an address or number stay private |

### AI Security & Defense

| Claim                                                                                                             | Status | Code or test                                                                                                                                       | Check                                                                              | Expected                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `petals-credit.near`: only an account withdraws its own balance; only the charger charges, never beyond a balance | live   | `packages/near/contract/src/lib.rs` (`withdraw`, `charge`)                                                                                         | Step 6 below: code hash and `config`                                               | Code hash `Dy3xxsZTPsviKF6G4gFsAPnwHw5rJ4eGHNADZNdPshNx`; `{"owner":"petals.near","charger":"petals-charger.near","wnear":"wrap.near"}` |
| The service keys are restricted                                                                                   | live   | `packages/near/scripts/credit-setup.ts`                                                                                                            | `view_access_key_list` for `petals-charger.near` and `petals-writer.near` (step 6) | `FunctionCall(petals-credit.near: charge)` and `FunctionCall(petals.near: __fastdata_kv)`, each beside a full-access key                |
| Sign-in proves control of a NEAR account (NEP-413); Ethereum and Solana wallets link to the same person           | live   | `packages/near/src/auth/nep413.ts`, `packages/near/src/auth/wallets.ts`, `packages/near/test/nep413.test.ts`, `packages/near/test/wallets.test.ts` | `pnpm vitest run packages/near/test`                                               | All tests pass                                                                                                                          |
| Every version a person publishes is signed by them with NEP-413 (manifest/v1 when one press covers many maps)     | live   | `packages/core/schema/manifest.schema.json`, `packages/core/test/manifest.test.ts`, `packages/agent/test/publish-press.test.ts`                    | Step 3 above                                                                       | `petals.near` and `elcocoel.near` entries with `"signed": true`; Petals' imported mapping with `"signed": false`                        |
| Agent keys are stripped from notes                                                                                | live   | `packages/tools/src/tools/explorations.ts` (`withoutKeys`)                                                                                         | Read the function                                                                  | `petal_agent_…` replaces any key in a note                                                                                              |

### Social Money

| Claim                                                                                | Status | Code or test                                                                                                            | Check                                                                       | Expected                                                                            |
| ------------------------------------------------------------------------------------ | ------ | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| NEAR communities' votes and members are read from their Sputnik DAO contracts        | live   | `packages/inputs/src/modules/sputnik-dao.ts`, `packages/inputs/test/sputnik-dao.test.ts`                                | `curl -s https://petals.elementarycomplexity.com/api/v1/maps`               | Maps with ids `near:mainnet:*.sputnik-dao.near`, such as `templar.sputnik-dao.near` |
| Ties between accounts that voted alike are drawn inside a flower                     | live   | `packages/core/src/activity.ts` (votes_alike), `packages/core/src/view/index.ts` (DEFAULT_VIEW), `apps/web/lib/ties.ts` | On `/map`, open Ref Finance                                                 | Ties between its voters, on by default                                              |
| Profiles come from NEAR Social, and a person can write theirs from the lobby         | live   | `apps/web/lib/near-social.ts`                                                                                           | `curl -s https://api2.near.social/v1/accounts/mob.near`                     | A profile as Petals reads one                                                       |
| Every addition carries its author, and credit goes to whoever published a fact first | live   | `packages/core/src/compose/credit.ts`, `packages/core/test/compose.test.ts`                                             | `curl -s https://petals.elementarycomplexity.com/api/v1/credit/petals.near` | `credit/v1` with the author's layers and counts                                     |

### AI Swarms

| Claim                                                                            | Status | Code or test                                                                                             | Check                                                                                                                                                                             | Expected                                                    |
| -------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Petals' agent hands mapping jobs to agents people connect; they work in parallel | live   | `packages/agent/src/jobs.ts`, `packages/agent/test/hand-job.test.ts`, `packages/tools/test/jobs.test.ts` | https://petals.elementarycomplexity.com/setup and https://petals.elementarycomplexity.com/skill.md                                                                                | The prompt and skill an agent follows to join and take jobs |
| One press signs a whole swarm's work (manifest/v1: one press, many publications) | live   | `packages/core/schema/manifest.schema.json`, `packages/agent/test/publish-press.test.ts`                 | `pnpm vitest run packages/agent/test/publish-press.test.ts`; live, the `petals.near` entry dated 2026-11-14T00:01:56Z in step 3 above is one of 267 maps signed by that one press | Tests pass; one signature over many maps                    |
| One Brain guides every agent                                                     | live   | `brain/`, `packages/tools/test/brain.test.ts`                                                            | https://petals.elementarycomplexity.com/docs/brain and `/api/v1/brain/usage`                                                                                                      | The chapters and recipes, and how often each is used        |

### Agent Economy

| Claim                                                                   | Status | Code or test                                                                                          | Check                                                         | Expected                                    |
| ----------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------- |
| Petals' agent earns NEAR for each answer, from the person's own deposit | live   | `packages/near/contract/src/lib.rs` (`charge`, `earned`), `packages/agent/test/person-credit.test.ts` | `earned` on `petals-credit.near` (README, Verify it on chain) | A nonzero amount in yoctoNEAR               |
| It pays NEAR AI for its compute                                         | live   | `packages/agent/src/near-ai.ts`                                                                       | Not on chain: NEAR AI Cloud bills Petals' account             |                                             |
| Anyone's own agent works with Petals through `/mcp` and `skill.md`      | live   | `packages/tools/` (MCP), `skill/petal/SKILL.md`                                                       | `/skill.md`; `/mcp` takes MCP over POST                       | The skill text; a GET to `/mcp` answers 405 |

### Open Innovation

| Claim                                                       | Status  | Code or test                                          | Check                                                        | Expected                                     |
| ----------------------------------------------------------- | ------- | ----------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------- |
| Open code under MIT                                         | live    | `LICENSE`                                             | https://github.com/elcocoel/petals                           | MIT                                          |
| Open schemas any agent can write                            | live    | `packages/core/schema/`, `scripts/check-protocols.ts` | https://petals.elementarycomplexity.com/docs/data-protocol   | Each format, its schema and a pinned example |
| Readings are deterministic and carry their source and block | fixture | `fixtures/`, `packages/core/test/figures.test.ts`     | Step 2 below, twice                                          | The same figures each time                   |
| A map with dated readings plays month by month              | live    | `apps/web/components/PlayControl.tsx`                 | On `/map`, open House of Stake, enter the flower, press Play | The flower steps through its dated readings  |

## Mainnet transactions from the 14 November walk-through

- Credit contract v3 deployed: https://nearblocks.io/txns/6c8mKxSQWDGgRtRuXU6zQBjWxE6njvWMovF8VCDoQ3gF
- A deposit: https://nearblocks.io/txns/3L9Ba4HVrUVbMnEhiny6LcxaN4kNrn2q2wb3g1vx1Tm3
- A charge for an answer: https://nearblocks.io/txns/5fcNYMh9bw9NBevzZYMubWuzzFE8jai25NWJfcaRsQTA
- A partial withdrawal: https://nearblocks.io/txns/HAu1ZNyEPpeecWXy4YVDs41XBi6tUvnb7w89tPU692oM
- A NEAR Intents top-up, USDT on Ethereum to NEAR on a Petals balance:
  https://etherscan.io/tx/0x7a1ad72f82366250a91f5303920bb7a238fa73f79f123394a7c81622803aa431, then
  https://nearblocks.io/txns/BHJ5Y5dSomzhoUUkmffxGZVxurJzyKZWvNVFsRrpRs8Z and
  https://nearblocks.io/txns/58875yYdkWquBHdPFKnVP1uJJbYdxF5YzBWhXFAnAwJW
- A flower published to FastData: https://nearblocks.io/txns/65guEPJJQCFwmKTSzMBSLEYpFU15mvZvZbaspEWt4qbm
- A NEAR Social profile write: https://nearblocks.io/txns/2E1y78FT11G13vF8ED2XWEQ911442bwYoKQMGVyfMAWY

FastData writes (flowers, NEAR Social) go to an account with no contract, so the explorer shows the receipt as failed by
design; the indexer reads the call (step 6).

## Verify it in ten minutes

Needs Node 24 and pnpm 10.33.0 (pinned in `.nvmrc` and `package.json`). Run from the repository root.

1. Install from the lockfile.

   ```sh
   pnpm install --frozen-lockfile
   ```

2. Draw a flower from a recorded fixture, with no wallet, model key, network or payment.

   ```sh
   export PETAL_STATE_DIR="$(mktemp -d /tmp/petals-demo.XXXXXX)"
   pnpm -s petal figures near-validators --fake
   pnpm -s petal render near-validators --fake --out "$PETAL_STATE_DIR/flower.svg"
   ```

   Expect JSON with `"participants_total": 371` and `"nakamoto": { "threshold": 0.333333, "count": 9 }` (nine
   validators hold a third of the stake), then `flower.svg` in the state folder. This is recorded data, not today's
   network.

3. Run the whole gate: typecheck, lint, the unit tests, protocol and schema pins, design tokens, secret and
   publication-boundary scans, and a production web build.

   ```sh
   bash scripts/check.sh
   ```

   Expect the last line `check: all green`.

4. Run the site and API locally (two terminals, both from the root).

   ```sh
   export PETAL_STATE_DIR="$(mktemp -d /tmp/petals-server.XXXXXX)"
   PETAL_FAKE=1 PETAL_API=http://127.0.0.1:3000 pnpm run server
   ```

   ```sh
   PETAL_SERVER=http://127.0.0.1:8787 pnpm dev
   ```

   http://127.0.0.1:3000/api/v1/health returns JSON with `"ok": true`, `"fake": true` and `"llm": "recorded"`. A fresh
   local Power Map is empty: the public collection is deployment state, not part of the clone.

5. The live server's health: https://petals.elementarycomplexity.com/api/v1/health returns `"ok": true`,
   `"fake": false` and the deployed `"commit"`.

6. Check the NEAR pieces on chain, read-only, with no install.

   ```sh
   # The credit contract: its code hash is Dy3xxsZTPsviKF6G4gFsAPnwHw5rJ4eGHNADZNdPshNx
   curl -s https://rpc.mainnet.fastnear.com -H 'content-type: application/json' \
     -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"view_account","finality":"final","account_id":"petals-credit.near"}}'

   # Its configuration (the result is JSON bytes): {"owner":"petals.near","charger":"petals-charger.near","wnear":"wrap.near"}
   curl -s https://rpc.mainnet.fastnear.com -H 'content-type: application/json' \
     -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"call_function","finality":"final","account_id":"petals-credit.near","method_name":"config","args_base64":"e30="}}'

   # The charger's keys: a function-call key for charge on petals-credit.near, and a full-access key
   curl -s https://rpc.mainnet.fastnear.com -H 'content-type: application/json' \
     -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"view_access_key_list","finality":"final","account_id":"petals-charger.near"}}'

   # A published flower, read back from FastData: written by petals-writer.near to petals.near at block 224,536,338
   curl -s -X POST https://kv.main.fastnear.com/v0/latest/petals.near/petals-writer.near \
     -H 'content-type: application/json' -d '{"key":"petal/v1/spec/62eaaefb9f5852c72d37a63c"}'

   # A NEAR Social profile, as Petals reads one
   curl -s https://api2.near.social/v1/accounts/mob.near
   ```

   The same with [near-cli-rs](https://github.com/near/near-cli-rs) is in the README's
   [Verify it on chain](README.md#verify-it-on-chain).

## Known limits

- Withdrawal and the charge limits are enforced by the deployed contract (its code hash is checkable in step 6).
  `petals.near` can upgrade it during the hackathon, so that holds for the code deployed, not forever.
  `petals-charger.near` and `petals-writer.near` each hold a restricted key (`charge` on the credit contract;
  `__fastdata_kv` on `petals.near`) and also the owner's full-access key.
- Readers cover specific systems on NEAR, Ethereum, Base, Arbitrum, Gnosis and Solana; other chains aren't read.
- The hosted agent needs credit or an invite; browsing the Power Map and the docs needs nothing. Flows that move funds
  or publish need a NEAR wallet and can't be exercised read-only.
- The recorded end-to-end suite (`tests/e2e`) is behind the current code; `scripts/check.sh` is the gate.
- A fresh local clone has an empty Power Map; the fixtures replay recorded data, not today's network.
- Ties inside a flower are drawn where a map has votes-alike data (for example Ref Finance); on the Power Map, lines
  join networks that share accounts. The Texture and Markings dimensions take no data yet and are hidden.
- On a map where `petals.near` signed a version over Petals' earlier imported mapping, the import counts as
  `petals.near`'s earlier version (`specs/005-mapping-brain/composition.md`).
- One claim published before contact details were kept out of claims still carries them; the record is append-only.
