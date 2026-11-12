// The HTTP door (T052): one route per tool (http-api.md), /api/v1/health and /mcp. No agent
// routes: they live in @petal/agent (agentRoutes), and petalApp joins the two (one-way deps).
// Bodies and responses are the tools' inputs and outputs; the door only maps error codes to
// HTTP statuses, reads query strings, and streams progress as SSE when asked.
import { promisify } from 'node:util';
import { gunzip as gunzipCb, gzip as gzipCb } from 'node:zlib';
import {
  API_VERSION,
  aboutKey,
  canonicalJson,
  DEFAULT_VIEW,
  sha256Hex,
  TOOLS_VERSION,
  validateMark,
} from '@petal/core';
import type { Claim } from '@petal/core/types';
import { type Context, Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import { keptProposals, lastStretch, mapBlocs, shownBlocs } from '../blocs.ts';
import { versioned } from '../define.ts';
import { privateStore, specBody } from '../drafts.ts';
import { fromThrown, isToolError, toolError } from '../errors.ts';
import { freshGate } from '../fresh.ts';
import { hiddenMap } from '../hidden.ts';
import { LiveHub } from '../live.ts';
import { type CardMark, cardMark, mapsOf, mapViews, namesKey } from '../map.ts';
import { mapClaims } from '../mapping-claims.ts';
import { mcpHttpHandler } from '../mcp/server.ts';
import { cardProposals, proposalsOf } from '../proposals.ts';
import { findTool } from '../registry.ts';
import { brainOf } from '../tools/brain.ts';
import { base, findSnapshot } from '../tools/shared.ts';
import type { ToolContext } from '../types.ts';
import { valuesOf } from '../value-store.ts';
import { viewAsked, viewOfPerson } from '../views.ts';
import {
  explorationRoutes,
  isSnapshotPost,
  type SessionGate,
  SITE_HEADER,
} from './explorations.ts';
import { isLocalSite, rateLimit } from './rate-limit.ts';
import { body, bodyCap, fail, respond } from './reply.ts';

const IMMUTABLE = 'public, max-age=31536000, immutable';
const SHA = /^[0-9a-f]{64}$/;
const gzip = promisify(gzipCb);
const gunzip = promisify(gunzipCb);

/** Snapshots checked against their name, this process: at most this many are remembered. */
const VERIFIED_MAX = 1000;

type Out = Record<string, unknown>;

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

export { SITE_HEADER };

const wantsSse = (c: Context) => (c.req.header('accept') ?? '').includes('text/event-stream');

class MismatchedSnapshot extends Error {}

/** The brain version this site serves (tools/brain.ts), or null when it has no brain/. */
function brainVersionOf(ctx: ToolContext): string | null {
  try {
    return brainOf(ctx).version;
  } catch {
    return null;
  }
}

export function httpApp(given: ToolContext, o: { gate?: SessionGate } = {}): Hono {
  const app = new Hono();
  // HTTP and MCP are one set of callers, whoever they say they are: fresh reads take turns between them.
  // One live hub, the app's when it has one, so what its other routes touch reaches a page that follows.
  const ctx: ToolContext = { ...given, fresh: freshGate(given), live: given.live ?? new LiveHub() };
  const limit = rateLimit({
    max: 60,
    windowMs: 60_000,
    now: () => ctx.now().getTime(),
    what: 'tool calls',
    local: isLocalSite(ctx.config.apiBase),
  });
  // A posted reading has its own, larger limits (explorations.ts); everything else stays under 256 KiB.
  app.use('*', (c, next) => (isSnapshotPost(c) ? next() : bodyCap(c, next)));
  // First: these read a session, so the open CORS below doesn't reach them.
  app.route('/', explorationRoutes(ctx, limit, o.gate));
  app.use('*', cors({ origin: '*', exposeHeaders: ['Retry-After', 'ETag'] }));
  const mcp = mcpHttpHandler(ctx);

  /** An address naming a view nobody kept. */
  const noView = () =>
    versioned(
      toolError(
        'not_found',
        'No view under that hash.',
        'GET /api/v1/views/:hash names every view kept.',
      ),
    );

  const run = (name: string, input: unknown, runCtx: ToolContext = ctx): Promise<unknown> => {
    const tool = findTool(name);
    if (!tool) return Promise.resolve(versioned(toolError('internal', `No tool ${name}.`)));
    return tool.run(input, runCtx);
  };

  /** Run a tool for this request: JSON, or SSE (`progress` events, then `result`) when asked. */
  async function answer(
    c: Context,
    name: string,
    input: unknown,
    base: ToolContext = ctx,
  ): Promise<Response> {
    if (isToolError(input)) return respond(c, input);
    if (!wantsSse(c)) return respond(c, await run(name, input, base));
    return streamSSE(c, async (stream) => {
      let chain: Promise<void> = Promise.resolve();
      const runCtx: ToolContext = {
        ...base,
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
  app.get('/api/v1/look-up', limit, (c) =>
    answer(c, 'look_up', pick(c.req.query(), ['query', 'chain'])),
  );
  app.get('/api/v1/find', limit, (c) =>
    answer(c, 'find_target', pick(c.req.query(), ['query', 'chain', 'limit'], ['limit'])),
  );
  app.post('/api/v1/read-chain', limit, async (c) => answer(c, 'read_chain', await body(c)));
  app.get('/api/v1/read-page', limit, (c) =>
    answer(c, 'read_page', pick(c.req.query(), ['url', 'start'], ['start'])),
  );
  app.get('/api/v1/web-search', limit, (c) => answer(c, 'search', pick(c.req.query(), ['query'])));
  // The brain (005): every header, a route for a question or a contract's answers, one file by id. Each
  // serving's receipt names this door and the session's subject, when there is one (12 Nov, step 5).
  const brainReader = async (c: Context): Promise<ToolContext> => ({
    ...ctx,
    caller: { ...ctx.caller, door: 'http', subject: (await o.gate?.subjectOf(c)) ?? null },
  });
  app.get('/api/v1/brain', limit, async (c) => answer(c, 'brain_index', {}, await brainReader(c)));
  app.get('/api/v1/brain/route', limit, async (c) => {
    const q = c.req.query();
    const answers = (q.answers ?? '')
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean);
    return answer(
      c,
      'brain_route',
      { ...(q.q ? { question: q.q } : {}), ...(answers.length ? { answers } : {}) },
      await brainReader(c),
    );
  });
  app.get('/api/v1/brain/context', limit, async (c) => {
    const q = c.req.query();
    const answers = (q.answers ?? '')
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean);
    return answer(
      c,
      'brain_context',
      { ...(q.q ? { question: q.q } : {}), ...(answers.length ? { answers } : {}) },
      await brainReader(c),
    );
  });
  app.get('/api/v1/brain/files/:id', limit, async (c) =>
    answer(c, 'brain_file', { id: c.req.param('id') }, await brainReader(c)),
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
  // The stored .gz itself, so a request costs a file read and no compression on this thread. Its bytes
  // are checked against the name once a process; a store with no such file makes one, off this thread.
  const verified = new Set<string>();
  async function storedGzip(sha: string): Promise<Uint8Array | null> {
    const stored = await ctx.store.gz?.(sha);
    if (stored) {
      if (!verified.has(sha)) {
        if (sha256Hex(new Uint8Array(await gunzip(stored))) !== sha) throw new MismatchedSnapshot();
        if (verified.size >= VERIFIED_MAX) verified.clear();
        verified.add(sha);
      }
      return stored;
    }
    const s = await findSnapshot(ctx, sha);
    if (!s) return null;
    const bytes = new TextEncoder().encode(canonicalJson(s));
    if (sha256Hex(bytes) !== sha) throw new MismatchedSnapshot();
    return new Uint8Array(await gzip(bytes));
  }

  app.get('/api/v1/snapshots/:sha256', limit, async (c) => {
    const sha = c.req.param('sha256');
    if (!SHA.test(sha)) return fail(c, toolError('bad_input', 'Not a sha256.'));
    const etag = `"${sha}"`;
    if (c.req.header('if-none-match') === etag) return c.body(null, 304, { ETag: etag });
    let gz: Uint8Array | null;
    try {
      gz = await storedGzip(sha);
    } catch (err) {
      if (err instanceof MismatchedSnapshot) {
        return fail(c, toolError('internal', 'The stored snapshot does not match its hash.'));
      }
      return fail(c, fromThrown(err));
    }
    if (!gz) return fail(c, toolError('not_found', `No snapshot ${sha}.`));
    const headers: Record<string, string> = {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': IMMUTABLE,
      ETag: etag,
      Vary: 'Accept-Encoding',
    };
    if ((c.req.header('accept-encoding') ?? '').includes('gzip')) {
      headers['Content-Encoding'] = 'gzip';
      return c.body(gz as Uint8Array<ArrayBuffer>, 200, headers);
    }
    return c.body(new Uint8Array(await gunzip(gz)), 200, headers);
  });

  /**
   * The viewer's own names (annotation step 6), for a drawing or a list made for them: the signed-in person's
   * named annotations, from all their projects. A visitor has none, and a response that carries a person's
   * is never kept by a cache.
   */
  async function forViewer(c: Context): Promise<ToolContext> {
    const subject = (await o.gate?.subjectOf(c)) ?? null;
    if (!subject) return ctx;
    const names = (await privateStore(ctx.config).annotation.list(subject))
      // their names and their types (#97), each drawn on the petals it's about
      .filter((r) => r.verb === 'named' || r.verb === 'is_a')
      .map((r) => JSON.parse(r.body) as Claim);
    if (!names.length) return ctx;
    c.header('Cache-Control', 'private, no-store');
    return { ...ctx, names };
  }

  // -- counting, specs, render
  app.post('/api/v1/figures', limit, async (c) => answer(c, 'compute_figures', await body(c)));
  app.post('/api/v1/specs/propose', limit, async (c) => answer(c, 'propose_spec', await body(c)));
  app.post('/api/v1/specs/validate', limit, async (c) => answer(c, 'validate_spec', await body(c)));
  app.post('/api/v1/render', limit, async (c) => {
    const sent = await body(c);
    if (isToolError(sent)) return respond(c, sent);
    // with no view of its own, it's drawn through the viewer's: the signed-in person's, or the default
    const input =
      typeof sent === 'object' &&
      sent !== null &&
      !Array.isArray(sent) &&
      (sent as Out).view === undefined
        ? { ...(sent as Out), view: await viewOfPerson(ctx, (await o.gate?.subjectOf(c)) ?? null) }
        : sent;
    // include_svg defaults to true over HTTP (false over MCP and in process).
    const given = typeof input === 'object' && input !== null && !Array.isArray(input);
    const withSvg =
      given && (input as Out).include_svg === undefined
        ? { ...(input as Out), include_svg: true }
        : input;
    const viewer = await forViewer(c);
    if (c.req.query('format') !== 'svg') return answer(c, 'render_flower', withSvg, viewer);
    const out = await run(
      'render_flower',
      given ? { ...(input as Out), include_svg: true } : input,
      viewer,
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
    // drawn with the view its address names, by its whole hash, so a picture kept a year is always right
    const view = await viewAsked(ctx, c.req.query('view'));
    if (!view) return respond(c, noView());
    const f = await run('get_flower', { id: c.req.param('id') });
    if (isToolError(f)) return respond(c, f);
    const spec = (f as { entry: { spec: unknown } }).entry.spec;
    const r = await run('render_flower', { spec, include_svg: true, view });
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

  // -- relations between groups
  app.get('/api/v1/relations/account-groups', limit, (c) =>
    answer(c, 'account_groups', pick(c.req.query(), ['account', 'limit'], ['limit'])),
  );
  app.get('/api/v1/relations/shared', limit, (c) =>
    answer(c, 'shared_accounts', pick(c.req.query(), ['group_a', 'group_b', 'limit'], ['limit'])),
  );
  app.get('/api/v1/relations/related', limit, (c) =>
    answer(c, 'related_groups', pick(c.req.query(), ['group', 'by', 'limit'], ['limit'])),
  );
  app.get('/api/v1/relations/overview', limit, (c) =>
    answer(
      c,
      'relations_overview',
      pick(c.req.query(), ['min_shared', 'kind', 'limit'], ['min_shared', 'limit']),
    ),
  );
  // One map (Elco, 10 Nov): every view stored here with its reading, name, date and maker, and the relations
  // index's groups and pairs, in one answer, as the map bench's copy had them (specs/006-the-map).
  /**
   * A public answer named by what it holds, its `made` time aside (/map/data's cache, 11 Nov): a 304 when the
   * asker holds it already, so the map's megabytes travel once while no reading changes. Cloudflare marks a
   * compressed answer's tag weak (W/), so the tag is compared without it.
   */
  function named(c: Context, out: Record<string, unknown>): Response {
    const { made: _made, ...held } = out;
    const etag = `"${sha256Hex(JSON.stringify(held))}"`;
    c.header('ETag', etag);
    if ((c.req.header('if-none-match') ?? '').replace(/^W\//, '') === etag)
      return c.body(null, 304);
    return respond(c, out);
  }
  app.get('/api/v1/map', limit, async (c) => {
    const view = await viewAsked(ctx, c.req.query('view'));
    if (!view) return respond(c, noView());
    const overview = (await run('relations_overview', { kind: 'holdings', limit: 5000 })) as {
      groups?: Record<string, unknown>[];
      pairs?: Record<string, unknown>[];
    };
    if (isToolError(overview)) return respond(c, overview);
    return named(c, {
      made: new Date().toISOString(),
      source: (ctx.config.apiBase ?? '').replace(/\/+$/, ''),
      views: await mapViews(await forViewer(c), view),
      groups: (overview.groups ?? []).map((g) => ({
        id: g.id,
        chain: g.chain,
        snapshot_sha256: g.snapshot_sha256,
        members_total: g.members_total,
        title: g.title,
      })),
      pairs: (overview.pairs ?? []).map((p) => ({
        a: p.a,
        b: p.b,
        shared: p.shared,
        weight: p.weight,
        match: p.match,
      })),
    });
  });
  // The map as a list (Elco, 10 Nov: the gallery, the lobby and /make read the one map): every view as
  // /api/v1/map has it, in the same order, each with its picture, without its reading.
  // Each list takes ?view=<hash>: its pictures, keys and readings are then that view's (one-source.md, step 2).
  app.get('/api/v1/map/views', limit, async (c) => {
    const view = await viewAsked(ctx, c.req.query('view'));
    if (!view) return respond(c, noView());
    return respond(c, {
      views: (await mapViews(await forViewer(c), view)).map(({ reading: _r, ...row }) => row),
    });
  });
  // One card per map (Elco, 10 Nov: "maps that map the same address need to come together as versions of
  // the same map"): each address, its readings (the sediments) newest first, and each reading's drawings.
  /** Each map's mark (board #85), by the map's address: its name, symbol and logo, each with where it came from. */
  async function marks(): Promise<Map<string, CardMark>> {
    const site = base(ctx);
    const out = new Map<string, CardMark>();
    for (const r of await privateStore(ctx.config).mark.list()) {
      const m = validateMark(JSON.parse(r.body));
      if (m.ok) out.set(r.about, cardMark(m.value, site));
    }
    return out;
  }
  /** Each DAO map's proposals in short (#93): how many, how many with votes, when read. */
  async function summaries() {
    return new Map([...(await proposalsOf(ctx))].map(([about, p]) => [about, cardProposals(p)]));
  }
  // A map's proposals and each account's vote on each (#93), as proposals/v1; not_found when none were read.
  app.get('/api/v1/maps/:id/proposals', limit, async (c) => {
    const id = aboutKey(c.req.param('id'));
    const row = await privateStore(ctx.config).proposals.get(id);
    return respond(
      c,
      row
        ? { proposals: JSON.parse(row.body) }
        : versioned(toolError('not_found', 'No proposals read for that map.')),
    );
  });
  // A map's voting blocs (#94; LOOK, 11 Nov): over ?from&to (default the 90 days up to its newest proposal's close,
  // as the vote ring shows them),
  // ?min_shared, ?min_agreement and ?min_kappa settable; members as the petal ids of the map's newest reading. The
  // blocs and a pair count; the pairs only on ?pairs=true, without each pair's proposals (META, 11 Nov).
  app.get('/api/v1/maps/:id/blocs', limit, async (c) => {
    const id = aboutKey(c.req.param('id'));
    const q = (k: string) => c.req.query(k) || undefined;
    const time = (k: string) => {
      const v = q(k);
      return v === undefined
        ? undefined
        : Number.isNaN(Date.parse(v))
          ? null
          : new Date(v).toISOString();
    };
    const num = (k: string) => (q(k) === undefined ? undefined : Number(q(k)));
    const [from, to, minShared, minAgreement, minKappa] = [
      time('from'),
      time('to'),
      num('min_shared'),
      num('min_agreement'),
      num('min_kappa'),
    ];
    if (from === null || to === null)
      return respond(c, versioned(toolError('bad_input', 'from and to are ISO times.')));
    if (
      (minShared !== undefined && !(Number.isInteger(minShared) && minShared >= 1)) ||
      (minAgreement !== undefined && !(minAgreement >= 0 && minAgreement <= 1)) ||
      (minKappa !== undefined && !(minKappa >= -1 && minKappa <= 1))
    )
      return respond(
        c,
        versioned(
          toolError(
            'bad_input',
            'min_shared is a whole number from 1; min_agreement from 0 to 1; min_kappa from -1 to 1.',
          ),
        ),
      );
    // no period asked: the ring's stretch; every proposal in it was submitted by its end, so none is cut
    const kept = from === undefined && to === undefined ? await keptProposals(ctx, id) : null;
    const stretch = kept ? lastStretch(kept) : null;
    const blocs = await mapBlocs(ctx, id, {
      from: from ?? stretch?.from ?? null,
      to: to ?? null,
      ...(minShared === undefined ? {} : { min_shared: minShared }),
      ...(minAgreement === undefined ? {} : { min_agreement: minAgreement }),
      ...(minKappa === undefined ? {} : { min_kappa: minKappa }),
    });
    return respond(
      c,
      blocs
        ? shownBlocs(
            stretch ? { ...blocs, period: { from: stretch.from, to: stretch.to } } : blocs,
            q('pairs') === 'true',
          )
        : versioned(toolError('not_found', 'No proposals read for that map.')),
    );
  });
  // A map's claims by Petals' own mapping (Elco, 11 Nov: "show them"): about its accounts, the same for everyone.
  app.get('/api/v1/maps/:id/claims', limit, async (c) => {
    const id = aboutKey(c.req.param('id'));
    const claims = await mapClaims(ctx, id);
    return respond(
      c,
      claims ? { about: id, claims } : versioned(toolError('not_found', 'No map by that address.')),
    );
  });
  app.get('/api/v1/maps', limit, async (c) => {
    const view = await viewAsked(ctx, c.req.query('view'));
    if (!view) return respond(c, noView());
    return named(c, {
      maps: mapsOf(
        await mapViews(await forViewer(c), view),
        await marks(),
        await valuesOf(ctx),
        await summaries(),
      ),
    });
  });
  // One map's card, by its id (URL-encoded, since it holds colons), for its page.
  app.get('/api/v1/maps/:id', limit, async (c) => {
    const view = await viewAsked(ctx, c.req.query('view'));
    if (!view) return respond(c, noView());
    const id = aboutKey(c.req.param('id'));
    const map = mapsOf(
      await mapViews(await forViewer(c), view, { hidden: true }),
      await marks(),
      await valuesOf(ctx),
      await summaries(),
    ).find((m) => m.id === id);
    // a map hidden from the Power Map (#96) still answers here, and says why
    const hidden = hiddenMap(id);
    return respond(
      c,
      map
        ? { map, ...(hidden ? { hidden: { why: hidden.why, decided: hidden.decided } } : {}) }
        : versioned(toolError('not_found', 'No map under that address.')),
    );
  });
  // A view's still picture, as a flower's tile is drawn: with the view its address names. No per-address limit: a
  // gallery asks for every view's picture at once, and behind the site every visitor reaches this server
  // from the site's own address. Each picture is kept for a year wherever it's cached.
  app.get('/api/v1/map/:sha/svg', async (c) => {
    const view = await viewAsked(ctx, c.req.query('view'));
    if (!view) return respond(c, noView());
    const sha = c.req.param('sha');
    let spec: unknown;
    try {
      spec = /^[0-9a-f]{64}$/.test(sha) ? await specBody(ctx.config, sha) : null;
    } catch (e) {
      return respond(c, versioned(fromThrown(e)));
    }
    if (!spec)
      return respond(c, versioned(toolError('not_found', 'No view on the map under that hash.')));
    // A person's picture (annotation step 6): its address names their set of names, and it's drawn with them
    // only for that person, whose set it is now. Never kept by a cache, whoever asks.
    const names = c.req.query('names');
    const viewer = names ? await forViewer(c) : ctx;
    const theirs = !!names && !!viewer.names?.length && namesKey(viewer.names) === names;
    const r = await run('render_flower', { spec, include_svg: true, view }, theirs ? viewer : ctx);
    if (isToolError(r)) return respond(c, r);
    const { svg, render_sha256 } = r as { svg: string; render_sha256: string };
    return c.body(svg, 200, {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': names ? 'private, no-store' : IMMUTABLE,
      ETag: `"${render_sha256}"`,
    });
  });
  app.get('/api/v1/relations/path', limit, (c) => {
    const q = c.req.query();
    const numbers = ['max_depth', 'budget'];
    const input = pick(q, ['account_a', 'account_b', ...numbers], numbers);
    // true and false become booleans; anything else stays a string for the schema to refuse
    if (q.include_inferred !== undefined) {
      const flag = q.include_inferred;
      input.include_inferred = flag === 'true' ? true : flag === 'false' ? false : flag;
    }
    return answer(c, 'power_path', input);
  });

  // -- health and MCP
  app.get('/api/v1/health', async (c) =>
    c.json({
      ok: true,
      map: await mapStatus(ctx),
      llm: ctx.config.nearAiApiKey ? 'up' : 'recorded',
      // additive (step 4): the brain every door serves, as <index hash>@<commit>; null without a brain/
      brain_version: brainVersionOf(ctx),
      // additive: true on a public site (PETAL_PUBLIC=1), which does no outside work for visitors
      public: ctx.config.public === true,
      version: API_VERSION,
      tools_version: TOOLS_VERSION,
      // The deployed commit, so a deploy can witness what is really running. Unset locally.
      commit: process.env.PETAL_COMMIT ?? null,
    }),
  );
  // One POST, one call against the limit: a batch of 100 would be 100 tool calls for one hit, and MCP
  // itself has dropped batches.
  app.all('/mcp', limit, async (c) => {
    if (c.req.method === 'POST') {
      const sent = await c.req.raw.clone().text();
      if (sent.trimStart().startsWith('[')) {
        return fail(
          c,
          toolError('bad_input', '/mcp takes one call at a time.', 'Send each as its own POST.'),
        );
      }
    }
    // With no address configured, a site's own /mcp says where it is, so a flower's link opens for
    // whoever's agent hands it over. Only links change, and only in this caller's answer.
    const site = ctx.config.apiBase ? undefined : c.req.header(SITE_HEADER);
    const handler = site
      ? mcpHttpHandler({ ...ctx, config: { ...ctx.config, apiBase: site } })
      : mcp;
    return handler.fetch(c.req.raw);
  });

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
 * live in this server's memory and local mirror only (not on NEAR); held: a public site, which
 * answers from the copies of published rows it ships and reads no chain.
 */
async function mapStatus(ctx: ToolContext): Promise<'up' | 'down' | 'mirror' | 'held'> {
  // A public site reads no chain, so it can't say whether the map is up: it answers from what it ships.
  if (ctx.config.public) return 'held';
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
