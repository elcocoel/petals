# Research: private commentary and metadata over a public map (W7)

**Created**: 2026-11-08
**Feeds**: `spec.md`, W7. Storage options from the data side are at the end of `research.md`.
**Method**: public docs only. Solscan and Miro refused direct fetch; their lines come from search excerpts and say "excerpt". Anything read between the lines says "inferred".

## In one paragraph

The closest models are the block explorers and Arkham, for private labels on public data; Kumu and Maltego, for metadata that changes the view; Figma and Felt, for pins on a canvas. Almost nothing says how notes an AI agent made are marked or approved.

## Per product

**Etherscan**
1. **Attaches to:** addresses (a private name tag and an optional private note) and transactions (a private note) ([address tags](https://info.etherscan.com/address-tag-note), [tx notes](https://info.etherscan.com/transaction-private-notes)).
2. **Holds:** a tag up to 35 characters, a transaction note up to 100. Free: 5,000 tags and 10,000 notes; Premium doubles both ([premium](https://etherscan.io/premium-account)). Fields, colours, confidence: not found.
3. **Shows:** your tag replaces the address in your view, transactions tab included, and is listed under Private Name Tags. "Adding your own name tag will override the public label" ([address tags](https://info.etherscan.com/address-tag-note)). Filtering by tag: not found.
4. **Agent:** not found.
5. **Private signal:** only you see them, when logged in.

**Blockscout**
1. **Attaches to:** addresses, transactions, watchlist entries ([private tags](https://docs.blockscout.com/using-blockscout/my-account/private-tags), [watchlist](https://docs.blockscout.com/using-blockscout/my-account/watchlist)).
2. **Holds:** a tag up to 35 characters, emojis allowed; no note. Watchlist entries add transfer alerts by email.
3. **Shows:** a grey tag next to any other tags.
4. **Agent:** not found.
5. **Private signal:** only when logged in; grey sets it apart from public tags, which are reviewed by hand ([public tags](https://docs.blockscout.com/using-blockscout/my-account/public-tags)).

**Solscan** (excerpt)
1. **Attaches to:** accounts, programs, transactions, through "Add notes" ([labels](https://info.solscan.io/how-to-add-personal-labels/)).
2. **Holds:** a label and a note, up to 1,000 accounts.
3. **Shows:** in the transactions, transfers, DeFi and NFT tabs. The opposite of Etherscan: if an address has a public name, your private name isn't shown ([names](https://info.solscan.io/public-names-and-private-names/)).
4. **Agent:** not found. 5. **Private signal:** hidden from other users.

**NearBlocks:** no docs found on private tags or notes ([about](https://nearblocks.io/about)).

**Arkham**
1. **Attaches to:** addresses, grouped into private custom entities. "Add to Entity" privately links an address to an existing Arkham entity ([add to entity](https://info.arkm.com/announcements/add-to-entity-feature-update)). Bulk upload: 50 addresses at a time ([bulk](https://info.arkm.com/announcements/add-clusters-of-addresses-to-arkham-with-bulk-upload)).
2. **Holds:** an entity name and a label per address. Notes, confidence: not found.
3. **Shows:** custom labels in a different colour with a perforated circle; alerts on them carry "[CUSTOM]" ([custom labeling](https://info.arkm.com/announcements/updates-to-custom-labeling)).
4. **Agent:** not found.
5. **Private signal:** "not viewable by anyone else". The perforated mark came in May 2023, after users' screenshots of their own wrong labels went viral and were taken for Arkham's attributions ([same](https://info.arkm.com/announcements/updates-to-custom-labeling)).

**Nansen**
1. Wallets, through "Manage Labels" ([academy](https://academy.nansen.ai/articles/2149924-labels-and-watchlists-101)). 2. A name and more labels. 3. "Across all of Nansen's dashboards". 4. and 5. Not found.

**Google Maps**
1. **Attaches to:** places, through private labels and through saved lists with a note per place ([labels](https://support.google.com/maps/answer/6257830), [lists](https://support.google.com/maps/answer/7280933), [notes](https://www.notebookcheck.net/Google-Maps-introduces-the-ability-to-add-notes-to-its-Lists-feature.428465.0.html)).
2. **Holds:** a label is a short name; a list has a name, a description and an icon ([create list](https://support.google.com/maps/answer/7546473)); the emoji icon is per list, not per place ([9to5google](https://9to5google.com/2023/09/06/google-maps-saved-places-icon-emoji/)).
3. **Shows:** labeled places appear on your map, in search suggestions and in Google Photos ([labels](https://support.google.com/maps/answer/6257830)). Custom labels show as a blue flag that stays visible zoomed out ([BGR, third party](https://www.bgr.com/2221772/how-to-use-google-maps-labels-feature-guide/)). Each list has "Hide on your map" and "Show on your map" ([lists](https://support.google.com/maps/answer/7280933)).
4. **Agent:** not found.
5. **Private signal:** labels are "only you can see" ([BGR](https://www.bgr.com/2221513/google-maps-edits-arent-always-private/)). Lists are Private or Shared by link, with no public option. Edits suggested to the public map are a separate, public path.

**Felt**
1. **Attaches to:** a comment pins to a location, saves the map view, and can tag a nearby feature ([commenting](https://help.felt.com/sharing-and-collaboration/commenting)). Annotations: pins, lines, polygons, text, notes, links, images ([annotations](https://help.felt.com/annotations/annotations)).
2. **Holds:** comments hold text, @mentions, photos, replies; annotations hold a name, an image, name–value "Attributes" and a style.
3. **Shows:** a list of unresolved comments, each jumping to its saved view. Shift+C hides comments. Resolving takes a thread off the map but keeps it. Groups show in the legend and switch on and off ([blog](https://www.felt.com/blog/comments-public-feedback-and-grouping)).
4. **Agent:** Felt AI adds layers, styles, filters and annotations, live for everyone, and "Felt AI edits can't be undone"; with view-only access it works on a copy ([AI](https://help.felt.com/felt-ai/ai-assistant)). Outside agents can create, update and delete annotations through Felt's MCP tools ([MCP](https://help.felt.com/felt-ai/mcp)). Marking of AI-made items: not found.
5. **Private signal:** none. "Everyone with access sees them".

**Figma / FigJam**
1. **Attaches to:** comments pin to a frame, a layer or canvas coordinates ([move comments](https://help.figma.com/hc/en-us/articles/360041547853)); they detach when the layer is cut and pasted, and can't pin to nested layers ([forum](https://forum.figma.com/t/attach-comments-to-nested-frames/22080)). Annotations attach to layers ([annotations](https://help.figma.com/hc/en-us/articles/20774752502935)).
2. **Holds:** comments: text, mentions, threads. Annotations: a note, "pinned" layer properties that update as the design changes, and a coloured category (four presets; editors add more).
3. **Shows:** pins cluster as you zoom out; hovering a cluster shows the count and the authors. A sidebar sorts and filters ("Only your threads", "Show resolved"); Shift+C hides all ([view comments](https://help.figma.com/hc/en-us/articles/360041547593-View-and-manage-comments)). Annotations filter by category or hide from the View menu.
4. **Agent:** FigJam AI writes back as new stickies; "for some features, like summarize stickies, Figma will indicate when an output is AI-generated" ([FigJam AI](https://help.figma.com/hc/en-us/articles/16822138920343)). Stickies show their author's name by default ([third party](https://fltmag.com/?p=8461)). Accept or reject: not found.
5. **Private signal:** no private comments found.

**tldraw**
1. **Attaches to:** every shape, page and binding has a `meta` field for app data, stored and synced but never read by tldraw ([shapes](https://tldraw.dev/docs/shapes)).
2. **Holds:** any JSON; the docs' example stamps a `createdBy` on every new shape.
3. **Shows:** up to the app.
4. **Agent:** the starter kit reads a screenshot plus the shape data; the user can hand it shapes, or a point or area; shapes change "incrementally as each action finishes streaming", each action listed in the chat panel ([agent kit](https://tldraw.dev/starter-kits/agent)). The agent can leave itself notes in a `note` field on custom shapes ([repo](https://github.com/tldraw/agent-template)). Marking agent shapes, accept or reject: not found.
5. **Private signal:** not found.

### Briefer

- **Kumu:** every element, connection and loop has a profile: label, type, description, tags, image, custom fields ([profiles](https://docs.kumu.io/guides/profiles)). Colour or size by any field; a multi-value field such as Tags draws "flags", coloured arcs around each element, one per value ([flags](https://docs.kumu.io/guides/decorate/flags)). Filters show or hide by field value ([filter](https://docs.kumu.io/guides/filter)).
- **Maltego:** entities carry notes, bookmarks and overlays. Bookmarks are five colours with no fixed meaning; you can select every entity of one colour and act on them together ([bookmarks](https://docs.maltego.com/en/support/solutions/articles/15000059547-categorizing-key-findings-with-bookmarks)). Overlays show a property as colour, text or image around the icon; links carry a label, colour, style and custom properties, with "Confidence Score" as the docs' example ([features](https://support.maltego.com/en/support/solutions/articles/15000062339-entity-features-overlays-links-notes-)). Entities with notes show a yellow page icon; one global setting shows or hides notes ([notes](https://docs.maltego.com/en/support/solutions/articles/15000060295-adding-notes-to-entities)).
- **Hypothesis:** annotations anchor to quoted text with the words around it, matched fuzzily ([fuzzy anchoring](https://web.hypothes.is/blog/fuzzy-anchoring/)). If the text goes, the annotation moves to "Orphans" with its anchor crossed out ([orphans](https://web.hypothes.is/help/what-are-orphans-and-where-are-they/)). Visibility: Public, Group or Only Me, which shows a small lock and can be switched any time ([private](https://web.hypothes.is/help/making-an-annotation-private/)). People use Only Me as drafts before sharing ([drafts](https://web.hypothes.is/help/saving-draft-annotations-before-sharing-with-your-group/)).
- **Obsidian:** properties are YAML at the top of each note: Text, List, Number, Checkbox, Date, Date & time, Tags ([properties](https://obsidian.md/help/properties)). Canvas files are JSON nodes and edges, each with an optional label and a colour ([JSON Canvas](https://jsoncanvas.org/spec/1.0/)). Plain text on disk, so any local agent can read and write it (inferred).
- **Miro** (excerpt): each item's info box records when AI made or changed it; copies keep the label ([Miro](https://help.miro.com/hc/en-us/articles/37946304349714-Miro-AI-attribution-and-transparency)).
- **Notion:** in "plan mode" the agent edits nothing until you approve its plan ([Notion](https://www.notion.com/help/review-and-approve-plans-before-notion-ai-runs)).

## Patterns

1. **Your label replaces the public name in your own view.** Etherscan, Google Maps; Solscan does the reverse. *Gains:* your words where you read. *Costs:* your view can mislead you, and a screenshot passes your label off as fact (Arkham, 2023).
2. **A visible "mine, not the platform's" mark.** Arkham's perforated circle, Blockscout's grey, Hypothesis's lock. *Gains:* survives screenshots. *Costs:* a second visual language on the map.
3. **A short label and a longer note, kept apart.** Etherscan, Solscan, Google Maps. *Gains:* the label fits where the name was; the note holds the reasoning. *Costs:* two fields to explain.
4. **Tags, colours or lists that change the view.** Kumu flags and colour-by, Maltego bookmarks, Google Maps lists, Figma categories, Felt legend groups. *Gains:* your metadata becomes a way to look at the map. *Costs:* competes with the map's own colours; several tags need a rule.
5. **Pins that cluster, plus a side list as the index.** Figma, Felt, Hypothesis. *Gains:* scales; the list jumps to each one. *Costs:* clutter; clustering needs design.
6. **Anchor to an object or a place, and decide what happens when the anchor goes.** Figma, Felt, Hypothesis's orphans. *Gains:* notes survive change. *Costs:* an "orphans" home.
7. **Fields on links as well as on things.** Kumu connections, Maltego link properties. *Gains:* comments on relations, Petals' third level. *Costs:* schema choices.
8. **AI authorship recorded per item and shown quietly; approval is rare.** Miro, FigJam, tldraw's `meta`, Notion's plan approval; Felt applies changes live with no undo. *Gains:* trust. *Costs:* approval friction, or risk without it.

## Options for Petals (not chosen)

**1. What notes attach to**
- **A. Objects only:** an account (petal), a flower or group, a relation. *Gains:* simple, and notes survive re-layout. *Costs:* no home for a hunch about an area or a loose set.
- **B. Objects plus free pins on the canvas** (Figma, Felt). *Gains:* room for half-formed thoughts. *Costs:* if the layout moves, pins drift, and orphans need a home (inferred).
- **C. Objects plus saved sets of your own, each note linked to the conversation it came from** (Google Maps lists, Arkham entities, Maltego bookmarks). *Gains:* people build their own groups, and each note remembers its source. *Costs:* a set overlaps with what a flower is.

**2. What they hold**
- **A. A label and a note.** *Gains:* minimal. *Costs:* text search only.
- **B. Label, note and tags, with a colour per tag.** *Gains:* makes 3C possible. *Costs:* tags multiply.
- **C. B plus key–value fields, evidence links and confidence.** *Gains:* the parts a public, signed claim needs later (inferred). *Costs:* heavy forms, unless the agent fills them.

**3. How they show**
- **A. Your label in place of the name, with a private mark** (Etherscan plus Arkham). *Gains:* reads naturally. *Costs:* blurs your words with chain facts.
- **B. A badge or pin on the thing, a side panel on click, clusters far out.** *Gains:* the public map stays clean. *Costs:* one more click to read.
- **C. A lens:** tags drive colour or flags, filter or hide by them; a Kumu-style ring of arcs around a flower is the direct analogue (inferred). *Gains:* your metadata reshapes the view. *Costs:* competes with the flower language and needs design.

**4. How the agent adds them**
- **A. The agent writes directly; each item says who wrote it, you or the agent** (FigJam, Miro, tldraw). *Gains:* fast. *Costs:* noise; trust depends on easy undo, which Felt lacks.
- **B. The agent proposes, the person accepts or rejects each** (Notion). *Gains:* the person stays the author. *Costs:* a growing queue.
- **C. The agent writes to its own draft layer; the person promotes items in bulk** (Hypothesis drafts, Felt's copy). *Gains:* clean separation, bulk accept. *Costs:* two layers to understand.

**5. How private is signalled**
- **A. A mark on every private item** (Arkham, Blockscout, Hypothesis). *Gains:* survives screenshots. *Costs:* visual load.
- **B. One "your layer" switch with a clear on-state** (Google Maps lists, Figma's Shift+C, Maltego). *Gains:* the public map stays pure when off. *Costs:* easy to forget it's on (inferred).
- **C. Private only when signed in, plus one line saying only you see your notes** (the explorers). *Gains:* least UI. *Costs:* weakest signal; Arkham shows how screenshots leak it.

## Worth a look

- Etherscan, private tag beside a public tag: https://info.etherscan.com/address-tag-note/images/2023/03/Address-name-tag-1.png
- Kumu flags (arcs around elements): https://1181816445-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2FkXSW1nEf49ISqGxYuRfS%2Fuploads%2Fgit-blob-93471c9e82ba89ffc31e37b094f39ebdb459c05b%2Fflags-with-filter.png?alt=media
- Felt comment box: https://217108486-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2FmRfGitkyjOEMvVsEyGWN%2Fuploads%2Fgit-blob-48bf1d1bafb90658113ccf80e5d5e0d78f012698%2Fcomment-box-new.webp?alt=media
- Figma annotation with a category: https://help.figma.com/hc/article_attachments/31044023652247
- Hypothesis lock icon: https://d242fdlp0qlcia.cloudfront.net/uploads/2018/05/21135818/lock-icon.png
- Maltego bookmarks: https://s3-eu-central-1.amazonaws.com/euc-cdn.freshdesk.com/data/helpdesk/attachments/production/2015153967767/original/xYg0huQr-n4yMkctJfsLC-ct5-7YEsyebA.png
- Merkle Science Tracker, free comments on an investigation board: https://docs.tracker.merklescience.com/docs/custom-nodes-links-comments
