// The mapping runs' loader: each of Petals' formats checked and refused with its reasons, a good
// reading kept and drawn as Petals' own mapping, a kept mark left unless --replace, raw receipts left as evidence.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { canonicalJson, makeClaim, sha256Hex } from '@petal/core';
import type { ClaimDraft } from '@petal/core/types';
import { Hono } from 'hono';
import { beforeEach, describe, expect, test } from 'vitest';
import { privateStore } from '../src/drafts.ts';
import { httpApp } from '../src/http/app.ts';
import { mapsOf, mapViews } from '../src/map.ts';
import { mapClaims } from '../src/mapping-claims.ts';
import { loadMapping } from '../src/mapping-load.ts';
import { rig, type TestRig } from './helpers.ts';

const MOLOCH = 'c46437a2afb76cc7c3b07195da499a80a93bd3f09f2ce342436a366c68009a9c';
const DAO = 'eip155:1:0x1fd169a4f5c59acf79d0fd5d91d1201ef1bce9f1';
let r: TestRig;
beforeEach(async () => {
  r = await rig();
});

function folder() {
  const root = mkdtempSync(join(tmpdir(), 'petal-waves-'));
  const dir = join(root, 'ethereum', 'moloch');
  mkdirSync(dir, { recursive: true });
  const fixtures = join(import.meta.dirname, '..', '..', '..', 'fixtures', 'snapshots');
  writeFileSync(
    join(dir, 'snapshot.json'),
    gunzipSync(readFileSync(join(fixtures, `${MOLOCH}.json.gz`))),
  );
  const at = '2026-11-11T18:00:00.000Z';
  writeFileSync(
    join(dir, 'mark.json'),
    JSON.stringify({
      petal: 'mark/v1',
      about: DAO,
      name: {
        value: 'Moloch DAO',
        status: 'self-declared',
        source: 'daohaus',
        ref: 'https://data.daohaus.club/dao/x',
        at,
      },
      symbol: null,
      logo: null,
      read_at: at,
    }),
  );
  writeFileSync(
    join(dir, 'claim-bad.json'),
    JSON.stringify({ petal: 'claim/v3', verb: 'noted', kind: 'observed' }),
  );
  writeFileSync(join(dir, 'get_policy.json'), JSON.stringify({ result: 'a raw receipt' }));
  return root;
}

