// add_layer and compose_view (specs/005-mapping-brain, data.md and seam.md). An agent's own
// gathering becomes a layer, named by its hash and kept with the person's readings. compose_view
// makes one reading of a reader's snapshot and other layers, so a flower can take its size from one
// and its height from another. Both run on the person's side: what they keep is the person's.
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  type Added,
  canonicalJson,
  checkLayer,
  composeView,
  type Layer,
  LayerError,
  layerHash,
} from '@petal/core';
import { defineTool } from '../define.ts';
import { stateDirOf } from '../drafts.ts';
import { ToolFailure } from '../errors.ts';
import type { ToolContext } from '../types.ts';
import { findSnapshot, loadSnapshot, measuresIn, obj, SHA256 } from './shared.ts';

const SHA = /^[0-9a-f]{64}$/;
const layersDir = (ctx: ToolContext) => join(stateDirOf(ctx.config), 'layers');

async function readLayer(ctx: ToolContext, hash: string): Promise<Layer | null> {
  const file = join(layersDir(ctx), `${hash}.json`);
  if (!existsSync(file)) return null;
  const layer = checkLayer(JSON.parse(await readFile(file, 'utf8')));
  // named by what it holds: a file that no longer matches its name isn't that layer
  return layerHash(layer) === hash ? layer : null;
}

const badLayer = (e: unknown): never => {
  if (e instanceof LayerError)
    throw new ToolFailure(
      'bad_input',
      `This isn't a layer yet: ${e.message}.`,
      "See add_layer's input schema.",
    );
  throw e;
};

const LAYER_INPUT = obj(
  ['petal', 'about', 'kind', 'measures', 'rows', 'how', 'from', 'when', 'standing'],
  {
    petal: { const: 'layer/v1' },
    about: {
      type: 'string',
      description: 'the investigated address as chain:address, e.g. eip155:100:0xf02f…',
    },
    kind: { const: 'measures' },
    measures: {
      type: 'array',
      minItems: 1,
      items: obj(['name', 'unit', 'kind'], {
        name: { type: 'string', description: 'lowercase_with_underscores, e.g. proposals_written' },
        unit: { type: 'string' },
        kind: { enum: ['amount', 'count', 'share', 'category', 'flag'] },
        label: { type: 'string' },
      }),
    },
    rows: {
      type: 'array',
      minItems: 1,
      items: obj(['participant', 'measure', 'value'], {
        participant: {
          type: 'string',
          description: "an address as the reading you're adding to names it",
        },
        measure: { type: 'string' },
        value: { type: 'string', description: 'a number as text for amount, count and share' },
      }),
    },
    how: obj(['method', 'sources'], {
      method: { type: 'string', description: 'how you made it, in a sentence anyone could repeat' },
      sources: {
        type: 'array',
        items: obj(['url'], { url: { type: 'string' }, note: { type: 'string' } }),
      },
      recipe: SHA256,
    }),
    from: { type: 'array', items: SHA256, description: 'the layers or readings this was built on' },
    when: obj(['as_of'], { as_of: { type: 'string' }, block_height: { type: 'integer' } }),
    standing: {
      enum: ['verified', 'inferred', 'lead'],
      description:
        'verified: read from the chain, and anyone can read it again; inferred: a step beyond a read; lead: a direction, never a fact',
    },
  },
);

export const addLayer = defineTool<{ layer: unknown }, object>({
  name: 'add_layer',
  title: 'Keep a layer you gathered',
  description:
    "Keep a set of facts you gathered about an address's participants, such as proposals written per member counted from the chain's events, as a layer: named by its hash, never changed after. Then compose_view adds it to a reading so a flower can show it. Say how you made it, what you read and its standing. It stays on this computer.",
  input: obj(['layer'], { layer: LAYER_INPUT }),
  accepts: obj(['layer'], { layer: { type: 'object' } }),
  output: obj(['hash', 'about', 'measures', 'rows'], {
    hash: SHA256,
    about: { type: 'string' },
    measures: { type: 'array', items: { type: 'object' } },
    rows: { type: 'integer' },
    existed: { type: 'boolean' },
  }),
  annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
  onTheirMachine: true,
  async run({ layer }, ctx) {
    let l: Layer;
    try {
      l = checkLayer(layer);
    } catch (e) {
      return badLayer(e);
    }
    const hash = layerHash(l);
    const file = join(layersDir(ctx), `${hash}.json`);
    const existed = existsSync(file);
    if (!existed) {
      await mkdir(layersDir(ctx), { recursive: true });
      await writeFile(file, canonicalJson(l));
    }
    return { hash, about: l.about, measures: l.measures, rows: l.rows.length, existed };
  },
});

export const composeViewTool = defineTool<{ base: string; layers: string[] }, object>({
  name: 'compose_view',
  title: 'One reading from several layers',
  description:
    "Make one reading from a reader's snapshot (base) and other layers: a layer from add_layer, or another reading of the same address. Each measure keeps its name and its source. Then draw it as any reading: propose_spec with its sha256 and, for example, height m:proposals_written. A measure name may come from one layer only.",
  input: obj(['base', 'layers'], {
    base: { ...SHA256, description: 'the sha256 of the reading the flower is of' },
    layers: { type: 'array', minItems: 1, maxItems: 8, items: SHA256 },
  }),
  output: obj(['sha256', 'network', 'measures', 'layers'], {
    sha256: SHA256,
    network: { type: 'string' },
    measures: { type: 'array', items: { type: 'object' } },
    layers: { type: 'array', items: { type: 'object' } },
  }),
  annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
  onTheirMachine: true,
  async run({ base, layers }, ctx) {
    const s = await loadSnapshot(ctx, base);
    const added: Added[] = [];
    for (const hash of layers) {
      if (!SHA.test(hash)) throw new ToolFailure('bad_input', `${hash} is not a sha256.`);
      const layer = await readLayer(ctx, hash);
      if (layer) {
        added.push({ hash, layer });
        continue;
      }
      const snapshot = await findSnapshot(ctx, hash);
      if (!snapshot)
        throw new ToolFailure(
          'not_found',
          `No layer or reading ${hash} here.`,
          'Keep it first: add_layer for your own gathering, get_snapshot for a reading.',
        );
      added.push({ hash, snapshot });
    }
    let view: ReturnType<typeof composeView>;
    try {
      view = composeView(s, added);
    } catch (e) {
      return badLayer(e);
    }
    const { sha256 } = await ctx.store.put(view);
    return {
      sha256,
      network: view.network.id,
      measures: measuresIn(view),
      layers: [
        { hash: base, as: 'base' },
        ...added.map((a) => ({
          hash: a.hash,
          as: 'layer' in a ? `layer (${a.layer.standing})` : 'reading',
        })),
      ],
    };
  },
});
