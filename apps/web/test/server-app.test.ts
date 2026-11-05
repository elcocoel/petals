// The one switch (PETAL_API_MOCK): 1 forces the mock; unset uses petalApp unless it is still a
// stub; 0 uses petalApp and fails loudly while it is a stub. Written to stay true after T058.
import { petalApp } from '@petal/agent';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { apiLabel } from '../lib/api-label.ts';
import { configFromEnv, repoRoot } from '../lib/config.ts';
import { getApp } from '../lib/server-app.ts';

const g = globalThis as { __petalServerApp?: unknown };
const petalAppIsStub = await (async () => {
  try {
    petalApp(await configFromEnv());
    return false;
  } catch (e) {
    return (e as { code?: string }).code === 'not_implemented';
  }
})();

afterEach(() => {
  g.__petalServerApp = undefined;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('the API switch', () => {
  test('PETAL_API_MOCK=1 serves the mock', async () => {
    vi.stubEnv('PETAL_API_MOCK', '1');
    const { app, mode } = await getApp();
    expect(mode).toBe('mock');
    expect((await app.request('/api/v1/health')).headers.get('x-petal-api')).toBe('mock');
  });

  test('unset: petalApp when it is built, the mock (with a warning) while it is a stub', async () => {
    vi.stubEnv('PETAL_API_MOCK', '');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { mode } = await getApp();
    expect(mode).toBe(petalAppIsStub ? 'mock' : 'real');
    expect(warn).toHaveBeenCalledTimes(petalAppIsStub ? 1 : 0);
  });

  test('PETAL_API_MOCK=0 never falls back to the mock', async () => {
    vi.stubEnv('PETAL_API_MOCK', '0');
    if (petalAppIsStub) await expect(getApp()).rejects.toMatchObject({ code: 'not_implemented' });
    else expect((await getApp()).mode).toBe('real');
  });

  test('petalApp says so: health has mock: false, every answer x-petal-api: real', async () => {
    if (petalAppIsStub) return;
    vi.stubEnv('PETAL_API_MOCK', '0');
    vi.stubEnv('PETAL_FAKE', '1');
    const { app } = await getApp();
    const health = await app.request('/api/v1/health');
    expect(health.headers.get('x-petal-api')).toBe('real');
    expect(await health.json()).toMatchObject({
      ok: true,
      mock: false,
      fake: true,
      llm: 'recorded',
    });
    const networks = await app.request('/api/v1/networks');
    expect(networks.headers.get('x-petal-api')).toBe('real');
    expect(((await networks.json()) as { networks: unknown[] }).networks.length).toBeGreaterThan(0);
  });

  test('one app per process, shared on globalThis', async () => {
    vi.stubEnv('PETAL_API_MOCK', '1');
    expect(await getApp()).toBe(await getApp());
  });
});

describe('the gallery label tells the truth', () => {
  const base = { map: 'mirror', llm: 'recorded' };
  test('fake mode never reads as live or real alone', () => {
    const label = apiLabel({ ...base, mock: false, fake: true });
    expect(label).toMatch(/^Fake mode/);
    expect(label).toMatch(/fake map/);
    expect(label).toMatch(/recorded agent/);
    expect(label).not.toMatch(/\blive\b/i);
  });
  test('the mock says it is the mock', () => {
    expect(apiLabel({ ...base, mock: true })).toMatch(/^API mock/);
  });
  test('the real API reports map and agent as they are', () => {
    expect(apiLabel({ map: 'up', llm: 'up', mock: false, fake: false })).toBe(
      'API: real; map up; agent up.',
    );
    expect(apiLabel({ ...base, mock: false, fake: false })).toBe(
      'API: real; map mirror; agent recorded.',
    );
  });
});

describe('config from the environment', () => {
  test('no map variables: no map (fake map plus mirror)', async () => {
    vi.stubEnv('PETAL_MAP_RECEIVER', '');
    vi.stubEnv('PETAL_WRITER_KEY_FILE', '');
    expect((await configFromEnv('/repo')).map).toBeNull();
  });
  test('map variables fill the testnet defaults', async () => {
    vi.stubEnv('PETAL_MAP_RECEIVER', 'petals.testnet');
    vi.stubEnv('PETAL_WRITER_ACCOUNT', '');
    vi.stubEnv('PETAL_TRUSTED_WRITERS', 'a.testnet, b.testnet');
    vi.stubEnv('PETAL_LIVE', '1');
    const cfg = await configFromEnv('/repo');
    expect(cfg.map).toMatchObject({
      network: 'testnet',
      receiver: 'petals.testnet',
      writer: 'petals-writer.testnet',
      trustedWriters: ['a.testnet', 'b.testnet'],
    });
    expect(cfg.live).toBe(true);
  });
  test('PETAL_FAKE=1 and PETAL_STATE_DIR reach petalApp (the same mapping as @petal/tools)', async () => {
    vi.stubEnv('PETAL_FAKE', '1');
    vi.stubEnv('PETAL_STATE_DIR', '/tmp/petal-state');
    expect(await configFromEnv('/repo')).toMatchObject({
      root: '/repo',
      fake: true,
      stateDir: '/tmp/petal-state',
    });
  });
  test('the repo root is the folder with pnpm-workspace.yaml', () => {
    expect(repoRoot()).toMatch(/build[^/]*$/);
  });
});
