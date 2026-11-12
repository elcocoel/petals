---
id: delegate-scorecard
department: services
for: describing a delegate's recorded power, participation and voting pattern
recognise: delegate scorecard, delegate participation, delegate record
tools: brain_context, search_petals, read_page, describe_snapshot, compute_figures, find_voting_blocs
continues: who-gets-a-vote, voting-blocs-over-time
status: partial
---

# Delegate scorecard

A free service for Petals' agent or the person's own agent. Show a delegate's evidenced record without inventing a quality score.

**Reads:** `brain_context` for delegation; `search_petals` for the DAO and account; `read_page` on its map card and `/api/v1/maps/:id/proposals`, with the returned map id URL-encoded. Inspect the delegated-power reading with `describe_snapshot`.

1. **Pin the account and period.** Use chain and address. Attribute a name only to the source that declares it. Keep today's power date separate from the ballot window.
2. **Show power.** Use `compute_figures` on the delegated-power measure for the account's returned share and rank. If the account is outside the returned rows, say so. Report incoming delegators only where the reading actually contains their links; delegated power is not owned wealth.
3. **Show attendance.** From the `/api/v1/maps/:id/proposals` response returned by `read_page`, count proposals with the account's effective ballot and covered closed proposals in the window. Give n/N as coverage-based participation. Call it eligible-proposal attendance only if eligibility and delegate tenure are evidenced for each proposal. Retain choices, abstentions and unsupported ballots separately.
4. **Show the record.** Link the ballots and any accessible public voting explanations through `read_page`. Use `find_voting_blocs` with the same period and `pairs: true` for supported agreement, retaining its method and thresholds. Do not grade loyalty, independence or competence from agreement.

**Missing data:** Historical delegation, eligibility, tenure and public rationales may be absent; an absent rationale is not proof none was given.

**The person gets:** One scorecard of dated voting power, n/N participation, vote choices, evidenced alignments and source links, with coverage limits beside the figures.
