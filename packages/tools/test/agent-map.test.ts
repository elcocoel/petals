// The agent goes to what's on the map (META, from Elco, 12 Nov: "the agent is kinda dumb - it's assuming it has to
// count everything from scratch all the time instead of navigating and helping me interprate what's already
// there"): look_up finds a map with its link, get_map hands over its layers, and the turns it lost go. Offline.
import { modules } from '@petal/inputs';
import { beforeEach, describe, expect, test } from 'vitest';
import { activityOf } from '../src/activity.ts';
import { compile, describeErrors } from '../src/define.ts';
import { privateStore } from '../src/drafts.ts';
import { mapViews } from '../src/map.ts';
import { keepMappingClaims } from '../src/mapping-claims.ts';
import { callTool } from '../src/registry.ts';
import { getMap, mapIdOf, nextSteps, whereItLands } from '../src/tools/maps.ts';
import { loadSnapshot } from '../src/tools/shared.ts';
import type { ToolContext } from '../src/types.ts';
import { rig, type TestRig } from './helpers.ts';

// biome-ignore lint/suspicious/noExplicitAny: walking tool outputs
type Out = Record<string, any>;

const MOLOCH = 'c46437a2afb76cc7c3b07195da499a80a93bd3f09f2ce342436a366c68009a9c';
const DAO = '0x1fd169a4f5c59acf79d0fd5d91d1201ef1bce9f1';
const MAP = `eip155:1:${DAO}`;
const MAP_URL = `https://petal.test/m/${encodeURIComponent(MAP)}`;

let r: TestRig;
const run = async (name: string, input: unknown, ctx: ToolContext = r.ctx) =>
  (await callTool(name, input, ctx)) as Out;

/** A drawing of the stored Moloch reading, named and made by Petals' mapping, as the waves' are. */
async function onTheMap() {
  const proposed = await run('propose_spec', { network: 'moloch-v1', sha256: MOLOCH });
  const drawn = await run('render_flower', { spec: proposed.spec });
  await privateStore(r.ctx.config).draft.label(drawn.spec_sha256, {
    name: 'Founders Guild v1',
    made_by: 'mapping.petals.near',
  });
}

const claim = (subject: string, verb: string, value: string) => ({
  petal: 'claim/v3',
  id: `c-${verb}-${subject.slice(-6)}`,
  issued_at: '2026-11-11T16:00:00.000Z',
  subject,
  verb,
  object: { value },
  kind: 'sourced',
  evidence: [{ type: 'snapshot', snapshot_sha256: MOLOCH }],
});

beforeEach(async () => {
  r = await rig();
  r.ctx.modules = {
    ...r.ctx.modules,
    'moloch-v1': modules['moloch-v1'] as NonNullable<(typeof modules)[string]>,
  };
  await onTheMap();
});

describe('look_up finds the map, with its link', () => {
  test('by its name: the link to go there, its readings with their dates and who mapped them', async () => {
    const o = await run('look_up', { query: 'founders guild' });
    expect(o.maps).toHaveLength(1);
    expect(o.maps[0]).toMatchObject({
      id: MAP,
      name: 'Founders Guild v1',
      about: 'Moloch v1 members on Ethereum',
      chain: 'ethereum',
      map_url: MAP_URL,
      readings: [
        expect.objectContaining({
          snapshot: MOLOCH,
          by: "Petals' own mapping (mapping.petals.near)",
        }),
      ],
      proposals: null,
      price: null,
      known: 'stored',
    });
    expect(o.searched[0]).toEqual({ id: 'maps', status: 'answered' });
    expect(o.says).toMatch(/^Found 1 map on the Power Map, each with its map_url/);
    const fits = compile(
      (await import('../src/tools/look-up.ts')).makeLookUp().output as Record<string, unknown>,
    );
    expect(fits(o), describeErrors(fits.errors)).toBe(true);
  });

  test("by its address, and by a member's: the map it is, the map it's in", async () => {
    expect(
      (await run('look_up', { query: DAO.toUpperCase().replace('0X', '0x') })).maps[0].id,
    ).toBe(MAP);
    const member = (await loadSnapshot(r.ctx, MOLOCH)).participants[0]?.id as string;
    const o = await run('look_up', { query: member.slice(member.lastIndexOf(':') + 1) });
    expect(o.maps.map((m: Out) => m.id)).toEqual([MAP]);
  });

  test('a word no map goes by finds none, and says nothing of maps', async () => {
    const o = await run('look_up', { query: 'raidguild' });
    expect(o.maps).toEqual([]);
    expect(o.says).not.toMatch(/Power Map, each/);
  });
});

