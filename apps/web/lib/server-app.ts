// Server only. The one Hono app behind /api/[[...route]] and the server-rendered pages.
//
// The switch is PETAL_API_MOCK:
//   1      the API mock (lib/api-mock.ts): fixtures on the same routes
//   0      petalApp from @petal/agent, and fail loudly if it is not built
//   unset  petalApp; while it is still a stub (not_implemented), the mock, with a warning
// /api/v1/health says which one answers (`mock: true`), and so does the x-petal-api header.
import type { Hono } from 'hono';
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

async function build(): Promise<ServerApp> {
  const flag = process.env.PETAL_API_MOCK?.trim();
  if (flag === '1') return mock();
  try {
    const { petalApp } = await import('@petal/agent');
    return { app: petalApp(configFromEnv()), mode: 'real' };
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
