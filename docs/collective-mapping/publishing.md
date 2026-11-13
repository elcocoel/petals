---

title: Publishing
order: 20
---

What you keep about a map stays private until you publish it. Publishing is one press on that map, signed by your own wallet. It moves no funds and costs nothing, like signing in.

## What you publish: documents

Anything kept in one of Petals' formats about one map's address can be published: a reading, a layer, a value, proposals, a mark, vesting, payouts or claims. Each is a document, named by the hash of its contents. A published document is kept once, by its hash, and never changed.

## The record

Each press is one publication: an entry in an append-only record, signed by its author. It holds:

| What                     | Why it's there                                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| The author               | The wallet that signed: a NEAR account, an EVM address or a Solana address. The author is the wallet, never an account inside Petals            |
| Who did the work for you | Your agent, as you name it, if one did. It's recorded, never credited in your place                                                              |
| When you pressed         | When the publication was made. When each document was read stays with that document                                                             |
| The documents            | Each one by its hash, its format and the address it's about                                                                                      |
| What you withdraw        | Documents you published before and withdraw from now on                                                                                          |
| Your previous entry      | The hash of your previous publication, so your entries form a chain that can't be reordered or cut                                              |
| The signature            | Your wallet's signature over all of the above, as your chain signs: NEP-413 for NEAR, EIP-4361 for EVM, ed25519 for Solana                       |

Anyone can check a signature without asking Petals. Entries are added, never edited or deleted.

## Your wallet, your choice

If you've bound several wallets to your account, you choose which one signs. The record names that wallet.

## Before signed publishing

What was on the map before this record began enters it once, as an import by `mapping.petals.near`, with no signature. It's shown as imported and unsigned, never as signed.

## Where it lives

Petals' server keeps the record, append-only. Anchoring each author's latest publication on NEAR is the next step, and isn't built yet.

<!-- schema link: add "See publication/v1 for the fields." with /docs/data-protocol/schemas/publication-v1 once SYSTEMS's schema is on main -->
