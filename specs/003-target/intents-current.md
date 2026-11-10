# Intents: let people pay with the assets they already have

Research date: **8 November 2026**. RESEARCH follow-up to Elco's clarification. Public sources only; no account creation, signatures, quotes reserving funds, transactions or spending. **Read in docs** means documentation/source inspection; **Tested** means an actual request or execution; **Inferred** means our interpretation. Undated pages below were accessed on the research date.

## Answer

**Inferred:** Intents fits the goal of letting a non-NEAR user pay from their existing wallet. The straightforward path is a supported-chain payment delivered as the token the payee accepts. Each service still needs a way to recognize that payment and provide what was bought. Intents does not automatically turn arbitrary transfers into Cloud credits, subscriptions or contract permissions.

The useful product question is **“What must this action receive, and how can the person fund it from the wallet they have?”** It is not “How do we make everyone acquire a NEAR wallet?” No payment architecture is selected here; basic testing remains first.

## What is available

An **intent** is a signed instruction describing an allowed outcome. **Solvers** compete to supply that outcome. The **Verifier** is the contract checking signatures and settling balances. **1Click** is the higher-level service that coordinates a cross-chain quote, deposit, conversion and delivery. An **API** is an interface software can call; **gas** is a blockchain execution fee.

| Need in Petals | Current evidence | Boundary |
|---|---|---|
| Pay a seller/service from an existing Ethereum-family, Solana or Bitcoin wallet | **Read in docs:** 1Click provides a source-chain deposit address and delivers the selected destination asset to a recipient. The user sends with their existing wallet. | Supported token/route, amount and destination must be checked at quote time. Source-chain network fees still apply. No NEAR wallet is required merely to make this payment. |
| Pay a fixed invoice amount | **Read in docs:** `EXACT_OUTPUT` fixes the destination amount and quotes the necessary input, including a price-movement allowance. | Refund handling and route costs matter. The invoice must specify token **and network**, not just “USDC.” |
| Keep a user-owned balance for repeated payments | **Read in docs:** foreign-wallet keys can control accounts inside the Verifier without creating ordinary NEAR accounts. Existing balances can authorize supported swaps by signing messages. | Adds balance/recovery/withdrawal experience. An Intents balance is different from tokens remaining in the original wallet. |
| Fund NEAR execution or token registration | **Read in docs:** native withdrawal and `storage_deposit` primitives exist; storage backing can be paid from wrapped NEAR, a token representing NEAR inside the ledger. | Delivering NEAR does not itself create every needed account or authorize every contract action. Submission gas needs a defined payer/service. |
| Pay and invoke a compatible NEAR contract | **Read in docs:** 1Click exposes `customRecipientMsg`; the lower-level Verifier supports `auth_call`. | Both require a compatible receiving interface. The former is explicitly experimental; neither is a universal “call any contract” switch. |
| Buy NEAR AI Cloud credits | **Read in docs:** Cloud directs users to purchase credits in its console. | No reviewed public documentation establishes an API that credits a person's Cloud balance from an arbitrary 1Click payment. This remains an integration gap, not proof that such a partnership is impossible. |

