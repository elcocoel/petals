// propose_spec's core (tools.md): start from default/v1 and the population's defaults, apply the
// agent's few choices, fill every standard meaning and source id, so the same choices give the
// same spec bytes. A choice that does not apply, or names a primitive this build cannot draw,
// is refused with bad_input (FR-032): nothing is imitated.
//
// Meanings and sources, first match wins:
//   meaning   input.meanings[primitive]  >  descriptor `<primitive>:<choice>`  >  descriptor
//             `<primitive>:<by>`  >  STANDARD_MEANINGS (with the measure's label)
//   sources   descriptor `<primitive>:<choice>`  >  `<primitive>:<by>`  >  the snapshot rows that
//             feed the primitive (holdings of the measure, participants, delegations)
import { BadInputError } from '../errors.ts';
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
import { DEFAULT_CHOICES, DEFAULT_CONVENTION, STANDARD_MEANINGS } from './default.ts';

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

/** What a choice draws: the encoding minus meaning and sources. null = primitive unused. */
function shape(field: SpecPrimitive, choice: string): Omit<Encoding, 'meaning' | 'sources'> | null {
  switch (field) {
    case 'width':
      return choice === 'equal'
        ? { by: 'equal', scale: 'equal' }
        : { by: 'share', scale: 'log', max_ratio: Number(choice.slice(1)) };
    case 'height':
      if (choice === 'sqrt' || choice === 'linear') return { by: 'share', scale: choice };
      if (choice === 'log') return { by: 'amount', scale: 'log' };
      if (choice === 'equal') return { by: 'equal', scale: 'equal' };
      return { by: choice, scale: 'linear' }; // m:<metric>
    case 'outline':
    case 'segments':
    case 'lines':
    case 'markings':
      return choice === 'none' ? null : { by: choice };
    default:
      return { by: choice };
  }
}

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

function measureLabel(d: NetworkDescriptor, measure: string): string {
  return (
    d.capabilities.measures.find((m) => m.id === measure)?.label ?? measure.replaceAll('_', ' ')
  );
}

export function buildSpec(
  input: ProposeInput,
  descriptor: NetworkDescriptor,
  snapshot: Snapshot,
): { spec: Spec; changed: string[]; defaults: string[] } {
  if (input.network !== descriptor.id)
    throw bad(`network ${input.network} is not ${descriptor.id}`, [descriptor.id]);
  if (snapshot.network.id !== descriptor.id)
    throw bad(`snapshot ${input.sha256} is of ${snapshot.network.id}, not ${descriptor.id}`);

  const caps = descriptor.capabilities;
  const choices = (input.choices ?? {}) as Record<string, unknown>;
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

  const label = measureLabel(descriptor, measure);
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

    const override = input.meanings?.[field];
    if (override !== undefined && !changed.includes(field)) changed.push(field);
    if (!enc) {
      encodings[field] = null;
      if (changed.includes(field) && input.variation_of) changes.push(`${field}=${choice}`);
      continue;
    }
    const entry =
      caps.meanings[`${field}:${choice}`] ?? caps.meanings[`${field}:${enc.by}`] ?? undefined;
    const standard = STANDARD_MEANINGS[metric !== null ? 'height:m:' : `${field}:${choice}`] ?? '';
    const metricLabel = metric !== null ? measureLabel(descriptor, metric) : '';
    const meaning =
      override ??
      entry?.meaning ??
      standard.replace('the measure', label).replace('the metric', metricLabel);
    const sources = (
      entry?.sources?.length ? [...entry.sources] : derivedSources(field, enc.by, snapshot, measure)
    ) as SourceIds;
    encodings[field] = { ...enc, meaning, sources };
    if (changed.includes(field) && input.variation_of) changes.push(`${field}=${choice}`);
  }

  const order = encodings.order as Encoding;
  const spec: Spec = {
    petal: 'spec/v1',
    network: {
      id: descriptor.id,
      chain: snapshot.network.chain,
      population: snapshot.network.population,
      ...(input.params && Object.keys(input.params).length ? { params: { ...input.params } } : {}),
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
      variation_of: input.variation_of ?? null,
      changes: input.variation_of
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
