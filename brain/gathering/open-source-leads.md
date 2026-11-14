---
id: open-source-leads
department: gathering
for: public traces that might say what an address did, as directions only
recognise: osint, forum, twitter, x, ens, who wrote, discussion, social, who is, names, people
tools: read_page, search, add_annotation
continues: going-deeper
status: partial
---

# Open-source leads

Public traces can point to what an address did: a proposal's discussion on a forum, an ENS name, a post on X.

- **The system's own records first.** A DAO's proposals name people, and what a proposal pays or elects names their address. A Moloch v3 (Baal) DAO's `SubmitProposal` events carry each proposal's details, its title and text: read them with `read_chain`'s logs on the DAO's contract (its shares token's `baal()` or the DAO found by `find_target`), then match each name to the address its proposal pays or elects. A name tied that way is declared by the DAO: write "the DAO's proposal pays Dekan at 0xced6…", with the proposal, as a lead, never verified.
- **A public page or post that ties a name to an address in its own words** (an official page, a forum or governance post, a post on X) is a source: keep its link, its platform, when you read it (`retrieved_at`), an archived copy where there is one, and the words that tie them, quoted.
- **Every other match you work out is a lead:** a direction of research, never a fact. Write "this handle posted this proposal's discussion", with the link.
- **Look where the chain points:** a proposal's text often links its discussion; read that page (`read_page`) before searching widely (`search`).
- **Keep names and leads in the person's project, privately,** as annotations (`add_annotation`), saved as you find them. A name the system's own records give, or a public page or post states, is `sourced`, with that record, page or post as evidence and its own words quoted. One you worked out from outside traces (patterns, timing, style, scraps put together) is `inferred`, with its method, and each page as evidence, with its platform and an archived copy. A sourced name publishes with the person's press, as a claim with its evidence; an inferred one stays in their private annotations.
- **Never** say a source proves who a person is: a claim says what its source says, with the source. A name you worked out from traces never names anyone in public.

How sure a name is shows in its kind and its evidence; how much to trust it is the person's call.
