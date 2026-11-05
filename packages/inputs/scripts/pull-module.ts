// Read a stored module's snapshot from its public sources and write it to fixtures/snapshots/.
//   node packages/inputs/scripts/pull-module.ts moloch-v1              live, keyless
//   node packages/inputs/scripts/pull-module.ts moloch-v1 --replay     offline, from the recording
//   node packages/inputs/scripts/pull-module.ts solana-spl-trump       live: one call of ~553 MB
//   ... solana-spl-trump --from-dump <answer.json> <supply.json>       reuse a stored answer
//   ... solana-spl-test --mint <address>                               any mint, small ones only
// A live run also writes the small recording the tests replay, when the module has one.
import { createReadStream, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { evmReader } from '../src/evm/reader.ts';
import {
  BEANSTALK_ATTACK,
  BEANSTALK_BEFORE,
  type BeanstalkList,
  pullBeanstalk,
  readBeanstalkList,
} from '../src/modules/beanstalk.ts';
import { ENS_TOKEN, pullErc20Votes } from '../src/modules/erc20-votes.ts';
import { pullMolochV1 } from '../src/modules/moloch-v1.ts';
import {
  MELANIA,
  pullSplHolders,
  type SplToken,
  TRUMP,
} from '../src/modules/solana-spl-holders.ts';
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

if (network === 'moloch-v1') {
  const rec = recorded('moloch-v1');
  const reader = evmReader({ fetch: rec.fetch });
  const { snapshot, checks } = await pullMolochV1({ reader, onProgress: log });
  rec.save('Moloch v1, read keyless by pullMolochV1. Public chain data.');
  console.log(checks);
  console.log(storeFixture(snapshot), JSON.stringify(reader.stats()));
} else if (network === 'beanstalk') {
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
} else if (network === 'ens-delegates') {
  // The logs (hundreds of MB) stay out of the recording: it keeps the block and the state reads.
  const rec = recorded('ens-delegates', (q) => q.method === 'eth_getLogs');
  const reader = evmReader({ fetch: rec.fetch });
  const started = Date.now();
  const { snapshot, checks } = await pullErc20Votes(ENS_TOKEN, { reader, onProgress: log });
  rec.save('ENS delegates: the block and the state reads of pullErc20Votes. Public chain data.');
  console.log(checks, `${((Date.now() - started) / 1000).toFixed(0)} s`);
  console.log(`peak memory ${(process.resourceUsage().maxRSS / 1024).toFixed(0)} MB`);
  console.log(storeFixture(snapshot), JSON.stringify(reader.stats()));
} else if (network?.startsWith('solana-spl-')) {
  const argAfter = (flag: string, n = 1) => {
    const i = process.argv.indexOf(flag);
    return i < 0 ? undefined : process.argv[i + n];
  };
  const tokens: Record<string, SplToken> = {
    'solana-spl-trump': TRUMP,
    'solana-spl-melania': MELANIA,
  };
  const mint = argAfter('--mint');
  const token: SplToken | undefined = mint
    ? { id: network, symbol: 'TEST', mint, title: 'Test token holders', population: 'test-holders' }
    : tokens[network];
  if (!token) throw new Error(`no token for ${network}`);
  const answer = argAfter('--from-dump');
  const rec = recorded(network);
  const supplyPath = argAfter('--from-dump', 2);
  const supply = supplyPath
    ? (JSON.parse(readFileSync(supplyPath, 'utf8')) as {
        result: { context: { slot: number }; value: { amount: string; decimals: number } };
      })
    : undefined;
  const { snapshot, checks } = await pullSplHolders(token, {
    fetch: rec.fetch,
    onProgress: log,
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
  rec.save(
    `${token.symbol} holders: supply, block time and owner programs, read keyless. Public chain data.`,
    supply ? { supply_before: supply } : {},
  );
  console.log(checks);
  console.log(`peak memory ${(process.resourceUsage().maxRSS / 1024).toFixed(0)} MB`);
  if (!mint) console.log(storeFixture(snapshot));
} else {
  console.error('usage: pull-module.ts <network> [--replay]');
  process.exit(2);
}
