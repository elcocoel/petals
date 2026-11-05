// Read a stored module's snapshot from its public sources and write it to fixtures/snapshots/.
//   node packages/inputs/scripts/pull-module.ts moloch-v1              live, keyless
//   node packages/inputs/scripts/pull-module.ts moloch-v1 --replay     offline, from the recording
// A live run also writes the small recording the tests replay, when the module has one.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { evmReader } from '../src/evm/reader.ts';
import { pullMolochV1 } from '../src/modules/moloch-v1.ts';
import {
  RECORDING_FORMAT,
  type Recording,
  recordingFetch,
  replayFetch,
} from '../src/rpc/recording.ts';
import { storeFixture } from './fixture-store.ts';

const network = process.argv[2];
const replay = process.argv.includes('--replay');
const testFixtures = join(import.meta.dirname, '..', 'test', 'fixtures');
const log = (e: { message: string }) => console.log(`  ${e.message}`);

function recorded(name: string) {
  const path = join(testFixtures, name, 'recording.json.gz');
  if (replay) {
    const rec = JSON.parse(gunzipSync(readFileSync(path)).toString('utf8')) as Recording;
    return { fetch: replayFetch(rec).fetch, save: () => {} };
  }
  const r = recordingFetch();
  return {
    fetch: r.fetch,
    save: (note: string) => {
      mkdirSync(join(testFixtures, name), { recursive: true });
      const rec: Recording = {
        petal: RECORDING_FORMAT,
        note,
        recorded_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
        calls: r.calls,
      };
      writeFileSync(path, gzipSync(JSON.stringify(rec), { level: 9 }));
    },
  };
}

if (network === 'moloch-v1') {
  const rec = recorded('moloch-v1');
  const reader = evmReader({ fetch: rec.fetch });
  const { snapshot, checks } = await pullMolochV1({ reader, onProgress: log });
  rec.save('Moloch v1, read keyless by pullMolochV1. Public chain data.');
  console.log(checks);
  console.log(storeFixture(snapshot), JSON.stringify(reader.stats()));
} else {
  console.error('usage: pull-module.ts <network> [--replay]');
  process.exit(2);
}
