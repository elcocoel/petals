// The golden flowers (T031; renderer.md, Golden tests): name, snapshot, choices. Shared by
// golden.test.ts, the fresh-process check (golden-child.ts) and scripts/render-fixture.ts.
import { buildSpec } from '../src/convention/index.ts';
import { renderFlower } from '../src/render/index.ts';
import { snapshotSha256 } from '../src/tables.ts';
import type { ProposeChoices, RenderResult, Snapshot, Spec } from '../src/types/index.ts';
import { descriptorFor } from './descriptors.ts';
import { houseOfStake, validators } from './load.ts';

export interface GoldenCase {
  name: string;
  snapshot: () => Snapshot;
  measure: string;
  choices: ProposeChoices;
}

export const GOLDEN_CASES: GoldenCase[] = [
  {
    name: 'near-validators-default',
    snapshot: validators,
    measure: 'validator_stake_current_epoch',
    choices: {},
  },
  {
    name: 'near-validators-backers',
    snapshot: validators,
    measure: 'validator_stake_current_epoch',
    choices: { segments: 'backers' },
  },
  {
    name: 'house-of-stake-default',
    snapshot: houseOfStake,
    measure: 'voting_power',
    choices: {},
  },
];

export function goldenSpec(c: GoldenCase): Spec {
  const s = c.snapshot();
  const descriptor = descriptorFor(s, { measure: c.measure });
  return buildSpec(
    { network: descriptor.id, sha256: snapshotSha256(s), choices: c.choices },
    descriptor,
    s,
  ).spec;
}

export function renderGolden(c: GoldenCase): { spec: Spec; result: RenderResult } {
  const spec = goldenSpec(c);
  return { spec, result: renderFlower(spec, c.snapshot()) };
}
