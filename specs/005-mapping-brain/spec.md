# Proposal: two protocols and an open brain

**Created**: 2026-11-09. Revised twice the same day.
**Status**: Building, 9 Nov. Choices 1, 2, 3, 5 and 6 are decided (below). Built and on main: the brain's files and their checked index; layers (`layer/v1`), `add_layer` and `compose_view` (`seam/v1`); the brain service and its routing (`brain_route`, `brain_file`, `brain_index`), taught in the skill and reached from `petal.mjs`. Layers kept on the site with versions and forks (`keep_layer`, `list_layers`, `fork_dataset`). Not yet: publishing a version, and leads.
**Input**: Keep it simple. The agent should know how to go deeper and deeper into the basic information it found in the first layer. One petal is a data protocol: a dataset attached to the investigated address that improves over time. Two systems that don't block each other, the data protocol and the visual protocol, improve separately. The brain is versioned too: a fast routing layer, plus an open-source layer people improve together.

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
 THE VISUAL PROTOCOL  a view turns measures into a flower              (the look's: W8)
```

| Part | Who leads it | Versioned as |
|---|---|---|
| The data protocol | The data side | `layer/v1` |
| The seam | The data side, agreed with the look's | `seam/v1` |
| The visual protocol | The look's side | `view/v1` |
| The brain | The data side writes the frame; anyone improves it by pull request | The repo's main branch, the only source, served by a thin brain service |

**Each moves on its own.** A new reader doesn't touch drawing. A new channel doesn't touch data. A better chapter or recipe touches neither.

## What went wrong on 9 Nov, and where each part answers it

A live session: RaidGuild, a Moloch v3 DAO on Gnosis.

1. **There was no reader for Moloch v3,** so the shares were read as a plain token.
   - *Data:* a recipe for Moloch v3 over a few generic reader shapes. A new framework is mostly a recipe file, which an agent can write from the contract's ABI.
2. **The agent found each proposal's author by hand, 246 of them, and the answer lived only in a note.**
   - *Data:* the agent adds a layer of its own, attributed and checked.
3. **"Show it on the petal" was refused:** a flower draws only what one reading holds.
   - *The seam:* a view names measures from any layers. Height is shares, a marking is proposals.
4. **The agent searched the 5.8 MB file** to learn the commands.
   - *The brain:* chapters and recipes, read from GitHub, answer that. Each tool's inputs should be answerable by a command, too.

## The files

- `data.md`: the dataset, git-like layers and versions, reader shapes and recipes, attribution, and where layers live.
- `seam.md`: exactly what crosses between data and drawing, and what each side changes alone.
- `brain.md`: the brain's chapters and recipes; the repo as the only source; the brain service that follows it and routes (the chain's answer, ranked words, a small local model, compared); pull requests as the only way in; and the harness brain's lessons.
- `research.md`: the facts and sources, the first draft's survey, the live session, and the harness brain's history.

## What the agent learns first

The brain's first chapters (`brain.md`):
- **start-from-an-address;**
- **where-power-lives,** with the seven shapes;
- **a-new-system:** figure it out, write a recipe, open a pull request;
- **going-deeper** and **over-time;**
- **open-source-leads:** directions only, private;
- **contributing:** opening a pull request, and a GitHub account if the person has none.

The doctrine:
- discovery, not crime;
- what they do, not who they are;
- verified, inferred or a lead, always said;
- coverage is partial;
- the tools count;
- small reads first;
- the person's own resources.

The tools run on the person's side only because our server does no reads for visitors (TGT-030). "The person's side" is wherever their agent runs. Every door is in `research.md`.

## Decisions, 9 Nov

1. **Where layers live:** private first, published when the author chooses, for now.
2. **Who can add:** anyone can add, fork and build on prior layers. So layers and datasets behave like git: named by their hashes, each version naming its parent, and anyone builds on prior layers. Forks and parents now; merges later (`data.md`).
3. **A lead's confidence:** not a problem yet; first, learn to generate leads. It moves out of 005, to the notes and claims chapter.

**Why would DAO frameworks need specific readers?** They mostly don't. There's no universal "list the members" call, but a few shapes in code (token balances, members from events, counts by participant or by sender, lines from events, view calls, an off-chain list) cover most frameworks. Each framework is then a recipe file. So readers become shapes and recipes now, not later, and an agent can write a recipe for a new framework from its ABI and offer it the git-like way (`data.md`).

5. **Which brain:** always the latest. Every agent asks the brain service, which follows the repo's main branch, and each layer records the commit it was given. A door's own copy is only a fallback when the service can't be reached, and says so. The brain needs a single source of truth: the repo, with a thin API or MCP that routes agents quickly by meaning, as a harness's brain did. So the repo is the source, and the service is a projection that routes (`brain.md`).
6. **Improvements:** only through GitHub for now: the agent learns to submit a pull request, and a person without GitHub gets an account. So there are no suggestions on the site. The `contributing` chapter teaches the agent to open the pull request, and to help the person make an account.

**Frameworks:** not one module per DAO type. Where power lives is a chapter in the brain, with the first seven shapes, and the brain teaches agents to figure a new system out, define a recipe and submit the pull request if needed. So there are two chapters, `where-power-lives` and `a-new-system`, plus the seven shapes and recipes as files.

## The order of work

1. **The data protocol:** layers, versions and forks, the seven shapes and the recipe format. Moloch v3 is the first recipe, and the RaidGuild flower is the test. It needs the seam, and the look's view to name two measures.
2. **The brain:** the doctrine, the first chapters, and the brain service. Routing starts with the chain's answer and ranked words; the small model is added only if the test set shows it's right more often.
3. **Leads.**

**Gate:** pull requests need `build/` public on GitHub. "Always latest" doesn't wait for it: the service follows `build/` main today.

## Done when

- **The RaidGuild flower draws** shares as size and proposals written as height, from two layers, each with its author.
- **A second person forks that dataset and adds a layer,** and both versions stand, each naming its parent.
- **An agent writes a recipe for a framework Petals hasn't seen,** from its ABI, and its layer can be read again by anyone from the recipe's hash.
- **A chapter or recipe improved by a pull request is what the next agent reads,** and the check refuses an index that doesn't match its files.
- **An agent with no recipe for a system writes one, tests it small, and opens the pull request,** and a person with no GitHub gets an account with the agent's help.