describe('get_map hands over what the map holds', () => {
  test("its layers, Petals' mapping's Insights and the person's own names, by its id or its link", async () => {
    const store = privateStore(r.ctx.config);
    const member = (await loadSnapshot(r.ctx, MOLOCH)).participants[0]?.id as string;
    const account = member.includes(':') ? member : `eip155:1:${member}`;
    await keepMappingClaims(r.ctx, 'test', [
      claim(MAP, 'noted', 'The guild is member-governed.') as never,
    ]);
    const at = '2026-11-11T15:00:00.000Z';
    await store.proposals.put({
      about: MAP,
      read_at: at,
      body: JSON.stringify({
        petal: 'proposals/v1',
        about: MAP,
        source: { kind: 'baal', contract: MAP, ref: 'test', at },
        proposals: [
          {
            id: '1',
            title: 'Fund the guild',
            kind: null,
            proposer: null,
            at,
            closes_at: null,
            decided_at: null,
            outcome: 'passed',
            as_said: 'passed',
            ref: `proposal:${MAP}:1`,
            votes: [{ account: member, vote: 'for', as_said: 'true', at }],
          },
        ],
        read_at: at,
      }),
    });
    // the person's own name for a member: theirs alone, and another person's never shows
    const own = (owner: string, value: string) => ({
      owner,
      id: `${owner}-named`,
      exploration: `ex-${owner}`,
      subject: account,
      verb: 'named',
      kind: 'sourced',
      body: JSON.stringify(claim(account, 'named', value)),
      credential: null,
      created_at: at,
      place: 0,
    });
    await store.annotation.add([own('prs_elco', 'Dekan'), own('prs_other', 'Someone')]);
    const theirs = { ...r.ctx, caller: { subject: 'prs_elco' } };

    const o = await run('get_map', { map: MAP }, theirs);
    expect(o.error).toBeUndefined();
    expect(o).toMatchObject({
      id: MAP,
      name: 'Founders Guild v1',
      map_url: MAP_URL,
      readings: [expect.objectContaining({ snapshot: MOLOCH, drawn: 1 })],
      proposals: expect.objectContaining({ count: 1, voted: 1 }),
      value: null,
      payouts: null,
      insights: [
        {
          about: MAP,
          verb: 'noted',
          says: 'The guild is member-governed.',
          kind: 'sourced',
          at: '2026-11-11T16:00:00.000Z',
        },
      ],
      your_names: [{ account, name: 'Dekan' }],
    });
    // by its link too, as a model may pass it; a visitor has no names of their own
    const byLink = await run('get_map', { map: MAP_URL });
    expect(byLink.id).toBe(MAP);
    expect(byLink.your_names).toEqual([]);
    const fits = compile(getMap.output as Record<string, unknown>);
    expect(fits(o), describeErrors(fits.errors)).toBe(true);
  });

  test('a map not on the Power Map is not_found, and says where ids come from', async () => {
    const o = await run('get_map', { map: 'eip155:1:0x000000000000000000000000000000000000dead' });
    expect(o.error.code).toBe('not_found');
    expect(o.error.hint).toMatch(/look_up/);
  });

  test("a map's id from its link, encoded or not, or the id itself", () => {
    expect(mapIdOf(MAP)).toBe(MAP);
    expect(mapIdOf(MAP_URL)).toBe(MAP);
    expect(mapIdOf(`/m/${encodeURIComponent(MAP)}?view=x`)).toBe(MAP);
  });
});

describe("propose_spec takes a stored reading's own params back (12 Nov: the wasted turn)", () => {
  test("a param its reading carries, though its reader doesn't take it, isn't refused; another is", async () => {
    const s = await loadSnapshot(r.ctx, MOLOCH);
    // a wave wrote its own words into the reading's params (RaidGuild's governance_contract)
    const waved = {
      ...s,
      network: { ...s.network, params: { ...s.network.params, governance_contract: DAO } },
    };
    const { sha256 } = await r.ctx.store.put(waved);
    const ok = await run('propose_spec', {
      network: 'moloch-v1',
      sha256,
      params: waved.network.params,
    });
    expect(ok.error).toBeUndefined();
    expect(ok.spec.network.params.governance_contract).toBe(DAO);
    const refused = await run('propose_spec', {
      network: 'moloch-v1',
      sha256,
      params: { ...waved.network.params, colour_me: 'blue' },
    });
    expect(refused.error.message).toMatch(/takes no parameter "colour_me"/);
  });
});

