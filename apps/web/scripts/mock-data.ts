// Writes apps/web/lib/mock/near-validators.json, the canned answers of the web's API mock
// (T062), from the NEAR validators fixture snapshot. Run: node apps/web/scripts/mock-data.ts
//
// MOCK ONLY. These values stand in for the real tools until W1 (counting, renderer) and W4/W5
// (tools, petalApp) land; then the web app uses petalApp and this file is not read. The
// placeholder SVG is not the renderer: it is a plain polygon with one straight bar per petal,
// labelled as a placeholder, so the flower view has something with data-p to click.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { DEFAULT_CONVENTION, PRIMITIVES, TOOLS_VERSION } from '@petal/core';
import type {
  Figures,
  LegendItem,
  Participant,
  PetalDetail,
  Snapshot,
  SnapshotResult,
  Spec,
} from '@petal/core/types';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../../..');
const SHA = '72a6d9676d967d63712dc82bcbb90282d2f61e5ca6495c3e2e54a4f9af77e9ec';
const MEASURE = 'validator_stake_current_epoch';
const PETALS = 60; // the spec's cap
const DRAWN = 12; // petals the placeholder draws before its tail
const YOCTO = 10n ** 24n;

const snapshot = JSON.parse(
  gunzipSync(readFileSync(join(root, `fixtures/snapshots/${SHA}.json.gz`))).toString('utf8'),
) as Snapshot;

const toYocto = (amount: string): bigint => {
  const [int = '0', frac = ''] = amount.split('.');
  return BigInt(int) * YOCTO + BigInt((frac + '0'.repeat(24)).slice(0, 24));
};
const toNear = (y: bigint): string => {
  const int = y / YOCTO;
  const frac = (y % YOCTO).toString().padStart(24, '0').replace(/0+$/, '');
  return frac ? `${int}.${frac}` : `${int}`;
};
const ratio = (a: bigint, b: bigint): number => Number((a * 10n ** 12n) / b) / 1e12;
const r6 = (x: number): number => Math.round(x * 1e6) / 1e6;

const people = new Map<string, Participant>(snapshot.participants.map((p) => [p.id, p]));
const rows = snapshot.holdings
  .filter((h) => h.measure === MEASURE)
  .map((h) => ({ id: h.participant, y: toYocto(h.amount) }))
  .sort((a, b) => (b.y > a.y ? 1 : b.y < a.y ? -1 : a.id < b.id ? -1 : 1));
const total = rows.reduce((a, r) => a + r.y, 0n);
const shares = rows.map((r, i) => ({
  id: r.id,
  label: people.get(r.id)?.label ?? r.id,
  amount: toNear(r.y),
  share: r6(ratio(r.y, total)),
  rank: i + 1,
  y: r.y,
}));

const topK = (k: number) =>
  r6(
    ratio(
      rows.slice(0, k).reduce((a, r) => a + r.y, 0n),
      total,
    ),
  );
let cum = 0n;
let nakamoto = 0;
for (const r of rows) {
  cum += r.y;
  nakamoto++;
  if (cum * 3n > total) break;
}
const exact = rows.map((r) => ratio(r.y, total));
const hhi = r6(exact.reduce((a, s) => a + s * s, 0));
const asc = [...exact].sort((a, b) => a - b);
const n = asc.length;
const gini = r6(
  asc.reduce((a, s, i) => a + (2 * (i + 1) - n - 1) * s, 0) / (n * asc.reduce((a, s) => a + s, 0)),
);
const tailY = rows.slice(PETALS).reduce((a, r) => a + r.y, 0n);

const figures: Figures & { tools_version: string } = {
  measure: MEASURE,
  unit: 'NEAR',
  total: toNear(total),
  participants_total: rows.length,
  participants_included: rows.length,
  shares: shares.slice(0, PETALS).map(({ y: _y, ...s }) => s),
  top_k_share: { '1': topK(1), '5': topK(5), '10': topK(10), '100': topK(100) },
  nakamoto: { threshold: 0.333333, count: nakamoto },
  hhi,
  gini,
  tail: { count: rows.length - PETALS, amount: toNear(tailY), share: r6(ratio(tailY, total)) },
  fusions: [],
  figure_ids: [
    'fig:total',
    'fig:shares',
    'fig:top_k_share.1',
    'fig:top_k_share.5',
    'fig:top_k_share.10',
    'fig:top_k_share.100',
    'fig:nakamoto',
    'fig:hhi',
    'fig:gini',
    'fig:tail',
  ],
  tools_version: TOOLS_VERSION,
};

