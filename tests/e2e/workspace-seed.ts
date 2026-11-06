// A small workspace to come back to, for `journey-server.ts --seed`: what INTERACTION builds against
// before a real person has used the thing. Real code all the way down: the chats go through the real app,
// the real NEAR AI client, the stub model and the real tools, into the real SQLite, and the rest goes
// through the real routes. Only what the stub can't say is written to the store directly, and by the same
// functions the app uses: a chat a restart cut short, and work from another door. It spends $0.
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildPetalApp, openPrivateStore, sqliteRunStore } from '@petal/agent';
import { canonicalJson, specHash } from '@petal/core';
import type { FlowerResult, ModelSignature, Run, Spec } from '@petal/core/types';
import { readSse } from './helpers.ts';

const REPO = resolve(import.meta.dirname, '..', '..');
const SEEDED = 'journey_seeded_at';
const SESSION_DAYS = 30;
/** The session's name on a site with no https: `siteOf` in auth-routes.ts. */
export const SESSION_COOKIE = 'petal_session';

const hashOf = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');

export interface SeedOptions {
  stateDir: string;
  /** the stub model's /v1 */
  modelBase: string;
  walletKey: string;
  /** the invite this session holds, so a chat here is let in */
  inviteId: string;
}

export interface SeedResult {
  /** the session's value, as a cookie holds it */
  session: string;
  conversations: number;
  follows: number;
  notes: number;
  /** false when this folder already held a seeded workspace, which is left as it is */
  fresh: boolean;
}

/** The session this folder's seed belongs to: the same one each time, holding today's invite. */
function holdSession(o: SeedOptions): string {
  const file = join(o.stateDir, 'journey-session');
  const value = existsSync(file)
    ? readFileSync(file, 'utf8').trim()
    : randomBytes(32).toString('base64url');
  writeFileSync(file, value, { mode: 0o600 });
  const store = openPrivateStore(o.stateDir);
  try {
    store.tx(() => {
      const hash = hashOf(value);
      store.session.delete(hash);
      store.session.put({
        hash,
        subject: `anon_${createHash('sha256').update(`seed:${value}`).digest('hex').slice(0, 32)}`,
        invite: o.inviteId,
        expires_at: new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString(),
      });
    });
  } finally {
    store.close();
  }
  return value;
}

