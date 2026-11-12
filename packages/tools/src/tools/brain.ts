// The brain's doors (specs/005-mapping-brain/brain.md): what the agent knows how to do, served from the
// repo's brain/ as the service holds it, with the commit it came from. They read nothing outside and call
// no model, so every site answers them, a public one included (TGT-030).
//   brain_route   the best three chapters or recipes for a question, the calls a contract answers, or both
//   brain_file    one of them, whole, by its id
//   brain_index   every header
//   brain_context the doctrine and the routed files, whole, in one call (the Harness's query_brain, 12 Nov)
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { type BrainCopy, type BrainReceipt, brainAt, routeBrain, wordsOf } from '../brain.ts';
import { defineTool } from '../define.ts';
import { ToolFailure } from '../errors.ts';
import type { ToolContext } from '../types.ts';
import { obj } from './shared.ts';

const READS = { readOnlyHint: true, idempotentHint: true, openWorldHint: false };
const COMMIT = { type: ['string', 'null'], description: 'the brain commit this answer comes from' };
const RECEIPT = {
  type: ['string', 'null'],
  description: "this serving's receipt (brain-receipt/v1), or null where nothing keeps one",
};

/**
 * Keep a receipt for what a door served (research/brain-departments-2026-11-11.md, step 5), the moment it
 * answers, and say its id; null where the context keeps none (a terminal's built-in copy, a test).
 */
async function receipt(
  ctx: ToolContext,
  b: BrainCopy,
  served: Pick<
    BrainReceipt,
    'keywords' | 'matched_entries' | 'served_docs' | 'chars_served' | 'core_doctrine'
  >,
): Promise<string | null> {
  if (!ctx.onBrainServed) return null;
  const subject = ctx.caller?.subject ?? null;
  const r: BrainReceipt = {
    petal: 'brain-receipt/v1',
    id: `brc_${randomBytes(8).toString('hex')}`,
    at: ctx.now().toISOString(),
    version: b.version,
    ...served,
    doc_count: served.served_docs.length,
    client_id: ctx.caller?.door ?? null,
    client_label: ctx.caller?.client ?? null,
    consumer_context: subject ? { subject } : null,
  };
  await ctx.onBrainServed(r);
  return r.id;
}

/** The brain this site serves: PETAL_BRAIN_DIR (a copy of the repo that follows main), else its own. */
export const brainOf = (ctx: ToolContext) =>
  brainAt(ctx.config.brainDir ?? join(ctx.config.root, 'brain')).current();

const ROUTE = obj(['id', 'kind', 'department', 'task', 'for', 'file', 'status', 'why', 'score'], {
  id: { type: 'string' },
  kind: { type: 'string', enum: ['department', 'chapter', 'recipe'] },
  department: { type: ['string', 'null'] },
  for: { type: 'string' },
  file: { type: 'string' },
  task: { type: ['string', 'null'] },
  status: { type: 'string', enum: ['ready', 'partial'] },
  why: { type: 'string' },
  score: { type: 'number' },
});

/** What fired for these routes: the routing table's rows, then the departments reached, each once. */
const matchedOf = (routes: readonly { task: string | null; department: string | null }[]) => [
  ...new Set([
    ...routes.flatMap((r) => (r.task ? [`task: ${r.task}`] : [])),
    ...routes.flatMap((r) => (r.department ? [`department: ${r.department}`] : [])),
  ]),
];

export const brainRoute = defineTool<{ question?: string; answers?: string[] }, object>({
  name: 'brain_route',
  title: 'Find the chapter for this',
  description:
    "Which of Petals' chapters or recipes fits: give the person's question in words, or the calls a contract answers (from identify), or both. Returns the best three with why each matched; read the one that fits with brain_file. The doctrine always applies: read it first with brain_file('doctrine').",
  input: obj(
    [],
    {
      question: { type: 'string', minLength: 1, maxLength: 2000 },
      answers: {
        type: 'array',
        items: { type: 'string', minLength: 1, maxLength: 200 },
        maxItems: 100,
        description: 'the view calls a contract answered, such as sharesToken()',
      },
    },
    { additionalProperties: false },
  ),
  output: obj(['commit', 'routes', 'receipt'], {
    commit: COMMIT,
    routes: { type: 'array', items: ROUTE },
    receipt: RECEIPT,
  }),
  annotations: READS,
  async run({ question, answers }, ctx) {
    if (!question?.trim() && !answers?.length) {
      throw new ToolFailure('bad_input', 'Give a question, the calls a contract answers, or both.');
    }
    const b = brainOf(ctx);
    const routes = routeBrain(b.index, {
      ...(question ? { words: question } : {}),
      ...(answers ? { answers } : {}),
    });
    return {
      commit: b.commit,
      routes,
      receipt: await receipt(ctx, b, {
        keywords: [...wordsOf(question ?? ''), ...(answers ?? [])],
        matched_entries: matchedOf(routes),
        served_docs: routes.map((r) => r.id),
        chars_served: JSON.stringify(routes).length,
        core_doctrine: false,
      }),
    };
  },
});