const c = DEFAULT_CONVENTION.encodings;
const spec: Spec = {
  petal: 'spec/v1',
  network: {
    id: snapshot.network.id,
    chain: snapshot.network.chain,
    population: snapshot.network.population,
  },
  snapshot: {
    sha256: SHA,
    as_of: snapshot.snapshot.as_of,
    block_height: snapshot.snapshot.block_height,
  },
  labels: 'none',
  selection: { measure: MEASURE, petals: PETALS, tail: DEFAULT_CONVENTION.tail },
  encodings: {
    width: { ...c.width, sources: ['fastnear-rpc-validators'] },
    height: { ...c.height, sources: ['fastnear-rpc-validators'] },
    colour: { ...c.colour, sources: ['nearblocks-validators', 'fastnear-rpc-liquid-staking'] },
    outline: c.outline && { ...c.outline, sources: ['nearblocks-validators', 'account-id'] },
    segments: {
      by: 'backers',
      meaning:
        'who backs the pool: other delegators, accounts with 1M+ NEAR, liquid-staking contracts, lockups',
      sources: ['fastnear-rpc-staking-pool-views'],
    },
    lines: null,
    markings: null,
    order: { ...c.order, sources: ['fastnear-rpc-validators'] },
  },
  convention: { id: DEFAULT_CONVENTION.id, variation_of: null, changes: [] },
};

const CLASSES = [
  { key: 'other', label: 'other delegators' },
  { key: 'large', label: 'accounts with 1M+ NEAR' },
  { key: 'liquid', label: 'liquid-staking contracts' },
  { key: 'lockup', label: 'lockups' },
];
const backerClass = (from: string): string => {
  const p = people.get(from);
  const declared = (p?.detail as { backer_class?: string } | undefined)?.backer_class;
  if (declared) return declared;
  return p?.kind === 'staking_entity' ? 'liquid' : 'other';
};
const backers = new Map<string, Map<string, bigint>>();
for (const r of snapshot.relationships) {
  if (r.type !== 'delegates_to' || !r.amount) continue;
  const pool = backers.get(r.to) ?? new Map<string, bigint>();
  const k = backerClass(r.from);
  pool.set(k, (pool.get(k) ?? 0n) + toYocto(r.amount));
  backers.set(r.to, pool);
}

const maxShare = shares[0]?.share ?? 1;
const petals: PetalDetail[] = shares.slice(0, DRAWN).map((s, index) => {
  const p = people.get(s.id);
  const pool = backers.get(s.id) ?? new Map<string, bigint>();
  const poolTotal = [...pool.values()].reduce((a, v) => a + v, 0n);
  const status = p?.identity?.status ?? 'none';
  return {
    index,
    id: s.id,
    label: s.label,
    kind: p?.kind ?? 'unknown',
    identity: p?.identity ?? null,
    amount: s.amount,
    share: s.share,
    rank: s.rank,
    values: [
      { primitive: 'width', value: s.share, explains: 'share of stake, in a 2x band' },
      {
        primitive: 'height',
        value: r6(Math.sqrt(s.share / maxShare)),
        explains: 'square root of share, relative to the largest',
      },
      { primitive: 'colour', value: p?.kind ?? 'unknown', explains: 'kind of account' },
      { primitive: 'outline', value: status, explains: 'how the name is known' },
      { primitive: 'segments', value: pool.size, explains: 'backer classes behind the pool' },
      { primitive: 'order', value: s.rank, explains: 'largest first, clockwise from the top' },
    ],
    segments: CLASSES.filter((k) => pool.has(k.key)).map((k) => ({
      ...k,
      amount: toNear(pool.get(k.key) ?? 0n),
      frac: poolTotal ? r6(ratio(pool.get(k.key) ?? 0n, poolTotal)) : 0,
    })),
  };
});
const restY = rows.slice(DRAWN).reduce((a, r) => a + r.y, 0n);
petals.push({
  index: DRAWN,
  id: '__tail',
  label: `everyone else (${rows.length - DRAWN} validators)`,
  kind: 'group',
  identity: null,
  amount: toNear(restY),
  share: r6(ratio(restY, total)),
  rank: DRAWN + 1,
  values: [{ primitive: 'tail', value: rows.length - DRAWN, explains: 'validators folded here' }],
  count: rows.length - DRAWN,
});

const legend: LegendItem[] = [
  ...(['width', 'height', 'colour', 'outline', 'segments', 'order'] as const).map((k) => {
    const e = spec.encodings[k];
    return { primitive: k, meaning: e?.meaning ?? '', sources: [...(e?.sources ?? [])] };
  }),
  { primitive: 'tail', meaning: 'everyone else, grouped and hatched', sources: [] },
];
const colour = legend.find((l) => l.primitive === 'colour');
if (colour) {
  colour.keys = [
    { swatch: 'var(--k-staking_pool)', label: 'staking pool' },
    { swatch: 'var(--k-staking_entity)', label: 'liquid-staking entity' },
  ];
}
const segs = legend.find((l) => l.primitive === 'segments');
if (segs) segs.keys = CLASSES.map((k) => ({ swatch: `var(--seg-${k.key})`, label: k.label }));

