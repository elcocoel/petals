# Many authors, one map: publishing, composing and credit

13 Nov: `publication/v1`, `compose/v1` and `credit/v1`. This extends `data.md` (decided 9 Nov) and builds its "Later, not now" line: **merging**, and the credit that comes with it. Everything else in `data.md` stands as written:

- a dataset per address, the sum of the layers anyone added;
- a layer never changes, and is named by its hash;
- the author is kept the git way, outside the hash;
- a version is a set of layer hashes naming its parent, so nothing is overwritten;
- anyone can fork, and both versions stand;
- `from` carries credit back along the chain;
- each author has their own latest version;
- private first, published under the author's signature.

Who "wins" is the wrong question unless two authors map exactly the same data at exactly the same block, and results are deterministic. The question is how data layers from different people contribute to fuller and fuller maps: collective mapping, the heart of the protocol's promise.

So the shared map composes what everyone published. No author's work replaces another's. Credit is kept for every author, forever, and anyone can check it without asking Petals.

## 1. Layers: any of Petals' documents

In a version, a **layer** is any of Petals' documents about the address, by its hash: a `layer/v1`, a reading (`snapshot/v1`), a value, proposals, a mark, vesting, payouts or a set of claims. That is how values, proposals and logos go onto the map as layers, the same way readings do. Each document keeps its own format and version (`protocols.md`). A published document is kept once, by its hash, and never changed.

### 1b. Three kinds of unit, always told apart

Every unit a layer carries, down to each figure, is one of three kinds, and its own fields say which. Nothing is guessed: the same unit always reads as the same kind.