describe("the ceremony's card: where a new read would land (Elco, 12 Nov)", () => {
  test('a target at an address already on the map lands on that map; a new one on its chain, with none', async () => {
    const at = await whereItLands(r.ctx, 'moloch-v1', {
      dao: DAO.toUpperCase().replace('0X', '0x'),
    });
    expect(at).toEqual({
      existing_map: MAP,
      name: 'Founders Guild v1',
      chain: 'ethereum',
      what: 'Moloch v1 members on Ethereum',
    });
    const fresh = await whereItLands(r.ctx, 'moloch-v1', {
      dao: '0x000000000000000000000000000000000000dead',
    });
    expect(fresh).toEqual({
      existing_map: null,
      name: null,
      chain: 'ethereum',
      what: 'Moloch v1 members on Ethereum',
    });
  });
});

describe('the next steps on a map just read (META, from Elco, 12 Nov)', () => {
  test("what it holds gives the steps; Compare only fills the composer; the brain's services that fit", () => {
    const all = nextSteps({
      id: MAP,
      name: 'RaidGuild',
      proposals: { voted: 3 },
      payouts: { count: 2 },
      value: { treasury_usd: '10' },
    });
    expect(all.steps).toEqual([
      { label: 'Show the blocs', ask: 'Who votes together in RaidGuild?', finish: true },
      { label: 'What it paid out', ask: 'What has RaidGuild paid out?', finish: true },
      { label: 'Compare with…', ask: 'Compare RaidGuild with ', finish: false },
    ]);
    expect(all.services.map((s) => s.label)).toEqual([
      'A governance health report',
      'A distribution card',
      'An authority map',
      'A treasury and unlocks calendar',
      'A full DAO report',
    ]);
    expect(all.services[1]).toEqual({
      label: 'A distribution card',
      ask: 'A distribution card for RaidGuild',
      finish: true,
    });
    const bare = nextSteps({ id: MAP, name: 'X', proposals: null, payouts: null, value: null });
    expect(bare.steps.map((s) => s.label)).toEqual(['Compare with…']);
    expect(bare.services.map((s) => s.label)).toEqual(['A distribution card', 'An authority map']);
  });
});

describe("list_publishable through a project's link (CONNECTORS, 12 Nov: a person's own agent has no session)", () => {
  test("the link's owner is whose data it is: what their agents kept about the map, and what stays private", async () => {
    // a project their agent works in by its link (an unclaimed one here: its owner is the project itself)
    const started = await run('start_exploration', { question: 'who runs the guild?' });
    const exploration = (started.link as { url: string }).url;
    const member = (await loadSnapshot(r.ctx, MOLOCH)).participants[0]?.id as string;
    const account = member.includes(':') ? member : `eip155:1:${member}`;
    const proposal = {
      type: 'proposal',
      proposal: `proposal:eip155:1:${DAO}:7`,
      url: 'https://etherscan.io/tx/0x1',
      quote: 'Pay Ada for the guild',
    };
    const kept = await run('add_annotation', {
      exploration,
      as: 'codex',
      annotations: [
        {
          subject: account,
          verb: 'named',
          object: { value: 'Ada' },
          kind: 'sourced',
          evidence: [proposal],
        },
        {
          subject: account,
          verb: 'named',
          object: { value: 'Ada B' },
          kind: 'sourced',
          evidence: [{ type: 'page', url: 'https://example.org/ada' }],
        },
      ],
    });
    expect(kept.error).toBeUndefined();
    // their agent, with no session: through the link
    const o = await run('list_publishable', { map: MAP, exploration });
    expect(o).toMatchObject({
      about: MAP,
      name: 'Founders Guild v1',
      map_url: MAP_URL,
      ready: 1,
      published: 0,
    });
    expect(o.private).toHaveLength(1);
    // with neither a link nor a person signed in, nobody's data
    expect((await run('list_publishable', { map: MAP })).error.code).toBe('unauthorised');
  });
});

