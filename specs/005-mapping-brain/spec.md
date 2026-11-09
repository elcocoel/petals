# Proposal: the mapping brain, and how the tools reach any agent

**Created**: 2026-11-09, by SYSTEMS
**Status**: Proposal. Nothing is built. RESEARCH critiques it next, on its own, and then Elco chooses, one question at a time (section 4).
**Input**: Elco, 9 Nov, on the W2 wallet design (`design/wallet-discovery.md`):

> why does it need to be a tool on the person's computer? the wallet here is not an app - it's the account, it could be an address for a contract or anything on chain.

> We want the setup to be faster, yes - we should second guess every choice at this point, what tools we have, how we are delivering them and what affects this. not sure we are using the best way to deliver the tools and make it modular, my dream here is that there would be several mapping strategies that the agent would know how to do - kinda similar to how I build the brain for the harness / brush app in the past.

The facts behind section 1, with paths, and the sources for section 3 are in `research.md`, next to this file.

---

## The short answer to Elco's question

**The tools run on the person's side only because our server does no reads for visitors.** That's TGT-030: "The tools and the skill run on the person's side. The server does no chain reads, web reads, searches or model calls for visitors." It was chosen on 8 Nov so that nobody uses Elco's connection or limits (TGT-031), and so that the server has little to attack (TGT-041).

**"The person's side" is wherever their agent runs: a terminal, or a browser tab.** It isn't a desktop app, and nothing about it is tied to a wallet. The wallet is the account, and the reading works for any address, a contract or a person's, on any chain we read. Where it runs is a delivery choice, separate from the tool. Section 3 lays out every place it could run, including our server if Elco wants to change TGT-030.

---

## 1. What we have today, honestly

### The tools: 28

All are in `packages/tools/src/registry.ts`. The 9 marked ★ need the person's side, so the public server refuses them. That's why the server's `/mcp` lists 19.

| Group | Tools | What they do |
|---|---|---|
| Finding | look_up ★, find_target ★, read_chain ★, read_page ★, search ★ | From a word or an address to what it is, and which reader could draw it. Chain view calls and logs, a public page, a web search |
| Gathering | list_networks, get_network, get_snapshot ★, describe_snapshot | What Petals can read, and one read at one moment, kept with its hash |
| Measuring and drawing | compute_figures, propose_spec, validate_spec, render_flower | The tools count (shares, Nakamoto, HHI, Gini) and draw. The agent only quotes |
| Relations | account_groups, shared_accounts, related_groups, relations_overview, power_path | Where an account appears across stored groups, overlaps, paths. Over stored reads only |
| The page | list_explorations, get_exploration, start_exploration, save_step, add_note | The conversation's page on the site |
| The map | list_flowers, get_flower, prepare_publish ★, publish_flower ★ | Published flowers, checked, and publishing one |
| Paying | quote_payment ★ | A dry NEAR Intents quote |

### The readers (data modules): 7

| Reader | Reads | Live? |
|---|---|---|
| near-validators | NEAR validators, pools and delegators | Stored only: one read from 3 Nov. A fresh one takes about 963 calls and 24 minutes |
| near-house-of-stake | veNEAR holders, voting power, delegations | Live, about 10 s |
| moloch-v1 | A Moloch DAO's members and shares | Live, about 5 s |
| erc20-votes | An ERC20Votes token's delegates | Live, about 30 s. It stops at 60 log calls, so UNI fails |
| erc20-holders | Any ERC-20's holders, over a window of days or the full history | Live, about 8 s |
| solana-spl-holders | Holders of a classic SPL token | Live. Fails in a browser tab (403) |
| beanstalk | One stored data set, April 2022 | Stored only |

The EVM readers reach four chains: Ethereum, Base, Arbitrum and Gnosis. There's no reader for NEAR tokens, NEAR DAOs (Sputnik), Snapshot votes, multisigs, admin keys or Bitcoin.

**Adding a reader touches six or more places in code:** the module, the registry, the package exports, `find_target`'s "which module draws it", sometimes contract detection and the chain list, plus stored data and the docs. There's no written how-to.

### The skill

There's one file, `skill/petal/SKILL.md`: 218 lines and 18 KB, with one flow, from talking first to the six steps and the answer. The site's own agent has a shorter copy of the shared rules (`packages/agent/src/prompt.md`), kept identical by a check.

**There's no strategy per kind of system.** What Petals knows about mapping a DAO, a token or validators is split across three places:
- the skill's prose ("Choosing", "Finding the target");
- `find_target`'s code, which picks the reader and its parameters;
- each reader's own description.

### How the tools reach an agent

