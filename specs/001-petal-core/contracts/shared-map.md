# Contract: the shared map on NEAR (FastData KV)

**Version**: map/v1 | **Owner**: workstream W3 (NEAR adapters, `@petal/near/map`) | **Consumers**: tools (`get_snapshot`, `list_flowers`, `get_flower`, `publish_flower`), web

The shared map is a set of keys written with `__fastdata_kv` function calls to a receiver account that has no contract. The FastData indexer records every write with its writer (`predecessor_id`), signer, tx hash, block and time. Writes go to **testnet** during the build. Mainnet only with Elco's OK.

## Accounts (proposed names; Elco creates them)

| Role | Testnet | Mainnet (later, needs OK) | Keys |
|---|---|---|---|
| Receiver: the map's namespace | `petals.testnet` | `petals.near` (free on 2026-11-04) | full-access key stays with Elco. **No contract is ever deployed.** |
| Petal's writer | `petals-writer.testnet` | `writer.petals.near` | full-access key stays with Elco. Petal's server holds only a **function-call key**: receiver `petals.testnet`, method `__fastdata_kv`, allowance 1 NEAR. It cannot move funds or add keys. |
| Maker | any `.testnet` account | any `.near` account | the maker's wallet. Signs NEP-413 messages (no gas). Phase B: may add a function-call key for their own agent. |

## Endpoints

| Use | Testnet | Mainnet |
|---|---|---|
| KV reads | `https://kv.test.fastnear.com` | `https://kv.main.fastnear.com` |
| RPC (send tx, `view_access_key`) | `https://rpc.testnet.fastnear.com` | `https://rpc.mainnet.fastnear.com` |
| Explorer link | `https://testnet.nearblocks.io/txns/<hash>` | `https://nearblocks.io/txns/<hash>` |

All reads were keyless on 2026-11-04. FastNEAR's docs ask for a key; Petal sends one only if `FASTNEAR_API_KEY` is set.

## Keys and values

All keys start with `petal/v1/`. Keys ≤ 1,024 bytes; values ≤ 256 KiB; ≤ 256 keys per call.

| Key | Value | Phase | Written by |
|---|---|---|---|
| `petal/v1/spec/<id>` | Entry (`flower/v1`, [petal-spec.schema.json](./petal-spec.schema.json)) | A | Petal's writer, for a maker who signed it |
| `petal/v1/snapshot/<sha256>` | `{ "petal": "snapshot-ref/v1", sha256, bytes, gz_bytes, rows, network: { id, chain, population }, as_of, block_height, final, module: { id, version }, urls[] }` | A | Petal's writer, once per final snapshot |
| `petal/v1/index/<caip2>/<population>/<block_height>` | `{ "sha256": "…" }` | A | Petal's writer |
| `petal/v1/label/<caip2>/<address>` | `{ tag, value, status, evidence[], written_at }` | B | Petal's writer, or a maker directly |
| `petal/v1/correction/<flower-id>/<id>` | Correction request (below): `{ "petal": "correction/v1", flower_id, target, request, reason, evidence[], requester, proof, written_at }` | B | Petal's writer, for a requester who signed it |
| `petal/v1/vouch/<account>` | `{ since, note }` — trusted writers | B | the receiver account (Elco) |

`<id>` is the entry id (24 hex). `<caip2>` is e.g. `near:mainnet`. The snapshot body is never on the map: `urls[]` points to Petal's API (`/api/v1/snapshots/<sha256>`) and, once the repo is public, the fixture file in the repo. FastFS (files up to 32 MiB, gas only) is a Phase B test for bodies.

## Writing (Phase A: relayed publish)

1. The site (or an agent) calls `prepare_publish` and gets `entry_sha256`, `nonce` (32 random bytes), `recipient` (`petals.testnet`) and the message `{"petal":"publish/v1","entry_sha256":"…"}`.
2. The maker signs it with NEP-413 in their wallet: `connect({ signMessageParams })` signs in and signs in one prompt; if already connected, `wallet.signMessage`. No gas, no transaction, no testnet NEAR needed.
3. `publish_flower` verifies the proof with `near-api-js` `verifyMessage` (which also checks the key is a full-access key of the account), then sends one transaction from Petal's writer: `functionCall("__fastdata_kv", { "<key>": value, … }, gas 1, deposit 0)` to `petals.testnet`, with `throwOnFailure: false`.
4. The receipt fails because there is no contract. That is expected: treat it as success, do not retry. Confirm by polling `GET /v0/latest/petals.testnet/<writer>/<urlencoded key>` until the value appears (up to 30 s).
5. Write the same value to the local mirror with the tx hash. If FastData or RPC is down, the mirror keeps it as `pending` and a retry job sends it later.