export const brainFile = defineTool<{ id: string }, object>({
  name: 'brain_file',
  title: 'Read a chapter',
  description:
    "One of Petals' chapters, recipes or department hubs, whole, by its id (brain_route names them; 'doctrine' is the one read first).",
  input: obj(
    ['id'],
    { id: { type: 'string', minLength: 1, maxLength: 100 } },
    { additionalProperties: false },
  ),
  output: obj(['commit', 'id', 'kind', 'file', 'text', 'receipt'], {
    commit: COMMIT,
    receipt: RECEIPT,
    id: { type: 'string' },
    kind: { type: 'string', enum: ['doctrine', 'department', 'chapter', 'recipe'] },
    file: { type: 'string' },
    text: { type: 'string' },
  }),
  annotations: READS,
  async run({ id }, ctx) {
    const b = brainOf(ctx);
    const e = b.index.entries.find((x) => x.id === id);
    const text = b.texts.get(id);
    if (!e || text === undefined) {
      throw new ToolFailure(
        'not_found',
        `No chapter or recipe ${id}.`,
        'brain_route or brain_index names them.',
      );
    }
    return {
      commit: b.commit,
      id,
      kind: e.kind,
      file: e.file,
      text,
      receipt: await receipt(ctx, b, {
        keywords: [],
        matched_entries: e.department ? [`department: ${e.department}`] : [],
        served_docs: [id],
        chars_served: text.length,
        core_doctrine: id === 'doctrine',
      }),
    };
  },
});

export const brainIndexTool = defineTool<Record<string, never>, object>({
  name: 'brain_index',
  title: "List Petals' chapters",
  description:
    "Every department, chapter and recipe Petals' brain holds: what each is for, its department and what it answers to.",
  input: obj([], {}, { additionalProperties: false }),
  output: obj(['commit', 'index', 'receipt'], {
    commit: COMMIT,
    index: { type: 'object' },
    receipt: RECEIPT,
  }),
  annotations: READS,
  async run(_i, ctx) {
    const b = brainOf(ctx);
    return {
      commit: b.commit,
      index: b.index,
      receipt: await receipt(ctx, b, {
        keywords: [],
        matched_entries: [],
        served_docs: [],
        chars_served: JSON.stringify(b.index).length,
        core_doctrine: false,
      }),
    };
  },
});

/**
 * One call for what the brain says about a question (research/brain-departments-2026-11-11.md, step 6; the Harness's
 * query_brain): the doctrine, then the routed files whole, why each matched, the version and the receipt.
 */
export const brainContext = defineTool<{ question?: string; answers?: string[] }, object>({
  name: 'brain_context',
  title: 'Read what the brain says for this',
  description:
    "What Petals' brain says for a question, in one call: the doctrine, which every answer holds to, then the best three of its chapters, recipes or department hubs for the person's question in words, the calls a contract answers (from identify), or both, each whole with why it matched. Read it before answering, and follow the doctrine.",
  input: obj(
    [],
    {
      question: { type: 'string', minLength: 1, maxLength: 2000 },
      answers: {
        type: 'array',
        items: { type: 'string', minLength: 1, maxLength: 200 },
        maxItems: 100,
        description: 'the view calls a contract answered, such as sharesToken()',
      },
    },
    { additionalProperties: false },
  ),
  output: obj(['commit', 'version', 'doctrine', 'files', 'receipt'], {
    commit: COMMIT,
    version: { type: 'string', description: 'the brain version, <index hash>@<commit>' },
    doctrine: { type: 'string', description: 'the doctrine, whole: read first, always' },
    files: {
      type: 'array',
      items: obj(['id', 'kind', 'department', 'task', 'file', 'status', 'why', 'text'], {
        id: { type: 'string' },
        kind: { type: 'string', enum: ['department', 'chapter', 'recipe'] },
        department: { type: ['string', 'null'] },
        task: { type: ['string', 'null'] },
        file: { type: 'string' },
        status: { type: 'string', enum: ['ready', 'partial'] },
        why: { type: 'string' },
        text: { type: 'string' },
      }),
    },
    receipt: RECEIPT,
  }),
  annotations: READS,
  async run({ question, answers }, ctx) {
    if (!question?.trim() && !answers?.length) {
      throw new ToolFailure('bad_input', 'Give a question, the calls a contract answers, or both.');
    }
    const b = brainOf(ctx);
    const routes = routeBrain(b.index, {
      ...(question ? { words: question } : {}),
      ...(answers ? { answers } : {}),
    });
    const doctrine = b.texts.get('doctrine') ?? '';
    const files = routes.map((r) => ({
      id: r.id,
      kind: r.kind,
      department: r.department,
      task: r.task,
      file: r.file,
      status: r.status,
      why: r.why,
      text: b.texts.get(r.id) ?? '',
    }));
    return {
      commit: b.commit,
      version: b.version,
      doctrine,
      files,
      receipt: await receipt(ctx, b, {
        keywords: [...wordsOf(question ?? ''), ...(answers ?? [])],
        matched_entries: matchedOf(routes),
        served_docs: ['doctrine', ...files.map((f) => f.id)],
        chars_served: doctrine.length + files.reduce((n, f) => n + f.text.length, 0),
        core_doctrine: true,
      }),
    };
  },
});
