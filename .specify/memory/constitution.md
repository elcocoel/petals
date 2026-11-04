<!--
Sync Impact Report
- Version change: 1.2.0 → 1.2.1 (PATCH: licence decided, MIT; publication boundary stated). Before that, 1.1.0 → 1.2.0 (MINOR: principle I's geometry made explicit; principle IV gains the keep-what-was-gathered rule; a NEAR showcase constraint is added)
- Modified principles: I (a flower is a polygon of straight-edged bars, not a circle of rounded petals; width may not distort the polygon), IV (data final on its chain is kept and reused; facts are permanent, labels and interpretations are separate, versioned layers)
- Added: Hackathon constraint "NEAR showcase"
- Reason: Elco's decisions of 2026-11-04 after the step 1 and step 2 tries (see spec Clarifications, Session 2026-11-04)
- Templates requiring updates: none (plan/spec/tasks read this at runtime)
- Resolved TODO: licence is MIT (Elco, 2026-11-04)
- Previous amendment: 1.0.0 → 1.1.0 (open vocabulary of primitives, mission; principles II, IV, VII expanded)
-->
# Petal Constitution

**Mission: make the world visually governable.** Petal shows power in any network as a flower. Every participant is a petal. An agent works out what power means in each network and draws it, so that anyone, even a child, can tell a shared network from a plutocracy.

## Core Principles

### I. The Flower Is the Grammar
Every Petal visualisation is a flower: a bar chart wrapped into a circle, built from straight edges. The centre is a polygon with one side per participant, and each participant's petal is a straight bar standing out from its side, cut into stacked segments where the data allows.
- The polygon must keep its shape: width may vary only within a narrow band, and no primitive may distort the polygon so that it stops reading as one flower.
- A flower is drawn from a **vocabulary of visual primitives**. Initial vocabulary: width, height, segments within a petal, colour and colour grades, texture, extrusion and 3D effects, dots or markings (inner base, inner tip, outer tip), and lines in the inner space for interactions.
- The vocabulary is **open-ended**. A new primitive may be added when it does not break how a flower is read; each addition is recorded in the spec.
- There is one **default convention** mapping behaviours to primitives, so flowers of different networks stay comparable at a glance.
- Every flower declares what each primitive it uses means. No primitive is used decoratively without a declared meaning.

Rationale: a shared grammar with a default makes any two flowers comparable and lets people learn to read Petal once; an open vocabulary lets the grammar grow.

### II. Power Is Interpreted, and Every Interpretation Is Argued
What counts as power differs per organisation (tokens, delegated voting power, signer seats, council roles, reputation, funding ties). The "meanings of power" agent decides the mapping for each organisation, and:
- MUST cite the sources it used (chain data, forum, docs, constitution) for every mapping;
- MUST save its reasoning with the flower, readable by any viewer;
- MUST say what it could not determine.
- Users can talk to the agent to change the mapping; the agent proposes, explains and redraws, and the result is labelled as a variation of the default.

Rationale: the agent's judgement is the product. It has to be inspectable, not a black box.

### III. Spec-Driven Rendering
The agent never draws. It writes a **Petal spec**: a documented, versioned, machine-readable description of the organisation, the data, and the mappings from behaviours to primitives. A deterministic renderer turns the spec into the flower.
- Same spec and same data MUST produce the same flower.
- Specs are shareable and remixable; they are the unit for galleries and competitions.

Rationale: reproducibility, legibility for judges (human and AI), and a clean seam between interpretation and drawing.

### IV. Everything Is a DAO
Any network with participants and power can be a flower: a DAO, a protocol, a chain, or a non-crypto group such as a parliament, as long as there is data and a convention for what power means.
- Data comes in through input modules that all output one common table (participants, holdings, relationships, events, each dated). The on-chain module comes first; other inputs are added where they are nearly free.
- The renderer and the agent never depend on a specific chain.
- NEAR is the first on-chain source and the reference implementation.
- Data gathered for a network at a date, once final on its chain, is kept and reused, never fetched again. Facts are permanent; labels and interpretations are separate layers, versioned and attributed to whoever wrote them.

Rationale: "point it at anything" is the promise. A new network should only ever need a new input module.

### V. Evidence Before Inference
Petal separates what is proven from what is inferred.
- On-chain facts and agent inferences are visibly distinguishable in every flower.
- Claims that several accounts are under common control (fused petals) require stated evidence: shared signers, funding lineage, or synchronised behaviour, with the evidence attached.
- Identity: Petal may link an account to a real person or organisation wherever public evidence allows (self-declared names, .near names, forum profiles, delegate statements, public reporting). Every identity link shows its source and is marked as proven (self-declared or verified) or inferred. Anyone can request a correction or removal of an identity link.
- Retrieval first, interpretation second, as in the GIP-150 method.

Rationale: a tool that maps power can harm people if it overclaims. Credibility is the whole value.

### VI. Beauty Is a Requirement
Petal is both a public service and an art project.
- Every flower must be screenshot-worthy: considered colour, type, motion and composition.
- Design quality is reviewed like correctness: a flower that is accurate but ugly is not done.

Rationale: beauty is what makes people look, share and understand. Design is also a judged criterion.

### VII. One Flawless Path Over Many Features
The core path is: ask for any network, including one nobody prepared → the agent explains what power means there → the flower renders live → click a petal to see why.
- That path must work end to end, every time, before any other feature is started.
- Everything else (gallery, payments, queries, competitions, messaging) is built only on top of a working core path. Wallet messaging and peer-to-peer coordination between governors are Petal's long-term direction: researched and described in the README for the hackathon, not built.

Rationale: about a week of build time, one builder. Depth beats breadth.

## Hackathon Constraints

- Build window: 1 Nov 2026 00:00 UTC to 14 Nov 2026 23:59 UTC. All application code is written inside the window, after planning is complete. Specs, plans and designs (some written in October) are declared openly in the README.
- The repository is created when planning is complete (target 5 Nov) with a clean commit history and the MIT licence (decided 2026-11-04). Only what Elco chooses to share for the hackathon goes into the public repository; exploration documents stay out.
- The README follows the official guide: what Petal is and the problem it solves, "do X, see Y" steps, no marketing, and the NEAR features that match each entered track.
- No secrets, keys or submission personal data are ever committed.
- NEAR showcase: the build uses as much of NEAR as is genuinely useful, and each NEAR piece is real and sits on the user journey (the README explains the mechanism, not a claim). Non-NEAR alternatives are documented for later, not built.
- Never without Elco's explicit confirmation: making the repo public, pushing, posting on X, deploying to mainnet, signing transactions, spending tokens, sending the submission.
- Feature freeze on 12 Nov; the demo is recorded from the frozen version; submission on 13 Nov.

## Development Workflow

- Spec Kit flow: constitution → specify → clarify → plan → tasks first (target done 4 Nov); implement only after tasks are approved.
- Every feature traces back to a user story in the spec and must not violate a principle above.
- Each day ends with a working build of the core path.
- Sample data and fixtures are checked in so any judge can reproduce a flower without credentials.

## Governance

- This constitution supersedes other practices in this project. Elco is the final authority on it.
- Amendments are written down with a reason and versioned semantically: MAJOR for removing or redefining a principle, MINOR for a new principle or section, PATCH for wording.
- Plans and task lists are checked against the principles before work starts; any justified exception is recorded in the plan.

**Version**: 1.2.1 | **Ratified**: 2026-11-03 | **Last Amended**: 2026-11-04
