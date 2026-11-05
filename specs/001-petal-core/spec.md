# Feature Specification: Petal core: see the power in any network as a flower

**Feature Branch**: `001-petal-core`

**Created**: 2026-11-03

**Status**: Draft (clarified 2026-11-03: 3 written questions, 5 by voice; updated 2026-11-04 after the step 1 and step 2 tries)

**Input**: User description: "Petal is a visual way to see power in any network. It's a circle, a flower: every account is a petal, like a bar chart wrapped into a circle. Width, height, colour, texture and the inner space (interactions between accounts) are a modular encoding for what signifies power and privilege in that organisation. Point it at any organisation or contract: an agent with a 'meanings of power' skill reads the chain, the forum and the docs, decides what each channel means, and renders the flower. Everything is a DAO: any chain. Pre-populated with a gallery of existing DAOs. Public service and art project. Later: creative competitions, queries, paid generation via NEAR Intents, and wallet messaging that turns Petal into a peer-to-peer coordination space for governors."

## Mission

Make the world visually governable. Petal makes the physics of power visible: how power is held and how it flows through a network. A child should be able to look at two flowers and tell a truly shared network from a plutocracy or a kleptocracy. A flower shows a state of power that is visually obvious and not up for debate, and its animated or multi-snapshot form shows power in motion.

Petal is not limited to DAOs or to crypto. Any network of participants can become a flower, as long as there is data and an agreed convention for what power means and how it is drawn: a blockchain, a protocol, a parliament, a social group.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ask for any network and get its flower, live (Priority: P1)

