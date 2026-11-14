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
import { accountRef, TOOLS_VERSION } from '@petal/core';
import type { Nep413Proof } from '@petal/core/types';
import {
  type Eip191Proof,
  type NonceStore,
  type Rpc,
  type SolanaProof,
  siweMessage,
  solanaMessage,
  verifyNep413,
  verifyWalletProof,
} from '@petal/near/auth';
import type { SessionRow, Store } from '@petal/store';
import { clientAddress, DATA_FULL, isLocalSite } from '@petal/tools';
import { type Context, Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { getCookie, setCookie } from 'hono/cookie';
import { closedLedger } from './budget.ts';
import { type ChainChat, type CreditChain, chainChat } from './credit.ts';
import {
  CONNECT_HINT,
  CREDIT_SPENT,
  drawOffchain,
  hashToken,
  INVITE_SPENT,
  inviteLedger,
  inviteRefusal,
  inviteState,
  NO_INVITE,
  PAY_HINT,
  PAYMENT_NEEDED,
  personCredit,
  personLedger,
} from './invites.ts';
import { type Budget, type LlmClient, PERSON_USD_PER_CHAT } from './llm.ts';
import { fail, limiter } from './routes.ts';
import type { WalletCipher } from './wallet-cipher.ts';

/** none: no agent for anyone. A public site set it until 9 Nov; since then it runs the paid agent (gated). */
export type AgentAccess = 'gated' | 'open' | 'none';
export type Network = 'testnet' | 'mainnet';
/**
 * Where a wallet is (multi-chain wallet connection): NEAR on its network, one EVM wallet for every
 * EVM chain, or a Solana wallet.
 */
export type WalletNetwork = Network | 'eip155' | 'solana';

/** Solana's mainnet, as CAIP-2 names it. */
const SOLANA_MAINNET = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';

/** Said to an Ethereum or Solana wallet that isn't linked to a NEAR profile: an account starts with NEAR. */
export const NEAR_FIRST =
  'Sign up with a NEAR wallet first. Then link this wallet in your lobby, and it signs you in too.';

/** A wallet as its binding keeps it, in CAIP-10: an EVM one once for every chain, by Ethereum's id, in lower case. */
export function caip10Of(network: WalletNetwork, account: string): string {
  if (network === 'eip155') return `eip155:1:${account.toLowerCase()}`;
  if (network === 'solana') return `${SOLANA_MAINNET}:${account}`;
  return `near:${network}:${account}`;
}

/** Who answers for what a person writes, as a claim names them, for a wallet on its network. */
function byOf(network: string | null | undefined, account: string): string | null {
  if (network === 'eip155') return accountRef('eip155:1', account);
  if (network === 'solana') return accountRef(SOLANA_MAINNET, account);
  return accountRef(`near:${network === 'testnet' ? 'testnet' : 'mainnet'}`, account);
}

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
  /** the data budget: a new wallet adds a person for good, so it's refused past that */
  full?: () => Promise<boolean>;
  /** where a chat stops when a person spends their own credit; default PERSON_USD_PER_CHAT */
  personUsdPerChat?: number;
  /** the credit contract (credit.ts): a person's own credit is what they hold in it. None: transfers */
  credit?: CreditChain | null;
  /** dollars per NEAR now, for the contract's balances */
  nearUsd?: () => Promise<number | null>;
}

/** What a chat may do: refused, or who owns its run and which budget it draws on. */
export interface ChatAdmission {
  refused?: Response;
  /** None for a recorded run: it spends nothing and stays readable by link. */
  subject?: string;
  budget?: Budget;
  /** On a person's own credit: its end and the chat's cap bound it (not the day's, since 9 Nov), so new chats aren't counted. */
  ownCredit?: boolean;
  /** told when the chat has ended: on the credit contract, it charges what the chat cost */
  onEnd?: () => Promise<void>;
}

