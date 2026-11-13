// keep_data and list_data: what an agent found or made, kept privately in the person's project by its
// canonical sha256, checked as the person's own project checks it. A claim goes to the annotations, a reading to
// the store, the rest to project_data. Over HTTP, through the project's links, as people's agents call them.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { canonicalJson, makeClaim, sha256Hex } from '@petal/core';
import type { ClaimDraft } from '@petal/core/types';
import { Hono } from 'hono';
import { beforeEach, describe, expect, test } from 'vitest';
import { httpApp } from '../src/http/app.ts';
import { findSnapshot } from '../src/tools/shared.ts';
import { rig, type TestRig } from './helpers.ts';

// biome-ignore lint/suspicious/noExplicitAny: walking tool outputs
type Out = Record<string, any>;
let r: TestRig;
beforeEach(async () => {
  r = await rig();
});
const FIXTURES = join(import.meta.dirname, '..', '..', 'core', 'schema', 'fixtures');
const MOLOCH = 'c46437a2afb76cc7c3b07195da499a80a93bd3f09f2ce342436a366c68009a9c';

function door() {
  const app = new Hono();
  app.route(
    '/',
    httpApp(r.ctx, {
      gate: {
        subjectOf: async (c) => c.req.header('x-test-subject') ?? null,
        callerOf: async (c) => ({
          subject: c.req.header('x-test-subject') ?? null,
          credential: null,
          by: null,
        }),
        refuseForeign: () => null,
      },
    }),
  );
  return app;
}
const send = async (app: Hono, method: string, path: string, json?: unknown, subject?: string) => {
  const res = await app.request(path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(subject ? { 'x-test-subject': subject } : {}),
    },
    ...(json === undefined ? {} : { body: JSON.stringify(json) }),
  });
  return { status: res.status, body: (await res.json()) as Out };
};
async function project(app: Hono) {
  const owner = 'prs_a';
  const id = (await send(app, 'POST', '/api/v1/explorations', { question: 'who?' }, owner)).body
    .exploration as string;
  const token = async (scope: string) =>
    (
      (await send(app, 'POST', `/api/v1/explorations/${id}/links`, { scope }, owner)).body
        .url as string
    )
      .split('/')
      .pop() as string;
  return { id, owner, cont: await token('continue'), read: await token('read') };
}

describe('what an agent keeps in a project', () => {
  test('a mark, a reading and a claim, each by its sha256, kept once; the project lists them', async () => {
    const app = door();
    const { id, cont, read } = await project(app);
    const mark = JSON.parse(readFileSync(join(FIXTURES, 'mark.v1.json'), 'utf8'));
    const kept = await send(app, 'POST', `/api/v1/explorations/${cont}/data`, { document: mark });
    expect(kept.status).toBe(200);
    expect(kept.body).toMatchObject({
      exploration: id,
      sha256: sha256Hex(canonicalJson(mark)),
      petal: 'mark/v1',
      kept: true,
    });
    // the same again: held already
    const again = await send(app, 'POST', `/api/v1/explorations/${cont}/data`, { document: mark });
    expect(again.body.kept).toBe(false);

    // a reading goes to the store too, so propose_spec can draw it
    const snapshot = JSON.parse(
      gunzipSync(
        readFileSync(
          join(import.meta.dirname, '..', '..', '..', 'fixtures', 'snapshots', `${MOLOCH}.json.gz`),
        ),
      ).toString('utf8'),
    );
    const reading = await send(app, 'POST', `/api/v1/explorations/${cont}/data`, {
      document: snapshot,
    });
    expect(reading.body).toMatchObject({ sha256: MOLOCH, petal: 'snapshot/v1', kept: true });
    expect(await findSnapshot(r.ctx, MOLOCH)).toBeTruthy();

    // a claim, which may name a person here, goes to the project's annotations
    const at = '2026-11-11T18:00:00.000Z';
    const claim = makeClaim(
      {
        subject: 'near:mainnet:alice.near',
        verb: 'named',
        object: { value: 'Alice Example' },
        kind: 'sourced',
        issued_at: at,
        by: 'tool:test-agent@1',
        evidence: [
          {
            type: 'page',
            url: 'https://example.org/team',
            found_by: 'tool:test-agent@1',
            found_at: at,
          },
        ],
      } as ClaimDraft,
      'claim/v4',
    );
    const named = await send(app, 'POST', `/api/v1/explorations/${cont}/data`, { document: claim });
    expect(named.body).toMatchObject({ petal: 'claim/v4', kept: true });
    const notes = await send(app, 'GET', `/api/v1/explorations/${read}/annotations`);
    expect(notes.body.annotations.map((a: Out) => a.claim.id)).toEqual([claim.id]);

    // any link lists them, oldest first; claims are listed by list_annotations
    const listed = await send(app, 'GET', `/api/v1/explorations/${read}/data`);
    expect(listed.body.data.map((d: Out) => [d.petal, d.about])).toEqual([
      ['mark/v1', mark.about],
      ['snapshot/v1', snapshot.network.id],
    ]);
    const marks = await send(app, 'GET', `/api/v1/explorations/${read}/data?petal=mark`);
    expect(marks.body.data).toHaveLength(1);
  });

  test("a bad document is refused with its reasons; a read link and a visitor can't keep", async () => {
    const app = door();
    const { id, cont, read } = await project(app);
    const bad = await send(app, 'POST', `/api/v1/explorations/${cont}/data`, {
      document: { petal: 'mark/v1', about: 'x' },
    });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatchObject({ code: 'bad_input' });
    const mark = JSON.parse(readFileSync(join(FIXTURES, 'mark.v1.json'), 'utf8'));
    const reader = await send(app, 'POST', `/api/v1/explorations/${read}/data`, { document: mark });
    expect(reader.body.error).toMatchObject({ code: 'unauthorised' });
    const visitor = await send(app, 'POST', `/api/v1/explorations/${id}/data`, { document: mark });
    expect(visitor.status).toBeGreaterThanOrEqual(400);
  });
});
