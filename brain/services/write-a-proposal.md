---
id: write-a-proposal
department: services
for: matching an evidenced DAO need to what this person can deliver and drafting that proposal
recognise: write a proposal, work for a DAO, proposal draft, match expertise, hiring needs
tools: brain_context, search_petals, list_calls, search, read_page
continues: open-calls, open-source-leads, from-proposal-to-action
status: partial
---

# Write a proposal

A free service for Petals' agent or the person's own agent. Find work the DAO needs and this person can provide, then draft that specific proposal. Free drafting does not mean the person's proposed work must be unpaid.

**Reads:** `brain_context` for open calls and proposal rules; `search_petals` for the DAO, proposals and the signed-in person's accessible work context; `list_calls` for its open-calls feed. `search` locates public forum, RFP and grant sources; `read_page` reads those sources and `/api/v1/maps/:id/proposals` at the serving site.

1. **Find a current need.** Check the DAO's forum, RFPs/grants, open calls and proposals. Retain source links, dates, scope, budget, requirements and status as said beside the deadline. Look for explicitly unfilled roles, reopened calls or documented delivery gaps; a repeated discussion alone does not prove failed hiring. An open vote is not a job. Recheck the primary source before treating a need as available.
2. **Find this person's evidence.** Read their declared NEAR Social account through `read_page` on `https://api2.near.social/v1/accounts/{id}`. Read their Petals profile from the session context the agent already has; use `search_petals` for the signed-in person's accessible work context. Keep private profile data private. Use relevant work history already supplied by their connected personal agent; there is no implied access to that agent's memory. Profile bios are self-description; linked completed work is evidence to inspect, not automatic proof of competence.
3. **Make one supported match.** Connect one current need to demonstrated relevant work and a feasible deliverable. Separate evidence from inferred fit. If a necessary input is missing, ask one focused question; without evidence of both need and capability, return the gap instead of generic proposal prose.
4. **Draft to the DAO's requirements.** Include the sourced problem, why this person fits, a bounded deliverable, milestones, acceptance criteria, duration, budget/currency, dependencies and reporting. Use known constraints; leave unconfirmed prices, dates, capacity and recipient accounts explicitly unconfirmed. Do not invent a hiring failure, credential or commitment.

**Missing data:** Petals has no general personal-agent memory reader; inaccessible profiles, portfolios, capacity or current award status must come from existing authorised context or remain unknown.

**The person gets:** One needs-and-fit explanation and an unsent proposal draft with citations and unresolved commitments clearly marked, ready for their review.
