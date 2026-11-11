---
id: voting-blocs-over-time
department: governance
for: comparing actual ballots to find groups that keep voting alike over a stated period
recognise: voting blocs, voting blocks, who votes together, co-voting, agreement, voted together, voting patterns, stable groups, coordination
tools: find_voting_blocs, list_networks, get_network, read_chain, read_page, add_annotation
continues: who-gets-a-vote, from-proposal-to-action, over-time
status: partial
---

# Voting blocs over time

Agreement describes ballots, not motives or common control. Keep the comparison reproducible.

1. **Use the method Petals runs.** `find_voting_blocs` (and `GET /api/v1/maps/:id/blocs`, with pairs only on `?pairs=true`) applies `blocs/agreement@2` to one map's proposals and ballots. Its rules can be set, and every answer names the values used:
   - `min_shared` (default 5): the proposals a pair must both have voted on.
   - `min_agreement` (default 0.8): the share of those on which their choices matched.
   - `min_kappa` (default 0.5): agreement beyond what chance alone would give, defined in step 3.
   - The period: if none is asked for, the 90 days up to the close of the map's newest proposal. Name the period in UTC in every answer.
2. **One effective ballot per wallet and proposal.** Read choices, not totals or delegated power, and use the recorded voter, not the transaction sender. [OpenZeppelin counting modules](https://docs.openzeppelin.com/contracts/5.x/api/governance) differ, and [Snapshot's voting FAQ](https://github.com/snapshot-labs/snapshot-docs/blob/master/faq/im-a-snapshot-user/voting.md) lets people change a vote, so recasts and overrides follow that system's own rules. A null vote (a ballot of choices that aren't for, against or abstain: weighted, quadratic, ranked) isn't counted. Abstentions, missing data and unsupported choices are kept apart; none of them means no.
3. **Agreement, corrected for chance.** For each pair, agreement is matched choices divided by shared proposals. Count each proposal once, unweighted by token power. kappa = (agreement − chance) / (1 − chance), where chance is, for each shared proposal, the sum of its choices' shares squared, averaged over the shared proposals. kappa keeps popular or near-unanimous votes from looking like a bloc. A pair qualifies only when it meets all three rules. Too few shared votes means not enough evidence, not disagreement.
4. **A group needs every pair.** A agreeing with B, and B with C, doesn't show A agreeing with C. The tool's blocs are accounts linked by qualifying pairs; ask with `pairs: true` (and a period, for a DAO with many voters) to see which pairs qualify before calling all of them one group. To call a group stable, run the same membership over at least two separate periods and say what each one shows. One period only shows agreement in that period. Short windows can have too few shared votes, and long ones can hide alignments that changed.
5. **Say it with its evidence, and keep it private.** When the data supports it, say "These wallets voted together on 14 of 16 shared proposals, 1 Jan to 30 Jun 2026 (min_shared 5, min_agreement 0.8, min_kappa 0.5)". Never call it proof of coordination or shared ownership. Petals keeps no bloc as its own mapping's claim. If the person wants it kept, save it in their own project as an `inferred` annotation (following `add_annotation`'s schema), with the method's name and version, its values, and the ballot evidence (`proposal`, `tx` or `snapshot`), and say who found it and when.

Check coverage first: blocs need a map with real ballots. Sputnik DAO and Moloch v3 (Baal) proposals carry them; `erc20-votes` supplies power and `near-house-of-stake` only tallies. A Snapshot outcome isn't an execution. Sputnik keeps the original vote words, but its normalised vote merges Reject and Remove; keep that distinction. Missing coverage means no conclusion.
