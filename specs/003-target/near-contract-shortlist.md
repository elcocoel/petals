# NEAR reuse shortlist and Sputnik field notes

**8 November 2026 — research, not a deployment recommendation.** Basic testing comes before the upgradable mapping protocol. This note preserves useful contract knowledge for that later work. **Read in docs/source** means inspected public documentation or code; **Inferred** is our assessment. No contracts were executed, deployed or audited by this pass.

## What “battle tested” can honestly mean

**Inferred:** keep three separate records: production use, audit coverage of an exact version, and the code actually deployed at a particular address. Age, stars and “audited” marketing establish none of those together. The shortlist below prioritizes established contract families; it does not certify their latest code or arbitrary compositions.

| Candidate | Functions worth knowing | Evidence and reuse boundary |
|---|---|---|
| **Sputnik DAO** — organization rules and treasury approvals | Roles/permissions; weighted voting; proposals; transfers; authorized contract calls; membership/policy changes; controlled upgrades | **Read:** used by the maintained Trezu/reference-UI lineage. Prior Treasury docs describe operational cross-chain payments and an April 2025 audit. Exact audit report/commit remains unverified. Best first governance family to understand deeply. |
| **NEAR Rust token/storage standards** | `ft_transfer`, `ft_transfer_call`; `storage_deposit`; NFT ownership, approvals and transfer | **Read:** maintained official implementations; Sputnik's inspected manifest directly uses `near-contract-standards` 5.24. Strong reusable interfaces. This does not establish an audit of the latest library or a contract assembled from it. |
| **Core lockup and staking-pool families** | Scheduled unlocking, vesting, termination where configured; stake/unstake/withdraw | **Read:** longstanding core contracts and documented treasury use. Useful when a real lockup/staking requirement exists. Their time/vesting rules are different from a general payment escrow. Exact deployed version/audit must be mapped before reuse. |
| **near-sdk-contract-tools** | Ownership, permissions, pause, multisignature approval, upgrade helpers | **Read:** an exact older Kudelski audit exists; current v4.0.0 is broader. The inspected audit does not cover NFT or escrow modules. Useful reviewed building blocks only within the established coverage, not a finished custody product. |
| **House of Stake** | Locked-token voting power, delegation and proposal execution | **Read:** deployed governance family with a published Halborn audit of a specific 2025 commit; later source changes are not automatically covered. Strong mapping specimen; substantial governance machinery to adopt wholesale. |

