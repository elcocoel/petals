// applyPolicy: the one place that decides what shows (SYS-063). Claims and a lens in; for each claim,
// whether it's shown, how and why. Pure and deterministic: the input's order and repeats don't
// matter. It trusts that its input passed validateClaim and that a reader checked the proofs
// (contracts/claims.md, Reading). It has no clock, so `valid_to` isn't weighed yet.
//
// "Disputed" is decided here, under the reader's lens, and stored nowhere. So one writer can't change
// a fact for everyone: a challenge moves only readers who chose to count its writer.
import { type ClaimIndex, indexClaims, targetOf } from './derive.ts';
import { SNAPSHOT_READER } from './observed.ts';
import type { Claim, ClaimKind, ConfidenceBand, Lens, ShowAs, Shown } from './types.ts';
import { CONFIDENCE_BANDS, isMetaVerb } from './verbs.ts';

/**
 * What a new reader sees (open question 11). Chain reads and what accounts say of themselves, and
 * nobody's word about anybody else. Inferred claims stay hidden until a reader asks for them, and
 * then they're always caveated. With nobody trusted, no outside challenge can change what shows:
 * the reader is told it exists, and can choose to trust its writer.
 */
export const DEFAULT_LENS: Readonly<Lens> = Object.freeze<Lens>({
  kinds: Object.freeze<ClaimKind[]>(['observed', 'declared']),
  trusted: Object.freeze<string[]>([]),
  showDisputed: true,
  showRetracted: false,
});

const KIND_WORDS: Readonly<Record<ClaimKind, string>> = {
  observed: 'Observed',
  declared: 'Declared',
  stated: 'Stated',
  sourced: 'Sourced',
  inferred: 'Inferred',
};

const rank = (band: ConfidenceBand) => CONFIDENCE_BANDS.indexOf(band);
const writers = (n: number) => (n === 1 ? '1 writer' : `${n} writers`);

interface Notes {
  beside: string[];
  challenges: Shown['challenges'];
  confidence?: NonNullable<Shown['confidence']>;
  tail: string;
}

function notesOn(c: Claim, ix: ClaimIndex, counts: (writer: string) => boolean): Notes {
  const beside: string[] = [];
  const counted = new Set<string>();
  const outside = new Set<string>();
  const raters = new Set<string>();
  let band: ConfidenceBand | undefined;
  for (const x of ix.about.get(c.id) ?? []) {
    if (x.verb === 'responds') {
      if (x.by === c.subject) beside.push(x.id);
    } else if (x.verb === 'challenges') {
      (counts(x.by) ? counted : outside).add(x.by);
    } else if (x.verb === 'confidence' && counts(x.by)) {
      raters.add(x.by);
      const given = x.qualifiers?.band as ConfidenceBand;
      // the lowest stands: a rater who changes their mind says so with `supersedes`
      if (band === undefined || rank(given) < rank(band)) band = given;
    }
  }
  const tail = [
    outside.size > 0
      ? `${writers(outside.size)} outside this lens ${outside.size === 1 ? 'challenges' : 'challenge'} it, which changes nothing here.`
      : '',
    beside.length > 0 ? 'The subject has answered, and the answer shows beside it.' : '',
    band === undefined ? '' : `Rated ${band} by ${writers(raters.size)} this lens trusts.`,
  ].filter((part) => part !== '');
  return {
    beside,
    challenges: { counted: counted.size, outside: outside.size },
    ...(band === undefined ? {} : { confidence: { band, raters: raters.size } }),
    tail: tail.length > 0 ? ` ${tail.join(' ')}` : '',
  };
}

/** A claim about a claim: its effect follows who said it, and `kinds` doesn't apply. */
function metaVerdict(
  c: Claim,
  ix: ClaimIndex,
  counts: (writer: string) => boolean,
): [ShowAs, string] {
  const id = targetOf(c);
  const target = id === null ? undefined : ix.byId.get(id);
  if (target === undefined) return ['hidden', "It's about a claim that isn't in this set."];
  const mine = target.by === c.by;
  switch (c.verb) {
    case 'responds':
      if (c.by === target.subject)
        return ['plain', "The subject's own account answers the claim. Every lens shows that."];
      return counts(c.by)
        ? ['plain', `${c.by} answers the claim, and this lens trusts them.`]
        : ['hidden', `An answer from ${c.by}, who this lens doesn't trust.`];
    case 'retracts':
      if (!mine) return ['hidden', "Only a claim's author can retract it. This changes nothing."];
      if (target.verb === 'retracts')
        return ['hidden', "A retraction can't be undone. To say it again, issue a new claim."];
      return ['plain', 'The author withdraws their own claim.'];
    case 'supersedes':
      if (!mine) return ['hidden', "Only a claim's author can replace it. This changes nothing."];
      if (target.verb === 'retracts')
        return ['hidden', "A retraction can't be replaced. To say it again, issue a new claim."];
      return ['plain', 'The author replaces their own earlier claim.'];
    case 'challenges':
      return counts(c.by)
        ? ['plain', `A challenge from ${c.by}, who this lens trusts.`]
        : ['hidden', `A challenge from ${c.by}, who this lens doesn't trust. It changes nothing.`];
    default:
      return counts(c.by)
        ? ['plain', `A rating from ${c.by}, who this lens trusts.`]
        : ['hidden', `A rating from ${c.by}, who this lens doesn't trust.`];
  }
}

