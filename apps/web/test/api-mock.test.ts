// The API mock answers the routes of contracts/http-api.md the way the web app expects, so the
// pages can be built before petalApp lands: gallery, flower, chat SSE, runs, publish, quote.
import { mkdirSync, mkdtempSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { schemas } from '@petal/core';
import type { AgentEvent, Entry, Nep413Proof, Run } from '@petal/core/types';
import { testSigner } from '@petal/near/auth/testing';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';
import { describe, expect, test } from 'vitest';
import { createMockApi } from '../lib/api-mock.ts';
import { repoRoot } from '../lib/config.ts';
import { entryDraftFromRun } from '../lib/entry.ts';
import { type Prepared, proofFrom, publishMessage } from '../lib/publish.ts';
import { readSse } from '../lib/sse.ts';

const addFormats = addFormatsModule as unknown as (a: Ajv2020) => Ajv2020;
const ajv = addFormats(new Ajv2020({ strict: false, allErrors: true }));
const validEntry = ajv.compile(schemas.entry);
const validSpec = ajv.compile(schemas.spec);
const validInterpretation = ajv.compile(schemas.interpretation);

const QUESTION = "who stands behind NEAR's validators?";

/** A repo root with the real snapshots and transcripts, and no hero entries. */
function cleanRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'petal-mock-'));
  mkdirSync(join(root, 'fixtures'));
  for (const d of ['snapshots', 'transcripts'])
    symlinkSync(join(repoRoot(), 'fixtures', d), join(root, 'fixtures', d), 'dir');
  return root;
}

function mock(opts: Parameters<typeof createMockApi>[0] = {}) {
  const { app, map } = createMockApi({ delayMs: 0, ...opts });
  const call = async <T = Record<string, unknown>>(path: string, body?: unknown) => {
    const res = await app.request(path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, json: (await res.json()) as T, headers: res.headers };
  };
  const chat = async (content = QUESTION) => {
    const res = await app.request('/api/v1/agent/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
      body: JSON.stringify({ messages: [{ role: 'user', content }] }),
    });
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const events: AgentEvent[] = [];
    if (!res.body) throw new Error('no body');
    for await (const m of readSse(res.body)) {
      events.push({ event: m.event, data: JSON.parse(m.data) } as AgentEvent);
    }
    return events;
  };
  return { app, map, call, chat };
}

const ofKind = <K extends AgentEvent['event']>(events: AgentEvent[], k: K) =>
  events.filter((e): e is Extract<AgentEvent, { event: K }> => e.event === k);

