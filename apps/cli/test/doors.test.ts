// T070: the two doors the CLI starts (`petal mcp`, `petal api`), the config it hands the
// tools, and the real entry point.
import { execFileSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import type { Config, ToolContext } from '@petal/tools';
import { describe, expect, test } from 'vitest';
import { configFromEnv, findRoot } from '../src/config.ts';
import { run } from './fake-registry.ts';

const ROOT = join(import.meta.dirname, '../../..');

describe('petal mcp', () => {
  test('serves the tools over stdio and writes nothing to stdout', async () => {
    const served: ToolContext[] = [];
    const r = await run(['mcp', '--fake'], {
      deps: {
        serveStdio: async (ctx) => {
          served.push(ctx);
        },
      },
    });
    expect(r.code).toBe(0);
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe('');
    expect(served).toHaveLength(1);
    expect(served[0]?.config).toEqual({ root: '/repo', fake: true });
  });

  test('takes no arguments', async () => {
    const r = await run(['mcp', 'extra']);
    expect(r.code).toBe(2);
    expect(r.stdout).toBe('');
    expect(JSON.parse(r.stderr).error.message).toBe('petal mcp takes no arguments');
  });
});

describe('petal api', () => {
  const start = async (argv: string[]) => {
    const served: { port: number; hostname?: string; fetch: (r: Request) => unknown }[] = [];
    const apps: Config[] = [];
    const r = await run(['api', ...argv], {
      deps: {
        petalApp: (cfg) => {
          apps.push(cfg);
          return { fetch: () => new Response('{"ok":true}') };
        },
        serve: (options, onListen) => {
          served.push(options);
          onListen?.({ port: options.port });
          return {};
        },
      },
    });
    return { ...r, served, apps };
  };

  test('mounts petalApp on :8787 by default', async () => {
    const r = await start([]);
    expect(r.code).toBe(0);
    expect(r.apps).toEqual([{ root: '/repo' }]);
    expect(r.served).toHaveLength(1);
    expect(r.served[0]?.port).toBe(8787);
    expect(r.served[0]).not.toHaveProperty('hostname');
    expect(r.stderr).toBe('petal api on http://localhost:8787\n');
    const res = (await r.served[0]?.fetch(new Request('http://x/api/v1/health'))) as Response;
    expect(await res.json()).toEqual({ ok: true });
  });

  test('--port and --host', async () => {
    const r = await start(['--port', '9999', '--host', '127.0.0.1']);
    expect(r.served[0]).toMatchObject({ port: 9999, hostname: '127.0.0.1' });
  });

  test('a bad port is a usage error', async () => {
    const r = await start(['--port', 'eighty']);
    expect(r.code).toBe(2);
    expect(r.served).toEqual([]);
  });
});

describe('config from the environment', () => {
  test('only variables that are set are passed', () => {
    expect(configFromEnv({}, '/repo')).toEqual({ root: '/repo' });
    expect(configFromEnv({ PETAL_API: '', NEAR_AI_API_KEY: ' ' }, '/repo')).toEqual({
      root: '/repo',
    });
  });

  test('every variable in .env.example that the tools read', () => {
    const cfg = configFromEnv(
      {
        PETAL_API: 'http://localhost:9000',
        PETAL_REPO_URL: 'https://github.com/x/petal',
        PETAL_PAYOUT_ACCOUNT: 'petal-demo.near',
        FASTNEAR_API_KEY: 'k',
        NEAR_AI_API_KEY: 'k2',
        PETAL_LLM_DAILY_USD: '2.5',
        PETAL_LIVE: '1',
        PETAL_MAP_NETWORK: 'testnet',
        PETAL_WRITER_KEY_FILE: '../.secrets/w.json',
      },
      '/repo/build',
      { fake: true },
    );
    expect(cfg).toEqual({
      root: '/repo/build',
      apiBase: 'http://localhost:9000',
      repoUrl: 'https://github.com/x/petal',
      payoutAccount: 'petal-demo.near',
      fastnearApiKey: 'k',
      nearAiApiKey: 'k2',
      llmDailyUsd: 2.5,
      live: true,
      fake: true,
      map: {
        network: 'testnet',
        receiver: 'petals.testnet',
        writer: 'writer.petals.testnet',
        keyFile: '/repo/.secrets/w.json',
        trustedWriters: ['writer.petals.testnet'],
      },
    });
  });

  test('map: explicit receiver, writer and trusted writers', () => {
    const cfg = configFromEnv(
      {
        PETAL_MAP_NETWORK: 'mainnet',
        PETAL_WRITER_ACCOUNT: 'w.near',
        PETAL_TRUSTED_WRITERS: 'a.near, b.near',
      },
      '/r',
    );
    expect(cfg.map).toEqual({
      network: 'mainnet',
      receiver: 'petals.near',
      writer: 'w.near',
      trustedWriters: ['a.near', 'b.near'],
    });
  });

  test('the root: PETAL_ROOT, else the folder with pnpm-workspace.yaml', () => {
    expect(findRoot({ PETAL_ROOT: '/somewhere' }, '/x')).toBe('/somewhere');
    expect(findRoot({}, join(ROOT, 'apps/cli/src'))).toBe(ROOT);
  });
});

describe('the real entry point', () => {
  test('node apps/cli/src/index.ts help', () => {
    const out = execFileSync(process.execPath, [join(ROOT, 'apps/cli/src/index.ts'), 'help'], {
      encoding: 'utf8',
    });
    expect(out).toMatch(/^petal: /);
  });

  test('pnpm -s petal keeps stdout clean (the MCP install command relies on it)', () => {
    const r = spawnSync('pnpm', ['-s', '--dir', ROOT, 'petal', 'help'], { encoding: 'utf8' });
    if (r.error) throw r.error;
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/^petal: /);
  });
});
