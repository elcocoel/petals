// The thread as a person reads it: pure projection from the chat's state to rows, with every
// decision made and every word chosen. The views under components/chat only lay these out, so a
// redesign replaces them without touching a decision.

import type {
  FlowerResult,
  JobEvent,
  ModelSignature,
  NextSteps as NextOnMap,
  View,
} from '@petal/core/types';
import { aboutLabel, readAbout } from './ask-about.ts';
import { type CeremonyView, ceremonyView, ceremonyWords } from './ceremony.ts';
import { chainLabel, dateLabel, flowerImage, networkLabel } from './flower-view.ts';
import { modeWords } from './mapping.ts';
import { type Block as MarkdownBlock, parseMarkdown } from './markdown.ts';
import { PAYMENT_REQUIRED } from './pay.ts';
import { blocksOf, type ChatState, type Done, type Opened, type Step } from './thread.ts';
import { workspaceUrl } from './workspace-url.ts';

/** What the recorded run (fixtures/transcripts/skeleton.json) was really asked. */
export const RECORDED_QUESTION =
  "Who stands behind NEAR's validators? Make me a fresh flower with their backers, not an existing one.";

/** A line with its small marks: which words are code, which are a link. */
export type Segment =
  | { t: 'text'; v: string }
  | { t: 'code'; v: string }
  | { t: 'a'; v: string; href: string };

const text = (v: string): Segment => ({ t: 'text', v });
const code = (v: string): Segment => ({ t: 'code', v });

/** T168: which model really answered, and whether the answer has an enclave signature. */
export function answeredBy(done: Done, signature: ModelSignature | null): Segment[] {
  if (done.model === 'recorded') return [text('Recorded run: no model answered just now.')];
  if (done.turns === 0) return [text('No model answered.')];
  const report = signature?.attestation?.report_url;
  const enclave: Segment[] =
    signature?.signature_kind === 'provider_tee'
      ? [
          text(`Enclave signature: yes (${signature.signature_kind}, signer `),
          code(signature.signing_address),
          ...(report
            ? [text(', '), { t: 'a', v: 'attestation report', href: report } as const]
            : []),
          text(').'),
        ]
      : signature
        ? [
            text(
              'Enclave signature: no. It has only a gateway signature, which does not prove which model answered.',
            ),
          ]
        : [
            text(
              'Enclave signature: no. NEAR AI gave no signature for this answer, so nothing proves which model wrote it. Only models with enclave attestation get one.',
            ),
          ];
  return [
    text('Answered by '),
    code(done.model),
    text(`${done.fallback_used ? ' (a fallback: the first-choice model did not answer)' : ''}. `),
    ...enclave,
    text(
      ` ${done.turns} model ${done.turns === 1 ? 'call' : 'calls'}, $${done.cost_usd.toFixed(4)}.`,
    ),
  ];
}

/**
 * The one quiet line the model note folds under, after a turn (#78, 11 Nov: every turn ended in four lines
 * of it): how many calls and what they cost, the rest a click away. Null when no model answered.
 */
export function answeredSummary(done: Done): string | null {
  if (done.model === 'recorded' || done.turns === 0) return null;
  return `${done.turns} model ${done.turns === 1 ? 'call' : 'calls'} · $${done.cost_usd.toFixed(4)}`;
}

export type StepRow =
  | { kind: 'stage'; stage: string; message: string }
  | { kind: 'progress'; text: string }
  | { kind: 'tool'; name: string; status: string; args: string };

function stepRow(s: Step): StepRow {
  switch (s.kind) {
    case 'stage':
      return { kind: 'stage', stage: s.stage, message: s.message };
    case 'progress':
      return {
        kind: 'progress',
        text: `${s.message}${s.total ? ` (${s.done ?? 0}/${s.total})` : ''}`,
      };
    case 'tool':
      return {
        kind: 'tool',
        name: s.name,
        status: s.result
          ? `${s.result.ok ? 'ok' : 'failed'}: ${s.result.summary} (${s.result.ms} ms)`
          : '…',
        args: JSON.stringify(s.args, null, 2),
      };
  }
}

/** Where a flower is in the thread, and whether it is the one in the panel. */
export interface FlowerLink {
  key: string;
  /** the network's id in words, until the drawing can name the flower */
  title: string;
  /** a quiet line: how many petals, and the date */
  sub: string;
  open: boolean;
}

