// The HTTP door to explorations (T194, SYS-040 to SYS-043), and the two short links:
//   GET  /api/v1/explorations                      list_explorations
//   POST /api/v1/explorations                      start_exploration
//   GET  /api/v1/explorations/:ref                 get_exploration; :ref is an id or a link's token
//   POST /api/v1/explorations/:ref/steps           save_step
//   POST /api/v1/explorations/:ref/notes           add_note
//   POST /api/v1/explorations/:ref/claim           a person takes an unowned one, with a continue link
//   GET  /api/v1/explorations/:id/links            its links, with no tokens: owner only
//   POST /api/v1/explorations/:id/links            a new link, shown once: owner only
//   POST /api/v1/explorations/:id/links/:link/revoke
//   GET  /d/:hash                                  a short draft link: redirects to /draft?spec=
//   GET  /s/:token                                 the resume packet, as markdown
//
// They read a session, so they answer before httpApp's open CORS, as the auth routes do, and a POST
// from another site is refused. With no gate (httpApp alone), nobody is ever signed in.
import { canonicalJson } from '@petal/core';
import { type Context, Hono, type MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { versioned } from '../define.ts';
import { specBody } from '../drafts.ts';
import { fromThrown, isToolError, toolError } from '../errors.ts';
import { findTool } from '../registry.ts';
import {
  claimExploration,
  type LinkScope,
  listLinks,
  makeLink,
  packetMarkdown,
  revokeLink,
} from '../tools/explorations.ts';
import { draftPath } from '../tools/shared.ts';
import type { ToolContext } from '../types.ts';
import { body, fail, respond } from './reply.ts';

/** What the door needs from sign-in; the agent package holds the sessions. */
export interface SessionGate {
  subjectOf(c: Context): string | null;
  /** A refusal for a POST from another site; null for one that's fine. */
  refuseForeign(c: Context): Response | null;
}

const SHA = /^[0-9a-f]{64}$/;
const NEVER_STORE = 'no-store';

export function explorationRoutes(
  ctx: ToolContext,
  limit: MiddlewareHandler,
  gate?: SessionGate,
): Hono {
  const app = new Hono();

  const asCaller = (c: Context): ToolContext => ({
    ...ctx,
    caller: { subject: gate?.subjectOf(c) ?? null, door: 'http' },
  });
  /** A body that wasn't JSON comes here as its error. */
  const answer = async (c: Context, name: string, input: unknown) => {
    if (isToolError(input)) return respond(c, input);
    const t = findTool(name);
    if (!t) return fail(c, toolError('internal', `No tool ${name}.`));
    return respond(c, await t.run(input, asCaller(c)));
  };
  /** Runs `f`, and turns what it throws into the usual error. */
  const attempt = (c: Context, f: () => object) => {
    try {
      return respond(c, versioned(f()));
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
    c.header('Cache-Control', NEVER_STORE);
  };
  const sameSite: MiddlewareHandler = async (c, next) => {
    if (c.req.method === 'POST') {
      const refused = gate?.refuseForeign(c);
      if (refused) return refused;
    }
    await next();
  };
  const small = bodyLimit({
    maxSize: 256 * 1024,
    onError: (c) => fail(c, toolError('bad_input', 'The body is larger than 256 KiB.')),
  });

  // Answered here, so httpApp's open CORS can't answer a preflight for these. In Hono, /a/* is /a too.
  app.options('/api/v1/explorations/*', (c) => c.body(null, 204));
  app.use('/api/v1/explorations/*', noCache, sameSite, limit, small);

  app.get('/api/v1/explorations', async (c) => {
    const raw = c.req.query('limit');
    const input = raw === undefined ? {} : { limit: /^\d+$/.test(raw) ? Number(raw) : raw };
    return answer(c, 'list_explorations', input);
  });
  app.post('/api/v1/explorations', async (c) => answer(c, 'start_exploration', await body(c)));
  app.get('/api/v1/explorations/:ref', (c) =>
    answer(c, 'get_exploration', { exploration: c.req.param('ref') }),
  );
  app.post('/api/v1/explorations/:ref/steps', async (c) =>
    answer(c, 'save_step', await withRef(c)),
  );
  app.post('/api/v1/explorations/:ref/notes', async (c) => answer(c, 'add_note', await withRef(c)));
  app.post('/api/v1/explorations/:ref/claim', (c) =>
    attempt(c, () => claimExploration(asCaller(c), c.req.param('ref'))),
  );

  app.get('/api/v1/explorations/:ref/links', (c) =>
    attempt(c, () => ({ links: listLinks(asCaller(c), c.req.param('ref')) })),
  );
  app.post('/api/v1/explorations/:ref/links', async (c) => {
    const input = (await body(c)) as { scope?: unknown };
    const scope = input?.scope;
    if (scope !== 'read' && scope !== 'continue') {
      return fail(c, toolError('bad_input', 'scope must be read or continue'));
    }
    return attempt(c, () => makeLink(asCaller(c), c.req.param('ref'), scope as LinkScope));
  });
  app.post('/api/v1/explorations/:ref/links/:link/revoke', (c) =>
    attempt(c, () => revokeLink(asCaller(c), c.req.param('ref'), c.req.param('link'))),
  );

  // Re-hashed on read (specBody), so a row that changed can't send anyone to another flower.
  app.get('/d/:hash', limit, (c) => {
    const sha = c.req.param('hash');
    try {
      const spec = SHA.test(sha) ? specBody(ctx.config, sha) : null;
      if (!spec) return fail(c, toolError('not_found', 'No draft under that hash.'));
      // Relative, so it stays on whichever address the person came in by.
      return c.redirect(draftPath(canonicalJson(spec)), 302);
    } catch (e) {
      return fail(c, fromThrown(e));
    }
  });

  // Plain text holding markdown: some agents' web tools refuse text/markdown (see /skill.md). Open
  // CORS, because the token is the only credential: no session is read, so an id always fails here.
  app.get('/s/:token', cors({ origin: '*' }), limit, (c) => {
    const plain = (text: string, status: 200 | 404 | 500) =>
      c.text(text, status, { 'Cache-Control': NEVER_STORE, 'X-Robots-Tag': 'noindex' });
    try {
      const anyone: ToolContext = { ...ctx, caller: { door: 'http' } };
      return plain(packetMarkdown(anyone, c.req.param('token')), 200);
    } catch (e) {
      const { error } = fromThrown(e);
      return plain(error.message, error.code === 'not_found' ? 404 : 500);
    }
  });

  return app;
}
