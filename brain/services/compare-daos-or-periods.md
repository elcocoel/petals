---
id: compare-daos-or-periods
department: services
for: comparing two DAO distributions or two recorded periods of one DAO on compatible measures
recognise: compare DAOs, two DAOs, DAO over time, before and after, comparison
tools: brain_context, search_petals, read_page, describe_snapshot, compute_figures, find_voting_blocs
continues: over-time, governance-health-report, value
status: partial
---

# Compare DAOs or periods

A free service for Petals' agent or the person's own agent. Answer the requested comparison using the same definitions on both sides.

**Reads:** `brain_context` for history and governance; `search_petals` for the map or maps; `read_page` on their map cards and `/api/v1/maps/:id/proposals`, using URL-encoded ids and existing reading references. Inspect each reading with `describe_snapshot`.

1. **Fix both sides.** Name the DAOs or dates, contracts, populations and observation windows. Use actual stored reading dates. Do not present two current reads as historical change.
2. **Match the measures.** Compare holdings with holdings or delegated power with delegated power, and explain differences in eligibility and governance rules. Match coverage and thresholds. When population bounds differ materially, label the row not comparable.
3. **Use the same calculation.** Run `compute_figures` with identical settings for concentration and Nakamoto count. For participation, count recorded ballots and covered proposals from the `/api/v1/maps/:id/proposals` responses returned by `read_page`, preserving inputs; eligible turnout additionally needs the electorate at each vote. Compare `find_voting_blocs` only with the same method, thresholds and comparable windows.
4. **Explain the difference.** Report side-by-side values with figure ids and dates; use percentage points for changes in shares. Compare stored treasury values only with their asset scope, pricing dates and methods stated. A price change is not proof assets changed; an account appearing later is not necessarily a new member if coverage changed.

**Missing data:** Without two compatible readings or proposal windows, the requested comparison remains unavailable; do not reconstruct history from today's settings.

**The person gets:** A compact comparison with supported differences, their evidence and the specific rows that cannot be compared; no overall winner inferred from unlike systems.