function factVerdict(
  c: Claim,
  notes: Notes,
  lens: Lens,
  counts: (writer: string) => boolean,
  oneSided: (c: Claim) => boolean,
): [ShowAs, string] {
  if (lens.kinds !== undefined && !lens.kinds.includes(c.kind))
    return ['hidden', `${KIND_WORDS[c.kind]} claims aren't in this lens.`];

  // An account's word about itself needs no trust, and a snapshot's hash proves what's read from it.
  const proved = c.kind === 'observed' && c.by === SNAPSHOT_READER;
  if (c.kind !== 'declared' && !proved && !counts(c.by))
    return ['hidden', `Said by ${c.by}, who this lens doesn't trust.`];

  const min = lens.minConfidence;
  if (min !== undefined && (c.kind === 'stated' || c.kind === 'sourced' || c.kind === 'inferred')) {
    const band = notes.confidence?.band;
    if (band === undefined)
      return [
        'hidden',
        `This lens asks for at least ${min} confidence, and nobody it trusts rated this.`,
      ];
    if (rank(band) < rank(min))
      return ['hidden', `Rated ${band}, and this lens asks for at least ${min}.`];
  }

  const challengers = notes.challenges.counted;
  if (challengers > 0) {
    const who = `Challenged by ${writers(challengers)} this lens trusts`;
    return lens.showDisputed === false
      ? ['hidden', `${who}, and this lens hides disputed claims.`]
      : ['contested', `${who}.`];
  }

  if (c.kind === 'inferred')
    return ['caveated', `Inferred by ${c.by}, with method ${c.method}. It isn't proved.`];
  if (oneSided(c))
    return ['caveated', 'Only this account says so. The other account has not said the same.'];
  if (notes.confidence?.band === 'low')
    return c.kind === 'stated'
      ? ['caveated', `Said by ${c.by} on their own word, but the rating is low.`]
      : ['caveated', `Said by ${c.by}, citing a source, but the rating is low.`];

  switch (c.kind) {
    case 'observed':
      return proved
        ? ['plain', "Read from the chain. The snapshot's hash proves it."]
        : ['plain', `${c.by} says it read this from the chain, and this lens trusts them.`];
    case 'declared':
      return ['plain', 'This account says this of itself.'];
    case 'stated':
      return ['plain', `Said by ${c.by} on their own word, and this lens trusts them.`];
    default:
      return ['plain', `Said by ${c.by}, citing a source, and this lens trusts them.`];
  }
}

export function applyPolicy(claims: readonly Claim[], lens: Lens = DEFAULT_LENS): Shown[] {
  const ix = indexClaims(claims);
  const trusted = lens.trusted === 'everyone' ? null : new Set(lens.trusted ?? []);
  const counts = (writer: string) => trusted === null || trusted.has(writer);

  const saysSame = new Set<string>();
  for (const c of ix.claims)
    if (c.verb === 'declares_same_controller' && !ix.retired.has(c.id))
      saysSame.add(`${c.subject}\n${String(c.object)}`);
  const oneSided = (c: Claim) =>
    c.verb === 'declares_same_controller' && !saysSame.has(`${String(c.object)}\n${c.subject}`);

  return ix.claims.map((c): Shown => {
    const notes = notesOn(c, ix, counts);
    const { tail, ...carried } = notes;
    const retired = ix.retired.get(c.id);
    let verdict: [ShowAs, string];
    if (retired !== undefined) {
      const said =
        retired.verb === 'retracts'
          ? 'Its author retracted it.'
          : 'Its author replaced it with a newer claim.';
      verdict =
        lens.showRetracted === true
          ? ['caveated', `${said} Shown because this lens asks for such claims.`]
          : ['hidden', `${said} It stays readable, but this lens leaves it off.`];
    } else if (isMetaVerb(c.verb)) {
      verdict = metaVerdict(c, ix, counts);
    } else {
      verdict = factVerdict(c, notes, lens, counts, oneSided);
    }
    return { claim: c, show: verdict[0], why: `${verdict[1]}${tail}`, ...carried };
  });
}
