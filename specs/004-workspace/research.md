# Research: reference products for the workspace

**Created**: 2026-11-08
**Feeds**: `spec.md`, questions W2 to W9.
**Method**: public docs, changelogs, press and reviews only. Nobody looked inside a logged-in app, so gaps say "not found", and anything read between the lines says "inferred". Every factual line cites its source.

## In one paragraph

None of these products uses a connected wallet to suggest what to investigate: each opens on a search bar, a template or a public feed. Most cut each investigation into its own graph (Maltego, Arkham, Bubblemaps). The tools that keep one shared store behind many views (Kumu, Obsidian) are the closest model for Elco's one continuous space. Every one of them has a central reviewer deciding what's publicly true, and none shows a disputed claim on the canvas.

## The three that matter most for Petals

- **Kumu: one master list, many maps.** A project keeps one list of items, and each map borrows from it. Edit an item on one map and it changes everywhere, while each map keeps its own positions ([Architecture](https://docs.kumu.io/overview/kumus-architecture)). "Focus" shows only what's within N steps of a selection ([First steps](https://docs.kumu.io/getting-started/first-steps)). This is the nearest precedent for "flow through the spaces of what got mapped".
- **Arkham's "snitch-to-earn" backlash.** Paid, staked attributions of who owns a wallet drew public anger, with Arkham as "the central arbiter" ([Cointelegraph](https://cointelegraph.com/news/arkham-on-chain-intel-exchange-labeled-snitch-to-earn-by-crypto-twitter)). "This wallet belongs to X" is a Petals claim kind, and points for mapping could draw the same framing (inferred).
- **Nobody suggests from the wallet.** Elco's idea that a connected wallet hints at where to look has no precedent here.

---

## Arkham Intelligence

1. **Way in.** You land on a homepage with trending entities, exchange flows and the latest transactions, and a search bar sits on every page ([Codex: Homepage](https://codex.arkm.com/the-intelligence-platform/homepage)). It suggests nothing from who you are: not found. The feed looks the same for everyone (inferred).
2. **Layout.** There is a top bar, not a left rail: Exchange, Markets, Custom (Dashboard, Alerts) and Tools (Visualizer, Oracle, Tracer) on the left, and Profile, Points, Private Labels, API and Settings on the right ([Homepage](https://codex.arkm.com/the-intelligence-platform/homepage)). Dashboards and Alerts each have their own sidebar ([Dashboard](https://codex.arkm.com/the-intelligence-platform/dashboard), [Alerts](https://codex.arkm.com/the-intelligence-platform/alerts)).
3. **Projects and history.**
   - Dashboards are private by default, listed in their sidebar, and shared by sending the URL ([Dashboard](https://codex.arkm.com/the-intelligence-platform/dashboard)).
   - Tracer graphs save themselves and reopen from an "All Traces" tab ([Tracer](https://codex.arkm.com/the-intelligence-platform/tracer)).
   - Visualizer 2.0 (Oct 2026) added saving a graph and sharing it with someone else ([Visualizer 2.0](https://info.arkm.com/announcements/arkham-visualizer-2-0)).
   - Nothing groups these into projects: not found.
4. **The canvas.**
   - You start a Visualizer graph from its search box and add more entities the same way. It shows the latest 1,000 transactions, with a time bar at the bottom ([Visualizer](https://codex.arkm.com/the-intelligence-platform/visualizer)).
   - You move to neighbours by "expanding" an entity into its addresses without leaving the graph. You can also lock nodes, or hide them by type or by flow direction ([V4](https://info.arkm.com/announcements/visualizer-v4-expansion-pack-is-now-live)).
   - Version 2.0 adds zooming into any cluster and undo ([2.0](https://info.arkm.com/announcements/arkham-visualizer-2-0)).
   - Each graph is its own universe (inferred).
5. **Commentary layer.**
   - Labels name addresses, and tags describe behaviour, such as "Hacker" ([Arkham guide](https://info.arkm.com/research/how-to-use-arkham-intel-guide-explained)).
   - Your private labels and entities are visible only to you, can be shared with a "Share" button, and override Arkham's official labels in your own view ([Private Labels](https://codex.arkm.com/the-intelligence-platform/private-labels)).
   - Public attributions come from Arkham or from Intel Exchange bounties. Arkham verifies each one, the buyer gets 90 days of exclusive access, and then it goes public ([Intel Exchange](https://info.arkm.com/announcements/arkham-intel-exchange)).
   - Bounty hunters stake 10 ARKM, which they lose if a submission is rejected ([Bounties](https://codex.arkm.com/intel-to-earn-and-the-arkham-intel-marketplace/bounties)). Arkham's team checks the intel with "proprietary technology" ([Oracle problem](https://codex.arkm.com/intel-to-earn-and-the-arkham-intel-marketplace/the-intelligence-oracle-problem)).
   - A way to dispute a label on the platform: not found. The Zcash dispute was fought in public outside the platform ([Coinspeaker](https://www.coinspeaker.com/arkham-intelligence-zcash-deanonymization-controversy)).
6. **Profile.** A portfolio of addresses you add through MetaMask, an exchange API key or pasting. It stays private to you, and no signature check is described ([Personal Portfolio](https://codex.arkm.com/the-intelligence-platform/personal-portfolio)).
7. **Complaints.**
   - The Intel Exchange was called "snitch-to-earn", with Arkham as "the central arbiter", and referral links leaked users' emails ([Cointelegraph](https://cointelegraph.com/news/arkham-on-chain-intel-exchange-labeled-snitch-to-earn-by-crypto-twitter)).
   - The CEO said "It's not a completely free market" and that every bounty must be approved ([Cointelegraph](https://cointelegraph.com/news/arkham-ceo-defends-controversial-info-sharing-marketplace)).
   - A trader named his alerts after his own labels, read them as official signals and blamed Arkham ([CryptoSlate](https://cryptoslate.com/?p=320919)).
   - **AI.** The Oracle (2023) answers a chat prompt with a dashboard ([Oracle](https://info.arkm.com/announcements/announcing-the-arkham-oracle)). The MCP server (Oct 2026) plugs Arkham into Claude, Claude Code and Codex ([MCP](https://info.arkm.com/announcements/the-arkham-mcp-server)).

## Maltego (Graph Desktop and Graph Browser)

1. **Way in.**
   - In the browser you start from the Maltego app, with its Cases and widgets. You make a graph with a plus icon, name it, and add entities ([Interface](https://docs.maltego.com/en/support/solutions/articles/15000059532-navigate-the-interface), [Starting](https://docs.maltego.com/en/support/solutions/articles/15000059534-starting-an-investigation)).
   - The desktop app opens on a Home tab: news and Academy links on the left, a store for installing data sources on the right ([Start Page](https://support.maltego.com/en/support/solutions/articles/15000008831-maltego-graph-home-start-page)). Recent graphs sit in the app menu ([App menu](https://docs.maltego.com/support/solutions/articles/15000018929-applications-menu)).
   - Personal suggestions: not found.
2. **Layout.**
   - The browser has three parts ([Interface](https://docs.maltego.com/en/support/solutions/articles/15000059532-navigate-the-interface)):
     - **Top bar:** graph name, New Graph, Quick Find, Filters, bookmarks, export, and a graph / map / table toggle.
     - **Left sidebar:** the app, Cases and folders, Search, and an AI Assistant if an admin turns it on.
     - **Graph area:** the canvas. Graph, map and table can be open side by side.
   - Whether the sidebar collapses: not found.
   - Entity details open in a right-hand panel ([Notes](https://docs.maltego.com/en/support/solutions/articles/15000060295-adding-notes-to-entities)).
3. **Projects and history.**
   - Cases are an encrypted cloud store ([Cases](https://docs.maltego.com/en/support/solutions/articles/15000060312-what-is-maltego-cases-)).
   - You share a case with individuals as Owner, Contributor or Reader. Editing locks while someone else has the graph open ([Sharing](https://docs.maltego.com/en/support/solutions/articles/15000060313-sharing-the-case-with-collaborators)).
   - Every save is a version you can restore ([Versions](https://docs.maltego.com/en/support/solutions/articles/15000061571-managing-graph-versions-in-cases)). The browser also backs up daily ([Restore](https://docs.maltego.com/en/support/solutions/articles/15000059550-restoring-your-graph-using-version-history)).
4. **The canvas.**
   - Each graph is separate. To move entities between graphs you copy and paste them, and "Find in Files" searches saved graphs ([Multiple graphs](https://support.maltego.com/en/support/solutions/articles/15000020082-manipulating-and-searching-maltego-graphs)).
   - You reach a neighbour by right-clicking an entity and running a Transform, which is a data query ([Starting](https://docs.maltego.com/en/support/solutions/articles/15000059534-starting-an-investigation)).
   - "Collections" fold same-type entities into square nodes with a count. A slider sets the threshold, and pinning pulls an entity out ([Collections](https://docs.maltego.com/support/solutions/articles/15000010775-collections-tab)).
   - Zoomed in you see icons. Zoomed out, every entity becomes a same-size ball coloured by type. Other views size nodes by link count or rank ([Graph sidebar](https://docs.maltego.com/support/solutions/articles/15000009615-graph-sidebar)).
5. **Commentary layer.**
   - Notes attach to entities and show a yellow page icon ([First graph](https://docs.maltego.com/support/solutions/articles/15000008832-your-first-graph)). Since Aug 2026, browser notes stay visible on the canvas ([Release notes](https://docs.maltego.com/en/support/solutions/articles/15000059555-release-notes-for-maltego-graph-browser-)).
   - Bookmarks come in five colours with no fixed meaning ([Bookmarks](https://docs.maltego.com/en/support/solutions/articles/15000059547-categorizing-key-findings-with-bookmarks)).
   - Links can carry labels, colours and styles ([Entity features](https://docs.maltego.com/en/support/solutions/articles/15000062339-entity-features-overlays-links-notes-)).
   - Who can see them is whoever the case is shared with. In a live shared session everyone has full read/write ([Blog](https://www.maltego.com/blog/share-live-graph-and-collaborate-in-maltego/)).
   - Note authorship, trust levels and disputes: not found.
   - The AI Assistant is a chat that reads and reports on the graph ([AI](https://docs.maltego.com/en/support/solutions/articles/15000061164-what-is-the-ai-assistant-)). It gained chat branching (Apr 2026) and model choice (Sep 2026) ([Release notes](https://docs.maltego.com/en/support/solutions/articles/15000059555-release-notes-for-maltego-graph-browser-)).
6. **Profile.** A Maltego ID plus an assigned Graph seat ([Academy](https://academy.maltego.com/graph-browser)). Anything more: not found.
7. **Complaints.** Price: $6,600 a year for Professional, and many transforms cost extra ([Capterra](https://www.capterra.com/p/266210/Maltego/reviews/)). A steep learning curve ([G2](https://www.g2.com/compare/belkasoft-vs-maltego)). Each transform run spends credits ([Academy](https://academy.maltego.com/graph-browser)).

## Bubblemaps (V2 and Intel Desk)

1. **Way in.** You open one token's map, which shows its top 250 holders as bubbles ([How it works](https://wiki.bubblemaps.io/bubblemaps-v2/how-does-it-work)). A home screen or personal suggestions: not found.
2. **Layout.** An address list, a top island showing when the map was last computed, and filter menus ([How it works](https://wiki.bubblemaps.io/bubblemaps-v2/how-does-it-work)). Fuller description: not found.
3. **Projects and history.** A permalink saves the map's current setup, and you can export addresses as a spreadsheet ([How it works](https://wiki.bubblemaps.io/bubblemaps-v2/how-does-it-work)). Saved projects: not found.
4. **The canvas.**
   - One map per token. Bubble size is the amount held, lines are transfers, and contracts and exchanges are hidden by default ([How it works](https://wiki.bubblemaps.io/bubblemaps-v2/how-does-it-work)).
   - You move to neighbours through "Show All Transfers", adding addresses one by one or in bulk ([Add addresses](https://wiki.bubblemaps.io/bubblemaps-v2/add-addresses)).
   - "Magic Nodes" add go-between wallets that hold none of the token but link holders ([Magic Nodes](https://wiki.bubblemaps.io/bubblemaps-v2/magic-nodes)).
5. **Commentary layer.**
   - Anyone can submit a label with evidence, pay for it, and wait for review. Once approved it is public, marked with a community icon ([Submit labels](https://wiki.bubblemaps.io/bubblemaps-v2/submit-labels)). Whether the submitter is credited: not found.
   - On Intel Desk you open a case by staking 100 BMT. Others back it with BMT, and more backing raises the case's multiplier ([Submit a case](https://wiki.bubblemaps.io/the-intel-desk/submit-a-case), Bubblemaps blog, "Intel Desk: the Wikipedia of crypto investigations").
   - Cases carry an impact rating, a timeline of mixed sources, and a "Top Mappers" credit list (HackerNoon, "How Bubblemaps Intel Desk turned crypto's volunteer detectives into a paid intelligence force").
   - Disputes: not found. HackerNoon says accountability for false accusations is unresolved.
6. **Profile.** Your Intel Desk profile lists the cases you submitted and their status ([Submit a case](https://wiki.bubblemaps.io/the-intel-desk/submit-a-case)).
7. **Complaints.** Maps cover only the top holders, and links are leads, not proof (inferred from [How it works](https://wiki.bubblemaps.io/bubblemaps-v2/how-does-it-work)). Documented user complaints: not found.

## Nansen

1. **Way in.** On mobile the agent is the interface: "you don't browse dashboards, you simply ask" ([Mobile](https://www.nansen.ai/post/nansen-ai-mobile-app-a-new-way-to-trade)). The web home: not found.
2. **Layout.** Watchlists sit in a sidebar ([Labels 101](https://academy.nansen.ai/articles/2149924-labels-and-watchlists-101)). The agent opens with Cmd+E from any page and uses that page's data as context ([Web agent](https://www.nansen.ai/post/nansen-ai-agent-is-now-live-on-web)).
3. **Projects and history.** Chat history syncs between web and mobile ([Web agent](https://www.nansen.ai/post/nansen-ai-agent-is-now-live-on-web)). Projects: not found.
4. **The canvas.** No graph canvas is documented. "Wallet Pair Profiler" shows how two wallets connect, including through shared counterparties ([Profiler 101](https://academy.nansen.ai/articles/0002013-nansen-profiler-101)).
5. **Commentary layer.** Custom labels are personal tags that show on every dashboard ([Labels 101](https://academy.nansen.ai/articles/2149924-labels-and-watchlists-101)). Whether they are private or shared: not found.
6. **Profile.** Portfolio tracking with "insights built around you" ([Mobile](https://www.nansen.ai/post/nansen-ai-mobile-app-a-new-way-to-trade)).
7. **Complaints.** Price ([Product Hunt](https://www.producthunt.com/products/nansen/reviews)). Separately, Nansen ships an MCP server for Claude Code and Cursor ([MCP docs](https://docs.nansen.ai/mcp/connecting)) and "skills for Claude Code" ([GitHub](https://github.com/nansen-ai)).

## Kumu

1. **Way in.** A dashboard with a NEW PROJECT button. You name the project, choose public or private, and pick a template ([First steps](https://docs.kumu.io/getting-started/first-steps)).
2. **Layout.** A canvas, with a profile panel for the selected item on the left and settings on the right. A menu icon at top left opens the sidebar ([First steps](https://docs.kumu.io/getting-started/first-steps)).
3. **Projects and history.** A workspace holds projects, a project holds many maps, and saved "views" keep filter, focus and cluster settings ([First steps](https://docs.kumu.io/getting-started/first-steps)).
4. **The canvas.** **Key precedent:** the project keeps one master list of items, and maps "borrow" from it. Edit an item on one map and it changes everywhere, while each map keeps its own positions ([Architecture](https://docs.kumu.io/overview/kumus-architecture)). "Focus" shows only the items within N connections of a selection ([First steps](https://docs.kumu.io/getting-started/first-steps)). Readers switch maps with dropdowns or in-text links ([FAQ](https://docs.kumu.io/frequently-asked-questions/how-can-readers-switch-maps-and-views)).
5. **Commentary layer.** Paid ("Pro") workspaces add live comments and Discussions linked to specific items ([Pro](https://docs.kumu.io/guides/pro-workspaces)). Public projects are indexed by search engines and can be forked. Edits sync on refresh, with a side-by-side conflict merge ([Collaboration](https://docs.kumu.io/overview/collaboration)).
6. **Profile.** Not found.
7. **Complaints.** Only weak aggregator reviews mention a learning curve: not reliably found.

## Obsidian (graph and Canvas)

1. **Way in.** It opens your vault, a folder of notes (inferred).
2. **Layout.** Two sidebars that collapse, a ribbon of icons, and tabs you can drag between the sidebars and the main area ([Sidebar](https://obsidian.md/help/sidebar)).
3. **Projects and history.** Everything is files. Canvases are `.canvas` files that sit beside your notes ([Canvas](https://obsidian.md/help/plugins/canvas)).
4. **The canvas.** Canvas cards point at existing notes, so one note can appear on many canvases. Connections can carry labels and be "followed" to the other end ([Canvas](https://obsidian.md/help/plugins/canvas)). The local graph shows the current note's neighbours, with a depth slider ([Graph](https://obsidian.md/help/plugins/graph)).
5. **Commentary layer.** The notes themselves are the commentary. Sharing and comments: not found.
6. **Profile.** Not relevant.
7. **Complaints.** The global graph turns into a "hairball". In a Reddit poll, 178 of 302 people said they never use it to navigate. The local graph gets more praise ([Reddit mirror](https://reddit.birdcat.cafe/r/ObsidianMD/comments/1hg9qr3/how_often_do_you_use_the_global_graph_in_obsidian)).

## Cursor and VS Code

1. **Way in.** VS Code reopens exactly as you left it ([VS Code UI](https://code.visualstudio.com/docs/getstarted/userinterface)). Cursor 2.0 made an agent-first layout the default ([Changelog 2.0](https://cursor.com/changelog/2-0)).
2. **Layout.**
   - VS Code: an activity bar, a primary sidebar that toggles with ⌘B, and a secondary sidebar that holds Chat by default ([VS Code UI](https://code.visualstudio.com/docs/getstarted/userinterface)).
   - Cursor's Agent layout puts the Agents sidebar on the left and the file sidebar on the right ([Cursor staff](https://forum.cursor.com/t/sidebar-right-layout-switches-window-layout-to-agent-view-in-cursor-settings/164741)).
3. **Projects and history.** "A sidebar for your agents and plans" ([Changelog 2.0](https://cursor.com/changelog/2-0)).
4. to 6. Not applicable.
7. **Complaints.** "Just the same as the editor but with the panels in different spots", and the new layout being the default was called "a big mistake" ([Forum](https://forum.cursor.com/t/cursor-2-0-agents-view-whats-the-point/140094)). Users also report the layout resetting ([Forum](https://forum.cursor.com/t/ui-constantly-resets-layout-in-cursor-2-0/139511)).

---

## Patterns

1. **Search first, no personal lobby.** Arkham, Maltego, Bubblemaps and Kumu all open on a search bar, a template or a public feed.
   - *Gains:* no setup.
   - *Costs:* a new person gets no hint of where to start.
   - None of them suggests investigations from your wallet. That idea of Elco's has no precedent here.
2. **One graph per investigation vs. one store with many views.** Maltego (separate graphs, copy and paste between them), Arkham (separate visualizations and traces) and Bubblemaps (one map per token) make each graph its own universe. Kumu (one master list behind many maps) and Obsidian (canvases point at shared notes) keep one store.
   - *Separate graphs gain* focus and an easy unit to share. *They cost* repeated work, and you can't move from one network into the next.
   - *The shared store* is the nearest precedent for Elco's "one continuous space". *Its cost:* an edit spreads everywhere (Kumu warns about this).
3. **Pivot in place.** Maltego (right-click, run a Transform), Arkham (expand an entity into its wallets), Bubblemaps (Show All Transfers, Magic Nodes), Kumu ("focus" on N steps) and Obsidian (local graph depth).
   - *Gains:* you stay in context.
   - *Costs:* the graph grows into a hairball.
4. **Taming size: fold, hide and zoom.** Maltego folds same-type entities into counted squares, has a zoom-out mode where icons become balls, and sizes nodes by rank. Bubblemaps hides contracts and exchanges by default. Arkham hides by type and zooms into clusters. Kumu saves cluster and focus settings as views.
   - *Gains:* big networks stay readable.
   - *Costs:* folded and hidden things can be missed. Obsidian's poll suggests people rarely use a whole-map view anyway.
5. **Private notes by default; a central reviewer gates public truth.** Arkham (private labels; public labels by Arkham or approved bounties), Bubblemaps (paid label review), Nansen (personal labels), Maltego (notes visible only inside a shared case).
   - *Gains:* quality control.
   - *Costs:* a single gatekeeper whose rules are unclear ("not a completely free market"). Nobody shows a disputed claim on the canvas. The CryptoSlate case shows personal labels being mistaken for official ones.
6. **Staked, credited crowd work.** Arkham (bounty stakes, slashing, 90-day exclusivity) and Bubblemaps Intel Desk (100 BMT to open a case, backing multipliers, Top Mappers, a profile listing your cases).
   - *Gains:* resistance to spam, and visible credit for contributors.
   - *Costs:* money buys influence, the "dox-to-earn" backlash, and unclear accountability for false accusations.
7. **Chat floats over the work, and the data reaches the user's own AI.**
   - Nansen opens its agent from any page with that page as context. Maltego's assistant reads the graph. The tldraw agent kit puts chat in a right-hand panel, reads the canvas from screenshots plus shape data, and streams its changes live ([tldraw kit](https://tldraw.dev/starter-kits/agent)).
   - Arkham's and Nansen's MCP servers plug their data into Claude, Codex and Cursor.
   - *Gains:* there is no separate chat page to switch to.
   - *Costs:* Steve Ruiz (tldraw) reports that users feel they have "ceded control" to agent loops ([talk](https://ai.engineer/talks/agents-on-the-canvas-in-tldraw)).
8. **An IDE shell: a history rail that collapses, and the app restores its last state.** VS Code (⌘B, Chat in the secondary sidebar, reopens as you left it), Cursor (agents list), Obsidian (two sidebars), Maltego (Cases rail, version history).
   - *Gains:* it feels familiar.
   - *Costs:* switching between layouts confuses people (Cursor's backlash and resets).

## Different from Petals

- **No maintainer.** Every product here has a central labeler or reviewer: Arkham, Bubblemaps' reviewers, Nansen. In Petals, claims are signed by anyone and can be challenged. So who made a claim and whether it is contested must show on the flower itself, and none of these products shows that.
- **The privacy model is inverted.** They are private by default and curate what goes public. Arkham even sells 90 days of secrecy. Petals claims are public from the start.
- **The profile is a different thing.** Their profiles hold portfolios: Arkham's are private, and no signature is mentioned. Petals' profile is proven wallets plus social accounts. Intel Desk's case list on a profile is the nearest match.
- **Petals claims are de-anonymisation.** "This wallet belongs to X" is exactly what drew Arkham's dox-to-earn backlash. Token-staked claims would likely bring the same framing (inferred).
- **Graphs, not flowers.** All of them draw node-and-link graphs. "Expand a node" and "fold a collection" need a flower version, perhaps a petal opening into its own flower (inferred).
- **Whose AI.** Nansen and Arkham run AI on their own servers for credits. Petals uses the person's own agent, and those two MCP servers show the market already moving that way.
- **Separate universes.** Maltego and Bubblemaps cut networks into separate graphs. Petals wants one continuous landscape, which only Kumu's shared master list and Obsidian's shared notes resemble.

## Worth looking at

- **Arkham Visualizer 2.0 screenshots** ([page](https://info.arkm.com/announcements/arkham-visualizer-2-0)): [1](https://cdn.prod.website-files.com/6296255d9030be506dc09bb7/6ad664a47e743b11f198bf49_HUqwfpsbwAARp8l.jpeg), [2](https://cdn.prod.website-files.com/6296255d9030be506dc09bb7/6ad6657c00cbe05b44d12c51_HUqwnQebEAAhXL6.jpeg), [3](https://cdn.prod.website-files.com/6296255d9030be506dc09bb7/6ad6657c00cbe05b44d12c4d_HUqwp_jaEAA02k8.jpeg).
- **Arkham Tracer screenshots:** [announcement](https://info.arkm.com/announcements/announcing-the-arkham-tracer).
- **Maltego Browser:** [interface overview](https://s3-eu-central-1.amazonaws.com/euc-cdn.freshdesk.com/data/helpdesk/attachments/production/2015162168258/original/jq32thcTflOXqIOfYmH5MRzX56pD7cCiNQ.png), [Cases sidebar](https://s3-eu-central-1.amazonaws.com/euc-cdn.freshdesk.com/data/helpdesk/attachments/production/2015153931408/original/K24r-5ydr44gIsd-hmPZMJgMR1KG9qvy1A.png), [AI Assistant](https://s3-eu-central-1.amazonaws.com/euc-cdn.freshdesk.com/data/helpdesk/attachments/production/2015162168786/original/CCt5s1dcbHm4avezgd9ImGrlJrGzPtcMWg.png).
- **Maltego collections** before and after, on the [Collections page](https://docs.maltego.com/support/solutions/articles/15000010775-collections-tab). The video series is [Maltego Essentials](https://maltego.com/maltego-essentials).
- **Kumu "focus" animation:** [GIF](https://1181816445-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2FkXSW1nEf49ISqGxYuRfS%2Fuploads%2Fgit-blob-ac16c9d3c7a71bc2464b4927b668df80f5dbcb79%2Ffocus.gif?alt=media).
- **Bubblemaps Intel Desk GIF:** [GIF](https://storage.ghost.io/c/19/d2/19d2abd6-b3d7-45da-8e65-9ec46f80625e/content/images/2025/09/ID_gif_em--2-.gif).
- **Cursor 2.0 agent layout images:** [changelog](https://cursor.com/changelog/2-0).
- **Video: Steve Ruiz, "Agents on the Canvas in tldraw"** (AI Engineer Europe 2026): https://www.youtube.com/watch?v=sPUjIBH5Cwg. The most relevant talk for chat over an infinite canvas.
