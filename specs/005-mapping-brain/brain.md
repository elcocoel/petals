# The brain: open, always the latest, with a fast routing index

The brain is what the agent knows how to do: a short doctrine, a few chapters and the recipes. It's plain files in the open-source repo on GitHub, improved only by pull requests. Every agent reads the latest from GitHub each time (Elco, 9 Nov). A small index, generated from the files, routes an agent to the right chapter or recipe in one step.

## What it is

A folder in the repo, `brain/`:

- **`doctrine.md`:** about 15 lines, read first, always. It names no file paths. Its words are in `spec.md`.
- **`chapters/<id>.md`:** what to do, in plain words. Each opens with a header: what it's for, how to recognise its case, which tools and shapes it uses, and where it continues. The first chapters:

| Chapter | What it teaches |
|---|---|
| **start-from-an-address** | What this address is (a person's account, a contract, a DAO, a token), and where it already sits on the map |
| **where-power-lives** | In any system, who holds, who votes, who can move the money, who can change the rules (owners, admin keys, upgrades, multisigs), and how membership is defined. The seven reader shapes (`data.md`), and which question each answers |
| **a-new-system** | How to figure out a system Petals hasn't seen: read its contract's interface and verified source, find the events and calls that hold power, match them to the shapes, write a recipe, test it small, keep the layer, and open a pull request with the recipe if it's useful to others |
| **going-deeper** | After every answer, offer the next layer down from what was found |
| **over-time** | An interval and a span agreed with the person, read as dated layers |
| **open-source-leads** | Public traces as directions only: private, never a name for a wallet |
| **contributing** | How to open a pull request for a chapter or a recipe, and how to help a person make a GitHub account if they have none |

There's no chapter or reader per DAO type (Elco, 9 Nov: "let's not default to a one module per DAO type"). A framework is a recipe, and `where-power-lives` is the chapter.

- **`recipes/<framework>.md`:** one per framework or contract type, as `data.md` defines them. Moloch v3 comes first. A recipe's header says how to recognise its contracts, so the index routes to it directly.
- **`index.json`:** generated from every header. Nobody edits it by hand.

## Always the latest

At the start of each session, the agent reads `brain/index.json` from the repo's main branch on GitHub. It's a few KB, and a public file needs no key. The agent then reads only the chapters and recipes the index points it to. This is a read on the person's side, by their agent (TGT-030).

- **What the record keeps:** every layer an agent makes says which brain commit it read, in its `how`. Anyone can see what the agent knew when it made it.
- **If GitHub can't be reached,** the agent says so. It may use the copy that came with its door (the file, the skill folder, the tab) and say how old it is. It never treats that copy as the latest.
- **Gate: this needs the repo public on GitHub.** `build/` has no remote yet, and making it public is Elco's go.

## The routing index, and why it's fast

Routing is one tool call, with no model or database:
1. The agent gives `identify` an address or words.
2. `identify` asks the chain what the thing is: contract or account, which calls it answers, which factory made it.
3. It matches those answers against the index's signals.
4. It returns the matching chapters and recipes with what it found.

If no recipe matches, the route is `a-new-system`.

The check runs before every merge, and fails if any of these is true:
- the index differs from what the headers generate;
- a chapter or recipe names a tool, a shape or a continuation that doesn't exist;
- a recipe asks for something outside its bounds;
- the doctrine names a path.

## Improving it: only by pull request

Elco, 9 Nov: "only through github for now … teach the AI to submit a PR, and if the user doesn't have github he gets one." There are no suggestions on the site.

1. **The person says it, in the conversation.** For example: "that missed the loot", "keep this way of reading Baal DAOs", or a new framework that just worked.
2. **The agent drafts the change** to a chapter or a recipe, or a new one. It adds what went wrong or what worked, from the conversation.
3. **The agent opens the pull request,** as the `contributing` chapter teaches: fork, branch, commit and open it, with the `gh` command or GitHub's website.
4. **If the person has no GitHub,** the agent helps them make an account. The person signs up themselves; the agent never handles their password.
5. **A maintainer reviews and merges,** Elco first. The check runs, and from that moment every agent reads it, because every agent reads the latest.

**Nothing changes what the next agent reads until a reviewed merge.** A chapter or a recipe is instructions to every agent, so review is the gate.

## What we carry from the harness brain's history

`research.md` has the detail.

| What happened there | What we do |
|---|---|
| Files on disk, then a separate Supabase project with a seed script and a secret key, then back to Git, with a database index built from it. ADR-0082 calls the middle stage "split … across a filesystem corpus, a separate Supabase project, Harness readers, and Lens synchronization machinery" | **One authority from the start: the files on GitHub.** The index is generated, with no database or seed, and every agent reads it from there |
| "Database documents … are rebuildable projections or receipts. They never compete with Git" | `index.json` is a projection. The check rebuilds and compares it. A door's copy is only a fallback, and says so |
| "Drift is repaired from the authority, never from a sibling copy" | Agents read the authority itself |
| Its markdown table and `routing.json` were both kept by hand, and drifted | One source: the headers |
| Its index checks missed uncommitted edits and missing targets | The check covers targets, and merges are the only way in |
| The always-loaded doctrine pointed agents at paths that didn't exist | A short doctrine, with no paths, checked |
| "Feedback must never mutate the … core system DNA immediately" (the Meta-Pass) | Pull requests and review, never live edits |
| No pull-request process anywhere | Defined above, and taught to the agents |

## Not here yet

- **The public repo.** It's Elco's go.
- **Who else can merge** besides Elco: later.