export interface FlowerRow extends FlowerLink {
  kind: 'flower';
  /** which of the thread's flowers, from 0 */
  index: number;
  flower: FlowerResult;
  signature: ModelSignature | null;
  /** what the signature line says when there is no signature */
  model?: string;
  /** the answer has no link to this flower, so the card gives it */
  showLink: boolean;
  /** only on the run's latest flower: publishing takes the run's draft */
  publishUrl?: string;
  checks: string;
}

/** A stored flower opened in this thread. */
export interface StoredRow extends FlowerLink {
  kind: 'stored';
  id: string;
  /** its drawing, as an image */
  image: string;
}

export interface TurnRow {
  kind: 'turn';
  key: string;
  stage: ChatState['turn'];
  text: string;
  /** what the agent is doing now, in its own words */
  headline?: string;
  /** a lost turn offers to follow its run again */
  refollow?: { label: string; disabled: boolean };
}

/** A job handed to the person's own agent (C); where it stands is read apart (useJobs). */
export interface JobRowData {
  kind: 'job';
  key: string;
  job: JobEvent;
}

export type Row =
  /** `about` is what the question carried, kept quiet; `label` says who is speaking */
  | { kind: 'user'; key: string; text: string; label: string; about?: string }
  | { kind: 'note' | 'error'; key: string; text: string }
  /**
   * Out of credit for Petals' agent: the way to add some, where the person meets it (B). `first` is the one
   * offered before the first question, to someone with no credit yet (#78).
   */
  | { kind: 'pay'; key: string; first?: true }
  /** A job handed to the person's own agent (C); where it stands is read apart (useJobs). */
  | JobRowData
  | { kind: 'steps'; key: string; summary: string; steps: StepRow[] }
  /**
   * `speaker` is set where the agent starts speaking, and not on what follows it. `foreign` is another
   * agent's words, which don't carry Petals' mark.
   */
  | { kind: 'message'; key: string; blocks: MarkdownBlock[]; speaker?: string; foreign?: boolean }
  /** `summary` is the one quiet line the whole note folds under (#78: the turns read like a log). */
  | { kind: 'done'; key: string; line: Segment[]; summary: string | null }
  | FlowerRow
  | StoredRow
  | TurnRow
  /** A new map waiting for the person's yes, at the end of the last turn (lib/ceremony.ts) */
  | { kind: 'ceremony'; key: string; view: CeremonyView }
  /** What can be done next on the map just read, at the end of the last turn (SYSTEMS's next, OVERLAYS's NextSteps) */
  | { kind: 'next'; key: string; next: NextOnMap };

export type ThreadInput = Pick<ChatState, 'items' | 'busy' | 'runId' | 'turn' | 'lostAgain'> & {
  recorded: boolean;
  open?: Opened;
  /** the person's view, which a stored flower's picture is drawn in */
  view: View;
};

const AGENT = 'Petals';

/** Plain words for the stages that need them. A turn at rest has its own rows, so it shows nothing. */
function turnRow(v: Pick<ThreadInput, 'items' | 'turn' | 'busy' | 'lostAgain'>): TurnRow | null {
  const row = (text: string): TurnRow => ({ kind: 'turn', key: 'turn', stage: v.turn, text });
  switch (v.turn) {
    case 'sending':
      return row('Sending your question…');
    case 'accepted':
      return row('Your question landed. Petals is about to start…');
    case 'working': {
      const latest = v.items.findLast((x) => x.kind === 'stage' || x.kind === 'progress');
      return {
        ...row('Petals is working on it. This can take a while.'),
        ...(latest ? { headline: `${(latest as { message: string }).message}…` } : {}),
      };
    }
    case 'lost':
      return {
        ...row(
          v.lostAgain
            ? 'Followed it again, and the connection ended before the run said it finished. It may have stopped on the server. You can try again, or ask again.'
            : 'The connection ended before this turn finished, so the rest of it isn’t on this page. The run may still be going on the server.',
        ),
        refollow: {
          label: v.busy ? 'Following…' : 'Follow the run again',
          disabled: v.busy,
        },
      };
    default:
      return null;
  }
}

/** Which of the thread's flowers the panel holds, or -1 for none of them. */
export function openFlowerIndex(open: Opened | undefined, count: number): number {
  switch (open?.kind) {
    case 'stored':
    case 'draft':
    case 'shelf':
      return -1;
    case 'turn':
      return open.index < count ? open.index : count - 1;
    default:
      return count - 1;
  }
}

