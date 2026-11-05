// propose_spec's core (tools.md): start from default/v1 and the population's defaults, apply the
// agent's few choices, fill every standard meaning and source id, so the same choices give the
// same spec bytes. A choice that does not apply, or names a primitive this build cannot draw,
// is refused with bad_input (FR-032): nothing is imitated. With a `parent`, its recipe is the start
// and these choices go on top, so a variation changes only what it says it changes.
//
// Meanings and sources, first match wins:
//   meaning   input.meanings[primitive]  >  descriptor `<primitive>:<choice>`  >  descriptor
//             `<primitive>:<by>`  >  STANDARD_MEANINGS (with the measure's label)
//   sources   descriptor `<primitive>:<choice>`  >  `<primitive>:<by>`  >  the snapshot rows that
//             feed the primitive (holdings of the measure, participants, delegations)
import { BadInputError } from '../errors.ts';
import { specHash } from '../hash.ts';
import { drawable, primitive } from '../primitives.ts';
import { holdingMeasures, measureTable, participantsById } from '../tables.ts';
import type {
  Encoding,
  NetworkDescriptor,
  ProposeInput,
  Snapshot,
  SourceIds,
  Spec,
  SpecPrimitive,
} from '../types/index.ts';
import { DEFAULT_CHOICES, DEFAULT_CONVENTION } from './default.ts';
import { recipeOf } from './recipe.ts';
import { shape, standardMeaning } from './shape.ts';

/** Fields propose_spec accepts, in the order `changed` and `defaults` list them. */
const FIELDS = [
  'measure',
  'petals',
  'width',
  'height',
  'colour',
  'outline',
  'segments',
  'lines',
  'markings',
  'order',
] as const;
type Field = (typeof FIELDS)[number];

const ALLOWED: Partial<Record<Field, string[]>> = {
  width: ['r1.5', 'r2', 'r3', 'equal'],
  height: ['sqrt', 'linear', 'log', 'equal', 'm:<metric>'],
  colour: ['kind', 'identity', 'single'],
  outline: ['identity_status', 'none'],
  segments: ['none', 'backers'],
  lines: ['none'],
  markings: ['none'],
  order: ['measure_desc'],
};

const bad = (message: string, allowed?: string[], hint?: string) =>
  new BadInputError(message, {
    ...(allowed ? { allowed } : {}),
    hint: hint ?? (allowed ? `allowed: ${allowed.join(', ')}` : message),
  });

function uniqSorted(xs: Iterable<string>): string[] {
  return [...new Set(xs)].sort();
}

/** The snapshot rows that feed a primitive, as source ids. */
function derivedSources(field: SpecPrimitive, by: string, s: Snapshot, measure: string): string[] {
  const known = new Set(s.sources.map((x) => x.id));
  const table = measureTable(s, measure);
  const measureSources = table?.sources ?? [];
  const people = participantsById(s);
  const holders = (table?.rows ?? []).map((r) => people.get(r.id)).filter((p) => p !== undefined);
  let out: string[] = [];
  if (field === 'height' && by.startsWith('m:')) out = measureTable(s, by.slice(2))?.sources ?? [];
  else if (field === 'colour') out = uniqSorted(holders.map((p) => p.source));
  else if (field === 'outline')
    out = uniqSorted(
      holders.flatMap((p) =>
        p.identity && known.has(p.identity.source) ? [p.identity.source] : [],
      ),
    );
  else if (field === 'segments')
    out = uniqSorted(s.relationships.filter((r) => r.type === 'delegates_to').map((r) => r.source));
  else out = measureSources;
  if (out.length === 0) out = measureSources;
  if (out.length === 0 && s.sources[0]) out = [s.sources[0].id];
  return out;
}

/** A parent's recipe with the new choices and meanings on top. A parent's override of a primitive's
 * words stays only while that primitive's choice does. */
