// REAL PEOPLE. This file is the rule. Elco can change it here.
//
// Elco's decision, 10 Nov (coordinator/annotation-layer.md, decision 1 (a)): names are allowed in a
// person's own annotations, kept in their own project (`{ private: true }`), because Elco asked to tie
// wallets to friends' names. Anything published keeps the first version below, to be decided again
// before annotations are published (step 8). In a person's own project, rules 2 and 5 give way for
// claim/v2's named and noted and for the evidence's notes and quotes; rules 1, 3 and 4 hold everywhere.
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

/** Two capitalised words in a row, like a name. Also catches some innocent phrases: reword them. */
const NAME_LIKE = /\p{Lu}\p{Ll}+[\s.-]+\p{Lu}\p{Ll}+/u;
/** A handle or an address for mail. */
const CONTACT = /(^|\s)@[\p{L}\d_]|[\p{L}\d._-]+@[\p{L}\d-]+\.[\p{L}]/u;

const REASON = {
  person:
    'claims name accounts, contracts and groups, not natural people (people.ts, first-version rule)',
  word: 'this word is not in the vocabulary: say what the accounts did, not what anyone is',
  note: 'a note must not name a person: point to the evidence instead (people.ts)',
  name: "a name is kept in a person's own project, and isn't published yet (people.ts, 10 Nov)",
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
  for (const [path, text] of texts)
    if (text !== undefined && FORBIDDEN_WORDS.test(text)) add(path, 'vocabulary', REASON.word);

  // Names: allowed in a person's own project, never published yet.
  if (!scope.private) {
    if (c.verb === 'named') add('/object/value', 'no_free_text_name', REASON.name);
    const words: [string, string | undefined][] = [
      ...(c.verb === 'noted' && typeof c.object !== 'string'
        ? ([['/object/value', c.object.value]] as [string, string][])
        : []),
      ...c.evidence.map((e, i): [string, string | undefined] => [`/evidence/${i}/note`, e.note]),
      ...c.evidence.map((e, i): [string, string | undefined] => [`/evidence/${i}/quote`, e.quote]),
    ];
    for (const [path, text] of words)
      if (text !== undefined && (NAME_LIKE.test(text) || CONTACT.test(text)))
        add(path, 'no_free_text_name', REASON.note);
  }

  // `confidence` rates a claim, so it rests on the claim. Everything else inferred links accounts.
  if (c.kind === 'inferred' && c.verb !== 'confidence') {
    const grounds = c.qualifiers?.grounds?.split(',') ?? [];
    if (grounds.length === 1 && grounds[0] === 'inbound_transfers')
      add('/qualifiers/grounds', 'inbound_alone', REASON.inbound);
  }
  return issues;
}
