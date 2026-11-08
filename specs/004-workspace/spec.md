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

## Ideas, not decided

- **Points for mapping** (Elco, 8 Nov): "I had a vision of incentivizing mapping via 'points' that could one day move us towards a TGE -> users pay for extra features, part of revenue goes to a DAO, part of revenue rewards work, part of revenue goes to Devs." Payments are `003-target`'s Q8, later, in their own spec.

## Questions to decide, one at a time

Each gets references and trade-offs in plain words before Elco chooses.

- ~~**W1. Whose map is the canvas?**~~ Decided above.
- **W2. After connecting a wallet,** where does a person land: the lobby, the chat, or suggestions from what the wallet holds?
- **W3. Lobby and canvas.** Is the lobby its own page, or the same canvas seen from far away?
- ~~**W4. What a project is.**~~ Decided above: folders and conversations.
- **W5. The left menu, first version.** Folders and conversations, from W4. What else is in it on day one, and what waits.
- **W6. The profile.** A page or a panel; overlaps `003-target`'s Q3 and Q6.
- **W7. The meta layer.** Elco, 8 Nov, through META: "Claims -> for now we just need to look on our options for claims + metadata over the map, all could be private at first (I just add my commentary to my map and can see it again later) -> for claim validation etc, thats a chapter after we do basic testing." `003-target` Story 6 holds it: private to the account (TGT-006, TGT-007). Open: what commentary and metadata attach to (a flower, an account, a group, a relation, a place on the canvas), what they hold, how they show, and how an agent adds them. References being studied; storage asked of SYSTEMS.
- **W8. The flower's layers.** What information shows on and around a flower, at what distance, and how. Elco's second thread; it follows W1 and W7.
- **W9. In code.** How many flowers share one space, where each sits, and how relations between them are drawn. Technology, decided after the shape.

## References being studied

Arkham Intelligence and Maltego, which Elco named, and a few others (crypto investigation tools, graph and canvas tools, IDE layouts). Findings go to `research.md` next to this file.