describe('API mock: reading', () => {
  test('health says it is the mock', async () => {
    const { call } = mock();
    const { json, headers } = await call('/api/v1/health');
    expect(json).toMatchObject({
      ok: true,
      mock: true,
      llm: 'recorded',
      tools_version: 'tools/v1',
    });
    expect(headers.get('x-petal-api')).toBe('mock');
  });

  test('hero entries in fixtures/map/ are listed too, as fixtures', async () => {
    const { call } = mock();
    const list = await call<{ flowers: { id: string; where: string; title: string }[] }>(
      '/api/v1/flowers',
    );
    expect(list.json.flowers.length).toBeGreaterThan(1);
    expect(new Set(list.json.flowers.map((f) => f.where))).toEqual(new Set(['fixture']));
    expect(list.json.flowers.some((f) => !f.title.includes('(API mock)'))).toBe(true);
  });

  test('the gallery lists the fixture flower; get_flower verifies its hash', async () => {
    // a clean fixtures folder: only the mock's own flower, whatever hero entries the repo ships
    const { call } = mock({ root: cleanRoot() });
    const list = await call<{ flowers: { id: string; where: string }[] }>('/api/v1/flowers');
    expect(list.json.flowers).toHaveLength(1);
    expect(list.json.flowers[0]).toMatchObject({ where: 'fixture', network: 'near-validators' });
    const id = list.json.flowers[0]?.id ?? '';
    const got = await call<{ entry: Entry; verified: Record<string, unknown> }>(
      `/api/v1/flowers/${id}`,
    );
    expect(got.json.verified).toEqual({
      entry_hash: true,
      maker_signature: false,
      model_signature: 'absent',
    });
    expect(validEntry(got.json.entry), JSON.stringify(validEntry.errors)).toBe(true);
    expect((await call('/api/v1/flowers/000000000000000000000000')).status).toBe(404);
  });

  test('render returns the real reading only when asked', async () => {
    const { call } = mock();
    const proposed = await call<{ spec: unknown }>('/api/v1/specs/propose', {
      network: 'near-validators',
      sha256: '72a6d9676d967d63712dc82bcbb90282d2f61e5ca6495c3e2e54a4f9af77e9ec',
      choices: { segments: 'backers' },
    });
    const plain = await call('/api/v1/render', { spec: proposed.json.spec });
    expect(plain.json).not.toHaveProperty('reading');
    const asked = await call<{ reading?: { title: string; petals: unknown[] } }>('/api/v1/render', {
      spec: proposed.json.spec,
      include_reading: true,
    });
    expect(asked.json.reading?.title).toEqual(expect.any(String));
    expect(asked.json.reading?.petals.length).toBeGreaterThan(0);
  });

  test('render returns the SVG with data-p, the legend and petal details', async () => {
    const { app, call } = mock();
    const proposed = await call<{ spec: unknown }>('/api/v1/specs/propose', {
      network: 'near-validators',
      sha256: '72a6d9676d967d63712dc82bcbb90282d2f61e5ca6495c3e2e54a4f9af77e9ec',
      choices: { segments: 'backers' },
    });
    expect(validSpec(proposed.json.spec), JSON.stringify(validSpec.errors)).toBe(true);
    const r = await call<{
      svg: string;
      legend: { primitive: string }[];
      petals: { id: string }[];
      view_url: string;
    }>('/api/v1/render', { spec: proposed.json.spec });
    expect(r.status).toBe(200);
    expect(r.json.svg).toMatch(/^<svg[^>]+xmlns="http:\/\/www.w3.org\/2000\/svg"/);
    for (const p of r.json.petals) expect(r.json.svg).toContain(`data-p="${p.id}"`);
    expect(r.json.legend.map((l) => l.primitive)).toEqual(
      expect.arrayContaining(['width', 'height', 'colour', 'outline', 'segments', 'order']),
    );
    expect(r.json.view_url).toMatch(/^\/draft\?spec=/);
    const svg = await app.request('/api/v1/render?format=svg', {
      method: 'POST',
      body: JSON.stringify({ spec: proposed.json.spec }),
    });
    expect(svg.headers.get('content-type')).toContain('image/svg+xml');
  });

  test('errors carry the contract codes and statuses', async () => {
    const { call } = mock();
    const cannot = await call<{ error: { code: string; hint?: string } }>('/api/v1/snapshots', {
      network: 'bitcoin-mining-pools',
    });
    expect(cannot.status).toBe(422);
    expect(cannot.json.error.code).toBe('cannot_read');
    expect(cannot.json.error.hint).toBeTruthy();
    expect((await call('/api/v1/figures', { sha256: 'nope', measure: 'x' })).status).toBe(404);
    expect((await call('/api/v1/render', { spec: { petal: 'nope' } })).status).toBe(422);
  });
});

