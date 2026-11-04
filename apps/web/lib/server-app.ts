// Server only. The one Hono app behind /api/[[...route]] and the server-rendered pages.
//
// The switch is PETAL_API_MOCK:
//   1      the API mock (lib/api-mock.ts): fixtures on the same routes
//   0      petalApp from @petal/agent, and fail loudly if it is not built
//   unset  petalApp; while it is still a stub (not_implemented), the mock, with a warning
// /api/v1/health says which one answers (`mock: true`), and so does the x-petal-api header.
import { Hono } from 'hono';
import { configFromEnv } from './config.ts';

export type ApiMode = 'mock' | 'real';
export interface ServerApp {
  app: Hono;
  mode: ApiMode;
}

const isStub = (e: unknown) => (e as { code?: string } | null)?.code === 'not_implemented';

async function mock(): Promise<ServerApp> {
  const { createMockApi } = await import('./api-mock.ts');
  return { app: createMockApi().app, mode: 'mock' };
}

/**
 * petalApp, labelled like the mock labels itself: every response carries `x-petal-api: real`, and
 * /api/v1/health adds `mock: false` and `fake`, so the page and a curl can tell which API answered
 * and whether it runs on fakes (PETAL_FAKE=1).
 */
export function labelReal(inner: Hono, o: { fake: boolean }): Hono {
  const app = new Hono();
  app.all('*', async (c) => {
    const res = await inner.fetch(c.req.raw, c.env);
    const headers = new Headers(res.headers);
    headers.set('x-petal-api', 'real');
    if (c.req.path === '/api/v1/health' && (headers.get('content-type') ?? '').includes('json')) {
      const body = (await res.json()) as Record<string, unknown>;
      headers.delete('content-length');
      return new Response(JSON.stringify({ ...body, mock: false, fake: o.fake }), {
        status: res.status,
        headers,
      });
    }
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  });
  return app;
}

async function build(): Promise<ServerApp> {
  const flag = process.env.PETAL_API_MOCK?.trim();
  if (flag === '1') return mock();
  try {
    // Loaded by Node itself, never bundled. The @petal/* packages are workspace links, which
    // Turbopack resolves to their source folders and bundles despite serverExternalPackages; a
    // bundled @petal/agent fails on its new URL(..., import.meta.url) paths (fixtures, .petal/).
    const { petalApp } = (await import(
      /* turbopackIgnore: true */ /* webpackIgnore: true */ '@petal/agent'
    )) as typeof import('@petal/agent');
    const cfg = await configFromEnv();
    return { app: labelReal(petalApp(cfg), { fake: cfg.fake === true }), mode: 'real' };
  } catch (e) {
    if (flag === '0' || !isStub(e)) throw e;
    console.warn(
      'petal web: petalApp is not built yet (W5, T058), so the API mock answers. ' +
        'Set PETAL_API_MOCK=0 to fail instead, or PETAL_API_MOCK=1 to choose the mock.',
    );
    return mock();
  }
}

// One app per server process. Route handlers and server components may load this module
// separately, so the app (and the mock's in-memory map and runs) lives on globalThis.
const g = globalThis as { __petalServerApp?: Promise<ServerApp> };

export function getApp(): Promise<ServerApp> {
  g.__petalServerApp ??= build().catch((e) => {
    g.__petalServerApp = undefined;
    throw e;
  });
  return g.__petalServerApp;
}
