# Open questions

Everything we know we'll have to solve. Each has a working default, so nothing here blocks the start. **Bites** says when it starts to matter.

## Who pays and access

| # | Question | Default for now | Bites |
|---|---|---|---|
| 1 | ~~Who pays for a first answer?~~ Decided: the person, as in any crypto app. Viewing and the written opening stay free | Their agent, their wallet, their money. Judges on an invite | Done |
| 2 | How does a person's wallet fund NEAR's agent directly, so Petal never holds money? Their own NEAR AI key from the browser (CORS allows it), NEAR AI's wallet sign-in, staking for inference, connecting subscriptions | Own agent only, for now | After the vertical line |
| 3 | Payment needs mainnet: Intents has no testnet and no plans for one | Dry quote only | When real payment starts |
| 4 | Do voluntary donations fit first? Or a cut per transaction in a commercial version? 1Click `appFees` tops out at 2.5% to Petal, and only on payments through a quote Petal built | Not built | Later |
| 5 | Fresh chain reads cost shared rate limits more than dollars. How are they limited, per what? | A low limit per caller | Before going public |
| 6 | Does NEAR AI's per-key `spendLimit` reset or last for the key's lifetime, and what happens at the limit? | Use it as a backstop once tested | First hosted key |
| 7 | How should sponsored invites look to their holder: one per person, or one shared? | One per holder, revocable | Before submission |
| 8 | Can a sponsored person publish, and as whom? A shared demo account, plainly labelled? | Yes, plainly labelled | Before submission |
| 8c | A complimentary first dollar per account? Could be drained by many accounts | No | Later |
| 8d | How does a person choose the model behind the agent? Fire's rule: offer, choice and receipt are three facts | The default model. `PETAL_MODEL` is server-wide | After the vertical line |

## Claims and policy

| # | Question | Default | Bites |
|---|---|---|---|
| 9 | Chains can't forget. A wrong claim about a real person can be hidden, not erased. What may go on chain? Who may name a person? | Claims naming a natural person stay off chain until decided | Before any open writing |
| 10 | Open writing invites junk. What keeps it down without a maintainer? | Readers' lenses, plus evidence that can be inspected | Before any open writing |
| 11 | What's the default lens a new reader sees? | Observed, and self-declared names, plainly marked | When claims show up |
| 12 | Confidence: a number or plain bands? Who's allowed to set one? | Bands, by named classifiers only | When a classifier arrives |
| 13 | How is a claimer's standing computed without becoming a popularity contest? | Not computed yet | With the social layer |
| 14 | Which classifier? `typesafe/jev-1.13` on NEAR AI looks suited and cheap, but it's untested and may have no enclave signature | Untested, nothing depends on it | When a classifier arrives |
| 15 | Can a PII filter help screen claims before they become permanent? NEAR AI lists `openai/privacy-filter` | Untested | With question 9 |
| 16 | How do existing labels and corrections become claims? | Readers treat them as claims, and nothing is rewritten | With the claims task |
| 17 | Should private claims exist, such as someone's own notes or a theory they aren't ready to publish? | Notes stay in the exploration | With explorations |

## Identity and agents

| # | Question | Default | Bites |
|---|---|---|---|
| 18 | Which wallets after NEAR, and in what order? near-connect is NEAR only | EVM, then Solana, then Bitcoin | After the NEAR slice |
| 19 | A person with only a Bitcoin wallet can explore and approve, but can't publish under their own name, because publishing needs NEP-413. Is that acceptable? | Yes, for now | With question 18 |
| 20 | What does "private" promise? The operator can read the workspace, and the enclave covers only the model step | Say so plainly | Before any public promise |
| 21 | Do wallets show the recipient reliably, and does signing work inside a connector's popup or on mobile? | Unknown, test with Meteor first | With sign-in |
| 22 | Claude needs a transport 401, and ChatGPT a tool error with `_meta`. Can one server serve both? | Needs a live test | With OAuth |
| 23 | Cursor's callback uses `localhost:8787`, which clashes with Petal's default local API port | Change ours | With OAuth |
| 24 | Are function-call keys worth scheduling for agents writing as the maker? They can't sign NEP-413 and don't work in Claude or ChatGPT | After explorations | Later |
| 25 | What's the recovery story for someone with one lost wallet? | Export, and honesty | Before any public promise |

## Data and the map

| # | Question | Default | Bites |
|---|---|---|---|
| 26 | What identifies a group over time, so two dates of one group connect? | The module and its parameters, leaving out `window_days`, which is how it was read | With relations |
| 27 | Is the same EVM address on Ethereum and Base one account? It often is, but that's still a claim | Separate ids; a match is marked `inferred` with its method, and paths don't walk it unless asked. Sameness claims come with T197 | With relations |
| 28 | Super-node groups connect everything in traversal. How do paths stay meaningful? | Group sizes on every hop, and how many groups each shared account is in. No score yet | With relations |
| 29 | Overlap between a full read and a window read is only a lower bound. How is that shown? | `at_least`, with the coverage facts of each side | With relations |
| 30 | Is "network", "group" or something else the right word in code? And what replaces "atlas", if anything? | Keep `network` in code | When Elco decides |

## Runtime

| # | Question | Default | Bites |
|---|---|---|---|
| 31 | When does one process stop being enough? | A second tenant or a second worker | Later |
| 32 | How long may a run last? The code's own limit is 120 s, and a chat has been cut off there | Raise it once runs are durable | With durable runs |
| 33 | When is the move to Postgres? The same SQL mostly carries over | Not before the freeze | Later |
| 34 | Where do backups go, and encrypted how? | Nightly, encrypted, off the machine | With hosting |

## Beyond the build

| # | Question | Bites |
|---|---|---|
| 35 | The social layer: how people interact with claims | Sketch and talk later |
| 36 | Could this become a DAO creation and management platform? | Ideas drawer |
| 37 | Beyond chain data: any entity with control over anything | After on-chain works |
