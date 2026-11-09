# Research behind the mapping-brain proposal

SYSTEMS, 9 Nov. These are the facts `spec.md` rests on, with paths and sources, so RESEARCH can check them independently. Paths are relative to `build/` unless they start with `~` or `/`. The first draft of `spec.md` is in git (`0065189`); its routes, tool set and doors are kept at the end of this file.

## Elco's live session, 9 Nov: RaidGuild (Moloch v3, Gnosis)

From `~/.claude/projects/-Users-elco-Desktop/aff77786-bf63-45f6-bf89-19c524df4274.jsonl`: Claude Code, on the live site, with the terminal file.

- **Setup:** the agent fetched `skill.md` and the file and ran `petal.mjs` as the skill says. It then ran 125 shell commands in the whole session, many of them searches inside the 5.8 MB file:
  - `grep 'logs: obj'` to learn `read_chain`'s log arguments;
  - `grep 'm:<'` to learn whether a flower can take a new measure;
  - `grep POSTED_SNAPSHOTS_PER_DAY` to learn how posting works.
- **The DAO:** `look_up "RaidGuild"` found two names in DAO lists, and no stored read. There's no Moloch v3 reader, so the agent drew the shares token with `erc20-holders` (158 holders). Elco said there's no delegation in RaidGuild, and it was redrawn.
- **Proposals per wallet** (Elco: "use a little bit of basic osint"):
  - `read_chain --logs` for `SubmitProposal(uint256,bytes32,uint256,bytes,uint256,uint256,bool,uint256,string)` on the DAO at `0xf02fd4286917270cb94fbc13a0f4e1ed76f7e986`, paged;
  - then a script of the agent's own reading each submission's transaction sender, 246 of them;
  - then the count per holder, posted as a note.
- **The refusal:** "show it on the petal". `render` with height `m:proposals` answered `bad_input`: "The snapshot has no measure \"proposals\". Measures in this snapshot: token_balance." The agent's recap: "Petal can't put proposal counts on the flower: its snapshot of RaidGuild holds only shares."

## The harness brain (`~/Desktop/Saint Elmo Systems/backend/cloud/apps/harness/harness-brain`)

It's 101 files, about 9,000 lines, read on 9 Nov.

### Layout

- `framework/` holds flat department folders: `research/`, `intelligence/`, `design-dna/`, `copy-dna/`, `building/`, `publishing/`, `evaluation/`, `routing/`, `personas/` and others.
- The doctrine files sit loose in it: `core-doctrine.md`, `constitutional-doctrines.md`, `gate-of-inquiry.md`, and `master-routing.md` next to them.
- The seven domains aren't folders. They're a table in `README.md` that points to departments.
- `types/policy/routing.json` is the machine routing.

### Routing

- **The table:** `master-routing.md` §2 has 22 rows of `Task type | Load these | Also load`. It says: "This table is for HUMAN navigation. Agents consume context via `routing.json` … Do not inject this table into agent prompts."
- **`routing.json`:** 13 entries, each `{taskType, keywords[], domains[], documents[]}`.
- **They've drifted.** Both are hand-kept. All 16 of the JSON's document paths resolve, but all 7 markdown targets that were checked are missing files.
- **The reader:** in the parent app, `src/lib/brain/reader.ts` counts exact keyword matches, ranks the entries, removes duplicates and caps at 6 documents. It never reads `domains`.

### Doctrine and delivery

- **The doctrine:** `core-doctrine.md` (48 lines) is loaded into every prompt, by the category `core`. Its own audit marks it P0: "Loaded into EVERY prompt. Will actively misdirect agents to non-existent filesystem paths."
- **Read-only:** "Agents consume this; they never write to it." The database enforces it: anonymous readers can read, and only seeding with a secret key writes.
- **Delivery, twice:** injected into the system prompt (core doctrine, then the matched documents), and by an MCP tool, `query_brain`. Every read is logged with a receipt. If loading fails, the agent works with an empty governance block.
- **Adding a doc:** a new `.md` file, a `routing.json` entry and a reseed. No code.
- **Not there:**
  - a schema for `routing.json`;
  - an automated check that the table and the files agree;
  - version history beyond a "Last updated" line and a stored checksum.

### Lessons it states

- "Brain = patterns only." Specific values go in modules marked SWAPPABLE.
- "Translate, never delete": a dead doc gets a deprecation header and is left out of loading.
- Don't lock the list of domains early: its README's 7 and the JSON's labels were never reconciled.

## Petals today

### Tools

There are 28, in `packages/tools/src/registry.ts`. Nine carry `onTheirMachine: true`: get_snapshot, prepare_publish, publish_flower, quote_payment, look_up, find_target, read_chain, read_page and search.

- **A public server refuses those nine** (`packages/tools/src/define.ts:175`).
- **It leaves them out of MCP's list** (`packages/tools/src/mcp/server.ts:84`).
- **What they read from:**
  - NEAR RPC pool: `packages/inputs/src/rpc/pool.ts`;
  - EVM RPCs and Blockscout: `packages/inputs/src/evm/chains.ts`, on Ethereum, Base, Arbitrum and Gnosis;
  - Sourcify, in `read_chain`;
  - GeckoTerminal, Jupiter and Snapshot's GraphQL, in `find_target`;
  - DuckDuckGo Lite, in `search`;
  - the shared map (FastData KV).

### Readers

The readers are `packages/inputs/src/modules/`, registered in `packages/inputs/src/registry.ts`, with the interface `InputModule { descriptor, resolveAt, fetch, keyFor? }` at `packages/inputs/src/index.ts:98`.

