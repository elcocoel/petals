// The workspace (W1, T310 to T316; design/workspace-data.md, design/workspace-api-map.md): coming back to
// conversations, following shapes, a person's own notes, and search across them.
//   GET   /api/v1/catalogue                 what each provider offers; no session
//   GET   /api/v1/conversations             a person's conversations, and work from other doors
//   GET   /api/v1/conversations/:id         one, with its turns, its shapes and what other doors did
//   PATCH /api/v1/conversations/:id         rename, change settings, hide, move into a folder
//   GET   /api/v1/folders, POST             a person's folders, flat, and one more
//   PATCH /api/v1/folders/:id, DELETE       rename, move, reorder; delete moves what it held up
//   GET   /api/v1/follows, POST             what they follow, and follow one more
//   GET   /api/v1/follows/:id               reopen it as a shape
//   PATCH /api/v1/follows/:id, DELETE
//   GET   /api/v1/notes, POST
//   PATCH /api/v1/notes/:id, DELETE
//   GET   /api/v1/search
//
// A conversation is a run, and an exploration with no run shows as one, with no run invented for it.
// Each route reads a session, so like the auth routes they send no CORS headers, a write from another site
// is refused, and they mount before the tool routes' open CORS. With no session a read answers empty, and
// the first POST opens an anonymous one. Someone else's row answers as if it never existed.
import { randomBytes } from 'node:crypto';
import { parseRef, TOOLS_VERSION } from '@petal/core';
import type { ChatMessage } from '@petal/core/types';
import {
  type ConversationRow,
  type ExplorationRow,
  type FolderRow,
  type FollowRow,
  type RunRow,
  SEARCH_HIT_CLOSE,
  SEARCH_HIT_OPEN,
  type Store,
  type WorkspaceNoteRow,
} from '@petal/store';
import {
  bodyCap,
  clientAddress,
  DATA_FULL,
  isLocalSite,
  shapeAt,
  type ToolContext,
} from '@petal/tools';
import { type Context, Hono, type MiddlewareHandler } from 'hono';
import type { RouteAuth } from './auth-routes.ts';
import { catalogue, resolveSettings, type Settings, settingsOf } from './catalogue.ts';
import type { LlmClient } from './llm.ts';
import { fail, limiter } from './routes.ts';
import { firstQuestion, RUN_ID } from './runs.ts';

const EXPLORATION_ID = /^exp_[0-9a-f]{24}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const FOLLOW_ID = /^flw_[0-9a-f]{24}$/;
const NOTE_ID = /^nte_[0-9a-f]{24}$/;
const FOLDER_ID = /^fld_[0-9a-f]{24}$/;

const TITLE_MAX = 200;
const LABEL_MAX = 120;
const REF_MAX = 400;
const NOTE_TEXT_MAX = 20_000;
const EVIDENCE_MAX = 20;
const EVIDENCE_NOTE_MAX = 2_000;
/** What one owner can add has an end. */
const FOLLOWS_MAX = 500;
const NOTES_MAX = 1_000;
const FOLDERS_MAX = 200;
/** How deep folders nest: a folder at the top is at depth 1. */
const FOLDER_DEPTH_MAX = 8;
const POSITION_MAX = 1_000_000;
const LIST_MAX = 200;
const QUERY_MAX = 200;
const QUERY_WORDS_MAX = 12;
const INDEXED_CHARS_MAX = 200_000;
/** Writes and searches per minute, from one address. In memory, as the other limits are. */
const WRITES_PER_MINUTE = 60;
const SEARCHES_PER_MINUTE = 120;

export const SEARCH_KINDS = ['conversation', 'note', 'shape', 'follow'] as const;

const messagesOf = (body: string | null): ChatMessage[] => {
  if (!body) return [];
  try {
    return (JSON.parse(body) as { messages?: ChatMessage[] }).messages ?? [];
  } catch {
    return [];
  }
};

/**
 * A person's words, for search as they type: the store writes its own query from them, each one taken
 * as words and never as syntax, the last one a prefix. Null when there's nothing to look for.
 */
export function searchWords(q: string): string[] | null {
  const words = q
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w))
    .slice(0, QUERY_WORDS_MAX);
  return words.length ? words : null;
}

/** A snippet from the store, in pieces, so a surface never has to treat text as markup. */
function snippetParts(snippet: string): { text: string; hit: boolean }[] {
  const parts: { text: string; hit: boolean }[] = [];
  for (const [i, piece] of snippet.split(SEARCH_HIT_OPEN).entries()) {
    const close = i === 0 ? -1 : piece.indexOf(SEARCH_HIT_CLOSE);
    if (close >= 0) parts.push({ text: piece.slice(0, close), hit: true });
    const rest = close >= 0 ? piece.slice(close + 1) : piece;
    if (rest) parts.push({ text: rest, hit: false });
  }
  return parts;
}

const idOf = (prefix: string) => `${prefix}_${randomBytes(12).toString('hex')}`;

