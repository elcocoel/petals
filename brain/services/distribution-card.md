---
id: distribution-card
department: services
for: a shareable picture and evidence of one network's distribution
recognise: distribution card, shareable card, distribution, concentration card
tools: brain_context, search_petals, read_page, describe_snapshot, compute_figures
continues: where-power-lives, governance-health-report
status: partial
---

# Distribution card

A free service for Petals' agent or the person's own agent. Give one network's distribution a compact, shareable explanation.

**Reads:** `brain_context` for power; `search_petals` for the network; `read_page` on `GET /api/v1/maps/:id` at the serving site, using the URL-encoded returned id. Use the map's existing view and reading references.

1. **Name the distribution.** Choose the requested measure: holdings, delegated power or another recorded measure. Use `describe_snapshot` to establish units, date, population and coverage. Wallet counts are account counts, not people counts.
2. **Count it.** Run `compute_figures` on that reading and measure. Retain total, top-1/top-5 shares, Nakamoto count and threshold, figure ids and unread share. Do not describe a bounded holder sample as the whole supply.
3. **Use the matching picture.** Fetch the existing view's SVG with `read_page` at `GET /api/v1/map/:sha/svg`, using its spec hash and the same view selection. Check that its measure and date match the figures. Do not substitute a different flower for a missing view.
4. **Assemble the card.** Include name, measure, date, flower, two supported insights, figures and a source/coverage footer. Say “five accounts hold X of the measured total” rather than attributing ownership or decision authority the data does not establish.

**Missing data:** Without a matching existing view or accessible reading, supply the sourced text card and name the missing picture or measure.

**The person gets:** Card content with the existing SVG and map link, ready to share; preparation does not post it anywhere.
