// Sign-in, run owners and who pays (T192, T193, T196; http-api.md, "Sign-in and invites").
//   POST /api/v1/auth/challenge   a nonce, a plain sentence and the recipient
//   POST /api/v1/auth/verify      checks a NEP-413 proof, finds or creates the person, claims the
//                                 anonymous session's runs, and sets the session
//   POST /api/v1/auth/logout
//   POST /api/v1/auth/invite      redeems a token into this session; GET says what's left of it
//   GET  /api/v1/me               a person's id and wallets, to that person only
//
// A session is an opaque 256-bit value in a cookie, and only its hash is stored. Its subject is a
// person id (prs_) or an anonymous handle (anon_). It can read and continue that subject's runs and
// draw on an invite. It can't approve anything irreversible: publishing still takes a signature.
//
// These routes send no CORS headers, so a browser on another site can't read them. They mount before
// the tool routes, whose open CORS doesn't reach them. The cookie is SameSite=Lax. A POST from another
// origin is refused here, following the same rule as Go's CrossOriginProtection: a request with no
// Origin and no Sec-Fetch-Site isn't from a browser, and it holds no cookie unless its owner gave it one.
import { createHash, randomBytes } from 'node:crypto';
import { TOOLS_VERSION } from '@petal/core';
import type { Nep413Proof } from '@petal/core/types';
import { type NonceStore, type Rpc, verifyNep413 } from '@petal/near/auth';
import type { SessionRow, Store } from '@petal/store';
import { type Context, Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { getCookie, setCookie } from 'hono/cookie';
import { closedLedger } from './budget.ts';
import {
  CONNECT_HINT,
  hashToken,
  INVITE_SPENT,
  inviteLedger,
  inviteRefusal,
  inviteState,
  NO_INVITE,
} from './invites.ts';
import type { Budget, LlmClient } from './llm.ts';
import { clientIp, fail, limiter } from './routes.ts';
import type { WalletCipher } from './wallet-cipher.ts';

export type AgentAccess = 'gated' | 'open';
export type Network = 'testnet' | 'mainnet';

/** PETAL_AGENT_ACCESS. Anything but `open` is gated: a typo must not open the budget. */
export function agentAccess(env: Record<string, string | undefined> = process.env): AgentAccess {
  return env.PETAL_AGENT_ACCESS?.trim() === 'open' ? 'open' : 'gated';
}

export const SESSION_DAYS = 30;
/** POSTs to the auth routes, per minute from one address */
const AUTH_POSTS_PER_MINUTE = 30;

/** The site as this server knows it, from PETAL_API. Never from a request: see `recipient`. */
export interface Site {
  hostname: string;
  origin: string | null;
  secure: boolean;
  cookie: string;
}

/**
 * The cookie's name follows the public address: `__Host-` needs Secure, so HTTPS gets
 * `__Host-petal_session`, and a site on http:// (localhost) gets plain `petal_session`.
 */
export function siteOf(apiBase: string | undefined): Site {
  let url: URL | null = null;
  try {
    url = apiBase ? new URL(apiBase) : null;
  } catch {
    // a malformed PETAL_API is the same as none: the site is local
  }
  const secure = url?.protocol === 'https:';
  return {
    hostname: url?.hostname ?? 'localhost',
    origin: url?.origin ?? null,
    secure,
    cookie: secure ? '__Host-petal_session' : 'petal_session',
  };
}

const isLocal = (hostname: string) => hostname === 'localhost' || hostname === '127.0.0.1';
const isPerson = (subject: string) => subject.startsWith('prs_');
const hashOf = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
const NEAR_ACCOUNT = /^[a-z0-9._-]{2,64}$/;

/** The sentence a wallet shows. Plain, and the same for a given site, so nothing is stored for it. */
export const signInMessage = (hostname: string) =>
  `Sign in to Petals at ${hostname}. This proves the wallet is yours. It moves nothing and costs nothing.`;

export interface AuthDeps {
  store: Store;
  nonces: NonceStore;
  /** a function: a throwaway key is only made, and warned about, at the first sign-in */
  cipher: () => WalletCipher;
  rpcFor: (network: Network) => Rpc;
  access: AgentAccess;
  site: Site;
  clock?: () => number;
}

/** What a chat may do: refused, or who owns its run and which budget it draws on. */
export interface ChatAdmission {
  refused?: Response;
  /** None for a recorded run: it spends nothing and stays readable by link. */
  subject?: string;
  budget?: Budget;
}

/** What the agent routes need. With no session, the subject is null. */
export interface RouteAuth {
  admitChat(c: Context, llm: LlmClient, budget: Budget): ChatAdmission;
  subjectOf(c: Context): string | null;
  /** A refusal for a POST from another site; null for one that's fine. */
  refuseForeign(c: Context): Response | null;
}

export function createAuth(d: AuthDeps): { routes: Hono; gate: RouteAuth } {
  const { store, site } = d;
  const clock = d.clock ?? Date.now;
  const now = () => new Date(clock());
  const iso = () => now().toISOString();
  const limit = limiter(AUTH_POSTS_PER_MINUTE, 60_000, clock);
  const ok = (c: Context, body: Record<string, unknown>) =>
    c.json({ ...body, tools_version: TOOLS_VERSION });

  /** Same-origin, by the rule at the top of this file. */
  function originAllowed(c: Context): boolean {
    const origin = c.req.header('origin');
    if (!origin) {
      const fetchSite = c.req.header('sec-fetch-site');
      return !fetchSite || fetchSite === 'same-origin' || fetchSite === 'none';
    }
    if (origin === site.origin) return true;
    // A local site's port isn't known in advance, so a local page must match the address it asked.
    if (!isLocal(site.hostname)) return false;
    try {
      const u = new URL(origin);
      return isLocal(u.hostname) && u.host === c.req.header('host');
    } catch {
      return false;
    }
  }
  const badOrigin = (c: Context) =>
    fail(c, 'unauthorised', 'This request came from another site, so it was refused.');

  function sessionOf(c: Context): SessionRow | null {
    const value = getCookie(c, site.cookie);
    return value ? store.session.get(hashOf(value), iso()) : null;
  }

  function writeCookie(c: Context, value: string, maxAge: number) {
    setCookie(c, site.cookie, value, {
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
      secure: site.secure,
      maxAge,
    });
  }

  /** A new session. The value goes to the browser, its hash to the store. */
  function openSession(
    c: Context,
    subject: string,
    o: { network?: string; invite?: string | null } = {},
  ): SessionRow {
    const value = randomBytes(32).toString('base64url');
    const row: SessionRow = {
      hash: hashOf(value),
      subject,
      network: o.network ?? null,
      invite: o.invite ?? null,
      expires_at: new Date(clock() + SESSION_DAYS * 86_400_000).toISOString(),
    };
    store.tx(() => {
      store.session.deleteExpired(iso());
      store.session.put(row);
    });
    writeCookie(c, value, SESSION_DAYS * 86_400);
    return row;
  }

  const newHandle = (c: Context) => openSession(c, `anon_${randomBytes(16).toString('hex')}`);

  function walletsOf(person: string) {
    return store.walletBinding.ofPerson(person).flatMap((w) => {
      try {
        const caip10 = d.cipher().open(w.caip10_encrypted);
        const account_id = caip10.split(':').slice(2).join(':');
        return [{ caip10, network: w.network, account_id, proved_at: w.proved_at }];
      } catch {
        // sealed under another key: a throwaway from before a restart, on a development server
        return [];
      }
    });
  }

  /**
   * One step: the person for this wallet (new if it's a new wallet), the anonymous session's runs and
   * explorations moved to them, and a new session in place of the old one, keeping its invite. A
   * person signing in with another wallet changes person: their work stays where it is.
   */
  function signIn(c: Context, network: Network, accountId: string) {
    const cipher = d.cipher();
    const address = `near:${network}:${accountId}`;
    const index = cipher.index(address);
    const old = sessionOf(c);
    const at = iso();
    const out = store.tx(() => {
      let person = store.walletBinding.byHash(index)?.person;
      if (!person) {
        person = `prs_${randomBytes(16).toString('hex')}`;
        store.person.create({ id: person, created_at: at });
        store.walletBinding.bind({
          person,
          network,
          caip10_encrypted: cipher.seal(address),
          caip10_hash: index,
          proved_at: at,
        });
      }
      let claimed = 0;
      let explorations = 0;
      if (old && !isPerson(old.subject)) {
        claimed = store.run.moveOwner(old.subject, person);
        explorations = store.exploration.moveOwner(old.subject, person);
      }
      if (old) store.session.delete(old.hash);
      return { person, claimed, explorations };
    });
    openSession(c, out.person, { network, invite: old?.invite });
    return out;
  }

  const app = new Hono();

  // Answered here, so the tool routes' open CORS can't answer a preflight for these.
  app.options('/api/v1/auth/*', (c) => c.body(null, 204));
  app.options('/api/v1/me', (c) => c.body(null, 204));

  app.use('/api/v1/auth/*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    if (c.req.method === 'POST') {
      if (!originAllowed(c)) return badOrigin(c);
      const wait = limit(clientIp(c));
      if (wait !== null) {
        return fail(c, 'rate_limited', 'Too many tries from one address.', undefined, wait);
      }
    }
    await next();
  });
  const smallBody = bodyLimit({
    maxSize: 16 * 1024,
    onError: (c) => fail(c, 'bad_input', 'the body is larger than 16 KiB'),
  });

  app.post('/api/v1/auth/challenge', (c) => {
    const { nonce, expires_at } = d.nonces.issue();
    return ok(c, {
      nonce,
      message: signInMessage(site.hostname),
      // Configured, never read from the Host header: a site that got a signature for its own name
      // could otherwise replay it here with that name in the header.
      recipient: site.hostname,
      expires_at,
    });
  });

  app.post('/api/v1/auth/verify', smallBody, async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      network?: unknown;
      proof?: Nep413Proof;
    } | null;
    const network = body?.network;
    if (network !== 'testnet' && network !== 'mainnet') {
      return fail(c, 'bad_input', 'network must be testnet or mainnet');
    }
    const proof = body?.proof;
    if (!proof || typeof proof !== 'object' || !NEAR_ACCOUNT.test(String(proof.account_id))) {
      return fail(c, 'bad_input', 'proof must be a NEP-413 proof from a NEAR account');
    }
    let check: { ok: boolean; reason?: string };
    try {
      check = await verifyNep413(
        proof,
        { message: signInMessage(site.hostname), recipient: site.hostname },
        d.rpcFor(network),
        { nonces: d.nonces },
      );
    } catch {
      // the error can name the account, so it isn't logged
      return fail(
        c,
        'source_failed',
        "Couldn't reach NEAR to check the signature, so nothing changed. Try again.",
      );
    }
    if (!check.ok) return fail(c, 'unauthorised', `The signature was refused: ${check.reason}.`);
    const { person, claimed, explorations } = signIn(c, network, proof.account_id);
    return ok(c, {
      person_id: person,
      network,
      wallets: walletsOf(person),
      claimed_runs: claimed,
      claimed_explorations: explorations,
    });
  });

  app.post('/api/v1/auth/logout', (c) => {
    const session = sessionOf(c);
    if (session) store.session.delete(session.hash);
    writeCookie(c, '', 0);
    return ok(c, { ok: true });
  });

  const inviteBody = (id: string) => inviteState(store, id, now());

  app.post('/api/v1/auth/invite', smallBody, async (c) => {
    const body = (await c.req.json().catch(() => null)) as { token?: unknown } | null;
    if (typeof body?.token !== 'string' || !body.token) {
      return fail(c, 'bad_input', 'token must be a string');
    }
    const invite = store.invite.byTokenHash(hashToken(body.token));
    const state = invite ? inviteBody(invite.id) : null;
    if (!invite || !state || state.status === 'revoked' || state.status === 'expired') {
      return fail(c, 'unauthorised', "That invite isn't valid.", CONNECT_HINT);
    }
    if (state.status === 'spent') return fail(c, 'budget_exhausted', INVITE_SPENT, CONNECT_HINT);
    const session = sessionOf(c) ?? newHandle(c);
    store.session.setInvite(session.hash, invite.id);
    return ok(c, { invite: state });
  });

  app.get('/api/v1/auth/invite', (c) => {
    const id = sessionOf(c)?.invite;
    return ok(c, { invite: id ? inviteBody(id) : null });
  });

  app.get('/api/v1/me', (c) => {
    c.header('Cache-Control', 'no-store');
    const session = sessionOf(c);
    if (!session || !isPerson(session.subject)) {
      return fail(c, 'unauthorised', 'Not signed in.');
    }
    return ok(c, {
      person_id: session.subject,
      network: session.network,
      wallets: walletsOf(session.subject),
    });
  });

  const gate: RouteAuth = {
    subjectOf: (c) => sessionOf(c)?.subject ?? null,
    refuseForeign: (c) => (originAllowed(c) ? null : badOrigin(c)),

    admitChat(c, llm, budget) {
      // A recorded run spends nothing: anyone may watch it, from anywhere, and no one owns it.
      if (llm.kind === 'recorded') return {};
      if (!originAllowed(c)) return { refused: badOrigin(c) };
      const session = sessionOf(c);
      if (d.access === 'open') return { subject: (session ?? newHandle(c)).subject };
      const id = session?.invite;
      if (!session || !id) {
        return { refused: fail(c, 'invite_required', NO_INVITE, CONNECT_HINT) };
      }
      const refusal = inviteRefusal(inviteBody(id));
      if (refusal) {
        const code = refusal === INVITE_SPENT ? 'budget_exhausted' : 'invite_required';
        return { refused: fail(c, code, refusal, CONNECT_HINT) };
      }
      const day = budget.ledger ?? closedLedger('this server keeps no spend ledger');
      return {
        subject: session.subject,
        budget: { ...budget, ledger: inviteLedger(store, id, day, now) },
      };
    },
  };

  return { routes: app, gate };
}