A user (a person, or another agent) asks Petal about a network Petal has never seen and that nobody prepared in advance, talking either to Petal's own agent on the site or to their own agent with the Petal skill: a DAO, a protocol, a whole chain, on any chain. Petal's agent gathers the data, studies how power works there (what is held, who delegates or signs, what the network's own docs and forum say), and proposes how to draw it using Petal's vocabulary of visual primitives. It explains that mapping in plain language with sources, and renders the flower: one petal per account, every visual primitive carrying a declared meaning. The user can then click any petal to see who that account is (as far as public evidence allows), what it holds, and why its petal looks the way it does.

**Why this priority**: This is the core capability. If Petal only works on networks we prepared, it gives people no utility. Live generation matters more than speed: it may take a while, as long as the user sees progress and gets a true flower at the end.

**Independent Test**: Give Petal a network the team has not prepared; it completes with visible progress throughout and produces a flower with a legend for every primitive used, a written interpretation with cited sources, and working petal details.

**Acceptance Scenarios**:

1. **Given** a user who names a network Petal has never analysed, **When** they ask for its flower, **Then** Petal shows what it is doing at each stage and ends with a flower, a legend for every primitive used, and a written "what power means here" interpretation.
2. **Given** a rendered flower, **When** the user reads the interpretation, **Then** every mapping cites at least one source (on-chain data, governance docs, forum) and the interpretation states what Petal could not determine.
3. **Given** a rendered flower, **When** the user clicks a petal, **Then** they see the account, any public identity linked to it with its source and a proven/inferred label, the values behind each primitive, and its interactions with other accounts.
4. **Given** a rendered flower, **When** the user selects the inner space, **Then** the interactions between accounts (delegation, funding, co-signing, transactions, communications) are shown and labelled.
5. **Given** a network Petal cannot read yet, **When** the user asks for it, **Then** Petal says plainly why and what it can read, instead of drawing a misleading flower.

---

### User Story 2 - Talk to the agent to change how the flower is drawn (Priority: P2)

Every flower starts from Petal's default convention. The user then talks to the agent about what they care about, for example "show me who gained power after the merge" or "make colour mean voting activity", and the agent changes the mapping, explains the change, and redraws. The result is the user's own flower of that network, labelled as a variation of the default.

**Why this priority**: Power means different things to different people. The conversation is how anyone, not only experts, gets the flower that answers their question, and it is the seed of people creating their own flowers.

**Independent Test**: Open any flower, ask the agent in plain language to change one mapping; a new flower renders with an updated legend, and the default version is unchanged.

**Acceptance Scenarios**:

1. **Given** a flower, **When** the user asks the agent in plain language to show a different behaviour, **Then** the agent proposes a mapping using available primitives, explains it, and redraws.
2. **Given** a request the primitives can't express, **When** the user asks, **Then** the agent says so and offers the closest alternative.
3. **Given** a changed flower, **When** the user views it, **Then** it is labelled as a variation, with its own legend and a way back to the default.

---

### User Story 3 - The hero set: flowers of very different systems (Priority: P3)

A newcomer, or a judge, opens Petal and first sees a set of about five flowers drawn from very different systems: moments in history where the data is complete and not up for debate. Candidates include The DAO hack, Bitcoin, Ethereum, and NEAR as a whole network; the final five are chosen later. Each opens fully, with its interpretation, and they can be compared side by side.

**Why this priority**: It shows in seconds how adaptable Petal is, and it gives judges an immediate, memorable image without waiting for live generation.

**Independent Test**: Open Petal with no input; about five flowers from clearly different kinds of systems are shown, each opens with full detail, and any two can be compared at the same scale.

**Acceptance Scenarios**:

1. **Given** the hero set, **When** the user opens any flower, **Then** it behaves exactly like a freshly generated one (legend, interpretation, petal details, conversation).
2. **Given** two hero flowers, **When** the user compares them, **Then** both appear at the same scale with their legends, so differences in concentration are visible at a glance.

---

### User Story 4 - See accounts that act as one (fused petals) (Priority: P4)

When the evidence shows that several accounts are under common control (they share signers, were funded from the same source, or move in lockstep), Petal fuses their petals into one visibly joined shape. Selecting the fusion shows the evidence, and whether each link is proven or inferred.

**Why this priority**: It reveals what token lists hide: the real number of independent actors. It is the GIP-150 method made visible, and the strongest fit for the security track.

**Independent Test**: Run Petal on a network with a known cluster of commonly controlled accounts; the cluster appears fused, with its evidence listed.

**Acceptance Scenarios**:

1. **Given** accounts with documented shared control, **When** the flower renders, **Then** their petals are fused and the fusion shows a combined power figure.
2. **Given** a fusion, **When** the user selects it, **Then** each piece of evidence is listed with its source and a proven/inferred label.
3. **Given** accounts that only look similar without evidence, **When** the flower renders, **Then** they are not fused.

---

### User Story 5 - See power in motion (Priority: P5)

A user looks at a network across time: compares its flower on two dates, sees the pivotal moments where power shifted (a large delegation move, a migration, a hack, a treasury event), scrubs a timeline to watch the flower grow, wilt or concentrate, and exports the change as an animation.

**Why this priority**: Power in motion is the most striking thing Petal can show and the heart of the mission. It builds on the dated flower from Story 1, so it comes after the core vertical works; its parts are prioritised by viability (compare two dates first, then pivotal moments, then timeline and animation).

**Independent Test**: Pick a network with history; its flowers on two dates appear side by side, and at least one pivotal moment is marked with what changed.

**Acceptance Scenarios**:

1. **Given** a flower, **When** the user picks a second date, **Then** both flowers appear side by side at the same scale, with what changed between them.
2. **Given** a network's history, **When** the user opens its timeline, **Then** pivotal moments are marked, the user can move between them, and the change can be exported as an animation.

---

### User Story 6 - Share a flower (Priority: P6)

A user shares a flower as a link or exports it as an image, so others see exactly the same flower.

**Why this priority**: Sharing is how Petal spreads, but it adds no new capability to the core.

**Independent Test**: Share a flower's link and open it in a fresh browser; the identical flower appears.

**Acceptance Scenarios**:

1. **Given** a flower, **When** the user opens its link elsewhere, **Then** the same flower appears from the same spec and data.
2. **Given** a flower, **When** the user exports it as an image, **Then** the image includes the legend and the network's name.

---

### User Story 7 - Publish a flower to the shared map (Priority: P2)

A maker who likes their flower publishes it. They sign in with a NEAR account, and the flower's spec, its interpretation and a fingerprint of its data snapshot are written to Petal's shared map on NEAR under the maker's name. The flower joins the published gallery, and the data behind it stays in the map, so nobody has to pull that network at that date again. Agents can publish on a maker's behalf with a limited key that can publish but cannot move funds.

**Why this priority**: It turns Petal from a viewer into a shared effort to map networks. The chain's past never changes, so whatever has been gathered once should be kept and reused. It is also where NEAR's accounts and storage carry the product.

**Independent Test**: Make a flower, sign in with a NEAR testnet account, publish it; it appears in the gallery from the shared map, with the maker's account shown as its author, and a second request for the same network and date reuses the stored data instead of fetching it again.

**Acceptance Scenarios**:

1. **Given** a finished flower, **When** the maker signs in and publishes, **Then** its spec, interpretation and data fingerprint are stored in the shared map with the maker as author, and it appears in the gallery.
2. **Given** a published flower, **When** anyone opens it, **Then** it renders identically from the stored spec and data, and shows who published it and when.
3. **Given** a network and date already in the shared map, **When** someone asks for it again, **Then** Petal reuses the stored data and says so.
4. **Given** an agent publishing for a maker, **When** it writes to the map, **Then** it uses a key limited to publishing that cannot move the maker's funds.

---

### Edge Cases

- A network with thousands of accounts: the long tail is grouped into a single "everyone else" petal so the flower stays legible, and the grouping is stated in the legend.
- A network with one or two accounts: Petal still draws the flower and notes that power is fully concentrated.
- Accounts that are contracts, treasuries or exchanges rather than people: labelled as such, not presented as individuals.
- Power sources that conflict (for example token holdings vs delegated voting power): the interpretation names the conflict and says which one drives the flower and why.
- No forum or docs exist: the flower is built from on-chain data alone and the interpretation says so.
- A data source is slow or unavailable: Petal reports which source failed and either finishes with partial data (clearly marked) or stops with an explanation.
- Live generation takes a long time: progress stays visible and the user can leave and come back to the finished flower.
- A public identity link is ambiguous: shown as inferred, never as proven.
- Someone asks for an identity link to be corrected or removed: there is a visible way to request it.
- The same network is requested twice: the existing flower is reused unless the user asks for a fresh analysis.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Petal MUST accept a request for any network the user names, on any chain, work out how to read it, and say plainly when it cannot read it yet.
- **FR-002**: Petal MUST generate flowers live for networks it has never seen, with no preparation by the Petal team.
- **FR-003**: Petal MUST have at least one on-chain input module. All input MUST be converted into one common tabular form (participants, holdings, relationships, events), so that other inputs (for example an uploaded spreadsheet) can be added where they cost little once that form exists.
- **FR-004**: Petal MUST gather a network's holdings, roles and interactions, and its public governance documentation and forum discussion where they exist.
- **FR-005**: Petal MUST draw every flower as a polygon with one side per participant and a straight bar standing out from each side (a bar chart wrapped into a circle, built from straight edges), using a defined vocabulary of visual primitives. The vocabulary is open-ended: new primitives may be added as long as they do not break how a flower is read. Initial vocabulary: petal width (the length of its side, which may vary only within a narrow band so the polygon keeps its shape); petal height; segments stacked within a bar (for example power acquired over time, proposals, or who backs it); colour and colour grades; texture; extrusion and other 3D effects; dots or markings at the inner base, inner tip or outer tip of a petal; and lines in the inner space for interactions (transactions, delegations, communications). Candidates: opacity (dormant accounts fade), outline style (solid = proven, dashed = inferred), order around the circle (for example by join date), and gentle motion (activity).
- **FR-006**: Petal MUST have a default convention that maps behaviours to primitives, so that flowers of different networks are comparable at a glance.
- **FR-007**: Users MUST be able to talk to the agent in plain language to change which behaviours map to which primitives; the agent proposes, explains and redraws, and says when a request cannot be expressed.
- **FR-008**: Petal MUST produce a written interpretation of what power means in the network, citing at least one source per mapping and listing what it could not determine.
- **FR-009**: Petal MUST express every flower as a Petal spec that declares the meaning of every primitive used.
- **FR-010**: Petal MUST render the same flower every time from the same spec and data.
- **FR-011**: Every flower MUST show a legend for every primitive it uses; no primitive may be used without a declared meaning.
- **FR-012**: Users MUST be able to select a petal and see the account, linked public identity (with source and proven/inferred label), primitive values, and interactions.
- **FR-013**: Petal MUST visually distinguish proven facts from inferences everywhere they appear.
- **FR-014**: Petal MUST fuse petals of commonly controlled accounts only when evidence exists, and MUST show that evidence on request.
- **FR-015**: Petal MUST group long-tail accounts into a single declared petal above a legibility threshold.
- **FR-016**: Petal MUST label contract, treasury and exchange accounts as non-individuals when known.
- **FR-017**: Petal MUST offer a hero set of about five flowers of very different systems, each a moment with complete, undisputed data.
- **FR-018**: Every flower MUST be dated: it shows power at a stated moment, and its data snapshot records that moment.
- **FR-019**: Petal SHOULD let users compare a network's flowers across dates and mark pivotal moments where power shifted; timeline scrubbing and animation export follow if time allows.
- **FR-020**: Users MUST be able to share a flower by link and export it as an image that includes its legend.
- **FR-021**: Petal MUST show progress throughout generation and a clear explanation when it cannot complete.
- **FR-022**: Petal MUST offer a visible way to request correction or removal of an identity link: a signed correction entry in the shared map for people with a NEAR account, and a public issue link for everyone else.
- **FR-023**: Petal's core (gathering, interpretation, spec, rendering) MUST work independently of any one delivery form, so it can be offered as a web platform, API, MCP server, agent skill or installable software.
- **FR-024**: Users MUST be able to make flowers either with Petal's own agent on the site or with their own agent through a published Petal skill and tool interface.
- **FR-025**: Every figure an agent quotes (shares, counts, rankings) MUST come from Petal's tools, computed from the data; the agent interprets, the tools count.
- **FR-026**: Every spec MUST be validated against the data and the primitive vocabulary before it is drawn or published.
- **FR-027**: Makers MUST be able to publish a flower to a shared map on NEAR, signed by their NEAR account, and see it in the published gallery.
- **FR-028**: Data gathered for a network at a given date MUST be kept and reused, never fetched again, once it is final on its chain; the shared map records its fingerprint.
- **FR-029**: Agents MUST be able to publish on a maker's behalf only with a key limited to publishing that cannot move funds.
- **FR-030** (amended 2026-11-05 by Elco, see `specs/002-system/`): Viewing flowers and making a flower with one's own agent MUST need no account, key or payment. Using Petal's own agent spends budget, so it needs sponsorship or the person's own payment.
- **FR-031**: Petal SHOULD show what it would cost to sponsor new coverage or a refresh, quoted through NEAR Intents so it can be paid from any chain; no payment is taken in the build without Elco's explicit approval.
- **FR-032**: The build MAY implement a subset of the primitive vocabulary; any primitive not yet implemented is declared unavailable to the agent and the user, never imitated.

### Key Entities

- **Network**: any set of participants with power between them; has an identifier, a kind, and public sources. A DAO, a protocol, a chain, or a non-crypto group.
- **Participant (account)**: a member of the network; may be a person, a group, a contract, a treasury or an exchange.
- **Power source**: something that confers power or privilege in that network (tokens, delegated votes, signer seats, roles, reputation, funding ties).
- **Interaction**: a relationship or event between participants (delegation, funding, co-signing, transaction, communication).
- **Common table**: the standard form every input is converted into: participants, holdings, relationships, events, each dated.
- **Visual primitive**: one drawable property of a flower (width, height, segment, colour, texture, extrusion, marking, inner line, and future additions).
- **Convention**: a mapping from behaviours to primitives; there is one default, and users can make their own.
- **Identity link**: a connection between a participant and a real person or organisation, with source and proven/inferred status.
- **Fusion**: a group of participants judged to be under common control, with its evidence.
- **Interpretation**: the agent's written reasoning about power in the network, with citations and unknowns.
- **Petal spec**: the declarative description of a flower: network, data snapshot and date, convention, grouping rules.
- **Shared map**: the published record on NEAR of specs, interpretations, data fingerprints and labels, each tied to the account that wrote it.
- **Maker**: a person or agent who makes a flower; publishes under a NEAR account.
- **Data snapshot**: the gathered data for a network at a date, stored once and named by its fingerprint.
- **Flower**: the rendered result of a spec; shareable, exportable, and changeable through conversation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can ask for a network nobody on the team prepared and receive its flower, with progress visible the whole time.
- **SC-002**: Shown two flowers (one widely shared, one concentrated) with no explanation, at least 9 in 10 people with no crypto knowledge correctly say which network is more concentrated.
- **SC-003**: 100% of mappings in every flower cite at least one source.
- **SC-004**: 100% of fused petals and identity links show their evidence and a proven/inferred label.
- **SC-005**: Re-rendering any flower from its spec and data gives an identical result in 100% of cases.
- **SC-006**: Flowers stay legible (every individual petal selectable) for networks of at least 1,000 participants, with the long tail grouped.
- **SC-007**: The hero set contains about 5 flowers from at least 4 clearly different kinds of systems.
- **SC-008**: A plain-language request to change a mapping produces a redrawn flower with an updated legend in a single exchange with the agent.
- **SC-009**: A judge following the README's steps reproduces a hero flower without any account or credentials.

## Assumptions

- Primary audience is anyone: the flower must be legible to a non-expert first, with expert detail underneath. Governance participants, researchers and journalists are the deep users; hackathon judges are the first audience.
- The delivery form (web platform, API, MCP server, agent skill, installable software) and the rendering approach are plan decisions; Elco prefers rendering in code (for example Three.js). The demo needs at least one form a judge can try without credentials.
- The on-chain input module comes first; which chains get data access first is a plan decision. Other input types are added only where nearly free. Step 1 showed keyless sources for NEAR (validators, delegators, Sputnik DAOs, House of Stake), Bitcoin and Ethereum.
- The hackathon build showcases as much of NEAR as is genuinely useful (decided 2026-11-04): NEAR AI Cloud as the brain of Petal's agent, NEAR for the shared map, NEAR accounts and limited keys for publishing, NEAR Intents for payment, an IronClaw skill, and NEAR's own governance as data. Non-NEAR alternatives are documented for later.
- Development writes to NEAR testnet; reads of chain data use mainnet.
- The hero set's five systems are chosen during planning, based on data completeness.
- All map data is public, and viewing needs no sign-in. Private workspaces exist as of `specs/002-system/` (amended 2026-11-05).
- Who may trigger new analyses and how Petal is paid for are decided after the architecture and are post-hackathon.
- Wallet messaging and peer-to-peer coordination between governors are out of scope for the hackathon build and described as roadmap.
- Creative competitions and saved searches are out of scope for the hackathon build.
- The Investment Thesis entry is produced from Petal's own output rather than as a separate product feature.

## Future Ideas (not decisions)

- Monetisation sketch: users who bring their own inference create any flower for free, and free flowers stay public; private flowers, or using Petal's own agent, are paid; subscriptions could follow.
- Wallet messaging, growing into a peer-to-peer space where governors coordinate, not only observe.
- Creative competitions around conventions and flowers.
- More primitives, discovered once the first flowers exist.

## Clarifications

### Session 2026-11-03

- Q: What can a user point Petal at? → A: Anything, on any chain; Petal is not a NEAR-only tool and says plainly when it can't read something yet.
- Q: Who can trigger new analyses, and how is it paid for? → A: Decided after the architecture; monetisation is post-hackathon.
- Q: One moment or over time? → A: Over time is the goal, built after the core vertical works and prioritised by viability; every flower is dated from the start.
- Q: Which flower opens the demo? → A: A hero set of about five flowers from very different systems, each a moment in history with undisputed data (candidates: The DAO hack, Bitcoin, Ethereum, NEAR as a network). Not House of Stake. Petal works on any network where power can be defined, not only DAOs.
- Q: Accept data users bring themselves? → A: One on-chain input module for certain; all input becomes a common tabular form, and other inputs are added where they are nearly free.
- Q: How live must the agent be? → A: Live generation on unprepared networks is the core capability, however long it takes.
- Q: Who is the first person we design for? → A: Anyone. Mission: make the world visually governable; a child should tell a shared network from a plutocracy or kleptocracy.
- Q: Fixed convention or the agent decides everything? → A: A default convention built from an open vocabulary of visual primitives; users change it by talking to the agent.

### Session 2026-11-04

- Q: What shape is a flower? → A: A bar chart made into a circle, built from straight edges: a polygon with one side per participant and a bar standing straight out from each side, cut into stacked segments where the data allows. No rounded petals. Width may vary only within a narrow band, or the polygon loses its shape.
- Q: How do people make flowers? → A: By talking. A chat with Petal's agent on the site, or the maker's own agent (Claude, Codex, IronClaw…) with the Petal skill; side controls are optional. A test showed a skill file and a small catalog are enough for a capable agent to produce the intended flower.
- Q: Who does the counting? → A: The tools. The agent interprets; every quoted figure is computed by Petal's tools (a small model misquoted a figure in the test).
- Q: Is publishing part of the hackathon? → A: Yes. Flowers are published to a shared map on NEAR, signed by the maker. Data gathered once is kept and reused, so Petal grows as a shared effort to map networks; data management is the make-or-break.
- Q: How much NEAR? → A: As much as is genuinely useful, each piece real and on the user journey: NEAR AI Cloud, the shared map on NEAR, NEAR accounts and limited keys, NEAR Intents, an IronClaw skill, NEAR governance data.
- Q: What comes first in the build? → A: Stand up every part on NEAR, thin, and prove the basic flow end to end; then deepen each function.
