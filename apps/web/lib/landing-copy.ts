// Figma's words for the landing page, verbatim (frame 66:2180), so the copy pass touches one file.
// Double spaces are Figma's and render as written. The arrows aren't here: Geist Mono and our Mona Sans
// subset have neither U+2192 nor U+2190, so the components draw them (components/ui/Arrow.tsx).
export const landingCopy = {
  nav: {
    howItWorks: 'How it works',
    gallery: 'Atlas',
    docs: 'Docs',
    ask: 'Ask Petals',
  },
  ask: {
    placeholder: 'Ask about any network, or paste an address.',
    action: 'Ask',
  },
  hero: {
    eyebrow: 'AN INSTRUMENT FOR READING POWER',
    title: 'Power has\na shape.',
    body: 'Petals draws it, then lets you question it. Start at any address and follow the power wherever it leads.',
    starterLabel: 'OR START WITH A READY-MADE QUESTION',
    starters: [
      'Who decides in this DAO?',
      'How many wallets does it take to pass a vote?',
      'Are any of these accounts the same person?',
      'Who funds whom?',
      'How spread out is power here?',
    ],
    caption: 'FIG. 1 — A SAMPLE NETWORK, 88 ACCOUNTS. ILLUSTRATIVE DATA.',
    notes: {
      one: '01  ONE PETAL HOLDS 18% OF THE VOTE',
      two: '02  FOUR PETALS, ONE WALLET BEHIND THEM',
      three: '03  DOTTED RING: WHAT IT TAKES TO PASS A VOTE',
      four: '04  LINES INSIDE: WHO VOTES, PAYS AND SIGNS TOGETHER',
    },
    callout: {
      who: 'PETALS',
      text: 'This one petal outweighs the bottom sixty put together.',
      action: 'ASK WHY',
    },
  },
  flowerRead: {
    eyebrow: 'FROM THE ATLAS  ·  1 / 5',
    title: 'One account, one petal.\nOne network, one flower.',
    caption:
      'FIG. 2 — HEROES: STANDOUT FLOWERS PEOPLE HAVE MAPPED. THEY ROTATE, AND THEIR INSIGHTS ANIMATE IN AND OUT.',
    transcript: {
      start: 'SAMPLE DAO  ·  54 ACCOUNTS  ·  5 NOV 2026',
      end: 'MAPPED BY ANA.NEAR',
      lines: [
        'Three petals are taller than the rest of the flower combined.',
        'Together they can pass any proposal.',
        'Two of them were funded from the same wallet within the same hour.',
      ],
    },
    open: 'Curious? Open this flower',
    keepAsking: 'Keep asking about this one',
  },
  howItWorks: {
    eyebrow: 'HOW IT WORKS',
    title: 'Three steps, one question at a time.',
    steps: [
      {
        numeral: '01',
        title: 'Ask',
        body: 'Name a network or paste an address.',
      },
      {
        numeral: '02',
        title: 'See',
        body: 'The agent reads the chain, the forum and the documents, decides what counts as power there, and draws the flower.',
      },
      {
        numeral: '03',
        title: 'Question it',
        body: 'Click any petal. Ask why it’s that size, who it moves with, and what would change it.',
      },
    ],
    stepOneQuestion: 'Who decides in this DAO?',
    stepThree: { who: 'YOU', text: 'Why is this petal so big?' },
    ask: 'Ask your first question',
    gallery: 'Or open the atlas',
  },
  questions: {
    eyebrow: 'FAQ',
    title: 'Questions Petals answers.',
    body: 'Each answer is a pattern of power you will start to see everywhere. Ask any of these about a network you care about.',
    items: [
      {
        index: '01',
        question: 'Who decides?',
        answer:
          'Petals sizes every petal by what that account can actually move: votes, stake, delegated power. The tallest petals decide. Ask how many it takes to pass a proposal and Petals counts them for you.',
      },
      {
        index: '02',
        question: 'Who pays whom?',
        answer:
          'Lines inside the flower trace money: grants, transfers, payroll, rewards. Follow one line and you see who funds whom, and who depends on whom.',
      },
      {
        index: '03',
        question: 'Who votes together?',
        answer:
          'Accounts that keep voting the same way sit side by side and share a colour. A bloc of small petals can outweigh one big one.',
      },
      {
        index: '04',
        question: 'Who is quietly the same person?',
        answer:
          'Wallets funded from the same source, or moving within minutes of each other, get flagged as possibly one pair of hands. Petals shows the evidence and how sure it is, and leaves the verdict to you.',
      },
      {
        index: '05',
        question: 'What happens when nobody shows up?',
        answer:
          'When turnout drops, the few who vote decide for everyone. Petals shows the gap between who could vote and who did.',
      },
      {
        index: '06',
        question: 'Who gets paid if this passes?',
        answer:
          'Point Petals at a proposal and it traces where the money goes and which petals gain. Ask it before you vote.',
      },
    ],
  },
  gallery: {
    eyebrow: 'THE ATLAS',
    title: 'Start with a network you know.',
    open: 'Open the atlas',
    cards: [
      { title: 'House of Stake', note: 'TWO BLOCS HOLD MOST OF THE SAY' },
      { title: 'NEAR validators', note: 'POWER SPREAD WIDE AND EVEN' },
      { title: 'JTO holders', note: 'ONE PETAL TOWERS OVER THE REST' },
    ],
    caption: 'FIGURES ARE PLACEHOLDERS UNTIL THE ATLAS RENDERS.',
  },
  builders: {
    eyebrow: 'FOR BUILDERS',
    title: 'Add Petals to your agent.',
    body: 'The same reading, as an API and an agent skill. Ask from your own tools and get back the flower, the reasoning and the evidence behind every petal.',
    action: 'Read the docs',
    terminal: {
      start: 'AGENT SKILL  ·  API  ·  MCP',
      end: 'ILLUSTRATIVE',
      lines: [
        { text: '# give your agent the Petals skill' },
        { text: '$ petals connect claude', accent: true },
        { text: ' ' },
        { text: '> Who stands behind NEAR’s validators?' },
        { text: '  reading the chain, the forum and the docs…' },
        { text: 'flower.svg   reasoning.md   evidence.json', returned: true },
      ],
    },
  },
  closing: {
    title: 'Power has a shape.\nAsk to see it.',
    starters: ['How many wallets does it take to pass a vote?', 'How spread out is power here?'],
  },
  community: {
    eyebrow: 'COMMUNITY',
    title: 'Grow the atlas with us.',
    body: 'Petals grows when people map the networks they care about. Join the community to share flowers, request networks to be mapped and see what others find. Donations keep the agent reading.',
    join: 'Join the community',
    support: 'Support Petals',
    caption: 'TELEGRAM OR DISCORD  ·  DONATIONS ON NEAR',
  },
  footer: {
    links: {
      gallery: 'Atlas',
      howItWorks: 'How it works',
      docs: 'Docs',
      community: 'Community',
      github: 'GitHub',
    },
    built: 'BUILT AT THE NEAR HACKATHON, NOVEMBER 2026. RUNS ON NEAR.',
    tagline: 'AN INSTRUMENT FOR READING POWER',
  },
} as const;
