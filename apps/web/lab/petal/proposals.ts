// Server only. The two choices #76 left open, drawn as proposals on real flowers for Elco to react to
// (design/flower-art-direction/default-system-vnext.md: "Cross-flower height reference and the grouped-remainder
// representation remain separate open decisions. Neither should be silently chosen by treating an aggregate as
// one ordinary wallet."). Lab only. Whichever Elco picks moves into core's reading and look; nothing here is
// drawn anywhere else.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import type { ReadingPetal, Snapshot, Spec, ViewV2 } from '@petal/core/types';
import { GREY, keyFor, keysOf } from '@petal/core/wedge/keys';
import { repoRoot } from '../../lib/config.ts';
import {
  ART_VIEW,
  coverage,
  day,
  highlighted,
  type KeyLine,
  type LookFlower,
  loadCore,
  pct,
  snapshotAt,
  whole,
} from './bench.ts';
import { LAB_DIR, RAIDGUILD } from './raidguild.ts';

export interface Proposal {
  /** the choice, in a few words */
  title: string;
  /** what it shows, one line each */
  words: string[];
  flower: LookFlower;
}

/** The art direction's view with segments off: these proposals are about height, not parts. */
const PLAIN_VIEW: ViewV2 = {
  ...ART_VIEW,
  dimensions: { ...ART_VIEW.dimensions, segments: null },
};

type Core = Awaited<ReturnType<typeof loadCore>>;

/** A flower keyed by the kind of account, common to rare, as step 1 keys them. */
function keyed(
  title: string,
  petals: readonly ReadingPetal[],
  highlight: readonly string[],
  facts: string[],
  highlightWords: string,
): LookFlower {
  const real = petals.filter((p) => !p.tail);
  const kinds = keysOf(
    real.map((p) => p.colour),
    real.map((p) => p.share),
  );
  const key: KeyLine[] = kinds.map((k) => ({
    hex: k.key?.hex ?? GREY.hex,
    label: k.value === 'unknown' ? 'address of unknown kind' : k.value.replaceAll('_', ' '),
    petals: k.petals,
  }));
  return {
    reading: { title, petals: [...petals] },
    look: {
      fills: Object.fromEntries(
        petals.map((p) => [p.id, p.tail ? GREY.hex : (keyFor(kinds, p.colour)?.hex ?? GREY.hex)]),
      ),
      bands: {},
      highlight: [...highlight],
    },
    key,
    facts,
    highlight: highlightWords,
  };
}

function raidguild(root: string, core: Core) {
  const s = snapshotAt(root, RAIDGUILD.sha256, LAB_DIR);
  const spec = JSON.parse(
    readFileSync(join(root, LAB_DIR, `${RAIDGUILD.sha256}.spec.json`), 'utf8'),
  ) as Spec;
  return { s, spec, read: (sp: Spec) => core.readFlower(sp, s, PLAIN_VIEW, [], { floor: 0 }) };
}

/**
 * How "everyone else" shows: three ways on RaidGuild's delegates, with the accepted highlight on the nine at 2% or
 * more. Left out and said in words (step 1, as Figma drew it); every delegate its own petal; one grey petal.
 */
