// Annotations: what a person or an agent adds about an account, beside what the chain says (Elco, 10 Nov:
// "the agent and the person can go CRAZY adding annotation, researching things deeply"; annotation-layer.md
// step 2). Each is a claim/v3 (a name, a note, a link, anything a claim can say), kept privately under the
// project's owner, with the project it was added in. Names are allowed here and nowhere published (people.ts,
// Elco's decision 1 (a)).
//   add_annotation    one or many, all or none; Petals fills each one's id and who answers for it
//   list_annotations  a project's, or everything the owner holds about one account
// Who answers for one (`by`) comes from the door, never from the writer: the signed-in person's account for
// their own session, and the agent's own name (`as`, as it joined) for an agent's link.
import { makeClaim, parseRef, validateClaim } from '@petal/core';
import type { Claim, ClaimDraft } from '@petal/core/types';
import type { AnnotationRow } from '@petal/store';
import { defineTool } from '../define.ts';
import { ToolFailure } from '../errors.ts';
import type { ToolContext } from '../types.ts';
import { layerOwnerOf } from './datasets.ts';
import {
  credentialOf,
  lastingStore,
  type Opened,
  open,
  READS,
  REF,
  touched,
  WRITES,
  writable,
} from './explorations.ts';
import { obj } from './shared.ts';

const AS = {
  type: 'string',
  minLength: 1,
  maxLength: 64,
  description: "Your own name, as you joined (e.g. codex). Needed on an agent's link.",
};
const ABOUT = {
  type: 'string',
  minLength: 3,
  maxLength: 300,
  description: 'The account, as a claim names it: eip155:100:0xabc…, near:mainnet:alice.near',
};
const DRAFT = obj(['subject', 'verb', 'object', 'kind', 'evidence'], {
  subject: { type: 'string', description: 'The account it is about: eip155:100:0xabc…' },
  verb: { type: 'string', description: 'named, noted, linked, or any claim verb' },
  object: { description: 'For named, noted and linked: {"value": "Dekan"}' },
  kind: { enum: ['declared', 'stated', 'sourced', 'inferred'] },
  evidence: {
    type: 'array',
    description:
      'What it rests on, one piece each: type (snapshot, tx, proposal, page, post, claim or note), and its field: url, tx (<caip2>:<hash>), proposal (proposal:<caip2>:<key>), snapshot_sha256, claim_id or note. For the open web: platform (x, github, discord, forum…), quote, retrieved_at, url_sha256 (the content hash) and archive_url (an archived copy). found_by and found_at say who found it and when; left out, they are you and now.',
  },
  method: { type: 'string', description: 'For inferred: name@version' },
  qualifiers: { type: 'object', description: 'For inferred: {"grounds": "research"}' },
  via: {
    type: 'string',
    description: 'The model or tool that produced it: model:<name>@<version>',
  },
  issued_at: { type: 'string', description: 'When it was said. Absent: now' },
});
const SHOWN = obj(['claim', 'exploration', 'added_at'], {
  claim: { type: 'object' },
  exploration: { type: 'string' },
  added_at: { type: 'string' },
});

/** A name as a claim ref can carry it: claude code → claude-code. */
const slug = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._/-]+/g, '-')
    .replace(/^[^a-z0-9]+|-+$/g, '');

/** Who answers for what this caller adds to this project, from the door it came by. */
function writerOf(o: Opened, ctx: ToolContext, as: string | undefined): string {
  if (o.link) {
    const name = as ? slug(as) : '';
    if (!name)
      throw new ToolFailure(
        'bad_input',
        "Say which agent you are with as, the name you joined with (e.g. codex): it's who answers for these.",
      );
    return `tool:${name}@1`;
  }
  const by = ctx.caller?.by;
  if (!by || !parseRef(by))
    throw new ToolFailure(
      'unauthorised',
      'Sign in with your wallet first: what a person adds names their account as who answers for it.',
    );
  return by;
}

/**
 * What a piece of evidence is, when its writer didn't say: the most particular thing it holds. A URL is a
 * page unless the writer says post.
 */
const ORDER = [
  ['snapshot', 'snapshot_sha256'],
  ['proposal', 'proposal'],
  ['tx', 'tx'],
  ['claim', 'claim_id'],
  ['page', 'url'],
  ['note', 'note'],
] as const;
function typed(e: unknown, by: string, at: string): unknown {
  if (!e || typeof e !== 'object' || Array.isArray(e)) return e;
  const o = e as Record<string, unknown>;
  const type = o.type ?? ORDER.find(([, field]) => o[field] !== undefined)?.[0];
  return { ...(type ? { type } : {}), found_by: by, found_at: at, ...o };
}