describe("each petal's activity reaches every drawing of the map (activity.ts, 12 Nov)", () => {
  test("from the map's proposals as last read; none before any were read", async () => {
    const s = await loadSnapshot(r.ctx, MOLOCH);
    expect(await activityOf(r.ctx, s)).toEqual([]);
    // each view says the pieces its reading has, so Tools offers only what draws (OVERLAYS, wave 3)
    const names = async () => (await mapViews(r.ctx))[0]?.pieces.map((p) => p.name) ?? [];
    expect(await names()).toEqual(expect.arrayContaining(['share', 'amount', 'kind', 'identity']));
    expect(await names()).not.toContain('votes_cast');
    expect(await names()).not.toContain('backers');
    const member = s.participants[0]?.id as string;
    const at = '2026-11-11T15:00:00.000Z';
    const body = {
      petal: 'proposals/v1',
      about: MAP,
      source: { kind: 'baal', contract: MAP, ref: 'test', at },
      proposals: [
        {
          id: '1',
          title: 'Fund the guild',
          kind: null,
          proposer: null,
          at,
          closes_at: null,
          decided_at: null,
          outcome: 'passed',
          as_said: 'passed',
          ref: `proposal:${MAP}:1`,
          votes: [{ account: member, vote: 'for', as_said: 'true', at }],
        },
      ],
      read_at: at,
    };
    await privateStore(r.ctx.config).proposals.put({
      about: MAP,
      body: JSON.stringify(body),
      read_at: at,
    });
    const pieces = await activityOf(r.ctx, s);
    expect(pieces.map((p) => p.name)).toEqual(['votes_cast', 'voted', 'last_active']);
    expect(await names()).toEqual(expect.arrayContaining(['votes_cast', 'voted', 'last_active']));
    // and the pieces themselves, as readFlower took them, for the drawn petals only (LOOK, wave 4: redraw at once)
    const [v] = await mapViews(r.ctx);
    if (!v) throw new Error('no view on the map');
    const drawn = new Set((v.reading.petals as { id: string }[]).map((p) => p.id));
    const given = v.given.find((p) => p.name === 'votes_cast') as {
      values: { participant: string; value: string }[];
    };
    expect(given.values.length).toBeGreaterThan(0);
    expect(given.values.every((x) => drawn.has(x.participant))).toBe(true);
    const cast = pieces[0] as { values: { participant: string; value: string }[] };
    expect(cast.values.find((v) => v.participant === member)?.value).toBe('1');
    expect(cast.values.filter((v) => v.value === '0')).toHaveLength(s.participants.length - 1);
  });
});

describe('what a press adds, by layer (Elco, 12 Nov: "a clear indicator of what data layers and claims I would be adding")', () => {
  test("a reading the person drew of the map goes with the press; once another maker has it, it doesn't", async () => {
    const person = { ...r.ctx, caller: { subject: 'prs_elco', by: 'near:mainnet:elco.near' } };
    const started = await run('start_exploration', { question: 'who runs the guild?' }, person);
    const drawn = await run('propose_spec', { network: 'moloch-v1', sha256: MOLOCH });
    const saved = await run(
      'save_step',
      { exploration: started.exploration, spec: drawn.spec, note: 'a look' },
      person,
    );
    expect(saved.error).toBeUndefined();
    const store = privateStore(r.ctx.config);
    // the mapping drew the same view: it isn't theirs to take
    expect((await run('list_publishable', { map: MAP }, person)).readings).toEqual([]);
    // a view nobody is credited with yet, drawn in their project, goes with the press
    await store.draft.label(drawn.spec_sha256, { name: null, made_by: null });
    const o = await run('list_publishable', { map: MAP }, person);
    expect(o.readings).toEqual([
      expect.objectContaining({
        layer: 'Readings',
        id: drawn.spec_sha256,
        accounts: expect.any(Number),
      }),
    ]);
    expect(o.readings[0].what).toMatch(/^Moloch v1 members on Ethereum, \d+ \w+$/);
    expect(o.adds).toContainEqual({
      layer: 'Readings',
      kind: 'drawn',
      label: 'Readings you drew',
      count: 1,
      goes: true,
    });
  });
});
