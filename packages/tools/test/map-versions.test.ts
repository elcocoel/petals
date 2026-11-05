// T180: identity without the drawing (shared-map.md, Entry versions). flower/v1 rows verify exactly
// as before, against a real testnet row. A flower/v2 entry's id and signature cover the facts and
// the build, and a drawing by another skin is the same flower. Test signer and fake map only.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalJson, entryId, readFlower, renderFlower, sha256Hex, specHash } from '@petal/core';
import type { Entry, EntryV1, EntryV2, Reading, Spec } from '@petal/core/types';
import { describe, expect, test } from 'vitest';
import { callTool } from '../src/registry.ts';
import type { ToolContext } from '../src/types.ts';
import { entrySha256, publishMessage, verifyEntry } from '../src/verify.ts';
import { FIXTURES, flow, rig } from './helpers.ts';

type Out = Record<string, unknown> & { error?: { code: string; message: string } };
const runner = (ctx: ToolContext) => async (name: string, input: unknown) =>
  (await callTool(name, input, ctx)) as Out;

/** Written by petals-writer.testnet to petals.testnet, read back from FastData on 5 Nov 2026. */
const REAL_ROW = JSON.parse(
  readFileSync(
    join(import.meta.dirname, 'fixtures', 'map', '9ac16c8917aa5ca579c8421a.row.json'),
    'utf8',
  ),
) as { key: string; value: EntryV1; predecessor_id: string; current_account_id: string };

async function published() {
  const r = await rig();
  const run = runner(r.ctx);
  const f = await flow(run);
  const prep = await run('prepare_publish', { entry: f.draft });
  const proof = r.signer.sign({
    message: prep.message as string,
    nonce: prep.nonce as string,
    recipient: prep.recipient as string,
  });
  const pub = await run('publish_flower', { entry_sha256: prep.entry_sha256, proof });
  const entry = (await r.map.get(pub.key as string, r.map.writer))?.value as EntryV2;
  return { r, run, f, prep, proof, pub, entry };
}

/** A throwaway second look: nothing like render/v1, and drawn from the reading alone. */
const throwawaySkin = (reading: Reading) =>
  reading.petals.map((p) => `<rect id="${p.id}" w="${p.width}" h="${p.height}"/>`).join('\n');

describe('flower/v1 rows verify exactly as before, by their own version', () => {
  const entry = REAL_ROW.value;

  test('the real row is what it should be', () => {
    expect(REAL_ROW.key).toBe('petal/v1/spec/9ac16c8917aa5ca579c8421a');
    expect(entry).toMatchObject({ petal: 'flower/v1', id: '9ac16c8917aa5ca579c8421a' });
    expect(entry.provenance.maker?.account_id).toBe('elcocoel.testnet');
  });

  test('its id and signature check out, by the v1 rule written out by hand', () => {
    const { id, ...withoutId } = entry;
    expect(sha256Hex(canonicalJson(withoutId)).slice(0, 24)).toBe(id);
    expect(entryId(entry)).toBe(id);
    const draft = { ...withoutId, provenance: { ...withoutId.provenance, maker: null } };
    const hash = sha256Hex(canonicalJson(draft));
    expect(entrySha256(entry)).toBe(hash);
    expect(entry.provenance.maker?.message).toBe(publishMessage(hash));
    expect(verifyEntry(entry, { id, recipient: REAL_ROW.current_account_id })).toEqual({
      entry_hash: true,
      maker_signature: true,
      model_signature: 'absent',
    });
  });

  test('on the map: get_flower and list_flowers show it, verified', async () => {
    const r = await rig();
    await r.map.write({ [REAL_ROW.key]: entry });
    const run = runner(r.ctx);
    const got = await run('get_flower', { id: entry.id });
    expect(got).toMatchObject({
      where: 'map',
      verified: { entry_hash: true, maker_signature: true },
    });
    expect((got.entry as EntryV1).render_sha256).toBe(entry.render_sha256);
    const list = (await run('list_flowers', {})).flowers as { id: string }[];
    expect(list.map((f) => f.id)).toContain(entry.id);
  });

  test('for a v1 row the drawing hash is still covered: changing it breaks the row', () => {
    const changed = { ...entry, render_sha256: 'f'.repeat(64) };
    expect(verifyEntry(changed)).toMatchObject({ entry_hash: false, maker_signature: false });
  });

  test('and calling it v2 to shed its receipt breaks it too', () => {
    const { render_sha256: _drawing, ...rest } = entry;
    const claimed = { ...rest, petal: 'flower/v2' } as unknown as Entry;
    expect(verifyEntry(claimed)).toMatchObject({ entry_hash: false, maker_signature: false });
  });

  test('the hero fixture, a v1 entry with no maker, still counts its hash', () => {
    const hero = JSON.parse(
      readFileSync(join(FIXTURES, 'map', '3394fb875bf97c1af8191566.json'), 'utf8'),
    ) as EntryV1;
    expect(verifyEntry(hero).entry_hash).toBe(true);
  });
});

