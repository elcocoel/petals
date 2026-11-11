---
id: who-gets-a-vote
for: distinguishing holdings, membership, delegation and the right to vote, join or leave
recognise: voting power, delegates, delegated, delegation, holders, membership, shares, loot, ERC20Votes, Moloch, veNEAR, House of Stake, join, leave, ragequit, lock, unlock
tools: list_networks, get_network, get_snapshot, describe_snapshot, read_chain
continues: from-proposal-to-action, who-can-move-money-or-change-rules, stake-behind-the-network, a-new-system
status: partial
---

# Who gets a vote

Holding something, carrying voting power and casting a ballot are three different things. Start with the system and version, then the proposal or date the person means.

1. **Find what grants the right.** It may be tokens, shares, locked assets, a role or an address list. Follow the voting contract to its actual source of power; do not assume every Governor uses ERC20Votes. Sputnik/AstroDAO policy can qualify different roles for different proposal kinds. Aragon's installed plugins decide its electorate.
2. **Separate the holder from the voter.** For ERC20Votes, holders delegate, including to themselves. Delegation need not mean a transfer of assets or that the delegate accepted an appointment. For Moloch v1, distinguish members from their delegate keys. For House of Stake, distinguish locked assets, veNEAR and delegated power. Use the proposal's snapshot when establishing eligibility; today's power does not answer an earlier vote.
3. **Read only what the reader supplies.** Check `get_network` for parameters and available snapshots; call `get_snapshot` with `network` and `params`. Inspect the returned date and block, then its data and coverage with `describe_snapshot`.
   - `erc20-holders` reads balances with coverage that may be partial; `erc20-votes` reads delegated power. Both take `token` and `chain`. Neither supplies ballots; the latter omits undelegated holders and each delegate's backer split.
   - `moloch-v1` and `moloch-v3` take `dao` and `chain`. V1 reads shares; v3 distinguishes shares from non-voting loot. Activity counts do not establish ballot choices.
   - `near-house-of-stake` reads accounts, delegations, roles and proposal tallies; it excludes individual ballots and each holder's lockup details.
4. **Explain joining and leaving separately.** Buying tokens, admission, delegation and locking grant different rights. Moloch v1 has no loot; v3 transfers are configurable. Check ragequit eligibility and eligible assets before describing redemption. Leaving a role or selling a token does not inherently redeem treasury assets. Read the applicable unlock conditions, not a remembered duration.

Snapshot discovery is not a ballot reader. `sputnik-dao` reads a Sputnik DAO's members (the accounts in its policy's roles and every one that voted) and the votes each cast; there is no Aragon reader, and `read_chain` is EVM-only. A map's proposals on the site (`GET /api/v1/maps/:id/proposals`, proposals/v1) are ballots: each account's vote on each proposal, for a Sputnik DAO mapped with `sputnik-dao` and for a Baal behind a map of its shares token. Sputnik keeps its own word in `as_said` (Approve, Reject, Remove: keep Reject and Remove apart), no time for a vote, and `closes_at` estimated from its policy read now; a Baal gives each vote's and each decision's time. Missing eligibility or exit data stays unknown. Say verified only for a chain reading with its block; distinguish inferences and documentary leads. Keep holdings, power, ballots and authority separate.
