// The HTTP door (T052): one route per tool (http-api.md), /api/v1/health and /mcp. No agent
// routes: they live in @petal/agent (agentRoutes), and petalApp joins the two (one-way deps).
// Bodies and responses are the tools' inputs and outputs; the door only maps error codes to
// HTTP statuses, reads query strings, and streams progress as SSE when asked.
import { gzipSync } from 'node:zlib';
import { API_VERSION, canonicalJson, sha256Hex, TOOLS_VERSION } from '@petal/core';
import type { ToolError } from '@petal/core/types';
import { type Context, Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import { versioned } from '../define.ts';
import { fromThrown, HTTP_STATUS, isToolError, toolError } from '../errors.ts';
import { mcpHttpHandler } from '../mcp/server.ts';
import { findTool } from '../registry.ts';
import { findSnapshot } from '../tools/shared.ts';
import type { ToolContext } from '../types.ts';
import { rateLimit } from './rate-limit.ts';

const IMMUTABLE = 'public, max-age=31536000, immutable';
const SHA = /^[0-9a-f]{64}$/;

type Out = Record<string, unknown>;

function respond(c: Context, out: unknown): Response {
  if (isToolError(out)) {
    const status = HTTP_STATUS[out.error.code];
    if (out.error.retry_after_s !== undefined)
      c.header('Retry-After', String(out.error.retry_after_s));
    return c.json(out, status);
  }
  return c.json(out as Out, 200);
}

const fail = (c: Context, e: ToolError) => respond(c, versioned(e));

/** The JSON body, {} when empty; a ToolError when it is not JSON. */
async function body(c: Context): Promise<unknown> {
  const text = await c.req.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    return versioned(
      toolError('bad_input', 'The request body is not JSON.', 'Send application/json.'),
    );
  }
}

/** Query numbers: digits become a number; anything else stays a string for the schema to refuse. */
const num = (v: string) => (/^\d+$/.test(v) ? Number(v) : v);

function pick(q: Record<string, string>, keys: string[], numeric: string[] = []): Out {
  const out: Out = {};
  for (const k of keys) {
    const v = q[k];
    if (v !== undefined && v !== '') out[k] = numeric.includes(k) ? num(v) : v;
  }
  return out;
}

const wantsSse = (c: Context) => (c.req.header('accept') ?? '').includes('text/event-stream');

