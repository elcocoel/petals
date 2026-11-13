// Test 1, lines 2 and 3, by hand and over HTTP: what test1.test.ts does in process, through Next and on
// NEAR's real RPC. Real: the site, its routes, cookies, SQLite, the NEAR AI client, the scripts as their own
// processes, and NEAR's RPC finding that a test wallet's implicit account doesn't exist. Not: the model (the
// journey server's stub) and the wallets (test keys). It spends $0 of NEAR AI and sends no transaction.
//
//   node tests/e2e/journey-server.ts --web-port 3181 --state <dir> --seed   # and start Next as it prints
//   node tests/e2e/test1-path.ts --site http://127.0.0.1:3181 --state <dir>
//
// With --expect-conversations <n> it only does line 2, for a copy of a populated store: it finds the store's
// one person, binds two test wallets, and checks both see that many conversations. Their key is the folder's
// journey-wallet-key, so the store's own wallets can't be read on a copy, and that's expected.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { implicitSigner } from '@petal/near/auth/testing';
import { readSse } from './helpers.ts';

const { values } = parseArgs({
  options: {
    site: { type: 'string', default: 'http://127.0.0.1:3181' },
    stub: { type: 'string', default: 'http://127.0.0.1:3189' },
    state: { type: 'string' },
    'expect-conversations': { type: 'string' },
  },
});
if (!values.state) throw new Error('--state <dir>: the folder the site runs on');
const stateDir = resolve(values.state);
const SITE = values.site as string;
const STUB = values.stub as string;
const REPO = resolve(import.meta.dirname, '..', '..');
const walletKey = readFileSync(join(stateDir, 'journey-wallet-key'), 'utf8').trim();

const GLM = 'z-ai/glm-5.3-flash';
const HAIKU = 'anthropic/claude-haiku-5-5';
const SONNET = 'anthropic/claude-sonnet-5-5';
const QUESTION = 'Who stands behind NEAR’s validators?';