const FOLDER_FIELD = "folder must be a folder's id, or null for the top";
/** A folder field as asked: undefined to leave it, null for the top, an id, or false when it's neither. */
function folderOf(x: unknown): string | null | undefined | false {
  if (x === undefined || x === null) return x;
  return typeof x === 'string' && FOLDER_ID.test(x) ? x : false;
}

/** An account as claims spell it, or `network:<target_key>`. Null for anything else. */
function followKind(ref: unknown): 'account' | 'network' | null {
  if (typeof ref !== 'string' || !ref || ref.length > REF_MAX) return null;
  if (/^network:[^\s]/.test(ref)) return 'network';
  return parseRef(ref)?.ns === 'account' ? 'account' : null;
}

/** The same shape and checks as a claim's evidence: a list of what it rests on. */
function evidenceOf(x: unknown): { evidence: object[] } | { problem: string } {
  if (x === undefined || x === null) return { evidence: [] };
  if (!Array.isArray(x)) return { problem: 'evidence must be a list' };
  if (x.length > EVIDENCE_MAX) return { problem: `at most ${EVIDENCE_MAX} pieces of evidence` };
  const out: object[] = [];
  for (const [i, raw] of x.entries()) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { problem: `evidence[${i}] must be an object` };
    }
    const e = raw as Record<string, unknown>;
    const keep: Record<string, string> = {};
    for (const key of Object.keys(e)) {
      const value = e[key];
      if (typeof value !== 'string') return { problem: `evidence[${i}].${key} must be a string` };
      switch (key) {
        case 'snapshot_sha256':
        case 'url_sha256':
        case 'claim_id':
          if (!SHA256.test(value)) return { problem: `evidence[${i}].${key} must be a SHA-256` };
          break;
        case 'url':
          if (!/^https?:\/\/\S+$/.test(value) || value.length > 2_000) {
            return { problem: `evidence[${i}].url must be an http(s) URL` };
          }
          break;
        case 'retrieved_at':
          if (Number.isNaN(Date.parse(value))) {
            return { problem: `evidence[${i}].retrieved_at must be a date` };
          }
          break;
        case 'note':
          if (value.length > EVIDENCE_NOTE_MAX) {
            return { problem: `evidence[${i}].note is too long` };
          }
          break;
        default:
          return { problem: `evidence[${i}] has no field ${key}` };
      }
      keep[key] = value;
    }
    out.push(keep);
  }
  return { evidence: out };
}

export interface WorkspaceDeps {
  store: Store;
  tools: ToolContext;
  gate: RouteAuth;
  llm: LlmClient;
  clock?: () => number;
  /** past the data budget, a write a stranger can cause is refused */
  full?: () => Promise<boolean>;
}

