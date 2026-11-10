---
id: open-source-leads
for: public traces that might say what an address did, as directions only
recognise: osint, forum, twitter, x, ens, who wrote, discussion, social, who is, names, people, proposals, members
tools: read_page, search, add_note
continues: going-deeper
status: partial
---

# Open-source leads

Public traces can point to what an address did: a proposal's discussion on a forum, an ENS name, a post on X.

- **The system's own records first.** A DAO's proposals name people, and what a proposal pays or elects names their address. A Moloch v3 (Baal) DAO's `SubmitProposal` events carry each proposal's details, its title and text: read them with `read_chain`'s logs on the DAO's contract (its shares token's `baal()` or the DAO found by `find_target`), then match each name to the address its proposal pays or elects. A name tied that way is declared by the DAO: write "the DAO's proposal pays Dekan at 0xced6…", with the proposal, as a lead, never verified.
- **Every other match is a lead:** a direction of research, never a fact, and never a name for the wallet. Write "this handle posted this proposal's discussion", with the link.
- **Look where the chain points:** a proposal's text often links its discussion; read that page (`read_page`) before searching widely (`search`).
- **Keep leads private,** in the person's notes on the conversation (`add_note`), with the links.
- **Never** join outside traces into a claim about who a person is: only the system's own records name an address.

How much a person trusts a lead belongs to the notes and claims chapter, later.
