# Many authors, one map: publishing, composing and credit

Wave 8, 13 Nov: `publication/v1`, `compose/v1` and `credit/v1`. This extends `data.md` (Elco's answers, 9 Nov) and builds its "Later, not now" line: **merging**, and the credit that comes with it. Everything else in `data.md` stands as written:

- a dataset per address, the sum of the layers anyone added;
- a layer never changes, and is named by its hash;
- the author is kept the git way, outside the hash;
- a version is a set of layer hashes naming its parent, so nothing is overwritten;
- anyone can fork, and both versions stand;
- `from` carries credit back along the chain;
- each author has their own latest version;
- private first, published under the author's signature.

Elco, 13 Nov: "who 'wins' is the wrong question unless they are mapping exactly the same data for exactly the same block ... results should be deterministic, right? so the question is 'how do different data layers from different people contribute to fuller and fuller maps' - that was the whole idea, all along". And: "this needs to be taken with absolute seriousness - it's the heart of the promise of the protocol (collective mapping) and it's also how we will distribute any eventual rewards in a future vision of governance ... there's ownership over valuable mapping that might become IP and passive income for the creators in the future."

So the shared map composes what everyone published. No author's work replaces another's. Credit is kept for every author, forever, and anyone can check it without asking Petals.

## 1. Layers: any of Petals' documents

In a version, a **layer** is any of Petals' documents about the address, by its hash: a `layer/v1`, a reading (`snapshot/v1`), a value, proposals, a mark, vesting, payouts or a set of claims. That is how values, proposals and logos go onto the map as layers, the same way readings do. Each document keeps its own format and version (`protocols.md`). A published document is kept once, by its hash, and never changed.

## 2. Publishing: a signed version (`publication/v1`)

Publishing is the step `data.md` left open: **an author signs one of their versions, and it goes to the shared map.** The version is the one `data.md` defines: the layers by hash, and the version it came from. One press is one publication, an entry in an append-only record.

| Field | What it holds |
|---|---|
| `petal` | `publication/v1` |
| `about` | the map's address, `chain:address` |
| `author` | the signing account, CAIP-10: `near:mainnet:alice.near`, `eip155:1:0x…` (one for every EVM chain), `solana:5eykt…:<base58>` |
| `via` | who did the work on the author's behalf, as the author says it: `{ kind: 'agent', name, model? }`, or null. It is recorded, never credited in the author's place |
| `layers` | the version's layers: `{ sha256, petal }` each |
| `parent` | the publication this version came from: the author's own previous one, or another author's when it's a fork. Null for a first |
| `previous` | this author's previous publication about this map, or null. So each author's record is a chain that can't be reordered or cut |
| `published_at` | when the server prepared the press (never the page's or the author's clock). When the data was collected belongs to each layer |
| `proof` | the wallet's signature, as its chain signs: `{ standard, public_key?, signature, message, nonce?, recipient? }` |

**What the wallet signs** is one readable text that names the hash of the publication's canonical JSON without its `proof`, so the signature covers every field and the person can read what they sign:

```
Petals: publish 3 layers about TRUMP in your name.
Publication 3f9a…(64 hex)
```

NEAR signs it with NEP-413 (`recipient` this site, a fresh 32-byte `nonce`), as signing in does. EVM signs it with EIP-191 (`personal_sign`), Solana with ed25519 over its UTF-8 bytes; the wallets' checks are `@petal/near/auth/wallets.ts`'s. A publication is named by the hash of its canonical JSON, proof included.

- **Order is the record's, never the author's.** The server appends each publication with its own sequence number and time (`seq`, `appended_at`), kept beside the signed body. Every "first", "earlier" and "before" in this spec is by `seq`. Nobody can set it or backdate it (PM, 13 Nov).
- **A published version names only what's public.** Its layers, every hash in their `from`, and its `parent` must be published already, or published in this same version. The credit chain never points into the dark (PM).
- **Withdrawing is a new version without the layer.** An author's **latest** publication about a map is what they contribute to it now, as `data.md` says. Their earlier publications stay in the record with their times, so credit is never lost.
- **Who the author is.** The author is the wallet that signed, never Petals' internal person id. A person with several bound wallets (`me/wallets`) chooses which one signs. Anyone can check the signature against the account.
- **Petals' own mapping** publishes the same way: an author like any other.
- **Presses signed before this protocol keep their signatures.** Elco's 35 RaidGuild names (12 Nov, 22:07 UTC) were signed with NEP-413 by their wallet. They enter the record as that author's publication, with that proof, whose message names the hash of what it signed. They are never folded into the import (PM).
- **What was loaded before this protocol** enters the record once per map, as an import. That covers the waves' readings, values, proposals, marks, vesting and payouts under `mapping.petals.near`. The import's `author` is `mapping.petals.near` and its `proof` is null, said plainly as "imported, unsigned". It is never presented as signed.
- **Where it lives:** Petals' server keeps the record append-only. Entries are added, never updated or deleted. Anchoring each author's latest publication on NEAR (`data.md`, "Where layers live") is the next step, not built here.

## 3. What a layer says: facts

The unit of the map, and of credit, is a **fact**: one value for one thing about one subject at one moment of the chain.

| Part | What it is | Example |
|---|---|---|
| `subject` | the account, proposal, allocation or map the value is about (CAIP-10 for accounts; EVM addresses in lower case) | `solana:5eykt…:2RH6…FFSK` |
| `what` | the data, named by its format and its own name, with its unit | `snapshot/token_balance TRUMP` |
| `state` | when on the chain the value holds (section 4) | `{ chain: solana:5eykt…, block: 465695924 }` |
| `value` | as text: a decimal with no trailing zeros, a word, or the hash of a structured value | `718132064.328498` |

Each format has one fixed rule that turns a layer into its facts (section 8), versioned as `compose/v1`. The same layer always gives the same facts.

**Absence is never a fact.** A reading of the top 60 holders doesn't say the other wallets hold nothing. Only what a layer states counts.

## 4. Three times, kept apart

This closes ATTRIBUTION's gap (`research/attribution-2026-11-12.md`, section 3).

- **State-at:** the chain state a value describes: the block, with its chain, where the layer names one; else the instant it holds at (`as_of`).
- **Period covered:** for facts about a span (votes, payouts, activity), the window `{from, to}`. It is part of the state, so two windows are two slices.
- **Collected-at:** when the author read it (a source's `fetched_at`, a document's `read_at`). It stays with the layer and its publication, never in the fact. Two reads of one block, an hour apart, state the same facts.

Two facts are **at the same moment** only when their states are equal: the same chain and block, or the same instant, and the same window.

## 5. How facts meet: the four cases

Facts are grouped by their **slot**: `subject`, `what` and `state`. Every fact a publication brings lands in one of four cases. These are the words the press shows before publishing (WORKSPACE's Mapping box) and Information shows after (OVERLAYS).

- **New data:** a `what` the map has no fact of, at any state. A new layer on the map.
- **New moment:** a `what` the map has, at a state it doesn't have. Another slice in time; every slice stays.
- **New subjects:** a `what` and state the map has, now for subjects it had no fact for (wallets beyond the top 60). The map gets fuller.
- **Same slot:** a slot the map already has a fact in.
  - **The same value is a match:** one fact, credited to every author who stated it.
  - **A different value differs.** Results should be deterministic, so two values in one slot mean at least one read is wrong, or isn't what it says. Both stand, each credited to its own authors, and the slot is marked "differs" for anyone to check. Neither is erased, and neither wins.

## 6. Composing the map (`compose/v1`): deterministic

The map's composition is a pure function of the record. Given the same publications, and a moment if one is asked, anyone gets the same answer, byte for byte.

1. Take each author's **latest** publication about the map. Order the authors by the `seq` of their first publication on the map.
2. Turn each of its layers into facts (section 8). Each fact carries its author and the publication that first brought it.
3. Group the facts by slot. Each slot has its distinct values; each value lists its authors, first to last. A slot with two or more values "differs".
4. **What a drawing shows for a slot that differs:** the value published first, marked as differing, with the others beside it, so a person can switch to any author's value. A later publication never changes what an earlier drawing showed.
5. **A slice for drawing** is one `what` at one state. By default it's the newest state of each `what`. A person can choose another state, or switch any author's layers off.

The answer names the publications it was composed from (their hashes) and its rule (`compose/v1`). The same inputs give the same answer.

## 7. The credit record (`credit/v1`)

A deterministic summary per author, built from the record alone, shaped so a future reward could be split from it. It is **not money now**. What credit is worth (points, rewards, income) is Elco's to design later.

| Field | What it holds |
|---|---|
| `author` | the account |
| `layers` | each layer they published: its hash, format and map; when they first published it; the facts they stated **first** and the facts they **matched**; and who used it |
| `layers[].built_on_by` | other authors whose published layers name it in `from` |
| `layers[].reused_by` | other authors whose published versions include it, or fork a version that includes it (`parent`) |
| `totals` | layers published, facts first, facts matched, distinct other accounts that built on or reused their layers, and points (`points/v1`, below) |
| `composed_from` | the publications it was computed from, by hash, and its rule (`credit/v1`) |

- **Counted once each:** another account counts once per layer, however many times it used it. An author's own use never counts.

**Points (Elco's idea, 8 Nov, `004-workspace`: "incentivizing mapping via 'points' that could one day move us towards a TGE -> users pay for extra features, part of revenue goes to a DAO, part of revenue rewards work, part of revenue goes to Devs"; `data.md`: "Credit or points for layers others build on").** One rule, `points/v1`:

- **A layer earns one point for each distinct other account that built on it or reused it.** Building on follows `from` the whole chain back: a layer built on a layer that was built on yours counts for yours too, once.
- Only published layers count, and only other authors' published versions count as use.
- **A use gives its point only to the authors who had published that layer before the use was appended** (by `seq`). Publishing an already-used layer again by its hash earns "matched" credit, an independent confirmation, never points from earlier uses. Copying earns nothing (PM).
- An author's points are the sum over their layers.
- Matching or stating facts first is credit, not points.
- The record keeps who used what, so a later split of revenue (a DAO, the work, the devs) can read it. There is no token and no money now.
- **Readable on NEAR Social under the author's account:** the author can post their record's hash and address to `social.near` under their own account. That is one call from their wallet, which needs Elco's go before any real NEAR moves. Anyone can recompute it from Petals' record and compare.
- **The caveats, named.** ATTRIBUTION, section 5 says:
  - No count here proves usefulness.
  - Several wallets can be one person (sock puppets), and colluding accounts can reuse each other.
  - "Imported, unsigned" credit is a collective label, not a person's.
  - **Before any reward, a curator confirms usefulness and attribution, and that decision is itself recorded.**

## 8. Facts by format (`compose/v1`)

| Format | Subject | What | State | Value |
|---|---|---|---|---|
| `snapshot/v1` | each holding's participant | `snapshot/<measure> <unit>` | its chain and `block_height`, or `as_of`; plus its window | the amount |
| `snapshot/v1` | each relationship's `from→to` | `snapshot/<type> <unit>` | as above | its amount, or `1` |
| `layer/v1` | each row's participant | `layer/<measure> <unit> <kind>` | `when.block_height`, or `when.as_of` | the row's value |
| value | the map | `value/price usd`, `value/circulating`, `value/max`, `value/market_cap usd`, `value/treasury usd` | the document's `read_at` (an outside price holds at its own time) | each figure; its source stays with the layer |
| proposals | each proposal, `proposal:<map>:<id>` | `proposals/outcome`; `proposals/vote` per voter (subject `<proposal>#<account>`) | the source's block or `at`; the window read | the outcome word; the choice and weight |
| mark | the map | `mark/name`, `mark/symbol`, `mark/logo` | the document's `read_at` | the name; the symbol; the logo's sha256 |
| vesting | each allocation, `<holder>#<name>` | `vesting/schedule` | the document's `read_at` | the hash of its total and schedule |
| payouts | each payout, by its transaction | `payouts/paid` | its block | the asset and the raw amount |
| claims | the claim's subject | `claim/<verb>` | its `as_of`, or its `issued_at` | the hash of its object |

A format not in this table can be published as a layer, but it gives no facts until a later `compose` version adds its rule.

## 9. The API (answers, additive; the formats above are what's stored and signed)

- **Before a press: `GET /api/v1/publish/data?map=`.** Each layer the press would publish: `{ sha256, petal, title, cases }`, where `cases` is `{ new_data: { whats }, new_moment: { states: [{ state, newest }] }, new_subjects: { count }, match: { count, authors }, differs: { count, authors } }`. `authors` are `[{ author, name }]`, the ones already credited. `totals` has the same `cases`, summed for the whole publication.
- **Prepare: `POST /api/v1/publish/prepare { map, layers?, via? }`.**
  - It answers `{ publication, sha256, text, recipient?, nonce? }`: the unsigned `publication/v1`, the hash of its canonical JSON, and the text the wallet signs (section 2).
  - `via` comes from the page, as the person says it ("Mapped with Petals' agent"). It is inside what they sign.
- **Publish: `POST /api/v1/publish/data { sha256, proof }`.**
  - `proof` is `{ standard: 'nep413' | 'eip191' | 'ed25519', signature, public_key?, nonce? }`.
  - It answers `{ publication, layers: [{ sha256, petal }], totals }`, where `publication` is the signed record's hash.
- **The map's layers: `GET /api/v1/maps/:id` adds three things:**
  - `layers: [{ sha256, petal, title, whats, states, collected_at, source, by, first }]`, newest state first, where `by` is the authors, first to last, and `first` is `{ author, publication, published_at }`;
  - `authors: [{ author, name, imported }]`;
  - `differs`: how many slots.
- **A composed reading: `GET /api/v1/maps/:id/reading?layers=&at=&view=`.**
  - The reading the map draws (`title`, `petals`, `given`), for the layers on (all by default) at a moment (the newest by default).
  - `credit` comes beside it:
    - `pieces[piece][participant]`: `{ by, first, differs? }`, where `differs` is `[{ value, by }]`;
    - `petals[participant]`: the publication that first brought it;
    - `publications[hash]`: `{ author, published_at }`;
    - `authors[author]`: `{ name, imported }`.
  - It also gives `composed_from` and `rule`. The same query always gives the same answer.
- **Credit: `GET /api/v1/me/credit` and `GET /api/v1/credit/:account`.** The author's `credit/v1`, with its `hash`. NEAR Social's copy under the author's account (`petals/credit`) holds `{ hash, points, site }`, and anyone can recompute it here.

## What this changes, in order (nothing merges before Elco's OK)

1. **Core:** `publication/v1` and `credit/v1`, each with its schema, fixture and pin; `factsOf`, `compose` and `creditOf`, pure, with golden fixtures. The fixtures are two real authors on one map: RaidGuild, with Elco's published names and Petals' mapping's reading. The check runs them.
2. **The record on the server:** an append-only `publication` table, beside `dataset_version` and `layer`. **This needs a migration, on META's go.**
3. **The press** publishes a signed version of any kept layer (values, proposals, marks, layers, vesting), not only claims and readings. NEAR, EVM and Solana wallets all sign.
4. **The map:** `GET /api/v1/maps/:id` gives its layers, slices and credits. A composed reading comes for any set of layers and any moment. The press says which of the four cases each fact is (WORKSPACE). Information lists the layers with their authors (OVERLAYS). The map draws the composed reading (LOOK). Each author's credit record is shown (LOBBY).
5. **The import:** today's rows, as one unsigned publication by `mapping.petals.near` per map.