- **One file, `petal.mjs`.** It holds the tools, the CLI and Petals' stored reads, in one file the site serves. It went from 7.9 to 5.8 MB on 9 Nov (CONNECTORS, `con/fast`). The person's agent downloads it with `curl`, runs it with Node 22.13 or newer, and keeps its state in `~/.petals`. It serves MCP over stdio if the agent wants it kept (`claude mcp add petals -- node ~/.petals/petal.mjs mcp`).
- **Who can use it:** `/connect` offers a prompt for Claude Code, Codex and Hermes. It marks the Claude app and ChatGPT as unable to run the tools, because they have no terminal.
- **The server's `/mcp`:** it answers one call per request, and in public mode it lists only the 19 tools that need no reads.
- **In a browser tab: a spike, not on any branch.** The real tools, bundled for the browser at 1.3 MB, run 11 tools in the page (`research/spikes/tab-zero/RESULTS.md`, 9 Nov).
  - **Model:** OpenRouter, NEAR AI, Gemini and Anthropic answered from the tab. OpenAI is blocked by CORS. The run used a scripted model, not a real one.
  - **Worked:** Moloch in 2 s, House of Stake in 6 s, a Base token's holders over a day in 12 s.
  - **Failed:** Solana (403), UNI votes (too many log calls), reading pages and web search.

### What made setup slow, and what's fixed

Elco, 9 Nov: "setup took three minutes."

**`con/fast` (merged as `092f41d`) changed four things:**
- one command starts the page, opens it and posts the first note;
- notes take plain text;
- the skill gives the two exact commands;
- the skill gives the file's hash, so the agent checks it instead of reading the 5.8 MB file to see what it is.

**One measured run since then:** the page opened 15.5 s after the paste. That was Claude Code with Sonnet, against a local server. Nobody has measured a whole first flower on the live site since.

**What still costs time on every new machine:** downloading the file, needing Node, the agent deciding whether to trust a file from a website, and the agent reading 218 lines of skill before it starts.

### What's weak

1. **How to map a kind of system isn't in one place.** It lives in code and in one long skill, so a new system means code in six places.
2. **28 tools is a lot to choose from, and some overlap.**
   - `look_up`, `find_target` and `read_chain` each answer part of "what is this?".
   - Five relations tools answer one question asked five ways.
3. **Agents in the cloud can't use Petals at all.** That's the Claude app and ChatGPT, where most people are.
4. **"Starting from an address" has no reader for what an account holds or did.** So W2's "do you want to map this" has nothing to stand on (`design/wallet-discovery.md`).

---

## 2. The mapping brain

### What it is

A folder of plain files the agent reads, kept in the repo and read-only to agents. It has three kinds of files:

- **The doctrine:** one short file, read before anything else.
- **The routes:** what a thing is, then which strategies apply and which tools they use.
- **The strategies:** one file per kind of system or question. Each says how that kind of power works, how to recognise it, the steps and tools, what's verified and what's inferred, and where to go next.

The code underneath stays generic: tools that read, gather, measure and draw. **A new strategy is a new file** whenever the existing readers can already read that system. It needs code only when it needs a new kind of reading, a new reader.

### What we take from the harness brain, and what we change

Read on 9 Nov: `~/Desktop/Saint Elmo Systems/backend/cloud/apps/harness/harness-brain`. The detail is in `research.md`.

| The harness brain | Petals' brain |
|---|---|
| A master table (task type, then load these docs) for people, and `routing.json` for machines, both kept by hand. They drifted: every markdown target checked was a missing file | **One source.** Each strategy file names, at its top, what it's for and which tools and readers it uses. The routes table is made from those headers, and the check fails if any route points at a missing file or an unknown tool |
| A core doctrine loaded into every prompt. Its own audit found it sending agents to paths that don't exist | **Short, and checked.** About 15 lines, with no file paths in it |
| Routing by counting keywords in the task, at most 6 docs | **Routing by asking the chain.** "What is this address?" is answered by a tool (contract or account, which standard it answers, which known factory made it), then the table. Keywords only for questions with no address |
| "Patterns only, specific values in swappable modules" | The same. A strategy says how a DAO's power works; the readers hold the addresses, ABIs and limits |
| Delivered twice: injected into the prompt, and by a `query_brain` tool, with each read logged | The same two ways, and in the skill format as well (section 3). No logging: nothing of the person's is kept |

### The doctrine (a first draft)

- **Discovery, not detection.** We're showing how power is arranged: who holds, who decides, who can change the rules. We're not hunting crime.
- **What they do, not who they are.** Say "this account is among the stakers of X". Never "this account is so-and-so". The same words are used for your own wallet and for anyone else's.
- **Verified, inferred, or claimed, always said.**
  - Verified is read from the chain at a block, with the read's hash.
  - Inferred is a step beyond the read: the same address on another chain, or a pattern.
  - Claimed is someone's word.
