# The data protocol: a dataset per address

SYSTEMS leads this side. It knows nothing of drawing: no channels, no colours, no petals. What it hands the visual side is in `seam.md`.

## A dataset

There's one per investigated address, written `chain:address`: a DAO, a token, a validator set, a wallet. It's the sum of the **layers** anyone has added about that address.

## A layer

One set of facts about the address's participants, from one author, at one time. A layer never changes after it's made.

Its format is `layer/v1`, a JSON Schema at `packages/core/schema/layer.schema.json` (`urn:petal:schema:layer:v1`), under `specs/protocols.md`. It refuses fields it doesn't know and needs full dates, with their time and zone; `add_layer` and the checker both use it.

| Field | What it holds |
|---|---|
| `about` | The address, `chain:address` |
| `kind` | `measures` (a value per participant), `relations` (lines between participants) or `leads` (directions of research) |
| `measures` | Per measure: a name, a unit and a kind (amount, count, share, category or flag, a yes or no), then a value per participant |
| `relations` | Per line: from, to, a kind (sent to, delegated to, voted with, sponsored), a weight and a unit |
| `leads` | Per lead: the participant, what was found, and its source links. How much a person trusts a lead belongs to the notes and claims chapter, not here (Elco, 9 Nov) |
| `how` | The recipe it was read with (by its hash), or the agent's own method and its sources |
| `from` | The layers it was built on, by hash, if any |
| `when` | A block, a date or a window |
| `standing` | Verified (read from the chain, and anyone can read it again), inferred (a step beyond a read) or lead (a direction, never a fact) |
| `hash` | Of everything above |

**Who made it is kept the git way, outside the hash,** as git keeps a commit's author apart from the files: whoever stores a layer keeps, beside it, the author (the account that owns the project, TGT-005), the credential that authorised it (their wallet, or the link it came by), the time, the brain version the site served, and the recipe it was read with. On the site that's the `layer` table (migrations 9 and 10), and `list_layers` shows it as `by`, with the author as `owner` or the link, never an account id. So the same facts from two people are the same layer, with two records of who kept it. A reader run by someone's agent has that person as its author.

## Git-like, as Elco asked

Elco, 9 Nov: "anyone can add, fork and use the prior."

**Now:**
- **Content-addressed.** A layer is named by its hash, so the same facts always have the same name, and nobody can change a layer without it becoming another one.
- **A version of a dataset is a set of layer hashes, plus the version it came from (`parent`).** Adding a layer makes a new version that names its parent. Nothing is overwritten.
- **Anyone can fork.** Taking someone's version and adding, dropping or replacing layers makes a new version that names theirs as its parent. Both stand. The original author's work is untouched and still theirs.
- **Building on prior work.** A layer names the layers it was built on (`from`): a share computed from shares, proposals per member matched to a reader's members. So credit and checking follow the chain back.
- **Each author has their own latest version** of each dataset they've touched. A flower names the version it draws, so it never changes underneath anyone.

**Since wave 8 (13 Nov), in `composition.md`:**
- **Merging:** the shared map composes every author's published documents, fact by fact. Same data at the same block is one fact credited to every author who stated it; a different value there "differs", and both stand. Nothing overwrites; no one wins.
- **Credit** for every author of every fact, in the order they published, in an append-only record each author signs (`publication/v1`).
- **Comparing:** what a publication adds to the map: new data, a new moment, new subjects, or the same slot (a match, or a difference).

**Later, not now:**
- **Named branches.**
- **Points or rewards** for credit (Elco's points idea, 004-workspace): the record they'd rest on is `composition.md`'s.

## Where layers live

Elco's choice, 9 Nov: **private first, published when the author chooses.**
- **Private layers and versions** live in Petals' database, against the author's account (TGT-006).
- **Published ones** go to the shared map on NEAR, like flowers today, under the author's signature. Wave 8's record and composition: `composition.md`; anchoring each author's latest publication on NEAR comes next.
- **A fork can only name a parent the forker can see:** a published version, or their own.

**Built, 9 Nov:** `keep_layer`, `list_layers` and `fork_dataset`, through the project's link (migration 9). A project nobody has claimed holds its layers under itself, and they move to whoever claims it, and again when a session signs in. Publishing a version to the shared map isn't built, so for now a fork takes one's own versions only.

## Readers: a few shapes in code, frameworks as recipe files

Elco asked "why do DAO frameworks need specific readers?". **They mostly don't.** Elco, 9 Nov: "let's not default to a one module per DAO type". The brain's `where-power-lives` chapter teaches the shapes, and `a-new-system` teaches writing a recipe.

There's no universal "list the members" call on any chain. But a few shapes cover most frameworks. A framework is then a **recipe**: a short file that names its contract's events and calls, and which shape reads each one.

**The shapes, in code, and few:**

| Shape | What it reads | Today's code it comes from |
|---|---|---|
| **token balances** | A token's holders, from its transfers or an indexer | erc20-holders, solana-spl-holders |
| **members from events** | A value per member, replayed from events (joins, share changes, leaves) | moloch-v1 |
| **count by participant** | How many times each address appears in an event (votes cast, proposals sponsored) | new |
| **count by sender** | The same, by who sent each event's transaction. Bounded: one call per event | new; it's the RaidGuild proposals, done by hand on 9 Nov |
| **lines from events** | A relation per event (delegated to, sent to) | erc20-votes |
| **view calls** | A list of read calls, and how their answers become values | near-house-of-stake |
| **off-chain list** | A public API's list (Snapshot's votes), through the page reader's guard | new |

**A recipe, as a file:**
- which framework it's for, and how to recognise it (calls the contract answers, or the factory that made it);
- the chains;
- for each measure or relation: the shape, the events or calls, the name, unit and kind;
- its bounds: calls and block range.

A recipe can only ask for reads on chains we know, within its bounds, and it holds no code.

**Moloch v3 (Baal) as a recipe:**
- **Recognise it** by `sharesToken()`, `lootToken()` and `avatar()`.
- **Read with these shapes:**
  - token balances, on the shares token and on the loot token;
  - count by participant, on `SponsorProposal(member)` and `SubmitVote(member)`;
  - optionally, count by sender, on `SubmitProposal`, which costs 246 calls for RaidGuild.
- **To confirm before building:** the event layouts, against the DAO's verified source.

**Recipes travel the git-like way.**
- An agent can write a recipe for a new framework from its contract's ABI, in the conversation, and run it on the person's side. The layer it makes names the recipe's hash, so anyone can run it again.
- A recipe that works is offered to the open repo as a pull request, the way a chapter is (`brain.md`). Once merged, every agent reads it, because every agent reads the latest. Recipes live in the brain's folder, `brain/recipes/`.

**Code stays where the work is more than reading:** the NEAR validators crawl and veNEAR's power maths. Those two stay as readers in code.

## Derived measures

A share of the total, a rank or a count per period comes from other layers by a fixed rule, so anyone gets the same answer. These are computed on this side, named like any measure (`share_of:shares`), and kept as layers with `from`. The visual side never computes data.

## What changes in code

- `snapshot/v1` becomes a layer of kind `measures`. Old snapshots stay readable.
- The readers become shapes, plus recipes, plus the two that stay code.
- Three tools:
  - add a layer;
  - list an address's layers and versions;
  - fork a version.
- The counting (`compute_figures`) and the shared map stay as they are.
