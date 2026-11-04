// A fake tool registry for the CLI tests: names and input schemas as in contracts/tools.md,
// made-up outputs. Every call is logged, so tests can check what the CLI asked for.
import { createHash } from 'node:crypto';
import { NotImplementedError, TOOLS_VERSION } from '@petal/core';
import type { Config, JSONSchema, ToolContext } from '@petal/tools';
import type { AnyTool, CliDeps } from '../src/main.ts';

export const SHA = '72a6d9676d967d63712dc82bcbb90282d2f61e5ca6495c3e2e54a4f9af77e9ec';
export const MEASURE = 'validator_stake_current_epoch';
export const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800"></svg>';

type Input = Record<string, unknown>;
export interface Call {
  name: string;
  input: Input;
}

const str = { type: 'string' };
const int = { type: 'integer' };
const obj = { type: 'object' };
const sha = { type: 'string', pattern: '^[0-9a-f]{64}$' };

const schemas: Record<string, JSONSchema> = {
  list_networks: { type: 'object', properties: { query: str } },
  get_network: { type: 'object', required: ['id'], properties: { id: str, params: obj } },
  get_snapshot: {
    type: 'object',
    required: ['network'],
    properties: {
      network: str,
      params: { type: 'object', additionalProperties: str },
      at: { anyOf: [str, { type: 'object', properties: { block_height: int } }] },
      fresh: { type: 'boolean' },
    },
  },
  describe_snapshot: {
    type: 'object',
    required: ['sha256'],
    properties: { sha256: sha, top: { type: 'integer', minimum: 1, maximum: 50 } },
  },
  compute_figures: {
    type: 'object',
    required: ['sha256', 'measure'],
    properties: {
      sha256: sha,
      measure: str,
      petals: int,
      nakamoto_threshold: { type: 'number' },
      top_k: { type: 'array', items: int },
    },
  },
  compare_figures: {
    type: 'object',
    required: ['a', 'b', 'measure'],
    properties: { a: sha, b: sha, measure: str, petals: int },
  },
  propose_spec: {
    type: 'object',
    required: ['network', 'sha256'],
    $defs: {
      choices: {
        type: 'object',
        properties: {
          measure: str,
          petals: int,
          width: { enum: ['r1.5', 'r2', 'r3', 'equal'] },
          height: str,
          colour: { enum: ['kind', 'identity', 'single'] },
          outline: { enum: ['identity_status', 'none'] },
          segments: { enum: ['none', 'backers', 'time', 'ops', 'roles'] },
          lines: str,
          markings: { enum: ['none', 'fusion'] },
          order: str,
        },
      },
    },
    properties: {
      network: str,
      params: obj,
      sha256: sha,
      choices: { $ref: '#/$defs/choices' },
      variation_of: sha,
      meanings: obj,
    },
  },
  validate_spec: {
    type: 'object',
    required: ['spec'],
    properties: { spec: obj, interpretation: obj },
  },
  render_flower: {
    type: 'object',
    required: ['spec'],
    properties: { spec: obj, include_svg: { type: 'boolean' }, size: int },
  },
  list_flowers: { type: 'object', properties: { network: str, maker: str, limit: int } },
  get_flower: { type: 'object', required: ['id'], properties: { id: str } },
  prepare_publish: { type: 'object', required: ['entry'], properties: { entry: obj } },
  publish_flower: {
    type: 'object',
    required: ['entry_sha256', 'proof'],
    properties: { entry_sha256: sha, proof: obj },
  },
  quote_payment: {
    type: 'object',
    required: ['purpose'],
    properties: {
      purpose: { enum: ['sponsor_refresh', 'sponsor_coverage'] },
      amount_usd: { type: 'number' },
      origin_asset: str,
      network: str,
    },
  },
  get_labels: { type: 'object', properties: { caip2: str } },
  // a tool the CLI has no short name for: it becomes `count-signers`
  count_signers: { type: 'object', required: ['dao'], properties: { dao: str } },
};

const hash = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const err = (code: string, message: string, hint?: string) => ({
  error: { code, message, ...(hint ? { hint } : {}) },
});

function spec(i: Input) {
  const choices = (i.choices ?? {}) as Input;
  return {
    petal: 'spec/v1',
    convention: 'default/v1',
    network: { id: i.network, params: i.params ?? {} },
    snapshot: { sha256: i.sha256 },
    selection: {
      measure: choices.measure ?? MEASURE,
      petals: choices.petals ?? 60,
      tail: { group: 'rest', label: 'everyone else' },
    },
    encodings: { segments: { by: choices.segments ?? 'none' } },
  };
}

