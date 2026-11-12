---
id: open-calls
department: gathering
for: who is paying for work right now, so people can earn from DAOs and DAOs can find people: open RFPs, grants programs, bounties, hackathons and open votes, keyless
recognise: rfp, rfps, grants, grant program, grants program, bounty, bounties, hackathon, funding, open call, open calls, apply, get paid, earn, work for a dao, talent, contributors, hire, hiring
tools: read_page, search
continues: open-source-leads
status: partial
---

# Open calls

Who is paying for work right now: a DAO's request for proposals, a grants program taking applications, a bounty, a hackathon, or a vote still open. For a person, it's where to earn from DAOs; for a DAO, where it asks for people. Every source below answers without a key.

## Where they live

- **Karma's program registry:** grants programs, RFPs, bounties, hackathons, accelerators and funds across ecosystems, each with its status, dates, budget and communities. `read_page` on `https://gapapi.karmahq.xyz/v2/program-registry/search?status=active&limit=50`.
- **NEAR's Infrastructure Committee:** RFPs on the chain, each with its name, summary, labels, deadline and status: the view call `get_rfps` on `infrastructure-committee.near`. With a shell, post `{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"call_function","finality":"final","account_id":"infrastructure-committee.near","method_name":"get_rfps","args_base64":"e30="}}` to `https://rpc.mainnet.fastnear.com` and decode the result's bytes as JSON. A proposal there names the RFP it answers.
- **Snapshot:** a DAO's open votes, `state: "active"`, keyless, and readable as a page: `read_page` on `https://hub.snapshot.org/graphql?query={ proposals(first: 20, where: {space_in: ["<space>"], state: "active"}) { title end link } }`. An open vote is a call to that DAO's voters, not a call for work: say which it is.
- **The DAO's forum:** most run Discourse (NEAR's is gov.near.org). `<forum>/latest.rss` for the newest topics, `<forum>/categories.json` for its categories, and `<forum>/c/<slug>/<id>.rss` for one category's topics, such as its grants or funding category.

## Reading them right

- **A status is kept as said, beside its deadline.** A call can still say "accepting submissions" after its deadline has passed (NEAR's newest RFP did, on 12 Nov 2026): give both, and never correct one with the other.
- **A forum post isn't an RFP until it says so.** Telling a request for proposals from a discussion is your reading: say it's inferred, with the post as its evidence.
- **One call, many places.** The same call can show in Karma, the DAO's forum and its own site: it's one call, matched by its link.
- **The budget as said,** in the call's own words and currency, never a dollar figure the call didn't give.
- **Who offers it:** the DAO or the program by name, and its address on Petals' map when the chain ties the two.

Give the person each call with who offers it, its link, its deadline and its status as said, closing soonest first. For a DAO looking for people, `open-source-leads` says how to read who has done that kind of work.
