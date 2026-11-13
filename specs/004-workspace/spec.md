# Feature Specification: the workspace, a small IDE for investigation

**Created**: 2026-11-08
**Status**: Draft. Elco is describing it. Nothing here is decided or built. The questions at the end are taken one at a time, with references and trade-offs, before anything is chosen.
**Parent**: `003-target` (Story 2, enter; Story 3, profile; Story 5, a workspace to come back to; Stories 6 to 8, claims and reading the map). Where this disagrees with `003-target`, `003-target` wins until Elco says otherwise.
**Input**: Elco, 8 Nov, to LOOK.

## Elco's words, 8 Nov

> The "workspace" page (that is currently behind /make) - it is deeply confused - we will need more than "a page with a chat and a flower and a list of chats) - we need to define the look and feel and process of this little "IDE" investigation environment.

> We also can do work on the flowers themselves and what other layers of information show up and how - everything so far has been improvisational and shooting off the hip, let's reign it in

> I'm a user, I connected, right? So I connected with a wallet, then I have the opportunity to have as many interactions with agents as I can. We have to define what happens when I connect the wallet, because depending if I connect that wallet with a wallet that holds governance in places, this might already be an insinuation of investigative directions, but maybe the user might go for the prompt and say let's look at this or that, so we have to have a creative decision making around this. But what I do understand now is that certainly there is going to be a lobby situation, a place where the work that I've done sits, that I can go back to it, there's probably a space where I can define my profile, all these things need to be defined.

> It's very likely that to the left there will be a collapsible menu where conversation history and projects and other connections sit, and where future features like automations or whatever that we create could show up. Then we have the space in which whatever page the user is in, and that would usually be the chat itself, where they have the landscape of flowers behind it. And then we have to define how that happens in code, because right now we are seeing each shape or flower or graph that a user has found or created as an isolated universe, which I wish we didn't. I wish I could just flow through the spaces of what got mapped. So we need to take steps into defining the creative space of this app as a sort of infinite canvas of ways to see data, with ways to interact with that data, and to add a meta layer of commentary to that data, basically.

(Voice, lightly punctuated.)

## The parts, as Elco named them

1. **Connecting a wallet.** What happens next is to be defined. A wallet that holds governance somewhere may already suggest where to look; or the person goes straight to the prompt: "let's look at this or that". Elco: "a creative decision".
2. **The lobby.** "A place where the work that I've done sits, that I can go back to."
3. **The profile.** "A space where I can define my profile."
4. **The left menu.** Collapsible. Conversation history, projects, other connections. Later: automations, or whatever we create.
5. **The page.** Whatever page the person is on; usually the chat itself, with the landscape of flowers behind it.
6. **One continuous space.** Not each flower or graph as an isolated universe: "I wish I could just flow through the spaces of what got mapped."
7. **The meta layer.** Commentary on the data.

Elco's summary: "an infinite canvas of ways to see data, with ways to interact with that data, and to add a meta layer of commentary to that data".

## What Elco said before, still standing

- **The infinite canvas** (5 Nov): a campaign map, "like Civilization or Napoleon: Total War", a visual feast you zoom in and out of, with mapped relations between flowers.
- **Three levels** (5 Nov): an account; a group, "any group of accounts connected by a common thing", usually a token; relations between groups. "Crossing those boundaries elegantly. That's kind of what we have to design for."
- **The detective** (5 Nov): point the agent at any address, contract or person, and exploration starts there. Connecting a wallet lets the agent see holdings and suggest explorations. This is the same idea as part 1 above.
- **The flower as a shared place** (5 Nov): zoom, click, add to, comment on; "almost a messaging platform, or a collaborative mapping exercise".
- **Your own section** (5 Nov): the explorations you made, so you can pick up later.
- **Chat and composer float over the canvas** (6 Nov): boxes a person can move and resize, in the illustrated terminal's language, so a conversation carries on at any zoom.
- **Like Orca or any IDE** (6 Nov): "come back to my workspace and have different conversations"; the composer shows context, model, effort and permissions, as Fire solves it, with send rather than Ask.
- **Notes and search** (6 Nov): "notes are a good beginning for the claim / comments system". Notes are private by default.
- **Following** favourite wallets and addresses (6 Nov).
- **Another agent's conversation** (6 Nov): its output shows in Petals, with the composer grayed out saying where it's happening.
- **Each unit of work is code** (5 Nov): a flower's recipe is its own unit, separate from how it looks.
- **The agent speaks first** (5 Nov).
- **Claims** (`003-target`): signed, public, permanent, challengeable, each with its kind (observed, declared, inferred) and evidence; a claimer's standing comes from their record.

## What's on the page today, for contrast

`/make` on `main` is one canvas with five floating boxes over it: output, input, the flower's panel, the conversation list and the model box. Each conversation's flower is its own canvas. Switching conversation reloads the page. There is no lobby, profile, left menu or project, and flowers don't share a space.