const outputs: Record<string, (i: Input) => unknown> = {
  list_networks: (i) => ({
    networks: [{ id: 'near-validators' }, { id: 'near-house-of-stake' }].filter(
      (n) => !i.query || n.id.includes(String(i.query)),
    ),
    cannot_read_hint: 'Petal reads NEAR validators and House of Stake.',
  }),
  get_network: (i) =>
    i.id === 'near-validators'
      ? { network: { id: i.id }, mapped: [{ sha256: SHA, where: 'fixture' }] }
      : err('not_found', `no network ${i.id}`, 'Try near-validators.'),
  get_snapshot: (i) =>
    i.network === 'near-validators'
      ? {
          sha256: SHA,
          reused: true,
          where: 'fixture',
          network: { id: i.network },
          snapshot: { as_of: '2026-11-03T19:42:00Z', block_height: 222915356, final: true },
          counts: { participants: 371, holdings: 371, relationships: 0, events: 0 },
          body_url: `http://localhost:8787/api/v1/snapshots/${SHA}`,
        }
      : err('cannot_read', `Petal can't read ${i.network} yet`, 'It can read near-validators.'),
  describe_snapshot: (i) =>
    i.sha256 === SHA
      ? { measures: [{ id: MEASURE, unit: 'NEAR', total: '1' }], top: [], top_n: i.top ?? 10 }
      : err('not_found', `no snapshot ${i.sha256}`),
  compute_figures: (i) => ({
    measure: i.measure,
    unit: 'NEAR',
    petals: i.petals ?? 60,
    nakamoto: { threshold: i.nakamoto_threshold ?? 0.333333, count: 9 },
    top_k: i.top_k ?? [1, 5, 10, 100],
    figure_ids: ['fig:total', 'fig:nakamoto'],
  }),
  compare_figures: (i) => ({ measure: i.measure, a: { sha256: i.a }, b: { sha256: i.b } }),
  propose_spec: (i) => {
    const s = spec(i);
    const changed = Object.keys((i.choices ?? {}) as Input);
    return { spec: s, spec_sha256: hash(s), defaults_applied: [], changed_from_default: changed };
  },
  validate_spec: (i) => ({
    valid: (i.spec as Input)?.petal === 'spec/v1',
    errors: [],
    warnings: [],
  }),
  render_flower: (i) => ({
    spec_sha256: hash(i.spec),
    render_sha256: hash(['render', i.spec, i.size ?? 800]),
    ...(i.include_svg ? { svg: SVG } : {}),
    legend: [
      { primitive: 'width', meaning: 'share of stake', sources: ['fastnear-rpc-validators'] },
    ],
    petals: [],
    view_url: `http://localhost:3000/draft?spec=${hash(i.spec).slice(0, 8)}`,
  }),
  list_flowers: (i) => ({ flowers: [], network: i.network ?? null }),
  get_flower: (i) => err('not_found', `no flower ${i.id}`),
  prepare_publish: (i) => ({
    entry_sha256: hash(i.entry),
    nonce: 'n',
    message: 'm',
    sign_url: 'http://localhost:3000/publish/x',
  }),
  publish_flower: () => err('unauthorised', 'bad proof'),
  quote_payment: (i) => ({ dry: true, purpose: i.purpose, amount_usd: i.amount_usd ?? 1 }),
  get_labels: () => {
    throw new NotImplementedError('get_labels (W4, Phase B)');
  },
  count_signers: (i) => ({ dao: i.dao, signers: 3 }),
};

export function fakeRegistry(calls: Call[] = []): AnyTool[] {
  return Object.entries(schemas).map(([name, input]) => {
    const tool = {
      name,
      input,
      output: name === 'render_flower' ? { type: 'object', properties: { svg: str } } : obj,
      run: async (i: Input) => {
        calls.push({ name, input: structuredClone(i) });
        const out = (outputs[name] as (i: Input) => unknown)(i);
        return typeof out === 'object' && out !== null && !('error' in out)
          ? { ...out, tools_version: TOOLS_VERSION }
          : out;
      },
    };
    return tool as unknown as AnyTool;
  });
}

export interface Ran {
  code: number;
  stdout: string;
  stderr: string;
  /** stdout parsed as JSON (undefined when it isn't) */
  json: unknown;
  calls: Call[];
  configs: Config[];
  files: Record<string, string>;
}

/** Runs the CLI against the fake registry, with no process, network or disk. */
export async function run(
  argv: string[],
  opts: { stdin?: string; files?: Record<string, string>; deps?: Partial<CliDeps> } = {},
): Promise<Ran> {
  const calls: Call[] = [];
  const configs: Config[] = [];
  const files: Record<string, string> = { ...opts.files };
  let stdout = '';
  let stderr = '';
  const { main } = await import('../src/main.ts');
  const code = await main(argv, {
    registry: fakeRegistry(calls),
    createContext: (cfg) => {
      configs.push(cfg);
      return { config: cfg } as unknown as ToolContext;
    },
    serveStdio: async () => {},
    env: {},
    cwd: '/work',
    root: '/repo',
    stdout: (t) => {
      stdout += t;
    },
    stderr: (t) => {
      stderr += t;
    },
    readStdin: async () => opts.stdin ?? '',
    readFile: (p) => {
      const f = files[p];
      if (f === undefined) throw new Error(`ENOENT: ${p}`);
      return f;
    },
    writeFile: (p, d) => {
      files[p] = d;
    },
    ...opts.deps,
  });
  let json: unknown;
  try {
    json = JSON.parse(stdout);
  } catch {
    json = undefined;
  }
  return { code, stdout, stderr, json, calls, configs, files };
}

/** What a tool answers when called directly, without the CLI. */
export async function direct(name: string, input: Input): Promise<unknown> {
  const tool = fakeRegistry().find((t) => t.name === name);
  if (!tool) throw new Error(`no fake tool ${name}`);
  return tool.run(input as never, {} as ToolContext);
}
