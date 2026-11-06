// What the model is told and what it reads back, on the real registry: the real Interpretation
// shape reaches it, each turn pays for no duplicate text, and a tool result carries what the next
// step needs and no snapshot body.
import { fileURLToPath } from 'node:url';
import { schemas } from '@petal/core';
import { createContext, registry } from '@petal/tools';
import { describe, expect, test } from 'vitest';
import { draftLink, forModel, SHARES_FOR_MODEL, summarize } from '../src/summary.ts';
import { llmTools } from '../src/tool-defs.ts';
import { tmpRoot } from './helpers.ts';

// biome-ignore lint/suspicious/noExplicitAny: walking JSON Schemas and tool outputs
type Json = Record<string, any>;
const tools = llmTools(registry);
const def = (name: string) => {
  const d = tools.find((t) => t.name === name);
  if (!d) throw new Error(name);
  return d;
};

describe('llmTools on the real registry', () => {
  test('validate_spec hands the model the Interpretation of the core schema, with no references', () => {
    const p = def('validate_spec').parameters as Json;
    const flower = schemas.interpretation as Json;
    const core = flower.$defs.interpretation;
    const shown = p.properties.interpretation;
    expect(shown.required).toEqual(core.required);
    expect(Object.keys(shown.properties)).toEqual(Object.keys(core.properties));
    expect(shown.additionalProperties).toBe(false);
    expect(shown.properties.documents.items.required).toEqual(['id', 'kind', 'url', 'fetched_at']);
    expect(shown.properties.conflicts.items).toEqual({ type: 'string' });
    expect(JSON.stringify(tools)).not.toContain('$ref');
  });

  test('a spec is named by its hash in this door, and render_flower takes nothing else', () => {
    for (const name of ['validate_spec', 'render_flower']) {
      const p = def(name).parameters as Json;
      expect(p.properties.spec).toMatchObject({ type: 'string', pattern: '^[0-9a-f]{64}$' });
      expect(p.required).toEqual(['spec']);
    }
    expect(Object.keys((def('render_flower').parameters as Json).properties)).toEqual(['spec']);
  });

  test('a reading is never offered: the model is told nothing new about render_flower', () => {
    expect(JSON.stringify(def('render_flower'))).not.toMatch(/reading/);
    expect(JSON.stringify(def('validate_spec'))).not.toMatch(/include_reading/);
  });

  test('the description is said once, and only the agent’s tools are offered', () => {
    for (const t of tools) expect(t.parameters).not.toHaveProperty('description');
    expect(tools.map((t) => t.name)).not.toContain('publish_flower');
    expect(def('validate_spec').description).toMatch(/Fix the errors and retry/);
  });

  test('every tool definition is valid for strict model templates: an object schema', () => {
    for (const t of tools) {
      expect(t.parameters.type, t.name).toBe('object');
      expect(t.parameters, t.name).not.toHaveProperty('$schema');
    }
  });
});