function onParent(input: ProposeInput, d: NetworkDescriptor) {
  const { parent } = input;
  if (!parent) {
    if (input.variation_of)
      throw bad(
        `variation_of ${input.variation_of} names a parent, but the parent itself was not passed, so its choices would be lost`,
        undefined,
        'Pass `parent`: the spec this one changes, as propose_spec returned it. Then send only the choices that change.',
      );
    return { choices: input.choices ?? {}, meanings: input.meanings, variationOf: null };
  }
  const variationOf = specHash(parent);
  if (input.variation_of && input.variation_of !== variationOf)
    throw bad(
      `variation_of ${input.variation_of} is not the hash of parent (${variationOf})`,
      undefined,
      'Pass the parent exactly as propose_spec returned it.',
    );
  if (parent.network.id !== d.id)
    throw bad(
      `the parent is a flower of ${parent.network.id}, not ${d.id}`,
      undefined,
      "To use a flower's recipe on another network, pass its recipe's choices and meanings, without a parent.",
    );
  const recipe = recipeOf(parent, d);
  const changed = Object.keys(input.choices ?? {});
  const kept = Object.entries(recipe.meanings ?? {}).filter(([k]) => !changed.includes(k));
  return {
    choices: { ...recipe.choices, ...input.choices },
    meanings: { ...Object.fromEntries(kept), ...input.meanings },
    variationOf,
  };
}

