---

title: Collective mapping
order: 45
---

The Power Map is a collective construction: its people build it together, and no one's work replaces another's. Three counts show who's helping, a lot or a little, and give a useful measure of what doing good looks like here.

## Three counts per person

- **Facts you added first:** new data, new moments and new wallets the map didn't have until you published them.
- **Facts you confirmed:** facts someone had published that you read again and matched, independently.
- **Accounts that built on your work:** each other account that built on a layer of yours or reused it. These are your points.

Points aren't money, and there's no token. Anyone can work all three counts out again from the record.

RaidGuild's map shows it today: two authors, Petals' own mapping, imported and unsigned, and petals.near, whose names for RaidGuild's accounts were signed by its wallet. Each has its own counts.

Results read from a chain are deterministic. So the question isn't whose map wins: it's how layers from different people add up to a fuller map.

## Publishing

What you keep about a map stays private until you publish it. Publishing signs one of your versions with your own wallet: its layers, by their hashes, and the version it came from. It moves no funds and costs nothing, like signing in. Each press is an entry in a record that's only ever added to, in the order the server received it.

## How layers meet

Each layer gives facts: one value for one thing about one subject at one moment of the chain. A published fact is one of four cases:

- **New data:** something the map had no fact of.
- **A new moment:** the same data at a block the map didn't have. Every moment stays.
- **New subjects:** the same data at the same moment, for accounts the map had nothing for. The map gets fuller.
- **The same slot:** the same value is a match, one fact credited to every author who stated it. A different value differs: both stand, each credited to its own authors.

The map is composed from the record alone, so anyone gets the same map from the same publications.

## Credit

Credit is kept per fact, for every author who stated it, in the order they published. A later publication never removes an earlier one's credit. Building on someone's layer counts for every layer back along the chain, once each.

## The hard cases, considered

- **Two values for the same block.** Both stand. The qualifier's verdict, recorded by the server when it added the layer, then the record's order, decide which shows first; the others are options you can switch to. A read at a block is deterministic, so for chain data a difference is flagged as a probable read error. Anyone can read that block again, and their read matches one of them.
- **Backdating, to be first.** Order is the record's own: the server sets each entry's place and time as it adds it, and nobody can choose them.
- **Copying a popular layer.** A use's point goes only to the authors who published the layer before that use. A copy earns a confirmation, never earlier points.
- **Many wallets, one person.** Named, not solved. Each account counts once per layer, and its own use never counts. Before any reward, someone confirms usefulness and attribution, and that decision is recorded too.
- **Claims that disagree,** such as two names for one account. A claim is an interpretation, not a chain read: all are shown side by side, and none wins. A fuller treatment comes later.
- **What came before.** What Petals loaded before the record began is one import by `mapping.petals.near`, said plainly as imported and unsigned, never shown as signed.

See [publication/v1](/docs/data-protocol/schemas/publication-v1) and [credit/v1](/docs/data-protocol/schemas/credit-v1) for the fields.
