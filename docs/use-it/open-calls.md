---

title: The open-calls feed
order: 40
---

Who is paying for work right now: a DAO’s request for proposals, a grants program taking applications, a bounty, a hackathon, or a vote still open. For a person, it’s where to earn from DAOs; for a DAO, where it asks for people.

Petals keeps them in one feed, closing soonest first:

- [As JSON](/api/v1/calls): `/api/v1/calls`
- [As RSS](/api/v1/calls.rss), for a feed reader: `/api/v1/calls.rss`

Both need no account.

## Where the calls come from

Every source answers without a key:

- **Karma’s program registry:** grants programs, RFPs, bounties, hackathons, accelerators and funds across ecosystems.
- **NEAR’s Infrastructure Committee:** its RFPs, read from the chain (`infrastructure-committee.near`).
- **Snapshot:** the open votes of the DAOs on the Power Map that vote there. An open vote is a call to that DAO’s voters, not a call for work.
- **DAO forums:** posts on NEAR’s forum (gov.near.org) and Arbitrum’s whose titles say RFP, request for proposals or grants program. Telling a request for proposals from a discussion is a reading, so these are marked inferred, with the post as their evidence.

## Reading a call

- **Its status is kept as said, beside its deadline.** A call can still say “accepting submissions” after its deadline has passed: the feed gives both, and never corrects one with the other.
- **Its budget is as said,** in the call’s own words and currency.
- **Who offers it:** the DAO or the program by name, and its address on the Power Map when the chain ties the two.
- **How fresh:** each call carries when Petals last read its source.

The fields are in [calls/v1](/docs/data-protocol/schemas/calls-v1).

## Watch it

Petals sends nothing itself. Your feed reader, or your own agent, watches the feed.

**With a feed reader:** give it the RSS address. Its filters go in the address:

- `kind`: one of rfp, grants, bounty, hackathon, accelerator, fund, vote, other;
- `q`: words in a call’s title, summary or who offers it;
- `closes_before`: a date-time.

For RFPs about NEAR: `https://petals.elementarycomplexity.com/api/v1/calls.rss?kind=rfp&q=near`. The reader checks the feed on its own schedule.

**With your own agent:** ask it to watch open calls for you. It reads the same feed as JSON, keeps the calls it has told you about, and tells you only of new ones, or of those closing soon. The brain’s [watch-open-calls](/docs/brain/watch-open-calls) chapter is how it does it, and [open-calls](/docs/brain/open-calls) is how it reads a call.