describe('API mock: the chat', () => {
  test('streams the skeleton run in the contract order, run first and done last', async () => {
    const { chat } = mock();
    const events = await chat();
    const names = events.map((e) => e.event);
    expect(names[0]).toBe('run');
    expect(names.at(-1)).toBe('done');
    expect(names.indexOf('stage')).toBeLessThan(names.indexOf('tool_call'));
    expect(names.indexOf('flower')).toBeGreaterThan(names.lastIndexOf('tool_result'));
    expect(ofKind(events, 'tool_call').map((e) => e.data.name)).toEqual([
      'get_snapshot',
      'describe_snapshot',
      'compute_figures',
      'propose_spec',
      'validate_spec',
      'render_flower',
    ]);
    expect(ofKind(events, 'tool_result').every((e) => e.data.ok)).toBe(true);
    const propose = ofKind(events, 'tool_call').find((e) => e.data.name === 'propose_spec');
    expect(propose?.data.args).toMatchObject({ choices: { segments: 'backers' } });
    const stages = ofKind(events, 'stage').map((e) => e.data.stage);
    expect(stages).toEqual([
      'thinking',
      'reading_map',
      'counting',
      'proposing',
      'validating',
      'drawing',
    ]);
    const [run] = ofKind(events, 'run');
    expect(run?.data.resume_url).toBe(`/make?run=${run?.data.run_id}`);
    const [flower] = ofKind(events, 'flower');
    expect(validInterpretation(flower?.data.interpretation)).toBe(true);
    expect(flower?.data.legend.some((l) => l.primitive === 'segments')).toBe(true);
    // Every number in the answer comes from compute_figures (Nakamoto 9 of 371 in the fixture).
    const answer = ofKind(events, 'message').at(-1)?.data.text ?? '';
    expect(answer).toContain('9 of 371');
    expect(ofKind(events, 'done')[0]?.data.model).toBe('recorded');
    expect(names).not.toContain('signature');
  });

  test('another question still replays the recorded run, and says so', async () => {
    const { chat } = mock();
    const events = await chat('who runs Bitcoin?');
    expect(ofKind(events, 'message')[0]?.data.text).toMatch(/replays the recorded run/);
    expect(events.at(-1)?.event).toBe('done');
  });

  test('a run goes on after the client leaves, and GET runs/:id returns it', async () => {
    const { app, call } = mock({ delayMs: 5 });
    const res = await app.request('/api/v1/agent/chat', {
      method: 'POST',
      body: JSON.stringify({ messages: [{ role: 'user', content: QUESTION }] }),
    });
    if (!res.body) throw new Error('no body');
    const it = readSse(res.body)[Symbol.asyncIterator]();
    const first = await it.next();
    const runId = JSON.parse(first.value?.data ?? '{}').run_id as string;
    await it.return?.(undefined);
    let run: Run | undefined;
    for (let i = 0; i < 200; i++) {
      run = (await call<Run>(`/api/v1/agent/runs/${runId}`)).json;
      if (run.status !== 'running') break;
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(run?.status).toBe('done');
    expect(run?.flower?.spec.encodings.segments?.by).toBe('backers');
    expect((await call('/api/v1/agent/runs/run_nope')).status).toBe(404);
  });

  test('bad chat bodies are bad_input', async () => {
    const { call } = mock();
    expect((await call('/api/v1/agent/chat', { messages: [] })).status).toBe(400);
  });
});

describe('API mock: publish (relayed, NEP-413)', () => {
  async function prepared(m: ReturnType<typeof mock>) {
    const events = await m.chat();
    const runId = ofKind(events, 'run')[0]?.data.run_id ?? '';
    const run = (await m.call<Run>(`/api/v1/agent/runs/${runId}`)).json;
    const draft = entryDraftFromRun(run, 'http://localhost:3000');
    if (!draft) throw new Error('no draft');
    const p = await m.call<Prepared>('/api/v1/publish/prepare', { entry: draft });
    expect(p.status).toBe(200);
    return p.json;
  }

  test('prepare, sign, publish: the flower is on the (fake) map, signed by the maker', async () => {
    const m = mock();
    const p = await prepared(m);
    expect(p.message).toBe(publishMessage(p.entry_sha256));
    expect(p.recipient).toBe('petals.testnet');
    expect(p.sign_url).toMatch(new RegExp(`^/publish/${p.entry_sha256}\\?nonce=`));
    const maker = testSigner('maker.testnet');
    const proof = maker.sign({ message: p.message, nonce: p.nonce, recipient: p.recipient });
    const out = await m.call<{
      id: string;
      key: string;
      tx_hash: string;
      explorer_url: string;
      writer: string;
    }>('/api/v1/publish', { entry_sha256: p.entry_sha256, proof });
    expect(out.status).toBe(200);
    expect(out.json.key).toBe(`petal/v1/spec/${out.json.id}`);
    expect(out.json.writer).toBe('petals-writer.testnet');
    expect(out.json.explorer_url).toBe(`https://testnet.nearblocks.io/txns/${out.json.tx_hash}`);

    const list = await m.call<{
      flowers: { id: string; where: string; maker: string | null; tx_hash?: string }[];
    }>('/api/v1/flowers');
    expect(list.json.flowers[0]).toMatchObject({
      id: out.json.id,
      where: 'map',
      maker: 'maker.testnet',
      tx_hash: out.json.tx_hash,
    });
    const got = await m.call<{ entry: Entry; verified: Record<string, unknown>; where: string }>(
      `/api/v1/flowers/${out.json.id}`,
    );
    expect(got.json.where).toBe('map');
    expect(got.json.verified).toMatchObject({ entry_hash: true, maker_signature: true });
    expect(validEntry(got.json.entry), JSON.stringify(validEntry.errors)).toBe(true);
    expect(got.json.entry.provenance.maker?.account_id).toBe('maker.testnet');
  });

  test('the wallet path: proofFrom a wallet signature publishes too', async () => {
    const m = mock();
    const p = await prepared(m);
    const s = testSigner('wallet.testnet').sign({
      message: p.message,
      nonce: p.nonce,
      recipient: p.recipient,
    });
    const proof = proofFrom(
      { accountId: s.account_id, publicKey: s.public_key, signature: s.signature },
      p,
    );
    expect((await m.call('/api/v1/publish', { entry_sha256: p.entry_sha256, proof })).status).toBe(
      200,
    );
  });

  test('bad proofs are unauthorised: tampered, reused nonce, another key, expired', async () => {
    const m = mock();
    const p = await prepared(m);
    const maker = testSigner('maker.testnet');
    const good = maker.sign({ message: p.message, nonce: p.nonce, recipient: p.recipient });
    const publish = (proof: Nep413Proof) =>
      m.call<{ error: { code: string } }>('/api/v1/publish', {
        entry_sha256: p.entry_sha256,
        proof,
      });

    const tampered = await publish({ ...good, message: publishMessage('b'.repeat(64)) });
    expect([tampered.status, tampered.json.error.code]).toEqual([401, 'unauthorised']);
    const otherKey = testSigner('maker.testnet', 'another seed').sign({
      message: p.message,
      nonce: p.nonce,
      recipient: p.recipient,
    });
    expect((await publish({ ...otherKey, public_key: good.public_key })).status).toBe(401);
    expect((await publish(good)).status).toBe(200);
    const reused = await publish(good);
    expect([reused.status, reused.json.error.code]).toEqual([401, 'unauthorised']);

    let t = Date.parse('2026-11-04T12:00:00Z');
    const late = mock({ now: () => new Date(t) });
    const q = await prepared(late);
    t += 6 * 60_000;
    const proof = maker.sign({ message: q.message, nonce: q.nonce, recipient: q.recipient });
    expect(
      (await late.call('/api/v1/publish', { entry_sha256: q.entry_sha256, proof })).status,
    ).toBe(401);
  });

  test('unknown entries and malformed drafts are refused', async () => {
    const m = mock();
    expect(
      (await m.call('/api/v1/publish', { entry_sha256: 'c'.repeat(64), proof: {} })).status,
    ).toBe(404);
    expect((await m.call('/api/v1/publish/prepare', { entry: { petal: 'x' } })).status).toBe(400);
  });
});

describe('API mock: the dry quote', () => {
  test('sponsor a refresh: dry, labelled, no deposit address', async () => {
    const { call } = mock();
    const q = await call<Record<string, unknown>>('/api/v1/quote', {
      purpose: 'sponsor_refresh',
      amount_usd: 1,
    });
    expect(q.status).toBe(200);
    expect(q.json).toMatchObject({
      dry: true,
      amount_in: '1.010219',
      time_estimate_s: 35,
      note: 'Dry quote. Paying is not switched on.',
    });
    expect(JSON.stringify(q.json)).not.toMatch(/deposit/i);
    expect((await call('/api/v1/quote', { purpose: 'sponsor_coverage' })).status).toBe(200);
    expect(
      (await call('/api/v1/quote', { purpose: 'sponsor_refresh', amount_usd: 5 })).status,
    ).toBe(400);
    expect((await call('/api/v1/quote', { purpose: 'pay_me' })).status).toBe(400);
  });
});