describe('loading a mapping run', () => {
  test('--dry checks and keeps nothing; a load draws the reading, credited, and keeps its mark', async () => {
    const root = folder();
    const dry = await loadMapping(r.ctx, root, { by: 'mapping.petals.near', dry: true });
    expect(dry).toMatchObject({ files: 4, evidence: 1, drawn: 0 });
    expect(dry.refused).toHaveLength(1);
    expect(dry.refused[0]?.file).toBe('ethereum/moloch/claim-bad.json');
    expect(mapsOf(await mapViews(r.ctx))).toHaveLength(0);

    const done = await loadMapping(r.ctx, root, { by: 'mapping.petals.near' });
    expect(done).toMatchObject({
      drawn: 1,
      formats: { snapshot: { good: 1, kept: 1 }, mark: { good: 1, kept: 1 } },
    });
    const [card] = mapsOf(await mapViews(r.ctx));
    expect(card).toMatchObject({ id: DAO, name: 'Moloch DAO' });
    expect(card?.readings[0]?.drawings[0]?.made_by).toBe('mapping.petals.near');
    expect(
      JSON.parse((await privateStore(r.ctx.config).mark.get(DAO))?.body ?? '{}').name.value,
    ).toBe('Moloch DAO');
  });

  test('a mark already kept stays, unless --replace puts the run’s in its place', async () => {
    const root = folder();
    await privateStore(r.ctx.config).mark.put({
      about: DAO,
      body: '{"petal":"mark/v2","kept":"first"}',
      read_at: 'x',
    });
    const left = await loadMapping(r.ctx, root, { by: 'mapping.petals.near' });
    expect(left.formats.mark).toMatchObject({ good: 1, kept: 0, left: 1 });
    expect((await privateStore(r.ctx.config).mark.get(DAO))?.body).toContain('"kept":"first"');
    await loadMapping(r.ctx, root, { by: 'mapping.petals.near', replace: true });
    expect((await privateStore(r.ctx.config).mark.get(DAO))?.body).toContain('Moloch DAO');
  });

  test("a mapping run's manifest says which files load, in each of the runs' shapes; an unlisted one is held", async () => {
    const root = folder();
    const dir = join(root, 'ethereum', 'moloch');
    const mark = JSON.parse(readFileSync(join(dir, 'mark.json'), 'utf8'));
    const sha = sha256Hex(canonicalJson(mark));
    const shapes = [
      { objects: [{ path: 'moloch/mark.json', load: true, canonical_sha256: sha }] },
      { daos: [{ artifacts: [{ file: 'moloch/mark.json', canonical_sha256: sha }] }] },
      {
        artifacts: [
          { file: 'moloch/mark.json', role: 'load-candidate', canonical_json_sha256: sha },
        ],
      },
      {
        records: [
          { path: 'moloch/mark.json', status: 'importable-with-stated-coverage', sha256: sha },
        ],
      },
      { files: [{ path: 'moloch/mark.json', loadable: true, canonical_sha256: sha }] },
    ];
    for (const m of shapes) {
      writeFileSync(join(root, 'ethereum', 'IMPORT-MANIFEST.json'), JSON.stringify(m));
      const dry = await loadMapping(r.ctx, root, { by: 'mapping.petals.near', dry: true });
      // the mark loads; the snapshot and the bad claim aren't listed, so they're held; the manifest is evidence
      expect(dry).toMatchObject({ held: 2, evidence: 2, formats: { mark: { good: 1 } } });
      expect(dry.refused).toEqual([]);
    }
    // a role or status that doesn't load holds it; a hash that isn't its own refuses it
    writeFileSync(
      join(root, 'ethereum', 'IMPORT-MANIFEST.json'),
      JSON.stringify({
        artifacts: [
          { file: 'moloch/mark.json', role: 'research-only-hold', canonical_json_sha256: sha },
        ],
        records: [{ path: 'moloch/snapshot.json', status: 'importable', sha256: '0'.repeat(64) }],
      }),
    );
    const held = await loadMapping(r.ctx, root, { by: 'mapping.petals.near', dry: true });
    expect(held).toMatchObject({ held: 2 });
    expect(held.refused.map((x) => x.file)).toEqual(['ethereum/moloch/snapshot.json']);
  });

  test("a good claim is kept as Petals' mapping's, and its map answers it for every viewer", async () => {
    const root = folder();
    const dir = join(root, 'ethereum', 'moloch');
    const snapshot = JSON.parse(readFileSync(join(dir, 'snapshot.json'), 'utf8'));
    // an older reading names its petals by bare address; the claim, by the account on its chain
    const member = `eip155:1:${String(snapshot.participants[0].id).toLowerCase()}`;
    const at = '2026-11-11T18:00:00.000Z';
    const claim = makeClaim(
      {
        subject: member,
        verb: 'noted',
        object: { value: 'a member of the guild since its first year' },
        kind: 'sourced',
        issued_at: at,
        by: 'tool:test-wave@1',
        evidence: [
          {
            type: 'snapshot',
            url: 'https://example.org/receipt',
            snapshot_sha256: MOLOCH,
            found_by: 'tool:test-wave@1',
            found_at: at,
          },
        ],
      } as ClaimDraft,
      'claim/v3',
    );
    writeFileSync(join(dir, 'claim-good.json'), JSON.stringify(claim));
    const done = await loadMapping(r.ctx, root, { by: 'mapping.petals.near' });
    expect(done.formats.claim).toMatchObject({ good: 1, kept: 1 });
    // loaded again, it's kept once
    const again = await loadMapping(r.ctx, root, { by: 'mapping.petals.near' });
    expect(again.formats.claim).toMatchObject({ good: 1, kept: 0, left: 1 });
    expect(await mapClaims(r.ctx, DAO)).toEqual([{ ...claim, confidence: null }]);
    expect(
      await mapClaims(r.ctx, 'eip155:1:0x0000000000000000000000000000000000000000'),
    ).toBeNull();

    const app = new Hono();
    app.route(
      '/',
      httpApp(r.ctx, { gate: { subjectOf: async () => null, refuseForeign: () => null } }),
    );
    const res = await app.request(`/api/v1/maps/${encodeURIComponent(DAO)}/claims`);
    expect(await res.json()).toMatchObject({ about: DAO, claims: [claim] });
  });

  test("a claim about an account the map's readings name in their params (its DAO's governance contract) is the map's", async () => {
    const root = folder();
    const dir = join(root, 'ethereum', 'moloch');
    const snapshot = JSON.parse(readFileSync(join(dir, 'snapshot.json'), 'utf8'));
    const GOV = '0x00000000000000000000000000000000000000aa';
    snapshot.network.params = { ...snapshot.network.params, governance_contract: GOV };
    writeFileSync(join(dir, 'snapshot.json'), JSON.stringify(snapshot));
    const at = '2026-11-11T18:00:00.000Z';
    const claim = makeClaim(
      {
        subject: `eip155:1:${GOV}`,
        verb: 'noted',
        object: { value: 'the governance contract its members vote through' },
        kind: 'sourced',
        issued_at: at,
        by: 'tool:test-wave@1',
        evidence: [
          {
            type: 'page',
            url: 'https://example.org/dao',
            found_by: 'tool:test-wave@1',
            found_at: at,
          },
        ],
      } as ClaimDraft,
      'claim/v3',
    );
    writeFileSync(join(dir, 'claim-gov.json'), JSON.stringify(claim));
    const done = await loadMapping(r.ctx, root, { by: 'mapping.petals.near' });
    expect(done.drawn).toBe(1);
    expect(await mapClaims(r.ctx, DAO)).toEqual([{ ...claim, confidence: null }]);
  });
});
