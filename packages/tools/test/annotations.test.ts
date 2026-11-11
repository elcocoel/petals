// Annotations kept per project (annotation-layer.md step 2): what a person or an agent adds about an account,
// one or many at once, all or none, listed back by project and by account. Over HTTP, through the project's
// links, as petal.mjs and the page call them. Every account, name and URL here is invented.
import { Hono } from 'hono';
import { beforeEach, describe, expect, test } from 'vitest';
import { httpApp } from '../src/http/app.ts';
import { rig, type TestRig } from './helpers.ts';

// biome-ignore lint/suspicious/noExplicitAny: walking tool outputs
type Out = Record<string, any>;

let r: TestRig;
beforeEach(async () => {
  r = await rig();
});

const ADA = 'eip155:100:0x1111111111111111111111111111111111111111';
const GUILD = 'eip155:100:0x2222222222222222222222222222222222222222';
const TX = `0x${'ab'.repeat(32)}`;
const ALICE = 'near:mainnet:alice.near';
/** Codex's findings, as its file sends them: claim/v2 without id and by. */
const FOUND = [
  {
    subject: ADA,
    verb: 'named',
    object: { value: 'Ada' },
    kind: 'sourced',
    evidence: [
      {
        url: `https://gnosisscan.io/tx/${TX}`,
        tx: `eip155:100:${TX}`,
        proposal: 'proposal:eip155:100:0x3333333333333333333333333333333333333333:7',
        quote: 'Elect Ada as Keeper of the Handbook',
        note: 'Incoming wearer. Proposal passed; action succeeded.',
      },
    ],
    issued_at: '2026-11-10T12:00:00Z',
  },
  {
    subject: GUILD,
    verb: 'named',
    object: { value: 'Guild Treasury' },
    kind: 'inferred',
    method: 'codex/research@2026-11-10',
    qualifiers: { grounds: 'research' },
    evidence: [{ url: 'https://github.com/example/rips/issues/9', quote: 'Fund the treasury' }],
    issued_at: '2026-11-10T12:00:00Z',
  },
];

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
          by: c.req.header('x-test-by') ?? null,
        }),
        refuseForeign: () => null,
      },
    }),
  );
  return app;
}
const send = async (
  app: Hono,
  method: string,
  path: string,
  json?: unknown,
  who: { subject?: string; by?: string } = {},
) => {
  const res = await app.request(path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(who.subject ? { 'x-test-subject': who.subject } : {}),
      ...(who.by ? { 'x-test-by': who.by } : {}),
    },
    ...(json === undefined ? {} : { body: JSON.stringify(json) }),
  });
  return { status: res.status, body: (await res.json()) as Out };
};

/** A project its owner started, with a continue link and a read link. */
async function project(app: Hono, question = 'who?') {
  const owner = { subject: 'prs_a' };
  const id = (await send(app, 'POST', '/api/v1/explorations', { question }, owner)).body
    .exploration as string;
  const token = async (scope: string) =>
    (
      (await send(app, 'POST', `/api/v1/explorations/${id}/links`, { scope }, owner)).body
        .url as string
    )
      .split('/')
      .pop() as string;
  return { id, cont: await token('continue'), read: await token('read') };
}

