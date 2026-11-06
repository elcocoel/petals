// T070: the two doors the CLI starts (`petal mcp`, `petal api`), the config it hands the
// tools, and the real entry point.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Config, ToolContext } from '@petal/tools';
import { configFromEnv as toolsConfigFromEnv } from '@petal/tools';
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
    expect(served[0]?.config).toMatchObject({ root: '/repo', fake: true });
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
    expect(r.apps).toEqual([expect.objectContaining({ root: '/repo', fake: false })]);
    expect(r.served).toHaveLength(1);
    expect(r.served[0]?.port).toBe(8787);
    expect(r.served[0]?.hostname).toBe('127.0.0.1');
    expect(r.stderr).toBe('petal api on http://localhost:8787\n');
    const res = (await r.served[0]?.fetch(new Request('http://x/api/v1/health'))) as Response;
    expect(await res.json()).toEqual({ ok: true });
  });

  test('--port and --host', async () => {
    const r = await start(['--port', '9999', '--host', '0.0.0.0']);
    expect(r.served[0]).toMatchObject({ port: 9999, hostname: '0.0.0.0' });
  });

  test('serves over real HTTP with @hono/node-server', async () => {
    const { serve } = await import('@hono/node-server');
    let server: { close(cb?: () => void): void } | undefined;
    const listening = new Promise<number>((done) => {
      void run(['api', '--port', '0', '--host', '127.0.0.1'], {
        deps: {
          petalApp: () => ({
            fetch: (req) => Response.json({ path: new URL(req.url).pathname }),
          }),
          serve: (options, onListen) => {
            server = serve(options, (info) => {
              onListen?.(info);
              done(info.port);
            });
            return server;
          },
        },
      });
    });
    const port = await listening;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/health`);
      expect(await res.json()).toEqual({ path: '/api/v1/health' });
    } finally {
      await new Promise<void>((done) => server?.close(() => done()));
    }
  });

  test('a busy port is reported as JSON on stderr', async () => {
    const before = process.exitCode;
    const busy = Object.assign(new Error('listen EADDRINUSE: :::8787'), { code: 'EADDRINUSE' });
    const r = await run(['api'], {
      deps: {
        petalApp: () => ({ fetch: () => new Response('') }),
        serve: () => ({ on: (_event: 'error', listener: (e: Error) => void) => listener(busy) }),
      },
    });
    const exitCode = process.exitCode;
    process.exitCode = before;
    expect(exitCode).toBe(1);
    expect(JSON.parse(r.stderr).error).toEqual({
      code: 'internal',
      message: 'petal api: listen EADDRINUSE: :::8787',
      hint: 'Another server has the port; try --port.',
    });
  });

  test('a bad port is a usage error', async () => {
    const r = await start(['--port', 'eighty']);
    expect(r.code).toBe(2);
    expect(r.served).toEqual([]);
  });
});

describe('config from the environment', () => {
  test('is the tools mapping: the same Config as every other door', () => {
    const env = {
      PETAL_API: 'http://localhost:9000',
      NEAR_AI_API_KEY: 'k2',
      PETAL_LLM_DAILY_USD: '2.5',
      PETAL_LIVE: '1',
      PETAL_WRITER_KEY_FILE: '../.secrets/w.json',
      PETAL_TRUSTED_WRITERS: 'a.testnet, b.testnet',
    };
    expect(configFromEnv(env, '/repo/build')).toEqual(toolsConfigFromEnv(env, '/repo/build'));
  });

  test('PETAL_FAKE=1 turns fake mode on, and so does --fake; neither is the default', () => {
    expect(configFromEnv({}, '/repo').fake).toBe(false);
    expect(configFromEnv({ PETAL_FAKE: '1' }, '/repo').fake).toBe(true);
    expect(configFromEnv({}, '/repo', { fake: true }).fake).toBe(true);
    expect(configFromEnv({ PETAL_FAKE: '1' }, '/repo', { fake: false }).fake).toBe(true);
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

  test('PETAL_FAKE=1 reaches the tools: the recorded quote, with no flag and no network', () => {
    const out = execFileSync(
      process.execPath,
      [join(ROOT, 'apps/cli/src/index.ts'), 'quote', '--purpose', 'sponsor_refresh'],
      { encoding: 'utf8', env: { ...process.env, PETAL_FAKE: '1' } },
    );
    expect(JSON.parse(out)).toMatchObject({
      dry: true,
      correlation_id: '00000000-0000-4000-8000-000000000000',
    });
  });

  test('pnpm --dir: relative --out and @file stay in the folder the person is in', () => {
    // The skill's way to a local flower when no site runs. The fake config keeps it offline.
    const dir = mkdtempSync(join(tmpdir(), 'w7-render-'));
    const env = { ...process.env, PETAL_FAKE: '1' };
    const petal = (...args: string[]) =>
      spawnSync('pnpm', ['-s', '--dir', ROOT, 'petal', ...args], {
        cwd: dir,
        env,
        encoding: 'utf8',
        maxBuffer: 1 << 24,
      });
    const proposed = petal('propose', 'near-validators', '--segments', 'backers', '--quiet');
    expect(proposed.status, proposed.stderr).toBe(0);
    writeFileSync(join(dir, 'spec.json'), JSON.stringify(JSON.parse(proposed.stdout).spec));

    const r = petal('render', '@spec.json', '--out', 'flower.svg', '--quiet');
    expect(r.status, r.stderr).toBe(0);
    expect(readFileSync(join(dir, 'flower.svg'), 'utf8')).toMatch(/^<svg/);
    expect(existsSync(join(ROOT, 'flower.svg'))).toBe(false);
    expect(JSON.parse(r.stdout).spec_sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  test('pnpm -s petal keeps stdout clean (the MCP install command relies on it)', () => {
    const r = spawnSync('pnpm', ['-s', '--dir', ROOT, 'petal', 'help'], { encoding: 'utf8' });
    if (r.error) throw r.error;
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/^petal: /);
  });
});
