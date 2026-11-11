// propose_spec and validate_spec (tools.md; data-model.md, Petal spec). The agent passes
// choices; core's buildSpec fills every default and standard meaning, so the same choices give
// the same spec_sha256 on every door. Unavailable primitives are refused, never imitated (FR-032).
import {
  buildSpec,
  diffSpecs,
  PRIMITIVES,
  recipeHash,
  recipeOf,
  schemas,
  specHash,
  validateSpec,
} from '@petal/core';
import type {
  Capabilities,
  Interpretation,
  NetworkDescriptor,
  Params,
  ProposeChoices,
  Snapshot,
  Spec,
  SpecPrimitive,
  Validation,
  ValidationIssue,
} from '@petal/core/types';
import { compile, defineTool, FLOWER_DEFS, inlineRefs } from '../define.ts';
import { ToolFailure } from '../errors.ts';
import type { ToolContext } from '../types.ts';
import {
  checkMeasure,
  checkParams,
  descriptorOf,
  findSnapshot,
  loadSnapshot,
  moduleFor,
  obj,
  PARAMS,
  readingDescriptor,
  SHA256,
  snapshotOf,
} from './shared.ts';

// ---------------------------------------------------------------------------------------------
// Choices → primitives

const SPEC_PRIMITIVES: SpecPrimitive[] = [
  'width',
  'height',
  'colour',
  'outline',
  'segments',
  'lines',
  'markings',
  'order',
];
const CHOICE_KEYS = ['measure', 'petals', ...SPEC_PRIMITIVES] as const;

/** The `by` a choice asks for, or null when it turns the primitive off. */
function byOf(p: SpecPrimitive, value: string): string | null {
  switch (p) {
    case 'width':
      return value === 'equal' ? 'equal' : 'share';
    case 'height':
      if (value === 'sqrt' || value === 'linear') return 'share';
      if (value === 'log') return 'amount';
      return value; // equal, m:<metric>
    default:
      return value === 'none' ? null : value;
  }
}

const primitive = (id: string) => PRIMITIVES.find((p) => p.id === id);

/** FR-032: a primitive this build marks unavailable is refused with "not available yet". */
function refuseUnavailable(id: string, asked: string): void {
  const p = primitive(id);
  if (p && p.status === 'unavailable') {
    throw new ToolFailure(
      'bad_input',
      `${id} is not available yet in this build (asked: ${asked}). ${p.note}.`,
      `Available primitives: ${PRIMITIVES.filter((x) => x.status === 'available')
        .map((x) => x.id)
        .join(', ')}. Nothing is imitated: leave ${id} out.`,
    );
  }
}

function builtBy(id: string, by: string): boolean {
  const p = primitive(id);
  if (!p) return false;
  return p.by.includes(by) || (by.startsWith('m:') && p.by.includes('m:<metric>'));
}

function allowedFor(caps: Capabilities, p: SpecPrimitive): string[] | null {
  if (p === 'segments') return caps.by.segments ?? caps.segments;
  return caps.by[p] ?? null;
}

/** Check every choice against this build (PRIMITIVES) and this population (capabilities). */
export function checkChoices(
  choices: Record<string, unknown>,
  d: NetworkDescriptor,
  s: Snapshot,
  meanings: Record<string, unknown> | undefined,
): void {
  for (const key of Object.keys(choices)) {
    if ((CHOICE_KEYS as readonly string[]).includes(key)) continue;
    refuseUnavailable(key, String(choices[key]));
    throw new ToolFailure(
      'bad_input',
      `Unknown choice "${key}".`,
      `Choices: ${CHOICE_KEYS.join(', ')}.`,
    );
  }
  for (const p of SPEC_PRIMITIVES) {
    const value = choices[p];
    if (value === undefined) continue;
    const by = byOf(p, String(value));
    if (by === null) continue;
    refuseUnavailable(p, String(value));
    if (!builtBy(p, by)) {
      const built = primitive(p)?.by ?? [];
      throw new ToolFailure(
        'bad_input',
        `${p}: "${value}" is not available yet in this build. ${primitive(p)?.note ?? ''}`.trim(),
        `Available for ${p}: ${built.join(', ')}.`,
      );
    }
    if (by.startsWith('m:')) checkMeasure(s, by.slice(2));
    const allowed = allowedFor(d.capabilities, p);
    const metricAllowed = by.startsWith('m:') && allowed?.includes('m:<metric>');
    if (allowed && !allowed.includes(by) && !metricAllowed) {
      const options = p === 'segments' || p === 'outline' ? ['none', ...allowed] : allowed;
      throw new ToolFailure(
        'bad_input',
        `${p}: "${value}" doesn't apply to ${d.id} (${d.title}). Allowed: ${options.join(', ')}.`,
        `Closest alternative: ${p} "${options[0]}".`,
      );
    }
  }
  if (typeof choices.measure === 'string') checkMeasure(s, choices.measure);
  for (const key of Object.keys(meanings ?? {})) {
    if ((SPEC_PRIMITIVES as string[]).includes(key)) continue;
    refuseUnavailable(key, 'a meaning');
    throw new ToolFailure(
      'bad_input',
      `meanings: "${key}" is not a primitive a spec can carry.`,
      `Primitives: ${SPEC_PRIMITIVES.join(', ')}.`,
    );
  }
}

