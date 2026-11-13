// What's said about a petal's account, from the annotations layer, where the agent and the person can add as
// many as they like: each claim as a person reads it, with what it says, how it's known (stated, sourced,
// inferred: never "verified"), where it rests and who said it. Read from GET /api/v1/me/annotations, the
// person's own; written to POST /api/v1/me/annotations. Pure.
import { readableAgent } from './agents.ts';

/** A claim as the annotations layer keeps it: only what the detail box reads. */
export interface AnnotationClaim {
  id?: string;
  subject: string;
  verb: string;
  object: string | { value: string };
  kind: string;
  evidence?: {
    url?: string;
    tx?: string;
    proposal?: string;
    quote?: string;
    note?: string;
  }[];
  by?: string;
  via?: string;
}

/** A row of GET /api/v1/me/annotations. */
export interface AnnotationRow {
  claim: AnnotationClaim;
  exploration: string | null;
  added_at: string;
}

/** One claim, as the detail box says it. */
export interface ClaimLine {
  key: string;
  /** "Named Tae", or the note's own words */
  says: string;
  /** a link the claim is, for `linked` */
  link?: string;
  /** stated, sourced, inferred, declared, observed: how it's known, never "verified" */
  kind: string;
  /** "in proposal #168" */
  rests?: string;
  /** the source's link, when it has one */
  source?: string;
  /** the source's own words */
  quote?: string;
  /** "you", "Petals' agent", "Codex" */
  who: string;
}

/** The verbs the annotations layer adds; the others aren't said here. */
const SAID = new Set(['named', 'noted', 'linked']);

const claimValue = (o: AnnotationClaim['object']) => (typeof o === 'string' ? o : o.value);

/** tool:petals-agent@1 is Petals' agent; tool:codex@1 an own agent, by its name. */
const toolName = (ref: string | undefined) => /^tool:([^@]+)@/.exec(ref ?? '')?.[1] ?? null;

/** Who said it: the person, Petals' agent, or their own agent by name. */
export function whoSaid(c: Pick<AnnotationClaim, 'by' | 'via'>): string {
  const via = toolName(c.via);
  if (via === 'petals-agent') return claimWords.petals;
  const by = toolName(c.by);
  if (by) return readableAgent(by);
  if (via) return readableAgent(via);
  return claimWords.you;
}

/** Where it rests, in words: a proposal by its number, or a transaction. */
function restsOn(
  e: NonNullable<AnnotationClaim['evidence']>[number] | undefined,
): string | undefined {
  if (!e) return undefined;
  const proposal = e.proposal?.split(':').at(-1);
  if (proposal) return claimWords.inProposal(proposal);
  if (e.tx) return claimWords.inTx;
  return undefined;
}

/** What's said about `about`, oldest first, as the detail box lists it. */
export function claimLines(rows: readonly AnnotationRow[], about: string | null): ClaimLine[] {
  if (!about) return [];
  return rows
    .filter((r) => r.claim.subject === about && SAID.has(r.claim.verb))
    .map((r, i) => {
      const c = r.claim;
      const value = claimValue(c.object);
      const e = c.evidence?.[0];
      const says =
        c.verb === 'named'
          ? claimWords.named(value)
          : c.verb === 'linked'
            ? claimWords.link
            : value;
      const rests = restsOn(e);
      return {
        key: c.id ?? `${r.added_at}#${i}`,
        says,
        ...(c.verb === 'linked' ? { link: value } : {}),
        kind: c.kind,
        ...(rests ? { rests } : {}),
        ...(e?.url ? { source: e.url } : {}),
        ...(e?.quote ? { quote: e.quote } : {}),
        who: whoSaid(c),
      };
    });
}

/** What the page adds: a note or a name, said by the person (stated), resting on nothing but their word. */
export function noteDraft(about: string, words: string, as: 'note' | 'name') {
  return {
    subject: about,
    verb: as === 'name' ? 'named' : 'noted',
    object: { value: words.trim() },
    kind: 'stated',
    evidence: [],
  };
}

export const claimWords = {
  heading: "What's said about it",
  none: 'Nothing said about it yet. Add a note or a name below.',
  named: (name: string) => `Named ${name}`,
  link: 'A link',
  inProposal: (n: string) => `in proposal #${n}`,
  inTx: 'in a transaction',
  source: 'source',
  you: 'you',
  petals: "Petals' agent",
  by: (who: string) => `by ${who}`,
  add: 'Add a note or a name',
  saveNote: 'Save as a note',
  saveName: 'Save as its name',
  saving: 'Saving…',
  failed: "That wasn't saved. Try again.",
} as const;
