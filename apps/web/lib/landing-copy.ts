// The landing page's words, in one file, so a copy pass touches one file. The source is the "Landing copy
// for coders (v6)" tab of the "Petals — Copy" doc: its green text, word for word, and nothing else in that
// tab. Its yellow slots carry no words: an EmptySlot, or a placeholder drawing until the hero set (T108).
// Only the line breaks are ours. The three Connect buttons (nav, the hero box, How it works) are Elco's word
// from 9 Nov, which the doc may not have yet: Elco shot down Ask as a call to action.
// Nav isn't in the doc and keeps its words; "Atlas" stays everywhere until Elco picks the name.
// The arrows aren't here: Geist Mono and our Mona Sans subset have neither U+2192 nor U+2190, so the
// components draw them (components/ui/Arrow.tsx).
export const landingCopy = {
  nav: {
    howItWorks: 'How it works',
    gallery: 'Atlas',
    docs: 'Docs',
    ask: 'Connect',
  },
  hero: {
    eyebrow: 'SEE POWER MOVE',
    title: 'Power has\na shape.\nNow you\ncan see it.',
    body: 'Everything is connected. Petals shows you how.\nPoint Petals at any wallet or contract, or just name a community, and see how power moves.',
    ask: {
      /** All four, in this order: the box types one, holds it, deletes it, types the next (field.type). */
      placeholders: [
        'Name your target and start an investigation…',
        'What do you want to uncover?',
        'Name a community, a wallet or a contract…',
        'Who do you want to look into?',
      ],
      label: 'Ask about a network, a wallet or a contract',
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
        title: 'Name it.',
        body: 'Type a name, a ticker or an address. Petals finds it on chain, warns you about copycats, and asks before it reads anything new.',
      },
      {
        numeral: '02',
        title: 'Petals counts.',
        body: 'Code does the counting, so the same question always draws the same shape. The AI explains the shape, and every part of it cites a source.',
      },
      {
        numeral: '03',
        title: 'Question it.',
        body: 'Ask why a petal is that size, or ask it to measure something else. Petals redraws and shows what changed.',
      },
    ],
    action: 'Connect',
  },
  useAnywhere: {
    title: 'Take Petals into your own AI.',
    body: 'Free from your own AI: no account, no key, no payment. Your AI does the talking, and Petals reads and draws.',
    actions: {
      claude: 'Add to Claude',
      chatgpt: 'Add to ChatGPT',
      claudeCode: 'Add to Claude Code',
      prompt: 'Copy the prompt',
    },
    promptNote: 'For Claude Code, Codex and other agents that run commands.',
  },
  gallery: {
    title: 'Start with a network you know.',
    open: 'Open the atlas',
  },
  questions: {
    sign: '−',
    items: [
      {
        index: '01',
        question: 'Is it free?',
        answer: [
          'Looking is free. Every shape in the atlas opens without an account, a key or a wallet.',
          "Asking from your own AI is free too. Petals' tools need no account, key or payment, and your AI's own plan covers the talking.",
          'Publishing costs you nothing. You sign a short message in your NEAR wallet, and Petals writes your shape to the shared map.',
          "You can also fund a fresh reading, or a network Petals can't read yet. Petals quotes the price, to be paid through NEAR Intents. Paying isn't switched on yet.",
        ],
      },
      {
        index: '02',
        question: 'Which networks can it read?',
        answer: [
          'Today:',
          {
            list: [
              "NEAR: its validators and the delegators behind each pool, and House of Stake's voting power and delegations, read live.",
              'Ethereum, Base and Arbitrum: the holders of any ERC-20 token, the delegates of any token that tracks delegated votes (like ENS), and the members of any Moloch v1 DAO.',
              'Solana: the holders of any SPL token.',
              'One moment from history: Beanstalk on 17 April 2022, the block before and the block after one address took 79.63% of the vote.',
            ],
          },
          "Coming next: any Sputnik DAO on NEAR, and Bitcoin's mining pools. Ask for anything else and Petals tells you what it can read instead, and what adding it would cost.",
          "Some readings have limits, and every shape says so. On Base and Arbitrum, Petals sees the wallets that moved a token in the last week, so the rest of the supply isn't attributed. The NEAR validators reading is stored from 3 November.",
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
          'Every number comes from code that reads the chain and counts. The AI never does the arithmetic, and it can only quote figures the tools return.',
          "The same question on the same data always draws the same shape, down to its hash, so anyone can redraw it and check. Every part of the shape cites its source, every answer lists what Petals couldn't find out, and anything inferred is labelled as inferred.",
          'A published shape carries its proofs: the hash of exactly what was drawn, and the signature of the person who published it. You can open its record on NEAR yourself.',
        ],
      },
      {
        index: '05',
        question: "Can it tell me who's behind a wallet?",
        answer: [
          "It tells you what's on record, and where the wallet shows up. Names come from what owners declared on chain: a NEAR account name, a validator's published details, a name in a DAO proposal.",
          'Petals also shows every group it has seen a wallet in, and the shortest chain of shared groups between two wallets. It never guesses who someone is, and anything inferred is labelled.',
        ],
      },
      {
        index: '06',
        question: 'When do I need a wallet?',
        answer: [
          'Never to look, and never to ask from your own AI.',
          'You need a NEAR wallet to publish a shape. You sign a short message, Petals writes the shape to the map, and nothing you sign can move your funds. Petals never asks for a key or a seed phrase.',
        ],
      },
      {
        index: '07',
        question: 'Can I use it in ChatGPT or Claude?',
        answer: [
          'Yes. Add Petals to Claude or ChatGPT as a connector, then ask your question there. In Claude Code, Codex or any agent that runs commands, paste the Petals prompt. Your AI gets the same tools Petals uses here, and draws the same shapes.',
        ],
      },
      {
        index: '08',
        question: 'Who sees my questions?',
        answer: [
          'You, and anyone you give the link to. An investigation belongs to whoever started it. A shape becomes public only when you publish it.',
        ],
      },
    ],
  },
  backIt: {
    title: 'Keep Petals reading.',
  },
  builders: {
    title: 'Petals is open source. Build it with us.',
    body: 'The code, the spec for how a shape is drawn, and the modules that read each network, under the MIT licence. Add a network, sharpen a reading, or bring Petals into your own agent.',
    actions: {
      github: 'GitHub',
      docs: 'Read the docs',
      join: 'Join the builders',
    },
  },
  footer: {
    links: {
      gallery: 'Atlas',
      howItWorks: 'How it works',
      docs: 'Docs',
      github: 'GitHub',
      community: 'Community',
    },
    built: 'Built for the NEAR Hackathon, November 2026. By Elementary Complexity.',
  },
} as const;