describe('annotations kept per project', () => {
  test("an agent's findings go in at once, each with its source, and list back", async () => {
    const app = door();
    const { id, cont, read } = await project(app);
    const added = await send(app, 'POST', `/api/v1/explorations/${cont}/annotations`, {
      annotations: FOUND,
      as: 'Codex',
    });
    expect(added.status).toBe(200);
    expect(added.body).toMatchObject({ exploration: id, added: 2, existed: 0 });
    expect(added.body.ids).toHaveLength(2);
    // the same file again changes nothing
    const again = await send(app, 'POST', `/api/v1/explorations/${cont}/annotations`, {
      annotations: FOUND,
      as: 'Codex',
    });
    expect(again.body).toMatchObject({ added: 0, existed: 2, ids: added.body.ids });
    // any link reads them, each with what it rests on, and who answers for it
    const listed = await send(app, 'GET', `/api/v1/explorations/${read}/annotations`);
    expect(listed.status).toBe(200);
    expect(listed.body.annotations.map((a: Out) => a.claim.id)).toEqual(added.body.ids);
    expect(listed.body.annotations[0]).toMatchObject({
      exploration: id,
      claim: {
        petal: 'claim/v2',
        subject: ADA,
        verb: 'named',
        object: { value: 'Ada' },
        kind: 'sourced',
        by: 'tool:codex@1',
        evidence: [{ quote: 'Elect Ada as Keeper of the Handbook', tx: `eip155:100:${TX}` }],
      },
    });
    expect(listed.body.annotations[1].claim).toMatchObject({
      kind: 'inferred',
      method: 'codex/research@2026-11-10',
    });
  });

  test("all or none: one that isn't a claim keeps every one out, and says why", async () => {
    const app = door();
    const { cont } = await project(app);
    const bad = { ...FOUND[0], object: { value: 'Ada\nByron' } };
    const res = await send(app, 'POST', `/api/v1/explorations/${cont}/annotations`, {
      annotations: [FOUND[1], bad],
      as: 'codex',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/None was added: annotation 2: \/object/);
    const listed = await send(app, 'GET', `/api/v1/explorations/${cont}/annotations`);
    expect(listed.body.annotations).toEqual([]);
  });

  test('who answers for it comes from the door, never from the writer', async () => {
    const app = door();
    const { id, cont } = await project(app);
    // an agent's link says which agent it is
    const nameless = await send(app, 'POST', `/api/v1/explorations/${cont}/annotations`, {
      annotations: [FOUND[0]],
    });
    expect(nameless.status).toBe(400);
    expect(nameless.body.error.message).toMatch(/Say which agent you are with as/);
    const posing = await send(app, 'POST', `/api/v1/explorations/${cont}/annotations`, {
      annotations: [{ ...FOUND[0], by: ALICE }],
      as: 'codex',
    });
    expect(posing.status).toBe(400);
    expect(posing.body.error.message).toMatch(/by is filled by Petals \(tool:codex@1\)/);
    // the person, signed in: their own word names their account
    const own = {
      subject: ADA,
      verb: 'named',
      object: { value: 'Ada' },
      kind: 'stated',
      evidence: [],
    };
    const unsigned = await send(
      app,
      'POST',
      `/api/v1/explorations/${id}/annotations`,
      { annotations: [own] },
      { subject: 'prs_a' },
    );
    expect(unsigned.status).toBe(401);
    const theirs = await send(
      app,
      'POST',
      `/api/v1/explorations/${id}/annotations`,
      { annotations: [own] },
      { subject: 'prs_a', by: ALICE },
    );
    expect(theirs.status).toBe(200);
    const listed = await send(app, 'GET', `/api/v1/explorations/${cont}/annotations`);
    expect(listed.body.annotations[0].claim).toMatchObject({ kind: 'stated', by: ALICE });
  });

  test('a read link reads them and adds none', async () => {
    const app = door();
    const { read } = await project(app);
    const res = await send(app, 'POST', `/api/v1/explorations/${read}/annotations`, {
      annotations: FOUND,
      as: 'codex',
    });
    expect(res.status).toBe(401);
  });

  test('by account: everything the owner holds about one, from any of their projects', async () => {
    const app = door();
    const first = await project(app, 'RaidGuild');
    const second = await project(app, 'Treasuries');
    await send(app, 'POST', `/api/v1/explorations/${first.cont}/annotations`, {
      annotations: FOUND,
      as: 'codex',
    });
    const note = {
      subject: ADA,
      verb: 'noted',
      object: { value: 'Ada also signs for the treasury.' },
      kind: 'sourced',
      evidence: [{ url: 'https://example.org/signers' }],
    };
    await send(app, 'POST', `/api/v1/explorations/${second.cont}/annotations`, {
      annotations: [note],
      as: 'hermes',
    });
    const about = await send(
      app,
      'GET',
      `/api/v1/explorations/${second.read}/annotations?about=${encodeURIComponent(ADA)}`,
    );
    expect(about.body.annotations.map((a: Out) => [a.exploration, a.claim.verb])).toEqual([
      [first.id, 'named'],
      [second.id, 'noted'],
    ]);
    // without about, only this project's
    const here = await send(app, 'GET', `/api/v1/explorations/${second.read}/annotations`);
    expect(here.body.annotations.map((a: Out) => a.claim.verb)).toEqual(['noted']);
  });
});
