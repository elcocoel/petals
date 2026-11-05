// Read any target of a module offline, and keep it as a fixture if asked.
//   node packages/inputs/scripts/pull-module.ts <module> --params '<json>' [--full] [--store]
// --full   lifts the guards: a whole history for erc20-holders, a scan over 200 MB for
//          solana-spl-holders. Long, and offline only: a chat cannot ask for it.
// --store  writes the result to fixtures/snapshots/, keyed by its parameters.
// ENVIO_API_TOKEN from the environment routes Base through HyperSync. It is never printed.
//   ... solana-spl-holders --params '{"mint":"..."}' --from-dump <answer.json> <supply.json>
//   ... solana-spl-holders --params '{"mint":"..."}' --record <name>   keep a test recording
// The two fixtures the tests replay:
//   ... moloch-fixture [--replay]    moloch-v1 at the block before proposal 143
//   ... beanstalk [--replay]         the one-off Beanstalk data set
import { createReadStream, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { validateSnapshot } from '@petal/core';
import type { Snapshot } from '@petal/core/types';
import { evmReader } from '../src/evm/reader.ts';
import {
  BEANSTALK_ATTACK,
  BEANSTALK_BEFORE,
  type BeanstalkList,
  pullBeanstalk,
  readBeanstalkList,
} from '../src/modules/beanstalk.ts';
import { holdersTarget, pullErc20Holders } from '../src/modules/erc20-holders.ts';
import { pullErc20Votes, votesTarget } from '../src/modules/erc20-votes.ts';
import { molochTarget, pullMolochV1 } from '../src/modules/moloch-v1.ts';
import { pullSplHolders, splMint } from '../src/modules/solana-spl-holders.ts';
import {
  RECORDING_FORMAT,
  type Recording,
  recordingFetch,
  replayFetch,
} from '../src/rpc/recording.ts';
import { MOLOCH } from '../test/helpers/targets.ts';
import { storeFixture } from './fixture-store.ts';

const module = process.argv[2];
const has = (flag: string) => process.argv.includes(flag);
const argAfter = (flag: string, n = 1) => {
  const i = process.argv.indexOf(flag);
  return i < 0 ? undefined : process.argv[i + n];
};
const replay = has('--replay');
const params = JSON.parse(argAfter('--params') ?? '{}') as Record<string, string>;
const testFixtures = join(import.meta.dirname, '..', 'test', 'fixtures');
const log = (e: { message: string }) => console.log(`  ${e.message}`);

function recorded(name: string, skip?: Parameters<typeof recordingFetch>[1]) {
  const path = join(testFixtures, name, 'recording.json.gz');
  if (replay) {
    const rec = JSON.parse(gunzipSync(readFileSync(path)).toString('utf8')) as Recording;
    return { fetch: replayFetch(rec).fetch, save: () => {}, rec };
  }
  const r = recordingFetch(globalThis.fetch, skip);
  return {
    fetch: r.fetch,
    rec: undefined,
    save: (note: string, extra: Record<string, unknown> = {}) => {
      mkdirSync(join(testFixtures, name), { recursive: true });
      const rec: Recording = {
        petal: RECORDING_FORMAT,
        note,
        recorded_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
        calls: r.calls,
        ...extra,
      };
      writeFileSync(path, gzipSync(JSON.stringify(rec), { level: 9 }));
    },
  };
}

function finish(snapshot: Snapshot, checks: unknown) {
  console.log(checks);
  const check = validateSnapshot(snapshot);
  console.log(
    `schema-valid: ${check.ok}; peak memory ${(process.resourceUsage().maxRSS / 1024).toFixed(0)} MB`,
  );
  if (has('--store')) console.log(storeFixture(snapshot));
}

if (module === 'moloch-fixture') {
  const rec = recorded('moloch-v1');
  const reader = evmReader({ fetch: rec.fetch });
  const { snapshot, checks } = await pullMolochV1({
    reader,
    dao: MOLOCH.params.dao,
    block: MOLOCH.block,
    fromBlock: MOLOCH.fromBlock,
    note: MOLOCH.note,
    onProgress: log,
  });
  rec.save('Moloch v1, read keyless by pullMolochV1. Public chain data.');
  console.log(checks, storeFixture(snapshot), JSON.stringify(reader.stats()));
} else if (module === 'beanstalk') {
  // The deposit logs (tens of thousands) stay out of the recording: it keeps the address list.
  const rec = recorded('beanstalk', (q) => {
    const filter = (q.params as { topics?: unknown[] }[])[0];
    return q.method === 'eth_getLogs' && Array.isArray(filter?.topics?.[0]);
  });
  const reader = evmReader({ fetch: rec.fetch });
  const list = rec.rec ? (rec.rec.list as BeanstalkList) : await readBeanstalkList(reader, log);
  for (const block of [BEANSTALK_BEFORE, BEANSTALK_ATTACK]) {
    const { snapshot, checks } = await pullBeanstalk({ reader, block, list, onProgress: log });
    console.log(checks);
    console.log(storeFixture(snapshot));
  }
  rec.save('Beanstalk at two blocks, read keyless by pullBeanstalk. Public chain data.', { list });
  console.log(JSON.stringify(reader.stats()));
} else if (module === 'moloch-v1') {
  const { chain, dao } = molochTarget(params);
  const reader = evmReader({ chain });
  const { snapshot, checks } = await pullMolochV1({ reader, dao, chain, onProgress: log });
  finish(snapshot, checks);
} else if (module === 'erc20-votes') {
  const target = votesTarget(params);
  const reader = evmReader({ chain: target.chain, maxLogCalls: 2000 });
  const { snapshot, checks } = await pullErc20Votes(target, { reader, onProgress: log });
  finish(snapshot, checks);
} else if (module === 'erc20-holders') {
  const token = process.env.ENVIO_API_TOKEN;
  const { snapshot, checks } = await pullErc20Holders(holdersTarget(params), {
    onProgress: log,
    ...(has('--full') ? { full: true, maxLogCalls: 2000 } : {}),
    ...(params.window_days && params.window_days !== 'full'
      ? { windowDays: Number(params.window_days) }
      : {}),
    ...(token ? { hypersyncToken: token } : {}),
  });
  finish(snapshot, checks);
} else if (module === 'solana-spl-holders') {
  const mint = splMint(params);
  const name = argAfter('--record');
  const rec = name ? recorded(name) : undefined;
  const answer = argAfter('--from-dump');
  const supplyPath = argAfter('--from-dump', 2);
  const supply = supplyPath
    ? (JSON.parse(readFileSync(supplyPath, 'utf8')) as {
        result: { context: { slot: number }; value: { amount: string; decimals: number } };
      })
    : undefined;
  const { snapshot, checks } = await pullSplHolders(mint, {
    onProgress: log,
    ...(rec ? { fetch: rec.fetch } : {}),
    ...(has('--full') ? { maxBytes: Number.POSITIVE_INFINITY } : {}),
    ...(answer && supply
      ? {
          stored: {
            body: createReadStream(answer),
            url: 'https://public.rpc.solanavibestation.com/',
            imported_from: `hero-spike/data/${answer.split('/').pop()}`,
            supply_before: {
              slot: supply.result.context.slot,
              amount: BigInt(supply.result.value.amount),
              decimals: supply.result.value.decimals,
            },
          },
        }
      : {}),
  });
  rec?.save(`Holders of ${mint}, read keyless. Public chain data.`);
  finish(snapshot, checks);
} else {
  console.error("usage: pull-module.ts <module> --params '<json>' [--full] [--store]");
  process.exit(2);
}
