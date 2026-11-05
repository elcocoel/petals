// Saved data for the lab, read from the repo's fixtures/ when a state renders. No network, no model.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Entry, FlowerResult, ModelSignature, PetalDetail, Spec } from '@petal/core/types';
import { repoRoot } from '../lib/config.ts';
import type { Rendered } from '../lib/flower-data.ts';
import { parseMarkdown } from '../lib/markdown.ts';
import type { Prepared } from '../lib/publish.ts';
import type { FlowerRow, Row, StepRow } from '../lib/thread-view.ts';

const read = (path: string) => readFileSync(join(repoRoot(), 'fixtures', path), 'utf8');

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