const flowerSub = (spec: FlowerResult['spec'], asOf = spec.snapshot?.as_of) =>
  [
    spec.selection && `${spec.selection.petals} petals`,
    spec.network && chainLabel(spec.network.chain),
    asOf && dateLabel(asOf),
  ]
    .filter(Boolean)
    .join('  ·  ');

export function threadView(v: ThreadInput): Row[] {
  const blocks = blocksOf(v.items);
  const lastFlower = blocks.findLastIndex((b) => b.kind === 'flower');
  const count = blocks.filter((b) => b.kind === 'flower').length;
  const inPanel = openFlowerIndex(v.open, count);
  // one link per flower per turn: a fresh Set at each question
  let seen = new Set<string>();
  // the first question is the one the conversation is about
  let asked = false;
  // the agent's name goes where it starts speaking
  let spoke = false;
  let flowers = 0;
  // the new maps this turn holds for a yes: their card goes after the agent's words, before its note
  let held: { key: string; view: CeremonyView }[] = [];
  let next: { key: string; next: NextOnMap } | null = null;
  const lastAsked = blocks.findLastIndex((x) => x.kind === 'user');
  const rows: Row[] = [];
  blocks.forEach((b, i) => {
    const key = `${i}-${b.kind}`;
    switch (b.kind) {
      case 'user': {
        seen = new Set();
        spoke = false;
        const { about, words } = readAbout(b.text);
        rows.push({
          kind: 'user',
          key,
          text: words,
          label: 'You',
          ...(about ? { about: aboutLabel(about) } : {}),
        });
        asked = true;
        break;
      }
      case 'stored': {
        spoke = false;
        if (b.question) {
          rows.push({
            kind: 'user',
            key: `${key}-question`,
            text: b.question,
            label: 'You',
          });
          asked = true;
        }
        rows.push({
          kind: 'message',
          key: `${key}-summary`,
          blocks: parseMarkdown(b.summary, seen),
          speaker: AGENT,
        });
        rows.push({
          kind: 'stored',
          key,
          id: b.id,
          image: flowerImage(b.id, v.view),
          title: networkLabel(b.network),
          sub: dateLabel(b.asOf),
          open: v.open?.kind === 'stored' && v.open.id === b.id,
        });
        break;
      }
      case 'note':
        rows.push({ kind: 'note', key, text: b.text });
        break;
      case 'steps': {
        const tools = b.steps.filter((s) => s.kind === 'tool').length;
        if (!tools) break;
        rows.push({
          kind: 'steps',
          key,
          summary: `${tools} ${tools === 1 ? 'tool call' : 'tool calls'}`,
          steps: b.steps.map(stepRow),
        });
        break;
      }
      case 'message': {
        // an opening with a stored flower right after it gives way to that flower's own words
        if (i === 0 && blocks[1]?.kind === 'stored') break;
        rows.push({
          kind: 'message',
          key,
          blocks: parseMarkdown(b.text, seen),
          ...(spoke ? {} : { speaker: AGENT }),
        });
        spoke = true;
        break;
      }
      case 'flower': {
        // does this turn's own text link to it?
        const from = blocks.findLastIndex((x, n) => n <= i && x.kind === 'user');
        const next = blocks.findIndex((x, n) => n > i && x.kind === 'user');
        const linked = blocks
          .slice(Math.max(from, 0), next === -1 ? undefined : next)
          .some((x) => x.kind === 'message' && x.text.includes(b.flower.view_url));
        const { valid, warnings } = b.flower.validation;
        const index = flowers++;
        rows.push({
          kind: 'flower',
          key,
          index,
          title: b.flower.spec.network ? networkLabel(b.flower.spec.network.id) : 'Flower',
          sub: flowerSub(b.flower.spec),
          open: index === inPanel,
          flower: b.flower,
          signature: b.signature,
          model: v.recorded ? 'recorded' : b.signature?.model,
          showLink: !linked,
          ...(i === lastFlower && v.runId
            ? { publishUrl: `/publish/${encodeURIComponent(v.runId)}` }
            : {}),
          checks: `Valid: ${String(valid)}${
            warnings.length > 0 ? ` (${warnings.map((w) => w.message).join('; ')})` : ''
          }`,
        });
        break;
      }
      case 'error':
        if (b.code === PAYMENT_REQUIRED) {
          rows.push({ kind: 'pay', key });
          break;
        }
        rows.push({
          kind: 'error',
          key,
          text: `${b.code}: ${b.message}${b.hint ? ` (${b.hint})` : ''}`,
        });
        break;
      case 'job':
        rows.push({ kind: 'job', key, job: b.job });
        break;
      case 'ceremony':
        // only the last turn's, while nothing runs: a question since is the person's answer
        if (i > lastAsked && !v.busy && !v.recorded) held.push({ key, view: ceremonyView(b.held) });
        break;
      case 'next':
        // the last turn's, while nothing runs: what can be done next on the map it read
        if (i > lastAsked && !v.busy && !v.recorded) next = { key, next: b.next };
        break;
      case 'done':
        if (next) rows.push({ kind: 'next', ...next });
        for (const c of held) rows.push({ kind: 'ceremony', ...c });
        held = [];
        next = null;
        rows.push({
          kind: 'done',
          key,
          line: answeredBy(b.done, b.signature),
          summary: answeredSummary(b.done),
        });
        break;
    }
  });
  const turn = turnRow(v);
  if (turn) rows.push(turn);
  return rows;
}

