# Feature Specification: The system behind the app

**Created**: 2026-11-05
**Status**: Draft. A map, not a final definition: it names the shape and the seams, and `open-questions.md` lists what's undecided.
**Input**: Elco: "connecting agents, accounts, login in with wallet, the user's own workspace and how they come back to the work they were doing, where it's saved and its tradeoffs, serverless or server, db or not."

This spec covers what's behind the app. It defines data, rules and contracts, and no screens. Surfaces are designed separately, and any page needed to test this stays out of the product until then.

Builds on `specs/001-petal-core/`. Amends its FR-030 and its assumption that Petal stores no private user data.

## Principles

1. **Facts first, everything else rebuildable.** The past doesn't change, so facts live as content-addressed files. Any database or index can be deleted and regenerated from them, except what only a person can provide.
2. **Everything is a claim, and policy decides what shows.** No shared truth to maintain. People and tools add attributed claims, and a reader's policy decides what they see.
3. **A person is a private id with wallets attached.** A wallet is a binding, never the identity.
4. **A viewer leaving never changes the work.** A run has an id and an append-only event log. People reconnect by cursor.
5. **Whatever a person spends is theirs.** Sponsored access is an explicit, capped exception.
6. **Agents can ask. Only a fresh wallet signature approves** spending, linking a wallet or publishing.
7. **Cheapest version that works.** No service until a real need demands it. Most recorded cost incidents come from timers and polls, so avoid both.

## User Scenarios & Testing

### Story 1: Coming back (P1)

A person starts exploring, leaves, and finds their work again later, from the same app or a different one.

**Independent test:** start an exploration on the site, sign in with a NEAR wallet, close everything, come back and find it. Then continue it from Claude Code and from the Claude app, using only a link or a sign-in.

**Acceptance:**
1. **Given** someone explored without signing in, **when** they sign in, **then** their work moves to their account in one step.
2. **Given** an exploration begun in one app, **when** another agent opens it, **then** it gets the question, target, current recipe, data and date, the steps so far and the notes, without a transcript.
3. **Given** a private exploration, **when** someone without access asks for it, **then** it isn't revealed, not even that it exists.

### Story 2: Their spend, not ours (P1)

The person does it all: their agent, their wallet, their money. Judges are the exception, on a sponsored invite. Petal holds no one's money.

**Independent test:** with no invite, Petal's model budget doesn't move, whatever a visitor does.

**Acceptance:**
1. **Given** a visitor with no sign-in, **when** they browse flowers, **then** it works and costs Petal no model spend.
2. **Given** someone's own agent connected through a door, **when** it works, **then** its model bill is theirs, and all tools answer.
3. **Given** someone with no invite, **when** they ask Petal's own agent, **then** it refuses plainly, spends nothing, and says what they can do.
4. **Given** sponsored access, **when** its budget or the global cap is reached, **then** the work stops with a plain message, across any restart.

### Story 3: An approval that means something (P1)

A mapping that spends needs a yes from the wallet.

**Independent test:** an agent told to skip the question can't start a fresh read that needs approval.

**Acceptance:**
1. **Given** a tool call that would spend, **when** no approval exists, **then** it returns `approval_required` with a link, and nothing is spent.
2. **Given** a signed approval, **when** it's used twice or changed, **then** it's refused.
3. **Given** a chat that says "yes", **when** no signature exists, **then** it doesn't count where wallet approval is required.
4. **Given** Petal's own agent on a real model, told to skip the question, **when** it reaches for a new map before the person has said yes, **then** the tool doesn't run, the model has to speak, and a yes afterwards lets it go on (SYS-054).

### Story 4: Runs that survive (P2)

**Independent test:** kill the process during a run, restart it, reconnect.

**Acceptance:**
1. **Given** a run in progress, **when** the viewer leaves and returns, **then** they see every event once, and the run was never affected.
2. **Given** a person presses Stop, **when** the model call is cancelled, **then** the run says what was witnessed: stopped, or finished before Stop landed.
3. **Given** a crash, **when** the process restarts, **then** no run stays `running` forever.

### Story 5: Claims with standing (P2)

**Independent test:** given claims about one account from a chain, a named person and a classifier, and a challenge to one of them, two different policies show two different, explainable results.

