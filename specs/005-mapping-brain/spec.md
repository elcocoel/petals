# Proposal: a dataset per address, and an agent that goes deeper

**Created**: 2026-11-09, by SYSTEMS. Revised the same day, simpler, after Elco read the first draft.
**Status**: Proposal. Nothing is built. Elco chooses (the end of this file), one question at a time.
**Input**: Elco, 9 Nov:

> Please don't make it more complicated than it has to be. The agent barely knows how to do anything. The agent should know how to go deeper and deeper into the basic information it found in the first layer.

> one petal is a data protocol, a data set that can be improved over time, attached to the investigated address. Different people could contribute to that data set … Anything about a given address should be identifiably about that address and the author.

The first draft's survey (every tool, every door, the harness brain) is in `research.md`, beside this file. So is what Elco's live session ran into.

## What went wrong on 9 Nov: RaidGuild, a Moloch v3 DAO on Gnosis

1. **No reader for Moloch v3.** The agent read the DAO's shares as a plain token.
2. **"How many proposals has each wallet written?"** The agent paged 246 proposals and looked up each sender by hand. The answer was right, but it lived only in a note.
3. **"Show it on the petal."** Petals refused: "The snapshot has no measure 'proposals'." A flower can only draw what its one reading holds, and nothing lets an agent add to that reading.
4. **The agent searched the 5.8 MB file** to learn the commands and what a flower can show.

Points 2 and 3 are the centre of this proposal. The agent did good work, and Petals had nowhere to keep it.

## 1. The dataset

**There's one dataset per investigated address.** For a DAO, that's the DAO's address; for a token, the token's; for a wallet, the wallet's. The dataset grows in **layers**, and **a flower is a view over some of its layers.**

**A layer is one set of facts about the address's participants, from one author, at one time.**

- **About:** the address, as `chain:address`.
- **By:** the author's account, with the credential that signed it (TGT-005).
- **What:** per participant, a value for one or more measures (shares, proposals written, votes cast), or leads (an OSINT direction, with its source).
- **How:** a Petals reader with its parameters, or the agent's own gathering, with its method and sources.
- **When:** a block or a date, or a window.
- **Standing:** verified (read from the chain, and anyone can read it again), inferred (a step beyond the read), or a lead (a direction, never a fact).
- **Hash:** of all the above. A layer never changes after it's made.

**How the dataset improves over time:**
- **Improving** means adding a layer: a later reading, a new measure, or a correction that names the layer it corrects.
- **Different people's layers stand side by side.** Nobody overwrites anybody.
- **A version of the dataset** is simply a set of layers, named by their hashes.
- **A flower names the layers it draws**, and what to draw from them: petals are the members, their size is shares from layer A, and their height is proposals from layer B. So a flower stays reproducible from what it names, as today.

### How a flower points at layers (for W8, with LOOK)

These are the options; the lean is marked on each.

- **A measure has a name, a unit, a kind and a date.**
  - The kind is an amount, a count, a share or a category.
  - The date is the layer's.
  - **A change over time isn't a new type:** it's the same measure in several layers, each at its own date. *Lean.*
  - The other option is a series inside one layer, per participant. That's kept for counts per period, if testing asks for it.
- **Relations are layers too.** A relation layer holds lines rather than values:
  - from one participant to another;
  - with a kind (sent to, delegated to, voted with, sponsored);
  - a weight, a unit and a date;
  - the same author, method, standing and hash as any layer.

  The flower's lines name a relation layer and a kind. *Lean.* Without this, lines can only come from what one reader happened to keep.
- **Each channel names a measure, by name:** `height: shares`, `marking: proposals`, `lines: delegated_to`. *Lean.*
  - The name is found in the layers the flower chose. If two layers have the same name, it's written as `<layer>:<measure>`.
  - **The check refuses a mismatch:** height and width want an amount or a count; colour wants a category or a scale; a marking wants a count or a yes-or-no.
  - This generalises today's `m:<measure>`, which can only name the one snapshot's measures.

**RaidGuild, again:**
- **Layer A:** shares and loot, from the Moloch v3 reader. Verified.
- **Layer B:** proposals per wallet, gathered by the agent from the chain's proposal events and their senders. Verified, with the method.
- **Layer C:** leads, a forum handle against a wallet, with links. Each is a lead, private, with the person's confidence.
- **The flower Elco asked for:** layers A and B.

