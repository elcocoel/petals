// T164, T165: find_target on real answers recorded once (record-find.ts), with no model and no
// network. Every request ends in a yes or no before drawing, one clear question, or a refusal that
// says what works.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, test } from 'vitest';
import { createContext } from '../src/context.ts';
import { compile, describeErrors } from '../src/define.ts';
import { callTool } from '../src/registry.ts';
import { makeFindTarget, parseQuery } from '../src/tools/find.ts';
import { FIND_SET } from './find-set.ts';
import { REPO } from './helpers.ts';

// biome-ignore lint/suspicious/noExplicitAny: walking tool outputs
type Json = Record<string, any>;

const recorded = JSON.parse(
  gunzipSync(readFileSync(join(import.meta.dirname, 'fixtures/find-target.json.gz'))).toString(),
) as { calls: Record<string, { status: number; body: string }> };

/** Replays the recording; anything not in it fails like a source that is down. */
const replay =
  (down?: RegExp): typeof fetch =>
  async (input, init) => {
    const url = String(input);
    if (down?.test(url)) throw new Error('down');
    const hit = recorded.calls[`${url} ${typeof init?.body === 'string' ? init.body : ''}`];
    if (!hit) throw new Error(`not recorded: ${url}`);
    return new Response(hit.body, { status: hit.status });
  };

const ctx = createContext({ root: REPO, fake: true });
const find = async (query: string, down?: RegExp) =>
  (await makeFindTarget({ fetch: replay(down) }).run({ query }, ctx)) as Json;

const outcomeOf = (o: Json) =>
  o.candidates.length === 0 || o.ambiguous
    ? 'ask'
    : o.candidates[0].draw.length
      ? 'yes-or-no'
      : 'refuse';

describe('the set: no dead ends', () => {
  test.each(FIND_SET)('$query: $outcome', async ({ query, outcome, module, chain }) => {
    const o = await find(query);
    const tool = makeFindTarget();
    const ok = compile(tool.output);
    expect(ok(o), describeErrors(ok.errors)).toBe(true);
    expect(outcomeOf(o)).toBe(outcome);
    expect(o.calls).toBeLessThanOrEqual(5);
    for (const c of o.candidates) {
      expect(c.sources.length, c.name).toBeGreaterThan(0);
      // each one can be drawn, or says why not
      expect(c.draw.length > 0 || Boolean(c.cannot_draw), c.name).toBe(true);
    }
    if (outcome === 'yes-or-no') {
      expect(o.next).toMatch(/plain yes or no before starting a new read/);
      expect(o.candidates[0].draw[0].module).toBe(module);
      expect(o.candidates[0].chain).toBe(chain);
    }
    if (outcome === 'ask') expect(o.next).toMatch(/one clear question/i);
    if (outcome === 'refuse') expect(o.next).toMatch(/say why in plain words/i);
  });
});