/**
 * Drafts (claims without id and by) as claim/v3s with `by` and the time filled in, each checked as kept in a
 * person's own project; or every reason, with a ToolFailure, so none is kept. Each piece of evidence that
 * doesn't say what it is, who found it or when is given its kind, the writer and the claim's time. One rule
 * for every door.
 */
export function annotationsOf(drafts: readonly unknown[], by: string, at: string): Claim[] {
  const claims: Claim[] = [];
  const refused: string[] = [];
  drafts.forEach((raw, i) => {
    const { id: _id, petal: _petal, by: given, ...draft } = (raw ?? {}) as Record<string, unknown>;
    if (given !== undefined && given !== by) {
      refused.push(`annotation ${i + 1}: by is filled by Petals (${by}), so leave it out`);
      return;
    }
    const when = typeof draft.issued_at === 'string' ? draft.issued_at : at;
    const evidence = Array.isArray(draft.evidence)
      ? draft.evidence.map((e) => typed(e, by, when))
      : draft.evidence;
    const claim = makeClaim(
      {
        issued_at: at,
        ...draft,
        ...(evidence !== undefined ? { evidence } : {}),
        by,
      } as ClaimDraft,
      'claim/v3',
    );
    const v = validateClaim(claim, { private: true });
    if (v.ok) claims.push(claim);
    else
      for (const e of v.errors) refused.push(`annotation ${i + 1}: ${e.path || '/'} ${e.message}`);
  });
  if (refused.length)
    throw new ToolFailure(
      'bad_input',
      `None was added: ${refused.slice(0, 10).join('; ')}${refused.length > 10 ? `; and ${refused.length - 10} more` : ''}.`,
      "Each is a claim without id and by: see add_annotation's input schema.",
    );
  return claims;
}

export const addAnnotation = defineTool<
  { exploration: string; annotations: unknown[]; as?: string },
  object
>({
  name: 'add_annotation',
  title: 'Add annotations to the project',
  description:
    "Add what you found or were told about accounts to the person's project, privately: a name (named), a note or research (noted), a link (linked), each with how it's known (stated, only in the person's own session; sourced or inferred, from an agent) and what it rests on. One or many at once, all or none. Petals fills each one's id and who answers for it. Use it as soon as you find who or what is behind an address, never only a file.",
  input: obj(['exploration', 'annotations'], {
    exploration: REF,
    annotations: { type: 'array', minItems: 1, items: DRAFT },
    as: AS,
  }),
  accepts: obj(['exploration', 'annotations'], {
    exploration: REF,
    annotations: { type: 'array', minItems: 1, items: { type: 'object' } },
    as: { type: 'string' },
  }),
  output: obj(['exploration', 'added', 'existed', 'ids'], {
    exploration: { type: 'string' },
    added: { type: 'integer' },
    existed: { type: 'integer' },
    ids: { type: 'array', items: { type: 'string' } },
  }),
  annotations: WRITES,
  async run({ exploration, annotations, as }, ctx) {
    const store = lastingStore(ctx);
    const o = await open(ctx, exploration);
    writable(o);
    const by = writerOf(o, ctx, as);
    const at = ctx.now().toISOString();
    const claims = annotationsOf(annotations, by, at);
    const owner = layerOwnerOf(o.row);
    const credential = credentialOf(ctx, o);
    const rows: AnnotationRow[] = claims.map((c, place) => ({
      owner,
      id: c.id,
      exploration: o.row.id,
      subject: c.subject,
      verb: c.verb,
      kind: c.kind,
      body: JSON.stringify(c),
      credential,
      created_at: at,
      place,
    }));
    const added = await store.annotation.add(rows);
    touched(ctx, o.row.id, 'add_annotation');
    return {
      exploration: o.row.id,
      added,
      existed: claims.length - added,
      ids: claims.map((c) => c.id),
    };
  },
});

export const listAnnotations = defineTool<{ exploration: string; about?: string }, object>({
  name: 'list_annotations',
  title: 'List the annotations',
  description:
    "What the person and their agents have added about accounts, oldest first: this project's, or, with about, everything the project's owner holds about that account, in any of their projects. Any link to the project can read them.",
  input: obj(['exploration'], { exploration: REF, about: ABOUT }, { additionalProperties: false }),
  output: obj(['exploration', 'annotations'], {
    exploration: { type: 'string' },
    annotations: { type: 'array', items: SHOWN },
  }),
  annotations: READS,
  async run({ exploration, about }, ctx) {
    const store = lastingStore(ctx);
    const o = await open(ctx, exploration);
    const rows = await store.annotation.list(
      layerOwnerOf(o.row),
      about ? { subject: about.trim() } : { exploration: o.row.id },
    );
    return {
      exploration: o.row.id,
      annotations: rows.map((r) => ({
        claim: JSON.parse(r.body) as Claim,
        exploration: r.exploration,
        added_at: r.created_at,
      })),
    };
  },
});
