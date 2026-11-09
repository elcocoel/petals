---
id: a-new-system
for: a contract or system Petals has no recipe for yet
recognise: unknown contract, not supported, no module, new framework, can't read
tools: read_chain, add_layer, get_snapshot
continues: where-power-lives, contributing
status: partial
---

# A new system

When no recipe knows a contract, figure it out, and say so as you go.

1. **Read it.** `read_chain` gives what it answers and, when the source is verified, its events and calls.
2. **Find where power is** (`where-power-lives`): which calls name tokens or owners, which events record joining, voting, sponsoring or leaving.
3. **Match each to a shape:** a token it names is token balances; an event with an address in an indexed field is count by participant; an event that doesn't name who acted is count by sender.
4. **Read small and check:** `read_chain` with `logs` for one event over a narrow range first, and compare a total with what the contract itself answers.
5. **Keep what you read** as a layer (`add_layer`), saying how you made it and what you read, so the person sees it on their flower.
6. **Write the recipe** as a file, in the shape of the brain's recipes (`recipe/v1`), if the system is worth reading again. Offer it as a pull request (`contributing`).

Never guess a shape's answer: if a read can't say who acted, say that.
