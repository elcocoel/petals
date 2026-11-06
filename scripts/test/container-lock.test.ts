// T300, finding 6: the container locked. entry.sh is the real file, with only its mount path pointed
// at a temp folder and `node` a stub that prints what it was given.
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const ENTRY = resolve(import.meta.dirname, '../container/entry.sh');

function start(envFile: string, env: Record<string, string> = {}): Record<string, string> {
  const dir = mkdtempSync(join(tmpdir(), 'petal-entry-'));
  writeFileSync(join(dir, 'near-ai.env'), envFile);
  writeFileSync(join(dir, 'petal-wallet.env'), '');
  const script = join(dir, 'entry.sh');
  writeFileSync(script, readFileSync(ENTRY, 'utf8').replaceAll('/secrets/', `${dir}/`));
  const node = join(dir, 'node');
  writeFileSync(node, '#!/bin/bash\nenv\n');
  chmodSync(node, 0o755);
  const r = spawnSync('/bin/bash', [script], {
    encoding: 'utf8',
    env: { PATH: `${dir}:/usr/bin:/bin`, ...env },
  });
  expect(r.status).toBe(0);
  return Object.fromEntries(
    r.stdout
      .split('\n')
      .filter((l) => l.includes('='))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
  );
}

describe('entry.sh', () => {
  test('what an env file says about access and the lab has no effect', () => {
    const env = start('PETAL_AGENT_ACCESS=open\nPETAL_LAB=1\nNEAR_AI_API_KEY=k\n');
    expect(env.PETAL_AGENT_ACCESS).toBe('gated');
    expect(env.PETAL_LAB).toBeUndefined();
    expect(env.NEAR_AI_API_KEY).toBe('k');
  });

  test('the run command can’t open it either; the cap still comes from the run command', () => {
    const env = start('PETAL_LLM_DAILY_USD=100\n', {
      PETAL_AGENT_ACCESS: 'open',
      PETAL_LAB: '1',
      PETAL_LLM_DAILY_USD: '1',
    });
    expect(env.PETAL_AGENT_ACCESS).toBe('gated');
    expect(env.PETAL_LAB).toBeUndefined();
    expect(env.PETAL_LLM_DAILY_USD).toBe('1');
  });

  test('what an env file says about fakes has no effect either', () => {
    const env = start('PETAL_FAKE=1\nPETAL_API_MOCK=1\n');
    expect(env.PETAL_FAKE).toBeUndefined();
    expect(env.PETAL_API_MOCK).not.toBe('1');
  });

  test('neither can send the model’s calls, and its key, to another address', () => {
    const stub = 'http://127.0.0.1:3189/v1';
    const fromFile = start(`PETAL_NEAR_AI_BASE_URL=${stub}\nNEAR_AI_API_KEY=k\n`);
    expect(fromFile.PETAL_NEAR_AI_BASE_URL).toBeUndefined();
    expect(fromFile.NEAR_AI_API_KEY).toBe('k');
    const fromRun = start('', { PETAL_NEAR_AI_BASE_URL: stub });
    expect(fromRun.PETAL_NEAR_AI_BASE_URL).toBeUndefined();
  });
});
