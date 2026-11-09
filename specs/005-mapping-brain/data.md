# The data protocol: a dataset per address

SYSTEMS leads this side. It knows nothing of drawing: no channels, no colours, no petals. What it hands the visual side is in `seam.md`.

## A dataset

There's one per investigated address, written `chain:address`: a DAO, a token, a validator set, a wallet. It's the sum of the **layers** anyone has added about that address.

## A layer

One set of facts about the address's participants, from one author, at one time. A layer never changes after it's made.

| Field | What it holds |
|---|---|
| `about` | The address, `chain:address` |
| `by` | The author's account, and the credential that signed it (TGT-005). A reader run by Petals' own tools still has an author: whoever's agent ran it |
| `kind` | `measures` (a value per participant), `relations` (lines between participants) or `leads` (directions of research) |
| `measures` | Per measure: a name, a unit and a kind (amount, count, share, category or yes-no), then a value per participant |
| `relations` | Per line: from, to, a kind (sent to, delegated to, voted with, sponsored), a weight and a unit |
| `leads` | Per lead: the participant, what was found, its source links, and the person's confidence. Private (`spec.md`, choice 3) |
| `how` | A Petals reader with its parameters and version, or the agent's own method and its sources |
| `when` | A block, a date or a window |
| `standing` | Verified (read from the chain, and anyone can read it again), inferred (a step beyond a read) or lead (a direction, never a fact) |
| `corrects` | Optionally, the hash of a layer this one corrects |
| `hash` | Of everything above |

## What a version is

- **A version of the dataset is a set of layer hashes.** Nothing more is needed: layers don't change, so a set of hashes always means the same data.
- **Improving the dataset is adding a layer:** a later reading, a new measure, or a correction.
- **Different people's layers stand side by side.** Nobody overwrites anybody.
- **Change over time** is the same measure, from the same `how`, in layers with different `when`.

## Readers

A reader turns a source into a layer, the way today's readers turn one into a snapshot. Today's seven stay as they are, and today's snapshot becomes a reader's layer.

**The first new reader is Moloch v3 (Baal).**
- **Where it reads:** Gnosis, Ethereum, Base and Arbitrum.
- **How it recognises a Baal DAO:** by `sharesToken()`, `lootToken()` and `avatar()`, or by its summoner.
- **What one verified layer holds, per member:**
  - shares and loot;
  - voting power after delegation;
  - proposals sponsored;
  - votes cast.
- **Proposals written, optionally.** The submission event doesn't name who wrote it, so this reads each submission's sender: one call per proposal, 246 for RaidGuild. It says that cost, and it stops at a stated cap.
- **To confirm before building:** the event layouts, against the DAO's verified source.

**An agent's own gathering** becomes a layer through one tool, `add_layer`. That's what the agent did by hand for RaidGuild's proposals. The tool checks three things before it keeps the layer:
- the participants are the address's;
- the measures have units and kinds;
- `how` names its method and sources.

## Derived measures

A share of the total, a rank or a count per period comes from other layers by a fixed rule, so anyone gets the same answer. These are computed on this side and named like any measure (`share_of:shares`). The visual side never computes data.

## Where layers live

That's `spec.md`, choice 1: private first, published when the author chooses (lean).
- **Private layers** live in Petals' database, against the account (TGT-006).
- **Published layers** go to the shared map on NEAR, like flowers today, under the author's signature.

## What changes in code

- `snapshot/v1` becomes a layer of kind `measures` from a reader. Old snapshots stay readable as such.
- One tool to add a layer, and one to list an address's layers.
- The readers, the counting (`compute_figures`) and the shared map stay as they are.
