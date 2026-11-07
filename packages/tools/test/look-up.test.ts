// T390, T391: look_up, with no network. Any word gets an answer that says how each thing is known,
// and a guess never fails. The dead ends of the stress test (design/stress-report.md) are the cases.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EVM_CHAINS } from '@petal/inputs';
import { describe, expect, test } from 'vitest';
import { createContext } from '../src/context.ts';
import { compile, describeErrors } from '../src/define.ts';
import { callTool } from '../src/registry.ts';
import { makeLookUp } from '../src/tools/look-up.ts';
import { REPO } from './helpers.ts';

// biome-ignore lint/suspicious/noExplicitAny: walking tool outputs
type Json = Record<string, any>;

const ctx = createContext({
  root: REPO,
  fake: true,
  stateDir: mkdtempSync(join(tmpdir(), 'petal-lookup-')),
});
const look = async (query: string, fetch?: typeof globalThis.fetch) =>
  (await (fetch ? makeLookUp({ fetch }) : makeLookUp()).run({ query }, ctx)) as Json;
const fits = compile(makeLookUp().output);

const VALIDATORS = '72a6d9676d967d63712dc82bcbb90282d2f61e5ca6495c3e2e54a4f9af77e9ec';
const FLOWER = '3394fb875bf97c1af8191566';

/** Every EVM chain: no code at the address, a balance and five transactions. Records what's asked. */
function plainAccount(down: string[] = []) {
  const asked: string[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = String(input);
    asked.push(url);
    if (down.some((d) => EVM_CHAINS[d]?.endpoints.some((e) => e.url === url)))
      throw new Error('fetch failed');
    const { method } = JSON.parse(String(init?.body ?? '{}')) as { method?: string };
    const result =
      method === 'eth_getCode'
        ? '0x'
        : method === 'eth_getBalance'
          ? '0xde0b6b3a7640000'
          : method === 'eth_getTransactionCount'
            ? '0x5'
            : null;
    if (result === null) return new Response('{}', { status: 400 });
    return new Response(JSON.stringify({ result }));
  };
  return { fetch, asked };
}

