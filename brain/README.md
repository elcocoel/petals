# The brain

What Petals' agent knows how to do, as plain files (`specs/005-mapping-brain/brain.md`). This folder in the repo is the only source of truth: anything else that holds the brain is a copy made from it.

- `recipes/`: one reading recipe per kind of contract (`specs/005-mapping-brain/data.md`, Readers). A recipe names a contract's events and calls, and which of Petals' reading shapes reads each one. It holds no code.

Chapters and the doctrine come next.

## A recipe

A JSON file, `recipe/v1`, with these fields:

- `id`, `title`, `for`, `description`;
- `chains`: the chains it reads;
- `params`: what the person gives, at least `chain` and the contract;
- `recognise`: the calls a contract of this kind answers;
- `measures`: each with a `name`, `unit`, `kind` (amount or count), `label`, and its `shape` with that shape's settings;
- `bounds`: how much it may read.

The shapes, for now:

- `token_balances`: the holders of a token the contract names through a call;
- `count_by_participant`: how often each address appears in an event's indexed field;
- `count_by_sender`: how often each address sent the transaction behind an event. It costs one call per event, so it's capped.

The rest of the seven shapes come as recipes need them.
