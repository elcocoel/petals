// The HTTP door to explorations (T194, SYS-040 to SYS-043), and the two short links:
//   GET  /api/v1/explorations                      list_explorations
//   POST /api/v1/explorations                      start_exploration
//   GET  /api/v1/explorations/:ref                 get_exploration; :ref is an id or a link's token
//   GET  /api/v1/explorations/:ref/live            a signal (SSE) each time it changes: read it again
//   POST /api/v1/explorations/:ref/steps           save_step
//   POST /api/v1/explorations/:ref/notes           add_note
//   POST /api/v1/explorations/:ref/layers          keep_layer; GET lists them (list_layers)
//   POST /api/v1/explorations/:ref/annotations     add_annotation; GET lists them (list_annotations, ?about=)
//   POST /api/v1/explorations/:ref/datasets/fork   fork_dataset
//   POST /api/v1/explorations/:ref/jobs/take       take_job
//   POST /api/v1/explorations/:ref/jobs/:job/report  report_job
//   GET  /api/v1/explorations/:ref/jobs            list_jobs
//   POST /api/v1/explorations/:ref/claim           a session takes an unowned one, with a continue link;
//                                                  a browser with no session gets an anonymous one for it
//   GET  /api/v1/explorations/:id/links            its links, with no tokens: owner only
//   POST /api/v1/explorations/:id/links            a new link, shown once: owner only
//   POST /api/v1/explorations/:id/links/:link/revoke
//   PUT  /api/v1/explorations/:ref/snapshots/:sha256  a reading made on the person's own machine, so the
//                                                  site can draw it (postSnapshot); gzip allowed
//   GET  /d/:hash                                  a short draft link: redirects to /draft?spec=
//   GET  /s/:token                                 the resume packet, as markdown
//
// They read a session, so they answer before httpApp's open CORS, as the auth routes do, and a POST
// from another site is refused. With no gate (httpApp alone), nobody is ever signed in. httpApp's body
// limit, which comes first, covers them.
import { promisify } from 'node:util';
import { gunzip as gunzipCb } from 'node:zlib';
import { canonicalJson } from '@petal/core';
import { type Context, Hono, type MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import { versioned } from '../define.ts';
import { specBody } from '../drafts.ts';
import { fromThrown, isToolError, toolError } from '../errors.ts';
import { findTool } from '../registry.ts';
import {
  claimExploration,
  explorationIdOf,
  type LinkScope,
  listLinks,
  makeLink,
  packetMarkdown,
  postSnapshot,
  revokeLink,
} from '../tools/explorations.ts';
import { draftPath } from '../tools/shared.ts';
import type { ToolContext } from '../types.ts';
import { body, fail, respond } from './reply.ts';

/** What the door needs from sign-in; the agent package holds the sessions. */
export interface SessionGate {
  subjectOf(c: Context): Promise<string | null>;
  /** The subject and the credential that opened its session, in one look. */
  callerOf?(
    c: Context,
  ): Promise<{ subject: string | null; credential: string | null; by?: string | null }>;
  /** A refusal for a POST from another site; null for one that's fine. */
  refuseForeign(c: Context): Response | null;
  /** Opens an anonymous session on this response, for a browser's first claim. Returns its subject. */
  openAnonymous?(c: Context): Promise<string>;
}

/** Set by the web app's /mcp and /api routes. A bare API has no pages, so its links stay relative. */
export const SITE_HEADER = 'x-petal-site';

const SHA = /^[0-9a-f]{64}$/;
const NEVER_STORE = 'no-store';
const gunzip = promisify(gunzipCb);

/** A posted reading on the wire, gzipped or not. Bodies run 50 KB to 0.8 MB gzipped. */
export const SNAPSHOT_WIRE_MAX_BYTES = 2 * 1024 * 1024;
/** The same reading inflated: a small gzip can't grow past this. */
export const SNAPSHOT_MAX_BYTES = 32 * 1024 * 1024;
/** The one route whose body may pass the door's 256 KiB: it has its own limits, above. */
export const isSnapshotPost = (c: Context) =>
  c.req.method === 'PUT' && /^\/api\/v1\/explorations\/[^/]+\/snapshots\/[^/]+$/.test(c.req.path);

export function explorationRoutes(
  ctx: ToolContext,
  limit: MiddlewareHandler,
  gate?: SessionGate,
): Hono {
  const app = new Hono();

  // With no address configured, the address this person's agent came in by: its links have to open for
  // them, and a browser's cookie on localhost is no use on 127.0.0.1. Only links change.
  const asCaller = async (c: Context): Promise<ToolContext> => {
    const site = ctx.config.apiBase ? undefined : c.req.header(SITE_HEADER);
    const who = gate?.callerOf
      ? await gate.callerOf(c)
      : { subject: (await gate?.subjectOf(c)) ?? null, credential: null };
    return {
      ...ctx,
      ...(site ? { config: { ...ctx.config, apiBase: site } } : {}),
      caller: {
        subject: who.subject,
        credential: who.credential,
        door: 'http',
        ...('by' in who && who.by ? { by: who.by } : {}),
      },
    };
  };
  /** A body that wasn't JSON comes here as its error. */
  const answer = async (c: Context, name: string, input: unknown) => {
    if (isToolError(input)) return respond(c, input);
    const t = findTool(name);
    if (!t) return fail(c, toolError('internal', `No tool ${name}.`));
    return respond(c, await t.run(input, await asCaller(c)));
  };
  /** Runs `f`, and turns what it throws into the usual error. */
  const attempt = async (c: Context, f: () => object | Promise<object>) => {
    try {
      return respond(c, versioned(await f()));
    } catch (e) {
      return fail(c, fromThrown(e));
    }
  };
  /** The body, with the ref from the path; a body that isn't an object stays for the schema to refuse. */
  const withRef = async (c: Context) => {
    const b = await body(c);
    if (!b || typeof b !== 'object' || Array.isArray(b) || isToolError(b)) return b;
    return { ...b, exploration: c.req.param('ref') };
  };

  const noCache: MiddlewareHandler = async (c, next) => {
    await next();
    // no-transform: a compressing proxy would hold a stream's events back
    c.header(
      'Cache-Control',
      c.req.path.endsWith('/live') ? `${NEVER_STORE}, no-transform` : NEVER_STORE,
    );
  };
  const sameSite: MiddlewareHandler = async (c, next) => {
    if (c.req.method === 'POST') {
      const refused = gate?.refuseForeign(c);
      if (refused) return refused;
    }
    await next();
  };

  // Answered here, so httpApp's open CORS can't answer a preflight for these. In Hono, /a/* is /a too.
  app.options('/api/v1/explorations/*', (c) => c.body(null, 204));
  app.use('/api/v1/explorations/*', noCache, sameSite, limit);

  app.get('/api/v1/explorations', async (c) => {
    const raw = c.req.query('limit');
    const input = raw === undefined ? {} : { limit: /^\d+$/.test(raw) ? Number(raw) : raw };
    return answer(c, 'list_explorations', input);
  });
  app.post('/api/v1/explorations', async (c) => answer(c, 'start_exploration', await body(c)));
  app.get('/api/v1/explorations/:ref', (c) =>
    answer(c, 'get_exploration', { exploration: c.req.param('ref') }),
  );
  // Pushed, not polled, and only a signal: the page reads the packet again, so there's one way to read.
  // One on connecting, so a page that was away catches up. No timers: it wakes when something happened.
  app.get('/api/v1/explorations/:ref/live', async (c) => {
    let id: string;
    try {
      id = await explorationIdOf(await asCaller(c), c.req.param('ref'));
    } catch (e) {
      return fail(c, fromThrown(e));
    }
    return streamSSE(c, async (stream) => {
      let dirty = true;
      let wake = () => {};
      const off = ctx.live?.on(id, () => {
        dirty = true;
        wake();
      });
      stream.onAbort(() => wake());
      try {
        while (!stream.aborted) {
          if (dirty) {
            dirty = false;
            await stream.writeSSE({ event: 'change', data: '{}' });
          } else {
            await new Promise<void>((resolve) => {
              wake = resolve;
            });
          }
        }
      } finally {
        off?.();
      }
    });
  });
  app.post('/api/v1/explorations/:ref/steps', async (c) =>
    answer(c, 'save_step', await withRef(c)),
  );
  app.post('/api/v1/explorations/:ref/notes', async (c) => answer(c, 'add_note', await withRef(c)));
  // layers kept on the site, and the dataset's versions (005, datasets.ts)
  app.post('/api/v1/explorations/:ref/layers', async (c) =>
    answer(c, 'keep_layer', await withRef(c)),
  );
  app.get('/api/v1/explorations/:ref/layers', (c) => {
    const q = c.req.query();
    return answer(c, 'list_layers', {
      exploration: c.req.param('ref'),
      ...(q.about ? { about: q.about } : {}),
      ...(q.hash ? { hash: q.hash } : {}),
    });
  });
  // annotations, what a person or an agent adds about an account (annotation-layer.md, annotations.ts)
  app.post('/api/v1/explorations/:ref/annotations', async (c) =>
    answer(c, 'add_annotation', await withRef(c)),
  );
  app.get('/api/v1/explorations/:ref/annotations', (c) => {
    const about = c.req.query('about');
    return answer(c, 'list_annotations', {
      exploration: c.req.param('ref'),
      ...(about ? { about } : {}),
    });
  });
  app.post('/api/v1/explorations/:ref/datasets/fork', async (c) =>
    answer(c, 'fork_dataset', await withRef(c)),
  );
  app.post('/api/v1/explorations/:ref/jobs/take', async (c) =>
    answer(c, 'take_job', await withRef(c)),
  );
  app.post('/api/v1/explorations/:ref/jobs/:job/report', async (c) => {
    const b = await withRef(c);
    const input =
      b && typeof b === 'object' && !Array.isArray(b) && !isToolError(b)
        ? { ...b, job: c.req.param('job') }
        : b;
    return answer(c, 'report_job', input);
  });
  app.get('/api/v1/explorations/:ref/jobs', (c) =>
    answer(c, 'list_jobs', { exploration: c.req.param('ref') }),
  );
  app.post('/api/v1/explorations/:ref/claim', (c) =>
    attempt(c, async () =>
      claimExploration(
        await asCaller(c),
        c.req.param('ref'),
        gate?.openAnonymous ? () => gate.openAnonymous?.(c) as Promise<string> : undefined,
      ),
    ),
  );

  app.get('/api/v1/explorations/:ref/links', (c) =>
    attempt(c, async () => ({ links: await listLinks(await asCaller(c), c.req.param('ref')) })),
  );
  app.post('/api/v1/explorations/:ref/links', async (c) => {
    const input = (await body(c)) as { scope?: unknown };
    const scope = input?.scope;
    if (scope !== 'read' && scope !== 'continue') {
      return fail(c, toolError('bad_input', 'scope must be read or continue'));
    }
    return attempt(c, async () =>
      makeLink(await asCaller(c), c.req.param('ref'), scope as LinkScope),
    );
  });
  app.post('/api/v1/explorations/:ref/links/:link/revoke', (c) =>
    attempt(c, async () => revokeLink(await asCaller(c), c.req.param('ref'), c.req.param('link'))),
  );

  // Re-hashed on read (specBody), so a row that changed can't send anyone to another flower.
  app.put(
    '/api/v1/explorations/:ref/snapshots/:sha256',
    bodyLimit({
      maxSize: SNAPSHOT_WIRE_MAX_BYTES,
      onError: (c) =>
        fail(c, toolError('bad_input', 'The body is larger than 2 MiB. Send it gzipped.')),
    }),
    async (c) => {
      const sha = c.req.param('sha256');
      if (!SHA.test(sha)) return fail(c, toolError('bad_input', 'Not a sha256.'));
      let raw = new Uint8Array(await c.req.arrayBuffer());
      if ((c.req.header('content-encoding') ?? '').trim().toLowerCase() === 'gzip') {
        try {
          raw = new Uint8Array(await gunzip(raw, { maxOutputLength: SNAPSHOT_MAX_BYTES }));
        } catch {
          return fail(
            c,
            toolError('bad_input', 'The body is not gzip, or it inflates past 32 MiB.'),
          );
        }
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(new TextDecoder().decode(raw));
      } catch {
        return fail(
          c,
          toolError('bad_input', 'The body is not JSON.', 'Send the snapshot as JSON.'),
        );
      }
      try {
        return respond(
          c,
          versioned(await postSnapshot(await asCaller(c), c.req.param('ref'), sha, parsed)),
        );
      } catch (e) {
        return fail(c, fromThrown(e));
      }
    },
  );

  app.get('/d/:hash', limit, async (c) => {
    const sha = c.req.param('hash');
    try {
      const spec = SHA.test(sha) ? await specBody(ctx.config, sha) : null;
      if (!spec) return fail(c, toolError('not_found', 'No draft under that hash.'));
      // Relative, so it stays on whichever address the person came in by.
      return c.redirect(draftPath(canonicalJson(spec)), 302);
    } catch (e) {
      return fail(c, fromThrown(e));
    }
  });

  // Plain text holding markdown: some agents' web tools refuse text/markdown (see /skill.md). Open
  // CORS, because the token is the only credential: no session is read, so an id always fails here.
  app.get('/s/:token', cors({ origin: '*' }), limit, async (c) => {
    const plain = (text: string, status: 200 | 404 | 500) =>
      c.text(text, status, { 'Cache-Control': NEVER_STORE, 'X-Robots-Tag': 'noindex' });
    try {
      const anyone: ToolContext = { ...ctx, caller: { door: 'http' } };
      return plain(await packetMarkdown(anyone, c.req.param('token')), 200);
    } catch (e) {
      const { error } = fromThrown(e);
      return plain(error.message, error.code === 'not_found' ? 404 : 500);
    }
  });

  return app;
}