| Kind | What it is | What it names, so anyone can check it |
|---|---|---|
| **On-chain data** | read from a chain: who holds what, who voted, what was paid | its chain and the block, transaction or call it was read at (or the instant, where the chain's answer names no block): anyone can read it again there |
| **Deterministic result** | worked out from other units by a fixed method | the method and its version, `name@version` (for example `blocs/agreement@2`), and its inputs by hash: anyone can run that method on those inputs and get the same value |
| **Claim** | what someone answers for: a name for an account, a project's own table, an outside source's price | who answers for it (a person, the project, the source: 1Click, DefiLlama, CoinGecko, Snapshot) and what it rests on |

**The rule, in this order:**
1. A unit that names a versioned method (`name@version`, as a claim's `method` is written) and its inputs by hash is a **deterministic result**.
2. Else, a unit read from a chain, naming the chain and its block, transaction or call, is **on-chain data**.
3. Anything else is a **claim**. That includes an inference with a method in words, or with no inputs by hash: nobody can recompute it, so its author answers for it.

**Where each format says it:**

| Format | Its kind, and the field that says it |
|---|---|
| `snapshot/v1` | on-chain data: its network's chain, `block_height` (or `as_of`), its `sources` |
| proposals | on-chain data when read from the DAO's contract (`source.contract`, the calls in `source.ref`); a claim of Snapshot when `source.kind` is `snapshot` (off-chain votes, as its hub lists them) |
| payouts | on-chain data: each payout's transaction (`evidence`) and block (`when`). Its `usd` is an outside price, a claim of `usd.source`, and is no part of the fact (section 8) |
| `layer/v1` | a deterministic result when `how.method` is `name@version` and `from` names its inputs; on-chain data when `standing` is verified and `when.block_height` names its block; otherwise a claim (a method in words, an inference, a lead) |
| `value` | per figure, by its `source`: `chain` is on-chain data (`ref` names the call, `at` when); any other word (`1click`, `defillama`, `coingecko`) is a claim of that source. Its `totals` and the treasury's `total` are deterministic results by the format's own rule, named by its version (`value/v3`), from its `snapshot` (by hash) and the figures beside them. A treasury item summed from the reading (`source.snapshot`) is a result the same way; one read by a call is on-chain data; one from an outside address is a claim of that source |
| `vesting` | per allocation, by `known`: verified is on-chain data (its `evidence` of kind chain names the account or transaction); published is a claim of the project (its `evidence`: the project's page); inferred is a claim of its author, since `vesting/v1` names no versioned method for it. A vesting version that adds `method` and `from` to an allocation makes an inferred one a deterministic result |
| mark | per field, by its `source`: read from the chain (`chain`, `ft_metadata`, `metaplex`, `poster`) is on-chain data; any other source (a curated list, an app's API such as `daohaus`, CoinGecko) is a claim of that source; `petals` (status inferred) is Petals' claim |
| `claim/v*` | a claim, whatever its `kind` (an observed claim quotes the chain as its evidence). An inferred claim is a deterministic result only when it names a versioned `method` and its inputs by hash (`evidence[].snapshot_sha256`). Voting blocs name `blocs/agreement@2` with their thresholds' hash, and their proposals by id, so they read as claims until they also name the proposals document's hash |

**What the kind changes, and what it doesn't.** The kind is read beside each fact, never part of its slot (section 8), so composing doesn't change: facts meet by slot as before. A claim's facts (`claim/<verb>`) stand side by side whatever their kind, since one account can hold many names or partners. Two values in one slot of on-chain data or of a deterministic result should be impossible, so it's flagged as a probable read or method error (section 6). Two authors who run the same method on the same inputs state the same facts (sections 3 and 5). Core reads the kind with one pure function beside `factsOf`, so a map's layers can say which kinds they hold, and any reader can show the three apart. Whoever writes a computed layer (`add_layer`, an agent following the brain) writes its method as `name@version` and its inputs in `from`.

## 2. Publishing: a signed version (`publication/v1`)

Publishing is the step `data.md` left open: **an author signs one of their versions, and it goes to the shared map.** The version is the one `data.md` defines: the layers by hash, and the version it came from. One press is one publication, an entry in an append-only record.

| Field | What it holds |
|---|---|
| `petal` | `publication/v1` |
| `about` | the map's address, `chain:address` |
| `author` | the signing account, CAIP-10: a NEAR account, `near:mainnet:alice.near`, the profile (section 2c). A publication signed before change 3 may name an Ethereum or Solana wallet: `eip155:1:0x…` (one for every EVM chain), `solana:5eykt…:<base58>` |
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

- **Order is the record's, never the author's.** The server appends each publication with its own sequence number and time (`seq`, `appended_at`), kept beside the signed body. Every "first", "earlier" and "before" in this spec is by `seq`. Nobody can set it or backdate it.
- **A published version names only what's public.** Its layers, every hash in their `from`, and its `parent` must be published already, or published in this same version. The credit chain never points into the dark.
- **Withdrawing is a new version without the layer.** An author's **latest** publication about a map is what they contribute to it now, as `data.md` says. Their earlier publications stay in the record with their times, so credit is never lost.
- **Who the author is.** The author is the NEAR account that signed: the profile, never Petals' internal person id. A person's Ethereum and Solana wallets are proven links to it (section 2c), credited through it. Anyone can check the signature against the account.
- **Petals' own mapping** publishes the same way: an author like any other.
- **Presses signed before this protocol keep their signatures.** The first 35 RaidGuild names (12 Nov, 22:07 UTC) were signed with NEP-413 by their wallet. They enter the record as that author's publication, with that proof, whose message names the hash of what it signed. They are never folded into the import.
- **What was loaded before this protocol** entered the record once per map, as an import (from now on bulk data goes through a press, section 2b). That covers the mapping runs' readings, values, proposals, marks, vesting and payouts under `mapping.petals.near`. The import's `author` is `mapping.petals.near` and its `proof` is null, said plainly as "imported, unsigned". It is never presented as signed. When a later read replaces one of those rows (a new value, new proposals, a reading retired), the import run after it appends Petals' next version of that map, its `parent` and `previous` the last: the composed map follows what Petals holds now, and the record keeps what it held before. A map whose rows haven't changed is left.
- **Where it lives:** Petals' server keeps the record append-only. Entries are added, never updated or deleted. Anchoring each author's latest publication on NEAR (`data.md`, "Where layers live") is the next step, not built here.

## 2b. One press, many publications (`manifest/v1`; change 2, additive to `publication/v1`)

An author can publish several data units with **one press and one signature**: a press of their own across many maps, or a bulk import. A person who has their agents map many networks and then publishes the whole contribution signs **once**, however many maps and addresses it touches. What it adds to each address is its own layer (or layers), in that address's own publication, credited and composed like any other layer. Each unit stays an ordinary `publication/v1`, about one map, with its own layers, `parent`, `previous` and `published_at`. Only how it is signed is new: one signature covers a **manifest** that lists them, and each publication points at it. Nothing else changes: composing, facts and credit read each publication as they read one signed alone.

**The manifest** is a document of its own, kept once in the record by its hash, like a layer:

| Field | What it holds |
|---|---|
| `petal` | `manifest/v1` |
| `author` | the signing account, CAIP-10, the same `author` as every publication it lists |
| `publications` | the unsigned hash of each publication (its canonical JSON without `proof`, as section 2 names one), in the order they are appended |
| `published_at` | when the server prepared the press |

**What the wallet signs** is one readable text that names the manifest's hash:

```
Petals: publish 267 versions in your name.
Manifest 7c1e…(64 hex)
```

It is signed as section 2 says: NEP-413 for NEAR, EIP-191 for EVM, ed25519 for Solana.

**Each publication points at it.** Its `proof` is the press's one signature, as section 2 has it, plus `manifest`: the manifest's hash. So a publication signed this way reads `{ standard, public_key?, signature, message, nonce?, recipient?, manifest }`, and one signed alone has no `manifest` field, exactly as before.

**How anyone checks one.** For a publication whose proof names a manifest:
1. the manifest's canonical JSON hashes to `proof.manifest`;
2. the manifest's `author` is the publication's `author`, and the publication's unsigned hash is in its `publications`;
3. the text's last line names that manifest (`Manifest <hash>`), and the signature verifies over the text for that author, as for one publication.

**How the server takes a press.** Prepare names the maps, `{ maps: [...], author }`, or `{ maps: 'all', author }` for every map where the author has something to publish, and answers the unsigned publications, the manifest, its hash, the text, and for NEAR the recipient and nonce. Publish sends `{ sha256: <the manifest's hash>, proof }`. The server checks the signature once, checks the manifest lists exactly the publications it prepared, then appends the manifest and every publication in one transaction: all of them, or none. Each gets its own `seq`, in the manifest's order. Section 2's rules hold for each one: only public layers and parents, `previous` the author's latest about that map, the record's order and time. A map with nothing to add is left out of the press, with why: `'all'` lists everything it leaves, never drops one silently. An address with no map drawn on the Power Map is pressed like any other: what the author holds about it is its version.

**How credit counts.** As for any publication. Each is credited by its own `seq`, so firsts follow the manifest's order inside the press. A manifest is not a unit of data: it adds no facts and earns nothing. One press over many maps counts exactly as many presses would.

**A bulk import is a press like any other.** Data loaded in bulk (a mapping run's readings, values, proposals, marks, vesting and payouts) enters the record through prepare and publish, under the author who signs it, with no special path. Petals' own base data is published this way by `near:mainnet:petals.near`, in one press. That press signs one version for each imported entry, an address with no map drawn there yet included (a dataset is any address): the next version after that map's imported entry, with `parent` set to it and `previous` to Petals' latest there (the same entry, unless petals.near had published on that map since, as with RaidGuild's 35 names, which the version carries too). The bare label `mapping.petals.near` on the imported entries and `near:mainnet:petals.near` are one author, Petals', on each map from that version on: the imported entries read as petals.near's earlier versions, so the signed one is Petals' latest there, its first facts keep the import's place in the record, and it never confirms or reuses its own import. Another account's version whose parent is an imported entry is a fork, as always. From then on, the latest version of every map is signed, what Petals holds goes to the record through a press (the import leaves those maps), and the imported entries stay in the record as they are.

## 2c. The author is a NEAR profile; other wallets are proven links (`link/v1`; change 3, to section 2)

A person's profile has one master key: its NEAR account. Every publication from change 3 on is signed by a NEAR account, and that account is its `author`; a manifest's too (section 2b). An Ethereum or Solana wallet joins the profile the way a social account does: it proves once, with its own signature, that it belongs to the profile. Its work is then credited to the profile through that link, and it pays through NEAR Intents. A new profile starts with NEAR; a linked wallet signs in to its profile, and one linked to none is refused.

**The link** is a document of its own, kept once by its hash:

| Field | What it holds |
|---|---|
| `petal` | `link/v1` |
| `profile` | the NEAR account, CAIP-10: `near:mainnet:alice.near` |
| `wallet` | the linked wallet, CAIP-10: `eip155:1:0x…` (one for every EVM chain), `solana:5eykt…:<base58>` |
| `linked_at` | when the server prepared the link |
| `proof` | the wallet's signature, as its chain signs (EIP-191 for EVM, ed25519 for Solana), over the text below |

**What the wallet signs** is one readable text that names the link's hash without its `proof`:

```
Petals: 0x12…ab belongs to alice.near.
Link 5d0e…(64 hex)
```

(The wallet's whole address, as its chain writes it, where this shows its ends.)

**Public, and checked from both sides.** A link works in Petals as soon as the wallet signs it (signing in, paying). It goes public with the profile's next press: it travels as a layer of the profile's own publication about its own account (`about` is the NEAR account), so the profile's NEAR signature covers it, and it costs no second prompt. Anyone checks a link in two steps: the wallet's signature over its text, for that wallet; and the NEAR-signed publication that carries it, for that profile. A link only one side has signed credits nothing.

**How the map and credit read links.**
- **On the map,** each signing account's line stands as published: nothing is hidden or merged. A line signed by a wallet with a public link is shown as the profile's, through that wallet ("alice.near, via 0x12…ab").
- **In credit,** a profile and its publicly linked wallets are one author: a fact counts once for the profile, under the first of their publications that stated it, and a profile never confirms, builds on or reuses its own linked wallets' work.

**Publications signed by an Ethereum or Solana wallet before change 3** stay in the record as they are, valid, signed by that wallet, with their place and time; nothing is rewritten. Once that wallet's link to a profile is public, they read as the profile's, as above; until then the wallet is its own author, as before.

**What changes, in order:**
1. Core: `link/v1`, its schema, fixture and pin; its text and check beside `signedText`; compose and credit read published links as above.
2. Prepare (sections 2b and 9) takes a NEAR `author` only, and refuses an Ethereum or Solana wallet: "Publish with your NEAR account; your linked wallets' work is credited to it."
3. Linking (`POST /api/v1/me/wallets`) keeps the link with its signature; the next press carries the profile's unpublished links. The sign-in rule is built (a new profile starts with NEAR).
4. `GET /api/v1/profiles/:account` and the map's authors name each public link.

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

- **State-at:** the chain state a value describes: the block, with its chain, where the layer names one; else the instant it holds at (`as_of`).
- **Period covered:** for facts about a span (votes, payouts, activity), the window `{from, to}`. It is part of the state, so two windows are two slices.
- **Collected-at:** when the author read it (a source's `fetched_at`, a document's `read_at`). It stays with the layer and its publication, never in the fact. Two reads of one block, an hour apart, state the same facts.

Two facts are **at the same moment** only when their states are equal: the same chain and block, or the same instant, and the same window.

## 5. How facts meet: the four cases

Facts are grouped by their **slot**: `subject`, `what` and `state`. Every fact a publication brings lands in one of four cases. These are the words the press shows before publishing (the Mapping box) and Information shows after.

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
4. **What a drawing shows for a slot that differs:**
   - The first value shown is the qualifier's best, where the server recorded its verdict when it appended the layer; then the one published first, by the record's order.
   - The other values stand beside it as options, the "double maps" a person can switch to.
   - **For chain data, a difference should be impossible**, or nearly: a read at a block is deterministic. So a "differs" there is flagged as a probable read error, to check.
   - **Claims are interpretations:** every value shows side by side, and none is "differs". Their full treatment comes after the hackathon.
5. **A slice for drawing** is one `what` at one state. By default it's the newest state of each `what`. A person can choose another state, or switch any author's layers off.

The answer names the publications it was composed from (their hashes) and its rule (`compose/v1`). The same inputs give the same answer.

## 7. No licence field

A publication carries no licence field.

## 7b. The credit record (`credit/v1`)

A deterministic summary per author, built from the record alone.

| Field | What it holds |
|---|---|
| `author` | the account |
| `layers` | each layer they published: its hash, format and map; when they first published it; the facts they added **first**, the facts they **confirmed**; and who built on it. A fact counts once for its author, under the first of their layers that carried it: the same fact in two of their layers is one contribution |
| `layers[].built_on_by` | other authors whose published layers name it in `from` |
| `layers[].reused_by` | other authors whose published versions include it, or fork a version that includes it (`parent`) |
| `totals` | three counts of who's helping a lot or a little: `first` (facts they added to the map first: new data, new moments, new subjects), `confirmed` (facts they matched independently) and `built_on` (accounts that built on their work, once per layer: `points/v1`, below); and `layers` |
| `composed_from` | the publications it was computed from, by hash, and its rule (`credit/v1`) |

- **Counted once each:** another account counts once per layer, however many times it used it. An author's own use never counts.

**Points (`data.md`: "Credit or points for layers others build on").** One rule, `points/v1`:

- **A layer earns one point for each distinct other account that built on it or reused it.** Building on follows `from` the whole chain back: a layer built on a layer that was built on yours counts for yours too, once.
- Only published layers count, and only other authors' published versions count as use.
- **A use gives its point only to the authors who had published that layer before the use was appended** (by `seq`). Publishing an already-used layer again by its hash earns "matched" credit, an independent confirmation, never points from earlier uses. Copying earns nothing.
- An author's points are the sum over their layers.
- Matching or stating facts first is credit, not points.
- The record keeps who used what.
- **Anyone can recompute it** from Petals' record and compare. Posting it to NEAR Social under the author's account waits, as does anchoring.
- **The caveats, named:**
  - No count here proves usefulness.
  - Several wallets can be one person (sock puppets), and colluding accounts can reuse each other.
  - "Imported, unsigned" credit is a collective label, not a person's.

## 7c. Considered, and how each is handled

Each of these issues has been considered and is solvable, and the system says so plainly.

| The worry | How it's handled now | Later |
|---|---|---|
| Two authors give different values for the same block | Both stand. The qualifier's verdict, then the record's order, decide which shows first; the others are options. For chain data it's flagged as a probable read error | A re-read at the block, by anyone, is a third author who matches one of them |
| Backdating, to be "first" | Order is the record's own sequence and time, set by the server when it appends. Nobody can choose it | Anchoring each author's latest publication on NEAR |
| Copying a popular layer to share its points | A use's point goes only to the authors who published the layer before that use. A copy earns "matched" credit, never earlier points | — |
| Sock puppets and colluding accounts | Named, not solved. Each account counts once per layer, and its own use never counts | — |
| Claims that disagree (two names for one account) | All shown side by side; none wins | The full treatment of interpretations, after the hackathon |
| What was loaded before the protocol | Said plainly as "imported, unsigned", by `mapping.petals.near`, never shown as signed | Petals' own mapping signs its future publications like any author |

## 8. Facts by format (`compose/v1`)

| Format | Subject | What | Of | State | Value |
|---|---|---|---|---|---|
| `snapshot/v1` | each holding's participant | `snapshot/<measure> <unit>` | the holding's `asset`, where it names one | its chain and `block_height`, or `as_of`; plus its window | the amount |
| `snapshot/v1` | each relationship's `from→to` | `snapshot/<type> <unit>` | — | as above | its amount, or `1` |
| `layer/v1` | each row's participant | `layer/<measure> <unit> <kind>` | — | `when.block_height`, or `when.as_of` | the row's value |
| value | the map | `value/price usd`, `value/circulating`, `value/max`, `value/market_cap usd`, `value/treasury usd` | — | the document's `read_at` (an outside price holds at its own time) | each figure; its source stays with the layer |
| proposals | each proposal, `proposal:<map>:<id>` | `proposals/outcome`; `proposals/vote` per voter (subject `<proposal>#<account>`) | — | the source's block or `at`; the window read | the outcome word; the choice and weight |
| mark | the map | `mark/name`, `mark/symbol`, `mark/logo` | — | the document's `read_at` | the name; the symbol; the logo's sha256 |
| vesting | each allocation, `<holder>#<name>` | `vesting/schedule` | — | the document's `read_at` | the hash of its total and schedule |
| payouts | each payout, by its transaction | `payouts/paid` | its recipient and asset | its block | the asset and the raw amount |
| claims | the claim's subject | `claim/<verb>` | — | its `as_of`, or its `issued_at` | the hash of its object |

A slot is a fact's subject, what, of and state. **Of** is what, within its subject, a fact is about, where one subject holds several at one moment: a participant's deposits of two governing mints (a realm's community and council tokens), a transaction's payouts to several recipients. Without it those would be several values in one slot, and read as "differs" when nothing disagrees. It is part of the slot, never of `what`, so the words for a kind of data are the same.

A format not in this table can be published as a layer, but it gives no facts until a later `compose` version adds its rule.

## 9. The API (answers, additive; the formats above are what's stored and signed)

- **Before a press: `GET /api/v1/publish/data?map=`.** Each layer the press would publish: `{ sha256, petal, title, cases }`, where `cases` is `{ new_data: { whats }, new_moment: { states: [{ what, state, newest }] }, new_subjects: { count }, match: { count, authors }, differs: { count, authors } }`. `authors` are `[{ author, name }]`, the ones already credited. A state is `{ chain?, block?, at?, window? }`; `newest` is null when the map has none. `totals` has the same `cases`, summed for the whole publication. The layers are what this press adds: the readings the person drew, the claims that can go, and the documents they kept (values, proposals, marks, readings, vesting, payouts, layers), less what their latest version holds already. A layer built on one that isn't published stays back, in `adds` with why.
- **Prepare: `POST /api/v1/publish/data/prepare { map, author }`** (built 13 Nov; `via` waits).
  - `author` is the signed-in person's NEAR account, as `GET /api/v1/me`'s `wallets[].author` names it (CAIP-10). Any other is refused, an Ethereum or Solana wallet too (section 2c).
  - It answers `{ publication, sha256, text, recipient?, nonce? }`: the unsigned `publication/v1`, the hash of its canonical JSON without `proof`, and the text the wallet signs (section 2). For a NEAR author, `recipient` is this site's hostname and `nonce` a fresh 32-byte base64, for NEP-413.
  - The version's `layers` are the author's latest version's and what this press adds; its `parent` and `previous` are the author's latest publication about the map; `published_at` is the server's time.
- **One press over many maps (section 2b): `POST /api/v1/publish/data/prepare { maps: [...] | 'all', author }`.** It answers `{ manifest, sha256, text, publications: [{ about, name, sha256, publication }], left: [{ about, why }], recipient?, nonce? }`: the manifest, its hash, the one text the wallet signs, each map's unsigned publication and its unsigned hash, and the maps left out. Publish takes `{ sha256: <the manifest's hash>, proof }` as below and answers `{ manifest, publications: [{ about, publication, layers }] }`.
- **Publish: `POST /api/v1/publish/data { sha256, proof }`.**
  - `proof` is `{ standard: 'nep413' | 'eip191' | 'ed25519', signature, public_key?, nonce? }`: NEP-413 for NEAR (with `public_key` and the `nonce` given), EIP-191 for EVM, ed25519 for Solana (the signature in base64).
  - It answers `{ publication, layers: [{ sha256, petal }], totals }`, where `publication` is the signed record's hash and `layers` what this press added.
  - The claims show on the map at once, as before (Insights, each kept with the signature), and the readings the person drew are credited to the author.
- **The map's layers: `GET /api/v1/maps/:id` adds three things:**
  - `layers: [{ sha256, petal, title, whats, states, from, collected_at, source, by, first }]`, newest state first, where `from` is the hashes the layer was built on (its document's own `from`, empty where none), `by` is the authors, first to last, and `first` is `{ author, publication, published_at }`;
  - `authors: [{ author, name, imported, first, confirmed, built_on }]`, on this map;
  - `differs`: how many slots.
- **A composed reading: `GET /api/v1/maps/:id/reading?layers=&at=&view=`.**
  - The reading the map draws (`title`, `petals`, `given`), for the layers on (all by default) at a moment (the newest by default).
  - `credit` comes beside it:
    - `pieces[piece][participant]`: `{ by, first, differs? }`, where `differs` is `[{ value, by }]`;
    - `petals[participant]`: the publication that first brought it;
    - `publications[hash]`: `{ author, published_at }`;
    - `authors[author]`: `{ name, imported }`.
  - It also gives `composed_from` and `rule`. The same query always gives the same answer.
- **A map's record: `GET /api/v1/maps/:id/record`.** Every publication about the map, in the record's own order: `entries: [{ seq, appended_at, hash, author, name, signed, published_at, via, parent, previous, layers, added, dropped, proof, manifest? }]`, where `added` and `dropped` are its layers' hashes against the author's `previous`, and `manifest` is the manifest/v1 a press's proof names. With it, anyone checks each publication's signature and its manifest (section 2b) without asking Petals.
- **Credit: `GET /api/v1/me/credit` and `GET /api/v1/credit/:account`.** The author's `credit/v1`, with its `hash`. NEAR Social's copy under the author's account (`petals/credit`) holds `{ hash, points, site }`, and anyone can recompute it here.

## What this changes, in order

1. **Core:** `publication/v1` and `credit/v1`, each with its schema, fixture and pin; `factsOf`, `compose` and `creditOf`, pure, with golden fixtures. The fixtures are two real authors on one map: RaidGuild, with a person's published names and Petals' mapping's reading. The check runs them.
2. **The record on the server:** an append-only `publication` table, beside `dataset_version` and `layer`. **This needs a migration.**
3. **The press** publishes a signed version of any kept layer (values, proposals, marks, layers, vesting), not only claims and readings. NEAR, EVM and Solana wallets all sign.
4. **The map:** `GET /api/v1/maps/:id` gives its layers, slices and credits. A composed reading comes for any set of layers and any moment. The press says which of the four cases each fact is. Information lists the layers with their authors. The map draws the composed reading. Each author's credit record is shown.
5. **The import:** today's rows, as one unsigned publication by `mapping.petals.near` per map.
