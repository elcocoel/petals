# Feature Specification: Petals, the target system

**Created**: 2026-11-08
**Status**: Approved on 8 Nov. This is the target all the work moves toward. Where `001-petal-core` or `002-system` disagree with it, this wins. Its technology questions (Q1 to Q8) are researched one at a time, before anything is built.
**Input**: A description of the whole system. Technology isn't chosen here: this says what the system does. The technology questions are at the end, to research together.

## Mission

A service where people connect their own wallets and map on-chain systems, with NEAR AI paid for themselves or with their own agents of any kind, wherever those run. Petals' contribution is AI that makes the mapping easy, and a visual form with a place to live.

A map of power relationships across anything mapped there. Speculative points can be challenged, or at least known to be verified or inferred. Crowds build it by each caring only about what they care about, so no one has to be the maintainer.

The claim system lives on chain as much as possible, and it disincentivises defamation and lying.

Sign-in is only with wallets; social accounts are connected only to show identity. Claims and metadata over the map can all be private at first: a person adds commentary to their own map and finds it again later. Claim validation is a chapter after basic testing.

One account isn't assumed to be one human. People who together control a wallet can form one account, add other wallets to it and share attribution. For the first test, every link can sign in and is visible; whether anything can really be private, technically, is checked after.

## What Petals is, and isn't

**Petals gives people:**
- the tools and the skill, which run wherever the person's agent runs;
- the website;
- a profile that holds an identity and its proven links;
- the shared map of flowers and claims;
- the visual form: the flower.

**Petals doesn't:**
- run anyone's agent on Petals' resources;
- read chains or web pages, or search, for visitors;
- hold anyone's money;
- use the operator's wallets, agents, credit, limits or internet connection for anyone else.

## User Scenarios & Testing

### Story 1: Arrive and understand

A visitor lands on a page that explains what Petals is. Reaching the app takes an identity.

**Acceptance:** with no identity, a visitor sees the landing page and public flowers, and the way into the app is connecting an identity.

### Story 2: Enter with an identity

A person connects a wallet, NEAR today and other chains later, and arrives in the app signed in. Connecting again with any wallet already linked reaches the same account, from any computer.

**Acceptance:**
1. A first wallet makes a new account.
2. A wallet already linked to an account signs in to that account.
3. Signing in moves nothing and costs nothing.

### Story 3: A verified profile

An account adds more wallets on other chains. Each wallet is proven by its own signature. **Signing in is only ever with a wallet.** Social accounts are only fields a person connects to their own profile, to show who they are: no other function, no messaging, and never signing in. An account isn't assumed to be one human. Whoever controls a wallet together can form one account, add other wallets to it, and share its attribution.

**For the first test, every linked identity can sign in and is publicly visible.** Workspaces and conversations stay private to the account. Whether a link can really be private, from other users or from the operator, is checked after the test (Q6).

**Acceptance:**
1. A wallet joins an account only with that wallet's own signature, made while signed in to the account.
2. Pointing at an address never makes it yours.
3. Each link shows how it was proven, and when.
4. Signing in with any linked identity reaches the same account.

Recovery, revocation and control of an account are in **Details, after testing**, at the end. They don't block the first test.

### Story 4: Map with your own agent

A person connects their own agent (Claude Code, Codex, Hermes or any other), or NEAR AI on their own key. The tools run where the agent runs. What the agent does shows in the person's workspace as it happens.

**Acceptance:**
1. Mapping a network costs Petals and its operator nothing.
2. The conversation and its flower appear in the workspace live, and stay there.

### Story 5: A workspace to come back to

A person comes back, from any computer, to their conversations, flowers, notes and followed addresses, and can search them.

**Acceptance:** everything a person made is there after the server restarts, after it moves to another host, and after the loss of a disk.

### Story 6: Commentary and metadata on my map

A person adds their own commentary and metadata to what they've mapped: on a flower, an account, a group, a relation. At first it's all private to their account, so they can come back to it later. It's their own commentary: no system decides what's true. The options for how commentary and metadata sit over the map are explored first in `004-workspace` (the meta layer).

**Acceptance:** a person's commentary is there when they come back, from any computer, and nobody else can see or search it (TGT-006, TGT-007).