/** What the agent routes need. With no session, the subject is null. */
export interface RouteAuth {
  admitChat(c: Context, llm: LlmClient, budget: Budget): Promise<ChatAdmission>;
  /**
   * A turn nobody's browser asked for (a job's report taken up at once): on a person's own credit,
   * or else on an invite one of their sessions holds. Null when neither pays, or it's a recorded run.
   */
  admitOwner?(subject: string, llm: LlmClient, budget: Budget): Promise<ChatAdmission | null>;
  subjectOf(c: Context): Promise<string | null>;
  /** The subject and the credential that opened its session (TGT-005), in one look. */
  callerOf(
    c: Context,
  ): Promise<{ subject: string | null; credential: string | null; by?: string | null }>;
  /** A refusal for a POST from another site; null for one that's fine. */
  refuseForeign(c: Context): Response | null;
  /** Opens an anonymous session on this response, for a first write. Returns its subject. */
  openAnonymous(c: Context): Promise<string>;
  /**
   * The signed-in person, the network they signed in on, their wallets there, and the one this session
   * signed in with; null for anyone else.
   */
  personOf(c: Context): Promise<{
    person: string;
    network: Network;
    accounts: string[];
    account: string | null;
  } | null>;
  /**
   * A person's account, as a claim names who answers for what they keep: their first
   * mainnet wallet, else their first; null for one with none. For a turn no request started.
   */
  accountOf?(person: string): Promise<string | null>;
  /** Every wallet bound to a person, in CAIP-10: the authors they can publish as (composition.md, section 2). */
  authorsOf(person: string): Promise<string[]>;
}

