// Search by words and meaning (#105): the ranking on its own, then search_petals over a real stored map, offline,
// with the fake model (words hashed for meaning). What the real models find is scripts/search-eval.ts's.
import type { Spec } from '@petal/core/types';
import { modules } from '@petal/inputs';
import { beforeEach, describe, expect, test } from 'vitest';
import { privateStore } from '../src/drafts.ts';
import { mapViews } from '../src/map.ts';
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
import { fakeSearchModel, type SearchModel } from '../src/search-model.ts';
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

  test('finds the map by its name and by its address, and a proposal under its map', async () => {
    const named = await run({ q: 'founders guild' });
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

  test('the map is embedded once: a second search embeds nothing', async () => {
    await run({ q: 'founders guild' });
    const once = embedded.length;
    expect(once).toBeGreaterThan(0);
    await run({ q: 'something else' });
    expect(embedded).toHaveLength(once);
  });

  test('with no model, it says so', async () => {
    // fake mode brings its own; a real site with no PETAL_SEARCH_URL has none
    r.ctx = { ...r.ctx, searchModel: undefined, config: { ...r.ctx.config, fake: false } };
    const out = await run({ q: 'founders guild' });
    expect(out.error).toMatchObject({ code: 'source_failed' });
  });
});
