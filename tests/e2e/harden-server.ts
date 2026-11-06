// The server harden.test.ts attacks: the real petalApp under Node on a free port, in its own process,
// in fake mode, so no public source, key or model is touched. One live module takes as long as
// HARDEN_READ_MS, so fresh reads can be held open. Limits are the defaults unless the test sets one.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { serveApi } from '@petal/agent/serve';
import type { Snapshot } from '@petal/core/types';
import { modules, NEAR_VALIDATORS_DESCRIPTOR } from '@petal/inputs';

const REPO = resolve(import.meta.dirname, '..', '..');
const READ_MS = Number(process.env.HARDEN_READ_MS ?? 700);

const fixture = JSON.parse(
  readFileSync(join(REPO, 'fixtures/snapshots/test/two-participants.json'), 'utf8'),
) as Snapshot;
const network = { ...fixture.network, id: 'slow-live', population: 'slow-live' };
let block = 400_000_000;

modules['slow-live'] = {
  descriptor: {
    ...NEAR_VALIDATORS_DESCRIPTOR,
    id: network.id,
    chain: network.chain,
    population: network.population,
    live: true,
    cost: { calls: 1, seconds: 1, note: 'a test module' },
  },
  async resolveAt() {
    return { block_height: block++, as_of: fixture.snapshot.as_of };
  },
  async fetch(at) {
    await new Promise((r) => setTimeout(r, READ_MS));
    return {
      ...fixture,
      network,
      snapshot: { ...fixture.snapshot, block_height: at.block_height },
    };
  },
};

serveApi({
  port: 0,
  cfg: {
    root: REPO,
    fake: true,
    stateDir: process.env.PETAL_STATE_DIR as string,
    apiBase: 'https://petals.example',
  },
});
