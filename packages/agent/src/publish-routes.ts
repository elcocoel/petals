// Publishing to the shared map, the page's press (Elco, 12 Nov: "we need this live soon, it's a big part of my
// test"): what a signed-in person kept about a map goes to everyone's Power Map, signed by their wallet, at once
// and credited to them (@petal/tools publish-data.ts holds the what; this holds who and the signature).
//
//   GET  /api/v1/publish/data?map=<id>     { about, name, map_url, ready, private, published }: what one press
//                                          would publish, and what stays private and why
//   POST /api/v1/publish/data/prepare      { map } → { sha256, message, nonce, recipient, expires_at, claims,
//                                          private }: the message their wallet signs (NEP-413, as signing in:
//                                          no transaction, nothing spent), for five minutes
//   POST /api/v1/publish/data              { sha256, proof } → { about, sha256, published, by, map_url }: checked
//                                          against the wallet they signed in with, then on the map at once
import { TOOLS_VERSION } from '@petal/core';
import type { Nep413Proof } from '@petal/core/types';
import { type NonceStore, type Rpc, verifyNep413 } from '@petal/near/auth';
import {
  bodyCap,
  fromThrown,
  mapIdOf,
  preparePublishData,
  publishable,
  publishData,
  type ToolContext,
} from '@petal/tools';
import { type Context, Hono } from 'hono';
import type { Network, RouteAuth, Site } from './auth-routes.ts';
import { fail } from './routes.ts';

export interface PublishDeps {
  tools: ToolContext;
  gate: RouteAuth;
  site: Site;
  nonces: NonceStore;
  rpcFor: (network: Network) => Rpc;
}

const isPerson = (s: string | null): s is string => !!s?.startsWith('prs_');

export function publishRoutes(d: PublishDeps): Hono {
  const app = new Hono();
  app.use('/api/v1/publish/data', bodyCap);
  app.use('/api/v1/publish/data/*', bodyCap);
  app.use('/api/v1/publish/data*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    if (c.req.method !== 'GET') {
      const foreign = d.gate.refuseForeign(c);
      if (foreign) return foreign;
    }
    await next();
  });

  const ok = (c: Context, body: Record<string, unknown>) =>
    c.json({ ...body, tools_version: TOOLS_VERSION });
  const failed = (c: Context, e: unknown) => {
    const { error } = fromThrown(e, 'internal');
    return fail(c, error.code, error.message, error.hint);
  };

  /** The person signed in, with the account their wallet signed in as; null for anyone else. */
  async function whoOf(c: Context) {
    const { subject, by } = await d.gate.callerOf(c);
    return isPerson(subject) && by ? { owner: subject, by } : null;
  }
  const signIn = (c: Context) =>
    fail(c, 'unauthorised', 'Sign in with your NEAR wallet: what you publish is credited to it.');

  app.get('/api/v1/publish/data', async (c) => {
    const who = await whoOf(c);
    if (!who) return signIn(c);
    const map = mapIdOf(c.req.query('map') ?? '');
    if (!map) return fail(c, 'bad_input', 'map is the map’s address');
    try {
      const p = await publishable(d.tools, who.owner, map);
      return ok(c, {
        about: p.about,
        name: p.name,
        ready: p.claims.length,
        claims: p.rows,
        private: p.private,
        published: p.published,
        adds: p.adds,
        scored_by: p.scored_by,
        ...(p.unscored ? { unscored: p.unscored } : {}),
      });
    } catch (e) {
      return failed(c, e);
    }
  });

  app.post('/api/v1/publish/data/prepare', async (c) => {
    const who = await whoOf(c);
    if (!who) return signIn(c);
    const body = (await c.req.json().catch(() => null)) as { map?: unknown } | null;
    const map = typeof body?.map === 'string' ? mapIdOf(body.map) : '';
    if (!map) return fail(c, 'bad_input', 'map is the map’s address');
    try {
      return ok(c, await preparePublishData(d.tools, who, map, d.site.hostname));
    } catch (e) {
      return failed(c, e);
    }
  });

  app.post('/api/v1/publish/data', async (c) => {
    const who = await whoOf(c);
    if (!who) return signIn(c);
    const body = (await c.req.json().catch(() => null)) as {
      sha256?: unknown;
      proof?: Nep413Proof;
    } | null;
    if (typeof body?.sha256 !== 'string' || !body.proof || typeof body.proof !== 'object')
      return fail(
        c,
        'bad_input',
        'send { sha256, proof }: proof is the wallet’s NEP-413 signature',
      );
    // the network their wallet signed in on, as the account they're credited as names it
    const network = who.by.split(':')[1] === 'testnet' ? 'testnet' : 'mainnet';
    try {
      const out = await publishData(d.tools, who, body.sha256, body.proof, (proof, expect) =>
        // a key with nothing on chain will do, as for signing in: it names a person and buys nothing
        verifyNep413(proof, expect, d.rpcFor(network), { nonces: d.nonces, allowUnfunded: true }),
      );
      return ok(c, out);
    } catch (e) {
      return failed(c, e);
    }
  });

  return app;
}
