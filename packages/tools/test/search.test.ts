// Search by words and meaning: the ranking on its own, then search_petals over a real stored map, offline,
// with the fake model (words hashed for meaning). What the real models find is scripts/search-eval.ts's.
import type { Claim, Spec } from '@petal/core/types';
import { modules } from '@petal/inputs';
import { beforeEach, describe, expect, test } from 'vitest';
import { privateStore } from '../src/drafts.ts';
import { mapViews } from '../src/map.ts';
import { keepMappingClaims, MAPPING } from '../src/mapping-claims.ts';
import { callTool } from '../src/registry.ts';
import {
  byWords,
  type Findable,
  find,
  joinSets,
  memoryVectors,
  searchSet,
  snippetOf,
  wordIndex,
  wordsOf,
} from '../src/search-index.ts';
import { fakeSearchModel, type SearchModel, searchModel } from '../src/search-model.ts';
import { claimTitle, MEANING_OFF, shortRef } from '../src/tools/search-petals.ts';
import { rig, type TestRig } from './helpers.ts';

// biome-ignore lint/suspicious/noExplicitAny: walking tool outputs
type Out = Record<string, any>;

/** The fake model, counting what it's asked to embed. */
function counted() {
  const model = fakeSearchModel();
  const embedded: string[] = [];
  const m: SearchModel = {
    ...model,
    embed: async (texts, as) => {
      if (as === 'document') embedded.push(...texts);
      return model.embed(texts, as);
    },
  };
  return { m, embedded };
}

const DOCS: Findable[] = [
  {
    kind: 'map',
    id: 'near:mainnet:marketing.sputnik-dao.near',
    title: 'marketing',
    text: 'marketing\nSputnik DAO members on NEAR',
    group: 'near:mainnet:marketing.sputnik-dao.near',
    keys: ['marketing', 'marketing.sputnik-dao.near'],
  },
  {
    kind: 'proposal',
    id: 'p1',
    title: 'Silver sponsorship for a hackathon at Columbia',
    text: 'Silver sponsorship for a hackathon at Columbia\nVote, passed',
    group: 'near:mainnet:marketing.sputnik-dao.near',
    about: 'near:mainnet:marketing.sputnik-dao.near',
  },
  {
    kind: 'map',
    id: 'eip155:1:0x1f98',
    title: 'Uniswap',
    text: 'Uniswap\nUNI\nERC-20 token holders on Ethereum',
    group: 'eip155:1:0x1f98',
    keys: ['Uniswap', 'UNI'],
  },
  {
    kind: 'map',
    id: 'eip155:1:0xunity',
    title: 'Unity',
    text: 'Unity\nUNITY\nholders of uni-like tokens, uni uni',
    group: 'eip155:1:0xunity',
    keys: ['Unity'],
  },
];

describe('the ranking', () => {
  test('words lose their accents and plurals, so validadóres meets validadores', () => {
    expect(wordsOf('Validadóres, holders!')).toEqual(['validadore', 'holder']);
  });

  test('words rank by BM25, and a word being typed matches the words it begins', () => {
    const index = wordIndex(DOCS);
    expect(byWords(index, 'hackathon')[0]?.at).toBe(1);
    expect(byWords(index, 'hacka')).toEqual([]);
    expect(byWords(index, 'hacka', { prefix: true })[0]?.at).toBe(1);
  });

  test('a map comes once, with what matched under it, and what is typed exactly comes first', async () => {
    const { m } = counted();
    const set = await searchSet(DOCS, m, memoryVectors());
    const [first] = await find(set, 'sponsorship hackathon', m, { group: true });
    expect(first).toMatchObject({ kind: 'map', id: 'near:mainnet:marketing.sputnik-dao.near' });
    expect(first?.matched?.map((x) => x.id)).toEqual(['p1']);
    // "uni" is all over Unity's words, but UNI is Uniswap's symbol
    expect((await find(set, 'UNI', m, { group: true, rerank: 10 }))[0]?.id).toBe('eip155:1:0x1f98');
    // only some kinds: proposals as themselves
    const only = await find(set, 'hackathon', m, { only: (d) => d.kind === 'proposal' });
    expect(only.map((x) => x.id)).toEqual(['p1']);
  });

  test('the reranker orders the best it reads', async () => {
    const { m } = counted();
    const set = await searchSet(DOCS, m, memoryVectors());
    const reread = await find(set, 'holders on Ethereum', m, { rerank: 4 });
    expect(reread[0]?.id).toBe('eip155:1:0x1f98');
    expect(reread[0]?.rerank).toBe(1);
  });

  test('a text is embedded once: a second set, or a joined one, embeds only what is new', async () => {
    const { m, embedded } = counted();
    const keep = memoryVectors();
    await searchSet(DOCS, m, keep);
    expect(embedded).toHaveLength(4);
    const own: Findable[] = [
      { kind: 'note', id: 'note:n1', title: 'my note', text: 'watch this hackathon sponsor' },
    ];
    const set = joinSets(await searchSet(DOCS, m, keep), await searchSet(own, m, keep));
    expect(embedded).toHaveLength(5);
    const found = await find(set, 'hackathon sponsor', m, {});
    expect(found.map((x) => x.id)).toContain('note:n1');
    expect(set.placeOf('note:n1')).toBe(4);
  });

  test('a snippet marks the words that matched, and never treats text as markup', () => {
    const parts = snippetOf('Quem controla os <b>validadores</b> de hoje?', 'validadóres');
    expect(parts.filter((p) => p.hit).map((p) => p.text)).toEqual(['validadores']);
    expect(parts.map((p) => p.text).join('')).toContain('<b>validadores</b>');
  });
});

