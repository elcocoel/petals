// T071: the recorded end-to-end skeleton (quickstart steps 1–5), `pnpm test:e2e`.
//
// The app under test is the real petalApp in fake mode: the recorded agent (recordedClient), the
// fake map, the recorded dry quote and the fixture store. rig.ts adds the three parts fake mode
// can't make: the test NEP-413 signer (behind a fake RPC that knows its keys), the recorded House
// of Stake answers (behind the real module and RPC pool) and a fake map the test can read back.
// Step 4 goes through the real MCP door, `pnpm -s --dir <repo> petal mcp`, in a child process.
//
// The steps run in quickstart order where they can; step 1's "map" flower needs step 3's publish,
// so the gallery is checked after it.
//
// The fixture flower is the one the repo ships in fixtures/map/, read from where the app reads it.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { getDefaultEnvironment, StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { petalApp } from '@petal/agent';
import { entryId } from '@petal/core';
import type { Entry, FlowerResult, Nep413Proof } from '@petal/core/types';
import type { Config } from '@petal/tools';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import {
  type EntryDraft,
  entryDraft,
  inOrder,
  longestGap,
  numbersIn,
  REPO,
  readSse,
  type TimedEvent,
  unbacked,
} from './helpers.ts';
import { fcSigner, hos, map, signer } from './rig.ts';
import { committedSkeletonEntries, fileText, skeletonEntry } from './skeleton-entry.ts';

vi.mock('@petal/tools', async (importOriginal) => {
  const real = await importOriginal<typeof import('@petal/tools')>();
  const { withRecordedParts } = await import('./rig.ts');
  return {
    ...real,
    createContext: (cfg: Config) => withRecordedParts(real.createContext(cfg)),
  };
});

const QUESTION = 'who stands behind NEAR’s validators?';
const GAP_MS = 10_000;

let stateDir: string;
let app: ReturnType<typeof petalApp>;

beforeAll(() => {
  stateDir = mkdtempSync(join(tmpdir(), 'petal-e2e-'));
  app = petalApp({ root: REPO, fake: true, stateDir });
});
afterAll(() => rmSync(stateDir, { recursive: true, force: true }));

type Json = Record<string, unknown>;

async function call(path: string, body?: unknown): Promise<{ status: number; json: Json }> {
  const res = await app.request(
    path,
    body === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
  );
  return { status: res.status, json: (await res.json()) as Json };
}

const errorCode = (j: Json) => (j.error as { code?: string } | undefined)?.code;

// What step 2 leaves for the later steps.
const chat: {
  events: TimedEvent[];
  flower?: FlowerResult;
  runId?: string;
  answer?: string;
  figuresArgs?: Json;
  proposeArgs?: Json;
} = { events: [] };
let published: { id: string; key: string; writer: string } | undefined;

