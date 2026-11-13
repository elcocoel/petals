// Server only. The petal look's bench (V1): real flowers read through the art direction's view (height straight,
// no minimum; width carries nothing), keyed by core's look (wedge/keys.ts) and highlighted by it
// (wedge/highlight.ts). Only what a drawing needs goes to the browser. Real data only: every flower says its
// snapshot, what it draws and what it leaves out. "Everyone else" is drawn, folded (wedge/fold.ts): it's there,
// and it reads clearly as a group.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import type { ReadingPetal, Snapshot, Spec, ViewV2 } from '@petal/core/types';
import { type Fold, foldOf } from '@petal/core/wedge/fold';
import { GREY, KEYS, type Key, keyFor, keysOf } from '@petal/core/wedge/keys';
import type { FlowerReading } from '../../flower/model.ts';
import type { PetalLook } from '../../flower/scene.ts';
import { repoRoot } from '../../lib/config.ts';
import { LAB_DIR, RAIDGUILD } from './raidguild.ts';

/**
 * The art direction's view: height is the share, straight, so twice the votes is twice the height; width carries
 * no data, so every petal has the same room; colour is the kind of account; segments are who backs a petal, where
 * the flower has them. A view/v2 like any person's.
 */
export const ART_VIEW: ViewV2 = {
  petal: 'view/v2',
  dimensions: {
    height: { data: 'share', scale: 'linear' },
    width: null,
    order: { data: 'share' },
    colour: { data: 'kind' },
    outline: null,
    texture: null,
    markings: null,
    segments: { data: 'backers' },
    lines: null,
    labels: { data: 'identity' },
  },
};

/** The highlight's group on this bench: the wallets holding at least this share, the reference's own rule. */
export const HIGHLIGHT_SHARE = 0.02;

export interface KeyLine {
  hex: string;
  label: string;
  petals: number;
}

export interface LookFlower {
  reading: FlowerReading;
  look: PetalLook;
  /** what each colour stands for, in the key's order */
  key: KeyLine[];
  /** what the flower is, what it draws and what it leaves out, one line each */
  facts: string[];
  /** who the highlight is on, in words */
  highlight: string;
}

export interface PetalBench {
  raidguild: LookFlower;
  /** RaidGuild's flower in each key, and grey: colour carries no data here, only the highlight is checked */
  keys: { key: Key; flower: LookFlower }[];
  near: LookFlower;
}

const NEAR_GOLDEN = 'near-validators-backers';

export const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
export const whole = (x: number) => Math.round(x).toLocaleString('en-US');
export const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

export function snapshotAt(root: string, sha256: string, dir = 'fixtures/snapshots'): Snapshot {
  const gz = readFileSync(join(root, dir, `${sha256}.json.gz`));
  return JSON.parse(gunzipSync(gz).toString('utf8')) as Snapshot;
}

/** Loaded by Node itself, like every other use of core in the site (see lib/config.ts). */
export const loadCore = async () =>
  (await import(
    /* turbopackIgnore: true */ /* webpackIgnore: true */ '@petal/core'
  )) as typeof import('@petal/core');

/** Who the highlight is on, and how much they hold together. */
export function highlighted(petals: readonly ReadingPetal[], who: string) {
  const on = petals.filter((p) => p.share >= HIGHLIGHT_SHARE);
  const held = on.reduce((t, p) => t + p.share, 0);
  return {
    ids: on.map((p) => p.id),
    words: `Highlight: the ${on.length} ${who} holding ${pct(HIGHLIGHT_SHARE).replace('.0', '')} or more each, ${pct(held)} together.`,
  };
}

/** What a flower draws of its snapshot, and what it leaves out, in words. */
export function coverage(
  s: Snapshot,
  all: readonly ReadingPetal[],
  drawn: readonly ReadingPetal[],
  who: string,
) {
  const tail = all.find((p) => p.tail);
  // the drawing's own population: those drawn and those the tail folds, not every account the snapshot holds
  const total = drawn.length + (tail?.count ?? 0);
  const amount = drawn.reduce((t, p) => t + Number(p.amount), 0);
  const unit = s.coverage.unit ?? '';
  const lines = [
    `${drawn.length} of ${whole(total)} ${who} drawn, ${whole(amount)} ${unit} (${pct(drawn.reduce((t, p) => t + p.share, 0))}).`,
  ];
  if (tail)
    lines.push(
      `The other ${whole(tail.count ?? 0)} hold ${whole(Number(tail.amount))} ${unit} (${pct(tail.share)}): one grey petal as tall as that share, its stripes the members, the smallest nearest the centre.`,
    );
  return lines;
}

/** The art direction's view without segments, to read every member of a tail cheaply. */
const PLAIN_VIEW: ViewV2 = { ...ART_VIEW, dimensions: { ...ART_VIEW.dimensions, segments: null } };

/**
 * "Everyone else", one petal: as tall as the share it holds, on one scale with every other petal, so the scale's
 * top is the largest of them all, the tail included; and made of its members as stripes, the smallest nearest
 * the centre (core's foldOf). Read again with a selection as large as the population, so every member has its
 * share.
 */
export function folded(
  core: Awaited<ReturnType<typeof loadCore>>,
  spec: Spec,
  s: Snapshot,
  all: readonly ReadingPetal[],
): { petals: ReadingPetal[]; folds: Record<string, Fold> } {
  const tail = all.find((p) => p.tail);
  if (!tail) return { petals: [...all], folds: {} };
  const drawn = all.length - 1;
  const everyone = core.readFlower(
    { ...spec, selection: { ...spec.selection, petals: drawn + (tail.count ?? 0) } },
    s,
    PLAIN_VIEW,
    [],
    { floor: 0 },
  ).petals;
  const most = Math.max(...all.map((p) => p.share));
  const { fold } = foldOf(everyone.slice(drawn).map((p) => p.share / most));
  return {
    petals: all.map((p) => ({ ...p, height: p.share / most })),
    folds: { [tail.id]: fold },
  };
}