const MOLOCH = 'c46437a2afb76cc7c3b07195da499a80a93bd3f09f2ce342436a366c68009a9c';
const DAO = '0x1fd169a4f5c59acf79d0fd5d91d1201ef1bce9f1';

describe("a claim's title", () => {
  const names = new Map([
    ['eip155:1:0xc00e94cb662c3520282e6f5717214004a7f26888', 'Compound'],
    ['near:mainnet:alice.near', 'Alice'],
  ]);
  const nameOf = (ref: string) => names.get(ref) ?? null;

  test('says who by name, else a short address, and the claim in words', () => {
    expect(
      claimTitle(
        'eip155:1:0xc00e94cb662c3520282e6f5717214004a7f26888',
        'noted',
        { value: 'No stable voting bloc is asserted.' },
        nameOf,
      ),
    ).toBe('Compound: No stable voting bloc is asserted.');
    expect(
      claimTitle(
        'eip155:100:0xf02fd4286917270cb94fbc13a0f4e1ed76f7e986',
        'member_of',
        'near:mainnet:alice.near',
        nameOf,
      ),
    ).toBe('0xf02f…e986 is a member of Alice');
    // a name claim's own subject reads as its address, never as the name it gives
    expect(claimTitle('near:mainnet:alice.near', 'named', { value: 'Alice' }, nameOf)).toBe(
      'alice.near is named Alice',
    );
    expect(
      shortRef(
        'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:8HVYKgq2PA4SCDuPZSfHBH1aupTBJYPVru6kq3UfuSX9',
      ),
    ).toBe('8HVY…uSX9');
    expect(shortRef('proposal:near:mainnet:marketing.sputnik-dao.near:12')).toBe('proposal 12');
  });

  test('a long note is cut at a word, with an ellipsis', () => {
    const t = claimTitle('near:mainnet:alice.near', 'noted', { value: 'word '.repeat(60) }, nameOf);
    expect(t.length).toBeLessThanOrEqual(121);
    expect(t.endsWith('…')).toBe(true);
    expect(t.startsWith('Alice: word word')).toBe(true);
  });
});

