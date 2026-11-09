// The server, alone (002-system research, C3; Elco, 8 Nov: "Server should be concerned with serving
// and execution"). It answers every path the website forwards: /api/*, /mcp, /skill.md, /petal.mjs,
// /d/* and /s/*. It has no pages: the website shows those, and forwards the rest here.
//
//   node packages/agent/src/serve.ts         (pnpm server; PORT, default 8787; PETAL_HOST, default 127.0.0.1)
//
// It reads every setting the tools read (@petal/tools' configFromEnv, PETAL_PUBLIC included), and one of
// its own: the site key (C4), PETAL_SITE_KEY or PETAL_SITE_KEY_FILE. With a key, it answers only requests
// that carry it, health aside, and only then believes the visitor's address the website passes on. A
// public server won't start without one: its name would be open to anyone who found it.
import { createHash, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { type Config, configFromEnv as toolsConfig } from '@petal/tools';
import { Hono } from 'hono';
import { buildPetalApp, type PetalAppOptions } from './app.ts';
import { hostedSkill, originFrom } from './hosted.ts';

export const DEFAULT_PORT = 8787;
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** What the website adds to each request it forwards (apps/web/proxy.ts). */
export const SITE_KEY_HEADER = 'x-petal-site-key';
export const VISITOR_HEADER = 'x-petal-visitor';
/** Where the limiter reads a visitor's address (@petal/tools, clientAddress). */
const ADDRESS_HEADER = 'cf-connecting-ip';
const SITE_HEADER = 'x-petal-site';
const HEALTH = '/api/v1/health';
/** The one file a person's agent fetches (apps/cli/scripts/bundle.ts makes it). */
const PETAL_FILE = 'apps/cli/dist/petal.mjs';
/** The string apps/cli/src/file.ts leaves for the site's address, in whichever quotes it was bundled. */
const PLACEHOLDER = /(["'])%%PETALS_SITE%%\1/;
/** Anything that isn't an address is dropped rather than believed. */
const ADDRESS = /^[0-9a-fA-F:.]{2,45}$/;

type Env = Record<string, string | undefined>;

/** The site key from the environment or its file; none when neither is set. */
export function siteKeyFrom(env: Env): string | undefined {
  const inline = env.PETAL_SITE_KEY?.trim();
  if (inline) return inline;
  const file = env.PETAL_SITE_KEY_FILE?.trim();
  if (!file) return undefined;
  const key = readFileSync(file, 'utf8').trim();
  if (!key) throw new Error(`petal server: ${file} is empty`);
  return key;
}

const digest = (s: string) => createHash('sha256').update(s, 'utf8').digest();
const sameKey = (given: string | undefined, key: string) =>
  given !== undefined && timingSafeEqual(digest(given), digest(key));

export interface ServerOptions {
  /** the site key; none: every request is answered, as on this machine */
  siteKey?: string;
  options?: PetalAppOptions;
  /** where SKILL.md and petal.mjs are read from; default the repo */
  root?: string;
}

/**
 * The API alone: petalApp behind the site key, plus /skill.md and /petal.mjs, which carry the site's
 * address (PETAL_API) so an agent and its file come back to the website, never to this server's name.
 */
export function serverApp(cfg: Config, o: ServerOptions = {}): Hono {
  const api = buildPetalApp(cfg, o.options);
  const root = o.root ?? REPO_ROOT;
  const app = new Hono();

  // The site's address: the configured one, else what the website says (only with the key), else
  // what the request reached, as on this machine.
  const siteOf = (req: Request) =>
    cfg.apiBase?.replace(/\/+$/, '') || req.headers.get(SITE_HEADER) || originFrom(req.headers);

  app.use('*', async (c, next) => {
    if (!o.siteKey) return next();
    if (c.req.path === HEALTH) return next();
    if (!sameKey(c.req.header(SITE_KEY_HEADER), o.siteKey)) {
      // One answer for a wrong key and no key, and nothing about why.
      return c.json({ error: { code: 'not_found', message: 'Not found.' } }, 404);
    }
    return next();
  });

  /** The file as this site serves it, written for one site's address: its bytes and their sha256. */
  const served = async (site: string): Promise<{ file: string; sha: string } | null> => {
    const file = await readFile(join(root, PETAL_FILE), 'utf8').catch(() => null);
    if (!file || !PLACEHOLDER.test(file)) return null;
    const out = file.replace(PLACEHOLDER, () => JSON.stringify(site));
    return { file: out, sha: createHash('sha256').update(out, 'utf8').digest('hex') };
  };

  app.get('/skill.md', async (c) => {
    const skill = await readFile(join(root, 'skill/petal/SKILL.md'), 'utf8');
    const site = siteOf(c.req.raw);
    // The file's sha256, so an agent can check it rather than read 6 MB (Elco, 9 Nov).
    const sha = (await served(site))?.sha;
    // Plain text, because some agents' web tools refuse text/markdown (Hermes did).
    return c.body(hostedSkill(skill, site, sha), 200, {
      'content-type': 'text/plain; charset=utf-8',
    });
  });

  app.get('/petal.mjs', async (c) => {
    const out = await served(siteOf(c.req.raw));
    if (!out) return c.text('petal.mjs is not built on this server.\n', 404);
    return c.body(out.file, 200, {
      'content-type': 'text/javascript; charset=utf-8',
      'cache-control': 'no-store',
    });
  });

  app.all('*', async (c) => {
    const req = trusted(c.req.raw, o.siteKey);
    const res = await api.fetch(req, c.env);
    return labelled(res, c.req.path, cfg.fake === true);
  });
  return app;
}

/**
 * The request as petalApp should see it. With a key, the website vouches for the visitor's address,
 * which goes where the limiter reads it, and for its own address. Whatever a caller sent in those
 * headers itself is dropped first. With no key, as on this machine, the request goes on as it came.
 */
function trusted(req: Request, siteKey: string | undefined): Request {
  if (!siteKey) return req;
  const headers = new Headers(req.headers);
  const visitor = headers.get(VISITOR_HEADER)?.trim();
  headers.delete(VISITOR_HEADER);
  headers.delete(SITE_KEY_HEADER);
  headers.delete(ADDRESS_HEADER);
  headers.delete('x-real-ip');
  if (visitor && ADDRESS.test(visitor)) headers.set(ADDRESS_HEADER, visitor);
  return new Request(req, { headers });
}

/** Says what answered, as the site's in-process app did: health adds mock and fake. */
async function labelled(res: Response, path: string, fake: boolean): Promise<Response> {
  const headers = new Headers(res.headers);
  headers.set('x-petal-api', 'real');
  if (path === HEALTH && (headers.get('content-type') ?? '').includes('json')) {
    const body = (await res.json()) as Record<string, unknown>;
    headers.delete('content-length');
    return new Response(JSON.stringify({ ...body, mock: false, fake }), {
      status: res.status,
      headers,
    });
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

/**
 * Every setting the tools read (PETAL_PUBLIC, the map, the state folder, the address rules). The
 * address is PETAL_API, the website's, and only that: a server's own name never goes into a link.
 */
export function serverConfig(env: Env = process.env): Config {
  return toolsConfig(env, REPO_ROOT);
}

/** The old reader, for its test (app.test.ts): a local address in links, and the daily cap unset. */
export function configFromEnv(env: Env = process.env, port = DEFAULT_PORT): Config {
  const daily = Number(env.PETAL_LLM_DAILY_USD);
  return {
    ...serverConfig(env),
    nearAiApiKey: env.NEAR_AI_API_KEY || undefined,
    llmDailyUsd: env.PETAL_LLM_DAILY_USD && Number.isFinite(daily) ? daily : undefined,
    apiBase: env.PETAL_API || `http://localhost:${port}`,
  };
}

export function serveApi(
  o: {
    cfg?: Config;
    env?: Env;
    port?: number;
    hostname?: string;
    options?: PetalAppOptions;
    siteKey?: string;
  } = {},
) {
  const env = o.env ?? process.env;
  const port = o.port ?? (Number(env.PORT) || DEFAULT_PORT);
  const cfg = o.cfg ?? serverConfig(env);
  const siteKey = o.siteKey ?? siteKeyFrom(env);
  if (cfg.public && !siteKey) {
    throw new Error(
      'petal server: a public server needs its site key (PETAL_SITE_KEY_FILE), or anyone who finds its name can use it.',
    );
  }
  // Test only: a stub in place of NEAR AI (tests/e2e). The key goes wherever this points, so the real
  // host never sets it (scripts/container/entry.sh).
  const baseURL = env.PETAL_NEAR_AI_BASE_URL?.trim();
  const options = o.options ?? (baseURL ? { nearAi: { baseURL, signatureDelaysMs: [0] } } : {});
  const app = serverApp(cfg, { ...(siteKey ? { siteKey } : {}), options });
  // Localhost unless told otherwise: in the container, PETAL_HOST=0.0.0.0, published on 127.0.0.1.
  const hostname = o.hostname ?? (env.PETAL_HOST?.trim() || '127.0.0.1');
  const mode = cfg.nearAiApiKey && !cfg.fake ? 'NEAR AI Cloud' : 'no agent spend';
  return serve({ fetch: app.fetch, port, hostname }, (info) => {
    console.log(
      `Petal server on http://${hostname}:${info.port} (${cfg.public ? 'public' : 'local'}, agent: ${mode}, site key ${siteKey ? 'on' : 'off'})`,
    );
  });
}

if (import.meta.main) serveApi();
