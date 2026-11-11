// A person's own, kept on this site (Elco, 10 Nov), each the person's and not a wallet's, with who saved it
// (the session's credential) and when beside it.
//
//   GET  /api/v1/me/view       { view, hash }: the person's view, or the default for anyone without one
//   PUT  /api/v1/me/view       { view } → the same; checked against its version, view/v1 or view/v2
//   GET  /api/v1/views/:hash   { view, hash }: any view by its hash, so anyone can read what a picture shows
//   GET  /api/v1/me/profile    { profile, updated_at, published }
//   PUT  /api/v1/me/profile    { profile } → the same; NEAR Social's own shape (social-kv/1)
//   GET  /api/v1/media/:file   a picture from a profile, by its sha256, kept a year wherever it's cached
//   GET  /api/v1/price         { price, hash }: what a person pays (price/v2): NEAR AI's bill + a base fee + a tip
//   GET  /api/v1/me/tip        { tip_percent, min_percent, max_percent, step_percent }: their tip, a percent of
//                              their usage; PUT { tip_percent } sets it on the price's scale
//   GET  /api/v1/me/usage      { usage, totals }: every model call charged to them (usage/v1), the newest
//                              first, reconciled with NEAR AI's bill first
//   GET  /api/v1/me/annotations?verb=  { annotations: [{ claim, exploration, added_at }] }: everything they and
//                              their agents keep about accounts, from all their projects, oldest first; with
//                              verb=named, the names the page draws on petals (core's namePieces)
//   POST /api/v1/me/annotations  { annotations, conversation? } → { added, existed, ids }: what the person adds
//                              from the page ("Add a note"), with their account as who answers for it, in a
//                              conversation's project (a run's made now if it has none), or with none, theirs
//                              in no project (exploration: null)
//
// The view is the glasses every petal the person sees is drawn through (one-source.md, step 1: "When the
// user has a certain setting selected, all of the petals he will ever interact while those settings are
// selected are going to be rendered in that way for him"). The profile holds what NEAR Social's profile
// holds (api2.near.social/standard.md: name, about, avatar, banner, location, links), so publishing it later
// is a straight copy (Elco: "hold the same data shape as near.social in our DB in case the user doesn't want
// to put it on chain"). A picture comes as a data: URI and is kept here under its sha256, as FastFS names an
// upload (media/{sha256}.{ext}); the profile then holds its address on this site.
import { createHash } from 'node:crypto';
import {
  canonicalJson,
  DEFAULT_VIEW,
  DEFAULT_VIEW_V1,
  type Price,
  priceHash,
  TOOLS_VERSION,
  tipAllowed,
  viewHash,
  viewProblem,
} from '@petal/core';
import type { View } from '@petal/core/types';
import type { Store } from '@petal/store';
import {
  annotationsOf,
  bodyCap,
  fromThrown,
  runExplorationOf,
  type ToolContext,
} from '@petal/tools';
import { type Context, Hono } from 'hono';
import type { RouteAuth } from './auth-routes.ts';
import type { LlmClient } from './llm.ts';
import { PRICE, tipPercentOfPerson } from './price.ts';
import { fail } from './routes.ts';
import { reconcile, recordOf } from './usage.ts';

const HASH = /^[0-9a-f]{64}$/;
const isPerson = (subject: string | null): subject is string => !!subject?.startsWith('prs_');
const DEFAULT_HASH = viewHash(DEFAULT_VIEW);
const DEFAULT_V1_HASH = viewHash(DEFAULT_VIEW_V1);
const IMMUTABLE = 'public, max-age=31536000, immutable';
/** how many of a person's latest records their usage lists */
const USAGE_LISTED = 500;

/** The picture types a profile takes, by the extension its address carries. */
const MEDIA: Record<string, string> = { webp: 'image/webp', jpg: 'image/jpeg', png: 'image/png' };
const EXTENSION: Record<string, string> = Object.fromEntries(
  Object.entries(MEDIA).map(([ext, type]) => [type, ext]),
);

/** NEAR Social's profile (social-kv/1, section 3.1): each field optional, null clears it. */
export interface Profile {
  name?: string | null;
  about?: string | null;
  avatar?: string | null;
  banner?: string | null;
  location?: string | null;
  links?: Record<string, string>;
}

/** The standard's limits, in Unicode characters. */
const TEXT_MAX: Record<'name' | 'about' | 'location', number> = {
  name: 256,
  about: 10_000,
  location: 256,
};
const LINK_SERVICE = /^[a-z0-9_]{1,32}$/;
const LINK_MAX = 2048;
const LINKS_MAX = 32;
/** A media address on chain (section 4). */
const FASTFS = /^fastfs:\/\/[^/\s]+\/[^/\s]+\/(?!\/)(?!.*\.\.)[A-Za-z0-9._\-/]{1,1024}$/;
const DATA_URI = /^data:(image\/(?:webp|jpeg|png));base64,([A-Za-z0-9+/]+=*)$/;
const chars = (s: string) => [...s].length;