// ---------------------------------------------------------------------------------------------
// Validation shared by validate_spec, render_flower and prepare_publish

const checkSpecSchema = compile(schemas.spec as Record<string, unknown>);

function schemaIssues(spec: unknown): ValidationIssue[] {
  if (checkSpecSchema(spec)) return [];
  return (checkSpecSchema.errors ?? []).map((e) => ({
    path: e.instancePath || '/',
    rule: 'schema',
    message: e.message ?? 'does not match the spec schema',
  }));
}

export interface SpecCheck {
  validation: Validation;
  snapshot: Snapshot | null;
}

/** Rule 2 (the snapshot exists) and the network are checked here; core checks the rest. */
export async function checkSpec(
  ctx: ToolContext,
  spec: unknown,
  interpretation?: Interpretation,
): Promise<SpecCheck> {
  const sha = snapshotOf(spec);
  const snapshot = sha && /^[0-9a-f]{64}$/.test(sha) ? await findSnapshot(ctx, sha) : null;
  const id = (spec as Partial<Spec> | null)?.network?.id;
  const d = snapshot ? descriptorOf(ctx, snapshot) : null;
  if (snapshot && d && id === snapshot.network.id) {
    const ctxv = {
      snapshot,
      capabilities: d.capabilities,
      ...(interpretation ? { interpretation } : {}),
    };
    return { validation: validateSpec(spec, ctxv), snapshot };
  }
  const errors = schemaIssues(spec);
  if (!snapshot) {
    errors.push({
      path: '/snapshot/sha256',
      rule: 'snapshot',
      message: `No snapshot ${sha ?? '(none given)'} in the fixtures, the cache or the map.`,
    });
  } else if (id !== snapshot.network.id) {
    errors.push({
      path: '/network/id',
      rule: 'snapshot',
      message: `The snapshot is of ${snapshot.network.id}, not ${String(id)}.`,
    });
  } else {
    errors.push({
      path: '/network/id',
      rule: 'network',
      message: `Petals can't read the network "${String(id)}", so its capabilities are unknown.`,
    });
  }
  return { validation: { valid: false, errors, warnings: [] }, snapshot };
}

export function summarise(v: Validation): string {
  const shown = v.errors.slice(0, 3).map((e) => `${e.path} (${e.rule}): ${e.message}`);
  const more = v.errors.length > 3 ? ` (and ${v.errors.length - 3} more)` : '';
  return `${shown.join('; ')}${more}`;
}

// ---------------------------------------------------------------------------------------------
// Tools

const VALIDATION_SCHEMA = obj(['valid', 'errors', 'warnings'], {
  valid: { type: 'boolean' },
  errors: { type: 'array', items: { $ref: '#/$defs/issue' } },
  warnings: { type: 'array', items: { $ref: '#/$defs/issue' } },
});
const ISSUE = obj(['path', 'rule', 'message'], {
  path: { type: 'string' },
  rule: { type: 'string' },
  message: { type: 'string' },
});

const CHOICES = {
  type: 'object',
  description:
    'only what the question needs; everything else comes from default/v1 and the network. ' +
    'Primitives this build cannot draw (texture, extrusion, opacity, lines, markings) are refused.',
  properties: {
    measure: { type: 'string' },
    petals: { type: 'integer', minimum: 5, maximum: 300 },
    width: { enum: ['r1.5', 'r2', 'r3', 'equal'] },
    height: { type: 'string', pattern: '^(sqrt|linear|log|equal|m:.+)$' },
    colour: { enum: ['kind', 'identity', 'single'] },
    outline: { enum: ['identity_status', 'none'] },
    segments: { enum: ['none', 'backers', 'time', 'ops', 'roles'] },
    lines: { type: 'string' },
    markings: { enum: ['none', 'fusion'] },
    order: { enum: ['measure_desc', 'measure_asc', 'id', 'join_date', 'last_active'] },
  },
};

type ProposeIn = {
  network: string;
  params?: Params;
  sha256: string;
  choices?: ProposeChoices & Record<string, unknown>;
  variation_of?: string;
  parent?: Spec;
  meanings?: Record<string, string>;
};

const RECIPE = obj(['petal', 'choices'], {
  petal: { const: 'recipe/v1' },
  choices: { type: 'object' },
  meanings: { type: 'object', additionalProperties: { type: 'string' } },
});
const DIFF_CHANGE = obj(['what', 'from', 'to', 'says'], {
  what: { type: 'string' },
  from: {},
  to: {},
  says: { type: 'string' },
});
const CHANGES = { type: 'array', items: DIFF_CHANGE };
const DIFF = obj(['same_recipe', 'subject', 'data', 'design', 'says'], {
  same_recipe: { type: 'boolean' },
  subject: CHANGES,
  data: CHANGES,
  design: CHANGES,
  says: { type: 'string' },
});

