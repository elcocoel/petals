// The brain's doors (specs/005-mapping-brain/brain.md): what the agent knows how to do, served from the
// repo's brain/ as the service holds it, with the commit it came from. They read nothing outside and call
// no model, so every site answers them, a public one included (TGT-030).
//   brain_route   the best three chapters or recipes for a question, the calls a contract answers, or both
//   brain_file    one of them, whole, by its id
//   brain_index   every header
import { join } from 'node:path';
import { brainAt, routeBrain } from '../brain.ts';
import { defineTool } from '../define.ts';
import { ToolFailure } from '../errors.ts';
import type { ToolContext } from '../types.ts';
import { obj } from './shared.ts';

const READS = { readOnlyHint: true, idempotentHint: true, openWorldHint: false };
const COMMIT = { type: ['string', 'null'], description: 'the brain commit this answer comes from' };

/** The brain this site serves: PETAL_BRAIN_DIR (a copy of the repo that follows main), else its own. */
export const brainOf = (ctx: ToolContext) =>
  brainAt(ctx.config.brainDir ?? join(ctx.config.root, 'brain')).current();

const ROUTE = obj(['id', 'kind', 'department', 'for', 'file', 'status', 'why', 'score'], {
  id: { type: 'string' },
  kind: { type: 'string', enum: ['department', 'chapter', 'recipe'] },
  department: { type: ['string', 'null'] },
  for: { type: 'string' },
  file: { type: 'string' },
  status: { type: 'string', enum: ['ready', 'partial'] },
  why: { type: 'string' },
  score: { type: 'number' },
});

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
  output: obj(['commit', 'routes'], { commit: COMMIT, routes: { type: 'array', items: ROUTE } }),
  annotations: READS,
  async run({ question, answers }, ctx) {
    if (!question?.trim() && !answers?.length) {
      throw new ToolFailure('bad_input', 'Give a question, the calls a contract answers, or both.');
    }
    const b = brainOf(ctx);
    return {
      commit: b.commit,
      routes: routeBrain(b.index, {
        ...(question ? { words: question } : {}),
        ...(answers ? { answers } : {}),
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
  output: obj(['commit', 'id', 'kind', 'file', 'text'], {
    commit: COMMIT,
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
    return { commit: b.commit, id, kind: e.kind, file: e.file, text };
  },
});

export const brainIndexTool = defineTool<Record<string, never>, object>({
  name: 'brain_index',
  title: "List Petals' chapters",
  description:
    "Every department, chapter and recipe Petals' brain holds: what each is for, its department and what it answers to.",
  input: obj([], {}, { additionalProperties: false }),
  output: obj(['commit', 'index'], { commit: COMMIT, index: { type: 'object' } }),
  annotations: READS,
  async run(_i, ctx) {
    const b = brainOf(ctx);
    return { commit: b.commit, index: b.index };
  },
});
