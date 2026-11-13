# NEAR frameworks for Petals

**Scope update — 8 November 2026 (after this research):** wallet-only login. Socials are only ever self-connected fields on the user’s profile, with no login, messaging or other functions. Private messaging is not a goal. Claims are private commentary for now; Petals will not define or declare truth. Public-claim storage research resumes only after basic testing and usability. The upgradable mapping protocol follows testing, covering a broader list of mapping targets. The earlier social-login, messaging and public-claim recommendations below are historical options, not current scope. Current follow-ups: [Intents for non-NEAR users](intents-current.md) and [contract shortlist/Sputnik](near-contract-shortlist.md).

**Research/access date: 2026-11-08.** Public primary-source desk research only. Companion to [Q2–Q6 target research](research-q2-q6.md); recommendations for review, not an architecture decision or implementation. Every external link below was accessed on this date. Publication/release dates are given where available; otherwise the source shows no publication date. Commit dates measure repository activity, not production deployment or support commitments.

**Evidence labels:** **Read in docs** includes reading published source code, registry metadata and audit reports. **Tested** means execution; there were **no new functional tests in this pass**. **Tested — prior** identifies earlier project tests, not independently repeated here. **Inferred** marks interpretation and Petals fit. “Audit unverified” means no applicable report/version mapping was established, not proof that no audit exists.

The approved [003 target](spec.md) governs: users sign public claims with their own wallets; private identity links never reach a chain; standing follows the claim record rather than popularity or payment; Petals holds no user funds or spending key; agents run on the user's resources. Earlier research's sponsored writer and limited agent publishing keys are not the approved target.

**Terms.** An API (application programming interface) is a service software can call; RPC (remote procedure call) here means querying a blockchain node. KV means key/value storage. A contract is code executed by the blockchain; append-only means new records can be added but earlier accepted records cannot be overwritten. A hash is a fingerprint of exact data, not a copy of that data.

## Provisional lean

**Inferred:** Reuse NEAR's infrastructure selectively: a small contract is the stronger option for retained public claim bodies; FastData can provide inexpensive indexing or a prototype with disclosed retention limits. Read SocialDB as an additional graph source and map Sputnik/House of Stake as networks. Keep contract libraries available if Q5 later needs enforceable bonds. Nothing examined supplies Petals' complete identity, claim, challenge, correction and standing system.

| Need | Lean to investigate | Principal tradeoff |
|---|---|---|
| Public claims | Small append-only contract for the target; FastData for discovery/prototyping | Cheap transport versus enforceable state rules and retention |
| Public profiles/follows | Read both current near.social and legacy SocialDB | Two independent datasets; a follow proves neither control nor truth |
| Challenge alerts | Derived in-app inbox; optional near.social references later | A notification API is not guaranteed push delivery |
| Bonds/escrow | Defer until settlement rules exist | Code can move money; it cannot establish whether a claim is true |
| Tokens/NFTs | Existing standards only if an actual requirement emerges | Transferable ownership conflicts with personal accountability |
| Governance | Map Sputnik and HoS first | Reusing their voting would introduce a particular electorate and power model |

## 1. near.social/FastData versus SocialDB/BOS