- **Coverage is partial.** Not being in a group proves nothing.
- **The tools count; the agent quotes.**
- **Small reads first.** A week before a history, and the bounds are said.
- **The person's resources only.** Their agent, their connection, their key.
- **The unmapped is an invitation.** "There's no map of this yet: do you want to map it?" It's never a dead end, and never a finding.

### The routes (a first draft)

First, **what is it?** One tool answers, by asking the chain.

| It is | Strategies | Tools and readers today |
|---|---|---|
| Any address or account, nothing known yet | **start-from-an-address**: what it is, where it already sits on the map, what it holds and did that isn't mapped | identify, account_groups; *no reader yet for what it holds or did* |
| A token (ERC-20, SPL, NEP-141) | **token-holders**: who holds it, how concentrated | erc20-holders, solana-spl-holders; *no NEAR token reader* |
| A token with voting (ERC20Votes) | **delegation**: who holds the votes, and who they gave them to | erc20-votes |
| A Moloch DAO | **dao-moloch**: members, shares, who can rage-quit | moloch-v1 |
| A Governor DAO | **dao-governor**: proposal power, quorum, delegates | erc20-votes; *no reader for the Governor's own rules* |
| A Sputnik or Astro DAO (NEAR) | **dao-sputnik**: roles, policy, members | *no reader yet* |
| A Snapshot space or proposal | **snapshot-voters**: who voted, how much weight | *no reader yet*; `find_target` already searches Snapshot |
| A NEAR validator, pool or delegator | **validators-and-staking**: stake, concentration, backers | near-validators (stored only) |
| House of Stake, veNEAR | **ve-governance**: locked power, delegations | near-house-of-stake |
| A multisig (Safe) or a contract's admin | **keys-and-admins**: who can sign, who can upgrade or pause | read_chain view calls; *no reader that makes a group* |
| Two groups, or "how are these connected?" | **relations**: overlaps, shared accounts, paths | the five relations tools |
| A question with no address ("who runs NEAR's governance?") | **find-the-target**: from words to candidates, then one of the above | find_target, search, read_page |

Each strategy ends with **continuations**, the routes it offers next. The token holders' largest holder opens start-from-an-address. A DAO's members open relations with other DAOs. The "force map" of connected universes (W9) is these continuations followed across groups.

### A strategy file

```markdown
---
id: dao-moloch
for: a Moloch v1 or v2 DAO
recognise: summon/submitProposal/ragequit in its ABI, or a known Moloch factory
readers: [moloch-v1]
tools: [identify, gather, measure, draw]
status: ready        # ready | partial | no reader yet
---
## How power works here
## Recognise it
## Steps                 (each tool call, its bounds, what it costs)
## What the flower compares
## Verified and inferred
## Pitfalls
## Continuations         (which strategies to offer next, and why)
```

It runs to about 40 to 80 lines, in plain words for the agent.

### Files and code

- **Files the agent reads:**
  - the doctrine, the strategies, the routes made from them;
  - the words for the answer: today's "talk first", "the yes" and "the answer" move out of the long skill into the doctrine and the strategies.
- **Code that runs:**
  - the generic tools;
  - the readers;
  - the check that the routes, files and tools agree.
- **One move between them:** `find_target`'s "which reader draws this" moves out of code into the strategies' headers. The code then reads those headers, so it's said in one place.

### Readers: code, or recipes

Most readers repeat a few shapes:
- replay a contract's events into balances (holders, Moloch shares);
- a list of view calls (House of Stake);
- an indexer's list (Solana).

A simple reader could itself be a file, a recipe naming the contract, the events and how they add up. That would make even some new readers new files. It's an option for later (section 4, choice 6), once the first strategies show which shapes repeat.

---

## 3. Delivery

### The smallest set of generic tools

With strategies carrying the specifics, the tools can be few and plain. Here's a possible set of 10, with today's tools inside each:

