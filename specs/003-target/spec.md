# Feature Specification: Petals, the target system

**Created**: 2026-11-08
**Status**: Approved by Elco on 8 Nov ("seems correct"). This is the target every chat works toward. Where `001-petal-core` or `002-system` disagree with it, this wins. Its technology questions (Q1 to Q8) are researched with Elco, one at a time, before anything is built.
**Input**: Elco, 8 Nov, describing the system. Technology isn't chosen here: this says what the system does. The technology questions are at the end, to research together.

## Mission

Elco, 8 Nov: "a service where people connect their own wallet(s), and use NEAR AI on their own dime or their own agents of any kind wherever they run them to map on chain systems - our contribution is using AI tech to make that mapping easy and give a visual form a place for it to live."

Elco, 5 Nov: "the google maps of power relationships on anything that is mapped there." Speculative points "can be challenged or at least known to be verified or inferred". Crowds build it "by only giving a shit about what they care about, so no one has to be the maintainer."

Elco, 8 Nov: "The claim system should be on chain as much as possible, we want a system that deincentivizes defamation, lying etc."

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
- use Elco's wallets, agents, credit, limits or internet connection for anyone else.

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

A person adds to their account more wallets on other chains, and their social accounts. Each link is proven by the thing linked: a wallet by its own signature, a social account by signing in with it. The person chooses which links are public.

**Acceptance:**
1. A wallet joins an account only with that wallet's own signature, made while the person is signed in.
2. Pointing at an address never makes it yours.
3. A private link is never shown to anyone else and never goes on chain.
4. Each link shows how it was proven, and when.

### Story 4: Map with your own agent

A person connects their own agent (Claude Code, Codex, Hermes or any other), or NEAR AI on their own key. The tools run where the agent runs. What the agent does shows in the person's workspace as it happens.

**Acceptance:**
1. Mapping a network costs Petals nothing and Elco nothing.
2. The conversation and its flower appear in the workspace live, and stay there.

### Story 5: A workspace to come back to

A person comes back, from any computer, to their conversations, flowers, notes and followed addresses, and can search them.

**Acceptance:** everything a person made is there after the server restarts, after it moves to another host, and after the loss of a disk.

### Story 6: Make a claim

A person states something about wallets or groups: who controls what, who acts together, who a wallet belongs to. The claim is signed with their identity, public and permanent. It lives on chain as much as possible. They're accountable for it.

**Acceptance:**
1. Every public claim names its claimer's identity. There are no anonymous public claims.
2. A claim can't be edited or deleted in silence. A retraction is a new signed statement, and the history stays.
3. Anyone can check who signed a claim, and when, without trusting Petals.
4. Each claim says what kind it is (observed in chain data, declared by its subject, or inferred) and links its evidence.

### Story 7: Challenge and correct

Anyone with an identity can challenge a claim. A challenge is a claim too. The claimer can answer or retract. Both sides stay visible.

**Acceptance:**
1. A challenged claim shows its challenges next to it.
2. A claimer's standing comes from their record (claims upheld, challenged, retracted), never from popularity or payment.

### Story 8: Read the map

Anyone can see flowers and claims: who said what, how sure they are, what evidence they give, and what their record is.

### Story 9: Publish a flower

A person publishes a flower to the shared map with their own wallet's signature.

### Story 10: Payments

Defined later, in its own spec, one step at a time.

## Requirements

### Identity
- **TGT-001**: A person is one account with many proven links. A link is a wallet on a supported chain, or a social account.
- **TGT-002**: A link is proven only by the thing linked. A wallet proves itself with its own signature, a social account by signing in with it.
- **TGT-003**: Two wallets become one account only when the person is signed in with one and signs with the other.
- **TGT-004**: The person chooses which links are public. Private links never go on chain, not even hashed.

### Permanence
- **TGT-010**: What a person makes survives restarts, a move to another host, and the loss of a disk. That covers accounts, links, workspaces, conversations, flowers, notes and claims.
- **TGT-011**: Public claims and published flowers can be verified without trusting Petals.

### Claims
- **TGT-020**: Every public claim is signed by its claimer's identity and attributed publicly.
- **TGT-021**: Claims live on chain as much as possible.
- **TGT-022**: A claim is never edited or deleted in silence. Retractions and challenges are new signed claims.
- **TGT-023**: A claimer's standing comes from their record, never from popularity or payment.
- **TGT-024**: Each claim carries its kind and its evidence.
- **TGT-025**: The system disincentivises defamation and lying. How it does that is research question Q5.

### Agents and tools
- **TGT-030**: The tools and the skill run on the person's side. The server does no chain reads, web reads, searches or model calls for visitors.
- **TGT-031**: Nobody uses Elco's wallets, agents, credit, limits or connection.

### Hosting
- **TGT-040**: The website and the server are separate. The server is built to move to any host, and nothing in it is tied to this Mac.
- **TGT-041**: Nothing to steal, nothing to take over. The server holds no key that spends money or writes for anyone, and its attack surface is as small as it can be.

## Success Criteria

- **SC-T1**: A stranger on another computer does all of this, and all of it is still there after the server restarts:
  1. lands on the site;
  2. connects a wallet;
  3. links a second wallet on another chain;
  4. maps a DAO with their own agent and watches it live;
  5. makes a claim;
  6. sees another person challenge it.
- **SC-T2**: Anyone can verify who signed a public claim, and when, without Petals.
- **SC-T3**: Nothing Petals does for a visitor spends Elco's money or uses Elco's connection.

## Open technology questions: research together, then choose

Each one gets its options explained in plain words, with trade-offs, before anything is chosen.

- **Q1. The database.** SQLite on one server, or Postgres? What does "permanent" need: backups, copies, a second machine? What changes in our code either way?
- **Q2. Proving a wallet on each chain.** NEAR, Ethereum and the EVM chains, Solana, Bitcoin.
- **Q3. Proving a social account.** Which accounts, and how: signing in with them, or a signed post.
- **Q4. Where claims live on chain.** NEAR FastData, a NEAR contract, an attestation standard, or a mix. Also how long each keeps data, what it costs, and who pays to write (the claimer's own wallet).
- **Q5. What disincentivises defamation and lying.** Accountability through identity and record, a stake that's lost when a challenge wins, rules about natural persons, or a mix. Also how a challenge is settled.
- **Q6. The profile.** What's public, what's private, and who decides. What about natural persons named in claims?
- **Q7. The seam between website and server.** Researched on branch `sys/site-server-spec` (`specs/002-system/research.md`). The lean is one address.
- **Q8. Payments.** Later, in its own spec.

## What this replaces, once approved

- `design/system-plan.md`'s server doing visitors' work on Elco's resources.
- `002-system`'s sponsored invites as the way in to Petals' agent. A person's own agent or own NEAR AI key replaces them.
- `001-petal-core`'s FR-029, limited keys as the publishing path. The person's own wallet signs instead.