**Acceptance:**
1. **Given** any shown relation, **when** a reader inspects it, **then** they can see who says so, on what evidence, and what kind of claim it is.
2. **Given** a challenge, **when** it's added, **then** the original stays intact, and both are visible to a policy.
3. **Given** "these are the same", **when** it's only a claim, **then** nothing is merged unless a policy chooses to.
4. **Given** all stored claims and snapshots, **when** the index is deleted, **then** it rebuilds with the same answers.

### Story 6: Relations between groups (P3)

**Independent test:** for two stored groups, ask which accounts they share and get a count, the list and the date each was observed.

**Acceptance:**
1. **Given** a group read through a limited window, **when** overlap is reported, **then** it's reported as at least that many, since absence isn't proof.

### Edge cases

- A lost wallet: recovery through another linked wallet, or a new key on the same NEAR account. Otherwise private work is gone, except an export. Published flowers stay.
- An account holder and an account they've pointed at are never confused: a target is a query, a binding needs a signature.
- A note left by one agent is untrusted data for the next.
- A store outage must not break public tools, and must stop spending rather than remove the cap.

## Requirements

### Storage

- **SYS-001**: Immutable facts (snapshots, recipes, specs, reports, drawings) MUST be stored by content hash, and served with no record of who asked.
- **SYS-002**: Private data (people, wallet bindings, sessions, grants, explorations, runs and their events, spend ledger) MUST live apart from public data, behind store interfaces that don't name an engine.
- **SYS-003**: Derived indexes MUST be rebuildable from facts and claims, and deleting them MUST lose nothing.
- **SYS-004**: A failure to read or write the spend ledger MUST stop spending.
- **SYS-005**: Published flowers, claims and corrections MUST be attributable to a writer on NEAR. Private data MUST NOT be written to NEAR.

### Runs

- **SYS-010**: A run MUST NOT depend on the request that started it or any viewer.
- **SYS-011**: Every run MUST have an append-only event log with sequence numbers, and viewers MUST reconnect by cursor.
- **SYS-012**: The thread MUST be saved each round, so a restart resumes or marks the run interrupted.
- **SYS-013**: Stop MUST abort the model call and the tool in progress, and report only what was witnessed.
- **SYS-014**: Once a run has an owner, only that owner MAY read or continue it, unless they share it.

### Identity

- **SYS-020**: Sign-in MUST use a wallet signature over a server-issued single-use challenge, starting with NEP-413. Other chains MAY follow (ERC-4361 with EIP-1271, SIWS, BIP-322).
- **SYS-021**: Sessions MUST be opaque values stored only as hashes, in `__Host-` HttpOnly cookies, and MUST NOT approve anything irreversible.
- **SYS-022**: Someone MAY explore without signing in, and MUST be able to claim that work when they do.
- **SYS-023**: A second wallet MUST need a live session and a signature from that wallet. Linked wallets MUST NOT be revealed to anyone, including through a timing or existence check.
- **SYS-024**: Tools MUST label an address `proved` or `pointed`, and nothing MAY turn one into the other except a signature.
- **SYS-025**: Petal MUST NOT store keys or seed phrases, raw tokens, holdings under a person, or an IP joined to a person. "Private" means access control and encryption at rest, and Petal MUST say plainly that its operator could still read it.

### Agents

- **SYS-030**: With no sign-in, an agent MUST keep every read tool, recipes and draft links.
- **SYS-031**: An agent MAY act for a person through a grant, reached by standard OAuth for MCP clients (DCR and CIMD) or link approval for HTTP agents (RFC 8628 shape). No one pastes a token by hand.
- **SYS-032**: Grants MUST carry scopes, opt-in for wallet addresses, and MUST NOT include approving spend, linking a wallet or publishing.
- **SYS-033**: The rules MUST live in the tool layer, so every door gets the same behaviour.

### Coming back

