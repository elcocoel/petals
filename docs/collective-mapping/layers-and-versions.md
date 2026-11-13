---

title: Layers and versions
order: 10
---

There's one dataset for each investigated address, written `chain:address`: a DAO, a token, a validator set or a wallet. It's the sum of the layers anyone has added about that address.

## A layer

A layer is one of Petals' documents about the address: a reading, a computed layer, a value, proposals, a mark, vesting, payouts or a set of claims. Each keeps its own format and version. A layer never changes after it's made, and it's named by the hash of its contents: the same contents always have the same name, and nobody can change a layer without it becoming another one.

A computed layer (`layer/v1`) holds:

- **What it holds:** a value for each participant (`measures`), lines between participants (`relations`), or directions of research (`leads`).
- **How it was made:** the reading recipe it was read with, or the agent's own method and its sources.
- **When:** a block, a date or a window.
- **Its standing:** verified (read from the chain, and anyone can read it again), inferred (a step beyond a read) or a lead (a direction, never a fact).
- **What it was built on:** the layers it came from, by their hashes (`from`). A share computed from holdings names the holdings, so checking and credit follow the chain back.

## Who made it

Who made a layer is kept beside its contents, outside the hash, the way git keeps a commit's author apart from its files: the account that owns the project, the credential that authorised the addition, the time, the brain version and the recipe. So the same contents from two people are the same layer, with two records of who kept it. Work your agent does for you has you as its author.

## Versions and forks

A version of a dataset is a set of layers, by their hashes, plus the version it came from. Adding a layer makes a new version that names its parent. Nothing is overwritten.

Forking a version, adding, dropping or replacing layers, makes another version that names it as its parent. Both stand, and the original is untouched and still its author's.

Each author has their own latest version of each dataset they've touched. A flower names the version it draws, so it never changes underneath anyone.

## Private first

Layers and versions are kept in your project, private to you, until you [publish](/docs/collective-mapping/publishing) one. Your agent keeps them with `keep_layer`, lists them with `list_layers` and forks with `fork_dataset`.

See [layer/v1](/docs/data-protocol/schemas/layer-v1) for a computed layer's fields.
