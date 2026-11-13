# Feature Specification: the workspace, a small IDE for investigation

**Created**: 2026-11-08
**Status**: Draft. Nothing here is decided or built. The questions at the end are taken one at a time, with references and trade-offs, before anything is chosen.
**Parent**: `003-target` (Story 2, enter; Story 3, profile; Story 5, a workspace to come back to; Stories 6 to 8, claims and reading the map). Where this disagrees with `003-target`, `003-target` wins.
**Input**: the workspace behind `/make` needs more than a page with a chat, a flower and a list of chats: the look, feel and process of a small investigation IDE.

## The brief

The workspace page needs its look, feel and process defined, and so do the flowers: what other layers of information show on them, and how.

A person connects a wallet, then has as many interactions with agents as they like. What happens on connecting is to be defined: a wallet that holds governance somewhere may already suggest directions to investigate, or the person goes straight to the prompt. There will be a lobby, where their work sits to come back to, and a space to define their profile.

To the left, a collapsible menu holds conversation history, projects and other connections, and later features such as automations. The main space is whatever page the person is on, usually the chat itself, with the landscape of flowers behind it. Today each flower or graph a person found or made is an isolated universe; instead, a person flows through the spaces of what got mapped: an infinite canvas of ways to see data, interact with it, and add a meta layer of commentary to it.

## The parts

1. **Connecting a wallet.** What happens next is to be defined. A wallet that holds governance somewhere may already suggest where to look; or the person goes straight to the prompt: "let's look at this or that". A creative decision.
2. **The lobby.** A place where the person's work sits, to go back to.
3. **The profile.** A space where the person defines their profile.
4. **The left menu.** Collapsible. Conversation history, projects, other connections. Later: automations, or whatever we create.
5. **The page.** Whatever page the person is on; usually the chat itself, with the landscape of flowers behind it.
6. **One continuous space.** Not each flower or graph as an isolated universe: a person flows through the spaces of what got mapped.
7. **The meta layer.** Commentary on the data.

In short: an infinite canvas of ways to see data, with ways to interact with that data and add a meta layer of commentary to it.

## Earlier direction, still standing

- **The infinite canvas** (5 Nov): a campaign map, like a strategy game's, a visual feast you zoom in and out of, with mapped relations between flowers.
- **Three levels** (5 Nov): an account; a group, any group of accounts connected by a common thing, usually a token; relations between groups. Crossing those boundaries elegantly is what to design for.
- **The detective** (5 Nov): point the agent at any address, contract or person, and exploration starts there. Connecting a wallet lets the agent see holdings and suggest explorations. This is the same idea as part 1 above.
- **The flower as a shared place** (5 Nov): zoom, click, add to, comment on; almost a messaging platform, or a collaborative mapping exercise.
- **Your own section** (5 Nov): the explorations you made, so you can pick up later.
- **Chat and composer float over the canvas** (6 Nov): boxes a person can move and resize, in the illustrated terminal's language, so a conversation carries on at any zoom.
- **Like any IDE** (6 Nov): come back to the workspace and have different conversations; the composer shows context, model, effort and permissions, with send rather than Ask.
- **Notes and search** (6 Nov): notes are a good beginning for the claim and comments system. Notes are private by default.
- **Following** favourite wallets and addresses (6 Nov).
- **Another agent's conversation** (6 Nov): its output shows in Petals, with the composer grayed out saying where it's happening.
- **Each unit of work is code** (5 Nov): a flower's recipe is its own unit, separate from how it looks.
- **The agent speaks first** (5 Nov).
- **Claims** (`003-target`): signed, public, permanent, challengeable, each with its kind (observed, declared, inferred) and evidence; a claimer's standing comes from their record.

## What's on the page today, for contrast

`/make` on `main` is one canvas with five floating boxes over it: output, input, the flower's panel, the conversation list and the model box. Each conversation's flower is its own canvas. Switching conversation reloads the page. There is no lobby, profile, left menu or project, and flowers don't share a space.

## Decided

- **W1, 8 Nov: the map is public for now. Private maps come later, as a paid ("pro") feature, so the design leaves room for them.**

- **W4, 8 Nov: folders and conversations, defined by the person, as in any IDE. A conversation isn't tied to a flower or an investigation.** In one mode a person looks at published petals and adds to their mapping or asks about them; in another they create new mapping. While the design is open, the space stays as flexible as possible, an open investigation space for testing the journey.
  So:
  - **Two primitives:** folders and conversations. The person names, renames and arranges them; a folder can be a project or anything else.
  - **A conversation is disposable.** When its context fills, you start another.
  - **A conversation isn't attached** to a flower, a petal or an investigation.
  - **Two modes of work:** asking about or adding to flowers already on the map, and making new mapping.
  - **Ours to solve, in the tools and the skill:** making the difference understandable between just talking about something and using inference to read chain data and put something on the map.