Why relayed first: the maker needs no funded account and sees no "transaction failed" screen (wallets report no-contract receipts as failed). The maker's NEP-413 signature sits inside the entry, so anyone can check authorship without trusting Petal.

## Writing (Phase B: the maker writes)

- **Direct**: the maker's wallet sends the `__fastdata_kv` call itself, so the writer is the maker. The site explains the expected "failed" status first.
- **Agent key** (FR-029): the maker's own agent generates a key pair; the maker approves `connect({ addFunctionCallKey: { contractId: "petals.testnet", publicKey, allowMethods: { anyMethod: false, methodNames: ["__fastdata_kv"] }, gasAllowance } })`. The agent then writes as the maker and cannot move the maker's funds.

## Reading

- **Gallery**: for each trusted writer, `POST /v0/latest/petals.testnet/<writer>` with `{ "key_prefix": "petal/v1/spec/", "limit": 200, "include_metadata": true }`, following `page_token` until absent. There is no multi-writer filter; one call per writer.
- **One flower**: `GET /v0/latest/petals.testnet/<writer>/<key>`; metadata (tx hash, block) via the POST form with `include_metadata`.
- **Is this snapshot mapped?**: `POST /v0/multi` with up to 100 exact keys `petals.testnet/<writer>/petal/v1/index/…`.
- **History of a key**: `POST /v0/history/petals.testnet/<writer>` with `{ "key": … }` and paging. Avoid the GET form (capped at 50 rows).
- **Check counts**: page oldest-first or per writer and compare counts; a newest-first prefix read stopped at 200 of 277 rows on 2026-11-04.

## Correction requests (FR-022)

Anyone can ask for an identity link or label to be corrected or removed. Two channels:

1. **Signed entry on the map** (for people with a NEAR account). Schema: `$defs.correction` in [petal-spec.schema.json](./petal-spec.schema.json). The flower's page or `prepare_correction` builds the request; `<id>` is the first 24 hex characters of the SHA-256 of the canonical request without `id` and `proof`. The requester signs the NEP-413 message `{"petal":"correction/v1","correction_sha256":"…"}` (no gas). `submit_correction` verifies it as `publish_flower` does (fresh nonce, full-access key) and Petal's writer writes `petal/v1/correction/<flower-id>/<id>`.
   - `target`: `{ participant, caip2, address, label_key? }` (the identity link or label in question).
   - `request`: `correct` or `remove`. `reason`: plain words. `evidence[]`: `{ kind, url, note }`, optional.
   - `requester`: the NEAR account; `proof`: the NEP-413 proof.
2. **GitHub issue** (fallback, for people without a NEAR account): a link to a prefilled issue on the public repo (`PETAL_REPO_URL`), naming the flower id and the target.

What happens next: the flower shows open requests next to the identity link they concern. An accepted request leads to a new label version that says so. The map is append-only, so a "removed" label is hidden by Petal's readers, while the old row stays in FastData's history; the page says this plainly.

## Trust and verification

- Anyone can write under `petals.testnet`. Readers only show rows from trusted writers. Phase A: `PETAL_TRUSTED_WRITERS=petals-writer.testnet`. Phase B: vouch entries, plus rows where writer = the entry's maker after verification, marked "written by the maker".
- For every entry the reader recomputes `entry_sha256` and `id`, checks `spec_sha256`, and verifies the maker's NEP-413 signature with the stored public key. A row that fails is hidden and logged.
- Stored values come back re-serialised with sorted keys, so always hash the canonical JSON (RFC 8785) of the parsed value, never the raw bytes.

## Retention and mirror

Regular RPC keeps about 18–20 hours of transactions; older ones are on archival nodes. The KV index still had rows from January 2026, but no retention is promised, and FastNEAR alone runs the indexer, archival RPC and FastFS. So Petal mirrors every entry it writes (`.petal/mirror/` locally; `fixtures/map/` for the hero set, checked in). The gallery falls back to the mirror when the KV API is unreachable and says so.

## Costs (measured 2026-11-04, mainnet prices; testnet is free)

One 4 KB entry ≈ 0.00014 NEAR. A snapshot ref ≈ 0.00012 NEAR. Batching matters more than size. The writer's function-call allowance is charged at 10× the gas price, so keep attached gas at 1.

## Tests (W3)

- `fakeMap()` passes the same reader/writer tests as the FastData client.
- Testnet smoke test (needs the accounts): write one entry, read it back by key and by prefix, compare hashes, then check the mirror.
- NEP-413: a valid proof passes; a wrong message, a reused nonce, a stale nonce, and a function-call key each fail.
- Corrections: a signed request round-trips through `fakeMap()`; its recomputed id matches the key; an unsigned or tampered request is refused.
