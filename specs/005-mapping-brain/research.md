# Research behind the mapping-brain proposal

SYSTEMS, 9 Nov. These are the facts `spec.md` rests on, with paths and sources, so RESEARCH can check them independently. Paths are relative to `build/` unless they start with `~` or `/`.

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
