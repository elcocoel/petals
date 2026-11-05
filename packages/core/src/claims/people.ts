// REAL PEOPLE, FIRST VERSION. This file is the rule. Elco can change it here.
//
// Why it's strict: a chain can't forget. A wrong claim about a real person can be hidden, not erased,
// and constitution line 56 ("may link an account to a real person... wherever public evidence
// allows", with a promise of removal) holds only off chain. That line is under question (open
// question 9). Until it's decided:
//
// 1. Claims name accounts, contracts and groups. No natural person as subject or object.
// 2. No free-text names in `object`, `qualifiers` or `note`.
// 3. Nothing in the vocabulary calls anyone a scammer, a sybil or the like.
// 4. An inference names its method, and can't rest on inbound transfers alone. Anyone can send
//    anything to anyone: Tornado Cash dust hit 600+ addresses, and some got blocked for it.
// 5. Names stay in the account's own voice: its profile, its `.near` name, its ENS. They're read at
//    draw time and shown as "this account says". They're never rewritten as claims.
//
// What a machine enforces, in validateClaim:
// - Refs: only the namespaces in refs.ts parse. `person:`, `entity:` and friends are refused by name.
// - `object.value` and `qualifiers`: typed per verb (validate.ts), so none can hold a sentence.
// - The words below, wherever text can sit.
// - `note`: a net, not a guard. It catches "Firstname Lastname", handles and addresses for mail.
// - Inferred: `method` and `grounds` are required, and grounds can't be inbound transfers alone.
//
// What no machine here can catch, so a person or a later filter must (open question 15):
// a lower-case name in a note, a name used as a `role` slug or a token's symbol, a name inside a URL,
// an account whose id is someone's name, and whether a stated method is what really ran.
//
// To loosen the rule: empty PERSON_NAMESPACES and add the namespace to refs.ts, or relax the checks
// in peopleRuleIssues. Public claims already written can't follow, which is the reason for caution.
import type { ValidationIssue } from '../types/index.ts';
import type { Claim } from './types.ts';

/** Namespaces that would name a person, or anything at all. Refused with a plain reason. */
export const PERSON_NAMESPACES: ReadonlySet<string> = new Set([
  'did',
  'entity',
  'human',
  'individual',
  'name',
  'people',
  'person',
  'user',
]);

/** Accusation words. Not in the vocabulary, and not accepted in text around it. */
export const FORBIDDEN_WORDS =
  /scam|sybil|fraud|launder|thief|thieves|criminal|terroris|hacker|ponzi|rug-?pull|drainer|money.?mule/i;

/** Two capitalised words in a row, like a name. Also catches some innocent phrases: reword them. */
const NAME_LIKE = /\p{Lu}\p{Ll}+[\s.-]+\p{Lu}\p{Ll}+/u;
/** A handle or an address for mail. */
const CONTACT = /(^|\s)@[\p{L}\d_]|[\p{L}\d._-]+@[\p{L}\d-]+\.[\p{L}]/u;

const REASON = {
  person:
    'claims name accounts, contracts and groups, not natural people (people.ts, first-version rule)',
  word: 'this word is not in the vocabulary: say what the accounts did, not what anyone is',
  note: 'a note must not name a person: point to the evidence instead (people.ts)',
  inbound:
    'an inference can not rest on inbound transfers alone: anyone can send anything to anyone',
};

const namespaceOf = (ref: string): string => ref.slice(0, Math.max(0, ref.indexOf(':')));

/** The first-version rule, as far as a machine can check it. */
export function peopleRuleIssues(c: Claim): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (path: string, rule: string, message: string) => issues.push({ path, rule, message });

  const refs: [string, string | undefined][] = [
    ['/subject', c.subject],
    ['/object', typeof c.object === 'string' ? c.object : undefined],
    ['/by', c.by],
    ['/via', c.via],
  ];
  for (const [path, ref] of refs)
    if (ref !== undefined && PERSON_NAMESPACES.has(namespaceOf(ref)))
      add(path, 'no_natural_person', REASON.person);

  const texts: [string, string | undefined][] = [
    ['/method', c.method],
    ...(typeof c.object === 'string'
      ? []
      : ([
          ['/object/value', c.object.value],
          ['/object/unit', c.object.unit],
        ] as [string, string | undefined][])),
    ...Object.entries(c.qualifiers ?? {}).map(([k, v]): [string, string] => [
      `/qualifiers/${k}`,
      v,
    ]),
    ...c.evidence.map((e, i): [string, string | undefined] => [`/evidence/${i}/note`, e.note]),
  ];
  for (const [path, text] of texts)
    if (text !== undefined && FORBIDDEN_WORDS.test(text)) add(path, 'vocabulary', REASON.word);

  c.evidence.forEach((e, i) => {
    if (e.note !== undefined && (NAME_LIKE.test(e.note) || CONTACT.test(e.note)))
      add(`/evidence/${i}/note`, 'no_free_text_name', REASON.note);
  });

  // `confidence` rates a claim, so it rests on the claim. Everything else inferred links accounts.
  if (c.kind === 'inferred' && c.verb !== 'confidence') {
    const grounds = c.qualifiers?.grounds?.split(',') ?? [];
    if (grounds.length === 1 && grounds[0] === 'inbound_transfers')
      add('/qualifiers/grounds', 'inbound_alone', REASON.inbound);
  }
  return issues;
}
