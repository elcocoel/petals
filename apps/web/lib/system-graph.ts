// The system graph on the landing's Build it with us: the system map (Figma "Systems map", 119:2271; "How it
// fits together", 122:2498) stood upright, you at the top, Petals in the middle, NEAR and other chains at the
// foot, with what travels along each line. Each part's words are taken whole from the README's parts tables
// and the docs, never written new, so the graph says what the docs say; `from` says where. Pure: the parts,
// the lines between them, and where a line runs once the parts are placed.

export type GraphBand = 'you' | 'petals' | 'outside';

export interface GraphPart {
  id: string;
  name: string;
  /** A small mono note over the name: what it is, or what it runs on. */
  note?: string;
  /** Its short explanation, shown while it's pointed at or focused. */
  words: string;
  /** Where the words come from, word for word. */
  from: string;
  band: GraphBand;
}

export const PARTS = {
  browser: {
    id: 'browser',
    name: 'Browser',
    words:
      'Name a community, wallet or contract. Petals’ agent, powered by NEAR AI, explores it with you.',
    from: 'docs/what-petals-is/index.md',
    band: 'you',
  },
  wallet: {
    id: 'wallet',
    name: 'NEAR wallet',
    note: 'NEP-413',
    words: 'Sign in by proving control of an account.',
    from: 'README.md, NEAR integrations',
    band: 'you',
  },
  cloud: {
    id: 'cloud',
    name: 'Claude app, ChatGPT',
    note: 'MCP',
    words: 'ChatGPT and the Claude chat app can also connect through Petals’ connector.',
    from: 'docs/use-it/connect-your-agent.md',
    band: 'you',
  },
  agents: {
    id: 'agents',
    name: 'Your agents',
    note: 'Claude Code · Codex · Hermes',
    words: 'Join a person’s work and return mapping jobs.',
    from: 'README.md, NEAR integrations',
    band: 'you',
  },
  site: {
    id: 'site',
    name: 'Site',
    words: 'The interface, API, saved work and access to the tools.',
    from: 'docs/getting-started/how-petals-works.md, Site and server',
    band: 'petals',
  },
  brain: {
    id: 'brain',
    name: 'Brain',
    words: 'Doctrine, chapters and recipes guide an agent’s reading and interpretation.',
    from: 'README.md, How the system is arranged',
    band: 'petals',
  },
  agent: {
    id: 'agent',
    name: 'Petals’ agent',
    words:
      'Petals’ agent works with you on the page and can hand mapping jobs to your connected agents.',
    from: 'docs/use-it/connect-your-agent.md',
    band: 'petals',
  },
  tools: {
    id: 'tools',
    name: 'Tools',
    words: 'Tools produce the numbers the agent can cite.',
    from: 'docs/getting-started/how-petals-works.md, step 3',
    band: 'petals',
  },
  jobs: {
    id: 'jobs',
    name: 'Jobs',
    words:
      'Once connected, your agent waits for jobs from Petals’ agent and brings what it finds back into the project the job came from.',
    from: 'docs/use-it/connect-your-agent.md, Jobs',
    band: 'petals',
  },
  flowers: {
    id: 'flowers',
    name: 'Data and rendering',
    words: 'Validate versioned records; connect data to dimensions; draw flowers.',
    from: 'README.md, How the system is arranged',
    band: 'petals',
  },
  payments: {
    id: 'payments',
    name: 'Payments',
    words:
      'Petals’ agent runs on NEAR AI, and each answer is paid as it goes, in dollars with NEAR beside.',
    from: 'docs/use-it/connect-your-wallet.md, step 3',
    band: 'petals',
  },
  social: {
    id: 'social',
    name: 'NEAR Social',
    words: 'Public profile data.',
    from: 'README.md, NEAR integrations',
    band: 'outside',
  },
  nearai: {
    id: 'nearai',
    name: 'NEAR AI Cloud',
    words: 'Petals’ hosted agent.',
    from: 'README.md, NEAR integrations',
    band: 'outside',
  },
  chains: {
    id: 'chains',
    name: 'Chains',
    note: 'NEAR · EVM · Solana',
    words: 'Petals reads systems on NEAR, Ethereum, Base, Arbitrum, Gnosis and Solana.',
    from: 'README.md, Data coverage',
    band: 'outside',
  },
  intents: {
    id: 'intents',
    name: 'NEAR Intents',
    note: '1Click',
    words: 'Top up from supported tokens and chains.',
    from: 'README.md, NEAR integrations',
    band: 'outside',
  },
} as const satisfies Record<string, GraphPart>;

export type PartId = keyof typeof PARTS;

/** The bands' names, over their parts. */
export const BANDS: Record<GraphBand, string> = {
  you: 'You',
  petals: 'Petals',
  outside: 'NEAR and other chains',
};