let failures = 0;
function check(what: string, ok: boolean, saw?: unknown) {
  if (!ok) failures++;
  const detail = saw === undefined ? '' : `: ${JSON.stringify(saw)}`;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail}`);
}

function script(name: string, args: string[]): { out: string; failed: boolean } {
  const r = spawnSync(process.execPath, [join(REPO, 'scripts', name), ...args], {
    env: { PETAL_WALLET_KEY: walletKey, NODE_NO_WARNINGS: '1' },
    encoding: 'utf8',
  });
  return { out: `${r.stdout}${r.stderr}`, failed: r.status !== 0 };
}

const stubCalls = async () =>
  (await (await fetch(`${STUB}/calls`)).json()) as {
    calls: number;
    asked: { model: string; effort: string | null }[];
  };

function browser(cookie = '') {
  let jar = cookie;
  const request = async (path: string, method = 'GET', json?: unknown) => {
    const res = await fetch(`${SITE}${path}`, {
      method,
      redirect: 'manual',
      headers: {
        ...(jar ? { cookie: jar } : {}),
        ...(json === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(json === undefined ? {} : { body: JSON.stringify(json) }),
    });
    jar = res.headers.get('set-cookie')?.split(';')[0] ?? jar;
    return res;
  };
  return {
    request,
    async signIn(seed: string, network = 'mainnet') {
      const c = (await (await request('/api/v1/auth/challenge', 'POST')).json()) as {
        nonce: string;
        message: string;
        recipient: string;
      };
      const proof = implicitSigner(seed).sign(c);
      return request('/api/v1/auth/verify', 'POST', { network, proof });
    },
    me: async () =>
      (await (await request('/api/v1/me')).json()) as {
        person_id: string;
        network: string;
        wallets: { network: string }[];
        credit: { funded_usd: number; spent_usd: number; left_usd: number; usd_per_chat: number };
      },
    conversations: async () =>
      (
        (await (await request('/api/v1/conversations?limit=200')).json()) as {
          conversations: { id: string }[];
        }
      ).conversations
        .map((x) => x.id)
        .sort(),
    async say(content: string, more: Record<string, unknown> = {}) {
      const sent = Date.now();
      const res = await request('/api/v1/agent/chat', 'POST', {
        messages: [{ role: 'user', content }],
        ...more,
      });
      if (!res.ok) return { status: res.status, body: await res.json() };
      const events = await readSse(res, sent);
      return {
        status: res.status,
        run: (events[0]?.data as { run_id?: string } | undefined)?.run_id ?? '',
        flowers: events.filter((e) => e.event === 'flower').length,
        done: events.findLast((e) => e.event === 'done')?.data as {
          model: string;
          picked?: string;
          turns: number;
          cost_usd: number;
        },
        error: events.findLast((e) => e.event === 'error')?.data as
          | { code: string; message: string }
          | undefined,
      };
    },
  };
}

const addresses = (seed: string, network: string) =>
  `near:${network}:${implicitSigner(seed).accountId}`;

async function lineTwoOnACopy(expected: number) {
  const read = script('bind-wallet.ts', ['--state', stateDir]);
  const person = /person (prs_\w+)/.exec(read.out)?.[1] ?? '';
  check('the copy opens, migrated, with its one person', !read.failed && !!person);
  const bound = script('bind-wallet.ts', [
    '--state',
    stateDir,
    '--person',
    person,
    '--key-unchecked',
    '--adopt-strays',
    '--wallet',
    addresses('copy-a', 'mainnet'),
    '--wallet',
    addresses('copy-b', 'testnet'),
  ]);
  check('the script binds two test wallets to that person', !bound.failed);
  const lists: string[][] = [];
  for (const [seed, network] of [
    ['copy-a', 'mainnet'],
    ['copy-b', 'testnet'],
  ] as const) {
    const b = browser();
    const res = await b.signIn(seed, network);
    const me = await b.me();
    check(`${network}: signs in as that person`, res.ok && me.person_id === person);
    lists.push(await b.conversations());
  }
  check(
    `each sees ${expected} conversations`,
    lists.every((l) => l.length === expected),
    [lists[0]?.length, lists[1]?.length],
  );
  check('the same ones', JSON.stringify(lists[0]) === JSON.stringify(lists[1]));
  const again = script('bind-wallet.ts', [
    '--state',
    stateDir,
    '--person',
    person,
    '--key-unchecked',
    '--wallet',
    addresses('copy-a', 'mainnet'),
  ]);
  check('run again, it changes nothing', again.out.includes('already this person'));
}

async function bothLines() {
  // -- line 2
  const seeded = readFileSync(join(stateDir, 'journey-session'), 'utf8').trim();
  const first = browser(`petal_session=${seeded}`);
  const signedIn = await first.signIn('t1-alice');
  const me = await first.me();
  const person = me.person_id;
  const theirs = await first.conversations();
  check('the seeded browser signs in, on NEAR’s real RPC', signedIn.ok && !!person);
  check('its conversations moved to the person', theirs.length >= 5, theirs.length);

  const bound = script('bind-wallet.ts', [
    '--state',
    stateDir,
    '--person',
    person,
    '--wallet',
    addresses('t1-bob', 'mainnet'),
    '--wallet',
    addresses('t1-carol', 'testnet'),
  ]);
  check('the script binds two more wallets', !bound.failed && !bound.out.includes(walletKey));

  const bob = browser();
  await bob.signIn('t1-bob');
  const carol = browser();
  await carol.signIn('t1-carol', 'testnet');
  const [asBob, asCarol] = [await bob.me(), await carol.me()];
  check('bob, on mainnet in a new browser, is that person', asBob.person_id === person);
  check('carol, on testnet in another, is too', asCarol.person_id === person);
  check(
    'each session says its own network',
    asBob.network === 'mainnet' && asCarol.network === 'testnet',
  );
  check('all three wallets show', asCarol.wallets.length === 3);
  check(
    'both see the same conversations',
    JSON.stringify(await bob.conversations()) === JSON.stringify(theirs) &&
      JSON.stringify(await carol.conversations()) === JSON.stringify(theirs),
  );

  // -- line 3: refused until funded
  const n0 = (await stubCalls()).calls;
  const before = await bob.say(QUESTION);
  check('a person with no credit and no invite is refused', before.status === 403, before.body);
  const stranger = await browser().say(QUESTION, { settings: { model: GLM } });
  check('a stranger is refused', stranger.status === 403);
  check('neither reached the model', (await stubCalls()).calls === n0);

  const funded = script('fund-person.ts', [
    '--state',
    stateDir,
    '--person',
    person,
    '--total',
    '5',
  ]);
  check('the script funds them', funded.out.includes('funded $5'));
  const credit = await carol.me();
  check('the credit shows from another wallet', credit.credit?.left_usd === 5, credit.credit);

  // -- the pick reaches the model
  let n = (await stubCalls()).asked.length;
  const glm = await bob.say(QUESTION, { settings: { model: GLM, effort: 'medium' } });
  let asked = (await stubCalls()).asked[n];
  check(
    'a pick names its model and effort',
    asked?.model === GLM && asked.effort === 'medium',
    asked,
  );
  check(
    'what answered and what was picked both show',
    glm.done?.model === GLM && glm.done?.picked === GLM,
  );

  n = (await stubCalls()).asked.length;
  await carol.say(QUESTION, { settings: { model: HAIKU } });
  asked = (await stubCalls()).asked[n];
  check(
    'effort goes only where it’s offered',
    asked?.model === HAIKU && asked.effort === null,
    asked,
  );

  const n1 = (await stubCalls()).calls;
  const outside = await bob.say(QUESTION, { settings: { model: 'anthropic/claude-fable-5' } });
  check('a pick outside the catalogue is refused', outside.status === 400, outside.body);
  check('and nothing was asked', (await stubCalls()).calls === n1);

  // -- a flower over 5¢ and under 50¢
  const q = await bob.say(QUESTION, { settings: { model: SONNET } });
  const flower = await bob.say('yes', { run_id: q.run });
  const cost = flower.done?.cost_usd ?? 0;
  check(
    'a flower-sized chat isn’t cut off',
    flower.flowers === 1 && !flower.error && cost > 0.05 && cost < 0.5,
    { cost_usd: cost },
  );
  const shown = (await (await bob.request(`/api/v1/conversations/${q.run}`)).json()) as {
    conversation: { answered_by: string; settings: { model: string } };
  };
  check(
    'the conversation says what answered',
    shown.conversation.answered_by === SONNET && shown.conversation.settings.model === SONNET,
  );

  // -- the credit runs out, and can be raised
  const spent = (await carol.me()).credit;
  check('the credit went down, seen from another wallet', spent.spent_usd > 0.05, spent);
  script('fund-person.ts', [
    '--state',
    stateDir,
    '--person',
    person,
    '--total',
    String(spent.spent_usd + 0.0001),
  ]);
  const last = await bob.say(QUESTION, { settings: { model: GLM, effort: 'low' } });
  check(
    'at the end of the credit the chat stops plainly',
    last.error?.code === 'budget_exhausted',
    last.error,
  );
  const n2 = (await stubCalls()).calls;
  const refused = await bob.say(QUESTION);
  check('the next is refused, and says why', refused.status === 429, refused.body);
  check('and nothing was asked', (await stubCalls()).calls === n2);
  script('fund-person.ts', ['--state', stateDir, '--person', person, '--total', '5']);
  const back = await bob.say('and now?', { run_id: q.run });
  check('raised, it works again', back.status === 200 && !back.error, back.error);
}

const expected = values['expect-conversations'];
await (expected === undefined ? bothLines() : lineTwoOnACopy(Number(expected)));
console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exitCode = failures ? 1 : 0;