export async function seedWorkspace(o: SeedOptions): Promise<SeedResult> {
  const session = holdSession(o);
  const store = openPrivateStore(o.stateDir);
  const subject = store.session.get(hashOf(session), new Date().toISOString())?.subject as string;
  const counted = (fresh: boolean): SeedResult => ({
    session,
    conversations:
      store.run.listByOwner(subject, 100).length +
      store.exploration.withoutRun(subject, 100).length,
    follows: store.follow.count(subject),
    notes: store.workspaceNote.count(subject),
    fresh,
  });
  if (store.meta.get(SEEDED)) {
    const again = counted(false);
    store.close();
    return again;
  }

  const app = buildPetalApp(
    { root: REPO, stateDir: o.stateDir, nearAiApiKey: 'stub', llmDailyUsd: 1, map: null },
    {
      nearAi: {
        baseURL: o.modelBase,
        signatureDelaysMs: [0],
        attestationsDir: join(o.stateDir, 'attestations'),
      },
      env: {
        NODE_ENV: 'test',
        PETAL_AGENT_ACCESS: 'gated',
        PETAL_WALLET_KEY: o.walletKey,
      },
    },
  );
  const call = (path: string, method: string, json?: unknown) =>
    app.request(path, {
      method,
      headers: {
        cookie: `${SESSION_COOKIE}=${session}`,
        ...(json === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(json === undefined ? {} : { body: JSON.stringify(json) }),
    });
  const wanted = async (res: Response) => {
    if (!res.ok) throw new Error(`seed: ${res.status} ${await res.text()}`);
    return res;
  };

  /** One chat to its end, on the stub. Returns the run it's in. */
  async function say(content: string, more: Record<string, unknown> = {}): Promise<string> {
    const res = await wanted(
      await call('/api/v1/agent/chat', 'POST', {
        messages: [{ role: 'user', content }],
        ...more,
      }),
    );
    const events = await readSse(res, Date.now());
    const first = events[0]?.data as { run_id?: string } | undefined;
    if (!first?.run_id) throw new Error('seed: a chat answered with no run');
    return first.run_id;
  }
  const runOf = async (id: string) =>
    (await (await wanted(await call(`/api/v1/agent/runs/${id}`, 'GET'))).json()) as Run;

  // 1. A question, the agent asking, a yes and a flower, on the default.
  const first = await say("Who stands behind NEAR's validators?");
  await say('yes', { run_id: first });
  const flower = (await runOf(first)).flower as FlowerResult;

  // 2. The same again on another pick, and a second flower: one conversation, two shapes. The stub only
  // replays one flower, so the second is the first with fewer petals, stored as the agent's would be.
  const second = await say('How much of the stake do the top ten hold?', {
    settings: { model: 'z-ai/glm-5.3-flash', effort: 'medium' },
  });
  await say('yes', { run_id: second });
  const spec = flower.spec as Spec;
  const variant = { ...spec, selection: { ...spec.selection, petals: 10 } } as Spec;
  const variantSha = specHash(variant);
  const runs = sqliteRunStore(store);
  const secondRun = await runOf(second);
  await runs.create(
    {
      messages: [...secondRun.messages, { role: 'user', content: 'Show just the top ten.' }],
      run_id: second,
    },
    {},
  );
  await runs.append(second, {
    event: 'run',
    data: { run_id: second, resume_url: `/make?run=${second}` },
  });
  await runs.append(second, { event: 'message', data: { text: 'Here are the top ten.' } });
  await runs.append(second, {
    event: 'flower',
    data: { ...flower, spec: variant, spec_sha256: variantSha, view_url: `/d/${variantSha}` },
  });
  await runs.append(second, {
    event: 'done',
    data: {
      turns: 2,
      model: 'z-ai/glm-5.3-flash',
      fallback_used: false,
      tokens: { in: 12_400, out: 310 },
      cost_usd: 0.0011,
      // the stub never signs, so this one turn does, for a surface to see what `signed: true` looks like
      signature: { signature_kind: 'provider_tee' } as ModelSignature,
      context_tokens: 6_900,
    },
  });
  store.draft.put({
    sha256: variantSha,
    body: canonicalJson(variant),
    created_at: new Date().toISOString(),
  });
  const exploration = store.run.get(second)?.exploration as string;
  const at = new Date().toISOString();
  store.tx(() => {
    store.step.append({
      exploration,
      parent: flower.spec_sha256,
      spec_sha256: variantSha,
      recipe_sha256: null,
      snapshot_sha256: spec.snapshot?.sha256 ?? null,
      door: 'site',
      author: 'owner',
      note: null,
      at,
    });
    store.exploration.touch(exploration, at);
  });

  // 3. It asked, and nobody has said yes yet: nothing drawn. Passed through to another company.
  await say('What does the House of Stake look like?', {
    settings: { model: 'anthropic/claude-haiku-5-5' },
  });

  // 4. A chat a restart cut short: words kept, no `done`, and it can be continued.
  const cut = await runs.create(
    { messages: [{ role: 'user', content: 'Which delegates moved this month?' }] },
    { owner: subject },
  );
  await runs.append(cut, { event: 'run', data: { run_id: cut, resume_url: `/make?run=${cut}` } });
  await runs.append(cut, { event: 'message', data: { text: 'Let me look at the delegates.' } });
  await runs.append(cut, {
    event: 'error',
    data: {
      code: 'interrupted',
      message: 'The server restarted while this was running, so it stopped here.',
    },
  });

  // 5. Work from another door: started in Claude Code, say, and claimed. It has no run, and none is made.
  const door = `exp_${randomBytes(12).toString('hex')}`;
  const doorAt = new Date(Date.now() - 3_600_000).toISOString();
  store.tx(() => {
    store.exploration.create({
      id: door,
      owner: subject,
      question: 'Who holds Moloch DAO?',
      target: spec.network?.id ?? null,
      head: variantSha,
      visibility: 'private',
      share_token_hash: null,
      forked_from: null,
      created_at: doorAt,
      updated_at: doorAt,
    });
    store.step.append({
      exploration: door,
      parent: null,
      spec_sha256: variantSha,
      recipe_sha256: null,
      snapshot_sha256: spec.snapshot?.sha256 ?? null,
      door: 'mcp',
      author: 'owner',
      note: 'First pass from Claude Code.',
      at: doorAt,
    });
    store.note.append({
      exploration: door,
      author: 'owner',
      door: 'mcp',
      text: 'The top delegate holds far more than the rest. Worth a closer look.',
      at: doorAt,
    });
  });

  // Following and notes, through their routes.
  const pool = 'near:mainnet:astro-stakers.poolv1.near';
  for (const follow of [
    { ref: pool, label: 'A validator I watch', spec_sha256: flower.spec_sha256 },
    { ref: 'eip155:1:0x1fd169a4f5c59acf79d0fd5d91d1201ef1bce9f1', label: 'Moloch DAO' },
    { ref: 'network:near-validators', label: 'NEAR validators', spec_sha256: flower.spec_sha256 },
  ]) {
    await wanted(await call('/api/v1/follows', 'POST', follow));
  }
  for (const note of [
    { about: `conversation:${first}`, text: 'Come back to this after the next epoch.' },
    {
      about: pool,
      text: 'Stake has been climbing for weeks. Check who is behind it.',
      evidence: [{ snapshot_sha256: spec.snapshot?.sha256 }],
    },
  ]) {
    await wanted(await call('/api/v1/notes', 'POST', note));
  }

  store.meta.set(SEEDED, new Date().toISOString());
  const done = counted(true);
  store.close();
  return done;
}