export async function tailProposals(): Promise<Proposal[]> {
  const root = repoRoot();
  const core = await loadCore();
  const rg = raidguild(root, core);
  const all = rg.read(rg.spec).petals;
  const top = all.filter((p) => !p.tail);
  const tail = all.find((p) => p.tail);
  const high = highlighted(top, 'delegates');
  const unit = rg.s.coverage.unit ?? '';
  const title = rg.s.network.title;
  const count = tail?.count ?? 0;
  const folded = Number(tail?.amount ?? 0);

  // every delegate: a selection as large as the population has no tail
  const everyone = rg.read({
    ...rg.spec,
    selection: { ...rg.spec.selection, petals: top.length + count },
  }).petals;
  const average = count ? folded / count : 0;

  return [
    {
      title: 'Left out, said in words',
      words: [
        `${top.length} petals. The other ${count} delegates aren't drawn; the words say they hold ${whole(folded)} ${unit} (${pct(tail?.share ?? 0)}).`,
        'As in the accepted Figma flower and step 1.',
      ],
      flower: keyed(title, top, high.ids, coverage(rg.s, all, top, 'delegates'), high.words),
    },
    {
      title: 'Every delegate its own petal',
      words: [
        `All ${everyone.length}, each the same width, as tall as their votes. No group stands for anyone.`,
        `The ${count} smallest hold ${pct(tail?.share ?? 0)} between them; most are thinner than the line between petals.`,
      ],
      flower: keyed(
        title,
        everyone,
        high.ids,
        [`All ${everyone.length} delegates drawn.`],
        high.words,
      ),
    },
    {
      title: 'One grey petal for everyone else',
      words: [
        `${top.length} petals and one more: the ${count} others as one petal, as wide as any, grey for context.`,
        `It's as tall as its average member, ${whole(average)} ${unit}, never as their ${whole(folded)} ${unit} together.`,
      ],
      flower: keyed(title, all, high.ids, coverage(rg.s, all, top, 'delegates'), high.words),
    },
  ];
}

export interface HeightProposal {
  /** the scale, in a few words */
  title: string;
  words: string[];
  flowers: { flower: LookFlower; largest: number }[];
}

/**
 * A height reference across flowers: three real flowers, each on its own scale (today: its largest petal is full
 * height), and on one scale (full height is the largest share among them), so a share is as tall in every flower.
 */
export async function heightProposals(): Promise<HeightProposal[]> {
  const root = repoRoot();
  const core = await loadCore();
  const rg = raidguild(root, core);
  const golden = (name: string) =>
    JSON.parse(readFileSync(join(root, 'fixtures/golden', `${name}.json`), 'utf8')) as {
      spec: Spec;
    };
  const near = golden('near-validators-default').spec;
  const hos = golden('house-of-stake-default').spec;
  const hosSnapshot = JSON.parse(
    gunzipSync(
      readFileSync(join(root, 'fixtures/golden/inputs/house-of-stake-2026-11-04.json.gz')),
    ).toString('utf8'),
  ) as Snapshot;
  const flowers = [
    { s: rg.s, spec: rg.spec },
    { s: snapshotAt(root, near.snapshot.sha256), spec: near },
    { s: hosSnapshot, spec: hos },
  ].map(({ s, spec }) => {
    const top = core
      .readFlower(spec, s, PLAIN_VIEW, [], { floor: 0 })
      .petals.filter((p) => !p.tail);
    return { s, top, largest: Math.max(...top.map((p) => p.share)) };
  });
  const most = Math.max(...flowers.map((f) => f.largest));
  const tallest = flowers.find((f) => f.largest === most);
  const said = (f: (typeof flowers)[0]) =>
    `${f.s.network.title}, ${day(f.s.snapshot.as_of)}: largest ${pct(f.largest)}.`;

  const own = flowers.map((f) => ({
    largest: f.largest,
    flower: keyed(f.s.network.title, f.top, [], [said(f)], ''),
  }));
  // the same shares against the largest of the three: heights are share / most, not share / its own largest
  const shared = flowers.map((f) => ({
    largest: f.largest,
    flower: keyed(
      f.s.network.title,
      f.top.map((p) => ({ ...p, height: p.share / most })),
      [],
      [said(f)],
      '',
    ),
  }));
  return [
    {
      title: 'Each its own scale (today)',
      words: [
        `Every flower's largest petal is full height: ${flowers.map((f) => pct(f.largest)).join(', ')} all reach the top.`,
      ],
      flowers: own,
    },
    {
      title: 'One scale across flowers',
      words: [
        `Full height is the largest share among them, ${pct(most)} in ${tallest?.s.network.title ?? ''}; a share is as tall in every flower.`,
      ],
      flowers: shared,
    },
  ];
}
