// T047–T050: each tool's behaviour in process, on the real core, inputs and near packages, with
// fakes only for the outside world (fakeMap, the test signer and fake RPC, the recorded quote).

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalJson, entryId, specHash } from '@petal/core';
import type { Entry, ProgressEvent } from '@petal/core/types';
import { describe, expect, test } from 'vitest';
import { callTool } from '../src/registry.ts';
import type { ToolContext } from '../src/types.ts';
import { entrySha256 } from '../src/verify.ts';
import { FIXTURES, flow, NOW, rig, testFixture, validatorsFixture } from './helpers.ts';

type Out = Record<string, unknown> & { error?: { code: string; message: string; hint?: string } };
const runner = (ctx: ToolContext) => async (name: string, input: unknown) =>
  (await callTool(name, input, ctx)) as Out;

describe('list_networks, get_network', () => {
  test('lists the modules, filters by query, and says plainly what it cannot read', async () => {
    const run = runner((await rig()).ctx);
    const all = await run('list_networks', {});
    expect((all.networks as { id: string }[]).map((n) => n.id)).toContain('near-validators');
    const q = await run('list_networks', { query: 'validators' });
    expect(
      (q.networks as { id: string }[]).every((n) => /validators/i.test(JSON.stringify(n))),
    ).toBe(true);
    const none = await run('list_networks', { query: 'bitcoin' });
    expect(none.networks).toEqual([]);
    expect(none.cannot_read_hint).toMatch(/can't read "bitcoin" yet.*near-validators/);
  });

  test('get_network: the descriptor and the snapshots held locally and on the map', async () => {
    const r = await rig();
    const run = runner(r.ctx);
    // a snapshot fingerprint on the map, from a trusted writer
    await r.map.write({
      [`petal/v1/snapshot/${'c'.repeat(64)}`]: {
        petal: 'snapshot-ref/v1',
        sha256: 'c'.repeat(64),
        network: { id: 'near-validators' },
        as_of: '2026-11-01T00:00:00Z',
        block_height: 222000000,
        final: true,
      },
    });
    const out = await run('get_network', { id: 'near-validators' });
    expect((out.network as { id: string }).id).toBe('near-validators');
    const mapped = out.mapped as { sha256: string; where: string }[];
    expect(mapped.map((m) => m.where)).toEqual(['fixture', 'map']);
    expect(mapped[0]?.sha256).toBe(validatorsFixture().sha256);
  });

  test('get_network: an unknown network is cannot_read with what Petal can read', async () => {
    const out = await runner((await rig()).ctx)('get_network', { id: 'bitcoin-mining-pools' });
    expect(out.error?.code).toBe('cannot_read');
    expect(out.error?.hint).toMatch(/near-validators/);
  });
});

describe('get_snapshot', () => {
  test('reuses the final fixture: reused true, never the body', async () => {
    const out = await runner((await rig()).ctx)('get_snapshot', { network: 'near-validators' });
    expect(out).toMatchObject({
      sha256: validatorsFixture().sha256,
      reused: true,
      where: 'fixture',
      snapshot: { block_height: 222915356, final: true },
      body_url: `https://petal.test/api/v1/snapshots/${validatorsFixture().sha256}`,
    });
    expect(out).not.toHaveProperty('participants');
    expect((out.counts as { participants: number }).participants).toBe(8487);
  });

  test('a live pull reports progress, stores, fingerprints on the map; the second is reused', async () => {
    const r = await rig();
    const events: ProgressEvent[] = [];
    const ctx = { ...r.ctx, onProgress: (e: ProgressEvent) => events.push(e) };
    const first = await runner(ctx)('get_snapshot', { network: 'test-live' });
    expect(first).toMatchObject({ reused: false, where: 'fetched' });
    expect(events.map((e) => e.stage)).toContain('fetching');
    const keys = r.map.writes().flatMap((w) => w.keys);
    expect(keys).toContain(`petal/v1/snapshot/${first.sha256}`);
    expect(keys).toContain('petal/v1/index/near:mainnet/live-test/223000000');
    const second = await runner(ctx)('get_snapshot', { network: 'test-live' });
    expect(second).toMatchObject({ sha256: first.sha256, reused: true });
  });

  test('a network Petal cannot read is cannot_read', async () => {
    const out = await runner((await rig()).ctx)('get_snapshot', { network: 'ethereum-staking' });
    expect(out.error?.code).toBe('cannot_read');
  });
});

describe('describe_snapshot, compute_figures', () => {
  test('describe: measures, kinds, segment options, primitives with status, top N', async () => {
    const { sha256 } = validatorsFixture();
    const out = await runner((await rig()).ctx)('describe_snapshot', { sha256, top: 3 });
    expect((out.measures as { id: string }[]).map((m) => m.id)).toContain(
      'validator_stake_current_epoch',
    );
    expect(out.kinds_present).toContain('staking_pool');
    expect(out.segment_options).toEqual([
      { by: 'backers', label: expect.stringMatching(/lockups/) },
    ]);
    const prims = out.primitives as { id: string; status: string }[];
    expect(prims.find((p) => p.id === 'texture')?.status).toBe('unavailable');
    expect(prims.find((p) => p.id === 'width')?.status).toBe('available');
    expect(out.top).toHaveLength(3);
    expect(out.coverage_note).toMatch(/participants included/);
    expect(JSON.stringify(out).length).toBeLessThan(20_000);
  });

  test('compute_figures counts; an unknown measure is bad_input listing the measures', async () => {
    const { sha256 } = validatorsFixture();
    const run = runner((await rig()).ctx);
    const f = await run('compute_figures', {
      sha256,
      measure: 'validator_stake_current_epoch',
      petals: 60,
    });
    expect(f).toMatchObject({ measure: 'validator_stake_current_epoch', unit: 'NEAR' });
    expect((f.shares as unknown[]).length).toBeLessThanOrEqual(60);
    // the figure the skeleton answer quotes (T025: Nakamoto is 9 on the validators fixture)
    expect(f.nakamoto).toMatchObject({ count: 9 });
    const bad = await run('compute_figures', { sha256, measure: 'hashrate' });
    expect(bad.error).toMatchObject({
      code: 'bad_input',
      hint: expect.stringMatching(/validator_stake/),
    });
    const missing = await run('compute_figures', { sha256: 'd'.repeat(64), measure: 'x' });
    expect(missing.error?.code).toBe('not_found');
  });
});

describe('propose_spec, validate_spec, render_flower', () => {
  test('the same choices give the same spec_sha256, and the spec is canonical', async () => {
    const run = runner((await rig()).ctx);
    const a = await flow(run);
    const b = await flow(run);
    expect(a.proposed.spec_sha256).toBe(b.proposed.spec_sha256);
    expect(a.proposed.spec_sha256).toBe(specHash(a.spec as never));
    const v = await run('validate_spec', { spec: a.spec });
    expect(v).toMatchObject({ valid: true, errors: [] });
  });

  test('an unavailable primitive is refused as "not available yet", never imitated (FR-032)', async () => {
    const run = runner((await rig()).ctx);
    const { sha256 } = validatorsFixture();
    for (const choices of [
      { texture: 'hatch' },
      { lines: 'shared_delegators' },
      { markings: 'fusion' },
      { order: 'join_date' },
    ]) {
      const out = await run('propose_spec', { network: 'near-validators', sha256, choices });
      expect(out.error?.code, JSON.stringify(choices)).toBe('bad_input');
      expect(out.error?.message, JSON.stringify(choices)).toMatch(/not available yet/);
    }
    const m = await run('propose_spec', {
      network: 'near-validators',
      sha256,
      meanings: { opacity: 'x' },
    });
    expect(m.error?.message).toMatch(/opacity is not available yet/);
  });

  test("a choice that doesn't apply to the population names the allowed values and the closest", async () => {
    const r = await rig();
    const { sha256 } = testFixture('two-participants');
    const out = await runner(r.ctx)('propose_spec', {
      network: 'test-two-participants',
      sha256,
      choices: { segments: 'backers' },
    });
    expect(out.error).toMatchObject({
      code: 'bad_input',
      message: expect.stringMatching(/doesn't apply to test-two-participants.*Allowed: none/),
      hint: 'Closest alternative: segments "none".',
    });
  });

  test('a snapshot of another network is bad_input', async () => {
    const { sha256 } = validatorsFixture();
    const out = await runner((await rig()).ctx)('propose_spec', {
      network: 'test-tiny-backers',
      sha256,
    });
    expect(out.error?.code).toBe('bad_input');
  });

  test('validate_spec reports errors as a result; render_flower refuses them as invalid_spec', async () => {
    const run = runner((await rig()).ctx);
    const { spec } = await flow(run);
    const broken = { ...spec, snapshot: { ...(spec.snapshot as object), sha256: 'e'.repeat(64) } };
    const v = await run('validate_spec', { spec: broken });
    expect(v).toMatchObject({
      valid: false,
      errors: [expect.objectContaining({ rule: 'snapshot' })],
    });
    const r = await run('render_flower', { spec: broken });
    expect(r.error?.code).toBe('invalid_spec');
    const junk = await run('validate_spec', { spec: { petal: 'spec/v1' } });
    expect(junk.valid).toBe(false);
  });

  test('render_flower: hashes, legend, petals, a draft view_url; svg only when asked', async () => {
    const run = runner((await rig()).ctx);
    const { spec, rendered } = await flow(run);
    expect(rendered).not.toHaveProperty('svg');
    expect(rendered.spec_sha256).toBe(specHash(spec as never));
    const url = new URL(rendered.view_url as string);
    expect(url.origin + url.pathname).toBe('https://petal.test/draft');
    const decoded = Buffer.from(url.searchParams.get('spec') ?? '', 'base64url').toString('utf8');
    expect(decoded).toBe(canonicalJson(spec));
    const withSvg = await run('render_flower', { spec, include_svg: true });
    expect(withSvg.svg).toMatch(/^<svg /);
    expect(withSvg.render_sha256).toBe(rendered.render_sha256);
  });
});

describe('prepare_publish, publish_flower, list_flowers, get_flower', () => {
  async function prepared() {
    const r = await rig();
    const run = runner(r.ctx);
    const f = await flow(run);
    const prep = await run('prepare_publish', { entry: f.draft });
    return { r, run, f, prep };
  }

  test('prepare: the exact message, a nonce, the receiver, and a sign_url; the draft is kept', async () => {
    const { r, f, prep } = await prepared();
    const sha = entrySha256(f.draft as never);
    expect(prep).toMatchObject({
      entry_sha256: sha,
      recipient: 'petals.testnet',
      message: `{"petal":"publish/v1","entry_sha256":"${sha}"}`,
    });
    const sign = new URL(prep.sign_url as string);
    expect(sign.origin + sign.pathname).toBe(`https://petal.test/publish/${sha}`);
    expect(Object.fromEntries(sign.searchParams)).toEqual({
      nonce: prep.nonce,
      recipient: 'petals.testnet',
      expires_at: prep.expires_at,
    });
    const kept = JSON.parse(readFileSync(join(r.stateDir, 'drafts', `${sha}.json`), 'utf8'));
    expect(kept.nonce).toBe(prep.nonce);
  });

  test('without a public base URL, view_url and sign_url stay relative (the web base)', async () => {
    const r = await rig();
    const { apiBase: _drop, ...config } = r.ctx.config;
    const run = runner({ ...r.ctx, config });
    const f = await flow(run);
    expect(f.rendered.view_url).toMatch(/^\/draft\?spec=[A-Za-z0-9_-]+$/);
    expect(f.snap.body_url).toBe(`/api/v1/snapshots/${f.sha256}`);
    const prep = await run('prepare_publish', { entry: f.draft });
    expect(prep.sign_url).toMatch(
      /^\/publish\/[0-9a-f]{64}\?nonce=.+&recipient=petals.testnet&expires_at=/,
    );
  });

  test('prepare refuses an entry whose hashes do not match', async () => {
    const r = await rig();
    const run = runner(r.ctx);
    const f = await flow(run);
    const bad = await run('prepare_publish', {
      entry: { ...f.draft, render_sha256: 'f'.repeat(64) },
    });
    expect(bad.error?.code).toBe('bad_input');
    const bad2 = await run('prepare_publish', {
      entry: { ...f.draft, spec_sha256: 'f'.repeat(64) },
    });
    expect(bad2.error?.code).toBe('bad_input');
    const bad3 = await run('prepare_publish', {
      entry: { ...f.draft, interpretation: { ...f.draft.interpretation, unknowns: [] } },
    });
    expect(bad3.error?.code).toBe('bad_input');
  });

  test('publish: verify, write petal/v1/spec/<id>, read it back verified; then listed', async () => {
    const { r, run, prep } = await prepared();
    const proof = r.signer.sign({
      message: prep.message as string,
      nonce: prep.nonce as string,
      recipient: prep.recipient as string,
    });
    const pub = await run('publish_flower', { entry_sha256: prep.entry_sha256, proof });
    expect(pub).toMatchObject({
      key: `petal/v1/spec/${pub.id}`,
      receiver: 'petals.testnet',
      writer: 'writer.petals.testnet',
      explorer_url: `https://testnet.nearblocks.io/txns/${pub.tx_hash}`,
      gallery_url: `https://petal.test/f/${pub.id}`,
    });
    const row = await r.map.get(pub.key as string, r.map.writer);
    const entry = row?.value as Entry;
    expect(entryId(entry)).toBe(pub.id);
    expect(entry.provenance.maker?.account_id).toBe('maker.testnet');

    const got = await run('get_flower', { id: pub.id });
    expect(got).toMatchObject({
      where: 'map',
      tx_hash: pub.tx_hash,
      verified: { entry_hash: true, maker_signature: true, model_signature: 'absent' },
      corrections: [],
    });
    const list = await run('list_flowers', { network: 'near-validators' });
    expect(list.flowers).toEqual([
      expect.objectContaining({
        id: pub.id,
        where: 'map',
        maker: 'maker.testnet',
        tx_hash: pub.tx_hash,
      }),
    ]);
    expect((await run('list_flowers', { maker: 'someone.testnet' })).flowers).toEqual([]);

    // the nonce is used: a second publish is unauthorised
    const again = await run('publish_flower', { entry_sha256: prep.entry_sha256, proof });
    expect(again.error?.code).toBe('unauthorised');
  });

  test('a tampered message, a stale nonce, or a function-call key are unauthorised', async () => {
    const { r, run, prep } = await prepared();
    const sign = (s = r.signer, message = prep.message as string) =>
      s.sign({ message, nonce: prep.nonce as string, recipient: prep.recipient as string });
    const tampered = await run('publish_flower', {
      entry_sha256: prep.entry_sha256,
      proof: sign(r.signer, (prep.message as string).replace('publish/v1', 'publish/v2')),
    });
    expect(tampered.error?.code).toBe('unauthorised');
    const fc = await run('publish_flower', {
      entry_sha256: prep.entry_sha256,
      proof: sign(r.fcSigner),
    });
    expect(fc.error).toMatchObject({
      code: 'unauthorised',
      message: expect.stringMatching(/full-access/),
    });
    r.clock.set(new Date(Date.parse(prep.expires_at as string) + 60_000).toISOString());
    const stale = await run('publish_flower', { entry_sha256: prep.entry_sha256, proof: sign() });
    expect(stale.error).toMatchObject({
      code: 'unauthorised',
      message: expect.stringMatching(/expired/),
    });
    expect(
      r.map.writes().filter((w) => w.keys.some((k) => k.startsWith('petal/v1/spec/'))),
    ).toEqual([]);
  });

  test('rows from untrusted writers or that fail verification are hidden', async () => {
    const { r, run, prep } = await prepared();
    const proof = r.signer.sign({
      message: prep.message as string,
      nonce: prep.nonce as string,
      recipient: prep.recipient as string,
    });
    const pub = await run('publish_flower', { entry_sha256: prep.entry_sha256, proof });
    const entry = (await r.map.get(pub.key as string, r.map.writer))?.value as Entry;
    await r.map.as('mallory.testnet').write({ [pub.key as string]: entry });
    const forged = { ...entry, title: 'forged' };
    const forgedId = entryId(forged);
    await r.map.write({ [`petal/v1/spec/${forgedId}`]: { ...forged, id: forgedId } });
    const list = (await run('list_flowers', {})).flowers as { id: string }[];
    expect(list.map((f) => f.id)).toEqual([pub.id]);
    const got = await run('get_flower', { id: forgedId });
    expect(got.error).toMatchObject({
      code: 'not_found',
      message: expect.stringMatching(/failed verification/),
    });
  });

  test('get_flower of an unknown id is not_found; no map, no writer: source_failed', async () => {
    const { r, run, prep } = await prepared();
    expect((await run('get_flower', { id: '0'.repeat(24) })).error?.code).toBe('not_found');
    const ctx = { ...r.ctx, map: { ...r.ctx.map, writer: null } };
    const proof = r.signer.sign({
      message: prep.message as string,
      nonce: prep.nonce as string,
      recipient: prep.recipient as string,
    });
    const out = await runner(ctx)('publish_flower', { entry_sha256: prep.entry_sha256, proof });
    expect(out.error?.code).toBe('source_failed');
  });

  test('get_flower with the map down is source_failed; list_flowers still answers', async () => {
    const r = await rig();
    const down = {
      ...r.ctx.map,
      reader: {
        latest: async () => Promise.reject(new Error('kv.test.fastnear.com unreachable')),
        get: async () => Promise.reject(new Error('kv.test.fastnear.com unreachable')),
      },
    };
    const run = runner({ ...r.ctx, map: down });
    expect((await run('get_flower', { id: 'a'.repeat(24) })).error?.code).toBe('source_failed');
    expect((await run('list_flowers', {})).flowers).toEqual([]);
  });

  test('a shipped fixture flower lists as a fixture: no maker, no transaction, hash verified', async () => {
    const r = await rig();
    const run = runner({ ...r.ctx, config: { ...r.ctx.config, fixturesDir: FIXTURES } });
    const shipped = readdirSync(join(FIXTURES, 'map')).filter((n) => n.endsWith('.json'));
    expect(shipped.length).toBeGreaterThan(0);
    const list = (await run('list_flowers', {})).flowers as Record<string, unknown>[];
    expect(list).toHaveLength(shipped.length);
    for (const f of list) {
      expect(f).toMatchObject({ where: 'fixture', maker: null });
      expect(f).not.toHaveProperty('tx_hash');
      const got = await run('get_flower', { id: f.id });
      expect(got).toMatchObject({
        where: 'fixture',
        verified: { entry_hash: true, maker_signature: false, model_signature: 'absent' },
      });
      expect(got).not.toHaveProperty('tx_hash');
    }
  });

  test('a fixture whose content does not match its id is hidden', async () => {
    const r = await rig();
    const [name] = readdirSync(join(FIXTURES, 'map')).filter((n) => n.endsWith('.json'));
    const entry = JSON.parse(readFileSync(join(FIXTURES, 'map', name as string), 'utf8')) as Entry;
    const dir = r.ctx.config.fixturesDir as string;
    mkdirSync(join(dir, 'map'), { recursive: true });
    writeFileSync(
      join(dir, 'map', 'tampered.json'),
      JSON.stringify({ ...entry, title: 'tampered' }),
    );
    expect((await runner(r.ctx)('list_flowers', {})).flowers).toEqual([]);
  });

  test('NOW is the clock the tools see', async () => {
    expect((await rig()).ctx.now().toISOString()).toBe(NOW);
  });
});

describe('quote_payment', () => {
  test('a dry quote; no deposit address; the label says paying is off (FR-031)', async () => {
    const out = await runner((await rig()).ctx)('quote_payment', {
      purpose: 'sponsor_refresh',
      amount_usd: 1,
    });
    expect(out).toMatchObject({ dry: true, note: 'Dry quote. Paying is not switched on.' });
    expect(JSON.stringify(out)).not.toMatch(/deposit/i);
  });

  test('sponsor_refresh of a network Petal cannot read is bad_input; a failing source is source_failed', async () => {
    const run = runner((await rig()).ctx);
    const bad = await run('quote_payment', { purpose: 'sponsor_refresh', network: 'bitcoin' });
    expect(bad.error?.code).toBe('bad_input');
    const unrecorded = await run('quote_payment', { purpose: 'sponsor_coverage', amount_usd: 5 });
    expect(unrecorded.error?.code).toBe('source_failed');
  });

  test('a quote source that is not dry is refused', async () => {
    const r = await rig();
    const ctx = {
      ...r.ctx,
      quote: async () => ({ ...(await r.ctx.quote({ purpose: 'sponsor_refresh' })), dry: false }),
    };
    const out = await runner(ctx as never)('quote_payment', { purpose: 'sponsor_refresh' });
    expect(out.error).toMatchObject({ code: 'internal', message: expect.stringMatching(/FR-031/) });
  });
});
