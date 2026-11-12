---
id: payouts
department: money
for: what a treasury paid out over a period, to whom, and what it was worth on the day it was paid
recognise: payouts, paid out, spending, spent, paid, recipients, grants paid, outflows, how much they spend
tools: list_payouts, get_snapshot, read_chain, read_page, add_layer
continues: value, from-proposal-to-action, who-can-move-money-or-change-rules
status: partial
---

# Payouts

What a treasury paid out over a period: money that left the DAO's own accounts for someone else. Say what was paid; don't judge whether it was spent well.

1. **Name the treasury.** Payouts are measured from named accounts. A Sputnik DAO holds its own money, so its account is its treasury. Moves between the DAO's own accounts, swaps, staking and bridging aren't payouts.
2. **Paid, not approved.** Sputnik runs a proposal on the vote that approves it, so Approved means paid and Failed means it didn't run. A `Transfer` names its token, receiver and amount; a `FunctionCall` pays through its `ft_transfer` actions, and the token is the call's receiver; a `BountyDone` pays its bounty's amount. A proposal's bond coming back to its proposer is a transfer but not a payout. In a Governor or a Safe, the executed proposal or transaction is the evidence; a vote that passed but never executed paid nothing.
3. **Date it by the transfer.** A payout's date is the block of the DAO's own transfer, in the transaction that approved it, not the day it was proposed. A payout whose transfer wasn't found has no date: a period leaves it out and says how many it left out.
4. **Price it on the day it was paid.** Each payout's dollars use that day's price (DefiLlama's past prices, named as DefiLlama's), never today's. A payout with no price is unpriced, not worth zero, and a total says how many it leaves out.
5. **Keep the kinds apart.** A payout is one transfer. A stream (Sablier, Superfluid) has a committed total and a withdrawn part; a vesting grant is the `vesting` chapter's; a grant paid through a program is paid by the program's own accounts. Petals reads payouts only, so far.
6. **Answer for the period asked.** Give how many payouts, to how many recipients, each asset's sum, the dollars of the priced ones and the date of the last payout. A treasury with nothing paid in a year says so plainly.

`list_payouts` (a map, and `since` and `until` as ISO times: since inclusive, until exclusive, by when each was paid) answers a map's payouts with their totals, and `GET /api/v1/maps/:id/payouts?since=&until=` answers the same. Each payout has its from, to, asset and amount, when it was paid, the proposal that paid it and its kind, its dollars that day and the transaction that paid it. So far Petals reads payouts for NEAR's Sputnik DAOs: their proposals from the chain at one block, when each was paid from FastNEAR's keyless transactions API, and dollars from DefiLlama. For an EVM DAO, nothing is read yet. Safe's Transaction Service lists a Safe's transfers out, and a Governor's executed proposals hold their targets, values and calls; read what you can with `read_chain` and `read_page`, and keep it with `add_layer` and its sources. Call a payout verified only with its transaction; label a total inferred when it rests on a price; unknown stays unknown.
