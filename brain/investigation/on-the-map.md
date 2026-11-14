---
id: on-the-map
department: investigation
for: going to what's already on the Power Map and interpreting it, before any new reading
recognise: navigate, take me, go to, open, show me, what's there, already, on the map, what do we have, what we found
tools: look_up, get_map, find_voting_blocs, list_payouts, describe_snapshot, compute_figures, list_publishable
continues: going-deeper, where-power-lives, payouts, voting-blocs-over-time
status: ready
---

# What's already on the map

The Power Map already holds most of what people ask about. Start from it: never count from scratch what a map already holds.

1. **Go there.** `look_up` with the person's words gives each map that matches, with its `map_url`. When they ask to go somewhere, the answer is that link, with the map's name, and a line on what's there. Nothing comes before it.
2. **Say what's there.** `get_map` with the map's `id` gives its layers, each with its date and who mapped it:
   - its readings: who holds what, as of when;
   - its proposals, and the period they cover;
   - its value: price, supply, market cap, treasury, each with its source;
   - its payouts in short;
   - Insights: what Petals' mapping found about its accounts, each with how it's known;
   - the person's own names for its accounts, which are theirs alone and not on the shared map.
3. **Interpret, don't recount.** Say what the layers show together, in a few sentences. For more, the same `id` goes to `find_voting_blocs` (who votes alike) and `list_payouts` (who was paid, over a period), and a reading's `snapshot` to `describe_snapshot` and `compute_figures`.
4. **Read anew only when asked,** or when nothing on the map answers. Then say what a read would take, and ask.

Publishing: what a person kept about a map (their names and other claims about its accounts) goes to the shared map with one press on that map, signed by their own wallet and credited to them. `list_publishable` says what would go, and what stays private and why: a name goes as a claim when a public source ties it to the account in its own words (the system's own records, a page or a post, quoted); a name worked out from traces stays private. The press and the signature are always theirs.