describe('search_petals', () => {
  let r: TestRig;
  let embedded: string[];
  const run = async (input: unknown) => (await callTool('search_petals', input, r.ctx)) as Out;

  beforeEach(async () => {
    r = await rig();
    r.ctx.modules = {
      ...r.ctx.modules,
      'moloch-v1': modules['moloch-v1'] as NonNullable<(typeof modules)[string]>,
    };
    const c = counted();
    r.ctx.searchModel = c.m;
    embedded = c.embedded;
    const proposed = (await callTool(
      'propose_spec',
      { network: 'moloch-v1', sha256: MOLOCH },
      r.ctx,
    )) as Out;
    const drawn = (await callTool('render_flower', { spec: proposed.spec as Spec }, r.ctx)) as Out;
    await privateStore(r.ctx.config).draft.label(drawn.spec_sha256, {
      name: 'Founders Guild v1',
      made_by: null,
    });
    const [view] = await mapViews(r.ctx);
    const about = view?.map as string;
    await privateStore(r.ctx.config).proposals.put({
      about,
      read_at: '2026-11-11T00:00:00Z',
      body: JSON.stringify({
        petal: 'proposals/v1',
        about,
        source: { kind: 'moloch-v1', contract: about, ref: 'a test', at: '2026-11-11T00:00:00Z' },
        read_at: '2026-11-11T00:00:00Z',
        proposals: [
          {
            id: '3',
            title: 'Grant for an Ethereum client team',
            kind: null,
            proposer: null,
            at: '2019-02-17T21:00:56Z',
            closes_at: null,
            decided_at: null,
            outcome: 'passed',
            as_said: 'didPass true',
            ref: `proposal:${about}:3`,
            votes: [],
          },
        ],
      }),
    });
  });

  test("finds /docs' pages when asked for, each by its repo path with its sections under it, never by default", async () => {
    const found = await run({ q: 'open calls feed', kinds: ['doc'] });
    expect(found.results.length).toBeGreaterThan(0);
    expect(found.results.every((r: Out) => r.kind === 'doc')).toBe(true);
    expect(found.results.map((r: Out) => r.id)).toContain('docs/use-it/open-calls.md');
    const sections = found.results.flatMap((r: Out) => r.matched ?? []);
    expect(sections.some((m: Out) => /^[^#]+\.md#[a-z0-9-_]+$/.test(m.id))).toBe(true);
    // a format by its schema's id
    expect(
      (await run({ q: 'proposals votes ballot', kinds: ['doc'] })).results.map((r: Out) => r.id),
    ).toEqual(expect.arrayContaining([expect.stringMatching(/^urn:petal:schema:proposals:v\d+$/)]));
    expect((await run({ q: 'open calls feed' })).results.some((r: Out) => r.kind === 'doc')).toBe(
      false,
    );
  });

  test('finds the map by its name and by its address, and a proposal under its map', async () => {
    const named = await run({ q: 'founders guild' });
    expect(named.meaning).toBe('on');
    expect(named.results[0]).toMatchObject({ kind: 'map', title: 'Founders Guild v1' });
    expect(named.results[0].view_url).toMatch(/\/d\//);
    expect((await run({ q: DAO })).results[0]).toMatchObject({ kind: 'map' });
    const grant = await run({ q: 'ethereum client grant' });
    expect(grant.results[0].matched[0]).toMatchObject({
      kind: 'proposal',
      title: 'Grant for an Ethereum client team',
    });
    const proposals = await run({ q: 'ethereum client grant', kinds: ['proposal'] });
    expect(proposals.results.map((x: Out) => x.kind)).toEqual(['proposal']);
  });

  test("Petals' mapping's claims are found by anyone, under the map they're about", async () => {
    const [view] = await mapViews(r.ctx);
    const about = view?.map as string;
    const claim = {
      petal: 'claim/v3',
      id: 'c'.repeat(64),
      subject: about,
      verb: 'is_a',
      object: { value: 'grants guild' },
      kind: 'sourced',
      issued_at: '2026-11-11T00:00:00Z',
      evidence: [{ type: 'page', url: 'https://example.org', note: 'funds open source tooling' }],
      by: MAPPING,
    } as unknown as Claim;
    expect(await keepMappingClaims(r.ctx, 'test', [claim])).toBe(1);
    const found = await run({ q: 'funds open source tooling' });
    expect(found.results[0]).toMatchObject({ kind: 'map', id: about });
    expect(found.results[0].matched[0]).toMatchObject({
      kind: 'claim',
      id: 'c'.repeat(64),
      title: 'Founders Guild v1 is a grants guild',
    });
  });

  test('the map is embedded once: a second search embeds nothing', async () => {
    await run({ q: 'founders guild' });
    const once = embedded.length;
    expect(once).toBeGreaterThan(0);
    await run({ q: 'something else' });
    expect(embedded).toHaveLength(once);
  });

  test('with no model running, it searches by words alone and says so', async () => {
    // fake mode brings its own; a real site with no PETAL_SEARCH_URL has none
    r.ctx = { ...r.ctx, searchModel: undefined, config: { ...r.ctx.config, fake: false } };
    const off = await run({ q: 'founders guild' });
    expect(off).toMatchObject({ meaning: 'off', says: MEANING_OFF });
    expect(off.results[0]).toMatchObject({
      kind: 'map',
      title: 'Founders Guild v1',
      ranks: { words: 1 },
    });
    // and a model that doesn't answer is the same
    r.ctx = {
      ...r.ctx,
      searchModel: searchModel('http://127.0.0.1:9', {
        fetch: () => Promise.reject(new Error('refused')),
      }),
    };
    const down = await run({ q: 'founders guild' });
    expect(down).toMatchObject({ meaning: 'off' });
    expect(down.results[0]).toMatchObject({ title: 'Founders Guild v1' });
    expect((await run({ q: 'nothing like it' })).results).toEqual([]);
  });
});