describe('quickstart, recorded', () => {
  test('health: recorded agent, fake map (mirror), tools on', async () => {
    const { status, json } = await call('/api/v1/health');
    expect(status).toBe(200);
    expect(json).toMatchObject({ ok: true, llm: 'recorded', map: 'mirror', version: 'api/v1' });
  });

  test('step 2: the chat streams run first, the tools in order, a flower, done; no gap over 10 s', async () => {
    const sent = Date.now();
    const res = await app.request('/api/v1/agent/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: QUESTION }] }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/event-stream/);
    const events = await readSse(res, sent);
    chat.events = events;
    const names = events.map((e) => e.event);

    // run first, done last, nothing failed
    expect(names[0]).toBe('run');
    expect(names.at(-1)).toBe('done');
    expect(names).not.toContain('error');
    expect(
      inOrder(names, ['run', 'stage', 'tool_call', 'tool_result', 'flower', 'message', 'done']),
    ).toBe(true);
    // a recorded run carries no model signature (step 2.6: "recorded run, no signature")
    expect(names).not.toContain('signature');
    expect(events.at(-1)?.data).toMatchObject({ model: 'recorded', fallback_used: false });

    // no wait over 10 s: from the request to the first event, and between any two
    expect(longestGap(events)).toBeLessThanOrEqual(GAP_MS);

    const run = events[0]?.data as { run_id: string; resume_url: string };
    expect(run.resume_url).toBe(`/make?run=${run.run_id}`);
    chat.runId = run.run_id;

    // the tool calls of step 2.3, in the skill's order
    const calls = events
      .filter((e) => e.event === 'tool_call')
      .map((e) => e.data as { id: string; name: string; args: Json });
    expect(calls.map((c) => c.name)).toEqual([
      'get_snapshot',
      'describe_snapshot',
      'compute_figures',
      'propose_spec',
      'validate_spec',
      'render_flower',
    ]);
    const propose = calls.find((c) => c.name === 'propose_spec');
    expect(propose?.args).toMatchObject({
      network: 'near-validators',
      choices: { segments: 'backers' },
    });
    chat.proposeArgs = propose?.args;
    chat.figuresArgs = calls.find((c) => c.name === 'compute_figures')?.args;

    const results = events
      .filter((e) => e.event === 'tool_result')
      .map((e) => e.data as { name: string; ok: boolean; summary: string });
    expect(results.every((r) => r.ok)).toBe(true);
    // the snapshot was reused from the fixture (step 2.2)
    expect(results.find((r) => r.name === 'get_snapshot')?.summary).toMatch(/^reused from fixture/);
    expect(results.find((r) => r.name === 'validate_spec')?.summary).toBe('valid');

    // the stages of step 2.2, in order
    const stages = events
      .filter((e) => e.event === 'stage' || e.event === 'progress')
      .map((e) => (e.data as { stage: string }).stage);
    expect(
      inOrder(stages, ['reading_map', 'found', 'counting', 'proposing', 'validating', 'drawing']),
    ).toBe(true);

    // the flower (step 2.4): validators, cut into backers, a segments legend line, cited mappings
    const flower = events.find((e) => e.event === 'flower')?.data as FlowerResult;
    chat.flower = flower;
    expect(flower.spec.network.id).toBe('near-validators');
    expect(flower.spec.encodings.segments).toMatchObject({ by: 'backers' });
    expect(flower.validation).toMatchObject({ valid: true, errors: [] });
    expect(flower.legend.map((l) => l.primitive)).toContain('segments');
    expect(flower.spec_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(flower.view_url).toMatch(/^\/draft\?spec=/);
    const interp = flower.interpretation;
    expect(interp.mappings.length).toBeGreaterThan(0);
    for (const m of interp.mappings) expect(m.sources.length).toBeGreaterThan(0);
    expect(interp.unknowns.length).toBeGreaterThan(0);

    const answer = events.findLast((e) => e.event === 'message')?.data as { text: string };
    chat.answer = answer.text;
    expect(answer.text).toContain(flower.view_url);
  });

  test('step 2.5: every number in the answer is in compute_figures', async () => {
    expect(chat.answer && chat.figuresArgs).toBeTruthy();
    // the same call the agent made; compute_figures is deterministic
    const { status, json: figures } = await call('/api/v1/figures', chat.figuresArgs);
    expect(status).toBe(200);
    const quoted = numbersIn(chat.answer as string);
    // the skeleton answer quotes the Nakamoto coefficient and the validators counted
    expect(quoted.map((q) => q.value)).toEqual(
      expect.arrayContaining([
        (figures.nakamoto as { count: number }).count,
        figures.participants_included as number,
      ]),
    );
    expect(unbacked(chat.answer as string, figures)).toEqual([]);
  });

  test('step 2: the run can be left and reopened: GET /api/v1/agent/runs/:id has the flower', async () => {
    const { status, json } = await call(`/api/v1/agent/runs/${chat.runId}`);
    expect(status).toBe(200);
    expect(json).toMatchObject({ run_id: chat.runId, status: 'done' });
    expect((json.flower as FlowerResult).spec_sha256).toBe(chat.flower?.spec_sha256);
  });

  let prepared: Json;
  let draft: EntryDraft;

  test('step 3: publish, read back from the map, the recomputed hash equals the id', async () => {
    const flower = chat.flower as FlowerResult;
    draft = entryDraft(flower, {
      title: QUESTION,
      model: 'recorded',
      signature: null,
      created_at: new Date().toISOString(),
    });
    const prep = await call('/api/v1/publish/prepare', { entry: draft });
    expect(prep.status).toBe(200);
    prepared = prep.json;
    expect(prepared.message).toBe(
      JSON.stringify({ petal: 'publish/v1', entry_sha256: prepared.entry_sha256 }),
    );
    expect(prepared.sign_url).toMatch(
      new RegExp(`/publish/${prepared.entry_sha256}\\?nonce=.+&recipient=.+&expires_at=`),
    );

    // the maker's wallet signs the NEP-413 message (here the test signer)
    const proof = signer.sign({
      message: prepared.message as string,
      nonce: prepared.nonce as string,
      recipient: prepared.recipient as string,
    });
    const pub = await call('/api/v1/publish', { entry_sha256: prepared.entry_sha256, proof });
    expect(pub.status).toBe(200);
    const out = pub.json as { id: string; key: string; writer: string; receiver: string };
    expect(out.key).toBe(`petal/v1/spec/${out.id}`);
    expect(out.writer).toBe(map.writer);
    expect(out.receiver).toBe(map.receiver);
    expect(pub.json.explorer_url).toMatch(/^https:\/\/.*fake|testnet/);
    published = out;

    // read it back directly, as the kv.test.fastnear.com read does
    const row = await map.get(out.key, out.writer);
    const entry = row?.value as Entry;
    expect(entry.id).toBe(out.id);
    const { id, ...unsigned } = entry;
    expect(entryId(unsigned)).toBe(id);
    expect(entry.provenance.maker?.account_id).toBe(signer.accountId);
    expect(entry.spec_sha256).toBe(flower.spec_sha256);

    // and through the API: verified hash and maker signature
    const got = await call(`/api/v1/flowers/${out.id}`);
    expect(got.status).toBe(200);
    expect(got.json).toMatchObject({
      where: 'map',
      verified: { entry_hash: true, maker_signature: true, model_signature: 'absent' },
    });
  });

  test('step 3: bad proofs return unauthorised (tampered, reused nonce, function-call key)', async () => {
    const used = signer.sign({
      message: prepared.message as string,
      nonce: prepared.nonce as string,
      recipient: prepared.recipient as string,
    });
    // a reused nonce: the same proof again
    const again = await call('/api/v1/publish', {
      entry_sha256: prepared.entry_sha256,
      proof: used,
    });
    expect([again.status, errorCode(again.json)]).toEqual([401, 'unauthorised']);

    // a fresh draft for the next two: another title, so another entry hash
    const fresh = await call('/api/v1/publish/prepare', {
      entry: { ...draft, title: `${QUESTION} (again)` },
    });
    expect(fresh.status).toBe(200);
    const payload = {
      message: fresh.json.message as string,
      nonce: fresh.json.nonce as string,
      recipient: fresh.json.recipient as string,
    };

    // a tampered message: signed text that is not the prepared one
    const tampered: Nep413Proof = {
      ...signer.sign(payload),
      message: payload.message.replace(/"entry_sha256":"[0-9a-f]/, '"entry_sha256":"0'),
    };
    const t = await call('/api/v1/publish', {
      entry_sha256: fresh.json.entry_sha256,
      proof: tampered,
    });
    expect([t.status, errorCode(t.json)]).toEqual([401, 'unauthorised']);

    // a valid signature, but by a function-call key
    const fc = await call('/api/v1/publish', {
      entry_sha256: fresh.json.entry_sha256,
      proof: fcSigner.sign(payload),
    });
    expect([fc.status, errorCode(fc.json)]).toEqual([401, 'unauthorised']);

    // a signature that does not match the key it names
    const forged: Nep413Proof = { ...signer.sign(payload), public_key: fcSigner.publicKey };
    const f = await call('/api/v1/publish', {
      entry_sha256: fresh.json.entry_sha256,
      proof: forged,
    });
    expect([f.status, errorCode(f.json)]).toEqual([401, 'unauthorised']);

    // none of them wrote anything: one spec on the map, the published one
    const specs = await map.latest('petal/v1/spec/');
    expect(specs.map((r) => r.key)).toEqual([published?.key]);
  });

  test('step 1: the shipped fixture flower is the skeleton run, current with the code', () => {
    const shipped = committedSkeletonEntries();
    expect(shipped).toHaveLength(1);
    // if this fails after a renderer or tool change: node tests/e2e/skeleton-entry.ts --write
    expect(fileText(shipped[0]?.entry as Entry)).toBe(
      fileText(skeletonEntry(chat.flower as FlowerResult)),
    );
    expect(shipped[0]?.entry.provenance.maker).toBeNull();
  });

  test('step 1: the gallery lists the published flower (map) and the fixture; each opens', async () => {
    const { status, json } = await call('/api/v1/flowers');
    expect(status).toBe(200);
    const flowers = json.flowers as {
      id: string;
      where: string;
      maker: unknown;
      tx_hash?: string;
    }[];
    const wheres = new Set(flowers.map((f) => f.where));
    expect(wheres).toEqual(new Set(['map', 'fixture']));
    const mine = flowers.find((f) => f.id === published?.id);
    expect(mine).toMatchObject({ where: 'map' });
    expect(mine?.tx_hash).toBeTruthy();

    // the fixture is the shipped entry, labelled what it is: no maker, no transaction
    const shipped = committedSkeletonEntries()[0]?.entry as Entry;
    const fixture = flowers.find((f) => f.where === 'fixture');
    expect(fixture).toMatchObject({ id: shipped.id, maker: null });
    expect(fixture).not.toHaveProperty('tx_hash');
    const opened = await call(`/api/v1/flowers/${shipped.id}`);
    expect(opened.json).toMatchObject({ where: 'fixture', entry: shipped });
    expect(opened.json).not.toHaveProperty('tx_hash');

    for (const f of flowers) {
      const one = await call(`/api/v1/flowers/${f.id}`);
      expect(one.status).toBe(200);
      expect((one.json.verified as { entry_hash: boolean }).entry_hash).toBe(true);
      const svg = await app.request(`/api/v1/flowers/${f.id}/svg`);
      expect(svg.status).toBe(200);
      expect(svg.headers.get('content-type')).toMatch(/image\/svg\+xml/);
      const text = await svg.text();
      expect(text).toMatch(/^<svg[\s>]/);
      expect(text).toContain('petal-seg');
    }
  });

  test('step 3.5: House of Stake is fetched once (reused: false), then reused in under 1 s', async () => {
    const first = await call('/api/v1/snapshots', { network: 'near-house-of-stake' });
    expect(first.status).toBe(200);
    expect(first.json).toMatchObject({ reused: false, where: 'fetched' });
    expect(hos.missing).toEqual([]);
    expect(hos.calls()).toBeGreaterThan(10);
    const sha = first.json.sha256 as string;
    // a new snapshot key and its index key on the map
    const block = (first.json.snapshot as { block_height: number }).block_height;
    expect(block).toBe(hos.block_height);
    const written = map.writes().flatMap((w) => w.keys);
    expect(written).toEqual(
      expect.arrayContaining([
        `petal/v1/snapshot/${sha}`,
        `petal/v1/index/near:mainnet/house-of-stake/${block}`,
      ]),
    );

    const calls = hos.calls();
    const t0 = performance.now();
    const second = await call('/api/v1/snapshots', { network: 'near-house-of-stake' });
    const ms = performance.now() - t0;
    expect(second.json).toMatchObject({ sha256: sha, reused: true });
    expect(ms).toBeLessThan(1000);
    // reuse reads only the head block, never the data again
    expect(hos.calls() - calls).toBeLessThanOrEqual(1);

    // NEAR validators again: reused too
    const v = await call('/api/v1/snapshots', { network: 'near-validators' });
    expect(v.json).toMatchObject({ reused: true, where: 'fixture' });
  });

  test('step 3.5: the House of Stake snapshot makes a valid default flower', async () => {
    const snap = await call('/api/v1/snapshots', { network: 'near-house-of-stake' });
    const sha = snap.json.sha256 as string;
    const proposed = await call('/api/v1/specs/propose', {
      network: 'near-house-of-stake',
      sha256: sha,
    });
    expect(proposed.status).toBe(200);
    const valid = await call('/api/v1/specs/validate', { spec: proposed.json.spec });
    expect(valid.json).toMatchObject({ valid: true, errors: [] });
    const drawn = await call('/api/v1/render', { spec: proposed.json.spec });
    expect(drawn.status).toBe(200);
    expect(drawn.json.spec_sha256).toBe(proposed.json.spec_sha256);
  });

  test('step 4: the MCP door (petal mcp) gives the same spec_sha256', {
    timeout: 60_000,
  }, async () => {
    // the install command of step 4.1: claude mcp add petal -- pnpm -s --dir <repo> petal mcp
    const transport = new StdioClientTransport({
      command: 'pnpm',
      args: ['-s', '--dir', REPO, 'petal', 'mcp'],
      env: getDefaultEnvironment(),
      stderr: 'pipe',
    });
    const client = new Client({ name: 'petal-e2e', version: '1' });
    await client.connect(transport);
    try {
      const tools = await client.listTools();
      expect(tools.tools.map((t) => t.name)).toEqual(
        expect.arrayContaining([
          'get_snapshot',
          'propose_spec',
          'render_flower',
          'prepare_publish',
        ]),
      );
      const result = async (name: string, args: Json) => {
        const r = await client.callTool({ name, arguments: args });
        expect(r.isError ?? false).toBe(false);
        const content =
          r.structuredContent ?? JSON.parse((r.content as { text: string }[])[0]?.text ?? '{}');
        return content as Json;
      };
      const snap = await result('get_snapshot', { network: 'near-validators' });
      expect(snap).toMatchObject({ reused: true, sha256: chat.flower?.spec.snapshot.sha256 });
      // the same choices as Petal's agent made in step 2
      const proposed = await result('propose_spec', {
        ...(chat.proposeArgs as Json),
        sha256: snap.sha256,
      });
      expect(proposed.spec_sha256).toBe(chat.flower?.spec_sha256);
      const drawn = await result('render_flower', { spec: proposed.spec });
      expect(drawn.render_sha256).toBe(chat.flower?.render_sha256);
    } finally {
      await client.close();
    }
  });

  test('step 5: the quote is dry: no deposit address, no money moves', async () => {
    const { status, json } = await call('/api/v1/quote', {
      purpose: 'sponsor_refresh',
      amount_usd: 1,
    });
    expect(status).toBe(200);
    expect(json).toMatchObject({ dry: true, note: 'Dry quote. Paying is not switched on.' });
    expect(Number(json.amount_in)).toBeGreaterThan(0);
    expect(json.time_estimate_s).toEqual(expect.any(Number));
    expect(JSON.stringify(json)).not.toMatch(/deposit_?address/i);
  });
});