/** What the next question will be about. */
export type ComposerTarget =
  | { kind: 'none' }
  | { kind: 'flower' }
  | { kind: 'wallet' | 'group'; line: string };

export interface ComposerView {
  value: string;
  readOnly: boolean;
  label: string;
  placeholder: string;
  button: string;
  /** the send button only: the box stays open for typing */
  disabled: boolean;
  /** what the question will carry, shown quietly while there is a selection */
  about?: string;
  /** the run's own link, once there is one */
  run?: { id: string; href: string };
  /** the conversation is happening somewhere else, so nothing can be typed here */
  away?: boolean;
  /** which state the person is in: exploring what's there, or creating a new data packet (Elco, 12 Nov) */
  state?: string;
  /** the two states, the one the person is in pressed (lib/mapping.ts) */
  modes?: { now: 'exploring' | 'mapping'; exploring: string; mapping: string };
}

// Drafts (design/minimally-good.md, rule 5: no "Ask" as a label).
const PLACEHOLDER: Record<'flower' | 'wallet' | 'group', string> = {
  flower: 'About this flower…',
  wallet: 'About this wallet…',
  group: 'About everyone else…',
};

export function composerView(
  v: Pick<ChatState, 'question' | 'runId' | 'busy'> & {
    recorded: boolean;
    target?: ComposerTarget;
    /** where it's happening, if not here */
    elsewhere?: string | undefined;
    /** that conversation can't be read, so nothing can be said about where it's happening */
    unavailable?: boolean;
    /** the person said yes to a new map and its read is running (lib/ceremony.ts) */
    creating?: boolean;
    /** exploring or mapping (lib/mapping.ts) */
    mode?: 'exploring' | 'mapping';
  },
): ComposerView {
  if (v.elsewhere) {
    return {
      value: '',
      readOnly: true,
      label: `${v.elsewhere.charAt(0).toUpperCase()}${v.elsewhere.slice(1)}`,
      placeholder: v.unavailable
        ? 'This conversation isn’t available here.'
        : `This conversation is happening in ${v.elsewhere}.`,
      // Elco, 6 Nov: "it will not be 'Ask', it will be the send"
      button: 'Send',
      disabled: true,
      away: true,
    };
  }
  const target = v.target ?? { kind: 'none' };
  const runHref =
    v.runId && workspaceUrl({ runId: v.runId, open: { kind: 'latest' }, petal: null });
  return {
    value: v.recorded ? RECORDED_QUESTION : v.question,
    readOnly: v.recorded,
    label: v.recorded ? 'The saved question' : 'Message Petals',
    placeholder:
      target.kind !== 'none'
        ? PLACEHOLDER[target.kind]
        : v.runId
          ? 'A follow-up…'
          : 'A network, a DAO, a token or an address.',
    button: v.busy ? 'Working…' : v.recorded ? 'Play the recorded run' : 'Send',
    disabled: v.busy || (!v.recorded && !v.question.trim()),
    // the two states, switchable; while a new read runs, it says so under them
    ...(v.recorded
      ? {}
      : {
          modes: {
            now: v.mode ?? 'exploring',
            exploring: modeWords.exploring,
            mapping: modeWords.mapping,
          },
          ...(v.creating ? { state: ceremonyWords.creating } : {}),
        }),
    ...(target.kind === 'wallet' || target.kind === 'group'
      ? { about: aboutLabel(target.line) }
      : {}),
    // while a turn runs, it goes on without the page (#78: no run id under the box at rest)
    ...(v.busy && v.runId && runHref ? { run: { id: v.runId, href: runHref } } : {}),
  };
}