Sources: [1Click flow](https://docs.near-intents.org/integration/distribution-channels/1click-api/quickstart/making-a-request), [swap types](https://docs.near-intents.org/integration/distribution-channels/1click-api/swap-types), [account abstraction](https://docs.near-intents.org/integration/verifier-contract/account-abstraction), [signed execution](https://docs.near-intents.org/integration/distribution-channels/1click-api/quickstart/signed-intent-execution), [intent types](https://docs.near-intents.org/integration/verifier-contract/intent-types-and-execution), [Cloud quickstart](https://docs.near.ai/cloud/quickstart).

## What “current version” means

**Read in docs:** There is no single version number covering the Verifier, 1Click, bridges, wallets and client libraries. The public API still uses `/v0`; that does not mean an old package implements every current feature. The latest dated entry on the reviewed changelog is **27 October 2026**: 1Click swaps now settle on the NEAR Private Shard. Public swap data remains in the Explorer; `nearTxHashes` contains shield/unshield transactions rather than a public swap transaction. This changes verification assumptions and does not make every payment private. [Changelog](https://docs.near-intents.org/changelog/overview).

**Read in docs:** Current features include confidential balances/swaps, signed execution from existing balances, limit orders, selected yield routes and Hyperliquid integration. These are service-specific integrations, not evidence that any arbitrary service can already accept an intent. Yield routes only work for listed receipt assets that return quotes. [Earn](https://docs.near-intents.org/integration/distribution-channels/1click-api/earn), [documentation index](https://docs.near-intents.org/llms.txt).

**Read in docs:** The 1Click client libraries cover TypeScript, Go and Rust. The separate `@defuse-protocol/intents-sdk` is lower-level: execution and withdrawals are supported, while its documented feature table still leaves deposits to bridge interfaces. The recommended starting integration for payments is 1Click's API or client library, not the assumption that the lower-level SDK supplies a complete checkout. This is an **Inferred lean**. [Swap SDK](https://docs.near-intents.org/integration/distribution-channels/1click-api/sdk), [Intents SDK](https://docs.near-intents.org/integration/devkit/intents-sdk).

## Two limits that matter for “pay for anything needed”

**Read in docs:** `customRecipientMsg` sends a message with a token transfer to a NEAR receiver. The API labels it **HIGHLY EXPERIMENTAL** and warns of loss with incompatible tokens, insufficient token-registration storage or a receiver lacking `ft_on_transfer`. The lower-level withdrawal documentation separately says supplying any `msg`, including an empty string, removes its normal withdrawal refund protection. This is a concrete restriction on combining payment and action. [Quote schema](https://docs.near-intents.org/api-reference/oneclick/request-a-swap-quote), [withdrawal behavior](https://docs.near-intents.org/integration/verifier-contract/deposits-and-withdrawals/withdrawals).

**Read in docs:** `auth_call` invokes **`on_auth(signer_id, msg)`**, not an arbitrary method chosen by the caller. It can attach NEAR taken from the user's wrapped-NEAR balance, but its documented attached deposit is not refunded on failure. Cross-contract calls are asynchronous: a batch's internal order does not guarantee that external effects finish in that order. **Inferred:** a future receiving contract can deliberately support foreign-wallet authorization, but ordinary Sputnik or Cloud interfaces do not gain compatibility automatically. [AuthCall](https://near.github.io/intents/defuse_core/intents/auth/struct.AuthCall.html), [execution ordering](https://docs.near-intents.org/integration/verifier-contract/intent-types-and-execution).

## Restrictions and costs to show honestly

- **Read in docs:** the current default platform schedule lists **0.25% without a partner key**, or **0.20% with one**, reduced to **0.01% for stablecoin/same-asset routes**. Additional bridge/network/withdrawal costs and optional application fees still matter. Earlier dry quotes did not always match the documented keyless fee. Use the actual quoted total; no fresh fee measurement was obtained here. [Fees](https://docs.near-intents.org/resources/fees).
- **Read in docs:** September restrictions remain listed: minimum $100 for certain Tron-origin routes and $1,000 for origin-to-origin routes on nine chains. Routes into/out of Intents balances are described as unaffected. This must be checked with current quotes; it is not a universal minimum for every payment. [Changelog](https://docs.near-intents.org/changelog/overview).
- **Read in docs:** `ANY_INPUT` is a partner-only standing collector that sweeps after a **$1,000** threshold, with no normal refunds. **Inferred:** despite its attractive name, it is not the default checkout for small software payments. [Swap types](https://docs.near-intents.org/integration/distribution-channels/1click-api/swap-types).
- **Read in docs:** signed-execution API endpoints require partner authentication; a user's signature authorizes the spend. The partner key alone is not a user spending key. Public Verifier accounts permit registered keys full control; do not treat adding an agent key as a spending-limit mechanism. [Authentication](https://docs.near-intents.org/integration/distribution-channels/1click-api/authentication), [account keys](https://docs.near-intents.org/integration/verifier-contract/account-abstraction).
- **Read in docs:** no public Intents testnet is offered. **Inferred:** start with fixtures and dry quotes; any real settlement test requires separately approved mainnet spending. [FAQ](https://docs.near-intents.org/resources/faqs).

## Lean for the later payment implementation

**Inferred proposal:** each payable action declares its payee, accepted token/network, exact amount and what constitutes successful delivery. Petals obtains a quote from the person's chosen supported asset, the person pays with their own wallet, and the service grants the purchased result only after verified settlement. Petals need not operate a pooled customer balance. A third-party settlement/bridge dependency remains.

Keep four outcomes distinct: **payment received**, **service credit granted**, **requested action completed**, and **refund completed**. A successful swap establishes only its own delivery; it does not prove an AI account was credited or a separate contract call succeeded. Repeated use may later justify a user-owned Intents balance, but neither wallet login nor private commentary needs one.

The post-testing trial should answer one concrete question: can a person starting with a foreign wallet complete a useful paid action without acquiring a NEAR wallet, with clear failure/refund behavior and no Petals spending authority? Test a low-cost supported stablecoin route first, then source-wallet variations including Bitcoin. For Cloud, establish the credited-account/payment interface before promising a seamless checkout.

## Evidence boundary

**Tested — this pass:** unauthenticated read requests to the live token endpoint and full OpenAPI URL returned HTTP 403 from this environment. Public documentation and its embedded quote schema were readable. Therefore this report does **not** claim a fresh token count, executable-route list, live quote, settled payment or working contract callback. The 5 November token counts/minimums remain dated prior observations, not today's facts. Read-only source snapshots and request outcomes are in project `research/spikes/intents-current-2026-11-08/`.

No new accounts, keys or financial approvals were requested. Public claims and permanent-storage design remain parked until testing and basic usability are satisfactory.