Sources: [Sputnik/Trezu reference UI](https://github.com/near-daos/sputnik-dao-ui), [Treasury history](https://docs.neartreasury.com/changelog), [Sputnik dependencies](https://github.com/near-daos/sputnik-dao-contract/blob/5434a59dec23ee0c49df8c8c4350c208a7e75b0b/sputnikdao2/Cargo.toml), [NEAR standard implementations](https://github.com/near/near-sdk-rs/tree/master/near-contract-standards/src), [core contracts](https://github.com/near/core-contracts), [lockup behavior](https://github.com/near/core-contracts/blob/master/lockup/README.md). The exact contract-tools and House of Stake audit scope is retained in [the framework report](near-frameworks.md#6-audit-boundaries).

**Inferred lean:** Sputnik first for institutional behavior; standard token/storage interfaces for interoperability; other components only against an actual requirement. No generic, current, audited financial escrow was established. Do not deploy a token, jury or treasury merely because a template exists.

## Sputnik: the useful model

**Read in source:** a factory creates separate DAO accounts. Each DAO has its own policy, proposals, funds and upgrade settings. A frontend such as Trezu is one way of operating those accounts. It is not the authority that defines their rules. The reviewed source is pinned to **`5434a59dec23ee0c49df8c8c4350c208a7e75b0b`**; its DAO package is **2.3.1**. The reference UI documents multiple deployed versions, so this source must not be projected onto every DAO.

| Read surface | What it provides | Mapping implication |
|---|---|---|
| Factory `get_number_daos`, `get_daos` | Accounts created through that factory | Useful discovery, not a census of every Sputnik fork/factory. |
| `version`, `get_config`, `get_policy` | Claimed version, metadata, roles and rules | Record code hash and observation block too; a version string alone is insufficient. |
| `get_last_proposal_id`, `get_proposals`, `get_proposal` | Proposal ID range, contents, votes and status | Preserve raw IDs; missing proposals are possible. |
| `get_staking_contract`, delegation balance/supply views | Governance-token stake/delegation model | Distinguish token-weighted authority from group membership. |
| Factory information/code metadata and DAO upgrade settings | Where replacement code comes from and who can trigger it | Upgrade authority is part of the power map. |
| `get_available_amount`, locked storage/bonds | Spendable native balance after reserved amounts | Account balance alone is not the spendable treasury. Other tokens/Intents balances require their own reads. |

Sources: [DAO views](https://github.com/near-daos/sputnik-dao-contract/blob/5434a59dec23ee0c49df8c8c4350c208a7e75b0b/sputnikdao2/src/views.rs), [factory views](https://github.com/near-daos/sputnik-dao-contract/blob/5434a59dec23ee0c49df8c8c4350c208a7e75b0b/sputnikdao-factory2/src/lib.rs), [reference UI's version notes](https://github.com/near-daos/sputnik-dao-ui/blob/main/AGENTS.md).

## Details a generic DAO map would miss

1. **Permissions depend on the action. Read in source:** a role can approve transfers but only reject another proposal type. Permissions combine proposal kind with action, with wildcards. Group roles list accounts; token-member roles have a balance requirement. The `Everyone` role actually matches everyone even though its source comment suggests otherwise. **Inferred:** map effective permissions from executable rules, not the label “council.”
2. **One total voting-power number loses information. Read in source:** votes are counted per eligible role. A voter in several eligible roles can affect each role's count; they still cannot vote twice under the same account. Satisfying one qualifying role's threshold can determine the result—this is not automatically a requirement for every role to approve.
3. **Threshold arithmetic matters. Read in source:** a ratio uses `floor(numerator × total / denominator) + 1`, capped at total; quorum is then applied as a minimum. A half threshold on four group members needs three votes, not two. Group size or delegated supply and current policy can change; old decisions need historical context. [Policy](https://github.com/near-daos/sputnik-dao-contract/blob/5434a59dec23ee0c49df8c8c4350c208a7e75b0b/sputnikdao2/src/policy.rs).
4. **Voting can initiate execution. Read in source:** approval can trigger a transfer or contract call, and asynchronous execution can later fail. `Failed`, `Rejected`, `Expired` and `Removed` mean different things. Proposal bonds must match policy exactly. **Inferred:** distinguish permission, decision and actual downstream result. [Proposals](https://github.com/near-daos/sputnik-dao-contract/blob/5434a59dec23ee0c49df8c8c4350c208a7e75b0b/sputnikdao2/src/proposals.rs).
5. **A short page is not the end of history. Read in source:** pagination scans an ID range and skips missing entries. `get_last_proposal_id` is the next-ID boundary. Removing proposals creates gaps; memos are logged rather than stored in proposal state. **Inferred:** page by ID ranges and record omissions; do not stop when a page returns fewer rows than requested. [Views](https://github.com/near-daos/sputnik-dao-contract/blob/5434a59dec23ee0c49df8c8c4350c208a7e75b0b/sputnikdao2/src/views.rs).
6. **The action log is not an archive. Read in source:** the inspected DAO and per-proposal recent-action queues retain only **20 entries**. **Inferred:** preserve historical receipts separately when collected; mark gaps instead of manufacturing a complete timeline. [Action log](https://github.com/near-daos/sputnik-dao-contract/blob/5434a59dec23ee0c49df8c8c4350c208a7e75b0b/sputnikdao2/src/action_log.rs).
7. **The factory can be an authority, not just an installer. Read in source:** reviewed code allows factory updates when `auto_update` is enabled, with a matching-proposal/two-week gate for readable current state. Its missing-factory-info fallback enables auto-update; the documented repair path for missing state differs. Older instances may implement other rules. **Inferred:** inspect actual code and settings, factory owner and upgrade history before describing a DAO as controlled solely by its council. [Upgrade implementation](https://github.com/near-daos/sputnik-dao-contract/blob/5434a59dec23ee0c49df8c8c4350c208a7e75b0b/sputnikdao2/src/upgrade.rs).

## Carry forward after basic usability

**Inferred:** when designing the upgradable mapping protocol, retain source network/account, block/hash, exact method and arguments, raw response/receipt reference, contract code hash, adapter version and any missing-history marker. Keep the interpretation version separate from the fetched evidence so a better mapper can reuse earlier collection. These are requirements to consider later, not an implementation or an attempt to define truth.

Next Sputnik evidence to obtain: exact audit/remediation artifacts, deployed-code fingerprints for chosen specimens, factory-admin/key permissions, historical policy reconstruction, delegated-vote behavior across changes, and execution failures/refunds. Current open issue reports are leads to investigate, not established vulnerabilities. No incident-free history or comprehensive deployed audit is claimed by this shortlist.
