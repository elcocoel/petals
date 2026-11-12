// The brain service and its routing (specs/005-mapping-brain/brain.md). The routing is checked on twenty
// questions in the words people use, each with the chapter it should reach: words alone (BM25 over the
// headers) reached all twenty in the top three on 9 Nov, so the small embedding model wasn't added.
import { cpSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { brainService, gitCommitOf, readBrain, routeBrain } from '../src/brain.ts';
import { createContext } from '../src/context.ts';
import { httpApp } from '../src/http/app.ts';

const REPO = join(import.meta.dirname, '..', '..', '..');
const BRAIN = join(REPO, 'brain');

const QUESTIONS: [string, string][] = [
  ['who holds the power in RaidGuild?', 'where-power-lives'],
  ['who controls this treasury', 'where-power-lives'],
  ['map the members of this DAO and how they vote', 'where-power-lives'],
  ['who can upgrade this contract or pause it', 'who-can-move-money-or-change-rules'],
  // signers are the routing table's treasury row (routing.md, 12 Nov)
  ['who are the signers of this multisig', 'who-can-move-money-or-change-rules'],
  ['who delegates to whom in this governance', 'where-power-lives'],
  ['who sponsored the most proposals', 'where-power-lives'],
  ['what is 0x1234abcd, is it a wallet or a contract?', 'start-from-an-address'],
  ['I have an address, tell me what it is', 'start-from-an-address'],
  ['how did the holders change over the last year', 'over-time'],
  ['show me the history since january', 'over-time'],
  ['what changed between last month and now', 'over-time'],
  ['Petals cannot read this framework, can you figure it out', 'a-new-system'],
  ['this contract is not supported', 'a-new-system'],
  ['find who is behind this wallet on twitter or the forum', 'open-source-leads'],
  ['what does the ENS name say', 'open-source-leads'],
  ['tell me more about the top holder', 'going-deeper'],
  ['go deeper', 'going-deeper'],
  ['how do I improve this recipe on github', 'contributing'],
  ['I want to contribute a fix, open a pull request', 'contributing'],
  // connecting (step 4): an app and what it's trying to do
  ["I'm Claude Code, how do I connect to Petals", 'connect-claude-code'],
  ['set up petals in codex', 'connect-codex'],
  ["I'm Hermes, how do I install Petals", 'connect-hermes'],
  ['add petals to chatgpt', 'connect-cloud'],
  ['connect the claude app as a custom connector', 'connect-cloud'],
  ['keep petals in claude code for next time', 'connect-claude-code'],
  ['cursor remote mcp url for petals', 'connect-cloud'],
  // "more" is going-deeper's word, so this one's chapter is second
  ['can anyone mint more of this token', 'who-can-move-money-or-change-rules'],
];

/** Governance (Elco's four chapters, #80, 11 Nov): each question reaches its own chapter first. */
const GOVERNANCE: [string, string][] = [
  ['who holds the delegated voting power of ENS', 'who-gets-a-vote'],
  ['how do I leave this DAO, can I ragequit', 'who-gets-a-vote'],
  ['who voted on proposals in this Governor contract', 'from-proposal-to-action'],
  ['the quorum and voting rules of this DAO', 'from-proposal-to-action'],
  ['did this proposal pass and get executed in Moloch DAO', 'from-proposal-to-action'],
  ['who are the signers of this Safe multisig treasury', 'who-can-move-money-or-change-rules'],
  ['who can upgrade or pause this contract', 'who-can-move-money-or-change-rules'],
  ["who can spend the DAO's funds", 'who-can-move-money-or-change-rules'],
  ['who can mint this token', 'who-can-move-money-or-change-rules'],
  ["who are NEAR's validators and who backs them", 'stake-behind-the-network'],
  ['who controls this DAO', 'where-power-lives'],
  // the second round of Elco's governance chapters (#91, #97, 11 Nov)
  ['what is this token worth in dollars', 'value'],
  ["what's the treasury worth", 'value'],
  ['when do these tokens unlock', 'vesting'],
  ['is this a multisig or a DAO', 'what-kind-of-thing-it-is'],
  ['is this an exchange wallet', 'what-kind-of-thing-it-is'],
  // the voting blocs (#94, 11 Nov)
  ['who votes together in this DAO', 'voting-blocs-over-time'],
  ['are there voting blocs', 'voting-blocs-over-time'],
];

describe('routing', () => {
  const { index } = readBrain(BRAIN, null);

  test.each(QUESTIONS)('%s reaches %s in the top three', (q, want) => {
    expect(routeBrain(index, { words: q }).map((r) => r.id)).toContain(want);
  });

  test.each(GOVERNANCE)('%s reaches %s first', (q, want) => {
    expect(routeBrain(index, { words: q })[0]?.id).toBe(want);
  });

  // the departments (research/brain-departments-2026-11-11.md, step 4): each question that reaches its chapter
  // first reaches its chapter's department first
  const departmentOf = (id: string) => index.entries.find((e) => e.id === id)?.department;
  test.each(GOVERNANCE)('%s reaches the department of %s first', (q, want) => {
    expect(routeBrain(index, { words: q })[0]?.department).toBe(departmentOf(want));
  });

  test('a routing row that fires brings what it loads, saying which task', () => {
    const routes = routeBrain(index, { words: 'who votes together in this DAO' });
    expect(routes[0]).toMatchObject({ id: 'voting-blocs-over-time', department: 'governance' });
    expect(routes[0]?.why).toContain('the task "Who votes together" loads it');
    expect(routes.map((r) => r.id)).toContain('from-proposal-to-action');
  });

  test('a contract that answers a recipe’s calls reaches that recipe first, saying why', () => {
    const [first] = routeBrain(index, {
      answers: ['sharesToken()', 'lootToken()', 'avatar()'],
      words: 'who holds',
    });
    expect(first).toMatchObject({ id: 'moloch-v3', kind: 'recipe' });
    expect(first?.why).toContain('sharesToken()');
  });

  test('never routes to the doctrine, and gives at most three', () => {
    const r = routeBrain(index, { words: 'what every answer holds to before anything else dao' });
    expect(r.length).toBeLessThanOrEqual(3);
    expect(r.map((x) => x.id)).not.toContain('doctrine');
  });
});

describe('the service', () => {
  test('reads again only when the commit moves', () => {
    const dir = mkdtempSync(join(tmpdir(), 'petal-brain-'));
    cpSync(BRAIN, dir, { recursive: true });
    let commit = 'a';
    const s = brainService(dir, () => commit);
    const first = s.current();
    expect(first.commit).toBe('a');
    writeFileSync(join(dir, 'doctrine.md'), '---\nfor: a new doctrine\n---\n\nNew.\n');
    expect(s.current()).toBe(first);
    commit = 'b';
    expect(s.current().texts.get('doctrine')).toContain('New.');
  });

  test('knows the commit of the repo it sits in', () => {
    expect(gitCommitOf(BRAIN)).toMatch(/^[0-9a-f]{40}$/);
  });

  test('over HTTP: the index, a route and a file, each with the commit', async () => {
    const app = httpApp(createContext({ root: REPO, map: null, llmDailyUsd: 0, fake: true }));
    const index = (await (await app.request('/api/v1/brain')).json()) as {
      commit: string;
      index: { entries: unknown[] };
    };
    expect(index.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(index.index.entries.length).toBeGreaterThan(5);
    const route = (await (
      await app.request(
        '/api/v1/brain/route?q=who%20controls%20the%20treasury&answers=sharesToken()',
      )
    ).json()) as { routes: { id: string }[] };
    expect(route.routes.map((r) => r.id)).toEqual(
      expect.arrayContaining(['moloch-v3', 'where-power-lives']),
    );
    const file = (await (await app.request('/api/v1/brain/files/where-power-lives')).json()) as {
      text: string;
    };
    expect(file.text).toContain('# Where power lives');
    expect((await app.request('/api/v1/brain/files/nothing')).status).toBe(404);
  });
});