describe('look_up', () => {
  test('an account in a stored read: its share and rank there, who backs it, and the flower with its link', async () => {
    // "who is astro-stakers.poolv1.near": "couldn't confirm", though it's the largest pool stored
    const o = await look('astro-stakers.poolv1.near');
    expect(fits(o), describeErrors(fits.errors)).toBe(true);
    expect(o.accounts[0]).toMatchObject({
      account: 'astro-stakers.poolv1.near',
      role: 'holder',
      network: 'near-validators',
      sha256: VALIDATORS,
      as_of: '2026-11-03T19:42:00Z',
      known: 'stored',
      measure: 'validator_stake_current_epoch',
      rank: 1,
      of: 371,
    });
    expect(o.accounts[0].share).toBeCloseTo(0.056071, 6);
    // what it calls itself, and that it only says so: never more than the read does
    expect(o.accounts[0].identity).toEqual({ name: 'astrostakers.com', status: 'self-declared' });
    expect(o.accounts).toContainEqual(
      expect.objectContaining({ role: 'backed', accounts: 32355, known: 'stored' }),
    );
    expect(o.stored).toEqual([expect.objectContaining({ sha256: VALIDATORS, known: 'stored' })]);
    expect(o.flowers).toEqual([
      expect.objectContaining({ id: FLOWER, view_url: `/f/${FLOWER}`, known: 'stored' }),
    ]);
    // a NEAR account is answered by what Petal holds: no market list is asked about it
    expect(o.searched.map((s: Json) => s.id)).toEqual(['flowers', 'stored', 'accounts']);
    expect(o.says).toMatch(
      /^Found 1 flower, each with its view_url: a working link, to give exactly as it is/,
    );
  });

  test('a name finds the flower and the read, with their link and date, however it is written', async () => {
    for (const q of ['NEAR validators', "NEAR's validators", 'near-validators', 'validators']) {
      const o = await look(q);
      expect(fits(o), describeErrors(fits.errors)).toBe(true);
      expect(
        o.flowers.map((f: Json) => f.view_url),
        q,
      ).toEqual([`/f/${FLOWER}`]);
      expect(
        o.stored.map((s: Json) => s.as_of),
        q,
      ).toEqual(['2026-11-03T19:42:00Z']);
    }
    // "near" is a word in its id, not the start of another word
    expect((await look('linear')).flowers).toEqual([]);
  });

  test('a guess never fails: an empty answer says what was searched and that it is not proof', async () => {
    const o = await look('zzqx-not-a-thing');
    expect(o.error).toBeUndefined();
    expect(fits(o), describeErrors(fits.errors)).toBe(true);
    for (const k of ['flowers', 'stored', 'accounts', 'chain', 'listed']) expect(o[k]).toEqual([]);
    expect(o.says).toMatch(/Nothing Petal holds or lists answers to "zzqx-not-a-thing"/);
    expect(o.says).toMatch(/isn't the same as not existing/);
    // in fake mode the lists are skipped, and said so, not reported as empty
    expect(o.searched).toContainEqual(
      expect.objectContaining({ id: 'list:geckoterminal', status: 'skipped' }),
    );
  });

  test('a flower id or a snapshot hash is a word too', async () => {
    expect((await look(FLOWER)).flowers.map((f: Json) => f.id)).toEqual([FLOWER]);
    const bySha = await look(VALIDATORS);
    expect(bySha.stored.map((s: Json) => s.sha256)).toEqual([VALIDATORS]);
    expect(bySha.flowers.map((f: Json) => f.id)).toEqual([FLOWER]);
  });

  test('an address with no code is an account: which chains see it, and no market list is asked', async () => {
    // the pasted wallet: "0 candidates", then "is it a token on a chain I didn't check?"
    const node = plainAccount();
    const o = await look('0xab5801a7d398351b8be11c439e05c5b3259aec9b', node.fetch);
    expect(fits(o), describeErrors(fits.errors)).toBe(true);
    expect(o.chain.map((c: Json) => c.chain).sort()).toEqual(Object.keys(EVM_CHAINS).sort());
    for (const c of o.chain)
      expect(c).toMatchObject({
        kind: 'account',
        known: 'verified',
        native_balance: '1',
        transactions_sent: 5,
      });
    expect(o.listed).toEqual([]);
    expect(o.says).toMatch(/an account with no code on/);
    // only our own chain endpoints were asked: no market or DAO list for a plain account
    const ours = new Set(Object.values(EVM_CHAINS).flatMap((c) => c.endpoints.map((e) => e.url)));
    expect(node.asked.every((u) => ours.has(u))).toBe(true);
  });

  test('a chain that is down says so, and that it says nothing about the address', async () => {
    const node = plainAccount(['base']);
    const o = await look('0xab5801a7d398351b8be11c439e05c5b3259aec9b', node.fetch);
    expect(o.chain.map((c: Json) => c.chain)).not.toContain('base');
    expect(o.searched).toContainEqual(
      expect.objectContaining({ id: 'chain:base', status: 'down' }),
    );
    expect(o.says).toMatch(/Did not answer: chain:base, which says nothing about/);
  });

  test('an address in a stored read is found there, whatever its case', async () => {
    const o = await look('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', plainAccount().fetch);
    expect(o.accounts[0]).toMatchObject({
      role: 'holder',
      in: 'ENS delegates',
      network: 'erc20-votes',
      known: 'stored',
    });
    expect(o.stored[0]).toMatchObject({ title: 'ENS delegates', known: 'stored' });
  });

  test('every door has it: the registry runs it, and a bad input is still bad_input', async () => {
    const o = (await callTool('look_up', { query: 'validators' }, ctx)) as Json;
    expect(o.tools_version).toBe('tools/v1');
    expect(((await callTool('look_up', {}, ctx)) as Json).error.code).toBe('bad_input');
  });
});

describe('figures leave out what a read did not read (T394)', () => {
  // SEAM on Base, a 7-day window: 89.7% of the supply is one "supply not read" row. Sonnet called
  // such a row the top holder (74.9% of UNI on Base), and Haiku said "top 5 hold 97%".
  const WINDOW = 'b82956b9f3d18e32ebcbd6fe1138e8a2a967402f958071d485a3a94dbbfd8fdb';
  const FULL = 'ebacaf5cc54a9493784c9678748efdae92a7390533a48cdce8564e56a8a357ef';
  const run = async (name: string, input: Json) => (await callTool(name, input, ctx)) as Json;

  test('it is no holder: out of shares, top-k and Nakamoto, and how much was read is said plainly', async () => {
    const f = await run('compute_figures', { sha256: WINDOW, measure: 'token_balance' });
    expect(f.error).toBeUndefined();
    expect(f.shares.map((s: Json) => s.id)).not.toContain('group:not-read');
    expect(f.shares[0]).toMatchObject({
      id: '0x4b5c71082d027d16d2a146465d66f9eec11634f6',
      rank: 1,
    });
    expect(f.top_k_share['1']).toBeCloseTo(0.622046, 6);
    expect(f.total).toBe('10293908.6720867291539326');
    expect(f.participants_included).toBe(157);
    expect(f.not_read).toMatchObject({
      amount: '89706091.3279132708460674',
      whole: '100000000',
      share_of_whole: 0.897061,
    });
    expect(f.not_read.says).toMatch(/are of what was read: 10\.29% of the whole 100000000 SEAM/);
    expect(f.not_read.says).toMatch(/The other 89\.71% was not read\. It is no holder/);
    expect(f.figure_ids).toContain('fig:not_read');
    const d = await run('describe_snapshot', { sha256: WINDOW });
    expect(d.top.map((t: Json) => t.id)).not.toContain('group:not-read');
    expect(d.not_read.share_of_whole).toBe(0.897061);
  });

  test('a read that holds its whole supply is counted as before', async () => {
    const f = await run('compute_figures', { sha256: FULL, measure: 'token_balance' });
    expect(f.not_read).toBeUndefined();
    expect(f.figure_ids).not.toContain('fig:not_read');
    expect(f.total).toBe('1000000000');
  });
});