export function createAuth(d: AuthDeps): { routes: Hono; gate: RouteAuth } {
  const { store, site } = d;
  const clock = d.clock ?? Date.now;
  const now = () => new Date(clock());
  const iso = () => now().toISOString();
  const limit = limiter(AUTH_POSTS_PER_MINUTE, 60_000, clock);
  const local = isLocalSite(site.origin ?? undefined);
  const usdPerOwnChat = d.personUsdPerChat ?? PERSON_USD_PER_CHAT;
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

  async function sessionOf(c: Context): Promise<SessionRow | null> {
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
  async function openSession(
    c: Context,
    subject: string,
    o: { network?: string; invite?: string | null; credential?: string | null } = {},
  ): Promise<SessionRow> {
    const value = randomBytes(32).toString('base64url');
    const row: SessionRow = {
      hash: hashOf(value),
      subject,
      network: o.network ?? null,
      invite: o.invite ?? null,
      credential: o.credential ?? null,
      expires_at: new Date(clock() + SESSION_DAYS * 86_400_000).toISOString(),
    };
    await store.tx(async () => {
      await store.session.deleteExpired(iso());
      await store.session.put(row);
    });
    writeCookie(c, value, SESSION_DAYS * 86_400);
    return row;
  }

  const newHandle = (c: Context) => openSession(c, `anon_${randomBytes(16).toString('hex')}`);

  async function walletsOf(person: string) {
    return (await store.walletBinding.ofPerson(person)).flatMap((w) => {
      try {
        const caip10 = d.cipher().open(w.caip10_encrypted);
        const account_id = caip10.split(':').slice(2).join(':');
        // author: the account a publication names when this wallet signs it
        return [{ caip10, author: caip10, network: w.network, account_id, proved_at: w.proved_at }];
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
  async function signIn(c: Context, network: WalletNetwork, accountId: string) {
    const cipher = d.cipher();
    const address = caip10Of(network, accountId);
    const index = cipher.index(address);
    const old = await sessionOf(c);
    const at = iso();
    const out = await store.tx(async () => {
      let person = (await store.walletBinding.byHash(index))?.person;
      if (!person) {
        person = `prs_${randomBytes(16).toString('hex')}`;
        await store.person.create({ id: person, created_at: at });
        await store.walletBinding.bind({
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
        claimed = await store.run.moveOwner(old.subject, person);
        explorations = await store.exploration.moveOwner(old.subject, person);
        await store.follow.moveOwner(old.subject, person);
        await store.workspaceNote.moveOwner(old.subject, person);
        await store.folder.moveOwner(old.subject, person);
        await store.layer.moveOwner(old.subject, person);
        await store.datasetVersion.moveOwner(old.subject, person);
        await store.annotation.moveOwner(old.subject, person);
        await store.projectData.moveOwner(old.subject, person);
        await store.search.forgetOwner(old.subject);
      }
      if (old) await store.session.delete(old.hash);
      return { person, claimed, explorations };
    });
    // the wallet that signed, by its keyed hash: what authorises everything this session does
    await openSession(c, out.person, {
      network,
      invite: old?.invite,
      credential: `wallet:${index}`,
    });
    return out;
  }

  /** The wallet this session signed in with, on its network: the one its credential names. */
  async function sessionAccount(s: SessionRow): Promise<string | null> {
    if (!isPerson(s.subject) || !s.credential) return null;
    for (const w of await walletsOf(s.subject)) {
      if (w.network !== s.network) continue;
      if (`wallet:${d.cipher().index(w.caip10)}` === s.credential) return w.account_id;
    }
    return null;
  }

  const app = new Hono();

  // Answered here, so the tool routes' open CORS can't answer a preflight for these.
  app.options('/api/v1/auth/*', (c) => c.body(null, 204));
  app.options('/api/v1/me', (c) => c.body(null, 204));

  app.use('/api/v1/auth/*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    if (c.req.method === 'POST') {
      if (!originAllowed(c)) return badOrigin(c);
      const wait = limit(clientAddress(c, local));
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

  app.post('/api/v1/auth/challenge', async (c) => {
    const { nonce, expires_at } = await d.nonces.issue();
    // an EVM or a Solana wallet signs a text naming this site, its address and this nonce; NEAR's below
    const asked = (await c.req.json().catch(() => null)) as {
      chain?: unknown;
      address?: unknown;
      chain_id?: unknown;
    } | null;
    if (asked?.chain === 'eip155' || asked?.chain === 'solana') {
      const address = typeof asked.address === 'string' ? asked.address.trim() : '';
      const evm = asked.chain === 'eip155';
      if (
        evm ? !/^0x[0-9a-fA-F]{40}$/.test(address) : !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)
      )
        return fail(c, 'bad_input', `address must be ${evm ? 'an EVM' : 'a Solana'} address`);
      const chainId = typeof asked.chain_id === 'number' && asked.chain_id > 0 ? asked.chain_id : 1;
      const said = {
        domain: site.hostname,
        address,
        nonce,
        issuedAt: iso(),
        expiresAt: expires_at,
        statement: signInMessage(site.hostname),
      };
      const message = evm
        ? siweMessage({ ...said, uri: site.origin ?? `https://${site.hostname}`, chainId })
        : solanaMessage(said);
      return ok(c, { nonce, message, expires_at });
    }
    return ok(c, {
      nonce,
      message: signInMessage(site.hostname),
      // Configured, never read from the Host header: a site that got a signature for its own name
      // could otherwise replay it here with that name in the header.
      recipient: site.hostname,
      expires_at,
    });
  });

  /** The wallet a body's NEP-413 proof shows its sender holds, or the answer that refuses it. */
  async function provenWallet(
    c: Context,
  ): Promise<{ network: WalletNetwork; accountId: string } | { refused: Response }> {
    const body = (await c.req.json().catch(() => null)) as {
      network?: unknown;
      proof?: Nep413Proof;
    } | null;
    const network = body?.network;
    // an EVM or a Solana wallet's signed text: checked here, no chain asked
    if (network === 'eip155' || network === 'solana') {
      const checked = await verifyWalletProof(
        body?.proof as unknown as Eip191Proof | SolanaProof,
        { domain: site.hostname, now: now() },
        d.nonces,
      ).catch(() => ({ ok: false as const, reason: "the nonce couldn't be checked" }));
      if (!checked.ok)
        return {
          refused: fail(c, 'unauthorised', `The signature was refused: ${checked.reason}.`),
        };
      if (network === 'eip155' && (body?.proof as unknown as Eip191Proof)?.type !== 'eip191')
        return { refused: fail(c, 'bad_input', 'an EVM wallet signs with eip191') };
      if (network === 'solana' && (body?.proof as unknown as SolanaProof)?.type !== 'ed25519')
        return { refused: fail(c, 'bad_input', 'a Solana wallet signs with ed25519') };
      return { network, accountId: checked.address };
    }
    if (network !== 'testnet' && network !== 'mainnet') {
      return {
        refused: fail(c, 'bad_input', 'network must be testnet, mainnet, eip155 or solana'),
      };
    }
    const proof = body?.proof;
    if (!proof || typeof proof !== 'object' || !NEAR_ACCOUNT.test(String(proof.account_id))) {
      return { refused: fail(c, 'bad_input', 'proof must be a NEP-413 proof from a NEAR account') };
    }
    let check: { ok: boolean; reason?: string };
    try {
      // The one place a key with nothing on chain will do: it names a person, and buys nothing.
      check = await verifyNep413(
        proof,
        { message: signInMessage(site.hostname), recipient: site.hostname },
        d.rpcFor(network),
        { nonces: d.nonces, allowUnfunded: true },
      );
    } catch {
      // the error can name the account, so it isn't logged
      return {
        refused: fail(
          c,
          'source_failed',
          "Couldn't reach NEAR to check the signature, so nothing changed. Try again.",
        ),
      };
    }
    if (!check.ok) {
      return { refused: fail(c, 'unauthorised', `The signature was refused: ${check.reason}.`) };
    }
    return { network, accountId: String(proof.account_id) };
  }

  app.post('/api/v1/auth/verify', smallBody, async (c) => {
    const proven = await provenWallet(c);
    if ('refused' in proven) return proven.refused;
    const { network, accountId } = proven;
    const known = await store.walletBinding.byHash(d.cipher().index(caip10Of(network, accountId)));
    // A new account starts with a NEAR wallet, its master key. An Ethereum or Solana wallet signs in only to the
    // NEAR profile it was linked to (POST /api/v1/me/wallets); one linked to nothing, or to a profile with no NEAR
    // wallet, is refused before any session or person is made.
    if (network === 'eip155' || network === 'solana') {
      const owner = known ? await walletsOf(known.person) : [];
      if (!owner.some((w) => w.network === 'mainnet' || w.network === 'testnet')) {
        return fail(c, 'unauthorised', NEAR_FIRST);
      }
    }
    if (!known && (await d.full?.())) return fail(c, 'budget_exhausted', DATA_FULL);
    const { person, claimed, explorations } = await signIn(c, network, accountId);
    return ok(c, {
      person_id: person,
      network,
      wallets: await walletsOf(person),
      claimed_runs: claimed,
      claimed_explorations: explorations,
    });
  });

  app.post('/api/v1/auth/logout', async (c) => {
    const session = await sessionOf(c);
    if (session) await store.session.delete(session.hash);
    writeCookie(c, '', 0);
    return ok(c, { ok: true });
  });

  const inviteBody = (id: string) => inviteState(store, id, now());

  app.post('/api/v1/auth/invite', smallBody, async (c) => {
    const body = (await c.req.json().catch(() => null)) as { token?: unknown } | null;
    if (typeof body?.token !== 'string' || !body.token) {
      return fail(c, 'bad_input', 'token must be a string');
    }
    const invite = await store.invite.byTokenHash(hashToken(body.token));
    const state = invite ? await inviteBody(invite.id) : null;
    if (!invite || !state || state.status === 'revoked' || state.status === 'expired') {
      return fail(c, 'unauthorised', "That invite isn't valid.", CONNECT_HINT);
    }
    if (state.status === 'spent') return fail(c, 'budget_exhausted', INVITE_SPENT, CONNECT_HINT);
    const session = (await sessionOf(c)) ?? (await newHandle(c));
    await store.session.setInvite(session.hash, invite.id);
    return ok(c, { invite: state });
  });

  app.get('/api/v1/auth/invite', async (c) => {
    const id = (await sessionOf(c))?.invite;
    return ok(c, { invite: id ? await inviteBody(id) : null });
  });

  app.get('/api/v1/me', async (c) => {
    c.header('Cache-Control', 'no-store');
    const session = await sessionOf(c);
    if (!session || !isPerson(session.subject)) {
      return fail(c, 'unauthorised', 'Not signed in.');
    }
    const credit = await personCredit(store, session.subject);
    // what's left on the invites a chat of theirs falls back on (admitOwner), so a person on an invite reads
    // what they can spend, not zero (13 Nov: judges chat on invites and never pay)
    let inviteLeft = 0;
    for (const id of await store.session.invitesOf(session.subject, iso())) {
      const state = await inviteBody(id);
      if (!inviteRefusal(state)) inviteLeft += state?.left_usd ?? 0;
    }
    return ok(c, {
      person_id: session.subject,
      network: session.network,
      // additive (9 Nov): the wallet this session signed in with, by account id; null for none
      account: await sessionAccount(session),
      wallets: await walletsOf(session.subject),
      // null: no credit of their own, so a chat needs an invite like anyone else's
      credit: credit && { ...credit, usd_per_chat: usdPerOwnChat },
      // additive (13 Nov): dollars left on their usable invites; 0 for none
      invite_left_usd: Math.round(inviteLeft * 1e6) / 1e6,
    });
  });

  // Another wallet for the person signed in, added from /profile:
  // the same NEP-413 proof as signing in, after a challenge, bound to this person. The session stays as it is.
  app.options('/api/v1/me/wallets', (c) => c.body(null, 204));
  app.post('/api/v1/me/wallets', smallBody, async (c) => {
    c.header('Cache-Control', 'no-store');
    if (!originAllowed(c)) return badOrigin(c);
    const wait = limit(clientAddress(c, local));
    if (wait !== null) {
      return fail(c, 'rate_limited', 'Too many tries from one address.', undefined, wait);
    }
    const session = await sessionOf(c);
    if (!session || !isPerson(session.subject)) return fail(c, 'unauthorised', 'Not signed in.');
    const person = session.subject;
    const proven = await provenWallet(c);
    if ('refused' in proven) return proven.refused;
    const { network, accountId } = proven;
    const cipher = d.cipher();
    const address = caip10Of(network, accountId);
    const index = cipher.index(address);
    const known = await store.walletBinding.byHash(index);
    if (known && known.person !== person) {
      return fail(c, 'bad_input', 'That wallet already belongs to another account.');
    }
    if (!known) {
      if (await d.full?.()) return fail(c, 'budget_exhausted', DATA_FULL);
      const bound = await store.walletBinding.bind({
        person,
        network,
        caip10_encrypted: cipher.seal(address),
        caip10_hash: index,
        proved_at: iso(),
      });
      // bound by someone else in the meantime
      if (!bound && (await store.walletBinding.byHash(index))?.person !== person) {
        return fail(c, 'bad_input', 'That wallet already belongs to another account.');
      }
    }
    return ok(c, { wallets: await walletsOf(person) });
  });

  // An Ethereum or Solana wallet the person linked, taken off them, by its CAIP-10 as GET /api/v1/me lists it: its
  // binding goes, so it no longer signs in to this profile or pays for it. The NEAR account is the profile itself
  // and stays. This is Petals' private table only: a link already published stays in the public record, and the
  // profile's next press leaves it out.
  app.delete('/api/v1/me/wallets/:caip10', async (c) => {
    c.header('Cache-Control', 'no-store');
    if (!originAllowed(c)) return badOrigin(c);
    const session = await sessionOf(c);
    if (!session || !isPerson(session.subject)) return fail(c, 'unauthorised', 'Not signed in.');
    const person = session.subject;
    const caip10 = c.req.param('caip10');
    const wallet = (await walletsOf(person)).find((w) => w.caip10 === caip10);
    if (!wallet) return fail(c, 'not_found', 'That wallet isn’t connected to your account.');
    if (wallet.network !== 'eip155' && wallet.network !== 'solana') {
      return fail(
        c,
        'bad_input',
        'Your NEAR account is your profile, so it can’t be disconnected.',
      );
    }
    await store.walletBinding.unbind(person, d.cipher().index(wallet.caip10));
    return ok(c, { wallets: await walletsOf(person) });
  });

  const gate: RouteAuth = {
    subjectOf: async (c) => (await sessionOf(c))?.subject ?? null,
    callerOf: async (c) => {
      const s = await sessionOf(c);
      // who answers for what a signed-in person writes: their account, as a claim names it
      const account = s ? await sessionAccount(s) : null;
      return {
        subject: s?.subject ?? null,
        credential: s?.credential ?? null,
        by: account ? byOf(s?.network, account) : null,
      };
    },
    refuseForeign: (c) => (originAllowed(c) ? null : badOrigin(c)),
    openAnonymous: async (c) => (await newHandle(c)).subject,
    async accountOf(person) {
      if (!isPerson(person)) return null;
      const wallets = await walletsOf(person);
      const w = wallets.find((x) => x.network === 'mainnet') ?? wallets[0];
      return w ? byOf(w.network, w.account_id) : null;
    },
    async authorsOf(person) {
      return (await walletsOf(person)).map((w) => w.caip10);
    },

    async personOf(c) {
      const s = await sessionOf(c);
      if (!s || !isPerson(s.subject)) return null;
      const network: Network = s.network === 'testnet' ? 'testnet' : 'mainnet';
      const accounts = (await walletsOf(s.subject))
        .filter((w) => w.network === network)
        .map((w) => w.account_id);
      return { person: s.subject, network, accounts, account: await sessionAccount(s) };
    },

    async admitOwner(subject, llm, budget) {
      if (llm.kind === 'recorded' || !isPerson(subject)) return null;
      const day = budget.ledger ?? closedLedger('this server keeps no spend ledger');
      // on the credit contract: what the first of their wallets on its network holds, read now
      let chain: ChainChat | null = null;
      if (d.credit) {
        const network = d.credit.contract.network;
        const accounts = (await walletsOf(subject))
          .filter((w) => w.network === network)
          .map((w) => w.account_id);
        const price = accounts.length ? await (d.nearUsd ?? (async () => null))() : null;
        if (accounts.length && price !== null) {
          chain = await chainChat(store, d.credit, subject, accounts, price, now).catch(() => null);
        }
      }
      const own = await personCredit(store, subject);
      if (!own || own.left_usd <= 0) {
        // the invite their browser chats on, charged as a chat there is, with the day's cap
        for (const id of await store.session.invitesOf(subject, iso())) {
          if (inviteRefusal(await inviteBody(id))) continue;
          return { subject, budget: { ...budget, ledger: inviteLedger(store, id, day, now) } };
        }
        return null;
      }
      let spent = 0;
      const counted = async (usd: number) => {
        spent += usd;
      };
      return {
        subject,
        ownCredit: true,
        budget: {
          ...budget,
          usdPerChat: usdPerOwnChat,
          ledger: personLedger(store, subject, day, now, counted),
        },
        // on the contract, charged at the end; without it, spent from what's off the contract
        onEnd: () =>
          chain
            ? (chain as ChainChat).settle(spent)
            : drawOffchain(store, subject, spent, now()).then(() => {}),
      };
    },

    async admitChat(c, llm, budget) {
      // A recorded run spends nothing: anyone may watch it, from anywhere, and no one owns it.
      if (llm.kind === 'recorded') return {};
      if (!originAllowed(c)) return { refused: badOrigin(c) };
      const session = await sessionOf(c);
      if (d.access === 'open') return { subject: (session ?? (await newHandle(c))).subject };
      const day = budget.ledger ?? closedLedger('this server keeps no spend ledger');
      // With the credit contract, a person's own credit is what the wallet they signed in with holds in it,
      // read now, before anything is spent.
      let chain: ChainChat | null = null;
      if (d.credit && session && isPerson(session.subject)) {
        // every NEAR wallet they hold on its network, whichever wallet this session signed in with
        const network = d.credit.contract.network;
        const accounts = (await walletsOf(session.subject))
          .filter((w) => w.network === network)
          .map((w) => w.account_id);
        if (accounts.length) {
          const price = await (d.nearUsd ?? (async () => null))();
          if (price === null) {
            return {
              refused: fail(
                c,
                'source_failed',
                "Couldn't read NEAR's price, so nothing was started. Try again.",
              ),
            };
          }
          try {
            chain = await chainChat(store, d.credit, session.subject, accounts, price, now);
          } catch {
            return {
              refused: fail(
                c,
                'source_failed',
                "Couldn't read your balance on NEAR, so nothing was started. Try again.",
              ),
            };
          }
        }
      }
      // A person's own credit comes first and asks for no invite. It's theirs, so the wallet they came
      // in with and the browser they're on don't matter. Their own money has a cap of its own.
      const own =
        session && isPerson(session.subject) ? await personCredit(store, session.subject) : null;
      if (session && own && own.left_usd > 0) {
        let spent = 0;
        const counted = async (usd: number) => {
          spent += usd;
        };
        const person = session.subject;
        return {
          subject: person,
          ownCredit: true,
          budget: {
            ...budget,
            usdPerChat: usdPerOwnChat,
            ledger: personLedger(store, person, day, now, counted),
          },
          // on the contract, charged at the end; without it, spent from what's off the contract
          onEnd: () =>
            chain
              ? (chain as ChainChat).settle(spent)
              : drawOffchain(store, person, spent, now()).then(() => {}),
        };
      }
      const id = session?.invite;
      // Signed in, with no credit left and no invite: they pay for it themselves.
      if (session && isPerson(session.subject) && !id) {
        return {
          refused: fail(c, 'payment_required', own ? CREDIT_SPENT : PAYMENT_NEEDED, PAY_HINT),
        };
      }
      if (!session || !id) {
        return { refused: fail(c, 'invite_required', NO_INVITE, CONNECT_HINT) };
      }
      const refusal = inviteRefusal(await inviteBody(id));
      if (refusal) {
        const code = refusal === INVITE_SPENT ? 'budget_exhausted' : 'invite_required';
        return { refused: fail(c, code, refusal, CONNECT_HINT) };
      }
      return {
        subject: session.subject,
        budget: { ...budget, ledger: inviteLedger(store, id, day, now) },
      };
    },
  };

  return { routes: app, gate };
}
