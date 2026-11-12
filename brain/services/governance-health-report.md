---
id: governance-health-report
department: services
for: a sourced account of concentration, participation, delegation and voting agreement in one DAO
recognise: governance health report, health check, concentration, how few decide, turnout
tools: brain_context, search_petals, read_page, describe_snapshot, compute_figures, find_voting_blocs
continues: where-power-lives, who-gets-a-vote, voting-blocs-over-time, authority-map
status: partial
---

# Governance health report

A free service for Petals' agent or the person's own agent. Explain how decisions are distributed, with evidence rather than a single health grade.

**Reads:** `brain_context` for governance; `search_petals` for the DAO; `read_page` on the serving site's `GET /api/v1/maps/:id` and `/api/v1/maps/:id/proposals`. Use the returned map id, URL-encoded, and its reading references. Inspect each relevant reading with `describe_snapshot`.

1. **Fix the scope.** Name the DAO, chain, contracts, reading dates and proposal window. Start with the latest week unless the person specifies a period. State incomplete coverage.
2. **Show concentration.** Run `compute_figures` separately for holdings and delegated voting power where present. Quote top-1/top-5 shares and the Nakamoto count with its threshold and figure ids. That count describes the included distribution; it establishes how few can pass a decision only if proposal-era quorum and approval rules support it.
3. **Show participation and delegation.** Count recorded ballots per proposal from the `/api/v1/maps/:id/proposals` response returned by `read_page`, preserving the input and calculation. Report voter turnout only with the eligible electorate at that proposal; power turnout needs eligible and cast power in compatible units. Show recorded delegation links and concentrated delegates separately from ownership. Never substitute today's power for past ballots.
4. **Show agreement.** Run `find_voting_blocs` for the stated window with `pairs: true`; retain method, thresholds and shared-vote counts. Too few shared ballots is insufficient evidence. Agreement does not establish common control.

**Missing data:** Historical eligibility, complete ballots or delegation links may be absent; mark the affected measure unknown, never zero.

**The person gets:** A short report with the concentration figures, turnout, delegation, bloc evidence, source links and bounds; each conclusion marked verified, inferred or a lead as the doctrine requires.
