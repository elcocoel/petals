// Publishing to the shared map, the page's press (a signed version, specs/005-mapping-brain/composition.md):
// what a signed-in person kept about a map goes to everyone's Power Map as a publication/v1 in the record,
// signed by one of their wallets, at once and credited to it (@petal/tools publish-data.ts holds the what;
// this holds who and the signature).
//
//   GET  /api/v1/publish/data?map=<id>     { about, name, ready, claims, readings, private, published, adds,
//                                          layers: [{ sha256, petal, title, cases }], totals }: what one press
//                                          would publish, what each layer adds to the map, and what stays back
//   POST /api/v1/publish/data/prepare      { map, author } → { publication, sha256, text, recipient?, nonce? }:
//                                          the unsigned publication in the name of one of their wallets (CAIP-10,
//                                          GET /api/v1/me's wallets[].author), and the text it signs
//                                          { maps: [...] | 'all', author } → { manifest, sha256, text, publications,
//                                          left, recipient?, nonce? }: one press over many maps (manifest/v1,
//                                          composition.md section 2b), each map's version, and the one text
//   POST /api/v1/publish/data              { sha256, proof: { standard, signature, public_key?, nonce? } } →
//                                          { publication, layers, totals }, or for a press over many maps
//                                          { manifest, publications }: NEP-413 on the author's network, EIP-191 or
//                                          ed25519, checked once, then in the record (all or none) and on the map
import { TOOLS_VERSION } from '@petal/core';
import {
  eip191Signer,
  type NonceStore,
  type Rpc,
  solanaSigned,
  verifyNep413,
} from '@petal/near/auth';
import {
  bodyCap,
  creditFor,
  fromThrown,
  mapIdOf,
  type PressProof,
  preparePress,
  preparePublication,
  publishable,
  publishPrepared,
  type SignatureCheck,
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
      // what each layer adds, as the wallet they signed in with would publish it
      const p = await publishable(d.tools, who.owner, map, who.by);
      return ok(c, {
        about: p.about,
        name: p.name,
        ready: p.claims.length,
        claims: p.rows,
        readings: p.readings,
        private: p.private,
        published: p.published,
        adds: p.adds,
        scored_by: p.scored_by,
        ...(p.unscored ? { unscored: p.unscored } : {}),
        layers: p.layers,
        totals: p.totals,
      });
    } catch (e) {
      return failed(c, e);
    }
  });

  // The signed-in person's credit (credit/v1), as the wallet they signed in with is credited: bare, with its hash
  app.get('/api/v1/me/credit', async (c) => {
    const who = await whoOf(c);
    if (!who) return signIn(c);
    try {
      return ok(c, { ...(await creditFor(d.tools, who.by)) });
    } catch (e) {
      return failed(c, e);
    }
  });

  app.post('/api/v1/publish/data/prepare', async (c) => {
    const who = await whoOf(c);
    if (!who) return signIn(c);
    const body = (await c.req.json().catch(() => null)) as {
      map?: unknown;
      maps?: unknown;
      author?: unknown;
    } | null;
    // one map, or a press over many: the maps by address, or 'all' where the author has something to publish
    const many =
      body?.maps === 'all'
        ? ('all' as const)
        : Array.isArray(body?.maps)
          ? body.maps.map((m) => (typeof m === 'string' ? mapIdOf(m) : ''))
          : null;
    const map = typeof body?.map === 'string' ? mapIdOf(body.map) : '';
    if (many ? many !== 'all' && (!many.length || many.some((m) => !m)) : !map)
      return fail(
        c,
        'bad_input',
        'map is the map’s address; for one press over many maps, maps is their addresses, or "all"',
      );
    if (typeof body?.author !== 'string' || !body.author)
      return fail(
        c,
        'bad_input',
        'author is the wallet that signs, as /api/v1/me’s wallets[].author',
      );
    try {
      const authors = await d.gate.authorsOf(who.owner);
      const signer = { owner: who.owner, authors };
      return ok(
        c,
        many
          ? await preparePress(d.tools, signer, many, body.author, d.site.hostname)
          : await preparePublication(d.tools, signer, map, body.author, d.site.hostname),
      );
    } catch (e) {
      return failed(c, e);
    }
  });

  /** The author's wallet signed this text, as its chain signs. */
  const check: SignatureCheck = async ({ author, proof, text, recipient }) => {
    const [chain, network, ...rest] = author.split(':');
    const account = rest.join(':');
    if (proof.standard === 'nep413' && chain === 'near') {
      if (typeof proof.public_key !== 'string' || typeof proof.nonce !== 'string')
        return { ok: false, reason: 'a NEAR signature needs its public_key and nonce' };
      return verifyNep413(
        {
          type: 'nep413',
          account_id: account,
          public_key: proof.public_key,
          signature: proof.signature,
          message: text,
          nonce: proof.nonce,
          recipient,
        },
        { message: text, recipient },
        // a key with nothing on chain will do, as for signing in: it names a person and buys nothing
        d.rpcFor(network === 'testnet' ? 'testnet' : 'mainnet'),
        { nonces: d.nonces, allowUnfunded: true },
      );
    }
    if (proof.standard === 'eip191' && chain === 'eip155')
      return eip191Signer(text, proof.signature) === account.toLowerCase()
        ? { ok: true }
        : { ok: false, reason: `the signature is not ${account}'s` };
    if (proof.standard === 'ed25519' && chain === 'solana')
      return solanaSigned(account, text, proof.signature)
        ? { ok: true }
        : { ok: false, reason: `the signature is not ${account}'s` };
    return { ok: false, reason: `a ${chain} wallet doesn't sign with ${proof.standard}` };
  };

  app.post('/api/v1/publish/data', async (c) => {
    const who = await whoOf(c);
    if (!who) return signIn(c);
    const body = (await c.req.json().catch(() => null)) as {
      sha256?: unknown;
      proof?: PressProof;
    } | null;
    if (typeof body?.sha256 !== 'string' || !body.proof || typeof body.proof !== 'object')
      return fail(
        c,
        'bad_input',
        'send { sha256, proof }: proof is { standard, signature, public_key?, nonce? }, the wallet’s signature of the text',
      );
    try {
      return ok(c, await publishPrepared(d.tools, who, body.sha256, body.proof, check));
    } catch (e) {
      return failed(c, e);
    }
  });

  return app;
}