export const proposeSpec = defineTool<ProposeIn, object>({
  name: 'propose_spec',
  title: 'Propose a spec',
  description:
    'Build the full canonical Petals spec from a few choices, starting from default/v1 and the ' +
    "network's defaults, with the standard meaning and sources for each primitive. The same " +
    'choices always give the same spec_sha256. Pass the fewest choices the question needs. To ' +
    'change a flower, pass it as `parent` and only the choices that change: they go on top of its ' +
    'recipe. Returns the `recipe`, reusable on another network or date, and with a parent a `diff`.',
  input: obj(
    ['network', 'sha256'],
    {
      network: { type: 'string', minLength: 1 },
      params: PARAMS,
      sha256: SHA256,
      choices: CHOICES,
      variation_of: {
        ...SHA256,
        description: 'spec_sha256 of the parent; optional when `parent` is passed',
      },
      parent: {
        type: 'object',
        description: 'the spec this one changes, as propose_spec returned it',
      },
      meanings: {
        type: 'object',
        additionalProperties: { type: 'string', minLength: 1 },
        description: 'override text for a primitive\'s meaning, e.g. { "height": "..." }',
      },
    },
    { additionalProperties: false },
  ),
  output: obj(
    ['spec', 'spec_sha256', 'defaults_applied', 'changed_from_default', 'recipe', 'recipe_sha256'],
    {
      spec: { $ref: '#/$defs/spec' },
      spec_sha256: SHA256,
      defaults_applied: { type: 'array', items: { type: 'string' } },
      changed_from_default: { type: 'array', items: { type: 'string' } },
      recipe: RECIPE,
      recipe_sha256: SHA256,
      diff: DIFF,
    },
    { $defs: FLOWER_DEFS },
  ),
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  async run(input, ctx) {
    // a stored reading by a reader Petals doesn't have (a mapping wave's) is described by itself (#96)
    const known = ctx.modules[input.network]?.descriptor;
    const s = await loadSnapshot(ctx, input.sha256);
    if (!known && s.network.id !== input.network) moduleFor(ctx, input.network);
    const base = known ?? readingDescriptor(s);
    if (input.params && known) checkParams(base, input.params);
    const d = descriptorOf(ctx, s) ?? base;
    if (s.network.id !== input.network) {
      throw new ToolFailure(
        'bad_input',
        `Snapshot ${input.sha256} is of ${s.network.id}, not ${input.network}.`,
        'Pass the sha256 that get_snapshot returned for this network.',
      );
    }
    checkChoices(input.choices ?? {}, d, s, input.meanings);
    if (input.parent) {
      const issues = schemaIssues(input.parent);
      if (issues.length) {
        throw new ToolFailure(
          'bad_input',
          `parent is not a spec: ${issues[0]?.path} ${issues[0]?.message}`,
          'Pass the spec exactly as propose_spec returned it.',
        );
      }
    }
    const { spec, changed, defaults } = buildSpec(input, d, s);
    const recipe = recipeOf(spec, d);
    return {
      spec,
      spec_sha256: specHash(spec),
      defaults_applied: defaults,
      changed_from_default: changed,
      recipe,
      recipe_sha256: recipeHash(recipe),
      ...(input.parent ? { diff: diffSpecs(input.parent, spec) } : {}),
    };
  },
});

/**
 * The Interpretation exactly as the core schema defines it, with its references resolved, so every
 * door shows the real shape and no copy of it can drift.
 */
const INTERPRETATION_INPUT = {
  ...inlineRefs(FLOWER_DEFS.interpretation as Record<string, unknown>),
  description:
    'Your reading of the flower. Every field is required and no others are allowed. conflicts, ' +
    'unknowns and inferred are arrays of plain strings. documents is [] unless you cite a ' +
    'document; a source id is cited in sources, not here.',
};

export const validateSpecTool = defineTool<
  { spec: unknown; interpretation?: Interpretation },
  Validation
>({
  name: 'validate_spec',
  title: 'Validate a spec',
  description:
    'Check a spec (and, if given, the interpretation) against the rules: schema, the snapshot ' +
    'exists and matches, measure and encodings allowed, a meaning and a known source for every ' +
    'primitive, width band at most 3x, tail declared, no unavailable primitive, and with an ' +
    'interpretation every mapping cited and unknowns not empty. Fix the errors and retry.',
  input: obj(
    ['spec'],
    {
      spec: { type: 'object', description: 'a spec (spec/v1), as propose_spec returns it' },
      interpretation: INTERPRETATION_INPUT,
    },
    { additionalProperties: false },
  ),
  // A wrong interpretation is this tool's answer ({ valid: false, errors }), not a bad input.
  accepts: obj(
    ['spec'],
    { spec: { type: 'object' }, interpretation: { type: 'object' } },
    { additionalProperties: false },
  ),
  output: { ...VALIDATION_SCHEMA, $defs: { issue: ISSUE } },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  async run({ spec, interpretation }, ctx) {
    return (await checkSpec(ctx, spec, interpretation)).validation;
  },
});