export function httpApp(ctx: ToolContext): Hono {
  const app = new Hono();
  app.use('*', cors({ origin: '*', exposeHeaders: ['Retry-After', 'ETag'] }));
  const limit = rateLimit({
    max: 60,
    windowMs: 60_000,
    now: () => ctx.now().getTime(),
    what: 'tool calls',
  });
  const mcp = mcpHttpHandler(ctx);

  const run = (name: string, input: unknown, runCtx: ToolContext = ctx): Promise<unknown> => {
    const tool = findTool(name);
    if (!tool) return Promise.resolve(versioned(toolError('internal', `No tool ${name}.`)));
    return tool.run(input, runCtx);
  };

  /** Run a tool for this request: JSON, or SSE (`progress` events, then `result`) when asked. */
  async function answer(c: Context, name: string, input: unknown): Promise<Response> {
    if (isToolError(input)) return respond(c, input);
    if (!wantsSse(c)) return respond(c, await run(name, input));
    return streamSSE(c, async (stream) => {
      let chain: Promise<void> = Promise.resolve();
      const runCtx: ToolContext = {
        ...ctx,
        onProgress: (e) => {
          ctx.onProgress?.(e);
          chain = chain.then(() => stream.writeSSE({ event: 'progress', data: JSON.stringify(e) }));
        },
      };
      const out = await run(name, input, runCtx);
      await chain;
      await stream.writeSSE({ event: 'result', data: JSON.stringify(out) });
    });
  }

  // -- networks and snapshots
  app.get('/api/v1/find', limit, (c) =>
    answer(c, 'find_target', pick(c.req.query(), ['query', 'chain', 'limit'], ['limit'])),
  );
  app.get('/api/v1/networks', limit, (c) =>
    answer(c, 'list_networks', pick(c.req.query(), ['query'])),
  );
  app.get('/api/v1/networks/:id', limit, (c) => {
    const params = c.req.query();
    const input = { id: c.req.param('id'), ...(Object.keys(params).length ? { params } : {}) };
    return answer(c, 'get_network', input);
  });
  app.post('/api/v1/snapshots', limit, async (c) => answer(c, 'get_snapshot', await body(c)));
  app.get('/api/v1/snapshots/:sha256/describe', limit, (c) =>
    answer(c, 'describe_snapshot', {
      sha256: c.req.param('sha256'),
      ...pick(c.req.query(), ['top'], ['top']),
    }),
  );
  app.get('/api/v1/snapshots/:sha256', limit, async (c) => {
    const sha = c.req.param('sha256');
    if (!SHA.test(sha)) return fail(c, toolError('bad_input', 'Not a sha256.'));
    const etag = `"${sha}"`;
    if (c.req.header('if-none-match') === etag) return c.body(null, 304, { ETag: etag });
    let s: unknown;
    try {
      s = await findSnapshot(ctx, sha);
    } catch (err) {
      return fail(c, fromThrown(err));
    }
    if (!s) return fail(c, toolError('not_found', `No snapshot ${sha}.`));
    const bytes = new TextEncoder().encode(canonicalJson(s));
    if (sha256Hex(bytes) !== sha) {
      return fail(c, toolError('internal', 'The stored snapshot does not match its hash.'));
    }
    const headers: Record<string, string> = {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': IMMUTABLE,
      ETag: etag,
      Vary: 'Accept-Encoding',
    };
    if ((c.req.header('accept-encoding') ?? '').includes('gzip')) {
      headers['Content-Encoding'] = 'gzip';
      return c.body(gzipSync(bytes), 200, headers);
    }
    return c.body(bytes, 200, headers);
  });

  // -- counting, specs, render
  app.post('/api/v1/figures', limit, async (c) => answer(c, 'compute_figures', await body(c)));
  app.post('/api/v1/specs/propose', limit, async (c) => answer(c, 'propose_spec', await body(c)));
  app.post('/api/v1/specs/validate', limit, async (c) => answer(c, 'validate_spec', await body(c)));
  app.post('/api/v1/render', limit, async (c) => {
    const input = await body(c);
    if (isToolError(input)) return respond(c, input);
    // include_svg defaults to true over HTTP (false over MCP and in process).
    const given = typeof input === 'object' && input !== null && !Array.isArray(input);
    const withSvg =
      given && (input as Out).include_svg === undefined
        ? { ...(input as Out), include_svg: true }
        : input;
    if (c.req.query('format') !== 'svg') return answer(c, 'render_flower', withSvg);
    const out = await run(
      'render_flower',
      given ? { ...(input as Out), include_svg: true } : input,
    );
    if (isToolError(out)) return respond(c, out);
    const r = out as { svg: string; render_sha256: string };
    return c.body(r.svg, 200, {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      ETag: `"${r.render_sha256}"`,
    });
  });

  // -- the shared map
  app.get('/api/v1/flowers', limit, (c) =>
    answer(c, 'list_flowers', pick(c.req.query(), ['network', 'maker', 'limit'], ['limit'])),
  );
  app.get('/api/v1/flowers/:id/svg', limit, async (c) => {
    const f = await run('get_flower', { id: c.req.param('id') });
    if (isToolError(f)) return respond(c, f);
    const spec = (f as { entry: { spec: unknown } }).entry.spec;
    const r = await run('render_flower', { spec, include_svg: true });
    if (isToolError(r)) return respond(c, r);
    const { svg, render_sha256 } = r as { svg: string; render_sha256: string };
    return c.body(svg, 200, {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': IMMUTABLE,
      ETag: `"${render_sha256}"`,
    });
  });
  app.get('/api/v1/flowers/:id', limit, (c) => answer(c, 'get_flower', { id: c.req.param('id') }));
  app.post('/api/v1/publish/prepare', limit, async (c) =>
    answer(c, 'prepare_publish', await body(c)),
  );
  app.post('/api/v1/publish', limit, async (c) => answer(c, 'publish_flower', await body(c)));
  app.post('/api/v1/quote', limit, async (c) => answer(c, 'quote_payment', await body(c)));

  // -- health and MCP
  app.get('/api/v1/health', async (c) =>
    c.json({
      ok: true,
      map: await mapStatus(ctx),
      llm: ctx.config.nearAiApiKey ? 'up' : 'recorded',
      version: API_VERSION,
      tools_version: TOOLS_VERSION,
      // The deployed commit, so a deploy can witness what is really running. Unset locally.
      commit: process.env.PETAL_COMMIT ?? null,
    }),
  );
  app.all('/mcp', limit, (c) => mcp.fetch(c.req.raw));

  app.notFound((c) =>
    fail(
      c,
      toolError(
        'not_found',
        `No route ${c.req.method} ${c.req.path}.`,
        'Routes: specs/001-petal-core/contracts/http-api.md.',
      ),
    ),
  );
  app.onError((err, c) => fail(c, fromThrown(err)));
  return app;
}

/**
 * up: the configured map answers; down: it does not; mirror: no map is configured, so flowers
 * live in this server's memory and local mirror only (not on NEAR).
 */
async function mapStatus(ctx: ToolContext): Promise<'up' | 'down' | 'mirror'> {
  if (ctx.config.fake || !ctx.config.map) return 'mirror';
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), 3000);
  });
  try {
    await Promise.race([
      ctx.map.reader.latest('petal/v1/spec/', { writers: ctx.map.trustedWriters, limit: 1 }),
      timeout,
    ]);
    return 'up';
  } catch {
    return 'down';
  } finally {
    clearTimeout(timer);
  }
}