**What changes in code:**
- the snapshot becomes the first layer of a dataset;
- a flower's recipe names layers instead of one snapshot;
- one tool lets an agent add a layer it gathered, checked against the address's participants before it's kept.

The readers, the drawing and the counting stay as they are.

## 2. Three things the agent learns

These are three short strategy files, plain words the agent reads, alongside one short doctrine. That's all the "brain" is, for now.

### Going deeper

After every answer, the agent offers the next layer down, from what it just found:
- the largest holder's other groups (`account_groups`) and what it holds;
- the proposals behind a member's power;
- who sponsored or voted on them;
- the group's change over time.

Each offer is a question for the person, not a step taken. What it finds becomes a layer, so going deeper builds the dataset.

### Open-source leads (OSINT)

The agent looks for public traces that might link a wallet to a forum post, a proposal's discussion, an ENS name or a post on X. It uses the page reader and search, on the person's side.

- **Every match is a lead:** a direction of research, never a fact and never a name for the wallet.
- **Leads stay private** in the person's notes. The person gives each one their own confidence, from 1 to 5, and can change it. Notes already keep evidence; they gain a confidence.
- **The doctrine holds:** what they do, not who they are. A lead says "this handle posted this proposal's discussion", with the link. It never says "this wallet is this person".

### Change over time

The person and the agent agree an interval (a month, a year) and a span. The agent reads the same layer at each point and keeps each reading as a layer with its date.
- **Bounded:** at most 24 points to start, and readings at final blocks are reused, never read twice.
- **The flower** can then show one date, or the change between two. How it looks is LOOK's.

## 3. The first new reader: Moloch v3 (Baal)

**What it reads:** a Baal DAO on Gnosis, Ethereum, Base or Arbitrum, the chains we read today.

**How it recognises one:** by the DAO's own calls, `sharesToken()`, `lootToken()` and `avatar()`, or by its summoner.

**What it gives, per member, as one verified layer:**
- shares (voting) and loot (not voting), from the DAO's two tokens;
- voting power, after delegation;
- proposals sponsored, and votes cast, from the DAO's events;
- **proposals written.** The submission event doesn't name who wrote it, so the reader takes each submission's sender. That's one call per proposal: 246 for RaidGuild. So this measure is optional, it says how many calls it costs, and it stops at a stated cap.

**To confirm before building:** the event layouts, against the DAO's verified source.

## What stays as the first draft said

- **The doctrine:**
  - discovery, not crime;
  - what they do, not who they are;
  - verified, inferred or a lead, always said;
  - coverage is partial;
  - the tools count;
  - small reads first;
  - the person's own resources.
- **Delivery:** unchanged by this revision. The tools run on the person's side only because our server does no reads for visitors (TGT-030), and "the person's side" is wherever their agent runs. The full list of ways to deliver them is in `research.md`.
- **One fix from 9 Nov:** what each tool takes, and what a flower can show, has to be answerable by a command. Then no agent searches the file.

## Choices for Elco

**1. Where layers live.**
- (a) In Petals' database, kept against the author's account.
- (b) Published on NEAR, like flowers today, signed by the author's wallet.
- (c) Private first, published when the author chooses.
- **Lean: (c).** It's what 003-target already says for commentary: private first, public claims later.

**2. Who can add a layer to an address.**
- (a) Anyone, side by side and attributed.
- (b) Only whoever started the investigation.
- **Lean: (a).** Elco's "different people could contribute", and nobody can overwrite anyone.

**3. A lead's confidence.**
- (a) A number from 1 to 5.
- (b) Low, medium or high.
- **Lean: (a).** It's set by the person, never by the agent.

**4. The order of work.**
- **Lean:**
  1. the dataset and adding a layer, with the RaidGuild flower as the test;
  2. the Moloch v3 reader;
  3. going deeper, and change over time;
  4. leads with confidence.

## Done when (once approved)

- **The RaidGuild flower draws** shares as size and proposals written as height, from two layers, each naming its author and how it was made.
- **A second person adds a layer to the same address,** and both people's layers stand.
- **Elco asks "go deeper"** and gets real next steps from what was found. Each one, when taken, adds a layer.
