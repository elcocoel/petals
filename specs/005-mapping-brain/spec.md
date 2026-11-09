# Proposal: two protocols and an open brain

**Created**: 2026-11-09, by SYSTEMS. Revised twice the same day, after Elco read each draft.
**Status**: Proposal. Nothing is built. Elco answered choices 1 to 3 on 9 Nov (below); 4 to 6 are open.
**Input**: Elco, 9 Nov:

> Please don't make it more complicated than it has to be. The agent barely knows how to do anything. The agent should know how to go deeper and deeper into the basic information it found in the first layer.

> one petal is a data protocol, a data set that can be improved over time, attached to the investigated address.

> We need 2 different systems that shouldn't block each other - one is the data protocol and the other is "how to make it visual" protocol. having them separated would allow us to improve them as separate things.

> the other thing that will need versioning is the brain itself … a fast routing layer + an opensource layer that people can improve together could be cool.

## The picture

```
 the agent ── learns how from ──►  THE BRAIN            open files, released by version,
     │                              doctrine + strategies   a generated index for routing
     │ adds layers                                          (brain.md)
     ▼
 THE DATA PROTOCOL   one dataset per address, in layers, by author     (data.md)
     │
     │  the seam: the view input, measures named, with kinds            (seam.md)
     ▼
 THE VISUAL PROTOCOL  a view turns measures into a flower              (LOOK's, with Elco: W8)
```

| Part | Who leads it | Versioned as |
|---|---|---|
| The data protocol | SYSTEMS | `data/v1` |
| The seam | SYSTEMS, agreed with LOOK | `seam/v1` |
| The visual protocol | LOOK, with Elco | `view/v1` |
| The brain | SYSTEMS writes the frame; anyone improves the strategies | `brain-vN` |

**Each moves on its own.** A new reader doesn't touch drawing. A new channel doesn't touch data. A better strategy touches neither.

## What went wrong on 9 Nov, and where each part answers it

Elco's session: RaidGuild, a Moloch v3 DAO on Gnosis.

1. **There was no reader for Moloch v3,** so the shares were read as a plain token.
   - *Data:* a recipe for Moloch v3 over a few generic reader shapes. A new framework is mostly a recipe file, which an agent can write from the contract's ABI.
2. **The agent found each proposal's author by hand, 246 of them, and the answer lived only in a note.**
   - *Data:* the agent adds a layer of its own, attributed and checked.
3. **"Show it on the petal" was refused:** a flower draws only what one reading holds.
   - *The seam:* a view names measures from any layers. Height is shares, a marking is proposals.
4. **The agent searched the 5.8 MB file** to learn the commands.
   - *The brain:* strategies and a `brain` command answer that. Each tool's inputs should be answerable by a command, too.

## The files

- `data.md`: the dataset, git-like layers and versions, reader shapes and recipes, attribution, and where layers live.
- `seam.md`: exactly what crosses between data and drawing, and what each side changes alone.
- `brain.md`: the brain, its versions, the routing index, every door, "improve this strategy", and the harness brain's lessons.
- `research.md`: the facts and sources, the first draft's survey, Elco's live session, and the harness brain's history.

## What the agent learns first

Three strategies, as Elco asked, plus one doctrine:

- **Going deeper.** After every answer, the agent offers the next layer down, from what it found. Each step taken adds a layer.
- **Open-source leads.** Public traces (a forum post, a proposal's discussion, an ENS name, a post on X) are directions only: private, never a name for a wallet. How much a person trusts a lead is for the notes and claims chapter, once we know how to generate leads well.
- **Change over time.** An interval and a span agreed with the person, at most 24 points to start. Each point is a dated layer.
- **The doctrine:**
  - discovery, not crime;
  - what they do, not who they are;
  - verified, inferred or a lead, always said;
  - coverage is partial;
  - the tools count;
  - small reads first;
  - the person's own resources.

The tools run on the person's side only because our server does no reads for visitors (TGT-030). "The person's side" is wherever their agent runs. Every door is in `research.md`.

## Elco's answers, 9 Nov

1. **Where layers live:** "private first, published when the author chooses for now."
2. **Who can add:** "anyone can add, fork and use the prior". So layers and datasets behave like git: named by their hashes, each version naming its parent, and anyone builds on prior layers. Forks and parents now; merges later (`data.md`).
3. **A lead's confidence:** "we don't have this problem yet - first we need to learn how to generate these leads". It moves out of 005, to the notes and claims chapter.

**Elco's question, "why do DAO frameworks need specific readers?"** They mostly don't. There's no universal "list the members" call, but a few shapes in code (token balances, members from events, counts by participant or by sender, lines from events, view calls, an off-chain list) cover most frameworks. Each framework is then a recipe file. So readers become shapes and recipes now, not later, and an agent can write a recipe for a new framework from its ABI and offer it the git-like way (`data.md`).

## Still open

**4. The order of work.** Lean:
1. the data protocol: layers, versions and forks, the reader shapes and the recipe format, with Moloch v3 as the first recipe and the RaidGuild flower as the test (it needs the seam, and LOOK's view to name two measures);
2. the brain, with going deeper and change over time;
3. leads.

**5. Which brain an agent reads.**
- (a) The version its door was built with.
- (b) The latest from GitHub, each time.
- **Lean: (a).** It's reproducible, and a newer brain reaches people at the next build.

**6. How someone without GitHub improves a strategy or a recipe.**
- (a) Only by pull request.
- (b) Also by a suggestion posted to the site, which a maintainer turns into a pull request.
- **Lean: (b).**

## Done when (once approved)

- **The RaidGuild flower draws** shares as size and proposals written as height, from two layers, each with its author.
- **A second person forks that dataset and adds a layer,** and both versions stand, each naming its parent.
- **An agent writes a recipe for a framework Petals hasn't seen,** from its ABI, and its layer can be read again by anyone from the recipe's hash.
- **A strategy improved by a pull request reaches every door** at the next release, and the check refuses an index that doesn't match its files.
