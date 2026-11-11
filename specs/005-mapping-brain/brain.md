# The brain: one source in the repo, a thin service that routes

The brain is what the agent knows how to do: a short doctrine, a few chapters and the recipes. **The repo is its only source of truth**, improved only by pull requests. A thin **brain service** on our server holds the latest copy of it and routes agents quickly: "which chapter or recipe for this?" (Elco, 9 Nov).

## What it is

A folder in the repo, `brain/`:

- **`doctrine.md`:** about 15 lines, read first, always. It names no file paths. Its words are in `spec.md`.
- **`chapters/<id>.md`:** what to do, in plain words. Each opens with a header: its department, what it's for, how to recognise its case, which tools and shapes it uses, and where it continues. The first chapters:

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
- **`index.json`:** generated from every header. Nobody edits it by hand. Since 12 Nov it's `brain-index/v2`: each entry names its department.
- **Departments (12 Nov; Elco, 11 Nov: "The department's component is important or else it becomes just a list that goes on forever"):** every chapter and recipe is in one of seven, as Elco named them: connecting, gathering, governance, money, investigation, services (#101's slots only), stewardship. The doctrine is in none: it's in every answer. Each department has a hub, `<department>/README.md`: a header (`id`, `kind: department`, `for`, `recognise`) and a "when to use which chapter" table. Routing reaches a hub by its department's name, so a question in a chapter's own words still reaches the chapter first. The services hub lists #101's slots, planned, and holds nothing else. The plan is `research/brain-departments-2026-11-11.md`.

## The brain service

Elco, 9 Nov: "cant that be the repo, and we build a thin API or MCP or whatever that the agents use to get routed quickly semantically like I used in the harness?"

- **What it holds:** the latest brain from the repo's main branch, and the index made from it, stamped with the commit. It's never edited by hand. If it's lost, it's rebuilt from the repo.
- **When it refreshes:** when the repo changes. The service reads the brain folder's git commit at each request, and reads the files again only when that commit has moved; a merge is the change. Today the server serves its own `brain/`, so a deploy is the change; `PETAL_BRAIN_DIR` points it at a read-only copy of `build/` that follows main, once that's mounted. Once the repo is public, GitHub tells the server on each push to main. Nothing runs on a timer.
- **What it answers,** over MCP (on the site's `/mcp`: `brain_route`, `brain_file`, `brain_index`) and plain HTTP (`GET /api/v1/brain`, `/api/v1/brain/route?q=…&answers=…`, `/api/v1/brain/files/:id`):
  - "which for this?", given words, or the chain's answers about an address, returns the best few chapters and recipes, each with its header and why it matched;
  - one file by its id;
  - the index.

  Every answer carries the commit.
- **It fits TGT-030:** it serves Petals' own files, like the map, and reads no chain or web page and calls no model for anyone.
- **It's fast:** the brain is a few dozen files, so the service keeps them in memory.

**Always the latest, even before the repo is public:** every door reads through the service, and the service follows the repo. Each layer an agent makes records the brain commit it was given.

## Routing: three ways, compared honestly

**What the harness actually used, from its code:**
- **Not embeddings.** The harness brain's reader (`src/lib/brain/reader.ts`) counts exact keyword matches against `routing.json`, takes words from the work order's role, phase, label and description, and returns at most 6 documents.
- **On a miss,** its memory map (Lens) made one model call that "picks from existing tags, never invents new ones".
- **The semantic recall Elco remembers is Jarvis's memory,** elsewhere in Saint Elmo (`backend/engine/jarvis/embedder.py`, `memory_index.py`):
  - a small local model, all-MiniLM-L6-v2, quantized, about 22 MB, run with ONNX;
  - vectors kept in SQLite, cosine top-K in memory;
  - word matching when the model isn't there;
  - its reason: "memory recall must be FAST … no network and no tool-call latency".

| Way | How it works | Cost | Speed | Where it's weak |
|---|---|---|---|---|
| **1. The chain's own answer** | The agent's `identify` asks the chain what an address is (calls it answers, the factory that made it) on the person's side. The service matches those answers against the recipes' signals | Nothing on our side | One match in memory, under a millisecond. The chain read is on the person's side, a second or two | Only for addresses. A question in words needs 2 or 3 |
| **2. Words, ranked (BM25) over the headers** | Rank headers by shared words, weighted by rarity. Postgres's full-text (`ts_rank`, with our `petal_search` and unaccent) is close but isn't BM25, and true BM25 needs an extension we said no to. For a few dozen headers, BM25 in the service's own memory is a few lines of code | Nothing | Under a millisecond for this size *(not measured)* | Misses when the words differ: "who controls this treasury" against "owners, admin keys, upgrades" |
| **3. A small embedding model, inside our container** | Jarvis's way: MiniLM in the service, every header embedded at refresh, the question embedded and compared. No outside service, and nobody's credit | A 22 MB model, about 100 MB of memory, no money | Tens of milliseconds a question on the server's processor *(estimated, not measured)* | MiniLM is English-first; a multilingual model is about five times larger. Quality on short questions in this domain is unknown until tested |

**Lean:**
1. **The chain first,** for any address.
2. **For words, 2 and 3 together:** each ranks, the two rankings are combined, and 2 alone serves if the model isn't there, as Jarvis does.
3. **The service returns the best three** with their headers, and **the agent's own model chooses.** That last step is the most semantic of all, and it's on the person's own model.

**Test before trusting it.** A set of real questions from Elco's sessions, each with the chapter it should reach, is run against 2 alone and against 2 with 3. The model stays only if it's right more often.

**Tested, 9 Nov.** Twenty questions in the words people use (`packages/tools/test/brain-service.test.ts`). Words alone (2) put the right chapter first for 17 and in the top three for 18. Both misses had words that sat in the chapter's text but not in its header ("upgrade, pause", "sponsored proposals"), so they went into `where-power-lives`'s header, as the header is what routes. Then: 19 first, 20 in the top three. The model (3) isn't added: words already reach every question, and a miss is fixed in a header, by pull request.

## At each door

| Door | How the agent reaches the brain |
|---|---|
| The terminal file (`petal.mjs`) | `petal brain` asks the service. `identify` sends the chain's answers to it and returns the routes. If the service can't be reached, it uses the copy built into the file, and says its commit and that it's older |
| A skill folder | `SKILL.md` tells the agent to ask the service. The skill folder's copy is only the fallback |
| The tab | The same site's service, same origin |
| Cloud agents (the Claude app, ChatGPT) | The site's `/mcp`. The brain tools read nothing, so they work there today |
| GitHub | The source. For reading, and for pull requests |

## The check

It runs before every merge, and fails if any of these is true:
- the index differs from what the headers generate;
- a chapter or recipe names a tool, a shape or a continuation that doesn't exist;
- a chapter or recipe names no department, or one that isn't among the seven;
- a recipe asks for something outside its bounds;
- the doctrine names a path.

The service builds its index the same way, so what it serves is what the check passed.

## Improving it: only by pull request

Elco, 9 Nov: "only through github for now … teach the AI to submit a PR, and if the user doesn't have github he gets one." There are no suggestions on the site.

1. **The person says it, in the conversation.** For example: "that missed the loot", "keep this way of reading Baal DAOs", or a new framework that just worked.
2. **The agent drafts the change** to a chapter or a recipe, or a new one. It adds what went wrong or what worked, from the conversation.
3. **The agent opens the pull request,** as the `contributing` chapter teaches: fork, branch, commit and open it, with the `gh` command or GitHub's website.
4. **If the person has no GitHub,** the agent helps them make an account. The person signs up themselves; the agent never handles their password.
5. **A maintainer reviews and merges,** Elco first. The check runs, the service follows the merge, and from that moment every agent is given it.

**Nothing changes what the next agent reads until a reviewed merge.** A chapter or a recipe is instructions to every agent, so review is the gate.

## What we carry from the harness brain's history

`research.md` has the detail.

| What happened there | What we do |
|---|---|
| Files on disk, then a separate Supabase project with a seed script and a secret key, then back to Git, with a database index built from it. ADR-0082 calls the middle stage "split … across a filesystem corpus, a separate Supabase project, Harness readers, and Lens synchronization machinery" | **One authority from the start: the repo.** The service is a projection of it, with no seed script or secret, and it's rebuilt from the repo whenever main moves |
| "Database documents … are rebuildable projections or receipts. They never compete with Git" | The service and `index.json` are projections. The check rebuilds and compares. A door's copy is only a fallback, and says so |
| "Drift is repaired from the authority, never from a sibling copy" | The service follows the repo, never another copy |
| Its markdown table and `routing.json` were both kept by hand, and drifted | One source: the headers |
| Its index checks missed uncommitted edits and missing targets | The check covers targets, and merges are the only way in |
| The always-loaded doctrine pointed agents at paths that didn't exist | A short doctrine, with no paths, checked |
| "Feedback must never mutate the … core system DNA immediately" (the Meta-Pass) | Pull requests and review, never live edits |
| No pull-request process anywhere | Defined above, and taught to the agents |

## Not here yet

- **The public repo.** It's Elco's go. Until then, the service follows `build/` main, and pull requests come once it's public.
- **Who else can merge** besides Elco: later.
