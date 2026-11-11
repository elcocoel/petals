// Server only. The petal look's bench (#76; design/flower-art-direction/default-system-vnext.md, V1, Elco 11 Nov):
// real flowers read through the art direction's view (height straight, no minimum; width carries nothing), keyed
// by core's look (wedge/keys.ts) and highlighted by it (wedge/highlight.ts). Only what a drawing needs goes to the
// browser. Real data only: every flower says its snapshot, what it draws and what it leaves out.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import type { ReadingPetal, Snapshot, Spec, ViewV2 } from '@petal/core/types';
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
const ART_VIEW: ViewV2 = {
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

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const whole = (x: number) => Math.round(x).toLocaleString('en-US');
const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

function snapshotAt(root: string, sha256: string, dir = 'fixtures/snapshots'): Snapshot {
  const gz = readFileSync(join(root, dir, `${sha256}.json.gz`));
  return JSON.parse(gunzipSync(gz).toString('utf8')) as Snapshot;
}

/** Loaded by Node itself, like every other use of core in the site (see lib/config.ts). */
const loadCore = async () =>
  (await import(
    /* turbopackIgnore: true */ /* webpackIgnore: true */ '@petal/core'
  )) as typeof import('@petal/core');

/** Who the highlight is on, and how much they hold together. */
function highlighted(petals: readonly ReadingPetal[], who: string) {
  const on = petals.filter((p) => p.share >= HIGHLIGHT_SHARE);
  const held = on.reduce((t, p) => t + p.share, 0);
  return {
    ids: on.map((p) => p.id),
    words: `Highlight: the ${on.length} ${who} holding ${pct(HIGHLIGHT_SHARE).replace('.0', '')} or more each, ${pct(held)} together.`,
  };
}

/** What a flower draws of its snapshot, and what it leaves out, in words. */
function coverage(
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
      `The other ${whole(tail.count ?? 0)} hold ${whole(Number(tail.amount))} ${unit} (${pct(tail.share)}) and aren't drawn here.`,
    );
  return lines;
}

const HEIGHT_WORDS =
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
  const reading = { title: rg.network.title, petals: rgDrawn };
  const raidguild: LookFlower = {
    reading,
    look: {
      fills: Object.fromEntries(
        rgDrawn.map((p) => [p.id, keyFor(kinds, p.colour)?.hex ?? GREY.hex]),
      ),
      bands: {},
      highlight: rgHigh.ids,
    },
    key: kinds.map((k) => ({
      hex: k.key?.hex ?? GREY.hex,
      label: k.value === 'unknown' ? 'address of unknown kind' : k.value.replaceAll('_', ' '),
      petals: k.petals,
    })),
    facts: rgFacts,
    highlight: rgHigh.words,
  };

  const keys = [...KEYS, GREY].map((key) => ({
    key,
    flower: {
      ...raidguild,
      look: {
        fills: Object.fromEntries(rgDrawn.map((p) => [p.id, key.hex])),
        bands: {},
        highlight: rgHigh.ids,
      },
      key: [{ hex: key.hex, label: `${key.name}, carrying no data`, petals: rgDrawn.length }],
    },
  }));

  // NEAR's validators with who backs them: the recorded backer segments
  const golden = JSON.parse(
    readFileSync(join(root, 'fixtures/golden', `${NEAR_GOLDEN}.json`), 'utf8'),
  ) as { spec: Spec };
  const ns = snapshotAt(root, golden.spec.snapshot.sha256);
  const nearAll = core.readFlower(golden.spec, ns, ART_VIEW, [], { floor: 0 }).petals;
  const nearDrawn = nearAll.filter((p) => !p.tail);
  const nearHigh = highlighted(nearDrawn, 'validators');
  // a band's class is common by how many petals carry a band of it
  const classes = keysOf(
    nearDrawn.flatMap((p) => p.segments.map((s) => s.key)),
    nearDrawn.flatMap((p) => p.segments.map((s) => Number(s.amount))),
  );
  const labelOf = new Map(nearDrawn.flatMap((p) => p.segments.map((s) => [s.key, s.label])));
  const bare = nearDrawn.filter((p) => p.segments.length === 0).length;
  const near: LookFlower = {
    reading: { title: ns.network.title, petals: nearDrawn },
    look: {
      // a petal with no recorded backers draws grey: unknown, kept apart
      fills: Object.fromEntries(nearDrawn.map((p) => [p.id, GREY.hex])),
      bands: Object.fromEntries(classes.map((c) => [c.value, c.key?.hex ?? GREY.hex])),
      highlight: nearHigh.ids,
    },
    key: [
      ...classes.map((c) => ({
        hex: c.key?.hex ?? GREY.hex,
        label: labelOf.get(c.value) ?? c.value,
        petals: c.petals,
      })),
      ...(bare > 0 ? [{ hex: GREY.hex, label: 'no backers recorded', petals: bare }] : []),
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
