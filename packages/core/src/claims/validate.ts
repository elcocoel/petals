// claimId, makeClaim, validateClaim: the schema, then the rules a schema can't say.
// A claim that passes here is well formed. Whether its proof is genuine is for a reader that can
// reach a chain: core does no I/O (contracts/claims.md, Reading).
import { canonicalJson, sha256Hex } from '../hash.ts';
import { createAjv, schemaId } from '../schema/ajv.ts';
import type { Result, ValidationIssue } from '../types/index.ts';
import { type PeopleScope, peopleRuleIssues } from './people.ts';
import { HEX64, parseRef } from './refs.ts';
import type { Claim, ClaimDraft } from './types.ts';
import {
  CHALLENGE_REASONS,
  CONFIDENCE_BANDS,
  GROUNDS,
  isMetaVerb,
  LABEL_TAGS,
  type ObjectClass,
  type QualifierClass,
  VERB_RULES,
} from './verbs.ts';

/** The id: SHA-256 of the canonical claim, without `id` and `proof`. */
export function claimId(claim: Claim | (ClaimDraft & { petal: Claim['petal'] })): string {
  const { id: _id, proof: _proof, ...hashed } = claim as Claim;
  return sha256Hex(canonicalJson(hashed));
}

/**
 * A claim with its version and id filled in. It doesn't validate: see validateClaim. Chain reads stay
 * v1, so their ids don't move; annotations are v2.
 */
export function makeClaim(draft: ClaimDraft, petal: Claim['petal'] = 'claim/v1'): Claim {
  const body = { petal, ...draft };
  return { ...body, id: claimId(body) };
}

type Validator = NonNullable<ReturnType<ReturnType<typeof createAjv>['getSchema']>>;
const compiled = new Map<string, Validator>();
/** Each version reads by its own schema: a reader picks by the document's `petal`. */
function schemaValidator(petal: unknown): Validator {
  const name = petal === 'claim/v2' ? 'claimV2' : 'claim';
  let v = compiled.get(name);
  if (!v) {
    v = createAjv().getSchema(schemaId(name));
    if (!v) throw new Error(`${name} schema not registered`);
    compiled.set(name, v);
  }
  return v;
}

/** A name is one line, as long as a profile's name; a link is a web page. */
const NAME_MAX = 128;
const LINK = /^https?:\/\/\S+$/;

const DECIMAL = /^-?[0-9]+(\.[0-9]+)?$/;
const TAGS: readonly string[] = LABEL_TAGS;

const QUALIFIER: Readonly<Record<QualifierClass, (v: string) => boolean>> = {
  decimal: (v) => DECIMAL.test(v),
  count: (v) => /^[0-9]{1,18}$/.test(v),
  // lower case, no spaces: a role or a measure, not a sentence
  slug: (v) => /^[a-z0-9][a-z0-9_.:-]{0,63}$/.test(v),
  // a token's own symbol, one word
  symbol: (v) => /^[A-Za-z0-9$._-]{1,32}$/.test(v),
  hex24: (v) => /^[0-9a-f]{24}$/.test(v),
  band: (v) => (CONFIDENCE_BANDS as readonly string[]).includes(v),
  // sorted and unique, so one set of grounds has one spelling and one id
  grounds: (v) => {
    const all = v.split(',');
    return all.every(
      (g, i) =>
        (GROUNDS as readonly string[]).includes(g) && (i === 0 || (all[i - 1] as string) < g),
    );
  },
  request: (v) => v === 'correct' || v === 'remove',
  reason: (v) => (CHALLENGE_REASONS as readonly string[]).includes(v),
};

function objectFits(cls: ObjectClass, object: Claim['object']): boolean {
  if (typeof object !== 'string') {
    const { value, unit } = object;
    if (cls === 'number') return DECIMAL.test(value);
    if (unit !== undefined) return false;
    if (cls === 'tag') return TAGS.includes(value);
    if (cls === 'name')
      return value.trim() === value && value.length <= NAME_MAX && !/[\r\n]/.test(value);
    if (cls === 'text') return value.trim().length > 0;
    if (cls === 'link') return LINK.test(value);
    return false;
  }
  const ns = parseRef(object)?.ns;
  switch (cls) {
    case 'entity':
      return ns === 'account' || ns === 'group';
    case 'account':
    case 'asset':
    case 'proposal':
    case 'claim':
      return ns === cls;
    default:
      return false;
  }
}

const OBJECT_WORDS: Readonly<Record<ObjectClass, string>> = {
  entity: 'an account, a contract or a group',
  account: 'an account or a contract',
  asset: 'an asset',
  proposal: 'a proposal',
  claim: 'another claim',
  number: 'a number, as a string',
  tag: `one of these tags: ${LABEL_TAGS.join(', ')}`,
  name: `a name in one line, at most ${NAME_MAX} characters, with no unit`,
  text: 'words, with no unit',
  link: 'a link to a web page, with no unit',
};

