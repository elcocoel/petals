---
id: open-source-leads
for: public traces that might say what an address did, as directions only
recognise: osint, forum, twitter, x, ens, who wrote, discussion, social, who is, names, people
tools: read_page, search, add_annotation
continues: going-deeper
status: partial
---

# Open-source leads

Public traces can point to what an address did: a proposal's discussion on a forum, an ENS name, a post on X.

- **The system's own records first.** A DAO's proposals name people, and what a proposal pays or elects names their address. A Moloch v3 (Baal) DAO's `SubmitProposal` events carry each proposal's details, its title and text: read them with `read_chain`'s logs on the DAO's contract (its shares token's `baal()` or the DAO found by `find_target`), then match each name to the address its proposal pays or elects. A name tied that way is declared by the DAO: write "the DAO's proposal pays Dekan at 0xced6…", with the proposal, as a lead, never verified.
- **Every other match is a lead:** a direction of research, never a fact. Write "this handle posted this proposal's discussion", with the link.
- **Look where the chain points:** a proposal's text often links its discussion; read that page (`read_page`) before searching widely (`search`).
- **Keep names and leads in the person's project, privately,** as annotations (`add_annotation`), saved as you find them. A name the system's own records give is `sourced`, with its proposal or transaction as evidence. One you worked out from outside traces is `inferred`, with its method, and each page as evidence, with its platform and an archived copy. Names of people are allowed there, in a person's private annotations only (Elco's decision, 10 Nov); nothing with a person's name is published.
- **Never** say an outside trace proves who a person is: only the system's own records name an address, as declared there.

How sure a name is shows in its kind and its evidence; how much to trust it is the person's call.