- **W3, 8 Nov: a skeleton of a lobby, to sense what's needed.**
- **W2, 8 Nov, the direction: discovery, not a crime tool.** How much is suggested from the connected wallet is decided once the structure is in place and can be tested, in that direction. For the hackathon it feels like a discovery tool about the nature of power, not a serious let's-find-crime detective tool. Starting from your own wallet gives reasons to engage, but it could be somebody else's. Agents learn to look at an address: if it's an end user's wallet rather than an organisation or a contract, they offer insights and possible continuations (this user belongs to this and this; there's no map for this, do you want to map it?), so it becomes a social exploration space people enjoy.
  The tool for reading an end-user wallet is the skill's and the tools' work, not the workspace's.

## What Petals is looking at

A universal map built by the community: the shape of the governance landscape, unlike Arkham, where the object of an investigation is a transaction or agents making transactions. An on-chain organisation of any kind (Bitcoin as a whole, a DAO, a multisig) is any group of wallets that have something in common, usually something they hold or did. A flower can be everyone that voted on proposal X, everyone that sent or received funds from a wallet between two dates, or everyone in an options contract: a comparative analysis of a set of parameters across a group of entities that share them, shown one visual way.

So a flower is **a group of wallets that share something they hold or did, compared on a set of parameters, drawn one way**. Petals' map is a governance landscape built by the community, not a trail of transactions.

**The infinite map:** there's a layer for looking at a wallet and one for a group of wallets that share a thing (a DAO, the holders of one token). What's to solve is the space between: zooming out of the one thing you're looking at to see a landscape, and how groups connect or not. The ideal is an ongoing canvas people want to grow; the question is where the code already points, and how to expand in that direction.

This is W9. The code is read first, to see where it already points.

## Notes on `research.md`, 8 Nov

On "Different from Petals":

- **What they do, not who they are.** On "'This wallet belongs to X' is exactly what drew Arkham's dox-to-earn backlash": that isn't a core claim of the product, although it could be used for it. Since a wallet's history of actions across the space shows its incentives, it doesn't matter who they are, but what they do.
- **Private work is the same business model as Arkham's secrecy.** On "Arkham even sells 90 days of secrecy": the same business model. This is W1's paid private maps.
- **Their own AI is how Petals wins.** On "Whose AI": people aren't locked into artificial scarcity and get value immediately, which makes the platform itself more valuable.
- **The profile: cool and clear in the first second.** On "Intel Desk's case list on a profile is the nearest match": Petals is different; how to be cool and easy to understand in the first second is open, W6.
- **The infinite map as a force map of connected universes (W9).** On "shared master list": links that bridge two investigations make a force map of connected universes, so it feels like an infinite canvas with discrete addresses. Still to be solved.

## The interaction model, reopened (8 Nov, after the first live test)

NEAR AI bills its own accounts and keys, never a wallet, and nobody publishes how many people hold a key (research, 8 Nov). That breaks the assumed model, where people type into the site's chat box and get answers there through NEAR AI: Petals would have to help each person get a key and stake from their NEAR wallet. Chatting through a separate agent in a terminal works, but isn't an elegant process for most people. So the interaction model is reconsidered: whether, and how, the conversation happens in the site's own chat box.

- **W10. Where the conversation happens, and whose model answers.** Open. The full set of options (A to H), with sources and what's tested, was weighed separately, with NEAR AI's wallet paths. The catch that shapes all of them: a public site reads nothing for visitors, so a model in the browser tab needs the reading done in the tab too (fewer tools), or Petals' file running on the person's computer.

Testing moves to one development machine, so the conversations can be read and what people run into shapes the skill and the tools.

## Ideas, not decided

- **Points for mapping** (8 Nov): points for mapping work, counted from layers others build on.

## Questions to decide, one at a time

Each gets references and trade-offs in plain words before one is chosen.

- ~~**W1. Whose map is the canvas?**~~ Decided above.
- **W2. After connecting a wallet.** Direction set above; how much is suggested waits for testing.
- ~~**W3. Lobby and canvas.**~~ A lobby skeleton first, above.
- ~~**W4. What a project is.**~~ Decided above: folders and conversations.
- **W5. The left menu, first version.** Folders and conversations, from W4. What else is in it on day one, and what waits.
- **W6. The profile.** A page or a panel; overlaps `003-target`'s Q3 and Q6.
- **W7. The meta layer.** For now: the options for claims and metadata over the map, all private at first (a person adds commentary to their map and sees it again later); claim validation is a later chapter, after basic testing. `003-target` Story 6 holds it: private to the account (TGT-006, TGT-007). Open: what commentary and metadata attach to (a flower, an account, a group, a relation, a place on the canvas), what they hold, how they show, and how an agent adds them. References being studied; storage is the data side's.
- **W8. The flower's visual primitives.** Open, led by the look's side, with the data side for the spec. The visual primitives still need finalising: today there's no colour, no texture and no relationships inside the graph. On the tools' side it's acquiring the data and drafting it onto the graph; then a front-end component shows it on the page. In a live session a flower couldn't show proposals per holder next to shares. Starting points: the spec's primitives (width, height, colour, outline, segments, lines, markings, order, texture), and the 5 Nov sketch's switchable encodings. What each channel encodes, and how the data reaches it, is decided before building. **Two systems, 9 Nov:** the data protocol and the visual protocol, which don't block each other. So W8 is the visual protocol, versioned on its own: how a view turns a dataset's layers and measures into a flower (channels, encodings, relations inside the flower, time). The data side and the seam are written in `005`; the look's side leads the visual side, after the chat box.
- **W9. In code.** How many flowers share one space, where each sits, and how relations between them are drawn. Technology, decided after the shape.

## References being studied

Arkham Intelligence and Maltego, and a few others (crypto investigation tools, graph and canvas tools, IDE layouts). Findings go to `research.md` next to this file.