function ruleIssues(c: Claim, scope: PeopleScope): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (path: string, rule: string, message: string) => issues.push({ path, rule, message });
  const rule = VERB_RULES[c.verb];
  const meta = isMetaVerb(c.verb);

  if (claimId(c) !== c.id) add('/id', 'id', 'id is not the hash of the canonical claim');
  if (!rule.kinds.includes(c.kind))
    add('/kind', 'kind_for_verb', `${c.verb} can be ${rule.kinds.join(' or ')}, not ${c.kind}`);

  // Who can be named where.
  const subject = parseRef(c.subject);
  const by = parseRef(c.by);
  if (!by || by.ns === 'group' || by.ns === 'asset' || by.ns === 'proposal' || by.ns === 'claim')
    add('/by', 'entity_ref', 'a claim is by an account, a named tool or a named model');
  if (meta) {
    if (c.subject !== c.by) add('/subject', 'speaker', 'a claim about a claim speaks for its `by`');
  } else if (!subject || (subject.ns !== 'account' && subject.ns !== 'group')) {
    add('/subject', 'entity_ref', 'the subject must be an account, a contract or a group');
  }
  if (c.via !== undefined) {
    const via = parseRef(c.via);
    if (!via || (via.ns !== 'tool' && via.ns !== 'model'))
      add('/via', 'entity_ref', '`via` must be a named tool or a named model');
  }
  if (!objectFits(rule.object, c.object))
    add(
      '/object',
      'object_for_verb',
      `the object of ${c.verb} must be ${OBJECT_WORDS[rule.object]}`,
    );

  // Qualifiers: only the verb's own, each in its class, so none can carry free text.
  const allowed = rule.qualifiers ?? {};
  for (const [key, value] of Object.entries(c.qualifiers ?? {})) {
    const cls = allowed[key];
    if (!cls) add(`/qualifiers/${key}`, 'qualifier', `${c.verb} takes no qualifier "${key}"`);
    else if (!QUALIFIER[cls](value))
      add(`/qualifiers/${key}`, 'no_free_text', `"${key}" must be a ${cls}, not free text`);
  }
  for (const key of rule.required ?? [])
    if (c.qualifiers?.[key] === undefined)
      add(`/qualifiers/${key}`, 'qualifier', `${c.verb} needs the qualifier "${key}"`);
  if (c.petal === 'claim/v1' && c.qualifiers?.grounds?.split(',').includes('research'))
    add('/qualifiers/grounds', 'qualifier', 'research is a ground from claim/v2');

  // What each kind needs before anyone can check it.
  const has = (test: (e: Claim['evidence'][number]) => boolean) => c.evidence.some(test);
  switch (c.kind) {
    case 'observed':
      if (!has((e) => e.snapshot_sha256 !== undefined) && c.proof?.type !== 'tx')
        add('/evidence', 'evidence', 'an observed claim needs a snapshot hash or a transaction');
      break;
    case 'declared':
      if (c.by !== c.subject)
        add('/by', 'declared', 'declared means the subject says it of itself');
      if (c.proof === undefined) add('/proof', 'declared', 'a declared claim needs its proof');
      if (by?.ns === 'tool') add('/by', 'declared', 'a tool holds no key, so it can not declare');
      break;
    case 'stated':
      if (by?.ns !== 'account')
        add('/by', 'stated', "stated is a person's own word: `by` names their account");
      break;
    case 'sourced':
      if (!has((e) => /^https?:\/\//.test(e.url ?? '')))
        add('/evidence', 'evidence', 'a sourced claim needs a URL to its source');
      break;
    case 'inferred':
      if (c.evidence.length === 0)
        add('/evidence', 'evidence', 'an inferred claim shows what it rests on');
      if (c.verb !== 'confidence' && c.qualifiers?.grounds === undefined)
        add('/qualifiers/grounds', 'inferred', 'an inferred claim states its grounds');
      break;
  }
  if (c.verb === 'challenges' && c.evidence.length === 0)
    add('/evidence', 'evidence', 'a challenge shows why');
  if (c.verb === 'confidence' && c.kind === 'inferred' && by?.ns !== 'model') {
    const via = c.via === undefined ? null : parseRef(c.via);
    if (via?.ns !== 'model')
      add('/by', 'named_model', "a model's confidence names the model and its version");
  }
  if (c.verb === 'confidence' && by?.ns === 'tool')
    add('/by', 'named_model', 'confidence comes from a named person or a named model');

  if (c.valid_from !== undefined && c.valid_to !== undefined && c.valid_from > c.valid_to)
    add('/valid_to', 'dates', 'valid_to comes before valid_from');
  c.evidence.forEach((e, i) => {
    if (e.claim_id !== undefined && !HEX64.test(e.claim_id))
      add(`/evidence/${i}/claim_id`, 'evidence', 'claim_id must be a claim id');
    if (e.proposal !== undefined && parseRef(e.proposal)?.ns !== 'proposal')
      add(`/evidence/${i}/proposal`, 'evidence', 'proposal must be proposal:<caip2>:<key>');
  });

  return [...issues, ...peopleRuleIssues(c, scope)];
}

/**
 * The claim, typed, or every reason it can't be one. `private`: it's kept in a person's own project,
 * where names are allowed (people.ts). Without it, the claim is read as one to publish.
 */
export function validateClaim(x: unknown, scope: PeopleScope = {}): Result<Claim> {
  const v = schemaValidator((x as { petal?: unknown } | null)?.petal);
  if (!v(x)) {
    return {
      ok: false,
      errors: (v.errors ?? []).map(
        (e): ValidationIssue => ({
          path: e.instancePath,
          rule: 'schema',
          message: e.message ?? 'invalid',
        }),
      ),
    };
  }
  const claim = x as Claim;
  const errors = ruleIssues(claim, scope);
  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: claim };
}