/** The key's line for the folded tail. */
const tailLine = (all: readonly ReadingPetal[]): KeyLine[] => {
  const tail = all.find((p) => p.tail);
  return tail
    ? [{ hex: GREY.hex, label: `everyone else, ${whole(tail.count ?? 0)} folded`, petals: 1 }]
    : [];
};

export const HEIGHT_WORDS =
  'Height: straight, so twice as much is twice as tall. Every petal has the same width.';

export async function petalBench(): Promise<PetalBench> {
  const root = repoRoot();
  const core = await loadCore();

  // RaidGuild's delegates, the flower the art direction was drawn on, with the spec the site proposes for it
  const rg = snapshotAt(root, RAIDGUILD.sha256, LAB_DIR);
  const rgSpec = JSON.parse(
    readFileSync(join(root, LAB_DIR, `${RAIDGUILD.sha256}.spec.json`), 'utf8'),
  ) as Spec;
  const rgAll = core.readFlower(rgSpec, rg, ART_VIEW, [], { floor: 0 }).petals;
  const rgDrawn = rgAll.filter((p) => !p.tail);
  const rgFolded = folded(core, rgSpec, rg, rgAll);
  const rgHigh = highlighted(rgDrawn, 'delegates');
  const kinds = keysOf(
    rgDrawn.map((p) => p.colour),
    rgDrawn.map((p) => p.share),
  );
  const rgFacts = [
    `${rg.network.title} on Gnosis, block ${whole(rg.snapshot.block_height ?? 0)}, ${day(rg.snapshot.as_of)}.`,
    ...coverage(rg, rgAll, rgDrawn, 'delegates'),
    `${HEIGHT_WORDS} Height is delegated votes.`,
  ];
  const reading = { title: rg.network.title, petals: rgFolded.petals };
  const raidguild: LookFlower = {
    reading,
    look: {
      fills: Object.fromEntries(
        rgFolded.petals.map((p) => [p.id, keyFor(kinds, p.colour)?.hex ?? GREY.hex]),
      ),
      bands: {},
      highlight: rgHigh.ids,
      folds: rgFolded.folds,
    },
    key: [
      ...kinds.map((k) => ({
        hex: k.key?.hex ?? GREY.hex,
        label: k.value === 'unknown' ? 'address of unknown kind' : k.value.replaceAll('_', ' '),
        petals: k.petals,
      })),
      ...tailLine(rgAll),
    ],
    facts: rgFacts,
    highlight: rgHigh.words,
  };

  const keys = [...KEYS, GREY].map((key) => ({
    key,
    flower: {
      ...raidguild,
      look: {
        fills: Object.fromEntries(rgFolded.petals.map((p) => [p.id, p.tail ? GREY.hex : key.hex])),
        bands: {},
        highlight: rgHigh.ids,
        folds: rgFolded.folds,
      },
      key: [
        { hex: key.hex, label: `${key.name}, carrying no data`, petals: rgDrawn.length },
        ...tailLine(rgAll),
      ],
    },
  }));

  // NEAR's validators with who backs them: the recorded backer segments
  const golden = JSON.parse(
    readFileSync(join(root, 'fixtures/golden', `${NEAR_GOLDEN}.json`), 'utf8'),
  ) as { spec: Spec };
  const ns = snapshotAt(root, golden.spec.snapshot.sha256);
  const nearAll = core.readFlower(golden.spec, ns, ART_VIEW, [], { floor: 0 }).petals;
  const nearDrawn = nearAll.filter((p) => !p.tail);
  const nearFolded = folded(core, golden.spec, ns, nearAll);
  const nearHigh = highlighted(nearDrawn, 'validators');
  // a band's class is common by how many petals carry a band of it
  const classes = keysOf(
    nearDrawn.flatMap((p) => p.segments.map((s) => s.key)),
    nearDrawn.flatMap((p) => p.segments.map((s) => Number(s.amount))),
  );
  const labelOf = new Map(nearDrawn.flatMap((p) => p.segments.map((s) => [s.key, s.label])));
  const bare = nearDrawn.filter((p) => p.segments.length === 0).length;
  const near: LookFlower = {
    reading: { title: ns.network.title, petals: nearFolded.petals },
    look: {
      // a petal with no recorded backers draws grey: unknown, kept apart; so does the folded tail
      fills: Object.fromEntries(nearFolded.petals.map((p) => [p.id, GREY.hex])),
      bands: Object.fromEntries(classes.map((c) => [c.value, c.key?.hex ?? GREY.hex])),
      highlight: nearHigh.ids,
      folds: nearFolded.folds,
    },
    key: [
      ...classes.map((c) => ({
        hex: c.key?.hex ?? GREY.hex,
        label: labelOf.get(c.value) ?? c.value,
        petals: c.petals,
      })),
      ...(bare > 0 ? [{ hex: GREY.hex, label: 'no backers recorded', petals: bare }] : []),
      ...tailLine(nearAll),
    ],
    facts: [
      `${ns.network.title}, block ${whole(ns.snapshot.block_height ?? 0)}, ${day(ns.snapshot.as_of)}.`,
      ...coverage(ns, nearAll, nearDrawn, 'validators'),
      `${HEIGHT_WORDS} Height is stake this epoch; its bands are who backs each validator, as recorded, bottom to top.`,
    ],
    highlight: nearHigh.words,
  };

  return { raidguild, keys, near };
}
