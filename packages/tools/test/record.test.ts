// The publication record on the server (wave 8; specs/005-mapping-brain/composition.md): what was on the map before
// enters it once, Petals' rows as "imported, unsigned" by mapping.petals.near and a press signed before the protocol
// as its author's with its proof; then the map's layers, its authors with their three counts, a composed reading's
// credit and an author's credit/v1 all come from the record alone. Offline.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalJson, sha256Hex } from '@petal/core';
import { modules } from '@petal/inputs';
import { beforeEach, describe, expect, test } from 'vitest';
import { privateStore } from '../src/drafts.ts';
import {
  appendPublication,
  authorOf,
  compositionOf,
  creditFor,
  mapRecord,
  readingCredit,
  recordOf,
} from '../src/record.ts';
import { importRecord } from '../src/record-import.ts';
import { callTool } from '../src/registry.ts';
import { loadSnapshot } from '../src/tools/shared.ts';
import { rig, type TestRig } from './helpers.ts';

// biome-ignore lint/suspicious/noExplicitAny: walking tool outputs
type Out = Record<string, any>;

const MOLOCH = 'c46437a2afb76cc7c3b07195da499a80a93bd3f09f2ce342436a366c68009a9c';
const MAP = 'eip155:1:0x1fd169a4f5c59acf79d0fd5d91d1201ef1bce9f1';
const ELCO = 'near:mainnet:petals.near';
const AT = '2026-11-12T22:07:10.243Z';

let r: TestRig;
let member = '';

beforeEach(async () => {
  r = await rig();
  r.ctx.modules = {
    ...r.ctx.modules,
    'moloch-v1': modules['moloch-v1'] as NonNullable<(typeof modules)[string]>,
  };
  const proposed = (await callTool(
    'propose_spec',
    { network: 'moloch-v1', sha256: MOLOCH },
    r.ctx,
  )) as Out;
  const drawn = (await callTool('render_flower', { spec: proposed.spec }, r.ctx)) as Out;
  const store = privateStore(r.ctx.config);
  await store.draft.label(drawn.spec_sha256, {
    name: 'Founders Guild v1',
    made_by: 'mapping.petals.near',
  });
  const mark = {
    petal: 'mark/v1',
    about: MAP,
    name: {
      value: 'Moloch DAO',
      status: 'self-declared',
      source: 'daohaus',
      ref: 'https://data.daohaus.club/dao/x',
      at: AT,
    },
    symbol: null,
    logo: null,
    read_at: AT,
  };
  await store.mark.put({ about: MAP, body: JSON.stringify(mark), read_at: AT });
  // a press signed before the protocol: one name, published with its NEP-413 proof
  const s = await loadSnapshot(r.ctx, MOLOCH);
  member = `eip155:1:${String(s.participants[0]?.id).toLowerCase()}`;
  const claim = {
    petal: 'claim/v3',
    id: 'c-named-1',
    issued_at: AT,
    subject: member,
    verb: 'named',
    object: { value: 'Ameen' },
    kind: 'sourced',
    by: ELCO,
    evidence: [{ type: 'snapshot', snapshot_sha256: MOLOCH, found_by: ELCO, found_at: AT }],
  };
  const message = JSON.stringify({
    petal: 'publish-data/v1',
    about: MAP,
    claims: 1,
    sha256: 'f'.repeat(64),
  });
  await store.annotation.add([
    {
      owner: 'published',
      id: claim.id,
      exploration: `published:${'f'.repeat(64)}`,
      subject: member,
      verb: 'named',
      kind: 'sourced',
      body: JSON.stringify(claim),
      credential: JSON.stringify({
        proof: {
          type: 'nep413',
          account_id: 'petals.near',
          public_key: 'ed25519:K',
          signature: 'S',
          message,
          nonce: 'N',
          recipient: 'petals.elementarycomplexity.com',
        },
      }),
      created_at: AT,
      place: 0,
    },
  ]);
});