export interface MeDeps {
  store: Store;
  gate: RouteAuth;
  /** the site's public address, for a picture's address; none: relative */
  apiBase?: string;
  /** whose billing a person's usage is reconciled with */
  llm?: LlmClient;
  /** what Petals charges at; default price.json */
  price?: Price;
  clock?: () => number;
  /** for a run's project, made when an annotation is the first thing it keeps */
  tools?: ToolContext;
}

export function meRoutes(d: MeDeps): Hono {
  const { store, gate } = d;
  const price = d.price ?? PRICE;
  const clock = d.clock ?? Date.now;
  const iso = () => new Date(clock()).toISOString();
  const site = (d.apiBase ?? '').replace(/\/+$/, '');
  const mediaPath = (sha: string, type: string) => `/api/v1/media/${sha}.${EXTENSION[type]}`;
  const ok = (c: Context, body: Record<string, unknown>) =>
    c.json({ ...body, tools_version: TOOLS_VERSION });

  const app = new Hono();
  for (const path of [
    '/api/v1/me/view',
    '/api/v1/me/profile',
    '/api/v1/me/usage',
    '/api/v1/me/tip',
  ]) {
    app.use(path, bodyCap);
    app.use(path, async (c, next) => {
      c.header('Cache-Control', 'no-store');
      if (c.req.method !== 'GET') {
        const foreign = gate.refuseForeign(c);
        if (foreign) return foreign;
      }
      await next();
    });
  }

  /** The person signed in, and what opened their session; null for a visitor. */
  async function personOf(c: Context) {
    const { subject, credential } = await gate.callerOf(c);
    return isPerson(subject) ? { person: subject, credential } : null;
  }

  const jsonBody = async (c: Context): Promise<Record<string, unknown> | null> => {
    const b = await c.req.json().catch(() => null);
    return b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : null;
  };

  async function viewOf(hash: string): Promise<View | null> {
    if (hash === DEFAULT_HASH) return DEFAULT_VIEW;
    // the default before labels (view/v1): pictures made before view/v2 name it, and it draws the same
    if (hash === DEFAULT_V1_HASH) return DEFAULT_VIEW_V1;
    const row = await store.viewDoc.get(hash);
    return row ? (JSON.parse(row.body) as View) : null;
  }

  // -- annotations, from all their projects (annotation-layer.md step 5)

  app.get('/api/v1/me/annotations', async (c) => {
    const me = await personOf(c);
    if (!me) return fail(c, 'unauthorised', 'Sign in to read what you keep about accounts.');
    const verb = c.req.query('verb');
    const rows = (await store.annotation.list(me.person)).filter((r) => !verb || r.verb === verb);
    return ok(c, {
      annotations: rows.map((r) => ({
        claim: JSON.parse(r.body) as unknown,
        exploration: r.exploration || null,
        added_at: r.created_at,
      })),
    });
  });

  app.post('/api/v1/me/annotations', bodyCap, async (c) => {
    const foreign = gate.refuseForeign(c);
    if (foreign) return foreign;
    const me = await personOf(c);
    if (!me) return fail(c, 'unauthorised', 'Sign in to keep what you know about accounts.');
    const who = await gate.callerOf(c);
    if (!who.by)
      return fail(c, 'unauthorised', 'Sign in with your wallet: what you keep names your account.');
    const body = (await c.req.json().catch(() => null)) as {
      annotations?: unknown;
      conversation?: unknown;
    } | null;
    if (!Array.isArray(body?.annotations) || body.annotations.length === 0)
      return fail(
        c,
        'bad_input',
        'annotations must be a list of one or more, as add_annotation takes them',
      );
    // where it's kept: the conversation's project, or none
    let exploration = '';
    const ref = typeof body.conversation === 'string' ? body.conversation.trim() : '';
    if (ref) {
      const row = ref.startsWith('exp_') ? await store.exploration.get(ref) : null;
      const run = row ? null : await store.run.get(ref);
      if (row?.owner === me.person) exploration = row.id;
      else if (run?.owner === me.person && d.tools)
        exploration = (await runExplorationOf(d.tools, run.id)) ?? '';
      if (!exploration) return fail(c, 'not_found', 'You have no conversation by that id.');
    }
    const at = iso();
    let claims: ReturnType<typeof annotationsOf>;
    try {
      claims = annotationsOf(body.annotations, who.by, at);
    } catch (e) {
      const { error } = fromThrown(e, 'bad_input');
      return fail(c, error.code, error.message, error.hint);
    }
    const added = await store.annotation.add(
      claims.map((cl, place) => ({
        owner: me.person,
        id: cl.id,
        exploration,
        subject: cl.subject,
        verb: cl.verb,
        kind: cl.kind,
        body: JSON.stringify(cl),
        credential: who.credential,
        created_at: at,
        place,
      })),
    );
    return ok(c, {
      exploration: exploration || null,
      added,
      existed: claims.length - added,
      ids: claims.map((cl) => cl.id),
    });
  });

  // -- the view

  app.get('/api/v1/me/view', async (c) => {
    const me = await personOf(c);
    const row = me ? await store.personView.get(me.person) : undefined;
    const view = row ? await viewOf(row.view) : null;
    return view && row
      ? ok(c, { view, hash: row.view })
      : ok(c, { view: DEFAULT_VIEW, hash: DEFAULT_HASH });
  });

  app.put('/api/v1/me/view', async (c) => {
    const me = await personOf(c);
    if (!me)
      return fail(c, 'unauthorised', "Sign in to keep your own view: a visitor's is the default.");
    const body = await jsonBody(c);
    const problem = viewProblem(body?.view);
    if (problem) return fail(c, 'bad_input', `Not a view/v1 or view/v2: ${problem}.`);
    const view = body?.view as View;
    const hash = viewHash(view);
    const at = iso();
    await store.tx(async () => {
      await store.viewDoc.put(hash, canonicalJson(view), at);
      await store.personView.set({
        person: me.person,
        view: hash,
        credential: me.credential,
        set_at: at,
      });
    });
    return ok(c, { view, hash });
  });

  app.get('/api/v1/views/:hash', async (c) => {
    const hash = c.req.param('hash');
    const view = HASH.test(hash) ? await viewOf(hash) : null;
    if (!view) return fail(c, 'not_found', 'No view under that hash.');
    return ok(c, { view, hash });
  });

  // -- the profile

  /** What GET answers. `published` stays null until publishing to NEAR Social is on. */
  async function profileAnswer(person: string) {
    const row = await store.personProfile.get(person);
    return {
      profile: row ? (JSON.parse(row.body) as Profile) : null,
      updated_at: row?.saved_at ?? null,
      published: null,
    };
  }

  /** A picture field as the profile keeps it, or why not. A data: URI is kept here and becomes its address. */
  async function pictureOf(
    value: unknown,
    field: string,
    person: string,
  ): Promise<{ value: string | null } | { problem: string }> {
    if (value === null || value === undefined || value === '') return { value: null };
    if (typeof value !== 'string')
      return { problem: `${field} must be a picture's address or null` };
    if (FASTFS.test(value)) return { value };
    const ours = /^(?:.*)?\/api\/v1\/media\/([0-9a-f]{64})\.(webp|jpg|png)$/.exec(value);
    if (ours && (value.startsWith('/') || value.startsWith(`${site}/`))) {
      const row = await store.media.get(ours[1] as string);
      return row ? { value } : { problem: `${field} names a picture this site doesn't hold` };
    }
    const data = DATA_URI.exec(value);
    if (!data) {
      return {
        problem: `${field} must be a data:image/webp, jpeg or png base64 picture, this site's picture address, or a fastfs:// address`,
      };
    }
    const type = data[1] as string;
    const bytes = Buffer.from(data[2] as string, 'base64');
    if (!bytes.length) return { problem: `${field}'s picture is empty` };
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    await store.media.put({
      sha256,
      type,
      body: bytes.toString('base64'),
      person,
      created_at: iso(),
    });
    return { value: `${site}${mediaPath(sha256, type)}` };
  }

  /** The profile as it's kept, or why it can't be. Every field is optional; null clears it. */
  async function checkProfile(x: unknown, person: string): Promise<Profile | string> {
    if (!x || typeof x !== 'object' || Array.isArray(x)) return 'profile must be an object';
    const given = x as Record<string, unknown>;
    const known = ['name', 'about', 'avatar', 'banner', 'location', 'links'];
    const unknown = Object.keys(given).find((k) => !known.includes(k));
    if (unknown)
      return `profile has an unknown field: ${unknown} (NEAR Social's are ${known.join(', ')})`;
    const out: Profile = {};
    for (const field of ['name', 'about', 'location'] as const) {
      const v = given[field];
      if (v === undefined) continue;
      if (v !== null && typeof v !== 'string') return `${field} must be text or null`;
      if (typeof v === 'string' && chars(v) > TEXT_MAX[field]) {
        return `${field} is ${TEXT_MAX[field]} characters at most`;
      }
      out[field] = v === '' ? null : v;
    }
    for (const field of ['avatar', 'banner'] as const) {
      if (given[field] === undefined) continue;
      const got = await pictureOf(given[field], field, person);
      if ('problem' in got) return got.problem;
      out[field] = got.value;
    }
    if (given.links !== undefined) {
      const links = given.links;
      if (!links || typeof links !== 'object' || Array.isArray(links)) {
        return 'links must be an object of service: handle or https URL';
      }
      const entries = Object.entries(links as Record<string, unknown>);
      if (entries.length > LINKS_MAX) return `links holds ${LINKS_MAX} at most`;
      for (const [service, value] of entries) {
        if (!LINK_SERVICE.test(service)) {
          return `a link's service is 1 to 32 of a-z, 0-9 and _: ${service} isn't`;
        }
        if (typeof value !== 'string' || !value || chars(value) > LINK_MAX) {
          return `links.${service} must be a handle or an https:// URL, ${LINK_MAX} characters at most`;
        }
      }
      out.links = Object.fromEntries(entries) as Record<string, string>;
    }
    return out;
  }

  app.get('/api/v1/me/profile', async (c) => {
    const me = await personOf(c);
    if (!me) return fail(c, 'unauthorised', 'Not signed in.');
    return ok(c, await profileAnswer(me.person));
  });

  app.put('/api/v1/me/profile', async (c) => {
    const me = await personOf(c);
    if (!me) return fail(c, 'unauthorised', 'Sign in to keep a profile.');
    const body = await jsonBody(c);
    const profile = await checkProfile(body?.profile, me.person);
    if (typeof profile === 'string') return fail(c, 'bad_input', profile);
    await store.personProfile.set({
      person: me.person,
      body: canonicalJson(profile),
      credential: me.credential,
      saved_at: iso(),
    });
    return ok(c, await profileAnswer(me.person));
  });

  // -- the price (price/v2) and the person's tip, a donation at a percent of their usage

  app.get('/api/v1/price', (c) => ok(c, { price, hash: priceHash(price) }));

  const tipAnswer = async (person: string) => ({
    tip_percent: await tipPercentOfPerson(store, price, person),
    min_percent: price.tip.min_percent,
    max_percent: price.tip.max_percent,
    step_percent: price.tip.step_percent,
  });

  app.get('/api/v1/me/tip', async (c) => {
    const me = await personOf(c);
    if (!me) return fail(c, 'unauthorised', 'Not signed in.');
    return ok(c, await tipAnswer(me.person));
  });

  app.put('/api/v1/me/tip', async (c) => {
    const me = await personOf(c);
    if (!me) return fail(c, 'unauthorised', 'Sign in to set a tip.');
    const tip = (await jsonBody(c))?.tip_percent;
    // null puts it back to the price's default
    if (tip !== null && (typeof tip !== 'number' || !tipAllowed(price, tip))) {
      const t = price.tip;
      return fail(
        c,
        'bad_input',
        `tip_percent is ${t.min_percent} to ${t.max_percent} in steps of ${t.step_percent}, or null`,
      );
    }
    await store.person.setTip(me.person, tip as number | null);
    return ok(c, await tipAnswer(me.person));
  });

  // -- usage (usage/v1)

  app.get('/api/v1/me/usage', async (c) => {
    const me = await personOf(c);
    if (!me) return fail(c, 'unauthorised', 'Not signed in.');
    const account = `person:${me.person}`;
    if (d.llm) {
      await reconcile(store, d.llm, account, price).catch((e) =>
        console.warn(`petal: couldn't reconcile ${account} with NEAR AI: ${String(e)}`),
      );
    }
    const usage = (await store.usage.ofAccount(account, USAGE_LISTED)).map(recordOf);
    const sum = (f: (r: (typeof usage)[number]) => number) =>
      Math.round(usage.reduce((s, r) => s + f(r), 0) * 1e9) / 1e9;
    return ok(c, {
      usage,
      totals: {
        calls: usage.length,
        charged_usd: sum((r) => r.charged_usd),
        reconciled: usage.filter((r) => r.reconciled_at).length,
        billed_usd: sum((r) => r.billed_usd ?? 0),
      },
    });
  });

  app.get('/api/v1/media/:file', async (c) => {
    const m = /^([0-9a-f]{64})\.(webp|jpg|png)$/.exec(c.req.param('file'));
    const row = m ? await store.media.get(m[1] as string) : undefined;
    if (!m || !row || MEDIA[m[2] as string] !== row.type) {
      return fail(c, 'not_found', 'No picture under that name.');
    }
    return c.body(Buffer.from(row.body, 'base64'), 200, {
      'Content-Type': row.type,
      'Cache-Control': IMMUTABLE,
      ETag: `"${row.sha256}"`,
    });
  });

  return app;
}