export function workspaceRoutes(d: WorkspaceDeps): Hono {
  const { store, gate, tools } = d;
  const clock = d.clock ?? Date.now;
  const iso = () => new Date(clock()).toISOString();
  const writes = limiter(WRITES_PER_MINUTE, 60_000, clock);
  const searches = limiter(SEARCHES_PER_MINUTE, 60_000, clock);
  const local = isLocalSite(tools.config.apiBase);
  const ok = (c: Context, body: Record<string, unknown>, status: 200 | 201 = 200) =>
    c.json({ ...body, tools_version: TOOLS_VERSION }, status);

  const app = new Hono();
  for (const path of ['conversations', 'folders', 'follows', 'notes', 'search', 'catalogue']) {
    app.options(`/api/v1/${path}`, (c) => c.body(null, 204));
    app.options(`/api/v1/${path}/*`, (c) => c.body(null, 204));
    app.use(`/api/v1/${path}`, bodyCap);
    app.use(`/api/v1/${path}/*`, bodyCap);
    const guard: MiddlewareHandler = async (c, next) => {
      c.header('Cache-Control', 'no-store');
      if (c.req.method !== 'GET') {
        const foreign = gate.refuseForeign(c);
        if (foreign) return foreign;
        const wait = writes(clientAddress(c, local));
        if (wait !== null) {
          return fail(c, 'rate_limited', 'Too many changes from one address.', undefined, wait);
        }
      }
      await next();
    };
    app.use(`/api/v1/${path}`, guard);
    app.use(`/api/v1/${path}/*`, guard);
  }

  const limitOf = (c: Context, fallback = 50) => {
    const n = Number(c.req.query('limit'));
    return Number.isInteger(n) && n > 0 ? Math.min(n, LIST_MAX) : fallback;
  };

  const jsonBody = async (c: Context): Promise<Record<string, unknown> | null> => {
    const b = await c.req.json().catch(() => null);
    return b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : null;
  };

  /** Why this write can't happen at all, or null. Asked before any session is opened for it. */
  async function cannotWrite(c: Context) {
    if (!store.durable) {
      return fail(
        c,
        'source_failed',
        "This server can't keep anything between requests, so this can't be saved here.",
      );
    }
    return (await d.full?.()) ? fail(c, 'budget_exhausted', DATA_FULL) : null;
  }

  // ---------------------------------------------------------------------------------------------
  // Conversations

  const shapesCount = async (exploration: string | null) =>
    exploration ? store.step.count(exploration) : 0;

  async function conversationOfRun(row: ConversationRow | RunRow) {
    return {
      id: row.id,
      run_id: row.id,
      door: 'site',
      title: row.title ?? firstQuestion(messagesOf(row.body)),
      status: row.status,
      settings: settingsOf(row.settings),
      answered_by: row.model,
      exploration: row.exploration,
      shapes_count: await shapesCount(row.exploration),
      hidden_at: row.hidden_at ?? null,
      folder: row.folder ?? null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  /** Where work from another door began: its first step, or else its first note. */
  async function doorOf(exploration: string): Promise<string | null> {
    return (
      (await store.step.list(exploration))[0]?.door ??
      (await store.note.list(exploration))[0]?.door ??
      null
    );
  }

  /** Work from another door, as a conversation. `status: "elsewhere"`, and no run: none exists. */
  async function conversationOfExploration(row: ExplorationRow) {
    return {
      id: row.id,
      run_id: null,
      door: await doorOf(row.id),
      // the name its agent sent with a note, or else the question it started on
      title: (row.title ?? row.question).slice(0, TITLE_MAX),
      status: 'elsewhere',
      settings: settingsOf(null),
      answered_by: null,
      exploration: row.id,
      shapes_count: await shapesCount(row.id),
      hidden_at: null,
      folder: row.folder ?? null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  /** A turn's figures, from its `done`. `turns` there counts model calls, so it's named for what it is. */
  async function turnsOf(runId: string) {
    return (await store.runEvent.ofType(runId, 'done')).map((e) => {
      const data = JSON.parse(e.data) as {
        model: string;
        picked?: string;
        fallback_used: boolean;
        turns: number;
        tokens: { in: number; out: number };
        cost_usd: number;
        context_tokens?: number;
        signature?: { signature_kind?: string } | null;
      };
      return {
        at: e.at,
        // what answered, and null when nothing did. `picked` is what was asked for, if anything was
        model: data.turns ? data.model : null,
        picked: data.picked ?? null,
        fallback_used: data.fallback_used,
        model_calls: data.turns,
        tokens: data.tokens,
        context_tokens: data.context_tokens ?? null,
        cost_usd: data.cost_usd,
        // a gateway's signature doesn't prove which model answered
        signed: data.signature?.signature_kind === 'provider_tee',
      };
    });
  }

  const shape = async (sha: string) => {
    try {
      return await shapeAt(tools, sha);
    } catch {
      // a stored spec that no longer matches its hash isn't shown
      return null;
    }
  };

  /** Each flower of an exploration, in order, however many doors drew them. */
  async function shapesOf(exploration: string | null) {
    if (!exploration) return [];
    const out = [];
    for (const s of await store.step.list(exploration)) {
      const at = s.spec_sha256 ? await shape(s.spec_sha256) : null;
      if (!at) continue;
      out.push({
        spec_sha256: at.spec_sha256,
        short_url: at.short_url,
        network: at.network,
        target: at.target,
        as_of: at.as_of,
        door: s.door,
        at: s.at,
      });
    }
    return out;
  }

  /**
   * What other doors did on this exploration, oldest first. A site's own steps are left out: a run
   * shows those in its log. With no run, this is the whole story.
   */
  async function doorTurnsOf(exploration: string | null) {
    if (!exploration) return [];
    const steps = (await store.step.list(exploration)).map((s) => ({
      kind: 'step' as const,
      door: s.door,
      from: s.author ?? 'owner',
      at: s.at,
      spec_sha256: s.spec_sha256,
      short_url: s.spec_sha256
        ? `${(tools.config.apiBase ?? '').replace(/\/+$/, '')}/d/${s.spec_sha256}`
        : null,
      text: s.note,
    }));
    const notes = (await store.note.list(exploration)).map((n) => ({
      kind: 'note' as const,
      door: n.door,
      from: n.author,
      at: n.at,
      spec_sha256: null,
      short_url: null,
      text: n.text,
    }));
    return [...steps, ...notes]
      .filter((t) => t.door !== 'site')
      .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  }

  /** The owner's run by id, or by the exploration it's working on. Null for anything else. */
  async function ownRun(subject: string, id: string): Promise<RunRow | null> {
    const runId = EXPLORATION_ID.test(id) ? await store.run.latestOfExploration(id) : id;
    if (!runId || !RUN_ID.test(runId)) return null;
    const row = await store.run.get(runId);
    return row?.owner === subject ? row : null;
  }

  const noConversation = (c: Context, id: string) => fail(c, 'not_found', `no conversation ${id}`);

  app.get('/api/v1/catalogue', (c) => ok(c, catalogue(d.llm.kind)));

  app.get('/api/v1/conversations', async (c) => {
    const subject = await gate.subjectOf(c);
    if (!subject) return ok(c, { conversations: [] });
    const limit = limitOf(c);
    const hidden = c.req.query('hidden') === '1' || c.req.query('hidden') === 'true';
    const runs = await Promise.all(
      (await store.run.conversations(subject, limit, hidden)).map(conversationOfRun),
    );
    const doors = hidden
      ? []
      : await Promise.all(
          (await store.exploration.withoutRun(subject, limit)).map(conversationOfExploration),
        );
    const conversations = [...runs, ...doors]
      .sort((a, b) => (a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0))
      .slice(0, limit);
    return ok(c, { conversations });
  });

  app.get('/api/v1/conversations/:id', async (c) => {
    const id = c.req.param('id');
    const subject = await gate.subjectOf(c);
    if (!subject) return noConversation(c, id);
    const run = await ownRun(subject, id);
    if (run) {
      return ok(c, {
        conversation: {
          ...(await conversationOfRun(run)),
          turns: await turnsOf(run.id),
          shapes: await shapesOf(run.exploration),
          door_turns: await doorTurnsOf(run.exploration),
        },
      });
    }
    const row = EXPLORATION_ID.test(id) ? await store.exploration.get(id) : null;
    if (row?.owner !== subject) return noConversation(c, id);
    return ok(c, {
      conversation: {
        ...(await conversationOfExploration(row)),
        turns: [],
        shapes: await shapesOf(row.id),
        door_turns: await doorTurnsOf(row.id),
      },
    });
  });

  app.patch('/api/v1/conversations/:id', async (c) => {
    const id = c.req.param('id');
    const subject = await gate.subjectOf(c);
    const body = await jsonBody(c);
    if (!body) return fail(c, 'bad_input', 'the body must be a JSON object');
    const refused = await cannotWrite(c);
    if (refused) return refused;
    if (!subject) return noConversation(c, id);
    const folder = folderOf(body.folder);
    if (folder === false) return fail(c, 'bad_input', FOLDER_FIELD);
    if (folder && !(await ownFolder(subject, folder))) return noFolder(c, folder);
    if (EXPLORATION_ID.test(id) && !(await store.run.latestOfExploration(id))) {
      const row = await store.exploration.get(id);
      if (row?.owner !== subject) return noConversation(c, id);
      // another door's work has no run to hold a name or settings, but it can sit in a folder
      const onlyFolder = ['title', 'settings', 'hidden'].every((k) => body[k] === undefined);
      if (folder === undefined || !onlyFolder) {
        return fail(
          c,
          'bad_input',
          'This came from another door, so there is no conversation here to rename, set or hide yet. It can go in a folder.',
          'Continue it here first: POST /api/v1/agent/chat with its id as exploration.',
        );
      }
      await store.exploration.setFolder(row.id, folder);
      return ok(c, { conversation: await conversationOfExploration({ ...row, folder }) });
    }
    const run = await ownRun(subject, id);
    if (!run) return noConversation(c, id);

    let settings: Settings | null = null;
    if (body.settings !== undefined) {
      const resolved = resolveSettings(body.settings, settingsOf(run.settings));
      if (typeof resolved === 'string') return fail(c, 'bad_input', resolved);
      settings = resolved;
    }
    if (body.title !== undefined && body.title !== null) {
      if (typeof body.title !== 'string' || !body.title.trim() || body.title.length > TITLE_MAX) {
        return fail(c, 'bad_input', `title must be text, up to ${TITLE_MAX} characters`);
      }
    }
    if (body.hidden !== undefined && typeof body.hidden !== 'boolean') {
      return fail(c, 'bad_input', 'hidden must be true or false');
    }
    await store.tx(async () => {
      if (settings) await store.run.setSettings(run.id, JSON.stringify(settings));
      if (body.hidden !== undefined) await store.run.setHidden(run.id, body.hidden ? iso() : null);
      if (folder !== undefined) {
        await store.run.setFolder(run.id, folder);
        // its exploration goes too, so a later run on it starts in the same place
        if (run.exploration) await store.exploration.setFolder(run.exploration, folder);
      }
      if (body.title !== undefined) {
        // null goes back to the first question
        const title = typeof body.title === 'string' ? body.title.trim() : null;
        await store.run.setTitle(
          run.id,
          title ?? firstQuestion(messagesOf(run.body)),
          title ? iso() : null,
        );
        await store.search.forget(subject, 'conversation', run.id);
      }
    });
    return ok(c, {
      conversation: await conversationOfRun((await store.run.get(run.id)) as RunRow),
    });
  });

  // ---------------------------------------------------------------------------------------------
  // Folders (004-workspace, W4): the person's own, as in any IDE. Nothing else is in them but
  // conversations, and a folder is never shared.

  const folderItem = (f: FolderRow) => ({
    id: f.id,
    name: f.name,
    parent: f.parent,
    position: f.position,
    created_at: f.created_at,
    updated_at: f.updated_at,
  });

  const noFolder = (c: Context, id: string) => fail(c, 'not_found', `no folder ${id}`);
  /** A write's outcome, decided inside its transaction: the row, a folder that isn't theirs, or a no. */
  type Placed = { row: FolderRow } | { gone: string } | { problem: string };

  async function ownFolder(subject: string | null, id: string) {
    if (!subject || !FOLDER_ID.test(id)) return null;
    const row = await store.folder.get(id);
    return row?.owner === subject ? row : null;
  }

  /** What's wrong with a folder's fields, or null. Undefined means leave it. */
  function folderFields(body: Record<string, unknown>): string | null {
    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > LABEL_MAX) {
        return `name must be text, up to ${LABEL_MAX} characters`;
      }
    }
    if (folderOf(body.parent) === false) return "parent must be a folder's id, or null for the top";
    if (body.position !== undefined) {
      if (!Number.isInteger(body.position) || Math.abs(body.position as number) > POSITION_MAX) {
        return `position must be a whole number, up to ${POSITION_MAX} either way`;
      }
    }
    return null;
  }

  /**
   * Whether `id` (null for a new folder) can sit in `parent`: not inside itself, and no deeper than
   * FOLDER_DEPTH_MAX with everything under it. Read from the owner's whole tree, in the same
   * transaction as the write, so two moves at once can't make a loop.
   */
  function placeProblem(tree: FolderRow[], id: string | null, parent: string | null) {
    const byId = new Map(tree.map((f) => [f.id, f]));
    let depth = 0;
    for (let at = parent; at !== null; at = byId.get(at)?.parent ?? null) {
      if (at === id) return "a folder can't go inside itself";
      if (++depth > FOLDER_DEPTH_MAX) break;
    }
    const height = (of: string | null): number =>
      of === null
        ? 1
        : 1 + Math.max(0, ...tree.filter((f) => f.parent === of).map((f) => height(f.id)));
    return depth + height(id) > FOLDER_DEPTH_MAX
      ? `folders go ${FOLDER_DEPTH_MAX} deep at most`
      : null;
  }

  app.get('/api/v1/folders', async (c) => {
    const subject = await gate.subjectOf(c);
    const rows = subject ? await store.folder.list(subject) : [];
    return ok(c, { folders: rows.map(folderItem) });
  });

  app.post('/api/v1/folders', async (c) => {
    const body = await jsonBody(c);
    if (!body) return fail(c, 'bad_input', 'the body must be a JSON object');
    if (body.name === undefined) return fail(c, 'bad_input', 'a folder needs a name');
    const wrong = folderFields(body);
    if (wrong) return fail(c, 'bad_input', wrong);
    const parent = (folderOf(body.parent) as string | null | undefined) ?? null;
    const known = await gate.subjectOf(c);
    if (parent && !(await ownFolder(known, parent))) return noFolder(c, parent);
    const refused = await cannotWrite(c);
    if (refused) return refused;
    const subject = known ?? (await gate.openAnonymous(c));
    const { credential } = await gate.callerOf(c);
    const at = iso();
    const out = await store.tx(async (): Promise<Placed> => {
      const tree = await store.folder.list(subject);
      if (tree.length >= FOLDERS_MAX) {
        return { problem: `You have ${FOLDERS_MAX} folders, the most this holds.` };
      }
      if (parent && !tree.some((f) => f.id === parent)) return { gone: parent };
      const problem = placeProblem(tree, null, parent);
      if (problem) return { problem };
      const row: FolderRow = {
        id: idOf('fld'),
        owner: subject,
        name: (body.name as string).trim(),
        parent,
        position:
          (body.position as number | undefined) ??
          (await store.folder.nextPosition(subject, parent)),
        credential,
        created_at: at,
        updated_at: at,
      };
      await store.folder.insert(row);
      return { row };
    });
    if ('gone' in out) return noFolder(c, out.gone);
    if ('problem' in out) return fail(c, 'bad_input', out.problem);
    return ok(c, { folder: folderItem(out.row) }, 201);
  });

  app.patch('/api/v1/folders/:id', async (c) => {
    const id = c.req.param('id');
    const body = await jsonBody(c);
    if (!body) return fail(c, 'bad_input', 'the body must be a JSON object');
    const wrong = folderFields(body);
    if (wrong) return fail(c, 'bad_input', wrong);
    const refused = await cannotWrite(c);
    if (refused) return refused;
    const subject = await gate.subjectOf(c);
    if (!(await ownFolder(subject, id)) || !subject) return noFolder(c, id);
    const asked = folderOf(body.parent) as string | null | undefined;
    const out = await store.tx(async (): Promise<Placed> => {
      const tree = await store.folder.list(subject);
      const known = tree.find((f) => f.id === id);
      if (!known) return { gone: id };
      const parent = asked === undefined ? known.parent : asked;
      const moved = parent !== known.parent;
      if (moved) {
        if (parent && !tree.some((f) => f.id === parent)) return { gone: parent };
        const problem = placeProblem(tree, id, parent);
        if (problem) return { problem };
      }
      const row = {
        name: typeof body.name === 'string' ? body.name.trim() : known.name,
        parent,
        position:
          (body.position as number | undefined) ??
          (moved ? await store.folder.nextPosition(subject, parent) : known.position),
        updated_at: iso(),
      };
      await store.folder.update(id, row);
      return { row: { ...known, ...row } };
    });
    if ('gone' in out) return noFolder(c, out.gone);
    if ('problem' in out) return fail(c, 'bad_input', out.problem);
    return ok(c, { folder: folderItem(out.row) });
  });

  // Nothing in it is deleted: its folders and conversations move up to where it was.
  app.delete('/api/v1/folders/:id', async (c) => {
    const id = c.req.param('id');
    const subject = await gate.subjectOf(c);
    if (!subject || !FOLDER_ID.test(id) || !(await store.folder.delete(id, subject))) {
      return noFolder(c, id);
    }
    return ok(c, { ok: true });
  });

  // ---------------------------------------------------------------------------------------------
  // Following

  const followItem = async (f: FollowRow) => ({
    id: f.id,
    kind: f.kind,
    ref: f.ref,
    label: f.label,
    spec_sha256: f.spec_sha256,
    short_url: f.spec_sha256 ? ((await shape(f.spec_sha256))?.short_url ?? null) : null,
    created_at: f.created_at,
    updated_at: f.updated_at,
  });

  const noFollow = (c: Context, id: string) => fail(c, 'not_found', `no follow ${id}`);

  /** Null when it's fine, else what's wrong with it. Undefined means leave it. */
  function followFields(body: Record<string, unknown>): string | null {
    if (body.label !== undefined && body.label !== null) {
      if (typeof body.label !== 'string' || body.label.length > LABEL_MAX) {
        return `label must be text, up to ${LABEL_MAX} characters`;
      }
    }
    if (body.spec_sha256 !== undefined && body.spec_sha256 !== null) {
      if (typeof body.spec_sha256 !== 'string' || !SHA256.test(body.spec_sha256)) {
        return 'spec_sha256 must be a SHA-256';
      }
    }
    return null;
  }

  const ownFollow = async (subject: string | null, id: string) => {
    if (!subject || !FOLLOW_ID.test(id)) return null;
    const row = await store.follow.get(id);
    return row?.owner === subject ? row : null;
  };

  /**
   * A change, and what search held for it goes. A later search can't be left to notice by time: a change
   * in the millisecond it last looked would read as no change.
   */
  async function saveFollow(
    known: FollowRow,
    row: Pick<FollowRow, 'label' | 'spec_sha256' | 'updated_at'>,
  ) {
    await store.tx(async () => {
      await store.follow.update(known.id, row);
      await store.search.forget(known.owner, 'follow', known.id);
    });
  }

  app.get('/api/v1/follows', async (c) => {
    const subject = await gate.subjectOf(c);
    const rows = subject ? await store.follow.list(subject, limitOf(c, LIST_MAX)) : [];
    return ok(c, { follows: await Promise.all(rows.map(followItem)) });
  });

  app.post('/api/v1/follows', async (c) => {
    const body = await jsonBody(c);
    if (!body) return fail(c, 'bad_input', 'the body must be a JSON object');
    const kind = followKind(body.ref);
    if (!kind) {
      return fail(
        c,
        'bad_input',
        'ref must be an account, as near:mainnet:alice.near or eip155:1:0xabc…, or network:<target_key>',
      );
    }
    const wrong = followFields(body);
    if (wrong) return fail(c, 'bad_input', wrong);
    const refused = await cannotWrite(c);
    if (refused) return refused;
    const subject = (await gate.subjectOf(c)) ?? (await gate.openAnonymous(c));
    const { credential } = await gate.callerOf(c);
    const ref = body.ref as string;
    const at = iso();
    const label = (body.label as string | null | undefined) ?? null;
    const sha = (body.spec_sha256 as string | null | undefined) ?? null;
    const known = await store.follow.byRef(subject, ref);
    if (known) {
      // following again keeps the row, and takes anything new it was told
      const row = {
        label: label ?? known.label,
        spec_sha256: sha ?? known.spec_sha256,
        updated_at: at,
      };
      await saveFollow(known, row);
      return ok(c, { follow: await followItem({ ...known, ...row }) });
    }
    if ((await store.follow.count(subject)) >= FOLLOWS_MAX) {
      return fail(c, 'bad_input', `You are following ${FOLLOWS_MAX} things, the most this holds.`);
    }
    const row: FollowRow = {
      id: idOf('flw'),
      owner: subject,
      kind,
      ref,
      label,
      spec_sha256: sha,
      credential,
      created_at: at,
      updated_at: at,
    };
    await store.follow.insert(row);
    return ok(c, { follow: await followItem(row) }, 201);
  });

  app.get('/api/v1/follows/:id', async (c) => {
    const id = c.req.param('id');
    const row = await ownFollow(await gate.subjectOf(c), id);
    if (!row) return noFollow(c, id);
    return ok(c, {
      follow: await followItem(row),
      current: row.spec_sha256 ? await shape(row.spec_sha256) : null,
    });
  });

  app.patch('/api/v1/follows/:id', async (c) => {
    const id = c.req.param('id');
    const body = await jsonBody(c);
    if (!body) return fail(c, 'bad_input', 'the body must be a JSON object');
    const wrong = followFields(body);
    if (wrong) return fail(c, 'bad_input', wrong);
    const refused = await cannotWrite(c);
    if (refused) return refused;
    const known = await ownFollow(await gate.subjectOf(c), id);
    if (!known) return noFollow(c, id);
    const row = {
      label: body.label === undefined ? known.label : (body.label as string | null),
      spec_sha256:
        body.spec_sha256 === undefined ? known.spec_sha256 : (body.spec_sha256 as string | null),
      updated_at: iso(),
    };
    await saveFollow(known, row);
    return ok(c, { follow: await followItem({ ...known, ...row }) });
  });

  // Its notes stay: they're about the address, which is still there.
  app.delete('/api/v1/follows/:id', async (c) => {
    const id = c.req.param('id');
    const known = await ownFollow(await gate.subjectOf(c), id);
    if (!known) return noFollow(c, id);
    await store.tx(async () => {
      await store.follow.delete(known.id);
      await store.search.forget(known.owner, 'follow', known.id);
    });
    return ok(c, { ok: true });
  });

  // ---------------------------------------------------------------------------------------------
  // Notes

  const noteItem = (n: WorkspaceNoteRow) => ({
    id: n.id,
    author: n.author,
    about: n.about,
    text: n.text,
    evidence: JSON.parse(n.evidence) as object[],
    created_at: n.created_at,
    updated_at: n.updated_at,
  });

  const noNote = (c: Context, id: string) => fail(c, 'not_found', `no note ${id}`);

  /** What a note can be about. A conversation has to be theirs; anything else is public or a pointer. */
  async function aboutProblem(
    subject: string | null,
    about: unknown,
  ): Promise<string | null | 'not_found'> {
    if (typeof about !== 'string' || !about || about.length > REF_MAX) {
      return 'about must name what the note is about';
    }
    const conversation = /^conversation:(.+)$/.exec(about)?.[1];
    if (conversation) {
      if (!subject || !(await ownRun(subject, conversation))) {
        const row = EXPLORATION_ID.test(conversation)
          ? await store.exploration.get(conversation)
          : null;
        if (!subject || row?.owner !== subject) return 'not_found';
      }
      return null;
    }
    if (about.startsWith('spec:')) {
      return SHA256.test(about.slice(5)) ? null : 'spec: must be followed by a SHA-256';
    }
    if (/^network:[^\s]/.test(about)) return null;
    const ns = parseRef(about)?.ns;
    return ns === 'account' || ns === 'group'
      ? null
      : 'about must be conversation:<id>, spec:<sha256>, network:<target_key>, or an account or group ref';
  }

  const ownNote = async (subject: string | null, id: string) => {
    if (!subject || !NOTE_ID.test(id)) return null;
    const row = await store.workspaceNote.get(id);
    return row?.owner === subject ? row : null;
  };

  const textProblem = (text: unknown) =>
    typeof text !== 'string' || !text.trim() || text.length > NOTE_TEXT_MAX
      ? `text must be words, up to ${NOTE_TEXT_MAX} characters`
      : null;

  app.get('/api/v1/notes', async (c) => {
    const subject = await gate.subjectOf(c);
    const rows = subject
      ? await store.workspaceNote.list(subject, c.req.query('about') ?? null, limitOf(c))
      : [];
    return ok(c, { notes: rows.map(noteItem) });
  });

  app.post('/api/v1/notes', async (c) => {
    const body = await jsonBody(c);
    if (!body) return fail(c, 'bad_input', 'the body must be a JSON object');
    const wrongText = textProblem(body.text);
    if (wrongText) return fail(c, 'bad_input', wrongText);
    const parsed = evidenceOf(body.evidence);
    if ('problem' in parsed) return fail(c, 'bad_input', parsed.problem);
    const problem = await aboutProblem(await gate.subjectOf(c), body.about);
    if (problem === 'not_found') return fail(c, 'not_found', `no ${String(body.about)}`);
    if (problem) return fail(c, 'bad_input', problem);
    const refused = await cannotWrite(c);
    if (refused) return refused;
    const subject = (await gate.subjectOf(c)) ?? (await gate.openAnonymous(c));
    const { credential } = await gate.callerOf(c);
    if ((await store.workspaceNote.count(subject)) >= NOTES_MAX) {
      return fail(c, 'bad_input', `You have ${NOTES_MAX} notes, the most this holds.`);
    }
    const at = iso();
    const row: WorkspaceNoteRow = {
      id: idOf('nte'),
      owner: subject,
      author: 'owner',
      about: body.about as string,
      text: body.text as string,
      evidence: JSON.stringify(parsed.evidence),
      credential,
      created_at: at,
      updated_at: at,
    };
    await store.workspaceNote.insert(row);
    return ok(c, { note: noteItem(row) }, 201);
  });

  app.patch('/api/v1/notes/:id', async (c) => {
    const id = c.req.param('id');
    const body = await jsonBody(c);
    if (!body) return fail(c, 'bad_input', 'the body must be a JSON object');
    if (body.text !== undefined) {
      const wrong = textProblem(body.text);
      if (wrong) return fail(c, 'bad_input', wrong);
    }
    const parsed = body.evidence === undefined ? null : evidenceOf(body.evidence);
    if (parsed && 'problem' in parsed) return fail(c, 'bad_input', parsed.problem);
    const refused = await cannotWrite(c);
    if (refused) return refused;
    const known = await ownNote(await gate.subjectOf(c), id);
    if (!known) return noNote(c, id);
    const row = {
      text: (body.text as string | undefined) ?? known.text,
      evidence: parsed ? JSON.stringify(parsed.evidence) : known.evidence,
      updated_at: iso(),
    };
    await store.tx(async () => {
      await store.workspaceNote.update(known.id, row);
      // as for a follow: a change in the millisecond search last looked would read as no change
      await store.search.forget(known.owner, 'note', known.id);
    });
    return ok(c, { note: noteItem({ ...known, ...row }) });
  });

  app.delete('/api/v1/notes/:id', async (c) => {
    const id = c.req.param('id');
    const known = await ownNote(await gate.subjectOf(c), id);
    if (!known) return noNote(c, id);
    await store.tx(async () => {
      await store.workspaceNote.delete(known.id);
      await store.search.forget(known.owner, 'note', known.id);
    });
    return ok(c, { ok: true });
  });

  // ---------------------------------------------------------------------------------------------
  // Search

  /** Indexes whatever changed for this owner. No write path has to know, and a deleted index rebuilds. */
  async function catchUp(owner: string) {
    await store.tx(async () => {
      for (const run of await store.search.staleRuns(owner)) {
        const messages = messagesOf(run.body);
        await store.search.put(
          {
            owner,
            kind: 'conversation',
            ref: run.id,
            title: run.title ?? firstQuestion(messages),
            about: null,
            at: run.updated_at,
          },
          messages
            .map((m) => m.content)
            .join('\n')
            .slice(0, INDEXED_CHARS_MAX),
        );
      }
      for (const e of await store.search.staleExplorations(owner)) {
        const about = `exploration:${e.id}`;
        await store.search.forgetAbout(owner, about);
        await store.search.put(
          {
            owner,
            kind: 'exploration',
            ref: e.id,
            title: e.title ?? e.question,
            about: null,
            at: e.updated_at,
          },
          null,
        );
        const noted = await store.note.list(e.id);
        if (!(await store.run.latestOfExploration(e.id))) {
          await store.search.put(
            {
              owner,
              kind: 'conversation',
              ref: e.id,
              title: (e.title ?? e.question).slice(0, TITLE_MAX),
              about,
              at: e.updated_at,
            },
            e.question,
          );
        }
        for (const s of await store.step.list(e.id)) {
          const at = s.spec_sha256 ? await shape(s.spec_sha256) : null;
          if (!at) continue;
          const network = at.network as { id?: string; title?: string } | null;
          await store.search.put(
            {
              owner,
              kind: 'shape',
              ref: at.spec_sha256,
              title: network?.title ?? at.target ?? at.spec_sha256,
              about,
              at: s.at,
            },
            [e.question, at.target, network?.title, s.note].filter(Boolean).join('\n'),
          );
        }
        for (const n of noted) {
          await store.search.put(
            {
              owner,
              kind: 'note',
              ref: `${e.id}/${n.seq}`,
              title: e.question.slice(0, TITLE_MAX),
              about,
              at: n.at,
            },
            n.text,
          );
        }
      }
      for (const f of await store.search.staleFollows(owner)) {
        await store.search.put(
          {
            owner,
            kind: 'follow',
            ref: f.id,
            title: f.label ?? f.ref,
            about: f.ref,
            at: f.updated_at,
          },
          [f.label, f.ref].filter(Boolean).join('\n'),
        );
      }
      for (const n of await store.search.staleNotes(owner)) {
        await store.search.put(
          {
            owner,
            kind: 'note',
            ref: n.id,
            title: n.text.slice(0, TITLE_MAX),
            about: n.about,
            at: n.updated_at,
          },
          // what it's about too, so looking up an address finds what was said about it
          `${n.text}\n${n.about}`,
        );
      }
    });
  }

  app.get('/api/v1/search', async (c) => {
    const q = c.req.query('q') ?? '';
    if (q.length > QUERY_MAX) {
      return fail(c, 'bad_input', `q is too long (${QUERY_MAX} characters at most)`);
    }
    const asked = c.req.query('kinds');
    const kinds = asked ? asked.split(',') : [...SEARCH_KINDS];
    if (!kinds.every((k) => (SEARCH_KINDS as readonly string[]).includes(k))) {
      return fail(c, 'bad_input', `kinds must be some of ${SEARCH_KINDS.join(', ')}`);
    }
    const subject = await gate.subjectOf(c);
    const words = searchWords(q);
    if (!subject || !words) return ok(c, { results: [] });
    const wait = searches(clientAddress(c, local));
    if (wait !== null) {
      return fail(c, 'rate_limited', 'Too many searches from one address.', undefined, wait);
    }
    await catchUp(subject);
    const results = (await store.search.query(subject, words, kinds, limitOf(c, 30))).map((h) => ({
      kind: h.kind,
      id: h.ref,
      title: h.title,
      about: h.about,
      snippet: snippetParts(h.snippet),
      at: h.at,
    }));
    return ok(c, { results });
  });

  return app;
}