## Decided

- **W1, 8 Nov: the map is public for now. Private maps come later, as a paid ("pro") feature, so the design leaves room for them.** Elco: "having private maps is an extra feature - I was thinking that this could be one of the "pro" features - for now the map is public". "So the possibilty should eventually exist to map privately."

- **W4, 8 Nov: folders and conversations, defined by the person, as in any IDE. A conversation isn't tied to a flower or an investigation.** Elco:
  > there is one mode of interaction where I'm looking at already published petals and adding to their mapping or asking about them. And there's also situations where I'm creating new mapping. I think that the best primitives we can have right now is folders and conversations and they could be whatever and it's up for the user to define them.

  > they should be able to organize into folders and projects and rename them and add conversations and conversations are a disposable unit because then the agent, the context window gets full, etc. So the system here is very much how any IDE would work. But I don't think conversation is like it is right now attached to a petal or to an investigation. We need to be more flexible than this.

  > especially now where we're still designing, it needs to be as flexible as possible, an open investigation space so I can do testing and then I can have a sensation of the user journey and we move forward from there.

  So:
  - **Two primitives:** folders and conversations. The person names, renames and arranges them; a folder can be a project or anything else.
  - **A conversation is disposable.** When its context fills, you start another.
  - **A conversation isn't attached** to a flower, a petal or an investigation.
  - **Two modes of work:** asking about or adding to flowers already on the map, and making new mapping.
  - **Ours to solve, in the tools and the skill:** making the difference understandable between just talking about something and using inference to read chain data and put something on the map.

- **W3, 8 Nov: a skeleton of a lobby, to sense what's needed.** Elco: "there's no lobby right now yes there isn't and that's a problem let's get at least a skeleton of a lobby in there so we can sense what's needed or not."
- **W2, 8 Nov, the direction: discovery, not a crime tool.** How much is suggested from the connected wallet is decided once the structure is in place and Elco can test it, "but we should go in that direction". Elco:
  > at least in the view one for the hackathon it should feel like not like a serious open source detective let's find crime tool but more discovery exploration about the nature of power tool and that's nice because it's starting from your own wallet, you have reasons to engage but this also could be somebody else's wallet

  > there's going to be some form of a function or a tool where we will teach the agents to looking at an address that if it's not an organization or a contract but if it's an end user wallet, it could come up with insights and future and possible continuation explorations like this user belongs or if it's my wallet, you but then if it's somebody else's wallet, it would say this user belongs to this and this and this, do you want to know more about there's no map for this, do you want to map this so it could become sort of a social network exploration space that people enjoy

  The tool for reading an end-user wallet is the skill's and the tools' work, not the workspace's.

## What Petals is looking at (Elco, 8 Nov)

> we have a universal map being built in community at least that's how i see the app getting the most traction first right so we want to see the shape of the governance landscape and differently to arkham where the objective of the investigation is a transaction or agents making transactions

> what is an on-chain organization of any kind could it could be bitcoin as a whole or it could be a dow or it could be a multi sig it's actually any wallets group of wallets that have something in common usually something that they hold or maybe even that they that they did

> if i ask like let's make a shape or a flower or whatever we decide to call the unit of a group of wallets it's like everyone that voted on proposal x or everyone that sent or received funds from this wallet between said dates that would actually create a visual representation just the same right we could even do this for anyone that is participating in this options contract or things like this so that is our way of of viewing it's a way it's a comparative analysis of a certain set of parameters with a group of entities that share that parameter with a specific visual way of showing it

So a flower is **a group of wallets that share something they hold or did, compared on a set of parameters, drawn one way**. Petals' map is a governance landscape built by the community, not a trail of transactions.

**The infinite map, Elco's question:**
> now how do we technically solve for the sensation of an infinite map is what we have to define i do know that there is the the looking at a wallet layer looking at a group of things layer meaning a group of wallets that share a thing in common which would be a dow or whatever right they hold the same token now what we have to solve for is the space between how do i zoom out of the one thing i'm looking at and then see it as a landscape and how groups connect to each other or not

> my ideal sensation would be a ongoing canvas that you feel compelled to even make it grow more if i look at my code right now where where does the situation seem to be pointing at that's what i want to know and how can we expand in the right direction

This is W9. LOOK reads the code first and reports where it already points.

## Elco's comments on `research.md`, 8 Nov

Left in Orca on "Different from Petals".