// The placeholder drawing: a regular polygon, one straight bar per petal, the tail hatched.
const size = 800;
const R = 380;
const r0 = 0.32 * R;
const sides = petals.length;
const f = (x: number) => x.toFixed(2);
const pt = (r: number, a: number) => [size / 2 + r * Math.cos(a), size / 2 + r * Math.sin(a)];
const corners = Array.from({ length: sides }, (_, i) =>
  pt(r0, -Math.PI / 2 + (i * 2 * Math.PI) / sides),
);
const bars = petals.map((p, i) => {
  const a0 = -Math.PI / 2 + (i * 2 * Math.PI) / sides;
  const a1 = a0 + (2 * Math.PI) / sides;
  const mid = (a0 + a1) / 2;
  const h = p.id === '__tail' ? 0.5 : Math.min(1, Math.max(0.03, Math.sqrt(p.share / maxShare)));
  const len = h * (R - r0) * Math.cos(Math.PI / sides);
  const [x0, y0] = pt(r0, a0 + 0.01);
  const [x1, y1] = pt(r0, a1 - 0.01);
  const [dx, dy] = [Math.cos(mid) * len, Math.sin(mid) * len];
  const cls = p.id === '__tail' ? 'petal-seg tail' : `petal-seg k-${p.kind}`;
  return `<path class="${cls}" data-p="${p.id}" data-i="${i}" data-seg="all" d="M${f(x0)} ${f(y0)}L${f(x1)} ${f(y1)}L${f(x1 + dx)} ${f(y1 + dy)}L${f(x0 + dx)} ${f(y0 + dy)}Z"/>`;
});
const svg = [
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="NEAR validators (placeholder drawing)" data-petal="placeholder">`,
  '<style>.petal-seg{stroke:#fff;stroke-width:1}.k-staking_pool{fill:var(--k-staking_pool,#6b8f71)}.k-staking_entity{fill:var(--k-staking_entity,#c9a227)}.tail{fill:url(#hatch)}.core{fill:#eee}.note{font:14px sans-serif;fill:#888}</style>',
  '<defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#ddd"/><line x1="0" y1="0" x2="0" y2="6" stroke="#999" stroke-width="2"/></pattern></defs>',
  `<path class="core" d="${corners.map(([x, y], i) => `${i ? 'L' : 'M'}${f(x)} ${f(y)}`).join('')}Z"/>`,
  ...bars,
  `<text class="note" x="${size / 2}" y="${size - 8}" text-anchor="middle">placeholder drawing from the API mock: renderFlower (W1) is not merged yet</text>`,
  '</svg>',
].join('\n');

const at = snapshot.snapshot;
const snapshotResult: SnapshotResult & { tools_version: string } = {
  sha256: SHA,
  reused: true,
  where: 'fixture',
  network: snapshot.network,
  snapshot: { as_of: at.as_of, block_height: at.block_height, final: at.final },
  coverage: snapshot.coverage,
  sources: snapshot.sources,
  counts: {
    participants: snapshot.participants.length,
    holdings: snapshot.holdings.length,
    relationships: snapshot.relationships.length,
    events: snapshot.events.length,
  },
  body_url: `/api/v1/snapshots/${SHA}`,
  tools_version: TOOLS_VERSION,
};

const kinds = [...new Set(snapshot.participants.map((p) => p.kind))].sort();
const describe = {
  measures: [{ id: MEASURE, unit: 'NEAR', total: toNear(total) }],
  kinds_present: kinds,
  segment_options: [{ by: 'backers', label: 'who backs each pool' }],
  line_options: [],
  has_fusions: false,
  primitives: PRIMITIVES.map(({ id, status, note }) => ({ id, status, note })),
  top: shares.slice(0, 10).map((s) => ({
    id: s.id,
    label: s.label,
    kind: people.get(s.id)?.kind ?? 'unknown',
    identity: people.get(s.id)?.identity ?? null,
    share: s.share,
  })),
  coverage_note: 'all 371 seated validators; small delegations folded into declared groups',
  sources: snapshot.sources.map((s) => ({ id: s.id, url: s.url })),
  tools_version: TOOLS_VERSION,
};

const out = {
  note: 'MOCK: canned tool answers for the web API mock (apps/web/lib/api-mock.ts), made by apps/web/scripts/mock-data.ts from the NEAR validators fixture. Not the real tools; the placeholder SVG is not the renderer.',
  snapshot: snapshotResult,
  describe,
  figures,
  spec,
  legend,
  petals,
  placeholder_svg: svg,
};
const file = join(here, '../lib/mock/near-validators.json');
writeFileSync(file, `${JSON.stringify(out, null, 2)}\n`);
// Keep the file as `pnpm lint` wants it.
execFileSync(join(root, 'node_modules/.bin/biome'), ['format', '--write', file], {
  stdio: 'ignore',
});
console.log(
  `wrote ${file}: nakamoto ${nakamoto}, ${rows.length} validators, ${svg.length} svg bytes`,
);