describe('forModel on the real tools (near-validators fixture)', () => {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const ctx = createContext({ root, fake: true, stateDir: tmpRoot() } as never);
  const run = async (name: string, args: unknown) => {
    const t = registry.find((x) => x.name === name);
    if (!t) throw new Error(name);
    return (await t.run(args, ctx)) as Json;
  };
  const size = (name: string, out: unknown) => JSON.stringify(forModel(name, out)).length;

  test('each result is cut, keeps what the next step needs, and never holds a body', async () => {
    const networks = await run('list_networks', {});
    const n = forModel('list_networks', networks) as Json;
    expect(n.cannot_read_hint).toBe(
      networks.cannot_read_hint.replace(
        /; quote_payment with purpose sponsor_coverage quotes new coverage\./,
        '.',
      ),
    );
    expect(n.cannot_read_hint).not.toMatch(/quote_payment/);
    const v = n.networks.find((x: Json) => x.id === 'near-validators');
    expect(v).toMatchObject({ live: false, segments: ['backers'] });
    expect(v.measures).toContain('validator_stake_current_epoch');
    expect(v).not.toHaveProperty('capabilities');
    expect(size('list_networks', networks)).toBeLessThan(JSON.stringify(networks).length / 3);

    const snap = await run('get_snapshot', { network: 'near-validators' });
    const s = forModel('get_snapshot', snap) as Json;
    expect(s).toMatchObject({ sha256: snap.sha256, reused: true, where: 'fixture' });
    expect(s.snapshot).toEqual(snap.snapshot);
    expect(s.counts).toEqual(snap.counts);
    expect(s.sources).toContain('fastnear-rpc-validators');
    expect(s).not.toHaveProperty('coverage');
    expect(s).not.toHaveProperty('body_url');

    const described = await run('describe_snapshot', { sha256: snap.sha256 });
    const d = forModel('describe_snapshot', described) as Json;
    expect(d.coverage_note).toBe(described.coverage_note);
    expect(d.primitives).toEqual(described.primitives);
    expect(d.sources).toEqual(described.sources);

    const figures = await run('compute_figures', {
      sha256: snap.sha256,
      measure: 'validator_stake_current_epoch',
    });
    const f = forModel('compute_figures', figures) as Json;
    expect(SHARES_FOR_MODEL).toBe(300);
    expect(f.shares).toEqual(figures.shares.slice(0, SHARES_FOR_MODEL));
    expect(f.shares.length).toBeGreaterThan(10);
    if (figures.shares.length > SHARES_FOR_MODEL) expect(f.shares_note).toMatch(/largest 300 of/);
    expect(f.nakamoto).toEqual(figures.nakamoto);
    expect(f.figure_ids).toEqual(figures.figure_ids);

    const proposed = await run('propose_spec', {
      network: 'near-validators',
      sha256: snap.sha256,
      choices: { segments: 'backers' },
    });
    expect(forModel('propose_spec', proposed)).toEqual(proposed);

    const drawn = await run('render_flower', { spec: proposed.spec });
    const r = forModel('render_flower', drawn) as Json;
    expect(r.view_url).toBe(draftLink(drawn.spec_sha256));
    expect(r.legend).toEqual(drawn.legend);
    expect(r).not.toHaveProperty('petals');
    expect(r.view_url.length).toBeLessThan(40);

    for (const out of [s, d, f, r]) expect(JSON.stringify(out)).not.toMatch(/"participants":\[/);
  });

  test('the agent reads the same result whether or not a reading came back', async () => {
    const snap = await run('get_snapshot', { network: 'near-validators' });
    const { spec } = await run('propose_spec', {
      network: 'near-validators',
      sha256: snap.sha256,
      choices: { segments: 'backers' },
    });
    const plain = await run('render_flower', { spec });
    const withReading = await run('render_flower', { spec, include_reading: true });
    // it really came back, and it's big enough to matter
    expect(plain).not.toHaveProperty('reading');
    expect(withReading.reading.petals.length).toBeGreaterThan(0);
    expect(JSON.stringify(withReading.reading).length).toBeGreaterThan(5000);
    const read = forModel('render_flower', withReading) as Json;
    expect(read).not.toHaveProperty('reading');
    expect(read).toEqual(forModel('render_flower', plain));
    expect(JSON.stringify(read).length).toBe(size('render_flower', plain));
  });

  test('a tool error goes through whole', () => {
    const e = { error: { code: 'bad_input', message: 'no', hint: 'h' }, tools_version: 'tools/v1' };
    for (const name of ['get_snapshot', 'render_flower', 'compute_figures']) {
      expect(forModel(name, e)).toBe(e);
    }
  });

  test('the summary for the UI still names the first error and the count', () => {
    const out = {
      valid: false,
      errors: [
        { path: '/a', rule: 'r', message: 'first' },
        { path: '/b', rule: 'r', message: 'second' },
      ],
      warnings: [],
    };
    expect(summarize('validate_spec', out)).toBe('invalid: 2 errors; first: first');
  });
});
