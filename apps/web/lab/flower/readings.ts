// Server only. The bench's flowers: the locked golden readings, a few more read from saved snapshots
// through readFlower, and the synthetic sizes. Only what a drawing needs goes to the browser.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import type { SeamPiece } from '@petal/core';
import type { Reading, ReadingPetal, Snapshot, Spec, ToolError } from '@petal/core/types';
import type { HoverWay } from '../../flower/hover.ts';
import type { FlowerReading } from '../../flower/model.ts';
import { configFromEnv, repoRoot } from '../../lib/config.ts';
import { fakeRelations } from './illustrative.ts';
import { sampleClaims } from './sample-names.ts';
import { syntheticReading } from './synthetic.ts';

/** Golden readings, as locked. */
const GOLDEN = ['near-validators-backers', 'near-validators-default', 'house-of-stake-default'];

/** More shapes from fixtures/snapshots: real names, or one petal towering over the rest. */
const SNAPSHOTS: Record<string, { network: string; sha256: string }> = {
  'moloch-v1': {
    network: 'moloch-v1',
    sha256: 'c46437a2afb76cc7c3b07195da499a80a93bd3f09f2ce342436a366c68009a9c',
  },
  'beanstalk-attack': {
    network: 'beanstalk',
    sha256: 'bddcf0ddf8ad1d31bb5e39892aa175de0df8f4793c689fa9773f07f33f1a2441',
  },
};

const SYNTHETIC = /^synthetic-(\d{2,3})$/;

export const DEFAULT_FLOWER = 'near-validators-backers';

const slim = (r: Pick<Reading, 'title' | 'petals'>): FlowerReading => ({
  title: r.title,
  petals: r.petals,
});

/** A bench flower, and the pieces of data beyond its snapshot's that it was read with. */
interface Bench {
  reading: FlowerReading;
  pieces: readonly SeamPiece[];
}

/**
 * The named flower, or null if there's no such flower on the bench. With sample names, a flower read from a
 * snapshot is read through the default view with labels on a person's names, and its largest accounts carry
 * made-up annotations (sample-names.ts).
 */
export async function readingOf(name: string, names = false): Promise<FlowerReading | null> {
  return (await benchOf(name, names))?.reading ?? null;
}

async function benchOf(name: string, names: boolean): Promise<Bench | null> {
  const size = SYNTHETIC.exec(name)?.[1];
  if (size) return { reading: syntheticReading(Number(size)), pieces: [] };
  const root = repoRoot();
  if (GOLDEN.includes(name)) {
    const doc = JSON.parse(
      readFileSync(join(root, 'fixtures/golden', `${name}.reading.json`), 'utf8'),
    );
    return { reading: slim(doc.reading as Reading), pieces: [] };
  }
  const saved = SNAPSHOTS[name];
  if (!saved) return null;
  // Loaded by Node itself, like every other use of these packages in the site (see lib/config.ts).
  const tools = (await import(
    /* turbopackIgnore: true */ /* webpackIgnore: true */ '@petal/tools'
  )) as typeof import('@petal/tools');
  const core = (await import(
    /* turbopackIgnore: true */ /* webpackIgnore: true */ '@petal/core'
  )) as typeof import('@petal/core');
  const context = tools.createContext(await configFromEnv(root));
  const proposed = (await tools.callTool('propose_spec', saved, context)) as
    | { spec: Spec }
    | ToolError;
  if ('error' in proposed) throw new Error(`lab: ${proposed.error.message}`);
  const snapshot = JSON.parse(
    gunzipSync(readFileSync(join(root, 'fixtures/snapshots', `${saved.sha256}.json.gz`))).toString(
      'utf8',
    ),
  ) as Snapshot;
  const plain = core.readFlower(proposed.spec, snapshot);
  if (!names) return { reading: slim(plain), pieces: [] };
  const largest = plain.petals.filter((p) => !p.tail).map((p) => p.id);
  const pieces = core.namePieces(
    snapshot,
    sampleClaims(snapshot.network.chain, largest, core.makeClaim),
  );
  const view = core.latestView(core.DEFAULT_VIEW);
  const named = { ...view, dimensions: { ...view.dimensions, labels: { data: 'name' } } };
  return { reading: slim(core.readFlower(proposed.spec, snapshot, named, pieces)), pieces };
}

/** What the address chose for a bench, or null if there's no such flower. */
export async function benchChoice(q: Record<string, string | string[] | undefined>) {
  const name = typeof q.flower === 'string' ? q.flower : DEFAULT_FLOWER;
  const names = q.names === 'sample';
  const bench = await benchOf(name, names);
  if (!bench) return null;
  const { reading } = bench;
  const hover: HoverWay = q.hover === 'lift' ? 'lift' : 'dock';
  return {
    name,
    reading,
    hover,
    relations: q.relations === '1' ? fakeRelations(reading.petals.length) : null,
    scatter: q.order === 'scatter',
    probe: q.probe === '1',
    names,
  };
}