describe('the import: what was on the map before the record', () => {
  test('--dry appends nothing; the import adds one unsigned publication per map and the signed press, once', async () => {
    const dry = await importRecord(r.ctx, { dry: true });
    expect(dry.publications.map((p) => [p.author, p.signed, p.layers])).toEqual([
      ['mapping.petals.near', false, { snapshot: 1, mark: 1 }],
      [ELCO, true, { claim: 1 }],
    ]);
    expect(await recordOf(r.ctx)).toEqual([]);
    await importRecord(r.ctx);
    const record = await recordOf(r.ctx, MAP);
    expect(
      record.map((e) => [e.seq, e.publication.author, e.publication.proof?.standard ?? null]),
    ).toEqual([
      [1, 'mapping.petals.near', null],
      [2, ELCO, 'nep413'],
    ]);
    // a second run leaves what's there
    const again = await importRecord(r.ctx);
    expect(again.publications).toEqual([]);
    expect(await recordOf(r.ctx)).toHaveLength(2);
  });

  test('a press since the record began is its own publication: the import leaves it', async () => {
    await privateStore(r.ctx.config).annotation.add([
      {
        owner: 'published',
        id: 'c-named-2',
        exploration: `published:${'e'.repeat(64)}`,
        subject: member,
        verb: 'named',
        kind: 'sourced',
        body: JSON.stringify({ id: 'c-named-2', by: 'near:mainnet:bob.near' }),
        credential: JSON.stringify({
          publication: 'e'.repeat(64),
          proof: {
            standard: 'nep413',
            message: 'Petals: publish 1 layer about RaidGuild in your name.',
          },
        }),
        created_at: AT,
        place: 0,
      },
    ]);
    const dry = await importRecord(r.ctx, { dry: true });
    expect(dry.publications.map((p) => p.author)).toEqual(['mapping.petals.near', ELCO]);
  });
});

describe("the map from the record: its layers, its authors' three counts, a reading's credit, credit/v1", () => {
  test('two authors on one map, each credited for their own facts', async () => {
    await importRecord(r.ctx);
    const record = await mapRecord(r.ctx, MAP);
    expect(record.layers.map((l) => l.petal).sort()).toEqual([
      'claim/v3',
      'mark/v1',
      'snapshot/v1',
    ]);
    expect(record.authors.map((a) => [a.author, a.name, a.imported])).toEqual([
      ['mapping.petals.near', "Petals' own mapping", true],
      [ELCO, 'petals.near', false],
    ]);
    const elco = record.authors.find((a) => a.author === ELCO);
    expect([elco?.first, elco?.confirmed, elco?.built_on]).toEqual([1, 0, 0]);
    expect(record.differs).toBe(0);
    const map = await compositionOf(r.ctx, MAP);
    const s = await loadSnapshot(r.ctx, MOLOCH);
    const credit = readingCredit(map as NonNullable<typeof map>, s);
    const id = s.participants[0]?.id as string;
    expect(credit.pieces.name?.[id]?.by).toEqual([ELCO]);
    expect(Object.values(credit.pieces)[0]).toBeDefined();
    expect(credit.authors[ELCO]).toEqual({ name: 'petals.near', imported: false });
    const elcoCredit = await creditFor(r.ctx, ELCO);
    expect(elcoCredit.totals).toEqual({ layers: 1, first: 1, confirmed: 0, built_on: 0 });
    expect(elcoCredit.hash).toMatch(/^[0-9a-f]{64}$/);
    // a bare NEAR account is the same author (LOBBY, 13 Nov: /credit/petals.near answered zeros)
    expect(authorOf('petals.near')).toBe(ELCO);
    // Petals' own mapping is named bare in the record, however it's asked for
    expect(authorOf('mapping.petals.near')).toBe('mapping.petals.near');
    expect(authorOf('near:mainnet:mapping.petals.near')).toBe('mapping.petals.near');
    expect(authorOf('alice.testnet')).toBe('near:testnet:alice.testnet');
    expect(authorOf(ELCO)).toBe(ELCO);
    expect((await creditFor(r.ctx, authorOf('petals.near'))).hash).toBe(elcoCredit.hash);
  });

  test('the record only grows: an entry appended twice is one entry', async () => {
    await importRecord(r.ctx);
    const [first] = await recordOf(r.ctx, MAP);
    if (!first) throw new Error('no entry');
    const again = await appendPublication(r.ctx, first.publication, new Map());
    expect(again.seq).toBe(first.seq);
    expect(await recordOf(r.ctx)).toHaveLength(2);
    expect(sha256Hex(canonicalJson(first.publication))).toBe(first.hash);
  });
});

test('the import script names what it would do', () => {
  const script = readFileSync(
    join(import.meta.dirname, '..', '..', '..', 'scripts', 'publish-import.ts'),
    'utf8',
  );
  expect(script).toContain('--dry');
});
