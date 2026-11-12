---
id: proposal-brief
department: services
for: explaining one proposal's ballots, voting alignments and requested money movements
recognise: proposal brief, proposal money, vote breakdown
tools: brain_context, search_petals, read_page, find_voting_blocs
continues: from-proposal-to-action, voting-blocs-over-time, value
status: partial
---

# Proposal brief

A free service for Petals' agent or the person's own agent. Explain what one proposal changes, who voted which way and what money is involved.

**Reads:** `brain_context` for proposals; `search_petals` to locate the DAO/proposal; `read_page` on the serving site's `GET /api/v1/maps/:id/proposals` (`proposals/v2`, with older v1 possible), the map card and the proposal's accessible primary source. URL-encode the map id.

1. **Identify the decision.** Record id, title, proposer, requested action, source, dates and last evidenced stage. Preserve estimated closing dates as estimates. A passed vote does not prove execution.
2. **Show ballots.** Group the recorded accounts by choice, retaining `as_said`, options, choice weights and voting power where supplied. Keep Reject and Remove distinct; a null normalised vote may contain a real non-binary ballot. Missing ballots are unknown, not opposition or abstention.
3. **Put blocs in context.** Run `find_voting_blocs` over the stated surrounding period with `pairs: true`. Show how those accounts voted on this proposal. One shared vote alone does not establish a bloc, and a connected component does not prove every pair agrees.
4. **Trace the money.** Read the requested amount, asset, recipient and conditions from the primary proposal. If recorded, read `/api/v1/maps/:id/payouts` for execution evidence. Keep requested, approved and paid amounts separate. Use the map's stored value only when asset and dates match, naming its price source and time.

**Missing data:** `proposals/v2` does not guarantee full proposal text, transfer amounts, historical rules or execution evidence; mark unavailable fields unknown.

**The person gets:** A brief containing the decision, ballot breakdown, supported bloc context and money movements, each linked to its evidence.