- **There are seven real readers.** The other five files are helpers: `at`, `chain`, `plain`, `stored`, and `venear`, the veNEAR power math.
- **Adding one touches:**
  - the module;
  - `registry.ts`;
  - the package exports;
  - `find_target`'s "which module draws it", in `packages/tools/src/tools/find.ts`, about lines 600 to 660;
  - sometimes `evm/identify.ts` and `evm/chains.ts`;
  - `scripts/pull-module.ts` and the fixtures, for stored data;
  - `specs/001-petal-core/contracts/tools.md`.

### The skill

- **The file:** `skill/petal/SKILL.md`, 218 lines, 18,124 bytes.
- **The shared rules** are copied from `packages/agent/src/prompt.md` (99 lines) by `skill/build.ts`, and `--check` keeps the two identical.
- **How it's served:** `GET /skill.md` from `packages/agent/src/serve.ts`. `hostedSkill()` in `packages/agent/src/hosted.ts:178` rewrites five sections for the hosted site.

### Delivery

- **petal.mjs**
  - **Build:** `apps/cli/scripts/bundle.ts`, with esbuild.
  - **Contents:** the CLI, the tools and the stored reads, as base64. It holds 25 tools: the two publish tools and the quote are left out (`apps/cli/src/site.ts:49`).
  - **Served at:** `GET /petal.mjs` (`serve.ts:107`).
  - **Run:** `curl … -o ~/.petals/petal.mjs`, then `node ~/.petals/petal.mjs start --client … --question …` (`hosted.ts:25-26, 72`). MCP over stdio is `node petal.mjs mcp`.
  - **Size:** 5,811,957 bytes on `con/fast`, down from 7.9 MB.
- **`/connect`:** `apps/web/app/(site)/connect/page.tsx`, with its doors in `apps/web/lib/doors.ts`. It offers a prompt for Claude Code, Codex and Hermes, and marks the Claude app and ChatGPT as unable to run the tools.
- **The tab spike:** `research/spikes/tab-zero/RESULTS.md` (9 Nov), from an untracked file in `build.fe-tab/packages/tools/zz-tab/entry.ts`. The branch `m-face/fe-tab` has no commits of its own.
- **Setup:** Elco said "three minutes" on 9 Nov (the `106c049` message, and `apps/cli/src/main.ts:358`). After `con/fast`, the page opened "15.5 s after the paste", measured in Claude Code with Sonnet against a local server. META's figure of about 160 s isn't written anywhere we found.

## Delivery: the outside world, as of 9 Nov 2026

These come from web searches, mostly secondary sources. They're marked where sources disagree.

### The Claude app

Custom connectors over remote MCP are available on Free, Pro, Max, Team and Enterprise, and Free is limited to one. Claude connects to the server from Anthropic's cloud, not from the person's device.

- [Get started with custom connectors using remote MCP](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)

### ChatGPT

Remote MCP goes through Developer Mode (Settings, Apps & Connectors, Advanced). Servers must be remote; local stdio isn't accepted.

- **Plans:** sources disagree. One lists Plus, Pro, Business, Enterprise and Edu. Another says that by mid-2026 full access is only on Business, Enterprise and Edu, with Pro limited to read and fetch. Both say Free is excluded.
- **Reliability:** there are reports of connectors vanishing and of tool calls becoming less reliable.

Sources:
- [apidog](https://apidog.com/blog/chatgpt-mcp-support)
- [designrevision](https://designrevision.com/blog/add-mcp-server-to-chatgpt)
- [hjarni](https://hjarni.com/blog/how-to-use-mcp-with-chatgpt)
- [mcp.directory](https://mcp.directory/blog/chatgpt-developer-mode-full-access-to-mcp-connectors)

**To check on OpenAI's own help pages before relying on it.**

### The skill format (SKILL.md)

- It's an open standard published at agentskills.io in December 2025.
- Codex, Gemini CLI, Cursor and Claude Code read it, and the count of supporting tools is given as anywhere from 25 to over 40.
- Only `name` and `description` are required. A skill loads when its description matches the task.
- Discovery paths differ by tool, and the sources conflict on them.

Sources:
- [noqta, adoption](https://www.noqta.tn/en/news/skill-md-open-standard-30-ai-coding-tools-adoption-2026)
- [codex.danielvaughan, portability](https://codex.danielvaughan.com/2026/05/05/agent-skills-open-standard-portable-skills-codex-cli-cross-agent/)
- [mcp.directory, cross-agent](https://mcp.directory/blog/cross-agent-skills-cursor-codex-cline-antigravity-gemini-mastra-portability)

**To check against agentskills.io's own client list.**

## Reading what an account holds or did, keyless (9 Nov, from `design/wallet-discovery.md`)

| Source | What it gave | Result |
|---|---|---|
| FastNEAR `api.fastnear.com/v1/account/<id>/full` | `root.near`'s tokens, staking pools and NFTs, in one call | Worked: 209 tokens, 2 pools, 103 NFTs |
| Ethplorer `getAddressInfo`, `apiKey=freekey` | An Ethereum address's tokens, with holder counts | Worked: up to 100 tokens. Spam airdrops come in too |
| Snapshot `hub.snapshot.org/graphql` | The votes an address cast | Worked, keyless |
| Blockscout `/api/v2/addresses/<a>/tokens` | Tokens on EVM chains | Didn't work: Ethereum timed out twice, and Base answered with a Cloudflare challenge |

## Kept from the first draft (0065189)

### The routes

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

