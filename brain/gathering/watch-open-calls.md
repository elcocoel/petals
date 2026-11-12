---
id: watch-open-calls
department: gathering
for: setting a watcher on Petals' feed of open calls, so the person hears when a call they'd care about opens or closes soon
recognise: watch, watcher, alert, alerts, notify, tell me when, subscribe, feed, rss, new rfp, new grants, keep an eye, closing soon
tools: list_calls
continues: open-calls
status: partial
---

# Watch open calls

A watcher tells the person when a call they'd care about opens, or one they follow is closing soon. Petals sends nothing itself: the person's own feed reader, or their own agent, watches Petals' feed of open calls (`open-calls` says what's in it and how to read it).

## With a feed reader

The feed is RSS at `https://petals.elementarycomplexity.com/api/v1/calls.rss`, or `/api/v1/calls.rss` on whichever Petals site the person uses. Its filters go in the address:

- `kind`: one of rfp, grants, bounty, hackathon, accelerator, fund, vote, other;
- `q`: words in a call's title, summary or who offers it;
- `closes_before`: a date-time.

For RFPs about NEAR: `https://petals.elementarycomplexity.com/api/v1/calls.rss?kind=rfp&q=near`. Give the person that address for their feed reader: it checks the feed on its own schedule, and needs no account.

## With their own agent

- **The same feed as JSON:** `list_calls` over MCP, `node ~/.petals/petal.mjs list-calls --kind rfp --q near` in a terminal, or `GET /api/v1/calls` with the same filters.
- **Only what's new:** a call's `id` stays the same from one read to the next. Keep the ids you've told the person about, and tell them only of the others. A call that leaves the feed is no longer open, as its source says.
- **Closing soon:** the feed comes closing soonest first; `closes_before` keeps the ones closing before a date.
- **How fresh:** each call carries `source.read_at`, when Petals last read its source. Say it when it matters.
- **How often:** as often as the person asks. If your app can run something on a schedule, run the same call then; Petals keeps no watchers of its own.
