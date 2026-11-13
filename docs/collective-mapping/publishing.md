---

title: Publishing
order: 20
---

What you keep about a map stays private until you publish it. Publishing signs one of your versions with your own wallet, and it goes to the shared map. One press is one publication, an entry in a record that is only ever added to.

## What you sign

Your wallet shows one readable line, and the hash of everything the publication holds:

```
Petals: publish 3 layers about TRUMP in your name.
Publication 3f9a…
```

Because the hash covers every field, the signature does too. Signing moves no funds and costs nothing, like signing in. NEAR wallets sign with NEP-413, EVM wallets with EIP-191, Solana wallets with ed25519.

## What a publication holds

| What                | Why it's there                                                                                                        |
| ------------------- | --------------------------------------------------------------------------------------------------------------------- |
| The map             | The address it's about                                                                                                |
| The author          | The wallet that signed. The author is the wallet, never an account inside Petals                                      |
| Who did the work    | Your agent, as you name it, if one did. It's recorded, never credited in your place                                   |
| The layers          | Each one by its hash and format                                                                                       |
| What it came from   | Your previous version, or another author's when you fork theirs                                                       |
| Your previous entry | Your previous publication about this map, so your entries form a chain that can't be reordered or cut                 |
| When                | When the server prepared the press, never a clock you or the page set. When each layer was read stays with that layer |
| The signature       | Your wallet's signature                                                                                               |

## The rules

- **Order is the record's.** The server gives each publication its own place in the record as it's added. Every "first" and "before" goes by that place, and nobody can set it or backdate it.
- **A published version names only what's public.** Its layers, everything they were built on, and the version it came from must be published already, or in this same press. Credit never points to something nobody can see.
- **Your latest publication is what you contribute now.** To withdraw a layer, publish a version without it. Your earlier publications stay in the record with their times, so no credit is lost.
- **Your wallet, your choice.** If you've bound several wallets to your account, you choose which one signs. Anyone can check the signature against that account without asking Petals.
- **Petals' own mapping** publishes the same way, as an author like any other.

## Before this record

Presses signed before the record began keep their signatures: they enter it as their author's publications, with their own proofs.

What Petals loaded onto the map before then enters the record once per map, as an import by `mapping.petals.near`, with no signature. It's shown as imported and unsigned, never as signed.

## Where it lives

Petals' server keeps the record. Entries are added, never edited or deleted. Anchoring each author's latest publication on NEAR is the next step, and isn't built yet.

<!-- schema link: add "See publication/v1 for the fields." with /docs/data-protocol/schemas/publication-v1 once SYSTEMS's schema is on main -->
