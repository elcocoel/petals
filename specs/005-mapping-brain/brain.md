# The brain: versioned, open, with a fast routing index

The brain is what the agent knows how to do: a short doctrine, and one strategy file per kind of system or question. It's plain files in the open-source repo, improved by pull requests and released by version. A small index, generated from the files, routes an agent to the right strategy in one step, at every door.

## What it is

A folder in the repo, `brain/`:
- `doctrine.md`: about 15 lines, read first, always. It names no file paths (`spec.md` has its words).
- `strategies/<id>.md`: one per kind of system or question. Each opens with a header that says:
  - what it's for;
  - how to recognise its case (signals the chain answers);
  - which readers and tools it uses;
  - its status (ready, partial, or no reader yet);
  - which strategies it continues to.
- `index.json`: **generated** from those headers. Nobody edits it by hand.
- `README.md`: how to improve a strategy, for people and their agents.

**The first strategies:**
- start-from-an-address
- going-deeper
- open-source-leads
- over-time
- token-holders
- dao-moloch (v1 and v3)
- delegation
- validators-and-staking
- ve-governance
- relations
- find-the-target

`research.md` keeps the first draft's routes table for these.

## Versions

The brain has its own version, `brain-v1`, `brain-v2` and so on, tagged in the repo. Each of these moves on its own:

| Part | Version |
|---|---|
| The brain | `brain-vN` |
| The tools | `tools/v1` |
| The data protocol | `data/v1` |
| The seam | `seam/v1` |
| The visual protocol | `view/v1` |

A new strategy, or a better one, is a new brain version. No tool or reader has to change unless the strategy needs a new reading.

## The routing index, and why it's fast

`index.json` holds every strategy's header, a hash of each file, the brain version and the commit it was made at. It's a few KB.

**Routing is one tool call, with no model, database or network:**
1. The agent gives `identify` an address or words.
2. `identify` asks the chain what the thing is: contract or account, which calls it answers, which factory made it.
3. It matches those answers against the index's signals, and returns the strategy ids with what it found.
4. The agent reads only those strategy files.

**The check, in `scripts/check.sh`, fails if any of these is true:**
- the index differs from what the headers generate;
- a strategy names a tool, a reader or a continuation that doesn't exist;
- the doctrine names a path;
- a release is stamped from a folder with uncommitted changes.

That last check, and checking that targets exist, are the two the harness brain's index lacked.

## At each door, pinned

Every door carries the brain version it was built with, and the index says which one. An agent uses that version. A newer one exists only once it's released, and the door moves to it at its next build.

| Door | How the agent reaches the brain |
|---|---|
| The terminal file (`petal.mjs`) | Built in. `petal brain` lists the strategies and `petal brain <id>` prints one. Over MCP it's a `brain` tool and a resource per strategy. `identify` returns strategy ids |
| A skill folder | `SKILL.md` with the strategies as its reference files. An agent that reads skills loads a strategy when its description matches, which is the format's own progressive loading |
| The tab | Bundled with the tab's tools |
| The site | Static files at `/brain/v<N>/index.json` and `/brain/v<N>/<id>.md`, cached for good, since a version never changes. Also a `brain` tool on the site's `/mcp`. It reads nothing, so it fits TGT-030, and cloud agents can use it (door F in `research.md`) |
| GitHub | The source. For reading the latest, and for improving it |

## "Improve this strategy"

1. **The person says it, in the conversation.** For example: "that missed the loot", or "keep this way of reading Baal DAOs". Recipes (`data.md`) are improved the same way.
2. **The agent drafts the change** to the strategy file, or a new one. It adds what went wrong or what worked, from the conversation.
3. **It goes in one of two ways:**
   - **(a) A pull request** on the open repo, if the person has GitHub. Their agent opens it.
   - **(b) A suggestion posted to the site,** kept with the author, the strategy and its version. A maintainer turns it into a pull request.
4. **Review:** a maintainer, Elco first, merges it, the check runs, and a tag releases the next brain version. The next build of the file, the skill folder, the tab and the site carries it.

**Nothing changes the brain the next agent reads until a reviewed merge and a release.** A strategy is instructions to every agent, so review is the gate. Feedback never changes the brain at once.

## What we carry from the harness brain's history

`research.md` has the detail.

| What happened there | What we do |
|---|---|
| Files on disk, then a separate Supabase project with a seed script and a secret key, then back to Git, with a database index built from it. ADR-0082 calls the middle stage "split … across a filesystem corpus, a separate Supabase project, Harness readers, and Lens synchronization machinery" | **One authority from the start: the files in the repo.** The index is generated, with no database or seed, and it ships with each door |
| "Database documents … are rebuildable projections or receipts. They never compete with Git" | `index.json` is a projection. The check rebuilds and compares it |
| "Drift is repaired from the authority, never from a sibling copy" | A door's copy is replaced at its next build, never edited |
| Its markdown table and `routing.json` were both kept by hand, and drifted | One source: the strategy headers |
| Its index checks missed uncommitted edits and missing targets | Both are in our check |
| The always-loaded doctrine pointed agents at paths that didn't exist | A short doctrine, with no paths, checked |
| "Feedback must never mutate the … core system DNA immediately" (the Meta-Pass) | Pull requests and releases, never live edits |
| No tags or pull-request process anywhere | Both, defined above |

## Not here yet

- **The repo isn't public.** `build/` has no remote, and making it public is Elco's go.
- **Who else can merge** besides Elco: later.
