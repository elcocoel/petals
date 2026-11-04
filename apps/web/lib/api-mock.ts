// The API mock (T062): the routes of contracts/http-api.md, served from fixtures, until petalApp
// (W5, T058) lands. Server only. lib/server-app.ts picks it (PETAL_API_MOCK=1, or petalApp not
// built yet). Everything here is a stand-in; nothing is counted or drawn for real:
//   - tool answers are canned (lib/mock/near-validators.json, from the NEAR validators fixture);
//   - the SVG is a placeholder until @petal/core's renderFlower is built (then the mock uses it);
//   - the chat replays fixtures/transcripts/skeleton.hand.json through recordedClient;
//   - publishing checks the NEP-413 signature only (no view_access_key) and writes to fakeMap();
//   - the quote replays the recorded 1Click dry quote (fakeQuote).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { type LlmMessage, loadTranscript, recordedClient } from '@petal/agent';
import {
  API_VERSION,
  canonicalJson,
  entryId,
  renderFlower,
  sha256Hex,
  specHash,
  TOOLS_VERSION,
} from '@petal/core';
import type {
  AgentEvent,
  ChatInput,
  ChatMessage,
  Entry,
  Figures,
  FlowerResult,
  Interpretation,
  LegendItem,
  Nep413Proof,
  PetalDetail,
  QuoteRequest,
  QuoteResult,
  RenderResult,
  Run,
  Snapshot,
  SnapshotResult,
  Spec,
  Stage,
  ToolError,
  ToolErrorCode,
  Validation,
} from '@petal/core/types';
import { signatureMatches } from '@petal/near/auth/testing';
import { fakeMap } from '@petal/near/map';
import { fakeQuote } from '@petal/near/pay';
import { type Context, Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { repoRoot } from './config.ts';
import { draftUrl } from './draft.ts';
import raw from './mock/near-validators.json' with { type: 'json' };
import { type EntryDraft, explorerTxUrl, publishMessage } from './publish.ts';

interface MockData {
  snapshot: SnapshotResult & { tools_version: string };
  describe: { tools_version: string } & Record<string, unknown>;
  figures: Figures & { tools_version: string };
  spec: Spec;
  legend: LegendItem[];
  petals: PetalDetail[];
  placeholder_svg: string;
}
const data = raw as unknown as MockData;
const SHA = data.snapshot.sha256;
const MEASURE = data.figures.measure;

type Json = Record<string, unknown>;
/** A tool's answer: its output object, or a ToolError. */
type Out = object;

const STATUS: Record<ToolErrorCode, number> = {
  bad_input: 400,
  unauthorised: 401,
  not_found: 404,
  cannot_read: 422,
  invalid_spec: 422,
  rate_limited: 429,
  budget_exhausted: 429,
  source_failed: 502,
  internal: 500,
};

const fail = (code: ToolErrorCode, message: string, hint?: string): ToolError => ({
  error: hint ? { code, message, hint } : { code, message },
});
const isError = (x: unknown): x is ToolError =>
  !!x && typeof x === 'object' && 'error' in x && !!(x as ToolError).error?.code;
const v = <T extends object>(x: T) => ({ ...x, tools_version: TOOLS_VERSION });

function reply(c: Context, out: Out) {
  if (isError(out)) return c.json(out, STATUS[out.error.code] as ContentfulStatusCode);
  return c.json(out);
}

async function body(c: Context): Promise<Json | null> {
  try {
    const b = await c.req.json();
    return b && typeof b === 'object' && !Array.isArray(b) ? (b as Json) : null;
  } catch {
    return null;
  }
}

const randomBytes = (n: number) => crypto.getRandomValues(new Uint8Array(n));
const base64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------------------------
// The renderer: the real one once W1 builds it, the placeholder until then.

let snapshotBody: Promise<Snapshot> | undefined;
let rendererNoted = false;

async function render(spec: Spec, root: string): Promise<RenderResult> {
  if (spec.snapshot?.sha256 === SHA) {
    try {
      snapshotBody ??= Promise.resolve().then(
        () =>
          JSON.parse(
            gunzipSync(readFileSync(join(root, `fixtures/snapshots/${SHA}.json.gz`))).toString(
              'utf8',
            ),
          ) as Snapshot,
      );
      return renderFlower(spec, await snapshotBody);
    } catch (e) {
      const stub = (e as { code?: string }).code === 'not_implemented';
      if (!stub && !rendererNoted)
        console.warn('api mock: renderFlower failed, using the placeholder:', e);
      rendererNoted = true;
    }
  }
  const svg = data.placeholder_svg;
  return { svg, legend: data.legend, petals: data.petals, render_sha256: sha256Hex(svg) };
}

// ---------------------------------------------------------------------------------------------
// Canned tools, by tools.md name. The chat replay and the HTTP routes share them.

const NETWORK = {
  id: data.snapshot.network.id,
  chain: data.snapshot.network.chain,
  population: data.snapshot.network.population,
  kind: 'chain',
  title: data.snapshot.network.title,
  description: data.snapshot.network.description,
  params: {},
  capabilities: {
    measures: [{ id: MEASURE, unit: 'NEAR', label: 'stake in the current epoch' }],
    by: {
      width: ['share', 'equal'],
      height: ['share', 'equal'],
      colour: ['kind', 'identity', 'single'],
      outline: ['identity_status'],
      segments: ['backers'],
      order: ['measure_desc'],
    },
    segments: ['backers'],
    relationships: ['delegates_to', 'owned_by'],
    defaults: { segments: 'backers' },
    meanings: {},
  },
  live: false,
  cost: { calls: 0, seconds: 0, note: 'stored fixture (API mock)' },
  sources: data.snapshot.sources.map(({ id, kind, url }) => ({ id, kind, url })),
};
const CANNOT_READ_HINT =
  'The API mock reads only near-validators (the stored fixture). The real API adds near-house-of-stake.';

function makeTools(root: string): Record<string, (a: Json) => Promise<Out>> {
  const sha = (a: Json) => (typeof a.sha256 === 'string' ? a.sha256 : '');
  return {
    async get_snapshot(a) {
      if (a.network !== NETWORK.id) {
        return fail(
          'cannot_read',
          `the API mock can't read ${String(a.network)}`,
          CANNOT_READ_HINT,
        );
      }
      return data.snapshot;
    },
    async describe_snapshot(a) {
      return sha(a) === SHA ? data.describe : fail('not_found', `no snapshot ${sha(a)}`);
    },
    async compute_figures(a) {
      if (sha(a) !== SHA) return fail('not_found', `no snapshot ${sha(a)}`);
      if ((a.measure ?? MEASURE) !== MEASURE || (a.petals ?? 60) !== 60) {
        return fail(
          'bad_input',
          'the API mock has canned figures only',
          `measure ${MEASURE}, petals 60`,
        );
      }
      return data.figures;
    },
    async propose_spec(a) {
      if (a.network !== NETWORK.id || sha(a) !== SHA) {
        return fail('not_found', 'the API mock proposes only for the near-validators fixture');
      }
      return v({
        spec: data.spec,
        spec_sha256: specHash(data.spec),
        defaults_applied: ['width', 'height', 'colour', 'outline', 'order', 'selection'],
        changed_from_default: [],
      });
    },
    async validate_spec(a) {
      const spec = a.spec as Partial<Spec> | undefined;
      if (spec?.petal !== 'spec/v1') {
        return v({
          valid: false,
          errors: [{ path: '', rule: 'schema', message: 'not a spec/v1 document' }],
          warnings: [],
        });
      }
      return v({
        valid: true,
        errors: [],
        warnings: [
          {
            path: '',
            rule: 'mock',
            message: 'API mock: the spec was not checked (validateSpec, W1)',
          },
        ],
      });
    },
    async render_flower(a) {
      const spec = a.spec as Spec | undefined;
      if (spec?.petal !== 'spec/v1') return fail('invalid_spec', 'not a spec/v1 document');
      const r = await render(spec, root);
      return v({
        spec_sha256: specHash(spec),
        render_sha256: r.render_sha256,
        ...(a.include_svg === false ? {} : { svg: r.svg }),
        legend: r.legend,
        petals: r.petals,
        view_url: draftUrl(spec),
      });
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Runs: the chat replays the skeleton transcript; every chat is a stored run (in memory here).

interface MockRun extends Run {
  wake: Set<() => void>;
}

const STAGE: Record<string, { stage: Stage; message: string }> = {
  get_snapshot: { stage: 'reading_map', message: 'Looking for a stored snapshot' },
  describe_snapshot: { stage: 'counting', message: 'Reading what the snapshot holds' },
  compute_figures: { stage: 'counting', message: 'Counting stake' },
  propose_spec: { stage: 'proposing', message: 'Choosing the mapping' },
  validate_spec: { stage: 'validating', message: 'Checking the spec and the interpretation' },
  render_flower: { stage: 'drawing', message: 'Drawing the flower' },
};

function summary(name: string, out: Out): string {
  if (isError(out)) return `${out.error.code}: ${out.error.message}`;
  const o = out as Json;
  switch (name) {
    case 'get_snapshot': {
      const s = o as unknown as SnapshotResult;
      return `snapshot ${s.sha256.slice(0, 12)}…, block ${s.snapshot.block_height}, reused: ${s.reused} (${s.where})`;
    }
    case 'compute_figures': {
      const f = o as unknown as Figures;
      return `${f.participants_included} validators; Nakamoto ${f.nakamoto.count}; top 10 hold ${(f.top_k_share['10'] * 100).toFixed(1)}%`;
    }
    case 'describe_snapshot':
      return 'measures, kinds, segment options and the top 10';
    case 'propose_spec':
      return `spec ${String(o.spec_sha256).slice(0, 12)}…`;
    case 'validate_spec':
      return `valid: ${String(o.valid)}`;
    case 'render_flower':
      return `render ${String(o.render_sha256).slice(0, 12)}…`;
    default:
      return 'ok';
  }
}

function emit(run: MockRun, e: AgentEvent): void {
  run.events.push(e);
  run.updated_at = new Date().toISOString();
  for (const w of run.wake) w();
  run.wake.clear();
}

function newRun(input: ChatInput): MockRun {
  const now = new Date().toISOString();
  return {
    run_id: `run_${hex(randomBytes(8))}`,
    status: 'running',
    messages: [...input.messages],
    events: [],
    created_at: now,
    updated_at: now,
    wake: new Set(),
  };
}

async function produce(
  run: MockRun,
  question: string,
  deps: { root: string; tools: ReturnType<typeof makeTools>; delayMs: number },
): Promise<void> {
  const transcriptFile = join(deps.root, 'fixtures/transcripts/skeleton.hand.json');
  const pause = () => (deps.delayMs ? sleep(deps.delayMs) : Promise.resolve());
  try {
    emit(run, {
      event: 'run',
      data: { run_id: run.run_id, resume_url: `/make?run=${run.run_id}` },
    });
    const t = loadTranscript(transcriptFile);
    const llm = recordedClient(transcriptFile);
    if (question.trim().toLowerCase() !== t.question.toLowerCase()) {
      emit(run, {
        event: 'message',
        data: {
          text: `API mock: this replays the recorded run for "${t.question}", whatever the question.`,
        },
      });
    }
    emit(run, { event: 'stage', data: { stage: 'thinking', message: 'Reading the question' } });
    const messages: LlmMessage[] = [{ role: 'user', content: t.question }];
    let spec: Spec | undefined;
    let interpretation: Interpretation | undefined;
    let validation: Validation | undefined;
    let rendered: Json | undefined;
    let lastStage: Stage = 'thinking';
    for (let turn = 0; turn < 12; turn++) {
      await pause();
      const r = await llm.complete({ messages });
      messages.push(r.message);
      const calls = r.message.tool_calls ?? [];
      if (!calls.length) {
        const text = r.message.content ?? '';
        emit(run, { event: 'message', data: { text } });
        run.messages.push({ role: 'assistant', content: text });
        if (spec && interpretation && rendered) {
          const flower: FlowerResult = {
            spec,
            spec_sha256: specHash(spec),
            render_sha256: String(rendered.render_sha256),
            view_url: String(rendered.view_url),
            legend: rendered.legend as LegendItem[],
            interpretation,
            validation: validation ?? { valid: false, errors: [], warnings: [] },
          };
          run.flower = flower;
          emit(run, { event: 'flower', data: flower });
        }
        // A recorded run has no model signature, so no `signature` event.
        run.status = 'done';
        emit(run, {
          event: 'done',
          data: {
            turns: turn + 1,
            model: llm.model,
            fallback_used: false,
            tokens: { in: 0, out: 0 },
            cost_usd: 0,
          },
        });
        return;
      }
      for (const call of calls) {
        const args = JSON.parse(call.arguments) as Json;
        const stage = STAGE[call.name];
        if (stage && stage.stage !== lastStage) {
          emit(run, { event: 'stage', data: stage });
          lastStage = stage.stage;
        }
        emit(run, { event: 'tool_call', data: { id: call.id, name: call.name, args } });
        const started = Date.now();
        await pause();
        const tool = deps.tools[call.name];
        const out = tool ? await tool(args) : fail('not_found', `no tool ${call.name}`);
        emit(run, {
          event: 'tool_result',
          data: {
            id: call.id,
            name: call.name,
            ok: !isError(out),
            summary: summary(call.name, out),
            ms: Date.now() - started,
          },
        });
        if (!isError(out)) {
          if (call.name === 'propose_spec') spec = (out as { spec: Spec }).spec;
          if (call.name === 'validate_spec') {
            validation = out as unknown as Validation;
            interpretation = args.interpretation as Interpretation | undefined;
          }
          if (call.name === 'render_flower') rendered = out as Json;
        }
        // The model sees the tool's answer, minus the SVG (agents never read raw bodies).
        const { svg: _svg, ...seen } = out as Json;
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(seen) });
      }
    }
    throw new Error('the transcript never answered');
  } catch (e) {
    run.status = 'failed';
    emit(run, {
      event: 'error',
      data: { code: 'internal', message: e instanceof Error ? e.message : String(e) },
    });
  }
}

async function* follow(run: MockRun, signal?: AbortSignal): AsyncGenerator<AgentEvent> {
  let i = 0;
  for (;;) {
    while (i < run.events.length) {
      const e = run.events[i++];
      if (e && e.event !== 'heartbeat') yield e;
    }
    if (run.status !== 'running' || signal?.aborted) return;
    await new Promise<void>((resolve) => run.wake.add(resolve));
  }
}

const publicRun = ({ wake: _wake, ...run }: MockRun): Run => run;

// ---------------------------------------------------------------------------------------------
// Flowers: the mock's own fixture flower (the skeleton run as an entry), hero entries in
// fixtures/map/ if any, and whatever was published to the fake map.

interface Prepared {
  entry: EntryDraft;
  nonce: string;
  recipient: string;
  message: string;
  expires_at: string;
  used: boolean;
}

interface FixtureFlower {
  entry: Entry;
}

function heroEntries(root: string): FixtureFlower[] {
  const dir = join(root, 'fixtures/map');
  let files: string[] = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }
  return files.flatMap((f) => {
    try {
      const e = JSON.parse(readFileSync(join(dir, f), 'utf8')) as Entry;
      return e.petal === 'flower/v1' && e.id ? [{ entry: e }] : [];
    } catch {
      return [];
    }
  });
}

async function skeletonEntry(deps: Parameters<typeof produce>[2]): Promise<Entry> {
  const run = newRun({ messages: [] });
  const question = loadTranscript(
    join(deps.root, 'fixtures/transcripts/skeleton.hand.json'),
  ).question;
  await produce(run, question, { ...deps, delayMs: 0 });
  const f = run.flower;
  if (!f) throw new Error('api mock: the skeleton replay made no flower');
  const draft: Omit<Entry, 'id'> = {
    petal: 'flower/v1',
    title: 'Who stands behind NEAR’s validators? (API mock)',
    spec: f.spec,
    spec_sha256: f.spec_sha256,
    interpretation: f.interpretation,
    snapshot: { sha256: f.spec.snapshot.sha256, urls: [`/api/v1/snapshots/${SHA}`] },
    render_sha256: f.render_sha256,
    provenance: {
      maker: null,
      agent: { kind: 'petal-agent', model: 'recorded', signature: null },
      tools_version: TOOLS_VERSION,
      created_at: f.spec.snapshot.as_of,
    },
  };
  return { ...draft, id: entryId(draft) };
}

const SPEC_PREFIX = 'petal/v1/spec/';
const isoTime = (t: number) => new Date(t > 1e14 ? Math.floor(t / 1e6) : t).toISOString();

// ---------------------------------------------------------------------------------------------

export interface MockOptions {
  /** repo root; default: found upward from the cwd */
  root?: string;
  /** pause between chat events, so the page shows progress (default 300 ms; tests use 0) */
  delayMs?: number;
  /** nonce lifetime (default 5 min) */
  nonceTtlMs?: number;
  now?: () => Date;
}

export interface MockApi {
  app: Hono;
  map: ReturnType<typeof fakeMap>;
}

export function createMockApi(opts: MockOptions = {}): MockApi {
  const root = opts.root ?? repoRoot();
  const now = opts.now ?? (() => new Date());
  const delayMs = opts.delayMs ?? 300;
  const ttl = opts.nonceTtlMs ?? 5 * 60_000;
  const tools = makeTools(root);
  const map = fakeMap();
  const drafts = new Map<string, Prepared>();
  const runs = new Map<string, MockRun>();
  let fixtures: Promise<FixtureFlower[]> | undefined;
  const fixtureFlowers = () => {
    fixtures ??= skeletonEntry({ root, tools, delayMs: 0 }).then((entry) => [
      { entry },
      ...heroEntries(root),
    ]);
    return fixtures;
  };
  const quote = fakeQuote(join(root, 'fixtures/transcripts/1click-dry-quote.json'));

  const app = new Hono();
  app.use('*', cors());
  app.use('*', async (c, next) => {
    c.header('x-petal-api', 'mock');
    await next();
  });

  const api = new Hono();
  const tool = (name: string) => async (c: Context) => {
    const b = await body(c);
    if (!b) return reply(c, fail('bad_input', 'the body must be a JSON object'));
    const run = tools[name];
    return reply(c, run ? await run(b) : fail('internal', `no tool ${name}`));
  };

  api.get('/health', (c) =>
    c.json({
      ok: true,
      map: 'mirror',
      llm: 'recorded',
      version: API_VERSION,
      mock: true,
      tools_version: TOOLS_VERSION,
    }),
  );

  api.get('/networks', (c) => {
    const q = (c.req.query('query') ?? '').toLowerCase();
    const hit = !q || `${NETWORK.id} ${NETWORK.title}`.toLowerCase().includes(q);
    return c.json(v({ networks: hit ? [NETWORK] : [], cannot_read_hint: CANNOT_READ_HINT }));
  });
  api.get('/networks/:id', (c) => {
    if (c.req.param('id') !== NETWORK.id) {
      return reply(c, fail('not_found', `no network ${c.req.param('id')}`, CANNOT_READ_HINT));
    }
    const s = data.snapshot;
    return c.json(
      v({
        network: NETWORK,
        mapped: [
          {
            sha256: s.sha256,
            as_of: s.snapshot.as_of,
            block_height: s.snapshot.block_height,
            final: s.snapshot.final,
            where: 'fixture',
          },
        ],
      }),
    );
  });

  api.post('/snapshots', tool('get_snapshot'));
  api.get('/snapshots/:sha256', (c) => {
    if (c.req.param('sha256') !== SHA) return reply(c, fail('not_found', 'no such snapshot'));
    const gz = readFileSync(join(root, `fixtures/snapshots/${SHA}.json.gz`));
    return c.body(new Uint8Array(gz), 200, {
      'content-type': 'application/json',
      'content-encoding': 'gzip',
      'cache-control': 'public, max-age=31536000, immutable',
    });
  });
  api.get('/snapshots/:sha256/describe', async (c) =>
    reply(c, await tools.describe_snapshot({ sha256: c.req.param('sha256') })),
  );
  api.post('/figures', tool('compute_figures'));
  api.post('/specs/propose', tool('propose_spec'));
  api.post('/specs/validate', tool('validate_spec'));
  api.post('/render', async (c) => {
    const b = await body(c);
    if (!b) return reply(c, fail('bad_input', 'the body must be a JSON object'));
    const out = await tools.render_flower({ ...b, include_svg: true });
    if (c.req.query('format') === 'svg' && !isError(out)) {
      return c.body(String((out as Json).svg), 200, { 'content-type': 'image/svg+xml' });
    }
    return reply(c, out);
  });

  // Flowers
  const mapFlowers = async () =>
    (await map.latest(SPEC_PREFIX, { writers: [map.writer] })).map((row) => ({
      row,
      entry: row.value as Entry,
    }));
  const findFlower = async (id: string) => {
    const row = await map.get(`${SPEC_PREFIX}${id}`, map.writer);
    if (row) return { entry: row.value as Entry, where: 'map' as const, tx_hash: row.tx_hash };
    const f = (await fixtureFlowers()).find((x) => x.entry.id === id);
    return f ? { entry: f.entry, where: 'fixture' as const } : null;
  };

  api.get('/flowers', async (c) => {
    const network = c.req.query('network');
    const maker = c.req.query('maker');
    const limit = Math.max(1, Math.min(200, Number(c.req.query('limit') ?? 50) || 50));
    const onMap = (await mapFlowers())
      .sort((a, b) => b.row.block_height - a.row.block_height)
      .map(({ row, entry }) => ({
        id: entry.id,
        title: entry.title ?? null,
        network: entry.spec.network.id,
        as_of: entry.spec.snapshot.as_of,
        maker: entry.provenance.maker?.account_id ?? null,
        published_at: isoTime(row.block_timestamp),
        where: 'map' as const,
        tx_hash: row.tx_hash,
      }));
    const fixed = (await fixtureFlowers()).map(({ entry }) => ({
      id: entry.id,
      title: entry.title ?? null,
      network: entry.spec.network.id,
      as_of: entry.spec.snapshot.as_of,
      maker: entry.provenance.maker?.account_id ?? null,
      published_at: null,
      where: 'fixture' as const,
    }));
    const flowers = [...onMap, ...fixed]
      .filter((f) => !network || f.network === network)
      .filter((f) => !maker || f.maker === maker)
      .slice(0, limit);
    return c.json(v({ flowers }));
  });

  api.get('/flowers/:id', async (c) => {
    const found = await findFlower(c.req.param('id'));
    if (!found) return reply(c, fail('not_found', `no flower ${c.req.param('id')}`));
    const { entry } = found;
    const maker = entry.provenance.maker;
    const { id: _id, ...withoutId } = entry;
    const { maker: _m, ...prov } = entry.provenance;
    const entrySha = sha256Hex(canonicalJson({ ...withoutId, provenance: prov }));
    return c.json(
      v({
        ...found,
        verified: {
          entry_hash: entryId(withoutId) === entry.id,
          maker_signature: maker
            ? maker.message === publishMessage(entrySha) &&
              signatureMatches(maker, { message: maker.message, recipient: maker.recipient })
            : false,
          model_signature: entry.provenance.agent.signature ? 'present' : 'absent',
        },
        corrections: [],
      }),
    );
  });

  api.get('/flowers/:id/svg', async (c) => {
    const found = await findFlower(c.req.param('id'));
    if (!found) return reply(c, fail('not_found', `no flower ${c.req.param('id')}`));
    const r = await render(found.entry.spec, root);
    return c.body(r.svg, 200, { 'content-type': 'image/svg+xml' });
  });

  // Publish (relayed, shared-map.md): prepare issues a nonce; publish checks it and the proof.
  api.post('/publish/prepare', async (c) => {
    const b = await body(c);
    const entry = b?.entry as (EntryDraft & { id?: string }) | undefined;
    if (
      entry?.petal !== 'flower/v1' ||
      entry.spec?.petal !== 'spec/v1' ||
      !entry.interpretation ||
      !entry.provenance
    ) {
      return reply(c, fail('bad_input', 'entry must be a flower/v1 entry without id and maker'));
    }
    const { id: _id, ...rest } = entry;
    const { maker: _maker, ...provenance } = rest.provenance as EntryDraft['provenance'] & {
      maker?: unknown;
    };
    const clean: EntryDraft = { ...rest, provenance };
    const entry_sha256 = sha256Hex(canonicalJson(clean));
    const nonce = base64(randomBytes(32));
    const expires_at = new Date(now().getTime() + ttl).toISOString();
    const recipient = map.receiver;
    const message = publishMessage(entry_sha256);
    drafts.set(entry_sha256, { entry: clean, nonce, recipient, message, expires_at, used: false });
    const sign_url = `/publish/${entry_sha256}?${new URLSearchParams({ nonce, recipient, expires_at })}`;
    return c.json(v({ entry_sha256, nonce, recipient, message, expires_at, sign_url }));
  });

  api.post('/publish', async (c) => {
    const b = await body(c);
    const entrySha = typeof b?.entry_sha256 === 'string' ? b.entry_sha256 : '';
    const proof = b?.proof as Nep413Proof | undefined;
    const draft = drafts.get(entrySha);
    if (!draft) return reply(c, fail('not_found', 'no prepared entry with that entry_sha256'));
    if (proof?.type !== 'nep413' || !proof.account_id) {
      return reply(c, fail('bad_input', 'proof must be a NEP-413 proof'));
    }
    const bad = (why: string) => reply(c, fail('unauthorised', why, 'call prepare_publish again'));
    if (draft.used) return bad('this nonce was already used');
    if (now().toISOString() > draft.expires_at) return bad('the nonce expired');
    if (proof.nonce !== draft.nonce) return bad('the proof signs another nonce');
    if (proof.message !== draft.message || proof.recipient !== draft.recipient) {
      return bad('the proof signs another message or recipient');
    }
    if (!signatureMatches(proof, { message: draft.message, recipient: draft.recipient })) {
      return bad('the signature does not match');
    }
    // Mock: no view_access_key check (the real publish_flower requires a full-access key).
    draft.used = true;
    const final: Omit<Entry, 'id'> = {
      ...draft.entry,
      provenance: { ...draft.entry.provenance, maker: proof },
    };
    const id = entryId(final);
    const key = `${SPEC_PREFIX}${id}`;
    const { tx_hash } = await map.write({ [key]: { ...final, id } });
    return c.json(
      v({
        id,
        key,
        receiver: map.receiver,
        writer: map.writer,
        tx_hash,
        explorer_url: explorerTxUrl(tx_hash),
        gallery_url: `/f/${id}`,
      }),
    );
  });

  api.post('/quote', async (c) => {
    const b = (await body(c)) as Partial<QuoteRequest> | null;
    if (!b || (b.purpose !== 'sponsor_refresh' && b.purpose !== 'sponsor_coverage')) {
      return reply(c, fail('bad_input', 'purpose must be sponsor_refresh or sponsor_coverage'));
    }
    try {
      const q: QuoteResult = await quote(b as QuoteRequest);
      return c.json(v(q));
    } catch (e) {
      return reply(c, fail('bad_input', e instanceof Error ? e.message : String(e)));
    }
  });

  // Agent routes
  api.post('/agent/chat', async (c) => {
    const b = (await body(c)) as Partial<ChatInput> | null;
    const msgs = Array.isArray(b?.messages) ? (b.messages as ChatMessage[]) : [];
    const last = [...msgs].reverse().find((m) => m?.role === 'user');
    if (!last || typeof last.content !== 'string') {
      return reply(c, fail('bad_input', 'messages must end with a user message'));
    }
    const run = newRun({ messages: msgs });
    runs.set(run.run_id, run);
    // The run goes on if the browser leaves (http-api.md, Runs you can leave and come back to).
    void produce(run, last.content, { root, tools, delayMs });
    return streamSSE(c, async (stream) => {
      for await (const e of follow(run, c.req.raw.signal)) {
        await stream.writeSSE({ event: e.event, data: JSON.stringify(e.data) });
      }
    });
  });

  api.get('/agent/runs/:id', async (c) => {
    const run = runs.get(c.req.param('id'));
    if (!run) return reply(c, fail('not_found', `no run ${c.req.param('id')}`));
    if ((c.req.header('accept') ?? '').includes('text/event-stream')) {
      return streamSSE(c, async (stream) => {
        for await (const e of follow(run, c.req.raw.signal)) {
          await stream.writeSSE({ event: e.event, data: JSON.stringify(e.data) });
        }
      });
    }
    return c.json(publicRun(run));
  });

  api.get('/attestations/:sha256', (c) =>
    reply(c, fail('not_found', 'the API mock stores no attestation reports (recorded runs only)')),
  );

  api.all('*', (c) => reply(c, fail('not_found', `the API mock has no route ${c.req.path}`)));
  app.route('/api/v1', api);
  return { app, map };
}
