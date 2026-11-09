---
id: where-power-lives
for: finding where power sits in any on-chain system, and reading it with a shape
recognise: dao, governance, members, holders, who holds, votes, voting power, who controls, treasury, multisig, signers, admin, owner, upgrade, pause, delegation, proposals, sponsored, stake
tools: get_snapshot, read_chain, describe_snapshot, compute_figures, propose_spec, render_flower
continues: going-deeper, over-time, a-new-system
status: ready
---

# Where power lives

In any system, ask five things, and read each from the chain:

- **Who holds?** A token's holders, a DAO's shares or loot, a validator's stake.
- **Who votes?** Votes cast, delegated voting power, who sponsored proposals.
- **Who can move the money?** A treasury's signers, the owners of a multisig.
- **Who can change the rules?** An owner, an admin key, who can upgrade or pause a contract.
- **How do you join or leave?** A token you buy, a vote to admit, a right to quit with your part.

Petals reads these with a few shapes, and a recipe names which shape reads what:

| Shape                                                                 | Answers                                                                                                                 |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| token balances                                                        | who holds a token the contract names                                                                                    |
| count by participant                                                  | how often each address did something the contract logs (sponsored, voted)                                               |
| count by sender                                                       | how often each address sent the transaction behind an event that doesn't name who acted                                 |
| members from events, lines from events, view calls, an off-chain list | today these are the Moloch v1, ERC20Votes, House of Stake and Snapshot readers; they become shapes as recipes need them |

`get_snapshot` with a recipe's id reads a system it knows (`moloch-v3` with `dao` and `chain`). One reading is one layer. To show two things at once, such as shares as size and proposals written as height, read each, keep any you gathered yourself with `add_layer`, join them with `compose_view`, and draw with `propose_spec` and `height: m:<measure>`.