Public claims, challenges and validation are a later chapter, after basic testing: see **Public claims, after basic testing** at the end.

### Story 8: Read the map

Anyone can see flowers and claims: who said what, how sure they are, what evidence they give, and what their record is.

### Story 9: Publish a flower

A person publishes a flower to the shared map with their own wallet's signature.

### Story 10: Payments

Defined later, in its own spec, one step at a time.

First step, 9 Nov: paying for Petals' own agent in NEAR, from the signed-in wallet (TGT-030's amendment, `proposal-payment.md`).

## Requirements

### Identity
- **TGT-001**: An account is an identity with many proven links. A link is a wallet on a supported chain. Social accounts are only self-connected profile fields, shown on the profile, with no other function and no messaging. An account may be controlled by several people together. Nothing assumes one human per account.
- **TGT-002**: Signing in is only with a wallet, proven by its own signature. Checking that signature may read the chain, for signing in only, never for mapping (the Q2 research's lean).
- **TGT-003**: Two wallets become one account only when someone is signed in with one and signs with the other.
- **TGT-004**: For the first test, every link can sign in and is public. Private links, if they come, never go on chain, not even hashed. Whether a link can be private, and from whom, is Q6.
- **TGT-005**: Every past action keeps the credential that authorised it. Revocation, recovery and control are in Details, after testing.

### Privacy of work
- **TGT-006**: An account's working process stays private from every other account. That covers conversations, notes, drafts, unpublished maps and investigation activity.
- **TGT-007**: Search returns only what the searcher may read, and by default only what's inside their own account. That holds for snippets, counts, suggestions and indexes as well as results. Discovering the public map is a separate surface, and never a way to search another account's private work.

### Permanence
- **TGT-010**: What a person makes survives restarts, a move to another host, and the loss of a disk. That covers accounts, links, workspaces, conversations, flowers, notes and claims.
- **TGT-011**: Published flowers can be verified without trusting Petals. Public claims are a later chapter.

### Agents and tools
- **TGT-030**: The tools and the skill run on the person's side. The server does no chain reads, web reads, searches or model calls for visitors.
  - **Amended for the hackathon, 9 Nov.** Petals' own agent is the chat on the page, on NEAR AI Cloud through our server, for any signed-in visitor (B), and the visitor pays for it in NEAR from the wallet they signed in with. It goes live only with payment working. The person's own agents join the same project (C) without shutting down B, and the page's agent can hand them mapping and other jobs, which they do on their own machines and report back. The payment choices are in `proposal-payment.md`.
- **TGT-031**: Nobody uses the operator's wallets, agents, credit, limits or connection.

### Hosting
- **TGT-040**: The website and the server are separate. The server is built to move to any host, and nothing in it is tied to one machine.
- **TGT-041**: Nothing to steal, nothing to take over. The server holds no key that spends money or writes for anyone, and its attack surface is as small as it can be.
  - **Amended for the hackathon, 9 Nov.** A NEAR contract: a small contract holds each person's deposit and they withdraw it themselves, so Petals holds nobody's money. The server holds one key that can call the contract's `charge` and nothing else: it moves what a turn cost from a person's balance to what Petals has earned, never to anyone else. `proposal-payment.md`, section 6, says how in plain words.

## Success Criteria

- **SC-T1**: A stranger on another computer does all of this, and all of it is still there after the server restarts:
  1. lands on the site;
  2. connects a wallet;
  3. links a second wallet on another chain;
  4. maps a DAO with their own agent and watches it live;
  5. adds their own commentary to the map and finds it again later.
- **SC-T2**: Nobody else can see or search that person's work or commentary.
- **SC-T3**: Nothing Petals does for a visitor spends the operator's money or uses the operator's connection.

## Open technology questions: research together, then choose

Each one gets its options explained in plain words, with trade-offs, before anything is chosen.

- **Q1. The database.** SQLite on one server, or Postgres? What does "permanent" need: backups, copies, a second machine? What changes in our code either way?
- **Q2. Proving a wallet on each chain.** NEAR, Ethereum and the EVM chains, Solana, Bitcoin.
- **Q3. Social accounts as profile fields.** They're self-connected and shown on the profile, with no other function. Which accounts, and whether and how they're proven. This comes after testing.
- **Q6. The profile.** What's public, what's private, and who decides, after the first test. That means privacy from other users (access rules) and privacy from the operator, which needs a different key model. Also what to do about natural persons named in claims.
- **Q7. The seam between website and server.** Researched in `specs/002-system/research.md`. The lean is one address.
- **Q8. Payments.** Later, in its own spec.

- **Q10. Keeping plain text away from the operator.** The aim: plain text kept away from the server, encrypted in the database, so only the author can read it, while they can still sign in to their account space from anywhere. This is the direction to research, not a chosen design, and it doesn't block the first test. Before anything is built, the options are explained: what runs in the browser and what runs in the database, how a key unlocks on a new device, and what search can do over encrypted text. Ordinary Postgres search stays for content the server is allowed to read. Signing in isn't holding a decryption key, and linking another wallet doesn't by itself let it decrypt.

## What this replaces, once approved

- The earlier system plan's server doing visitors' work on the operator's resources.
- `002-system`'s sponsored invites as the way in to Petals' agent. A person's own agent or own NEAR AI key replaces them.
- `001-petal-core`'s FR-029, limited keys as the publishing path. The person's own wallet signs instead.

## Details, after testing

Control and revocation matter only after testing. Nothing here blocks the first test.

### Story 3b: Recovery, revocation and control (designed after testing)

These need an answer: recovering an account after losing a wallet, revoking a stolen wallet, and keeping historical attribution. No mechanism is chosen yet.

What's already fixed:
- When revocation is built, revoking a credential ends its active sessions and tokens as well as its future sign-ins.
- Every past action keeps the credential that authorised it and the account it was made for. Revocation never rewrites history.

Open, to design together:
- Can every credential on an account add or remove the others?
- Who settles it when controllers conflict, or when a credential is compromised?
- What happens when every credential is lost?

- **Q9. Recovery and controllers.** Recovering after a lost wallet, revoking a stolen one, conflicts between controllers, and losing every credential. No recovery authority is invented in the meantime.
- **Shared accounts and "only the author".** With accounts shared on purpose, does "only the author can read" mean every member of the account, or a private compartment for each author? It's to clarify. Neither is assumed meanwhile.

## Public claims, after basic testing

Claim validation is a chapter after basic testing. Everything below stays the intent. It's designed after basic testing, and it doesn't block it. The research findings are in `specs/003-target/research-q2-q6.md`, Q4 to Q6.

### Public claim: make one

A person states something about what wallets or groups do: who controls what, who acts together. What matters is what they do, not who they are. Who owns a wallet isn't a core claim of Petals, although it could be used for it. The claim is signed with their identity, public and permanent. It lives on chain as much as possible. They're accountable for it.

**Acceptance:**
1. Every public claim names its claimer's identity. There are no anonymous public claims.
2. A claim can't be edited or deleted in silence. A retraction is a new signed statement, and the history stays.
3. Anyone can check who signed a claim, and when, without trusting Petals.
4. Each claim says what kind it is (observed in chain data, declared by its subject, or inferred) and links its evidence.

### Public claim: challenge and correct

Anyone with an identity can challenge a claim. A challenge is a claim too. The claimer can answer or retract. Both sides stay visible.

**Acceptance:**
1. A challenged claim shows its challenges next to it.
2. A claimer's standing comes from their record (claims upheld, challenged, retracted), never from popularity or payment.


### Public claims: requirements
- **TGT-020**: Every public claim is signed by its claimer's identity and attributed publicly.
- **TGT-021**: Claims live on chain as much as possible.
- **TGT-022**: A claim is never edited or deleted in silence. Retractions and challenges are new signed claims.
- **TGT-023**: A claimer's standing comes from their record, never from popularity or payment.
- **TGT-024**: Each claim carries its kind and its evidence.
- **TGT-025**: The system disincentivises defamation and lying. How it does that is research question Q5.

- **Q4. Where claims live on chain.** NEAR FastData, a NEAR contract, an attestation standard, or a mix. Also how long each keeps data, what it costs, and who pays to write (the claimer's own wallet).
- **Q5. What disincentivises defamation and lying.** Accountability through identity and record, a stake that's lost when a challenge wins, rules about natural persons, or a mix. Also how a challenge is settled.
