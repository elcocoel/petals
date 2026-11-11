// Saved data for the lab, read from the repo's fixtures/ when a state renders. No network, no model.
import type { Entry, FlowerResult, ModelSignature, PetalDetail, Spec } from '@petal/core/types';
import type { Rendered } from '../lib/flower-data.ts';
import { parseMarkdown } from '../lib/markdown.ts';
import type { Prepared } from '../lib/publish.ts';
import type { FlowerRow, Row, StepRow } from '../lib/thread-view.ts';

/**
 * The files under fixtures/ that the lab draws from. The lab's page renders on the client, so every
 * state's controls can hold a hand (a function), and the browser has no files: the server reads these
 * (lab/fixture-files.ts) and hands them to the page, which hands them here before anything renders.
 */
export const FIXTURE_FILES = [
  'golden/near-validators-default.json',
  'golden/near-validators-default.svg',
  'golden/near-validators-backers.json',
  'golden/near-validators-backers.svg',
  'golden/house-of-stake-default.json',
  'golden/house-of-stake-default.svg',
  'map/3394fb875bf97c1af8191566.json',
  'transcripts/skeleton.json',
  // two logos the map has (Trust Wallet's, by landscape/night.ts's logoFile): Magic Eden's and Safe's
  'landscape/logos/d9ef1a55e5a52375eb44b8b8.png',
  'landscape/logos/8231943617e6c45375cf405d.png',
] as const;

/** Every file as its text, and a picture as its data URL. */
export type FixtureFiles = Record<(typeof FIXTURE_FILES)[number], string>;

let files: Partial<FixtureFiles> = {};

/** The files, read on the server. */
export function provideFixtures(given: FixtureFiles) {
  files = given;
}

const read = (path: (typeof FIXTURE_FILES)[number]) => {
  const text = files[path];
  if (text === undefined) throw new Error(`lab: fixtures/${path} wasn't handed to the lab`);
  return text;
};

/** A logo the map has, as a data URL. */
export const logo = (which: 'magic-eden' | 'safe') =>
  read(
    which === 'magic-eden'
      ? 'landscape/logos/d9ef1a55e5a52375eb44b8b8.png'
      : 'landscape/logos/8231943617e6c45375cf405d.png',
  );

export type GoldenName =
  | 'near-validators-default'
  | 'near-validators-backers'
  | 'house-of-stake-default';

export interface Golden {
  spec: Spec;
  rendered: Rendered;
}

export function golden(name: GoldenName): Golden {
  const json = JSON.parse(read(`golden/${name}.json`));
  return {
    spec: json.spec,
    rendered: {
      spec_sha256: json.spec_sha256,
      render_sha256: json.render_sha256,
      svg: read(`golden/${name}.svg`),
      legend: json.legend,
      petals: json.petals,
      view_url: '',
    },
  };
}

export const entry = (): Entry => JSON.parse(read('map/3394fb875bf97c1af8191566.json'));

/** The first model signature in the recorded skeleton run. */
export function signature(): ModelSignature {
  const find = (node: unknown): ModelSignature | null => {
    if (!node || typeof node !== 'object') return null;
    if ('signature_kind' in node) return node as ModelSignature;
    for (const value of Object.values(node)) {
      const hit = find(value);
      if (hit) return hit;
    }
    return null;
  };
  const hit = find(JSON.parse(read('transcripts/skeleton.json')));
  if (!hit) throw new Error('lab: no signature in fixtures/transcripts/skeleton.json');
  return hit;
}

export function petal(name: GoldenName, pick: (p: PetalDetail) => boolean): PetalDetail {
  const hit = golden(name).rendered.petals.find(pick);
  if (!hit) throw new Error(`lab: no such petal in ${name}`);
  return hit;
}