/** The name over the parts that run in Petals' server. */
export const SERVER = 'Server';

/**
 * How a line leaves one part and reaches the next: `down` from the foot of one to the top of the other,
 * `across` from the side of one to the side of the other, `rail` out past the left edge of everything and
 * back in, for a line that would otherwise cross the middle band (the browser reads NEAR Social itself).
 * What travels runs `forward` (from the first part to the second), `back`, or `both` ways.
 */
export interface GraphLine {
  from: PartId | 'server';
  to: PartId | 'server';
  label?: string;
  route: 'down' | 'across' | 'rail';
  travel: 'forward' | 'back' | 'both';
  /** Where along the first part's foot the line leaves, from its left (0) to its right (1). */
  leaves?: number;
}

export const LINES: readonly GraphLine[] = [
  { from: 'browser', to: 'site', label: 'pages', route: 'down', travel: 'both' },
  { from: 'wallet', to: 'site', label: 'sign-in', route: 'down', travel: 'forward' },
  { from: 'browser', to: 'social', label: 'profiles', route: 'rail', travel: 'back' },
  { from: 'site', to: 'server', label: 'API', route: 'down', travel: 'both' },
  { from: 'cloud', to: 'tools', label: '/mcp', route: 'down', travel: 'both' },
  { from: 'agents', to: 'jobs', label: 'jobs', route: 'down', travel: 'both' },
  { from: 'brain', to: 'agent', route: 'across', travel: 'forward' },
  { from: 'agent', to: 'tools', route: 'across', travel: 'both' },
  { from: 'agent', to: 'flowers', route: 'down', travel: 'forward', leaves: 0.25 },
  { from: 'agent', to: 'nearai', label: 'model', route: 'down', travel: 'both' },
  { from: 'tools', to: 'chains', label: 'reads', route: 'down', travel: 'back' },
  { from: 'payments', to: 'intents', label: 'top-up', route: 'down', travel: 'both' },
];

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Drawn {
  /** The SVG path. */
  d: string;
  /** Where its label sits: the middle of its longest run. */
  at: { x: number; y: number };
  /** Its length, so what travels on it keeps one speed. */
  length: number;
}

type Point = [number, number];

const draw = (points: Point[]): Drawn => {
  let length = 0;
  let longest = { size: -1, at: { x: points[0]?.[0] ?? 0, y: points[0]?.[1] ?? 0 } };
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1] as Point;
    const [bx, by] = points[i] as Point;
    const size = Math.hypot(bx - ax, by - ay);
    length += size;
    if (size > longest.size) longest = { size, at: { x: (ax + bx) / 2, y: (ay + by) / 2 } };
  }
  const d = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${round(x)} ${round(y)}`).join(' ');
  return { d, at: longest.at, length };
};

const round = (v: number) => Math.round(v * 10) / 10;

/**
 * Where a line runs between two placed parts, in the graph's own pixels. Lines are square, as the sketches'
 * are: straight when the parts line up, otherwise one turn there and one back, halfway between them.
 * `railX` is how far left a rail line goes.
 */
export function route(line: GraphLine, a: Box, b: Box, railX = 0): Drawn {
  if (line.route === 'across') {
    const x1 = a.x + a.w;
    const y1 = a.y + a.h / 2;
    const x2 = b.x;
    const y2 = b.y + b.h / 2;
    if (Math.abs(y1 - y2) < 1)
      return draw([
        [x1, y1],
        [x2, y2],
      ]);
    const mx = (x1 + x2) / 2;
    return draw([
      [x1, y1],
      [mx, y1],
      [mx, y2],
      [x2, y2],
    ]);
  }
  if (line.route === 'rail') {
    const y1 = a.y + a.h / 2;
    const y2 = b.y + b.h / 2;
    return draw([
      [a.x, y1],
      [railX, y1],
      [railX, y2],
      [b.x, y2],
    ]);
  }
  const x1 = a.x + a.w * (line.leaves ?? 0.5);
  const y1 = a.y + a.h;
  // into the top of the part below, or into its side when it sits level with where the line leaves
  if (b.y < y1) {
    const yb = b.y + b.h / 2;
    const xb = b.x + b.w < x1 ? b.x + b.w : b.x;
    return draw([
      [x1, y1],
      [x1, yb],
      [xb, yb],
    ]);
  }
  const x2 = Math.abs(b.x + b.w / 2 - x1) < b.w / 2 ? x1 : b.x + b.w / 2;
  const y2 = b.y;
  if (Math.abs(x1 - x2) < 1)
    return draw([
      [x1, y1],
      [x2, y2],
    ]);
  const my = (y1 + y2) / 2;
  return draw([
    [x1, y1],
    [x1, my],
    [x2, my],
    [x2, y2],
  ]);
}
