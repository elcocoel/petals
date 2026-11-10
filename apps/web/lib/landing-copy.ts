// The landing page's words, in one file, so a copy pass touches one file. The source is the "Landing copy
// (v7)" tab of the "Petals — Copy" doc. Elco's approved words and v6's drafts stay word for word. Everything
// that was an empty slot is a v1 draft by LANDING (Elco, 9 Nov: "lets try to get everything to be 'v1' with no
// placeholders as much as possible than we critique by looking at the page"). Only the line breaks are ours.
// The arrows aren't here: Geist Mono and our Mona Sans subset have neither U+2192 nor U+2190, so the
// components draw them (components/ui/Arrow.tsx).
export const landingCopy = {
  nav: {
    howItWorks: 'How it works',
    gallery: 'Power Map',
    docs: 'Docs',
    ask: 'Connect',
  },
  hero: {
    eyebrow: 'SEE POWER MOVE',
    title: 'Power has\na shape.\nNow you\ncan see it.',
    body: 'Point Petals at any wallet or contract, or just name a community, and map how power moves.',
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
    title: 'You ask. Code counts. The AI explains.',
    steps: [
      {
        numeral: '01',
        title: "Petals' agent, on the page.",
        body: 'Connect a NEAR wallet and talk to it right here. It runs on NEAR AI, and you pay as you go, in NEAR.',
      },
      {
        numeral: '02',
        title: 'Your agents work with it.',
        body: "Bring Claude Code, Codex or Hermes. Petals' agent hands them jobs, they do them on your computer, and the results land in the same project.",
      },
      {
        numeral: '03',
        title: 'An open brain, tools that count.',
        body: 'Every agent learns to map from an open brain of chapters and recipes. The tools read the chain and do the counting, so the same question always draws the same shape.',
      },
    ],
    action: 'Connect',
  },
  useAnywhere: {
    title: 'Put your own agents to work.',
    body: "Petals' agent can hand jobs to the agents you already use. Each one reads on your computer, on the plan you already pay for, so a big map costs you less. Several can map different parts of a network at once, and everything lands in one project.",
    /** Draft (CONNECTORS, 10 Nov), for Elco: one action, where Copy the prompt and Keep Petals in your agent were. */
    action: 'Connect your agents',
    promptNote: 'Works today with Claude Code, Codex, Hermes and any agent that runs commands.',
    /** The illustrated terminal (Elco, 9 Nov: "let's bring back that terminal visual element here"). */
    terminal: {
      start: "YOUR AGENT  ·  A JOB FROM PETALS' AGENT",
      end: 'ILLUSTRATIVE',
      lines: [
        { text: "# Petals' agent hands your agent a job" },
        { text: '> Map RaidGuild: its shares, and who wrote each proposal.', accent: true },
        { text: '  reading Gnosis, on this computer…' },
        { text: '  158 members · 246 proposals' },
        { text: 'a new layer, in your project', returned: true },
      ],
    },
  },
  gallery: {
    title: 'Start with a network you know.',
    open: 'Explore the Power Map',
  },
  questions: {
    sign: '−',
    items: [
      {
        index: '01',
        question: 'Is it free?',
        answer: [
          'Looking is free. Every shape on the Power Map opens without an account, a key or a wallet.',
          "Asking from your own AI is free too. Petals' tools need no account, key or payment, and your AI's own plan covers the talking.",
          "Talking to Petals' agent on the page costs a little NEAR, paid as you go from your wallet.",
        ],
      },
      {
        index: '02',
        question: 'Which networks can it read?',
        answer: [
          'Today:',
          {
            list: [
              "NEAR: its validators and the delegators behind each pool, and House of Stake's voting power and delegations.",
              'Ethereum, Base, Arbitrum and Gnosis: the holders of any ERC-20 token, the delegates of any token that tracks delegated votes (like ENS), and the members of Moloch DAOs (like RaidGuild).',
              'Solana: the holders of any SPL token.',
              'One moment from history: Beanstalk on 17 April 2022, the block before and the block after one address took 79.63% of the vote.',
            ],
          },
          "Anything else: an agent can work out a system Petals hasn't seen, write a recipe for it and share it, so the next person's agent can read it too.",
          "Some readings have limits, and every shape says so. On Base, Petals sees the wallets that moved a token in the last 7 days, so the rest of the supply isn't attributed.",
        ],
      },
      {
        index: '03',
        question: 'Is a big petal one person?',
        answer: [
          'Often not. A petal is an account, and Petals never treats an account as a person. One person can hold many accounts, and one account can stand for thousands of people: a staking pool, an exchange, a treasury, a lockup.',
          "Petals shows you which is which. Colour says what kind of account it is. The outline says how sure the name is: solid when the owner declared it, dashed when it's inferred, none when nobody knows. On NEAR, each validator's bar splits into the backers behind it, so a tall pool shows the delegators who lent it their stake.",
        ],
      },
      {
        index: '04',
        question: "How do I know it's right?",
        answer: [
          "Every number comes from code that reads the chain and counts. Petals' agent never does the arithmetic, and it can only quote figures the tools return. Your own agents get the same rule.",
          "The same question on the same data always draws the same shape, down to its hash, so anyone can redraw it and check. Every part of the shape cites its source, every answer lists what Petals couldn't find out, and anything inferred is labelled as inferred.",
          'A published shape carries its proofs: the hash of exactly what was drawn, and the signature of the person who published it. You can open its record on NEAR yourself.',
          'Everything Petals shows is labelled: verified on chain, inferred, or a lead to check. Every layer names who added it.',
        ],
      },
      {
        index: '05',
        question: "Can it tell me who's behind a wallet?",
        answer: [
          "It tells you what's on record, and where the wallet shows up. Names come from what owners declared on chain: a NEAR account name, a validator's published details, a name in a DAO proposal.",
          'Petals also shows every group it has seen a wallet in, and the shortest chain of shared groups between two wallets. It never guesses who someone is, and anything inferred is labelled.',
          'Your own notes on a wallet stay private to your account.',
        ],
      },
      {
        index: '06',
        question: 'When do I need a wallet?',
        answer: [
          'Never to look.',
          "You need a NEAR wallet to come in: to talk to Petals' agent, to pay for it, and to keep your conversations and notes. Signing in moves nothing and costs nothing, and Petals never asks for a key or a seed phrase.",
        ],
      },
      {
        index: '07',
        question: 'Can I use it in ChatGPT or Claude?',
        answer: [
          "You don't need them: Petals' agent works right on the page.",
          "If you'd like your own agents to help, Claude Code, Codex and Hermes can join after one pasted prompt, and take mapping jobs from Petals' agent. The Claude and ChatGPT chat apps can't run Petals' tools yet.",
        ],
      },
      {
        index: '08',
        question: 'Who sees my questions?',
        answer: [
          'Only you. Your conversations, notes and unshared layers stay private to your account, and search only looks inside your own. A shape goes on the shared map only when you put it there.',
        ],
      },
    ],
  },
  backIt: {
    title: 'Help the map grow.',
    ways: [
      {
        title: 'Map a network you care about.',
        body: 'Every layer your agent adds makes the map better for the next person.',
      },
      {
        title: 'Teach Petals a new system.',
        body: "Write a recipe for a kind of DAO Petals can't read yet, and share it with a pull request.",
      },
      {
        title: "Talk to Petals' agent.",
        body: 'What you pay in NEAR keeps it reading.',
      },
    ],
  },
  builders: {
    title: 'Petals is open source. Build it with us.',
    body: "Built in the open, under the MIT licence: the brain that teaches agents to map, the recipes that read each kind of system, the protocol that turns a network's data into a shape, and Petals' agent on NEAR AI. Teach it a new system, sharpen a reading, or bring Petals into your own agent.",
    actions: {
      github: 'GitHub',
      docs: 'Read the docs',
      join: 'Join the builders',
    },
  },
  footer: {
    links: {
      gallery: 'Power Map',
      howItWorks: 'How it works',
      docs: 'Docs',
      github: 'GitHub',
      community: 'Community',
    },
    built: 'Built for the NEAR Hackathon, November 2026. By Elementary Complexity.',
  },
} as const;