| Tool | Today's tools inside it |
|---|---|
| **brain**: the doctrine, a route, a strategy | new |
| **identify**: what is this word or address, and which strategies apply | look_up, find_target, read_chain's first look |
| **read**: bounded raw reads (view calls, logs, an account's holdings from a public indexer, a public page, a web search) | read_chain, read_page, search; *the holdings read is new* |
| **gather**: run a reader, keep the read with its hash | get_snapshot, list_networks, get_network |
| **measure**: what's in a read, and its figures | describe_snapshot, compute_figures |
| **relate**: where an account sits, overlaps, paths | the five relations tools |
| **draw**: choose and check a recipe, draw the flower | propose_spec, validate_spec, render_flower |
| **page**: the conversation's page | the five exploration tools |
| **map**: published flowers, and publishing | list_flowers, get_flower, prepare_publish, publish_flower |
| **quote**: a dry payment quote | quote_payment |

**Trade-off:** fewer tools means less for the model to choose from and less text in every prompt. But each tool takes a `mode`, which makes its description longer. It also changes the contract every door, test and transcript depends on. Old names could keep working for one version.

### Every way to give the tools to an agent

| Door | Who it reaches | Where the reads run | Setup | Trade-offs |
|---|---|---|---|---|
| **A. The one file, in a terminal** (today) | Claude Code, Codex, Hermes, Gemini CLI, Cursor | The person's machine | A paste. 15.5 s to the page, measured once, locally | Needs Node and a 5.8 MB download. The agent has to trust a file from a website. People without a terminal agent are left out |
| **B. An npm package** (`npx petals`) | The same agents | The person's machine | One command, cached and versioned | Publishing on npm (free, public), and keeping versions. Agents trust npm more than a raw file. Same reach as A |
| **C. A skill folder** (the SKILL.md format) | Agents that read skills: Claude Code, Codex, Gemini CLI, Cursor, and more reported | The person's machine, through A or B | Installed once. The brain then loads by itself, strategy by strategy | The brain fits this format naturally. The claude.ai app also takes uploaded skills, but whether its sandbox can reach chains is *unverified* |
| **D. In the tab** (spike) | Anyone with a browser and a model key (OpenRouter, NEAR AI, Gemini, Anthropic) | The person's browser | Nothing to install, just a key in the page | Some sources refuse a browser (Solana, OpenAI's API). No page reading or web search. A key in the tab. 11 of the tools today |
| **E. Our server, as a remote MCP connector** | The Claude app (every plan, one connector on Free) and ChatGPT (Developer Mode, paid plans) | **Our server** | Paste one address | The only way to reach cloud agents with reads. **It changes TGT-030 and TGT-031:** our connection and our providers' limits serve everyone, and abuse needs rate limits. ChatGPT's plan rules and reliability vary, by reports |
| **F. Our server, map and brain only** | The same cloud agents | No new reads: Petals' own stored data | Paste one address | Fits TGT-030 as it stands. A cloud agent can read the brain and the map, and see where an account already sits. It can't make a new flower |
| **G. The person's own server** | Anyone who can host one | Their server | Deploying a server | Fits TGT-030. Too technical for most people |

**What doesn't change across doors:** the brain is the same files everywhere. It's built into the file (A, B), installed as the skill (C), bundled in the tab (D), and served by the site (E, F).

---

## 4. The choices for Elco

One at a time, each with options and a lean.

**1. Where knowledge of a kind of system lives.**
- (a) As today: the skill and `find_target`'s code.
- (b) In strategy files, and the code reads their headers.
- (c) In strategy files, with the code left as it is.
- **Lean: (b).** It's said once, and a new strategy is a new file.

**2. How the agent gets the brain.**
- (a) All of it in the prompt.
- (b) The doctrine always, and strategies through the `brain` tool, by route.
- (c) The skill format, which loads by description.
- **Lean: (b), and shaped as (c) too,** so agents that read skills load it natively and every other door gets it through the tool.

**3. The tool set.**
- (a) Keep the 28.
- (b) About 10 generic tools, as in section 3.
- (c) Keep the 28 now, and decide after testing shows which ones agents use.
- **Lean: (b), as the step after the brain.** The strategies show which primitives they need, and this is one change at a time.

**4. Agents in the cloud (the Claude app, ChatGPT).**
- (a) Not yet.
- (b) Door F: the brain and the map, with no reads.
- (c) Door E: our server reads public data for them, which changes TGT-030 and TGT-031.
- **Lean: (b) now.** It's within what Elco set on 8 Nov, and it shows whether people come through cloud agents before we spend anything. (c) is Elco's call.

**5. The person's default door: the terminal file or the tab.**
This is W10, with its options in CONNECTORS' `design/connectors.md`, 1H. **The brain is the same in both,** so this proposal doesn't need it decided first.

**6. Readers as code, or as recipes.**
- (a) Code per reader, as today.
- (b) A recipe file for the simple shapes, and code for the rest.
- **Lean: (b), later,** after the first strategies show which shapes repeat.

**7. The first strategies to write.**
- **Lean: the four with readers already:** start-from-an-address (what it is, and where it sits on the map), token-holders, dao-moloch and delegation, and validators-and-staking with ve-governance.
- **Next, the ones that need a reader:** what an account holds or did (FastNEAR and Ethplorer answered keyless on 9 Nov), Snapshot voters, Sputnik DAOs, multisigs and admins, NEAR tokens.

---

## Done when (once approved)

- **A new strategy for a system the readers cover is one new file.** The check passes, and an agent finds it by its route with no other change.
- **Given only an address, an agent follows a route to a flower,** or to an honest "no reader for this yet: do you want to map it?".
- **The same brain reaches every door Elco opens.**

## Not decided here

- **Which door is the default:** W10.
- **Whether our server reads for visitors:** TGT-030, Elco's.
- **How many strategies before the hackathon:** none of this has a date.
