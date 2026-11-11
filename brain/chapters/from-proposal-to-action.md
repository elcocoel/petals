---
id: from-proposal-to-action
for: following a proposal from eligibility through voting to execution
recognise: proposal, Governor, quorum, threshold, voting rules, voting period, passed, executed, veto, Snapshot, Sputnik, AstroDAO, Aragon, Moloch
tools: list_networks, get_network, get_snapshot, describe_snapshot, read_chain, add_layer
continues: who-gets-a-vote, who-can-move-money-or-change-rules, over-time
status: partial
---

# From proposal to action

A successful vote is one step. Follow what must happen before an action can take effect.

1. **Find the proposal and its path.** Record the system, version, proposal identifier, requested actions and dates. Identify who could propose, sponsor or screen it. Read its governing documents as stated rules; check which rules the contracts enforce.
2. **Read the voting rules for that proposal.** Identify eligible voters, the voting-power snapshot, threshold to propose, quorum, support calculation and voting period. Check how abstentions count. Governor modules, Sputnik policies and Aragon plugins can differ; a framework name is not a rule. In House of Stake, establish the proposal path and applicable screening and review.
3. **Separate power from participation.** Keep eligible voting power, ballots and the declared result distinct. A current delegate balance cannot explain a historical vote by itself. Classic Snapshot uses configured voting and validation strategies; Snapshot X has separate execution strategies. Identify which is in use.
4. **Follow passage to action.** Check grace periods, queues, delays, cancellation, veto and required processing or review. Moloch v1 and v3 have different paths. Identify the executor and verify whether the requested action actually happened. Someone calling execution may merely release an already-approved action; this does not give them power to choose its contents.
5. **Say what is established.** Report the last evidenced stage and unresolved steps. A chain result needs its block; documents state a process but do not prove its completion.

Use `list_networks` and `get_network` before `get_snapshot`; inspect coverage with `describe_snapshot`. `erc20-votes` supplies delegated power, not ballots. `moloch-v3` supplies `votes_cast` activity counts, not vote direction or outcome. `near-house-of-stake` supplies proposal tallies, not individual ballots. Snapshot discovery is not a ballot reader. No dedicated Governor, Safe, Sputnik or Aragon reader is registered.

For EVM contracts, `read_chain` can inspect calls and bounded logs. Its calls have no historical-block argument: today's settings do not establish proposal-era rules. It is not a generic NEAR reader. Keep independently gathered data with `add_layer` and its provenance. Call a chain reading verified only with its block; label deductions inferred, other directions leads, and missing evidence unknown.