describe('flower/v2: identity without the drawing', () => {
  test('publish: flower/v2, verified, with the drawing as a receipt beside it', async () => {
    const { run, f, prep, pub, entry } = await published();
    expect(entry.petal).toBe('flower/v2');
    expect(entry).not.toHaveProperty('render_sha256');
    expect(entry.drawn_with).toEqual({
      render: 'render/v1',
      sha256: f.rendered.render_sha256,
    });
    expect(pub.id).toBe(entry.id);
    expect(prep.message).toBe(publishMessage(entrySha256(entry)));
    expect(await run('get_flower', { id: pub.id })).toMatchObject({
      where: 'map',
      verified: { entry_hash: true, maker_signature: true, model_signature: 'absent' },
    });
  });

  test('what is hashed and signed: the facts, the build and who made it, and no drawing', async () => {
    const { entry } = await published();
    const { id, drawn_with: _receipt, ...signed } = entry;
    expect(sha256Hex(canonicalJson(signed)).slice(0, 24)).toBe(id);
    expect(Object.keys(signed).sort()).toEqual(
      ['interpretation', 'petal', 'provenance', 'snapshot', 'spec', 'spec_sha256', 'title'].sort(),
    );
  });

  test('redrawn by a changed skin, it keeps its id and its signature', async () => {
    const { r, run, entry, pub } = await published();
    const snapshot = await r.ctx.store.get(entry.spec.snapshot.sha256);
    if (!snapshot) throw new Error('no snapshot');
    const today = renderFlower(entry.spec, snapshot);
    const redrawn = throwawaySkin(readFlower(entry.spec, snapshot));
    expect(sha256Hex(redrawn)).not.toBe(today.render_sha256);

    const again: EntryV2 = {
      ...entry,
      drawn_with: { render: 'render/throwaway', sha256: sha256Hex(redrawn) },
    };
    expect(entryId(again)).toBe(entry.id);
    expect(verifyEntry(again, { id: entry.id, recipient: 'petals.testnet' })).toMatchObject({
      entry_hash: true,
      maker_signature: true,
    });

    // even a row whose receipt is another skin's, or gone, still shows as this flower
    await r.map.write({ [pub.key as string]: again });
    expect(await run('get_flower', { id: entry.id })).toMatchObject({
      verified: { entry_hash: true, maker_signature: true },
      entry: { drawn_with: { render: 'render/throwaway' } },
    });
    const { drawn_with: _gone, ...bare } = again;
    expect(verifyEntry(bare as EntryV2).maker_signature).toBe(true);
  });

  test('anything the maker signed cannot change', async () => {
    const { entry } = await published();
    const check = (e: EntryV2) => verifyEntry({ ...e, id: entryId(e) });
    expect(check(entry).maker_signature).toBe(true);
    expect(check({ ...entry, title: 'forged' }).maker_signature).toBe(false);
    expect(
      check({
        ...entry,
        interpretation: { ...entry.interpretation, summary: 'A very different reading of it.' },
      }).maker_signature,
    ).toBe(false);
    expect(
      check({ ...entry, snapshot: { ...entry.snapshot, urls: ['https://elsewhere.test/x'] } })
        .maker_signature,
    ).toBe(false);
    const other = structuredClone(entry.spec) as Spec;
    other.selection.petals = 5;
    expect(check({ ...entry, spec: other, spec_sha256: specHash(other) }).maker_signature).toBe(
      false,
    );
  });

  test('publishing no longer refuses over a drawing: a stale receipt or old draft goes through', async () => {
    const r = await rig();
    const run = runner(r.ctx);
    const f = await flow(run);
    const plain = await run('prepare_publish', { entry: f.draft });
    expect(plain.error).toBeUndefined();

    const stale = await run('prepare_publish', {
      entry: { ...f.draft, drawn_with: { render: 'render/v0', sha256: 'f'.repeat(64) } },
    });
    expect(stale.entry_sha256).toBe(plain.entry_sha256);

    // a draft made before this version: flower/v1, with a hash of a drawing nobody can reproduce
    const old = await run('prepare_publish', {
      entry: { ...f.draft, petal: 'flower/v1', render_sha256: 'f'.repeat(64) },
    });
    expect(old.entry_sha256).toBe(plain.entry_sha256);

    const proof = r.signer.sign({
      message: old.message as string,
      nonce: old.nonce as string,
      recipient: old.recipient as string,
    });
    const pub = await run('publish_flower', { entry_sha256: old.entry_sha256, proof });
    const entry = (await r.map.get(pub.key as string, r.map.writer))?.value as EntryV2;
    expect(entry).toMatchObject({
      petal: 'flower/v2',
      drawn_with: { render: 'render/v1', sha256: f.rendered.render_sha256 },
    });
    expect(entry).not.toHaveProperty('render_sha256');
  });

  test('prepare still refuses what is wrong with the facts', async () => {
    const r = await rig();
    const run = runner(r.ctx);
    const f = await flow(run);
    const unknown = await run('prepare_publish', { entry: { ...f.draft, petal: 'flower/v9' } });
    expect(unknown.error?.code).toBe('bad_input');
    const spec = structuredClone(f.spec) as unknown as Spec;
    spec.encodings.width.max_ratio = 5;
    const bad = await run('prepare_publish', {
      entry: { ...f.draft, spec, spec_sha256: specHash(spec) },
    });
    expect(bad.error?.code).toBe('bad_input');
  });
});
