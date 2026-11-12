// keep_data and list_data (#98; CONNECTORS, 11 Nov: so people's agents can keep what they find): any Petals
// document an agent found or made (a reading, a mark, a value, proposals, vesting, a claim), kept private to the person's
// project, named by its canonical sha256, until a review takes it to the shared map. Checked by its own format as
// the person's own project checks it, so a claim may name a person there. A claim goes to the project's
// annotations, as add_annotation keeps it; a reading to the store, so propose_spec draws it; the rest to
// project_data (30). Anyone writing to the project may keep: its owner's session or a link to it.
import { canonicalJson, sha256Hex } from '@petal/core';
import type { Claim, Snapshot } from '@petal/core/types';
import { defineTool } from '../define.ts';
import { ToolFailure } from '../errors.ts';
import { projectProblems } from '../mapping-load.ts';
import { layerOwnerOf } from './datasets.ts';
import {
  credentialOf,
  lastingStore,
  open,
  READS,
  REF,
  touched,
  WRITES,
  writable,
} from './explorations.ts';
import { DATETIME, obj } from './shared.ts';

const formatOf = (petal: string) => petal.split('/')[0] as string;

/** What a document is about, where it says: a map's address, an account, a reading's network. */
function aboutOf(d: Record<string, unknown>): string | null {
  if (typeof d.about === 'string') return d.about;
  if (typeof d.subject === 'string') return d.subject;
  const n = (d.network as { id?: unknown } | undefined)?.id;
  return typeof n === 'string' ? n : null;
}

export const keepData = defineTool<
  { exploration: string; document: Record<string, unknown> },
  object
>({
  name: 'keep_data',
  title: 'Keep a document in the project',
  description:
    "Keep a Petals document you found or made in the person's project, privately: a reading (snapshot/v1), a " +
    "map's mark, value, proposals or vesting, or a claim. It's checked by its own format, as the person's own project " +
    'checks it, named by the SHA-256 of its canonical JSON, and kept once. It reaches the shared map only after a ' +
    'review. A reading can then be drawn: propose_spec with its network.id and this sha256.',
  input: obj(
    ['exploration', 'document'],
    {
      exploration: REF,
      document: { type: 'object', description: 'a Petals document, with its petal' },
    },
    { additionalProperties: false },
  ),
  output: obj(['exploration', 'sha256', 'petal', 'kept'], {
    exploration: { type: 'string' },
    sha256: { type: 'string', pattern: '^[0-9a-f]{64}$' },
    petal: { type: 'string' },
    kept: { type: 'boolean', description: 'false: the project held it already' },
  }),
  annotations: WRITES,
  async run({ exploration, document }, ctx) {
    const store = lastingStore(ctx);
    const o = await open(ctx, exploration);
    writable(o);
    const petal = typeof document.petal === 'string' ? document.petal : '';
    const why = projectProblems(document);
    if (why.length)
      throw new ToolFailure(
        'bad_input',
        `That isn't a valid ${petal || 'Petals document'}: ${why.join('; ')}.`,
        'validate_data says what else is off.',
      );
    const sha256 = sha256Hex(canonicalJson(document));
    const owner = layerOwnerOf(o.row);
    const at = ctx.now().toISOString();
    let kept: boolean;
    if (formatOf(petal) === 'claim') {
      const c = document as unknown as Claim;
      kept =
        (await store.annotation.add([
          {
            owner,
            id: c.id,
            exploration: o.row.id,
            subject: c.subject,
            verb: c.verb,
            kind: c.kind,
            body: JSON.stringify(c),
            credential: credentialOf(ctx, o),
            created_at: at,
            place: 0,
          },
        ])) === 1;
    } else {
      if (formatOf(petal) === 'snapshot') await ctx.store.put(document as unknown as Snapshot);
      kept = await store.projectData.keep({
        owner,
        exploration: o.row.id,
        sha256,
        petal,
        about: aboutOf(document),
        body: JSON.stringify(document),
        kept_at: at,
      });
    }
    touched(ctx, o.row.id, 'keep_data');
    return { exploration: o.row.id, sha256, petal, kept };
  },
});

export const listData = defineTool<{ exploration: string; petal?: string }, object>({
  name: 'list_data',
  title: "List the project's documents",
  description:
    "The documents kept in the person's project with keep_data, oldest first: readings, marks, values and " +
    'proposals, by their sha256 (claims are listed by list_annotations). petal narrows them to one format, e.g. ' +
    'mark or proposals/v2. Any link to the project can read them.',
  input: obj(
    ['exploration'],
    { exploration: REF, petal: { type: 'string', minLength: 1, maxLength: 40 } },
    { additionalProperties: false },
  ),
  output: obj(['exploration', 'data'], {
    exploration: { type: 'string' },
    data: {
      type: 'array',
      items: obj(['sha256', 'petal', 'about', 'kept_at'], {
        sha256: { type: 'string' },
        petal: { type: 'string' },
        about: { type: ['string', 'null'] },
        kept_at: DATETIME,
      }),
    },
  }),
  annotations: READS,
  async run({ exploration, petal }, ctx) {
    const o = await open(ctx, exploration);
    const rows = await lastingStore(ctx).projectData.list(layerOwnerOf(o.row), o.row.id, petal);
    return {
      exploration: o.row.id,
      data: rows.map((r) => ({
        sha256: r.sha256,
        petal: r.petal,
        about: r.about,
        kept_at: r.kept_at,
      })),
    };
  },
});
