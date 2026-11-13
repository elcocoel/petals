---

title: How layers meet
order: 30
---

The map is made of facts. Each layer gives its facts by one fixed rule for its format, so the same layer always gives the same facts.

## A fact

A fact is one value for one thing about one subject at one moment of the chain.

| Part    | What it is                                                  | Example                   |
| ------- | ----------------------------------------------------------- | ------------------------- |
| Subject | The account, proposal, allocation or map the value is about | A holder's address        |
| What    | The data, by its format and its name, with its unit         | A token balance, in TRUMP |
| State   | When on the chain the value holds                           | Block 465,695,924         |
| Value   | The value itself                                            | 718,132,064.328498        |

**Absence is never a fact.** A reading of the 60 largest holders doesn't say every other wallet holds nothing. Only what a layer states counts.

## Three times, kept apart

- **State-at:** the chain state a value describes: the block, or the moment it holds at.
- **Period covered:** for facts about a span, such as votes, payouts or activity, the window read. It's part of the state, so two reads of different windows are different slices.
- **Collected-at:** when the author read it. It stays with the layer and its publication, never in the fact. Two reads of the same block, an hour apart, state the same facts.

## The four cases

Every published fact lands in one of four cases, by its subject, what and state:

- **New data:** something the map has no fact of, at any moment. It's a new layer on the map.
- **A new moment:** something the map has, at a moment it doesn't have. It's another slice in time, and every slice stays.
- **New subjects:** something the map has at that moment, now for subjects it had nothing for, such as wallets beyond the 60 largest. The map gets fuller.
- **The same slot:** a subject, what and state the map already has a fact in.
  - The same value is a **match**: one fact, credited to every author who stated it.
  - A different value **differs**. Results should be deterministic, so two values mean at least one read is wrong, or isn't what it says. Both stand, each credited to its own authors, and the slot is marked for anyone to check. Neither is erased, and neither wins.

## Composing the map

The map is composed from the record alone, the same way every time. Given the same publications, anyone gets the same map.

1. Each author's latest publication about the map, the authors in the order they first published on it.
2. Each of its layers turned into facts, each fact carrying its author and the publication that first brought it.
3. The facts grouped by slot, each value with its authors, first to last.

Where a slot differs, a drawing shows the value published first, marked as differing, with the others beside it, and you can switch to any author's value. A later publication never changes what an earlier drawing showed.

By default, the map draws each kind of data at its newest moment. You can choose another moment, or switch any author's layers off.