- **SYS-040**: An exploration MUST be a private, door-independent ref over public objects: `{ question, target, head, steps, notes, threads?, visibility }`. Each step records parent, spec, recipe, snapshot, door and who wrote it. To anyone without access it MUST answer exactly as one that doesn't exist.
- **SYS-041**: `list_explorations`, `get_exploration`, `save_step`, `add_note` and `start_exploration` MUST exist for agents, and the site's own run MUST save steps automatically. `get_exploration` returns a resume packet, in which notes are untrusted data from whoever wrote them.
- **SYS-042**: A link MUST be a token stored only as a hash, and revocable by the owner. There are two kinds. `read`: whoever holds it gets the resume packet, and a non-owner MAY fork, keeping `forked_from`. `continue`: it MAY also `save_step` and `add_note` on the same exploration, which is how a person hands work to their own agent before OAuth exists. Neither MAY grant spending, publishing, linking a wallet, seeing wallets or making more links. Each step and note MUST record the door and the link that wrote it.
- **SYS-043**: A draft link MUST carry only a hash, with the body stored put-if-absent and re-hashed on read. The long `/draft?spec=` form stays as a fallback.
- **SYS-044**: An agent with no sign-in MAY start an exploration. It has no owner, and the `continue` link returned is its only key. A person holding that link MAY claim it once signed in, and then it's theirs alone.

### Who pays

- **SYS-050**: The person does it all: their agent, their wallet, their money. Viewing and own agent spend no Petal budget. Petal MUST NOT hold anyone's money.
- **SYS-051**: Petal's own agent MUST refuse to spend Petal's budget for anyone without a sponsored invite, including for a first answer, and say what they can do instead. How a person funds NEAR's agent directly is open: `open-questions.md`.
- **SYS-052**: Sponsored access MUST use a revocable invite with its own budget, on top of per-chat and global caps, reserving then settling. It MUST NOT involve a personal wallet on the host.
- **SYS-053**: Per-action wallet approval (`approval_required`, a server-held request, a signature, single use) is the next resolution for irreversible acts. Publishing and wallet linking already need a signature.
- **SYS-054**: Petal's own agent on a real model MUST NOT start a new map (`get_snapshot`, `propose_spec`, `render_flower`) before the person's yes in the chat, enforced in its run loop and not only in its prompt. This yes is consent, not security or a wallet approval: nothing irreversible sits behind it, and a person's own agent stays free (SYS-030). Its `approval_required` event is where a wallet signature attaches later (SYS-053).

### Claims

- **SYS-060**: A claim MUST state subject, verb, object, validity dates, kind, evidence and who says so, and MUST be immutable. Changing your mind is a new claim.
- **SYS-061**: Kind (observed, declared, sourced, inferred) MUST be stated. "Disputed" MUST be derived from challenges. Confidence MUST be a claim about a claim, attributed to a named person or a named model and version, and never overwrite anything.
- **SYS-062**: Standing of a claimer MUST be derived from their record and rebuildable. It MUST NOT be a stored verdict, and repetition or payment MUST NOT raise it by themselves.
- **SYS-063**: What shows MUST come from one pure policy function: claims and a lens in, and for each claim whether it's shown, how, and why. Surfaces MUST NOT decide this themselves.
- **SYS-064**: Observed claims derivable from a snapshot MUST NOT be stored one by one: the snapshot's hash proves them.
- **SYS-065**: Entities MUST be namespaced and may be anything, including a group. A private person id MUST NOT appear in any public entity or claim.
- **SYS-066**: Sameness MUST be a claim, never a merge.

### Relations

- **SYS-070**: Relations MUST be queryable as rows in a rebuildable index, with no graph engine as a dependency unless measurements show a need.
- **SYS-071**: Every relation MUST carry its date and coverage, and overlap MUST be reported as a lower bound where coverage is partial.

## Success Criteria

- **SC-101**: Someone starts on the site and continues in another agent with no token handled by hand.
- **SC-102**: Without sponsorship, a visitor can't move Petal's model budget.
- **SC-103**: A killed process leaves no run stuck, and no event shown twice.
- **SC-104**: The spend cap holds across restarts and refuses when the store fails.
- **SC-105**: Deleting the index and rebuilding it changes no answer.
- **SC-106**: Two policies over the same claims give two different explainable views.

## Assumptions

- One always-on process is enough until a second instance is needed. Store interfaces keep the move open.
- Everything here can change as it's built: `open-questions.md` lists what's undecided, each with a default.