- **What they do, not who they are.** On "'This wallet belongs to X' is exactly what drew Arkham's dox-to-earn backlash": "we should not make this as a core claim of our product, although it could be used for it, that's not the goal - I guess the main insight here is - since you can see their history of actions across the entire space and use it to understand their incentives, it doesnt matter who they are, but what they do."
- **Private work is the same business model as Arkham's secrecy.** On "Arkham even sells 90 days of secrecy": "I consider the same business model". This is W1's paid private maps.
- **Their own AI is how Petals wins.** On "Whose AI": "we win by doing this because people are not locked into artificial scarcity and get value immediately, making the platform itself more valuable".
- **The profile: cool and clear in the first second.** On "Intel Desk's case list on a profile is the nearest match": "yep we are different - here lets brainstorm on how we can be cool and easy to understand at the first second". Open, W6.
- **The infinite map as a force map of connected universes (W9).** On "shared master list": "my vision here is that if we can identify "links" between 2 investigations that bridge them, we can have a "force map" of individual universes that are connected, so it feels like an infinite canvas, but it has discreet "addresses" this is still to be solved".

## The interaction model, reopened (Elco, 8 Nov, after the first live test)

NEAR AI bills its own accounts and keys, never a wallet, and nobody publishes how many people hold a key (LOOK's research, 8 Nov). Elco:

> it completely destroys our interaction model, Assumed that people would be able to Write Into a checkbox box and get answers right there that that would only be possible if near AI and That makes near AI quasi impossible like we would have to facilitate the getting of the key and the staking somehow if you know from from their near wallets

> we haven't figured out a way to chat within the app or the websites With our own AI and I'm using it with cloud code Here on the other computer and it's kind of ugly and annoying it would be Not an elegant process for someone without seven monitors like I have

> We need to reconsider the interaction mode or how we could actually have this happen inside the chat box on the website itself or not or if we want that or not.

- **W10. Where the conversation happens, and whose model answers.** Open. The full set of options, with sources and what's tested, is CONNECTORS's `design/connectors.md`, section 1H (A to H), and RESEARCH's `research/near-ai-wallet-update.md` for NEAR AI's wallet paths. The catch that shapes all of them: a public site reads nothing for visitors, so a model in the browser tab needs the reading done in the tab too (fewer tools), or Petals' file running on the person's computer.

Elco moves testing to this machine, so LOOK can read the conversations and let what Elco runs into shape the skill and the tools.

## Ideas, not decided

- **Points for mapping** (Elco, 8 Nov): points for mapping work, counted from layers others build on.

## Questions to decide, one at a time

Each gets references and trade-offs in plain words before Elco chooses.

- ~~**W1. Whose map is the canvas?**~~ Decided above.
- **W2. After connecting a wallet.** Direction set above; how much is suggested waits for testing.
- ~~**W3. Lobby and canvas.**~~ A lobby skeleton first, above.
- ~~**W4. What a project is.**~~ Decided above: folders and conversations.
- **W5. The left menu, first version.** Folders and conversations, from W4. What else is in it on day one, and what waits.
- **W6. The profile.** A page or a panel; overlaps `003-target`'s Q3 and Q6.
- **W7. The meta layer.** Elco, 8 Nov, through META: "Claims -> for now we just need to look on our options for claims + metadata over the map, all could be private at first (I just add my commentary to my map and can see it again later) -> for claim validation etc, thats a chapter after we do basic testing." `003-target` Story 6 holds it: private to the account (TGT-006, TGT-007). Open: what commentary and metadata attach to (a flower, an account, a group, a relation, a place on the canvas), what they hold, how they show, and how an agent adds them. References being studied; storage asked of SYSTEMS.
- **W8. The flower's visual primitives.** Open, led by LOOK with Elco, the spec side with SYSTEMS. Elco, 9 Nov, through META: "we also have to now finalize and discuss the visual primitives of our graphs, because right now we don't have color, we don't have texture, we don't have the internal relationships inside the graph. On the tooling side it's about the acquisition and the capacity to draft it out on the graph, and then there's a front end component of how it shows on the page." In Elco's live session a flower couldn't show proposals per holder next to shares. Starting points: the spec's primitives (width, height, colour, outline, segments, lines, markings, order, texture), the 5 Nov sketch's switchable encodings (`research/spikes/flower/index.html`), and `design/flower-language.md`. What each channel encodes, and how the data reaches it, is decided with Elco before building. **Two systems, 9 Nov:** Elco: "We need 2 different systems that shouldn't block each other - one is the data protocol and the other is "how to make it visual" protocol." So W8 is the visual protocol, versioned on its own: how a view turns a dataset's layers and measures into a flower (channels, encodings, relations inside the flower, time). SYSTEMS writes the data side and the seam in `005`; LOOK leads the visual side with Elco, after the chat box.
- **W9. In code.** How many flowers share one space, where each sits, and how relations between them are drawn. Technology, decided after the shape.

## References being studied

Arkham Intelligence and Maltego, which Elco named, and a few others (crypto investigation tools, graph and canvas tools, IDE layouts). Findings go to `research.md` next to this file.