export function buildSpec(
  input: ProposeInput,
  descriptor: NetworkDescriptor,
  snapshot: Snapshot,
): { spec: Spec; changed: string[]; defaults: string[] } {
  if (input.network !== descriptor.id)
    throw bad(`network ${input.network} is not ${descriptor.id}`, [descriptor.id]);
  // One flower, one hash: the target comes from the snapshot it was drawn from, however the caller
  // wrote it or if they left it out, and a parameter at its default is the same as one left out.
  const params = Object.fromEntries(
    Object.entries({ ...input.params, ...snapshot.network.params }).filter(
      ([k, v]) => descriptor.params[k]?.default !== v,
    ),
  );
  if (snapshot.network.id !== descriptor.id)
    throw bad(`snapshot ${input.sha256} is of ${snapshot.network.id}, not ${descriptor.id}`);

  const caps = descriptor.capabilities;
  const merged = onParent(input, descriptor);
  const choices = merged.choices as Record<string, unknown>;
  const variationOf = merged.variationOf;
  for (const k of Object.keys(choices)) {
    if ((FIELDS as readonly string[]).includes(k)) continue;
    const p = primitive(k);
    if (p && p.status === 'unavailable')
      throw bad(`${k} is declared in the vocabulary but not available yet: ${p.note}`);
    throw bad(`unknown choice ${k}`, [...FIELDS]);
  }

  // measure
  const holdings = holdingMeasures(snapshot).map((m) => m.id);
  const coverageMeasure = holdings.includes(snapshot.coverage.measure)
    ? snapshot.coverage.measure
    : undefined;
  const defaultMeasure =
    caps.defaults.measure ?? caps.measures[0]?.id ?? coverageMeasure ?? holdings[0];
  const measure = (choices.measure as string | undefined) ?? defaultMeasure;
  if (measure === undefined || !holdings.includes(measure))
    throw bad(`measure ${measure} is not in this snapshot's holdings`, holdings);

  // petals
  const defaultPetals = caps.defaults.petals ?? DEFAULT_CHOICES.petals;
  const petals = (choices.petals as number | undefined) ?? defaultPetals;
  if (!Number.isInteger(petals) || petals < 5 || petals > 300)
    throw bad('petals is a whole number from 5 to 300', undefined, `got ${String(petals)}`);

  const changed: string[] = [];
  const defaults: string[] = [];
  const note = (field: Field, chosen: boolean, value: unknown, base: unknown) => {
    if (!chosen) defaults.push(field);
    if (value !== base) changed.push(field);
  };
  note('measure', choices.measure !== undefined, measure, defaultMeasure);
  note('petals', choices.petals !== undefined, petals, defaultPetals);

  const encodings: Partial<Record<SpecPrimitive, Encoding | null>> = {};
  const changes: string[] = [];

  for (const field of [
    'width',
    'height',
    'colour',
    'outline',
    'segments',
    'lines',
    'markings',
    'order',
  ] as const) {
    const base = (caps.defaults[field] ?? DEFAULT_CHOICES[field]) as string;
    const chosen = choices[field] !== undefined;
    const choice = chosen ? String(choices[field]) : base;
    const allowed = ALLOWED[field] ?? [];
    const metric = field === 'height' && choice.startsWith('m:') ? choice.slice(2) : null;
    const known = allowed.includes(choice) || metric !== null;
    if (!known) {
      const later =
        ['lines', 'markings'].includes(field) || ['time', 'ops', 'roles'].includes(choice);
      throw bad(
        later
          ? `${field} ${choice} is not available in this build yet; nothing is imitated`
          : `${field} ${choice} is not a choice`,
        allowed,
      );
    }
    const enc = shape(field, choice);
    if (enc) {
      if (metric !== null && !holdings.includes(metric))
        throw bad(
          `height m:${metric}: no such measure in this snapshot`,
          holdings.map((m) => `m:${m}`),
        );
      if (!drawable(field, enc.by))
        throw bad(`${field} by ${enc.by} is not available in this build yet`, allowed);
      const capBy = caps.by[field];
      if (capBy && !capBy.includes(enc.by) && !(metric !== null && capBy.includes('m:<metric>')))
        throw bad(
          `${field} by ${enc.by} does not apply to ${descriptor.id}`,
          allowed.includes('none') ? ['none', ...capBy] : capBy,
        );
      if (field === 'segments' && !caps.segments.includes(enc.by))
        throw bad(`segments ${enc.by} does not apply to ${descriptor.id}`, [
          'none',
          ...caps.segments.filter((x) => drawable('segments', x)),
        ]);
    }
    note(field, chosen, choice, base);

    const override = merged.meanings?.[field];
    if (!enc) {
      if (override !== undefined && !changed.includes(field)) changed.push(field);
      encodings[field] = null;
      if (changed.includes(field) && variationOf) changes.push(`${field}=${choice}`);
      continue;
    }
    const standard = standardMeaning(descriptor, field, choice, enc.by, measure);
    // An override that says what the standard says is no override: one flower, one recipe.
    if (override !== undefined && override !== standard && !changed.includes(field))
      changed.push(field);
    const entry =
      caps.meanings[`${field}:${choice}`] ?? caps.meanings[`${field}:${enc.by}`] ?? undefined;
    const meaning = override ?? standard;
    const sources = (
      entry?.sources?.length ? [...entry.sources] : derivedSources(field, enc.by, snapshot, measure)
    ) as SourceIds;
    encodings[field] = { ...enc, meaning, sources };
    if (changed.includes(field) && variationOf) changes.push(`${field}=${choice}`);
  }

  const order = encodings.order as Encoding;
  const spec: Spec = {
    petal: 'spec/v1',
    network: {
      id: descriptor.id,
      chain: snapshot.network.chain,
      population: snapshot.network.population,
      ...(Object.keys(params).length ? { params } : {}),
    },
    snapshot: {
      sha256: input.sha256,
      as_of: snapshot.snapshot.as_of,
      ...(snapshot.snapshot.block_height !== undefined
        ? { block_height: snapshot.snapshot.block_height }
        : {}),
    },
    labels: 'none',
    selection: { measure, petals, tail: { ...DEFAULT_CONVENTION.tail } },
    encodings: {
      width: encodings.width as Encoding,
      height: encodings.height as Encoding,
      colour: encodings.colour as Encoding,
      outline: encodings.outline ?? null,
      segments: encodings.segments ?? null,
      // lines and markings are unavailable in this build: they never appear in a spec (FR-032)
      order: {
        by: order.by as Spec['encodings']['order']['by'],
        meaning: order.meaning,
        sources: order.sources,
      },
    },
    convention: {
      id: DEFAULT_CONVENTION.id,
      variation_of: variationOf,
      changes: variationOf
        ? [
            ...(changed.includes('measure') ? [`measure=${measure}`] : []),
            ...(changed.includes('petals') ? [`petals=${petals}`] : []),
            ...changes,
          ]
        : [],
    },
  };
  return { spec, changed, defaults };
}
