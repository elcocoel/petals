// The landing page's words, in one file, so a copy pass touches one file. The source is the "Landing copy
// (v7)" tab of the "Petals — Copy" doc. Approved words and v6's drafts stay word for word. Everything that was an
// empty slot is a v1 draft, so the page has no placeholders and is critiqued by looking at it. Only the line
// breaks are ours.
// The arrows aren't here: Geist Mono and our Mona Sans subset have neither U+2192 nor U+2190, so the
// components draw them (components/ui/Arrow.tsx). The words typed on the page itself (?edit=1 on a
// local server, app/edit/CopyEditor.tsx) are kept in landing-copy.edits.json and win over these.
import { agentWords } from './agents.ts';
import { withEdits } from './copy-edits.ts';
import edits from './landing-copy.edits.json' with { type: 'json' };

const written = {
  nav: {
    howItWorks: 'How it works',
    gallery: 'Power Map',
    docs: 'Docs',
    ask: 'Connect',
    /** The phone's button that unfolds the links, read aloud. */
    menu: 'Menu',
  },
  hero: {
    eyebrow: 'SEE POWER MOVE',
    title: 'Power has\na shape.\nNow you\ncan see it.',
    /** The same words, two sentences, wrapping as the hero's column needs (HERO ART's V2, 11 Nov). */
    titleWide: 'Power has a shape.\nNow you can see it.',
    body: 'Point Petals at any wallet or contract, or just name a community, and map how power moves.',
    /** The small button beside Connect and the setup prompt, read aloud and shown on hover (Elco, 13 Nov). */
    star: 'Star Petals on GitHub',
    /** The socials under the hero's buttons, in Elco's order (13 Nov), each named for the ear and on hover. */
    socials: { github: 'GitHub', telegram: 'Telegram', twitter: 'Twitter', youtube: 'YouTube' },
    ask: {
      /** One line per chapter, in the chapters' order: the box types one, holds it, deletes it, types the next. */
      placeholders: [
        "Every account is a petal. 9 of NEAR's 371 validators hold a third of the stake.",
        'Same chain, a second kind of power: the votes in House of Stake.',
        'A handful of delegates carry most of the ENS vote. Petals counts how few.',
        'One block, one wallet, 79.63% of the vote.',
        'Many tokens call themselves Lido. Petals checks which is real before it draws.',
        'Two crowds, one set of wallets: lines join the holders of both.',
        "RaidGuild runs on a system Petals hadn't read. One recipe later, every agent can.",
      ],
      label: 'What Petals reads: a network, a wallet or a contract',
      action: 'Connect',
    },
    starterLabel: 'OR START WITH ONE OF THESE',
    starters: [
      "Who stands behind NEAR's validators?",
      "Who holds the votes in NEAR's House of Stake?",
      'How few ENS delegates hold most of the votes?',
      'How did one wallet take Beanstalk in one block?',
      'Which Lido is the real one?',
      'Who holds both DEGEN and UNI on Base?',
      'Can Petals read a DAO it has never seen?',
    ],
  },
  /**
   * The hero's story (HERO ART's V2, approved by Elco 11 Nov: "BRO, 10 OUT OF 10 - LFG!!!! now its just a design
   * issuem finesse - but get this in the hero please"): six beats, each a question and Petals' answer, word for
   * word from design/hero-illustration/foreground-script-v2.md. The flower is a symbol: no network is named and
   * nothing is counted. `name` is each beat's word under its tick.
   */
  heroStory: {
    you: 'You',
    petals: 'Petals',
    beats: [
      { name: 'Community', q: 'Show me my community.', a: 'Here’s how power is shared.' },
      {
        name: 'Influence',
        q: 'Who has the most influence?',
        a: 'These accounts carry the most weight.',
      },
      { name: 'Blocs', q: 'Who votes together?', a: 'These groups tend to vote alike.' },
      {
        name: 'History',
        q: 'Has it always been like this?',
        a: 'Here’s how the balance has changed.',
      },
      { name: 'A vote', q: 'Who backed this proposal?', a: 'Here’s who voted for and against.' },
      {
        name: 'Connections',
        q: 'Where else are they involved?',
        a: 'Follow them into these communities.',
      },
    ],
    /** The history beat's line, from then to now. */
    past: 'Then',
    now: 'Now',
    /** Drafts (LANDING, 11 Nov), for Elco: the play control's names, read aloud and shown on hover. */
    pause: 'Pause',
    play: 'Play',
  },
  liveReading: {
    title: 'Accounts become petals. Together they shape a network.',
    caption: 'NEAR VALIDATORS · 3 NOV 2026 · BLOCK 222,915,356',
    /** All four, appearing one at a time in this order (row.arrive). */
    findings: [
      "9 of NEAR's 371 seated validators hold more than a third of the stake: enough to stall the chain.",
      'Behind each pool stand its backers: many small delegators, a few large accounts, liquid-staking contracts and lockups.',
      'Most of the biggest delegators have no public name.',
      'This shape draws the stake that produces blocks. House of Stake votes are a second kind of power on NEAR.',
    ],
    action: 'Follow the power',
  },
  howItWorks: {
    title: 'How it works',
    /**
     * The seven scenes, word for word from Figma's "Section 3 · V1 original · working baseline"
     * (181:2343), each with its illustration (public/landing/how-it-works/), with three spelling fixes:
     * "aks" to "ask", "get's" to "gets", "Near.Social" to "NEAR Social". Case as Figma draws it.
     * `tick` is the word under each scene's tick in the pager.
     */
    scenes: [
      {
        id: 'conversation',
        tick: "Petals' Agent",
        scene: 'A CONVERSATION ABOUT POWER',
        headline: 'Tell Petals what to focus on.',
        body: 'Name a community, wallet or contract. Petals’ agent, powered by NEAR AI, explores it with you. A flower shows how power is held and how accounts connect.',
      },
      {
        id: 'agents',
        tick: 'Agent Swarms',
        scene: 'MANY HANDS MAKE LIGHT WORK',
        headline: 'Connect your own agents.',
        body: 'Petals can outsource the heavy mapping and research to agents you already pay for. They work with their own tools and resources, bringing results back while you keep exploring with Petals.',
      },
      {
        id: 'brain',
        tick: 'The Brain',
        scene: 'SKILL LIBRARY',
        headline: 'Behind Petals is a Brain',
        body: 'Your swarm can coordinate seamlessly as you chat because of the Brain. An open library of methods that guides agents on how to query and analyze power networks.',
      },
      {
        id: 'evidence',
        tick: 'Deterministic Results',
        scene: 'FOLLOW THE EVIDENCE',
        headline: 'Deterministic results',
        body: 'Tools read the chain. Each reading records its sources and date, with interpretations marked separately. The flower makes the results visible; the agent helps you make sense of them.',
      },
      {
        id: 'power-map',
        tick: 'A Public Good',
        scene: 'THE POWER MAP',
        headline: 'Each ask grows the map',
        body: 'Explore what others have mapped, and add the readings you care about. All data sets come together in the Power Map. It gets more detailed as we explore.',
      },
      {
        id: 'workspace',
        tick: 'Your Workspace',
        scene: 'YOUR WORKSPACE',
        headline: 'Pick up where you left off.',
        body: 'Connect a NEAR wallet to save your conversations, notes and maps. Return to them and keep working until you are ready to publish. Your workspace stays private and your contributions use your NEAR Social profile.',
      },
      {
        id: 'costs',
        tick: 'Low cost, no setup',
        scene: 'LOW COST, NO SETUP',
        headline: 'A few cents go a long way.',
        body: 'Browsing the Power Map is free. Top up your Petals account to use its agent and mapping tools, paying as you go. Connected agents use their own resources for the work they take on.',
      },
    ],
    /** The arrows' names, read aloud only. */
    back: 'Back',
    next: 'Next',
  },
  /**
   * Section 4, Version 4 draft (Elco, 11 Nov, through the design chat): word for word from
   * design/section-4-agent-bridge.md and Figma 203:2343 (desktop) and 203:2359 (mobile). Only the line
   * break is ours. "Click and paste" is Elco's on purpose; keep it.
   */
  giveToAgent: {
    title: 'Skip the Reading.\nLet your agent set you up',
    body: 'Click and paste to any chatbot. It will walk you through setting up a wallet, logging in and topping up—until you’re ready to talk to Petals.',
    copy: 'Copy the Setup Prompt',
    copied: 'Copied. Paste it into your agent’s chat to get started.',
    /** The one setup prompt, CONNECTORS's (lib/agents.ts); the page swaps in the address it's on when copying. */
    prompt: agentWords.setup,
  },
  gallery: {
    title: 'Start with a network you know',
    open: 'Explore the Power Map',
  },
  questions: {
    title: 'FAQ',
    sign: '−',
    /**
     * The FAQ tab's thirteen, word for word, in its order. Words between ** are bold: each answer's key concepts,
     * so an answer can be read at a glance.
     */
    items: [
      {
        index: '01',
        question: 'Is Using Petals free?',
        answer: [
          '**Browsing the Power Map is free.** It opens without an account, a key or a wallet.',
          'To contribute to the Power Map or ask Petals AI questions, you will need to **top up your Petals account** or **bring your own tokens** by connecting another AI you control.',
          "Talking to Petals' agent on NEAR AI is **very cost effective, paid as you go** from your wallet. Mapping can be done in the same way or you can allow Petals to collaborate with your other agents, just copy and paste the prompt and Petals will off load the heavier, costlier work to your preferred agents.",
        ],
      },
      {
        index: '02',
        question: 'Which networks can it read?',
        answer: [
          'Petals treats **a group of wallets connected through ownership, participation or control** as a network. In principle, any such network can be mapped, provided there’s accessible data and a clear definition of what power means within it. **Petals’ Brain** is a shared library of strategies for understanding that power: who holds it, who votes, who can move the money, and who can change the rules. It guides an agent through finding the data, checking what it means, and turning it into a map.',
          'Today’s readers cover specific systems on **NEAR, Ethereum, Base, Arbitrum, Gnosis and Solana**. New systems may need new recipes or additional tools, and every reading will make its limits clear.',
        ],
      },
      {
        index: '03',
        question: 'What can Petals tell me?',
        answer: [
          'The shape of a “flower” gives you **a first look at power**: whether it’s spread across a community or concentrated in a few accounts, and how those accounts connect. What counts as power depends on what you’re exploring. Petals’ Brain guides the agent in helping you interpret the data.',
          '**Each petal represents an account.** A large one might represent many others through a staking pool, an exchange or a shared treasury. One person can also control several accounts. Petals can help you find clues.',
          '**Ask Petals to investigate** an account or network using the records it can find. What has that account proposed, and who voted for or against it? What discussions led to those decisions? Has it been publicly linked to a forum profile or social account?',
          'An agent can follow proposals into forum discussions, trace votes and actions, and build successive views of the network’s history. Petals’ Brain holds the strategies for that exploration, and grows as new methods are tested and shared.',
          'You don’t have to know the whole investigation before you begin. Ask the next question, and **keep mapping**.',
        ],
      },
      {
        index: '04',
        question: "How do I know it's right?",
        answer: [
          'Readings from a chain are **backed by evidence**. Deterministic tools read the data and do the counting; agents help you interpret the results. Each reading records its sources, the time or block it describes, and what it covers. Anyone using the same data and method would get the same results.',
          '**Data and insights are labelled separately**, so you can distinguish what was read directly from the chain, what the agent inferred, and what is a lead to investigate. A recorded vote tells you how an account voted, but not why. A connection between accounts doesn’t prove they share an owner. An interpretation can be useful without being certain.',
          'Ask it: **“Show me the source.”** “How did you reach that conclusion?” “What’s missing?” Each reading gives you evidence to examine, and each interpretation gives you something to question and explore further.',
        ],
      },
      {
        index: '05',
        question: "Can it tell me who's behind a wallet?",
        answer: [
          'It can help you **follow the public trail**. An account may have declared a name, linked a forum profile, submitted proposals or signed transactions for a known organisation. Petals can help gather those records and distinguish what the account declared about itself from what someone else attributed to it.',
          'Often, you’ll learn more about **what an account does** than who owns it: which networks it participates in, what it proposes, how it votes and where its influence comes from. Those connections can suggest where to look next. A shared name, similar voting pattern or transfer between wallets is **a clue to investigate**; it doesn’t establish that the same person controls them.',
          'You can keep your own notes and interpretations as you explore. Petals helps you build an understanding from the evidence available, with room for what remains unknown.',
        ],
      },
      {
        index: '06',
        question: 'When do I need a wallet?',
        answer: [
          '**You don’t need one to browse the public Power Map.** To use Petals’ agent, save your work and pay for its services, you’ll need to **connect a NEAR wallet**. It’s how you sign in and return to your conversations, notes and maps.',
          '**Signing in moves no funds and costs nothing.** Payments are separate, and Petals never asks for your private key or seed phrase.',
        ],
      },
      {
        index: '07',
        question: 'Can I use it in ChatGPT or Claude?',
        answer: [
          'Yes. **Claude Code, Codex, Hermes** and other agents that can run commands can help you map. Copy the connection prompt into your agent to bring it into your Petals project.',
          'Petals’ agent works with you on the page and can **hand mapping jobs to your connected agents**. They use their own tools and resources, and bring the results back into the same project. Several agents can work on different parts of a network, guided by the shared Brain.',
          '**ChatGPT and the Claude chat app** can also connect through Petals’ connector. Your app may ask you to approve the connection or particular actions.',
        ],
      },
      {
        index: '08',
        question: 'Who sees my questions?',
        answer: [
          'Your conversations and notes are **private to your account**. Other Petals users can’t browse them, and your workspace search stays within your own work. You choose what you share on the public Power Map and which agents you connect to your projects.',
          'When you use Petals’ own agent, your messages and the context needed to answer them pass through **Petals’ server and NEAR AI**. If you connect another agent, the information shared with it is also handled by its provider. Your work is private from other users; the services running your agents still process what you share with them.',
        ],
      },
      {
        index: '09',
        question: 'Where should I start?',
        answer: [
          '**Start with a wallet you control** and talk to the agent about the networks you’re part of. Where do you hold tokens, vote or delegate? What would you like to understand about your place in those communities? Follow what turns up. You can also begin with a network on the public Power Map.',
        ],
      },
      {
        index: '10',
        question: 'How fresh is a map?',
        answer: [
          '**Each reading captures a moment**, identified by its date or block. Ask for a fresh reading, or use time to frame your investigation: “Show this network before and after that proposal,” or “How did voting power change each month?”',
          'Where historical data is available, the agent can build **a sequence of snapshots** and compare who gained power, who lost it and how connections changed. Each snapshot preserves the data for its moment. Your current visual settings determine how every snapshot is drawn; changing them changes the view across the comparison.',
        ],
      },
      {
        index: '11',
        question: 'Can I choose what the flower shows?',
        answer: [
          'A flower is drawn from **its data and a view**: settings that assign pieces of data to visual dimensions such as height, width, colour and segments. Height might show a share of voting power; bands inside a petal might show the backers behind a staking pool. Changing the view changes how you read the data, not the underlying records.',
          'The renderer always applies **your current visual settings** to every flower you explore, including maps made by others. You can change which data each supported dimension shows, and those choices carry across your views. The legend explains the dimensions according to your settings.',
        ],
      },
      {
        index: '12',
        question: 'What can I do with what I find?',
        answer: [
          '**Keep notes alongside the evidence**, return to an investigation, and compare networks or different moments in their history. Use what you learn to prepare a proposal, understand who might support it, choose a delegate or question a decision. You can also ask the agent to help turn an investigation into a clear explanation for your community.',
          'A useful finding can be a concentration of power, a connection worth investigating or something the available records cannot explain. When you share it, include **the sources, date and open questions** so others can check it and continue the work.',
        ],
      },
      {
        index: '13',
        question: 'Can I help Petals learn something new?',
        answer: [
          'Yes. **Contribute through GitHub:**',
          {
            list: [
              '**Open an issue** to point out missing data, challenge an interpretation or suggest a system Petals should learn to map. Include the relevant sources and an example others can examine.',
              '**Submit a pull request** to improve a Brain chapter, add a reading recipe or extend a tool. Explain what changed and how you tested it; your agent can help prepare the contribution.',
            ],
          },
          'Changes are reviewed before becoming part of the shared Brain. **Our Telegram chat** is a place to compare methods, ask for help and find collaborators. Issues and pull requests on GitHub keep track of the work.',
        ],
      },
    ],
  },
  backIt: {
    title: 'Petal Mania',
    /** A leaderboard only hinted: no money, tokens or rewards. */
    hint: 'Right now there is no leaderboard. But if there was, these are the things that would take you to the top.',
    /**
     * Four cards in one line, the cards the links, ordered from the lightest way in to the most involved. `link` is
     * where a card goes: `lobby` is Connect (mapping,
     * the agent and publishing are one card), `github` the repo; an empty one is a slot waiting for its address
     * (the community's links, the merch), so its card shows without a link.
     */
    ways: [
      { title: 'Join the community', link: 'telegram' },
      { title: 'The merch', link: '' },
      { title: 'Map a network', link: 'lobby' },
      { title: 'Develop with us', link: 'github' },
    ],
  },
  builders: {
    title: 'Build Petals with us',
    /**
     * Three links under the system's graph: the docs, GitHub, and a star on GitHub.
     */
    doors: [
      { title: 'Docs', link: 'docs', icon: 'arrow' },
      { title: 'GitHub', link: 'github', icon: 'arrow' },
      { title: 'Give us a star', link: 'github', icon: 'star' },
    ],
  },
  footer: {
    /** The footer's three groups; the socials take their names from hero.socials. */
    groups: { petals: 'Petals', build: 'Build', community: 'Community' },
    links: {
      map: 'Power Map',
      gallery: 'Gallery',
      leaderboard: 'Leaderboard',
      docs: 'Docs',
      github: 'GitHub',
      api: 'API',
      brandKit: 'Brand kit',
      merch: 'Merch',
    },
    built: 'Built for the NEAR Hackathon, November 2026. By Elementary Complexity.',
    /** The words in `built` that link to Elementary Complexity's site (siteLinks.elementaryComplexity). */
    by: 'Elementary Complexity',
  },
} as const;

export const landingCopy = withEdits(written, edits.words);