describe('the three names', () => {
  test('Moloch DAO: a token that cannot be transferred, confirmed by the chain, already stored', async () => {
    const [top] = (await find('Moloch DAO')).candidates;
    expect(top.kind).toBe('token');
    expect(top.ledger).toBe('moloch-v1');
    expect(top.transferable).toBe(false);
    expect(top.confirmed).toMatchObject({ by: 'chain', chain: 'ethereum' });
    expect(top.confirmed.answered).toEqual(expect.arrayContaining(['totalShares()']));
    expect(top.confirmed.answered).not.toContain('transfer(address,uint256)');
    expect(top.draw[0].stored.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  test('after a yes, its draw goes straight into get_snapshot: the stored one, no network', async () => {
    const [top] = (await find('Moloch DAO')).candidates;
    const snap = (await callTool(
      'get_snapshot',
      { network: top.draw[0].module, params: top.draw[0].params },
      ctx,
    )) as Json;
    expect(snap.reused).toBe(true);
    expect(snap.sha256).toBe(top.draw[0].stored.sha256);
  });

  test('TRUMP: several stay several, with the evidence that separates them', async () => {
    const o = await find('TRUMP');
    expect(o.ambiguous).toBe(true);
    expect(new Set(o.candidates.map((c: Json) => c.address)).size).toBeGreaterThan(1);
    const [top, second] = o.candidates;
    expect(top.chain).toBe('solana');
    expect(top.evidence.holders).toBeGreaterThan(100_000);
    expect(top.evidence.liquidity_usd).toBeGreaterThan(second.evidence.liquidity_usd);
    expect(top.draw[0].stored).toBeDefined();
    expect(o.next).toMatch(/do not pick/i);
  });

  test('UNI on Base: the chain is read from the words, and the read is kept short', async () => {
    const o = await find('UNI on Base');
    expect(o.chain).toBe('base');
    const [top] = o.candidates;
    expect(top).toMatchObject({
      chain: 'base',
      symbol: 'UNI',
      ledger: 'erc20',
      transferable: true,
    });
    expect(top.draw[0].params.window_days).toBe('1');
    expect(top.confirmed.chain).toBe('base');
  });

  test('UNI: the chain finds its Compound-style votes', async () => {
    const [top] = (await find('UNI votes')).candidates;
    expect(top.draw.map((d: Json) => d.module)).toEqual(['erc20-holders', 'erc20-votes']);
    expect(top.draw[1].shows).toMatch(/getCurrentVotes/);
  });
});

describe('what it says when it can draw nothing', () => {
  test('Nouns DAO: a market token that only shares the name is not presented as the DAO', async () => {
    // Found by hand on merged main: the Solana NOUNS token came back as "one clear match".
    const onlyAToken: typeof fetch = async (input) => {
      if (!String(input).includes('jup.ag')) throw new Error('down');
      const token = {
        id: 'NoUnS1111',
        name: 'NOUNS',
        symbol: 'NOUNS',
        holderCount: 900,
        liquidity: 50_000,
      };
      return new Response(JSON.stringify([token]), { status: 200 });
    };
    const o = (await makeFindTarget({ fetch: onlyAToken }).run(
      { query: 'Nouns DAO' },
      ctx,
    )) as Json;
    expect(o.ambiguous).toBe(true);
    expect(o.next).not.toMatch(/one clear match/i);
    expect(o.next).toMatch(/no DAO/i);
    expect(o.next).toMatch(/one clear question/i);
    // the token stays listed: it may be what they meant, and they can say so
    expect(o.candidates.map((c: Json) => c.address)).toContain('NoUnS1111');
  });

  test('a chain we cannot read, a Moloch v2 and a mint too large for a chat each say why', async () => {
    const mc = (await find('MetaCartel')).candidates as Json[];
    expect(mc.find((c) => c.chain === 'gnosis')?.cannot_draw).toMatch(/can't read gnosis/);
    const v2 = mc.find((c) => c.ledger === 'moloch-v2');
    expect(v2?.transferable).toBe(false);
    expect(v2?.cannot_draw).toMatch(/shares are a token too/);
    const bonk = (await find('BONK')).candidates as Json[];
    expect(bonk[0]?.cannot_draw).toMatch(/holders/);
    expect(bonk.some((c) => c.draw.length > 0)).toBe(true);
  });

  test('a misremembered address is never drawn', async () => {
    const o = await find('0x000000000000000000000000000000000000dead');
    expect(o.candidates).toEqual([]);
    expect(o.next).toMatch(/one clear question/i);
  });
});

describe('bounds', () => {
  test('a source that is down costs only its own answer, and is named', async () => {
    const o = await find('TRUMP', /geckoterminal/);
    expect(o.sources.find((s: Json) => s.id === 'geckoterminal')?.status).toBe('failed');
    expect(o.candidates[0].address).toBeDefined();
    expect(o.candidates[0].chain).toBe('solana');
  });

  test('if the chain is down, an address is not confirmed, so it is not drawn', async () => {
    const o = await find('UNI on Base', /tenderly/);
    expect(o.candidates[0].confirmed).toBeNull();
    expect(o.candidates[0].draw).toEqual([]);
    expect(o.candidates[0].cannot_draw).toMatch(/not confirmed/);
  });

  test('in fake mode it makes no call and still knows what Petal holds', async () => {
    const out = (await callTool('find_target', { query: 'House of Stake' }, ctx)) as Json;
    expect(out.calls).toBe(0);
    expect(out.candidates[0].draw[0].module).toBe('near-house-of-stake');
    expect(new Set(out.sources.map((s: Json) => s.status))).toEqual(new Set(['skipped']));
  });

  test('reads the chain from the words only when it is a chain', () => {
    expect(parseQuery('UNI on Base')).toMatchObject({ core: 'UNI', chain: 'base' });
    expect(parseQuery('Moloch DAO')).toMatchObject({ core: 'Moloch', chain: null });
    expect(parseQuery('the LAO')).toMatchObject({ core: 'LAO' });
    expect(parseQuery('House of Stake')).toMatchObject({ core: 'House of Stake', chain: null });
    expect(parseQuery('Rock in Rio')).toMatchObject({ core: 'Rock in Rio', chain: null });
  });

  test('no hand labels: the code names no target', () => {
    const src = join(REPO, 'packages/tools/src/tools');
    const text = readFileSync(join(src, 'find.ts'), 'utf8');
    expect(readdirSync(src)).toContain('find.ts');
    expect(text).not.toMatch(/0x[0-9a-fA-F]{40}/);
    expect(text).not.toMatch(
      /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b(?<!TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA)/,
    );
    expect(text).not.toMatch(/uniswap|metacartel|'trump'/i);
  });
});
