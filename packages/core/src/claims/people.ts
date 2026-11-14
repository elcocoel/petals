// REAL PEOPLE. This file is the rule, and it is changed here.
//
// A claim publishes as it is, names and all, whether it's kept in a person's own project (`{ private: true }`)
// or published: no name net reads it. Only an address for mail or a phone number in its words keeps it in the
// person's project. The claimer answers for it, and the qualifier rates it before the press.
// A claim taken from a source (`sourced`) says what its source says, with the source. One worked out from
// traces (`inferred`: patterns, timing, style, scraps put together) is marked inferred, with its method and
// whatever evidence it has.
//
// Why some of it stays strict: a chain can't forget. A wrong claim about a real person can be hidden, not
// erased, and constitution line 56 ("may link an account to a real person... wherever public evidence
// allows", with a promise of removal) holds only off chain. So:
//
// 1. Claims name accounts, contracts and groups. No natural person as subject or object.
// 3. Nothing in the vocabulary calls anyone a scammer, a sybil or the like, except an inferred claim's own
//    words, which the qualifier weighs.
// 4. An inference names its method, and can't rest on inbound transfers alone. Anyone can send
//    anything to anyone: Tornado Cash dust hit 600+ addresses, and some got blocked for it.
// (Rules 2 and 5, no free-text names and names only in the account's own voice, are lifted.)
//
// What a machine enforces, in validateClaim:
// - Refs: only the namespaces in refs.ts parse. `person:`, `entity:` and friends are refused by name.
// - `object.value` and `qualifiers`: typed per verb (validate.ts), so none can hold a sentence.
// - The words below, wherever text can sit, except in an inferred claim.
// - Published: no address for mail and no phone number in a value, a note or a quote.
// - Inferred: `method` and `grounds` are required, and grounds can't be inbound transfers alone.
//
// What no machine here can catch, so a person or a later filter must (open question 15): whether a stated
// method is what really ran.
import type { ValidationIssue } from '../types/index.ts';
import type { Claim } from './types.ts';

/** Where a claim is kept: in a person's own project (`private`), or published. Absent: published. */
export interface PeopleScope {
  private?: boolean;
}

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

/** An address for mail, or a phone number written with a + or as 3-3-4. */
const EMAIL = /[\p{L}\d._%+-]+@[\p{L}\d-]+(?:\.[\p{L}\d-]+)*\.\p{L}{2,}/u;
const PHONE = /\+\d{1,3}[\s.-]?\(?\d[\d\s().-]{5,}\d|\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/;

const REASON = {
  contact:
    "an address for mail or a phone number stays in the person's own project: the record can't take it back (people.ts)",
  person:
    'claims name accounts, contracts and groups, not natural people (people.ts, first-version rule)',
  word: 'this word is not in the vocabulary: say what the accounts did, not what anyone is',
  inbound:
    'an inference can not rest on inbound transfers alone: anyone can send anything to anyone',
};

const namespaceOf = (ref: string): string => ref.slice(0, Math.max(0, ref.indexOf(':')));

/** The rule, as far as a machine can check it, for a claim kept where `scope` says. */
export function peopleRuleIssues(c: Claim, scope: PeopleScope = {}): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (path: string, rule: string, message: string) => issues.push({ path, rule, message });

  const refs: [string, string | undefined][] = [
    ['/subject', c.subject],
    ['/object', typeof c.object === 'string' ? c.object : undefined],
    ['/by', c.by],
    ['/via', c.via],
    // v3: who found each piece of evidence names no person either
    ...c.evidence.map((e, i): [string, string | undefined] => [
      `/evidence/${i}/found_by`,
      e.found_by,
    ]),
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
    ...c.evidence.map((e, i): [string, string | undefined] => [`/evidence/${i}/quote`, e.quote]),
  ];
  // an inferred claim is said as worked out, marked inferred: the qualifier, not a word list, weighs it
  const inferred = c.kind === 'inferred';
  for (const [path, text] of texts)
    if (!inferred && text !== undefined && FORBIDDEN_WORDS.test(text))
      add(path, 'vocabulary', REASON.word);

  // Published, an address for mail or a phone number in its words stays private; names and handles go.
  if (!scope.private) {
    const words: [string, string | undefined][] = [
      ['/object/value', typeof c.object === 'string' ? undefined : c.object.value],
      ...c.evidence.map((e, i): [string, string | undefined] => [`/evidence/${i}/note`, e.note]),
      ...c.evidence.map((e, i): [string, string | undefined] => [`/evidence/${i}/quote`, e.quote]),
    ];
    for (const [path, text] of words)
      if (text !== undefined && (EMAIL.test(text) || PHONE.test(text)))
        add(path, 'no_contact', REASON.contact);
  }

  // `confidence` rates a claim, so it rests on the claim. Everything else inferred links accounts.
  if (c.kind === 'inferred' && c.verb !== 'confidence') {
    const grounds = c.qualifiers?.grounds?.split(',') ?? [];
    if (grounds.length === 1 && grounds[0] === 'inbound_transfers')
      add('/qualifiers/grounds', 'inbound_alone', REASON.inbound);
  }
  return issues;
}