/** A prepared publish message shaped like prepare_publish's, for the entry above. Nothing signs it. */
export const prepared = (): Prepared => ({
  entry_sha256: entry().id,
  nonce: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
  recipient: 'petals.testnet',
  message: `Publish Petals entry ${entry().id}`,
  expires_at: '2026-11-05T12:00:00Z',
});

/** Every block the Markdown view can draw. */
export const MARKDOWN = `## A heading

A paragraph with **bold**, *italic*, \`code\` and [a link](https://near.org).

- One item
- Another

1. First
2. Second

\`\`\`
near validators --limit 60
\`\`\`

---

| Who | Share |
|---|---|
| astro-stakers.poolv1.near | 5.61% |
| everyone else | 13.8% |
`;

/** A flower as it arrives in the thread, from the golden and the fixture flower's reading. */
export function flowerRow(overrides: Partial<FlowerRow> = {}): FlowerRow {
  const { spec, rendered } = golden('near-validators-default');
  const flower: FlowerResult = {
    spec,
    spec_sha256: rendered.spec_sha256,
    render_sha256: rendered.render_sha256,
    view_url: '#flowercard',
    legend: rendered.legend,
    interpretation: entry().interpretation,
    validation: { valid: true, errors: [], warnings: [] },
  };
  return {
    kind: 'flower',
    key: 'flower',
    index: 0,
    title: 'Near validators',
    sub: '60 petals  ·  NEAR  ·  3 Nov 2026',
    open: true,
    flower,
    signature: null,
    model: 'recorded',
    showLink: true,
    publishUrl: '#flowercard',
    checks: 'Checks passed',
    ...overrides,
  };
}

/** One of each kind of step. */
export const STEPS: StepRow[] = [
  { kind: 'stage', stage: 'reading', message: 'Reading the network' },
  { kind: 'progress', text: 'Reading validators (40/60)' },
  { kind: 'tool', name: 'get_snapshot', status: 'ok: 371 validators (120 ms)', args: '{}' },
  { kind: 'tool', name: 'render_flower', status: '…', args: '{}' },
];

/** One turn, using every row but the flower's, in the order a person reads them. */
export const TURN_ROWS: Row[] = [
  { kind: 'note', key: 'note', text: 'A note from the thread.' },
  { kind: 'user', key: 'user', text: 'Who decides in this DAO?', label: 'Original question' },
  { kind: 'steps', key: 'steps', summary: '2 tool calls', steps: STEPS },
  {
    kind: 'message',
    key: 'message',
    speaker: 'Petals',
    blocks: parseMarkdown('An answer, with **bold** text.'),
  },
  {
    kind: 'done',
    key: 'done',
    line: [{ t: 'text', v: 'Recorded run: no model answered just now.' }],
  },
];

/**
 * Words for specimens. They left the landing with copy v6, because they describe things Petals doesn't do
 * yet, and they stay here only so the lab can show a part with text in it. Nothing here reaches the page.
 */
export const specimen = {
  head: { eyebrow: 'THE ATLAS' },
  caption: 'FIGURES ARE PLACEHOLDERS UNTIL THE ATLAS RENDERS.',
  figureCaption: 'FIG. 1 — A SAMPLE NETWORK, 88 ACCOUNTS. ILLUSTRATIVE DATA.',
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
  you: { who: 'YOU', text: 'Why is this petal so big?' },
  transcript: {
    start: 'SAMPLE DAO  ·  54 ACCOUNTS  ·  5 NOV 2026',
    end: 'MAPPED BY ANA.NEAR',
    lines: [
      'Three petals are taller than the rest of the flower combined.',
      'Together they can pass any proposal.',
      'Two of them were funded from the same wallet within the same hour.',
    ],
  },
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
  cards: [
    { title: 'House of Stake', note: 'TWO BLOCS HOLD MOST OF THE SAY' },
    { title: 'NEAR validators', note: 'POWER SPREAD WIDE AND EVEN' },
    { title: 'JTO holders', note: 'ONE PETAL TOWERS OVER THE REST' },
  ],
} as const;
