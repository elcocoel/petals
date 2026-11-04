// The one switch (PETAL_API_MOCK): 1 forces the mock; unset uses petalApp unless it is still a
// stub; 0 uses petalApp and fails loudly while it is a stub. Written to stay true after T058.
import { petalApp } from '@petal/agent';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { configFromEnv, repoRoot } from '../lib/config.ts';
import { getApp } from '../lib/server-app.ts';

const g = globalThis as { __petalServerApp?: unknown };
const petalAppIsStub = (() => {
  try {
    petalApp(configFromEnv());
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

  test('one app per process, shared on globalThis', async () => {
    vi.stubEnv('PETAL_API_MOCK', '1');
    expect(await getApp()).toBe(await getApp());
  });
});

describe('config from the environment', () => {
  test('no map variables: no map (fake map plus mirror)', () => {
    vi.stubEnv('PETAL_MAP_RECEIVER', '');
    vi.stubEnv('PETAL_WRITER_KEY_FILE', '');
    expect(configFromEnv('/repo').map).toBeNull();
  });
  test('map variables fill the testnet defaults', () => {
    vi.stubEnv('PETAL_MAP_RECEIVER', 'petals.testnet');
    vi.stubEnv('PETAL_WRITER_ACCOUNT', '');
    vi.stubEnv('PETAL_TRUSTED_WRITERS', 'a.testnet, b.testnet');
    vi.stubEnv('PETAL_LIVE', '1');
    const cfg = configFromEnv('/repo');
    expect(cfg.map).toMatchObject({
      network: 'testnet',
      receiver: 'petals.testnet',
      writer: 'writer.petals.testnet',
      trustedWriters: ['a.testnet', 'b.testnet'],
    });
    expect(cfg.live).toBe(true);
  });
  test('the repo root is the folder with pnpm-workspace.yaml', () => {
    expect(repoRoot()).toMatch(/build[^/]*$/);
  });
});