**Read in docs:** These names now describe different layers. Current near.social writes `__fastdata_kv` calls to receiver `social`, without a contract or storage deposit. The receipt fails by design; the indexer confirms accepted data. SocialDB is the older tree-shaped data contract at **`social.near`**. BOS (Blockchain Operating System) was the component/widget execution framework, not the database. NEAR's documentation explicitly deprecates BOS while retaining SocialDB. Its Social page still says SocialDB powers near.social; the live site's guide and migration code describe the newer FastData path. [Current site guide](https://near.social/skill.md), [Social documentation](https://docs.near.org/primitives/social.md), [migration implementation description](https://github.com/evgenykuzyakov/near-social-kv#readme).

**Read in docs:** FastData KV identifies data by receiver, predecessor/writer and key. An indexer, a service that organizes chain activity for queries, converts transaction history into searchable rows; it is not validator-held contract state. Its generic KV API offers latest values and history. SocialDB offers current contract `get`/`keys`, storage accounting and delegated write permissions. Both allow overwrites/deletions in their current view; neither automatically enforces append-only Petals claims. [FastData design](https://hackmd.io/@fastnear/__fastdata), [KV API, updated 2026-11-03](https://docs.fastnear.com/fastdata/kv), [SocialDB contract API](https://github.com/NearSocial/social-db#api).

**Read in docs:** Contract state requires storage backing at 10^19 yoctoNEAR per byte (one yoctoNEAR is 10^-24 NEAR): approximately 10 NEAR per decimal MB, plus gas (transaction execution fees), with overhead. This locks capital rather than charging an annual subscription. Removing state releases backing; it does not erase archived history. FastData avoids that state deposit but depends on archival availability and indexing. [NEAR storage documentation](https://docs.near.org/protocol/storage/storage-staking).

**Tested — prior:** an earlier project test (2026-11-04) recorded keyless KV reads. A later one (2026-11-05) recorded testnet writes and reconstruction of 56 rows from 31 transactions with zero value mismatches. It measured ordinary RPC retention around 21–35 hours and found no FastNEAR retention commitment. These are dated observations, not a universal retention guarantee, current service-level guarantee, or new tests. That later pass supersedes an earlier “three days” approximation.

**Inferred:** A unique, content-bound key per statement can make edits visible to Petals readers, but FastData transport alone cannot prohibit another write, enforce a bond or settle a challenge. An indexer can filter what it displays. A contract could enforce transitions and hold durable current records, at the cost of custom logic, storage and governance. A hash proves integrity, not availability. Q4 therefore leans toward contract state for retained claims. FastData is not a perpetual archive guarantee, and SocialDB should not be called abandoned merely because the current social site uses a different path.

## 2. Graphs, profiles, messages and notifications

**Read in docs:** Legacy SocialDB's graph schema supports typed outgoing account edges; the current `social-kv/1` standard defines follows using `graph/follow/<account>`. The current site's onboarding offers user-signed import of profiles and outgoing follows from SocialDB. This is migration, not automatic synchronization. Public profiles are self-declarations, including social URLs: neither schema proves that the writer controls a linked external account. [Legacy graph schema](https://github.com/NearSocial/standards/blob/master/types/graph/Graph.md), [current data standard](https://api2.near.social/standard.md), [onboarding description](https://github.com/evgenykuzyakov/near-social-kv#readme).

**Inferred:** These are useful evidence edges and optional profile decoration. They cannot replace TGT-002's signature/OAuth proof. Keep user follows, inferred coordination, verified wallet links and governance delegation as distinct relations. Putting private follows, identity links or workspace material here would make them public; encryption would still publish ciphertext and metadata.

**Read in docs:** Current near.social derives notifications for likes, reposts, replies, quotes, mentions and follows. Its HTTP API has notification lists/counts and `/v1/stream`, a **server-sent event** connection that tells an open client about indexed blocks. It is not an operating-system push service. `dm/` is reserved, and direct messages remain roadmap. FastData's design mentions `__fastdata_chat`, but that describes channel aggregation, not a verified deployed encrypted messaging software development kit (SDK). [Current API source](https://github.com/evgenykuzyakov/near-social-kv/blob/main/docs/API.md), [standard](https://api2.near.social/standard.md), [FastData proposal](https://hackmd.io/@fastnear/__fastdata).

**Read in docs:** Legacy `near-social-js` exposes `notify` and notification queries. Inspecting published **2.0.4** source showed `Graph.index()` posting to `https://api.near.social/index`; users need not run an indexer, but the query still depends on a hosted service. [SDK guide](https://nearbuilders.github.io/near-social-js/), [published package](https://registry.npmjs.org/near-social-js/-/near-social-js-2.0.4.tgz).

**Read in docs / unverified today:** NEAR announced BOS browser push on **2023-10-04**, associated with Pagoda and compatible gateways. That historical announcement does not establish current service availability. Trezu documents Telegram treasury notifications requiring a bot: application-specific delivery infrastructure, not a general NEAR messaging primitive. No applicable messaging/notification audit was verified. [BOS announcement](https://near.org/blog/announcing-web-push-notifications-on-b-o-s), [Trezu README](https://github.com/NEAR-DevHub/trezu#readme).

**Inferred:** A Petals challenge should be discoverable by its claim reference, irrespective of alerts. A near.social reply could advertise it, but adds a public posting flow, gas and moderation dependency. Notification delivery should not determine whether a challenge exists.

## 3. Reusable contracts: tokens, NFTs and escrow

**Read in docs:** `near-contract-standards`, inside `near-sdk-rs`, supplies fungible-token (FT, interchangeable units) and non-fungible-token (NFT, individually identified items) implementations and storage management. **NEP-141** defines interchangeable token balances; **NEP-171** defines uniquely identified tokens. NFT metadata, approvals and enumeration have separate extensions. These interfaces provide interoperability, not truth verification, identity proof or adjudication. [Standards source](https://github.com/near/near-sdk-rs/tree/master/near-contract-standards/src), [FT interface](https://docs.near.org/primitives/ft/standard), [NFT interface](https://docs.near.org/primitives/nft/standard).

**Read in docs:** Official Rust FT/NFT examples remain maintained. `near-sdk-js`, the **contract** SDK, was archived/deprecated on **2026-10-30** and directs developers to Rust; this does not mean the JavaScript client library `near-api-js` is deprecated. [FT example](https://github.com/near-examples/FT), [NFT example](https://github.com/near-examples/NFT), [contract SDK notice](https://github.com/near/near-sdk-js).

**Read in docs:** `near-sdk-contract-tools` adds ownership, roles, pause, upgrades, approval/multisig, escrow and token macros. Its `Escrow` module is a generic storage lock/unlock pattern with a caller-supplied unlocking condition. It does **not** itself implement asset custody, deposits, deadlines, refunds, challenge settlement or slashing. [Library](https://github.com/near/near-sdk-contract-tools/blob/ee3041f446cc28151a77bd7e5dd77a158b1b0846/README.md), [escrow implementation](https://github.com/near/near-sdk-contract-tools/blob/ee3041f446cc28151a77bd7e5dd77a158b1b0846/src/escrow.rs).

**Inferred:** This is useful construction material, not a ready-made bonded-claims service. A transferable NFT could represent a flower edition or access right later; transferring it must never transfer the historical author's accountability. An FT makes standing purchasable if used as its score, contrary to TGT-023. Existing tokens could denominate bonds without issuing a Petals token. A financial escrow holds assets until stated conditions are met; it puts funds under contract control; compatibility with the target's no-custody requirement needs explicit resolution.

**Read in docs:** `ft_transfer_call` invokes a receiver that returns unused tokens for resolution; it is not a timed escrow. NEAR specifically recommends validating the calling token contract and using its standard resolver. Ordinary lockup contracts provide vesting/time release, a different condition from “a challenge was upheld.” [FT receiver guidance](https://docs.near.org/smart-contracts/security/cross-contract-calls/ft-transfer-call.md), [lockups](https://docs.near.org/primitives/lockup/introduction.md).

## 4. Voting, DAOs and multisig templates

A **DAO** (decentralized autonomous organization) coordinates a group's rules through contracts. A **multisig** requires several authorized members to approve an action: K-of-N means K approvals from N members. A **timelock** delays execution after approval.

**Read in docs:** Sputnik V2 supports configurable roles, permissions, role/token vote weighting, thresholds, proposal/bounty bonds, transfers, function calls and upgrades. Its direct views expose policy, proposals and individual votes. DAO interfaces are not a universal NEAR standard. Trezu and the current Sputnik reference UI are clients of this contract family. [Sputnik](https://github.com/near-daos/sputnik-dao-contract), [view methods](https://github.com/near-daos/sputnik-dao-contract/blob/main/sputnikdao2/src/views.rs), [DAO documentation](https://docs.near.org/primitives/dao.md), [reference UI](https://github.com/near-daos/sputnik-dao-ui).

**Inferred:** Excellent mapping targets: roles describe permissions, proposals show exercised power. Reusing a council vote to decide truth would introduce council capture and authority choices; token voting adds wealth weighting. Proposal/bounty bonds incentivize particular workflow behavior, not accuracy of allegations. Historical policy changes matter: current membership alone cannot explain old votes.

**Read in docs:** House of Stake combines user lockups, veNEAR accounting/delegation and snapshot voting. **veNEAR** means voting power associated with locked NEAR, not an ordinary transferable reputation score. Current source distinguishes Classic and FastTrack proposal paths, reviewer gates, timelocks, bonds and council veto. Its workspace identifies **Fastnear Inc** as author and version **1.1.2**. [Architecture](https://github.com/houseofstake/house-of-stake-contracts), [manifest](https://github.com/houseofstake/house-of-stake-contracts/blob/main/Cargo.toml).

**Inferred:** HoS is a rich Petals specimen, but copying its governance stack imports financial lockups and privileged roles. Neither its bonds nor its “voting escrow” label supplies defamation arbitration. The record can show who decided a challenge without establishing that the decision is correct.

| Multisig option | Reusable behavior; limits (**Read in docs**, fit **Inferred**) |
|---|---|
| [Sputnik policy](https://github.com/near-daos/sputnik-dao-contract) | Council thresholds plus proposal lifecycle; strongest ready-made organization model here, potentially excessive for Petals |
| [Core `multisig2`](https://github.com/near/core-contracts/tree/master/multisig2) | K-of-N public-key/account members execute requests; template explicitly gives no guarantee of correctness; applicable audit unverified |
| [Contract-tools approval](https://github.com/near/near-sdk-contract-tools/blob/ee3041f446cc28151a77bd7e5dd77a158b1b0846/src/approval/simple_multisig.rs) | Configurable M-of-N component and request validity; integration and authority model remain custom |

**Read in docs:** Core `voting/` is specifically the historic validator vote to unlock token transfers, not a general polling/arbitration template. [Its README](https://github.com/near/core-contracts/tree/master/voting). Global contracts share code while preserving separate state: a hash pins code, an account reference follows publisher updates. These choices do not independently remove a user's upgrade authority. [Global-contract documentation](https://docs.near.org/smart-contracts/global-contracts).

## 5. Maintenance evidence, not popularity

**Read in docs:** Public repository metadata/default-branch commits were inspected through GitHub's API on 2026-11-08; registry release dates are separately identified. API rate limiting prevented further exhaustive history checks. These dates do not prove deployed code matches source.

| Maintainer/source | Concrete evidence |
|---|---|
| [NearSocial SocialDB](https://github.com/NearSocial/social-db/commit/b4a023d234d0f24a2cf0d4b7998ea485f90f576e) | Default-branch release 0.12.0 commit, 2024-01-29; not archived |
| [NearSocial VM](https://github.com/NearSocial/VM/commit/6047c6a9b96f3de14e600c1d2b96c432bbb76dd4) | 2.6.1 merge, 2024-04-22; BOS deprecated in current docs |
| [Evgeny Kuzyakov's near-social-kv](https://github.com/evgenykuzyakov/near-social-kv/commit/a75a2b25fb518a2cd9c1566ba05e6e9970fe6bc3) | “Upgrade,” 2026-10-22 |
| [FastNEAR indexer](https://github.com/fastnear/fastdata-indexer/commit/187d80e84dc3db8411a1f69854b77d990ad6c721) / [KV server](https://github.com/fastnear/kv-fastdata-server/commit/c6595bd6d8a6737d5c077e475bb3e164180ee837) | Both default branches updated 2026-11-03 |
| [NEARBuilders SDK registry](https://registry.npmjs.org/near-social-js) | Maintainer `ejlbraem`; 2.0.4 published 2026-01-26. Published artifact differs from older `main` package metadata; pin actual artifact |
| [NEAR Rust SDK releases](https://github.com/near/near-sdk-rs/releases) | `near-contract-standards` 5.30.1 published 2026-11-05 |
| [Contract-tools registry](https://crates.io/api/v1/crates/near-sdk-contract-tools) | Jacob Lindahl named author; 4.0.0 published 2026-04-13; Apache-2.0 OR GPL-3.0. [Docs.rs](https://docs.rs/crate/near-sdk-contract-tools/4.0.0) reports a documentation build failure, not proof of contract failure |
| [Official NFT](https://github.com/near-examples/NFT/commit/9e0af2d088761637eac63921edbef67738a79e15) / [FT](https://github.com/near-examples/FT/commit/15360ac443fe91e9d55a3b3db616fe6eb6514942) | Sandbox-test/SDK maintenance, 2026-10-30 / 2026-10-28 |
| [near-daos Sputnik](https://github.com/near-daos/sputnik-dao-contract/commit/5434a59dec23ee0c49df8c8c4350c208a7e75b0b) | 2026-05-27 latest commit corrects comments; recent date alone is weak maintenance evidence |
| [NEAR DevHub Trezu](https://github.com/NEAR-DevHub/trezu/commit/a6aaaf6742099069634a25fb20c4287a2852dd62) | Wallet E2E maintenance, 2026-11-06; old [NEAR Treasury docs](https://docs.neartreasury.com/changelog) explicitly redirect to Trezu |
| [HoS/FastNEAR](https://github.com/houseofstake/house-of-stake-contracts/commit/32611da14aed42127421e777eec0e98094de6d2d) | Build 1.1.2 WebAssembly (Wasm, executable contract code), 2026-09-21 |
| [NEAR core contracts](https://github.com/near/core-contracts/commit/1b0436c96379c63aee7d2429c6d5d24019031ab8) | 2026-05-15 default-branch change is multisig2 README correction, not security review |

**Inferred:** FastData and new near.social share important authorship/infrastructure dependencies; two implementations are not necessarily two independent operators. GitHub reported no detected license for the new social/indexer repositories inspected; reusing their code needs explicit license verification. NEAR protocol openness does not automatically license application code.

**Read in docs:** Contract-tools source links pin published v4.0.0 commit `ee3041f446cc28151a77bd7e5dd77a158b1b0846`, also recorded in the published crate. This is the current source inspected; it is distinct from the older audited commit below.

## 6. Audit boundaries

**Read in docs — contract-tools:** [Kudelski report, version 1.2, 2023-05-05](https://raw.githubusercontent.com/near/near-sdk-contract-tools/ee3041f446cc28151a77bd7e5dd77a158b1b0846/documents/NEAR%20Contract%20Tools%20-%20Final%20-%2005.05.2023.pdf), assessment **2022-11-02–2022-12-16**, covers only commit **`e08bf2db15280a1519c05ad9b57cdffc4e9e9fb2`**. Pages 3–5 limit coverage to listed files/default use:

- `src/rbac.rs`, `macros/src/rbac.rs`;
- `src/approval/{mod,native_transaction_action,simple_multisig}.rs`, `macros/src/approval/{mod,simple_multisig}.rs`;
- `src/standard/nep297.rs`, `macros/src/standard/{event,nep297,mod}.rs`, `macros/src/rename.rs`;
- `src/{owner,pause,slot,migrate,utils}.rs`, `macros/src/{owner,pause,migrate}.rs`;
- `src/upgrade/{mod,raw,serialized}.rs`;
- `src/standard/{mod,nep141,nep148}.rs`, `macros/src/standard/{fungible_token,nep141,nep148}.rs`.

The README calls this a v1.0.0 audit. NFT/NEP-171 and escrow modules are **not listed**. **Inferred:** no audit coverage established for those modules, v4.0.0 changes or any composed Petals contract. “Audited library” would conceal that boundary.

**Read in docs — HoS:** [Halborn report, updated 2025-05-26](https://raw.githubusercontent.com/houseofstake/house-of-stake-contracts/main/audit.pdf), engagement **2025-04-03–2025-04-29**, assessed **`8643d31`**, remediation [PR #35](https://github.com/fastnear/house-of-stake-contracts/pull/35). Section 5 lists:

- `common/src/{events,types,account,global_state,venear,utils,lockup_update,lib}.rs`;
- `lockup-contract/src/{lib,owner,owner_callbacks,venear,internal,gas,getters,types,venear_ext}.rs`;
- `merkle-tree/src/lib.rs`;
- `venear-contract/src/{lockup,account,storage,governance,upgrade,lib,delegation,token,config,snapshot,global_state}.rs`;
- `voting-contract/src/{proposal,reviewer,votes,upgrade,governance,lib,metadata,config}.rs`.

Dependencies, economic attacks and new implementations after remediation are excluded. Fourteen findings: three low and eleven informational; some marked acknowledged, so “addressed” does not mean all fixed. **Inferred:** the report does not establish coverage of today's v1.1.2/FastTrack/partial-delegation changes or deployed Wasm.

**Read in docs — Sputnik:** [NEAR Treasury changelog, April 2025 entry](https://docs.neartreasury.com/changelog) claims a full Sputnik V2 audit without critical findings. An exact auditor/report/commit was not established in this pass. **Audit scope unverified.** This claim cannot certify every DAO instance, Trezu frontend/backend or current factory version.

**Audit unverified:** FastData indexer/API, new near.social, SocialDB/BOS, `near-social-js`, current FT/NFT examples and current `near-contract-standards`, core multisig templates and their integration. Standards compliance, dependency scanners, included tests and audits of NEAR consensus are not substitutes for application audit coverage.

## Remaining decisions and validation

**Inferred:** Q4 needs a retention promise and explicit treatment of overwrites, archive loss, index omissions and payer identity. Q5 needs an electorate/adjudicator, evidence rules, appeal path and refund/slash outcomes before selecting escrow. A map index also needs reconciliation with TGT-030's server-read boundary: do not import near.social's chain tailer, link-preview fetcher or image proxy into visitor mapping by assumption.

Later authorized validation could test wallet handling of intentionally failed FastData receipts, matching claim histories across independent readers, deployed DAO code/version mapping and complete challenge discovery without alerts. None was performed here. This was public-source research: no accounts, keys, transactions, deployments or product code were created.
