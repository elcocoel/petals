---

title: Claims
order: 20
---

Readings from a chain are backed by evidence. Deterministic tools read the data and do the counting; agents help you interpret the results. Each reading records its sources, the time or block it describes, and what it covers. Anyone using the same data and method would get the same results.

Data and insights are labelled separately, so you can distinguish what was read directly from the chain, what the agent inferred, and what is a lead to investigate. A recorded vote tells you how an account voted, but not why. A connection between accounts doesn’t prove they share an owner. An interpretation can be useful without being certain.

## How a claim is known

A claim says something about an account, asset, proposal or another claim. It names who answers for it and carries its evidence.

| Kind     | What it means                        | What supports it                  |
| -------- | ------------------------------------ | --------------------------------- |
| Observed | Read from a chain                    | A reading's hash or a transaction |
| Declared | The account says it of itself        | The account's own proof           |
| Stated   | The writer says it on their own word | The writer's account              |
| Sourced  | A writer points at an outside source | A source URL                      |
| Inferred | A rule or model concluded it         | The method and its evidence       |

Evidence records what it is, who found it and when. A claim never changes. A correction is a new claim that names the one it replaces; a challenge is a claim about the claim.

## Following a wallet's public trail

It can help you follow the public trail. An account may have declared a name, linked a forum profile, submitted proposals or signed transactions for a known organisation. Petals can help gather those records and distinguish what the account declared about itself from what someone else attributed to it.

Often, you’ll learn more about what an account does than who owns it: which networks it participates in, what it proposes, how it votes and where its influence comes from. Those connections can suggest where to look next. A shared name, similar voting pattern or transfer between wallets is a clue to investigate; it doesn’t establish that the same person controls them.

For the record's fields, see [claim/v4](/docs/data-protocol/schemas/claim-v4).
